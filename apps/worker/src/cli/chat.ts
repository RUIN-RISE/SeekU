import type { LLMProvider } from "@seeku/llm";
import { SiliconFlowProvider } from "@seeku/llm";
import enquirer from "enquirer";
const { Input } = enquirer as unknown as { Input: any };
import { SearchConditions, MissingField } from "./types.js";
import { ConditionsSchema, sanitizeForPrompt, safeParseJSON } from "./schemas.js";

const DEFAULT_LIMIT = 10;

// Skip keywords that indicate user wants to skip the question
const SKIP_KEYWORDS = new Set(["不限", "随便", "无", "none", "skip", "跳过", "都可以", "都行"]);

/**
 * Check if input is effectively empty (whitespace only or too short)
 */
function isEmptyInput(input: string | undefined | null): boolean {
  if (!input) return true;
  const trimmed = input.trim();
  return trimmed.length === 0;
}

/**
 * Deduplicate array while preserving order
 */
function dedupeArray(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter(item => {
    const normalized = item.toLowerCase().trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export class ChatInterface {
  constructor(private llm: LLMProvider) {}

  // Factory method for convenience (backward compatibility)
  static withDefaultProvider(): ChatInterface {
    return new ChatInterface(SiliconFlowProvider.fromEnv());
  }

  async extractConditions(input: string): Promise<Partial<SearchConditions>> {
    // ISSUE-001: Block empty input early
    if (isEmptyInput(input)) {
      return { skills: [], locations: [], limit: DEFAULT_LIMIT };
    }

    // Sanitize user input to prevent prompt injection
    const safeInput = sanitizeForPrompt(input, "userQuery");

    const prompt = `
Extract structured search conditions from the user query below.

${safeInput}

Return ONLY a JSON object with this exact schema:
{
  "skills": string[],     // Technology keywords extracted from query
  "locations": string[],  // Location names mentioned
  "experience": string | null,  // e.g., "5年", "senior", "3-5年"
  "role": string | null,        // e.g., "AI工程师", "后端开发"
  "limit": number | null
}

CRITICAL RULES:
1. Return ONLY the JSON object, no markdown, no explanation
2. If a field is not mentioned, use empty array or null
3. Do NOT include any text outside the JSON object
4. For experience: extract years (e.g., "5年以上", "3-5年") or seniority level (e.g., "senior", "高级")
5. For role: extract job title or role description
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

  /**
   * Check if the answer indicates user wants to skip
   */
  private shouldSkipAnswer(answer: string): boolean {
    if (isEmptyInput(answer)) return true;
    const normalized = answer.trim().toLowerCase();
    return SKIP_KEYWORDS.has(normalized);
  }

  async refineConditions(initialInput: string): Promise<SearchConditions> {
    // ISSUE-001: Block empty initial input
    if (isEmptyInput(initialInput)) {
      console.warn("⚠️ 请输入有效的搜索条件");
      // Return default empty conditions - will trigger "No candidates" gracefully
      return {
        skills: [],
        locations: [],
        experience: undefined,
        role: undefined,
        limit: DEFAULT_LIMIT
      };
    }

    let conditions = await this.extractConditions(initialInput);

    const missing = this.detectMissing(conditions);
    const fieldsToAsk = missing.slice(0, 2);

    for (const field of fieldsToAsk) {
      const answer = await this.askFollowUp(field);

      // ISSUE-001: Skip empty answers
      if (this.shouldSkipAnswer(answer)) {
        continue;
      }

      const extra = await this.extractConditions(answer);

      // ISSUE-003: Deduplicate arrays when merging
      conditions = {
        ...conditions,
        skills: dedupeArray([...(conditions.skills || []), ...(extra.skills || [])]),
        locations: dedupeArray([...(conditions.locations || []), ...(extra.locations || [])]),
        experience: extra.experience || conditions.experience,
        role: extra.role || conditions.role
      };
    }

    return {
      skills: dedupeArray(conditions.skills || []),
      locations: dedupeArray(conditions.locations || []),
      experience: conditions.experience || undefined,
      role: conditions.role || undefined,
      limit: conditions.limit || DEFAULT_LIMIT
    };
  }
}