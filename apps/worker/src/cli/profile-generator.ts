import { Person, EvidenceItem } from "@seeku/db";
import { SiliconFlowProvider } from "@seeku/llm";
import { MultiDimensionProfile } from "./types.js";

export class ProfileGenerator {
  private llm = SiliconFlowProvider.fromEnv();

  async generate(candidate: Person, evidence: EvidenceItem[], profile: MultiDimensionProfile): Promise<MultiDimensionProfile> {
    const summaryPrompt = `
      You are a world-class executive recruiter at Seeku. 
      Based on the candidate's profile and evidence, generate a high-impact summary and 3 key highlights.
      
      Candidate: ${candidate.primaryName} (${candidate.primaryHeadline})
      
      Dimension Scores:
      - Tech Match: ${profile.dimensions.techMatch}/100
      - Project Depth: ${profile.dimensions.projectDepth}/100
      - Academic Impact: ${profile.dimensions.academicImpact}/100
      - Career Stability: ${profile.dimensions.careerStability}/100
      - Community: ${profile.dimensions.communityReputation}/100
      
      Evidence:
      ${evidence.slice(0, 15).map(e => `- [${e.evidenceType}] ${e.title}`).join("\n")}
      
      Return ONLY a JSON object:
      {
        "summary": "1-2 sentences professionally summarizing their unique value proposition.",
        "highlights": [
          "Highlight 1: Brief, impactful (e.g., 'Lead RAG researcher at XYZ')",
          "Highlight 2",
          "Highlight 3"
        ]
      }
      
      Rules:
      - Be objective but persuasive.
      - Focus on specific achievements from evidence.
      - Return ONLY the JSON.
    `;

    try {
      const response = await this.llm.chat([
        { role: "system", content: "You are a professional talent profiler." },
        { role: "user", content: summaryPrompt }
      ]);

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      const data = JSON.parse(jsonMatch ? jsonMatch[0] : response.content);

      return {
        ...profile,
        summary: data.summary || "No summary available.",
        highlights: data.highlights || []
      };
    } catch (e) {
      console.warn("Failed to generate profile details, using defaults:", e);
      return {
        ...profile,
        summary: "Detailed profile summary could not be generated at this time.",
        highlights: ["Expertise in relevant technologies", "Proven project experience", "Active professional profile"]
      };
    }
  }
}
