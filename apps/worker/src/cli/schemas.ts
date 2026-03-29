import { z } from "zod";

// LLM Response Schemas for validation

export const ConditionsSchema = z.object({
  skills: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  experience: z.string().optional().nullable().transform(v => v ?? undefined),
  role: z.string().optional().nullable().transform(v => v ?? undefined),
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

/**
 * Sanitize user input to prevent prompt injection
 * Wraps content in XML tags and escapes special sequences
 */
export function sanitizeForPrompt(input: string, tagName: string = "userInput"): string {
  // Remove any existing XML-like tags that could interfere
  const sanitized = input
    .replace(/<\/?\w+>/g, "") // Remove XML tags
    .replace(/---/g, "") // Remove markdown separators
    .replace(/```/g, ""); // Remove code blocks

  return `<${tagName}>${sanitized}</${tagName}>`;
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
    const jsonMatch = text.match(/\{[\s\S]*\}/);
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