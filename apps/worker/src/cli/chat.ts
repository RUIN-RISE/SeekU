import { SiliconFlowProvider } from "@seeku/llm";
import enquirer from "enquirer";
const { Input } = enquirer as unknown as { Input: any };
import { SearchConditions, MissingField } from "./types.js";

const DEFAULT_LIMIT = 10;

export class ChatInterface {
  private llm = SiliconFlowProvider.fromEnv();

  async extractConditions(input: string): Promise<Partial<SearchConditions>> {
    const prompt = `
Extract structured search conditions from user input.

User Input: "${input}"

Return ONLY a valid JSON object with this exact schema:
{
  "skills": string[],     // Technology keywords (e.g., ["RAG", "PyTorch"])
  "locations": string[],  // City names or "remote" (e.g., ["北京", "上海"])
  "experience": string | null,  // e.g., "3-5年", "senior", null if not mentioned
  "role": string | null,        // e.g., "AI Engineer", null if not mentioned
  "limit": number | null        // Default 10 if not specified
}

CRITICAL: Return ONLY the JSON. No markdown, no code blocks, no explanation.
`;

    const response = await this.llm.chat([
      { role: "system", content: "You are a recruitment data extractor." },
      { role: "user", content: prompt }
    ]);

    try {
      // Find JSON block if LLM adds markdown
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse LLM response as JSON:", response.content);
      return { skills: [], locations: [] };
    }
  }

  detectMissing(conditions: Partial<SearchConditions>): MissingField[] {
    const missing: MissingField[] = [];
    if (!conditions.skills || conditions.skills.length === 0) missing.push("skills");
    if (!conditions.locations || conditions.locations.length === 0) missing.push("locations");
    // experience is optional but good to have
    if (!conditions.experience) missing.push("experience");
    return missing;
  }

  async askFollowUp(field: MissingField): Promise<string> {
    const questions: Record<MissingField, string> = {
      skills: "🔍 还想补充哪些核心技能或关键词？(例如: CUDA, vLLM)",
      locations: "📍 地点有要求吗？(例如: 北京, 上海, 远程)",
      experience: "⏱ 对工作年限或职级有要求吗？(按 Enter 跳过)"
    };

    const promptBuffer = new Input({
      message: questions[field],
      initial: ""
    });

    return await promptBuffer.run();
  }

  async refineConditions(initialInput: string): Promise<SearchConditions> {
    let conditions = await this.extractConditions(initialInput);
    
    // Max 2 follow-ups
    const missing = this.detectMissing(conditions);
    const fieldsToAsk = missing.slice(0, 2);

    for (const field of fieldsToAsk) {
      const answer = await this.askFollowUp(field);
      if (answer && answer.trim() && !["不限", "随便", "无", "none"].includes(answer.trim().toLowerCase())) {
        // Update conditions with new info
        const extra = await this.extractConditions(answer);
        conditions = {
          ...conditions,
          skills: [...(conditions.skills || []), ...(extra.skills || [])],
          locations: [...(conditions.locations || []), ...(extra.locations || [])],
          experience: extra.experience || conditions.experience,
          role: extra.role || conditions.role
        };
      }
    }

    return {
      skills: conditions.skills || [],
      locations: conditions.locations || [],
      experience: conditions.experience || undefined,
      role: conditions.role || undefined,
      limit: conditions.limit || DEFAULT_LIMIT
    };
  }
}
