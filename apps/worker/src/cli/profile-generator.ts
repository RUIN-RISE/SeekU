import { Person, EvidenceItem } from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { SiliconFlowProvider } from "@seeku/llm";
import { MultiDimensionProfile } from "./types.js";
import { ProfileSummarySchema, sanitizeForPrompt, safeParseJSON } from "./schemas.js";

export class ProfileGenerator {
  constructor(private llm: LLMProvider) {}

  // Factory method for convenience (backward compatibility)
  static withDefaultProvider(): ProfileGenerator {
    return new ProfileGenerator(SiliconFlowProvider.fromEnv());
  }

  async generate(candidate: Person, evidence: EvidenceItem[], profile: MultiDimensionProfile): Promise<MultiDimensionProfile> {
    // Sanitize all external data
    const safeName = sanitizeForPrompt(candidate.primaryName || "Unknown", "name");
    const safeHeadline = sanitizeForPrompt(candidate.primaryHeadline || "No headline", "headline");
    const safeEvidence = evidence.slice(0, 15).map(e =>
      sanitizeForPrompt(e.title || "Untitled", "title")
    ).join("\n- ");

    const summaryPrompt = `
You are a world-class executive recruiter at Seeku.
Generate a professional summary and 3 key highlights for this candidate.

${safeName}
${safeHeadline}

Dimension Scores:
- Tech Match: ${profile.dimensions.techMatch}/100
- Project Depth: ${profile.dimensions.projectDepth}/100
- Academic Impact: ${profile.dimensions.academicImpact}/100
- Career Stability: ${profile.dimensions.careerStability}/100
- Community: ${profile.dimensions.communityReputation}/100

Key Evidence:
- ${safeEvidence}

Return ONLY a JSON object:
{
  "summary": "1-2 sentences professionally summarizing their unique value proposition.",
  "highlights": [
    "Highlight 1: Brief, impactful achievement",
    "Highlight 2",
    "Highlight 3"
  ]
}

CRITICAL RULES:
1. Return ONLY the JSON, no markdown, no explanation
2. Be objective but persuasive
3. Focus on specific achievements from evidence
`;

    try {
      const response = await this.llm.chat([
        { role: "system", content: "You are a professional talent profiler. You output only valid JSON." },
        { role: "user", content: summaryPrompt }
      ]);

      const result = safeParseJSON(
        response.content,
        ProfileSummarySchema,
        {
          summary: "Detailed profile summary could not be generated at this time.",
          highlights: ["Expertise in relevant technologies", "Proven project experience", "Active professional profile"]
        }
      );

      return {
        ...profile,
        summary: result.data.summary ?? "Detailed profile summary could not be generated at this time.",
        highlights: result.data.highlights ?? ["Expertise in relevant technologies", "Proven project experience", "Active professional profile"]
      };
    } catch (e) {
      console.warn("Failed to generate profile details:", e instanceof Error ? e.message : String(e));
      return {
        ...profile,
        summary: "Detailed profile summary could not be generated at this time.",
        highlights: ["Expertise in relevant technologies", "Proven project experience", "Active professional profile"]
      };
    }
  }
}