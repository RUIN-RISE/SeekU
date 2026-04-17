import { createProvider, type LLMProvider, type ChatMessage as LLMChatMessage } from "@seeku/llm";
import { z } from "zod";

// Re-export SearchConditions type (adapted from CLI)
export interface SearchConditions {
  skills: string[];
  locations: string[];
  experience?: string;
  role?: string;
  sourceBias?: "bonjour" | "github";
  mustHave: string[];
  niceToHave: string[];
  exclude: string[];
  preferFresh: boolean;
  candidateAnchor?: SearchCandidateAnchor;
  limit: number;
}

export interface SearchCandidateAnchor {
  shortlistIndex?: number;
  personId?: string;
  name?: string;
}

export type MissingField = "skills" | "locations" | "experience";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolResult?: SearchResultToolResult;
  conditions?: SearchConditions;
}

export interface SearchResultToolResult {
  results: Array<{
    personId: string;
    name: string;
    headline: string | null;
    disambiguation?: string;
    matchScore: number;
    matchReasons: string[];
  }>;
  total: number;
}

// Constants
const STORAGE_KEY = "seeku_chat_session";
const DEFAULT_LIMIT = 10;
const LLM_TIMEOUT_MS = 30000;

// Zod schema for condition validation (adapted from CLI schemas.ts)
const CandidateAnchorSchema = z.object({
  shortlistIndex: z.number().int().positive().optional().nullable().transform(v => v ?? undefined),
  personId: z.string().optional().nullable().transform(v => v ?? undefined),
  name: z.string().optional().nullable().transform(v => v ?? undefined)
}).nullable().optional().transform((v): SearchCandidateAnchor | undefined => {
  if (!v) return undefined;
  return {
    shortlistIndex: v.shortlistIndex ?? undefined,
    personId: v.personId ?? undefined,
    name: v.name ?? undefined
  };
});

export const ConditionsSchema = z.object({
  skills: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  experience: z.string().optional().nullable().transform(v => v ?? undefined),
  role: z.string().optional().nullable().transform(v => v ?? undefined),
  sourceBias: z.enum(["bonjour", "github"]).optional().nullable().transform(v => v ?? undefined),
  mustHave: z.array(z.string()).default([]),
  niceToHave: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  preferFresh: z.boolean().optional().nullable().transform(v => v ?? false),
  candidateAnchor: CandidateAnchorSchema,
  limit: z.number().int().positive().max(100).nullable().optional()
});

/**
 * Create empty conditions with defaults
 */
export function createEmptyConditions(): SearchConditions {
  return {
    skills: [],
    locations: [],
    experience: undefined,
    role: undefined,
    sourceBias: undefined,
    mustHave: [],
    niceToHave: [],
    exclude: [],
    preferFresh: false,
    candidateAnchor: undefined,
    limit: DEFAULT_LIMIT
  };
}

/**
 * Sanitize input for prompt injection prevention
 */
