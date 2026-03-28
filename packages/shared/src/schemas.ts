import { z } from "zod";

export const SourceNameSchema = z.enum(["bonjour", "github"]);
export const AliasTypeSchema = z.enum(["github", "x", "jike", "website", "other"]);
export const OptOutRequestStatusSchema = z.enum(["pending", "processed", "rejected"]);

export const AliasSchema = z.object({
  type: AliasTypeSchema,
  value: z.string().min(1),
  confidence: z.number().min(0).max(1)
});

export const NormalizedProfileSchema = z.object({
  source: SourceNameSchema,
  sourceProfileId: z.string().min(1).optional(),
  sourceHandle: z.string().min(1),
  canonicalUrl: z.string().min(1),
  displayName: z.string().min(1).optional(),
  headline: z.string().min(1).optional(),
  bio: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  avatarUrl: z.string().min(1).optional(),
  locationText: z.string().min(1).optional(),
  aliases: z.array(AliasSchema),
  rawMetadata: z.record(z.string(), z.unknown())
});

export const SyncRunConfigSchema = z.object({
  source: SourceNameSchema,
  jobName: z.string().min(1),
  limit: z.number().int().positive().optional(),
  cursor: z.record(z.string(), z.unknown()).optional()
});

export const SyncRunErrorSchema = z.object({
  message: z.string().min(1),
  context: z.unknown().optional()
});

export const SyncRunResultSchema = z.object({
  status: z.enum(["succeeded", "failed", "partial"]),
  profilesProcessed: z.number().int().nonnegative(),
  errors: z.array(SyncRunErrorSchema),
  nextCursor: z.record(z.string(), z.unknown()).optional()
});

export const OptOutRequestInputSchema = z
  .object({
    source: SourceNameSchema.optional(),
    sourceHandle: z.string().min(1).optional(),
    profileUrl: z.string().url().optional(),
    requesterContact: z.string().min(1),
    reason: z.string().min(1).optional(),
    processNow: z.boolean().optional()
  })
  .refine((value) => Boolean(value.sourceHandle || value.profileUrl), {
    message: "sourceHandle or profileUrl is required",
    path: ["sourceHandle"]
  });

export const OptOutRequestProcessResultSchema = z.object({
  requestId: z.string().min(1),
  hiddenProfileCount: z.number().int().nonnegative()
});
