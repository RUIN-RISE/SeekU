import { Person, EvidenceItem } from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { createProvider } from "@seeku/llm";
import {
  SearchConditions,
  DimensionScores,
  MultiDimensionProfile,
  ScoredCandidate,
  SortMode
} from "./types.js";
import { LLMScoresSchema, sanitizeForPrompt, safeParseJSON } from "./schemas.js";
import { CLI_CONFIG } from "./config.js";
import { withRetry } from "./retry.js";

// Scoring weights configuration (centralized in config.ts)
const SCORING_WEIGHTS = CLI_CONFIG.scoring.weights;

// Timeout for LLM calls (centralized in config.ts)
const LLM_TIMEOUT_MS = CLI_CONFIG.llm.timeoutMs;

interface LLMExecutionOptions {
  quiet?: boolean;
  maxRetries?: number;
}

type RerankOnlySortMode = Extract<SortMode, "fresh" | "source" | "evidence">;
type CandidateRerankSignals = Pick<
  ScoredCandidate,
  "matchScore" | "sources" | "bonjourUrl" | "lastSyncedAt" | "latestEvidenceAt"
>;

const EVIDENCE_TYPE_WEIGHTS: Record<EvidenceItem["evidenceType"], number> = {
  project: 24,
  repository: 22,
  experience: 16,
  job_signal: 14,
  community_post: 12,
  education: 10,
  social: 8,
  profile_field: 5,
  summary: 5
};

export class HybridScoringEngine {
  constructor(private llm: LLMProvider) {}

  // Factory method for convenience (backward compatibility)
  static withDefaultProvider(): HybridScoringEngine {
    return new HybridScoringEngine(createProvider());
  }

  // --- Rule Based Scores (60% Weighting) ---

  scoreByRules(candidate: Person, evidence: EvidenceItem[], conditions: SearchConditions): Partial<DimensionScores> {
    return {
      locationMatch: this.calculateLocationMatch(candidate, conditions),
      techMatch: this.calculateTechMatch(candidate, evidence, conditions),
      careerStability: this.calculateCareerStability(candidate, evidence),
      communityReputation: this.calculateCommunityRules(candidate, evidence)
    };
  }

