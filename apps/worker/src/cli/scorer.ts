import { Person, EvidenceItem } from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { SiliconFlowProvider } from "@seeku/llm";
import { SearchConditions, DimensionScores, MultiDimensionProfile } from "./types.js";
import { LLMScoresSchema, sanitizeForPrompt, safeParseJSON } from "./schemas.js";

// Scoring weights configuration (extracted for easy tuning)
export const SCORING_WEIGHTS = {
  techMatch: 0.30,
  projectDepth: 0.25,
  academicImpact: 0.15,
  careerStability: 0.10,
  communityReputation: 0.10,
  locationMatch: 0.10
} as const;

// Timeout for LLM calls
const LLM_TIMEOUT_MS = 8000;

export class HybridScoringEngine {
  constructor(private llm: LLMProvider) {}

  // Factory method for convenience (backward compatibility)
  static withDefaultProvider(): HybridScoringEngine {
    return new HybridScoringEngine(SiliconFlowProvider.fromEnv());
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

  async scoreByLLM(candidate: Person, evidence: EvidenceItem[]): Promise<Partial<DimensionScores>> {
    const controller = new AbortController();

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

      // Set timeout and pass signal to LLM
      const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

      const response = await this.llm.chat([
        { role: "system", content: "You are an expert technical recruiter. You output only valid JSON." },
        { role: "user", content: prompt }
      ], { signal: controller.signal }); // Critical: pass signal!

      clearTimeout(timeoutId);

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
      if (e instanceof Error && e.name === "AbortError") {
        console.warn("LLM scoring timed out after", LLM_TIMEOUT_MS, "ms");
      } else {
        console.warn("LLM scoring failed:", e instanceof Error ? e.message : String(e));
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

  aggregate(rules: Partial<DimensionScores>, llm: Partial<DimensionScores>): MultiDimensionProfile {
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

    return {
      dimensions: scores,
      overallScore: weightedScore,
      highlights: [],
      summary: ""
    };
  }
}