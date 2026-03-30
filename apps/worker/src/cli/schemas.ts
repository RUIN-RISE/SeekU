import { z } from "zod";

// LLM Response Schemas for validation

const CandidateAnchorSchema = z.object({
  shortlistIndex: z.number().int().positive().optional().nullable().transform(v => v ?? undefined),
  personId: z.string().optional().nullable().transform(v => v ?? undefined),
  name: z.string().optional().nullable().transform(v => v ?? undefined)
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
  candidateAnchor: CandidateAnchorSchema.optional().nullable().transform(v => v ?? undefined),
  limit: z.number().int().positive().max(100).nullable().optional()
});

export type ValidatedConditions = z.infer<typeof ConditionsSchema>;

export const LLMScoresSchema = z.object({
  projectDepth: z.number().min(0).max(100).default(60),
  academicImpact: z.number().min(0).max(100).default(40),
  communityReputationBoost: z.number().min(0).max(20).default(5),
  reasoning: z.string().optional()
});

export type ValidatedLLMScores = z.infer<typeof LLMScoresSchema>;

export const ProfileSummarySchema = z.object({
  summary: z.string().min(1).default("Profile summary unavailable."),
  highlights: z.array(z.string()).min(1).max(5).default([
    "Expertise in relevant technologies",
    "Proven project experience",
    "Active professional profile"
  ])
});

export type ValidatedProfileSummary = z.infer<typeof ProfileSummarySchema>;

export function sanitizeForPrompt(input: string, tagName: string = "userInput"): string {
  // Prevent ReDoS by limiting input length
  const boundedInput = input.slice(0, 2000);
  
  // Remove any existing XML-like tags that could interfere
  const sanitized = boundedInput
    .replace(/<[^>]{1,50}>/g, "") // Non-greedy, length-bounded tag removal
    .replace(/---/g, "") // Remove markdown separators
    .replace(/```/g, ""); // Remove code blocks

  return `<${tagName}>${sanitized}</${tagName}>`;
}

/**
 * Check if input is effectively empty (whitespace only or too short)
 */
export function isEmptyInput(input: string | undefined | null): boolean {
  if (!input) return true;
  const trimmed = input.trim();
  return trimmed.length === 0;
}

/**
 * Deduplicate array while preserving order
 */
export function dedupeArray(arr: string[]): string[] {
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
export function safeParseJSON<T>(
  text: string,
  schema: z.ZodSchema<T>,
  fallback: T
): { success: true; data: T } | { success: false; data: T; error: string } {
  try {
    // Extract JSON from potential markdown code blocks
    // P1 Fix: Use a more precise regex that handles one level of nesting to avoid greedy capture across blocks
    // This matches a '{' followed by any characters that are not '{' or '}', OR a nested set of '{}', until the closing '}'
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