function sanitizeForPrompt(input: string, tagName: string = "userInput"): string {
  const boundedInput = input.slice(0, 2000);
  const sanitized = boundedInput
    .replace(/<[^>]{1,50}>/g, "")
    .replace(/---/g, "")
    .replace(/```/g, "");
  return `<${tagName}>${sanitized}</${tagName}>`;
}

/**
 * Check if input is effectively empty
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
    const trimmed = item.trim();
    if (trimmed === "") return false;
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/**
 * Safely parse JSON with fallback
 */
function safeParseJSON<T>(
  text: string,
  schema: z.ZodSchema<T>,
  fallback: T
): { success: true; data: T } | { success: false; data: T; error: string } {
  try {
    const jsonMatch = text.match(/\{(?:[^{}]|\{[^{}]*\})*\}/);
    if (!jsonMatch) {
      return { success: false, data: fallback, error: "No JSON object found" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result = schema.safeParse(parsed);

    if (result.success) {
      return { success: true, data: result.data };
    }

    return { success: false, data: fallback, error: result.error.message };
  } catch (e) {
    return { success: false, data: fallback, error: String(e) };
  }
}

/**
 * Normalize candidate anchor - accepts Zod output and ensures proper types
 */
function normalizeCandidateAnchor(
  anchor: { shortlistIndex?: number | null; personId?: string | null; name?: string | null } | null | undefined
): SearchCandidateAnchor | undefined {
  if (!anchor) return undefined;

  const normalized: SearchCandidateAnchor = {
    shortlistIndex: typeof anchor.shortlistIndex === "number" && anchor.shortlistIndex > 0
      ? anchor.shortlistIndex : undefined,
    personId: anchor.personId?.trim() || undefined,
    name: anchor.name?.trim() || undefined
  };

  return normalized.shortlistIndex || normalized.personId || normalized.name
    ? normalized : undefined;
}

// Singleton LLM provider for web
let llmProvider: LLMProvider | null = null;

function getLLMProvider(): LLMProvider {
  if (!llmProvider) {
    llmProvider = createProvider();
  }
  return llmProvider;
}

/**
 * Extract search conditions from natural language input using LLM
 */
export async function extractConditions(input: string): Promise<SearchConditions> {
  if (isEmptyInput(input)) {
    return createEmptyConditions();
  }

  const safeInput = sanitizeForPrompt(input, "userQuery");
  const llm = getLLMProvider();

  const prompt = `
Extract structured search conditions from the user query below.

${safeInput}

Return ONLY a JSON object with this exact schema:
{
  "skills": string[],
  "locations": string[],
  "experience": string | null,
  "role": string | null,
  "sourceBias": "bonjour" | "github" | null,
  "mustHave": string[],
  "niceToHave": string[],
  "exclude": string[],
  "preferFresh": boolean | null,
  "candidateAnchor": {
    "shortlistIndex": number | null,
    "personId": string | null,
    "name": string | null
  } | null,
  "limit": number | null
}

CRITICAL RULES:
1. Return ONLY the JSON object, no markdown, no explanation
2. If a field is not mentioned, use empty array or null
3. Do NOT include any text outside the JSON object
4. For experience: extract years or seniority level
5. For role: extract job title or role description
6. mustHave is for explicit hard constraints like "必须", "一定要"
7. niceToHave is for preferences like "最好", "优先"
8. exclude is for explicit negatives like "不要销售"
9. preferFresh should be true for phrases like "最近活跃", "最新"
10. candidateAnchor is usually null unless user refers to existing candidate
`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
      const response = await llm.chat([
        { role: "system", content: "You are a precise data extraction engine. You output only valid JSON." },
        { role: "user", content: prompt }
      ], { signal: controller.signal });

      const result = safeParseJSON(response.content, ConditionsSchema, createEmptyConditions());

      return {
        skills: result.data.skills ?? [],
        locations: result.data.locations ?? [],
        experience: result.data.experience ?? undefined,
        role: result.data.role ?? undefined,
        sourceBias: result.data.sourceBias ?? undefined,
        mustHave: dedupeArray(result.data.mustHave ?? []),
        niceToHave: dedupeArray(result.data.niceToHave ?? []),
        exclude: dedupeArray(result.data.exclude ?? []),
        preferFresh: Boolean(result.data.preferFresh),
        candidateAnchor: normalizeCandidateAnchor(result.data.candidateAnchor),
        limit: result.data.limit ?? DEFAULT_LIMIT
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    console.warn("LLM condition extraction failed:", e instanceof Error ? e.message : String(e));
    return extractConditionsHeuristically(input);
  }
}

/**
 * Heuristic condition extraction fallback
 */
function extractConditionsHeuristically(input: string): SearchConditions {
  const normalized = input.toLowerCase();
  const skills: string[] = [];
  const locations: string[] = [];

  const knownSkills = ["python", "java", "go", "rust", "typescript", "javascript", "pytorch", "tensorflow", "rag", "llm", "cuda", "vllm", "ai工程师", "后端", "前端"];
  const knownLocations = ["杭州", "上海", "北京", "深圳", "广州", "remote", "远程", "hangzhou", "shanghai", "beijing", "shenzhen", "guangzhou"];

  for (const skill of knownSkills) {
    if (normalized.includes(skill)) {
      skills.push(skill);
    }
  }

  for (const location of knownLocations) {
    if (input.includes(location) || normalized.includes(location)) {
      locations.push(location);
    }
  }

  let experience: string | undefined;
  const experienceMatch = input.match(/(\d+\s*年(?:以上)?)/);
  if (experienceMatch?.[1]) {
    experience = experienceMatch[1];
  } else if (input.includes("资深") || normalized.includes("senior")) {
    experience = "资深";
  }

  let role: string | undefined;
  const roleHints = ["后端", "前端", "python工程师", "工程师", "researcher", "engineer", "backend", "frontend", "ai工程师"];
  role = roleHints.find(item => input.includes(item) || normalized.includes(item));

  let sourceBias: SearchConditions["sourceBias"] | undefined;
  if (normalized.includes("bonjour")) {
    sourceBias = "bonjour";
  } else if (normalized.includes("github")) {
    sourceBias = "github";
  }

  return {
    skills: dedupeArray(skills),
    locations: dedupeArray(locations),
    experience,
    role,
    sourceBias,
    mustHave: [],
    niceToHave: [],
    exclude: [],
    preferFresh: false,
    candidateAnchor: undefined,
    limit: DEFAULT_LIMIT
  };
}

/**
 * Detect missing required fields in conditions
 */
export function detectMissing(conditions: Partial<SearchConditions>): MissingField[] {
  const missing: MissingField[] = [];
  if (!conditions.skills || conditions.skills.length === 0) missing.push("skills");
  if (!conditions.locations || conditions.locations.length === 0) missing.push("locations");
  if (!conditions.experience) missing.push("experience");
  return missing;
}

/**
 * Revise existing conditions based on user instruction
 */
export async function reviseConditions(
  current: SearchConditions,
  instruction: string,
  mode: "tighten" | "relax" | "edit" = "edit"
): Promise<SearchConditions> {
  if (isEmptyInput(instruction)) {
    return current;
  }

  const safeInstruction = sanitizeForPrompt(instruction, "userInstruction");
  const safeCurrent = sanitizeForPrompt(JSON.stringify(current), "currentConditions");
  const llm = getLLMProvider();

  const prompt = `
You are updating a structured recruiting search brief.

Current conditions:
${safeCurrent}

User instruction:
${safeInstruction}

Update mode: ${mode}

Return ONLY a JSON object with this exact schema:
{
  "skills": string[],
  "locations": string[],
  "experience": string | null,
  "role": string | null,
  "sourceBias": "bonjour" | "github" | null,
  "mustHave": string[],
  "niceToHave": string[],
  "exclude": string[],
  "preferFresh": boolean | null,
  "candidateAnchor": {
    "shortlistIndex": number | null,
    "personId": string | null,
    "name": string | null
  } | null,
  "limit": number | null
}

CRITICAL RULES:
1. Always return the full updated condition object, not just changes
2. In "tighten" mode, preserve existing constraints unless user replaces them
3. In "relax" mode, broaden or remove constraints user asks to loosen
4. Deduplicate all arrays
5. Return valid JSON ONLY
`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
      const response = await llm.chat([
        { role: "system", content: "You update recruiting search conditions and output only valid JSON." },
        { role: "user", content: prompt }
      ], { signal: controller.signal });

      const result = safeParseJSON(response.content, ConditionsSchema, current);

      const updated: SearchConditions = {
        skills: dedupeArray(result.data.skills ?? current.skills),
        locations: dedupeArray(result.data.locations ?? current.locations),
        experience: result.data.experience ?? undefined,
        role: result.data.role ?? undefined,
        sourceBias: result.data.sourceBias ?? current.sourceBias,
        mustHave: dedupeArray(result.data.mustHave ?? current.mustHave),
        niceToHave: dedupeArray(result.data.niceToHave ?? current.niceToHave),
        exclude: dedupeArray(result.data.exclude ?? current.exclude),
        preferFresh: result.data.preferFresh ?? current.preferFresh,
        candidateAnchor: normalizeCandidateAnchor(result.data.candidateAnchor) ?? current.candidateAnchor,
        limit: result.data.limit || current.limit || DEFAULT_LIMIT
      };

      return preserveConditionsForRelax(current, updated, instruction, mode);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.warn("LLM revise failed:", error instanceof Error ? error.message : String(error));
    return reviseConditionsHeuristically(current, instruction, mode);
  }
}

/**
 * Heuristic revision fallback
 */
function reviseConditionsHeuristically(
  current: SearchConditions,
  instruction: string,
  mode: "tighten" | "relax" | "edit"
): SearchConditions {
  const normalized = instruction.toLowerCase();
  const next: SearchConditions = {
    ...current,
    skills: [...current.skills],
    locations: [...current.locations],
    mustHave: [...current.mustHave],
    niceToHave: [...current.niceToHave],
    exclude: [...current.exclude]
  };

  const extracted = extractConditionsHeuristically(instruction);

  if (mode === "tighten") {
    next.skills = dedupeArray([...next.skills, ...(extracted.skills || [])]);
    next.locations = dedupeArray([...next.locations, ...(extracted.locations || [])]);
    next.mustHave = dedupeArray([...next.mustHave, ...(extracted.mustHave || [])]);
    next.role = extracted.role || next.role;
    next.experience = extracted.experience || next.experience;
  }

  const asksToRelax = mode === "relax" || /放宽|宽一点|不限|都可以/.test(instruction);
  if (asksToRelax) {
    if (/地点|城市|remote|远程/.test(instruction)) {
      next.locations = [];
    }
    if (/经验|年限/.test(instruction)) {
      next.experience = undefined;
    }
    if (/技术|关键词/.test(normalized)) {
      next.skills = [];
    }
  }

  return next;
}

/**
 * Preserve conditions during relax mode
 */
function preserveConditionsForRelax(
  current: SearchConditions,
  updated: SearchConditions,
  instruction: string,
  mode: "tighten" | "relax" | "edit"
): SearchConditions {
  const normalized = instruction.toLowerCase();
  const broadRelax = /放宽要求|放宽一点|给我几个|先给我几个/.test(normalized);

  if (mode === "relax" || broadRelax) {
    return {
      ...updated,
      locations: updated.locations.length > 0 ? updated.locations : current.locations,
      skills: updated.skills.length > 0 ? updated.skills : current.skills,
      role: updated.role || current.role,
      experience: broadRelax ? updated.experience : (updated.experience || current.experience),
      sourceBias: updated.sourceBias || current.sourceBias,
      mustHave: updated.mustHave.length > 0 ? updated.mustHave : current.mustHave,
      niceToHave: updated.niceToHave.length > 0 ? updated.niceToHave : current.niceToHave,
      exclude: updated.exclude.length > 0 ? updated.exclude : current.exclude,
      preferFresh: updated.preferFresh || current.preferFresh,
      candidateAnchor: updated.candidateAnchor || current.candidateAnchor
    };
  }

  return updated;
}

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * WebChatSession class for managing chat state in React context
 */
export class WebChatSession {
  private _messages: ChatMessage[] = [];
  private _currentConditions: SearchConditions = createEmptyConditions();

  get messages(): ChatMessage[] {
    return this._messages;
  }

  get currentConditions(): SearchConditions {
    return this._currentConditions;
  }

  /**
   * Add a message to the session
   */
  addMessage(message: Omit<ChatMessage, "id">): ChatMessage {
    const fullMessage: ChatMessage = {
      ...message,
      id: generateMessageId()
    };
    this._messages.push(fullMessage);
    return fullMessage;
  }

  /**
   * Set current search conditions
   */
  setCurrentConditions(conditions: SearchConditions): void {
    this._currentConditions = conditions;
  }

  /**
   * Reset session state
   */
  reset(): void {
    this._messages = [];
    this._currentConditions = createEmptyConditions();
    this.clearStorage();
  }

  /**
   * Save session to localStorage
   */
  saveToStorage(): void {
    // Check for localStorage availability (works in browser and vitest mock)
    if (typeof localStorage === "undefined" || !localStorage) return;

    const data = {
      messages: this._messages,
      currentConditions: this._currentConditions
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /**
   * Load session from localStorage
   */
  loadFromStorage(): void {
    // Check for localStorage availability (works in browser and vitest mock)
    if (typeof localStorage === "undefined" || !localStorage) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const data = JSON.parse(stored);
      if (data.messages && Array.isArray(data.messages)) {
        this._messages = data.messages;
      }
      if (data.currentConditions) {
        this._currentConditions = data.currentConditions;
      }
    } catch (e) {
      console.warn("Failed to load chat session from storage:", e);
    }
  }

  /**
   * Clear localStorage
   */
  clearStorage(): void {
    // Check for localStorage availability (works in browser and vitest mock)
    if (typeof localStorage === "undefined" || !localStorage) return;
    localStorage.removeItem(STORAGE_KEY);
  }
}
