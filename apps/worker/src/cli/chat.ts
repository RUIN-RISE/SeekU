import type { LLMProvider } from "@seeku/llm";
import { SiliconFlowProvider } from "@seeku/llm";
import enquirer from "enquirer";
const { Input } = enquirer as unknown as { Input: any };
import { SearchConditions, MissingField } from "./types.js";
import { ConditionsSchema, sanitizeForPrompt, safeParseJSON, type ValidatedConditions } from "./schemas.js";

const DEFAULT_LIMIT = 10;

export class ChatInterface {
  constructor(private llm: LLMProvider) {}

  // Factory method for convenience (backward compatibility)
  static withDefaultProvider(): ChatInterface {
    return new ChatInterface(SiliconFlowProvider.fromEnv());
  }

  async extractConditions(input: string): Promise<Partial<SearchConditions>> {
    // Sanitize user input to prevent prompt injection
    const safeInput = sanitizeForPrompt(input, "userQuery");

    const prompt = `
Extract structured search conditions from the user query below.

${safeInput}

Return ONLY a JSON object with this exact schema:
{
  "skills": string[],     // Technology keywords extracted from query
  "locations": string[],  // Location names mentioned
  "experience": string | null,
  "role": string | null,
  "limit": number | null
}

CRITICAL RULES:
1. Return ONLY the JSON object, no markdown, no explanation
2. If a field is not mentioned, use empty array or null
3. Do NOT include any text outside the JSON object
`;

    try {
      const response = await this.llm.chat([
        { role: "system", content: "You are a precise data extraction engine. You output only valid JSON." },
        { role: "user", content: prompt }
      ]);

      const result = safeParseJSON(
        response.content,
        ConditionsSchema,
        { skills: [], locations: [], limit: DEFAULT_LIMIT }
      );

      if (!result.success) {
        console.warn("LLM condition extraction validation failed:", result.error);
      }

      return {
      skills: result.data.skills,
      locations: result.data.locations,
      experience: result.data.experience ?? undefined,
      role: result.data.role ?? undefined,
      limit: result.data.limit ?? DEFAULT_LIMIT
    };
    } catch (e) {
      console.error("Failed to extract conditions:", e instanceof Error ? e.message : String(e));
      return { skills: [], locations: [], limit: DEFAULT_LIMIT };
    }
  }

  detectMissing(conditions: Partial<SearchConditions>): MissingField[] {
    const missing: MissingField[] = [];
    if (!conditions.skills || conditions.skills.length === 0) missing.push("skills");
    if (!conditions.locations || conditions.locations.length === 0) missing.push("locations");
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

    const missing = this.detectMissing(conditions);
    const fieldsToAsk = missing.slice(0, 2);

    for (const field of fieldsToAsk) {
      const answer = await this.askFollowUp(field);
      if (answer && answer.trim() && !["不限", "随便", "无", "none"].includes(answer.trim().toLowerCase())) {
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