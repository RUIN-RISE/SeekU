import { Person, EvidenceItem } from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { SiliconFlowProvider } from "@seeku/llm";
import { MultiDimensionProfile, SearchConditions } from "./types.js";
import { ProfileSummarySchema, sanitizeForPrompt, safeParseJSON } from "./schemas.js";
import { CLI_CONFIG } from "./config.js";
import { withRetry } from "./retry.js";

export class ProfileGenerator {
  constructor(private llm: LLMProvider) {}

  // Factory method for convenience (backward compatibility)
  static withDefaultProvider(): ProfileGenerator {
    return new ProfileGenerator(SiliconFlowProvider.fromEnv());
  }

  async generate(
    candidate: Person,
    evidence: EvidenceItem[],
    profile: MultiDimensionProfile,
    conditions?: SearchConditions
  ): Promise<MultiDimensionProfile> {
    // Sanitize all external data
    const safeName = sanitizeForPrompt(candidate.primaryName || "Unknown", "name");
    const safeHeadline = sanitizeForPrompt(candidate.primaryHeadline || "No headline", "headline");
    const safeEvidence = evidence.slice(0, 15).map(e =>
      sanitizeForPrompt(e.title || "Untitled", "title")
    ).join("\n- ");
    const searchLens = this.formatSearchLens(conditions);

    const summaryPrompt = `
You are a world-class executive recruiter at Seeku.
Generate a general profile summary and 3 key highlights for this candidate.

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

Current Search Lens:
${searchLens}

Return ONLY a JSON object:
{
  "summary": "1-2 sentences summarizing their stable, general profile.",
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
4. Keep the summary generally true even outside this search
5. Use the search lens only to decide what to foreground, not to explain why they match this query
`;

    try {
      const response = await withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), CLI_CONFIG.llm.timeoutMs);

          try {
            return await this.llm.chat([
              { role: "system", content: "You are a professional talent profiler. You output only valid JSON." },
              { role: "user", content: summaryPrompt }
            ], { signal: controller.signal });
          } finally {
            clearTimeout(timeoutId);
          }
        },
        { maxRetries: CLI_CONFIG.llm.maxRetries }
      );

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
      if (e instanceof Error && e.name === "AbortError") {
        console.warn("Profile generation timed out after", CLI_CONFIG.llm.timeoutMs, "ms");
      } else {
        console.warn("Failed to generate profile details:", e instanceof Error ? e.message : String(e));
      }
      return {
        ...profile,
        summary: "Detailed profile summary could not be generated at this time.",
        highlights: ["Expertise in relevant technologies", "Proven project experience", "Active professional profile"]
      };
    }
  }

  private formatSearchLens(conditions?: SearchConditions): string {
    if (!conditions) {
      return "No explicit search lens provided.";
    }

    const parts = [
      conditions.role ? `Role: ${conditions.role}` : "",
      conditions.skills.length > 0 ? `Skills: ${conditions.skills.join(" / ")}` : "",
      conditions.locations.length > 0 ? `Locations: ${conditions.locations.join(" / ")}` : "",
      conditions.experience ? `Experience: ${conditions.experience}` : "",
      conditions.sourceBias ? `Source Bias: ${conditions.sourceBias}` : "",
      conditions.mustHave.length > 0 ? `Must Have: ${conditions.mustHave.join(" / ")}` : "",
      conditions.niceToHave.length > 0 ? `Nice To Have: ${conditions.niceToHave.join(" / ")}` : "",
      conditions.preferFresh ? "Preference: recent activity" : ""
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(" | ") : "Broad search with no strict constraints.";
  }
}
