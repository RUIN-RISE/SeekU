import { z } from "zod";

const ConfigSchema = z.object({
  llm: z.object({
    timeoutMs: z.coerce.number().int().min(1000).max(120000).default(30000),
    maxRetries: z.coerce.number().int().min(0).max(5).default(2),
    parallelLimit: z.coerce.number().int().min(1).max(10).default(3),
  }),
  scoring: z.object({
    weights: z.object({
      techMatch: z.coerce.number().min(0).max(1).default(0.30),
      projectDepth: z.coerce.number().min(0).max(1).default(0.25),
      academicImpact: z.coerce.number().min(0).max(1).default(0.15),
      careerStability: z.coerce.number().min(0).max(1).default(0.10),
      communityReputation: z.coerce.number().min(0).max(1).default(0.10),
      locationMatch: z.coerce.number().min(0).max(1).default(0.10),
    }).refine((w) => {
      const sum = w.techMatch + w.projectDepth + w.academicImpact + 
                  w.careerStability + w.communityReputation + w.locationMatch;
      // P1: Tighten precision using integer rounding to ensure exact 1.0 sum
      return Math.round(sum * 1000) === 1000; 
    }, {
      message: "Scoring weights must sum to exactly 1.0",
    }),
    experienceBonusCap: z.number().int().min(0).max(100).default(30),
  }),
  cache: z.object({
    ttlDays: z.coerce.number().int().min(1).max(365).default(7),
  }),
  ui: z.object({
    defaultLimit: z.coerce.number().int().min(1).max(100).default(10),
    spinnerEnabled: z.preprocess(
      (v) => (v === "false" ? false : true),
      z.boolean().default(true)
    ),
    inputTimeoutMs: z.coerce.number().int().min(10000).max(600000).default(120000),
  }),
});

// Environment mapping
const rawConfig = {
  llm: {
    timeoutMs: process.env.SEEKU_LLM_TIMEOUT,
    maxRetries: process.env.SEEKU_LLM_RETRIES,
    parallelLimit: process.env.SEEKU_LLM_PARALLEL,
  },
  scoring: {
    // P2: Add || undefined to ensure empty environment strings fallback to Zod defaults
    weights: {
      techMatch: process.env.SEEKU_WEIGHT_TECH || undefined,
      projectDepth: process.env.SEEKU_WEIGHT_PROJECT || undefined,
      academicImpact: process.env.SEEKU_WEIGHT_ACADEMIC || undefined,
      careerStability: process.env.SEEKU_WEIGHT_CAREER || undefined,
      communityReputation: process.env.SEEKU_WEIGHT_COMMUNITY || undefined,
      locationMatch: process.env.SEEKU_WEIGHT_LOCATION || undefined,
    },
    experienceBonusCap: process.env.SEEKU_EXP_BONUS || undefined,
  },
  cache: {
    ttlDays: process.env.SEEKU_CACHE_TTL,
  },
  ui: {
    defaultLimit: process.env.SEEKU_DEFAULT_LIMIT,
    spinnerEnabled: process.env.SEEKU_SPINNER,
    inputTimeoutMs: process.env.SEEKU_INPUT_TIMEOUT,
  },
};

/**
 * Validated configuration for the CLI.
 * Fails fast if environment variables are invalid.
 */
export const CLI_CONFIG = ConfigSchema.parse(rawConfig);

export type CliConfig = z.infer<typeof ConfigSchema>;
