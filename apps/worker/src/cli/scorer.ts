import { Person, EvidenceItem } from "@seeku/db";
import { SiliconFlowProvider } from "@seeku/llm";
import { SearchConditions, DimensionScores, MultiDimensionProfile } from "./types.js";

export class HybridScoringEngine {
  private llm = SiliconFlowProvider.fromEnv();

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
    if (experienceEvidence.length === 0) return 70; // Default medium
    
    // Simple logic: more experience records usually means more data points, 
    // but here we just look at headline for seniority if possible
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
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const summaryContent = `
        Candidate: ${candidate.primaryName}
        Headline: ${candidate.primaryHeadline}
        Evidence Summaries:
        ${evidence.slice(0, 10).map(e => `- [${e.evidenceType}] ${e.title}: ${e.description?.substring(0, 100)}...`).join("\n")}
      `;

      const prompt = `
        Assess the following candidate's project depth and academic impact based on their profile and evidence.
        
        ${summaryContent}
        
        Return ONLY a JSON object:
        {
          "projectDepth": number (0-100),
          "academicImpact": number (0-100),
          "communityReputationBoost": number (0-20),
          "reasoning": "short string"
        }
      `;

      const response = await this.llm.chat([
        { role: "system", content: "You are an expert technical recruiter." },
        { role: "user", content: prompt }
      ]);

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      const data = JSON.parse(jsonMatch ? jsonMatch[0] : response.content);

      return {
        projectDepth: data.projectDepth,
        academicImpact: data.academicImpact,
        communityReputation: data.communityReputationBoost // This will be added later
      };
    } catch (e) {
      console.warn("LLM Scoring failed or timed out, using defaults:", e);
      return {
        projectDepth: 60,
        academicImpact: 40,
        communityReputation: 5
      };
    } finally {
      clearTimeout(timeoutId);
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
      communityReputation: (rules.communityReputation || 0) + (llm.communityReputation || 0)
    };

    // Cap community at 100
    scores.communityReputation = Math.min(100, scores.communityReputation);

    // Weights: Tech(30%), Project(25%), Academic(15%), Stability(10%), Community(10%), Location(10%)
    const weightedScore = 
      (scores.techMatch * 0.30) +
      (scores.projectDepth * 0.25) +
      (scores.academicImpact * 0.15) +
      (scores.careerStability * 0.10) +
      (scores.communityReputation * 0.10) +
      (scores.locationMatch * 0.10);

    return {
      dimensions: scores,
      overallScore: weightedScore,
      highlights: [], // T5 Task
      summary: ""     // T5 Task
    };
  }
}