  /**
   * Calculate experience/seniority match (ISSUE-002 fix)
   * Returns a bonus score if candidate matches requested experience level
   */
  calculateExperienceMatch(candidate: Person, evidence: EvidenceItem[], conditions: SearchConditions): number {
    if (!conditions.experience && !conditions.role) return 0; // No preference = no bonus

    const headline = candidate.primaryHeadline?.toLowerCase() || "";
    const summary = candidate.summary?.toLowerCase() || "";
    const context = headline + " " + summary;

    let bonus = 0;

    // Match experience years (e.g., "5年", "3-5年", "5年以上")
    if (conditions.experience) {
      const exp = conditions.experience.toLowerCase();

      // Senior/seniority keywords
      if (exp.includes("senior") || exp.includes("高级") || exp.includes("资深") || exp.includes("lead") || exp.includes("专家")) {
        if (context.includes("senior") || context.includes("高级") || context.includes("资深") ||
            context.includes("lead") || context.includes("principal") || context.includes("专家")) {
          bonus += 15;
        }
      }

      // Junior keywords
      if (exp.includes("junior") || exp.includes("初级") || exp.includes("实习")) {
        if (context.includes("junior") || context.includes("初级") || context.includes("intern")) {
          bonus += 15;
        }
      }

      // Year-based matching (Improved heuristic)
      // TODO: Extract actual dates from evidence and calculate real seniority.
      // Current heuristic: combines keyword matching with evidence count/type.
      const yearMatch = exp.match(/(\d+)/);
      if (yearMatch) {
         const requestedValue = parseInt(yearMatch[1]);
         const requestedYears = isNaN(requestedValue) ? 0 : requestedValue;
         
         const relevantEvidence = evidence.filter(e => 
           e.evidenceType === "experience" || 
           e.evidenceType === "project" || 
           e.evidenceType === "education"
         );
         
         // Heuristic: Roughly 0.7 pieces of evidence per year of experience
         if (requestedYears > 0 && relevantEvidence.length >= requestedYears * 0.7) {
           bonus += 10;
         }
      }
    }

    // Match role (e.g., "AI工程师", "后端开发")
    if (conditions.role) {
      const roleLower = conditions.role.toLowerCase();
      // Match whole words to prevent "AI" matching "FAIL"
      // Added support for more delimiters like backslashes, slashes, CJK dashes, and underscores
      const contextWords = context.split(/[\s,.'"\-_—\\/|]+/);
      const headlineWords = headline.split(/[\s,.'"\-_—\\/|]+/);
      
      if (contextWords.some(w => w.toLowerCase() === roleLower) || 
          headlineWords.some(w => w.toLowerCase() === roleLower)) {
        bonus += 15;
      }
    }

    return Math.min(30, bonus); // Cap at 30 points bonus
  }

  private calculateLocationMatch(candidate: Person, conditions: SearchConditions): number {
    if (!conditions.locations || conditions.locations.length === 0) return 100;
    const candidateLoc = candidate.primaryLocation?.toLowerCase() || "";
    const isMatch = conditions.locations.some(loc =>
      candidateLoc.includes(loc.toLowerCase()) || loc.toLowerCase().includes(candidateLoc)
    );
    return isMatch ? 100 : 20;
  }

  private calculateTechMatch(candidate: Person, evidence: EvidenceItem[], conditions: SearchConditions): number {
    if (!conditions.skills || conditions.skills.length === 0) return 80;

    const context = (candidate.primaryHeadline || "") + " " + evidence.map(e => e.title + " " + (e.description || "")).join(" ");
    const matches = conditions.skills.filter(skill => context.toLowerCase().includes(skill.toLowerCase()));

    const ratio = matches.length / conditions.skills.length;
    return Math.min(100, 40 + (ratio * 60));
  }

  private calculateCareerStability(candidate: Person, evidence: EvidenceItem[]): number {
    const experienceEvidence = evidence.filter(e => e.evidenceType === "experience");
    if (experienceEvidence.length === 0) return 70;

    const headline = candidate.primaryHeadline?.toLowerCase() || "";
    if (headline.includes("senior") || headline.includes("lead") || headline.includes("expert")) return 90;
    if (headline.includes("junior") || headline.includes("intern")) return 50;

    return 80;
  }

  private calculateCommunityRules(candidate: Person, evidence: EvidenceItem[]): number {
    const socialEvidence = evidence.filter(e => e.evidenceType === "social" || e.evidenceType === "repository");
    return Math.min(100, 30 + (socialEvidence.length * 10));
  }

  // --- LLM Based Scores (40% Weighting) ---

  async scoreByLLM(
    candidate: Person,
    evidence: EvidenceItem[],
    options: LLMExecutionOptions = {}
  ): Promise<Partial<DimensionScores>> {
    try {
      // Sanitize external data to prevent prompt injection
      const safeName = sanitizeForPrompt(candidate.primaryName || "Unknown", "name");
      const safeHeadline = sanitizeForPrompt(candidate.primaryHeadline || "No headline", "headline");
      const safeEvidence = evidence.slice(0, 10).map(e =>
        `- [${e.evidenceType}] ${sanitizeForPrompt(e.title || "Untitled", "title")}`
      ).join("\n");

      const prompt = `
Assess the following candidate's project depth and academic impact.

${safeName}
${safeHeadline}

Evidence Summaries:
${safeEvidence}

Return ONLY a JSON object:
{
  "projectDepth": number (0-100),
  "academicImpact": number (0-100),
  "communityReputationBoost": number (0-20),
  "reasoning": "brief explanation"
}

CRITICAL: Return ONLY the JSON, no markdown, no explanation.
`;

      const response = await withRetry(
        async () => {
          // ISSUE-V3: P2 Create fresh AbortController and timeout for EACH retry attempt
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
          
          try {
            return await this.llm.chat([
              { role: "system", content: "You are an expert technical recruiter. You output only valid JSON." },
              { role: "user", content: prompt }
            ], { signal: controller.signal });
          } finally {
            clearTimeout(timeoutId);
          }
        },
        {
          maxRetries: options.maxRetries ?? CLI_CONFIG.llm.maxRetries,
          quiet: options.quiet
        }
      );

      const result = safeParseJSON(
        response.content,
        LLMScoresSchema,
        { projectDepth: 60, academicImpact: 40, communityReputationBoost: 5 }
      );

      if (!result.success) {
        console.warn("LLM score validation failed:", result.error);
      }

      return {
        projectDepth: result.data.projectDepth,
        academicImpact: result.data.academicImpact,
        communityReputation: result.data.communityReputationBoost
      };
    } catch (e) {
      // Check if it was aborted
      if (!options.quiet) {
        if (e instanceof Error && e.name === "AbortError") {
          console.warn("LLM scoring timed out after", LLM_TIMEOUT_MS, "ms");
        } else {
          console.warn("LLM scoring failed:", e instanceof Error ? e.message : String(e));
        }
      }

      // Fallback with dynamic defaults based on evidence count
      const repoCount = evidence.filter(e => e.evidenceType === "repository").length;
      const dynamicProject = Math.min(80, 40 + repoCount * 5);

      return {
        projectDepth: dynamicProject,
        academicImpact: 40,
        communityReputation: 5
      };
    }
  }

  // --- Aggregation ---

  aggregate(rules: Partial<DimensionScores>, llm: Partial<DimensionScores>, experienceBonus: number = 0): MultiDimensionProfile {
    const scores: DimensionScores = {
      techMatch: rules.techMatch || 0,
      locationMatch: rules.locationMatch || 0,
      careerStability: rules.careerStability || 0,
      projectDepth: llm.projectDepth || 0,
      academicImpact: llm.academicImpact || 0,
      communityReputation: Math.min(100, (rules.communityReputation || 0) + (llm.communityReputation || 0))
    };

    // Use configured weights
    const weightedScore =
      (scores.techMatch * SCORING_WEIGHTS.techMatch) +
      (scores.projectDepth * SCORING_WEIGHTS.projectDepth) +
      (scores.academicImpact * SCORING_WEIGHTS.academicImpact) +
      (scores.careerStability * SCORING_WEIGHTS.careerStability) +
      (scores.communityReputation * SCORING_WEIGHTS.communityReputation) +
      (scores.locationMatch * SCORING_WEIGHTS.locationMatch);

    // ISSUE-002: Add experience/role match bonus
    const finalScore = Math.min(100, weightedScore + experienceBonus);

    return {
      dimensions: scores,
      overallScore: finalScore,
      highlights: [],
      summary: ""
    };
  }

  scoreRerankCandidate(
    sortMode: RerankOnlySortMode,
    candidate: CandidateRerankSignals,
    evidence: EvidenceItem[] = []
  ): number {
    const normalizedMatch = this.normalizeMatchScore(candidate.matchScore);
    const freshnessScore = this.scoreFreshness(candidate);
    const sourceScore = this.scoreSourcePriority(candidate);
    const evidenceScore = this.scoreEvidenceStrength(evidence);

    if (sortMode === "fresh") {
      return freshnessScore * 0.75 + evidenceScore * 0.15 + normalizedMatch * 0.1;
    }

    if (sortMode === "source") {
      return sourceScore * 0.7 + freshnessScore * 0.15 + evidenceScore * 0.1 + normalizedMatch * 0.05;
    }

    return evidenceScore * 0.72 + freshnessScore * 0.16 + sourceScore * 0.07 + normalizedMatch * 0.05;
  }

  scoreFreshness(candidate: Pick<CandidateRerankSignals, "latestEvidenceAt" | "lastSyncedAt">): number {
    const referenceDate = candidate.latestEvidenceAt ?? candidate.lastSyncedAt;
    if (!referenceDate) {
      return 0;
    }

    const ageInDays = this.getAgeInDays(referenceDate);
    let score = 0;

    if (ageInDays <= 7) {
      score = 100;
    } else if (ageInDays <= 30) {
      score = 86;
    } else if (ageInDays <= 90) {
      score = 68;
    } else if (ageInDays <= 180) {
      score = 46;
    } else if (ageInDays <= 365) {
      score = 24;
    } else {
      score = 8;
    }

    if (candidate.latestEvidenceAt) {
      score += 6;
    }

    return Math.min(100, score);
  }

  scoreSourcePriority(candidate: Pick<CandidateRerankSignals, "sources" | "bonjourUrl">): number {
    if (!candidate.sources || candidate.sources.length === 0 || candidate.sources[0] === "Unknown") {
      return candidate.bonjourUrl ? 30 : 10;
    }

    let score = 30;

    // Favor candidates with multi-source coverage rather than specific platforms
    if (candidate.sources.length > 1) {
      score += 15;
    }

    if (candidate.sources.includes("GitHub")) {
      score += 20;
    }

    if (candidate.sources.includes("Bonjour")) {
      score += 15;
    }

    if (candidate.bonjourUrl) {
      score += 10;
    }

    return Math.min(100, score);
  }

  scoreEvidenceStrength(evidence: EvidenceItem[]): number {
    if (evidence.length === 0) {
      return 0;
    }

    const rankedEvidence = [...evidence]
      .sort((left, right) => {
        const delta =
          (EVIDENCE_TYPE_WEIGHTS[right.evidenceType] ?? 4) -
          (EVIDENCE_TYPE_WEIGHTS[left.evidenceType] ?? 4);

        if (delta !== 0) {
          return delta;
        }

        return (right.occurredAt?.getTime() ?? 0) - (left.occurredAt?.getTime() ?? 0);
      })
      .slice(0, 8);

    let score = 0;
    const uniqueTypes = new Set<string>();
    const uniqueSources = new Set<string>();

    for (const item of rankedEvidence) {
      uniqueTypes.add(item.evidenceType);
      if (item.source) {
        uniqueSources.add(item.source);
      }

      const typeWeight = EVIDENCE_TYPE_WEIGHTS[item.evidenceType] ?? 4;
      const recencyMultiplier = this.getEvidenceRecencyMultiplier(item.occurredAt);
      const contentBonus = item.title?.trim() || item.description?.trim() ? 2 : 0;
      score += typeWeight * recencyMultiplier + contentBonus;
    }

    score += Math.min(12, uniqueTypes.size * 3);
    score += Math.min(6, uniqueSources.size * 2);
    score += Math.min(8, evidence.length);

    return Math.min(100, Math.round(score));
  }

  normalizeMatchScore(matchScore: number): number {
    if (!Number.isFinite(matchScore)) {
      return 0;
    }

    const normalized = matchScore <= 1.5 ? matchScore * 100 : matchScore;
    return Math.max(0, Math.min(100, normalized));
  }

  private getAgeInDays(date: Date): number {
    return Math.max(
      0,
      Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
    );
  }

  private getEvidenceRecencyMultiplier(date?: Date | null): number {
    if (!date) {
      return 0.55;
    }

    const ageInDays = this.getAgeInDays(date);
    if (ageInDays <= 30) {
      return 1;
    }
    if (ageInDays <= 90) {
      return 0.85;
    }
    if (ageInDays <= 365) {
      return 0.65;
    }
    return 0.45;
  }
}
