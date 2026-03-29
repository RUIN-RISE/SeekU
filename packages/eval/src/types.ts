import { z } from "zod";

export interface EvalQuery {
  id: string;
  text: string;
  category?: string;
  expectedRoles?: string[];
  expectedSkills?: string[];
}

export const EvalQuerySchema = z.object({
  id: z.string(),
  text: z.string(),
  category: z.string().optional(),
  expectedRoles: z.array(z.string()).optional(),
  expectedSkills: z.array(z.string()).optional()
});

export interface GoldenSetEntry {
  queryId: string;
  personId: string;
  relevance: "high" | "medium" | "low";
  notes?: string;
}

export const GoldenSetEntrySchema = z.object({
  queryId: z.string(),
  personId: z.string(),
  relevance: z.enum(["high", "medium", "low"]),
  notes: z.string().optional()
});

export interface EvalResult {
  queryId: string;
  precisionAt5: number;
  precisionAt10: number;
  precisionAt20: number;
  coverage: boolean;
  expectedInTopK: number;
}

export interface BenchmarkSummary {
  totalQueries: number;
  avgPrecisionAt5: number;
  avgPrecisionAt10: number;
  avgPrecisionAt20: number;
  coverageRate: number;
  results: EvalResult[];
}