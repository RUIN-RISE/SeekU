/**
 * Cross-encoder Reranker — uses LLM to score query-document pairs directly.
 *
 * Unlike bi-encoder (embedding-based) matching, cross-encoder passes both
 * query and candidate text together to the model, enabling deeper semantic
 * comparison. This produces more accurate relevance scores at higher cost.
 *
 * Used as an optional second-pass scoring layer after heuristic reranking.
 *
 * @module search/cross-encoder
 */

import { z } from "zod";
import type { ChatMessage, LLMProvider } from "@seeku/llm";
import type { EvidenceItem, SearchDocument } from "@seeku/db";
import type { QueryIntent } from "./planner.js";

export interface CrossEncoderConfig {
  provider: LLMProvider;
  model?: string;
  /** Batch size for parallel scoring (default: 5) */
  batchSize?: number;
  /** Timeout per candidate in ms (default: 5000) */
  timeoutMs?: number;
}

export interface CrossEncoderScore {
  personId: string;
  relevanceScore: number; // 0-1
  reasoning: string;
}

export interface CandidateSummary {
  personId: string;
  name: string;
  headline: string | null;
  skills: string[];
  roles: string[];
  projects: Array<{ title: string | null; description: string | null }>;
  repositories: Array<{ name: string | null; language: string | null; stars: number }>;
}

const SCORING_PROMPT = `You are a talent matching evaluator for Seeku, an AI talent search engine.

Given a search intent and a candidate profile, evaluate how well the candidate matches the intent.

Return ONLY a valid JSON object with exactly these fields:
{
  "score": number (0.0 to 1.0, where 0 = no match, 1 = perfect match),
  "reasoning": string (brief explanation of the score, max 100 chars)
}

Scoring guidelines:
- 0.0-0.3: Candidate lacks most required skills/roles
- 0.4-0.6: Candidate has some relevant skills but missing key requirements
- 0.7-0.9: Candidate matches most skills/roles with good evidence
- 1.0: Perfect match — all must-haves present with strong evidence

Focus on:
- Role alignment (titles, functions)
- Skill coverage (technologies, domains)
- Evidence quality (projects, repos with relevant work)
- Location match if specified

Output must be valid JSON. Do not include any text before or after the JSON object.`;

const ScoreSchema = z.object({
  score: z.number().min(0).max(1).default(0),
  reasoning: z.string().max(100).default("")
});

function buildCandidateText(summary: CandidateSummary): string {
  const parts: string[] = [];

  parts.push(`Name: ${summary.name}`);
  if (summary.headline) {
    parts.push(`Headline: ${summary.headline}`);
  }

  if (summary.roles.length > 0) {
    parts.push(`Roles: ${summary.roles.join(", ")}`);
  }

  if (summary.skills.length > 0) {
    parts.push(`Skills: ${summary.skills.join(", ")}`);
  }

  if (summary.projects.length > 0) {
    const projectTexts = summary.projects
      .slice(0, 3)
      .map((p) => `${p.title ?? "Untitled"}: ${p.description ?? "No description"}`);
    parts.push(`Projects: ${projectTexts.join("; ")}`);
  }

  if (summary.repositories.length > 0) {
    const repoTexts = summary.repositories
      .slice(0, 3)
      .map((r) => `${r.name ?? "untitled"} (${r.language ?? "unknown"}, ${r.stars} stars)`);
    parts.push(`Repos: ${repoTexts.join("; ")}`);
  }

  return parts.join("\n");
}

function buildIntentText(intent: QueryIntent): string {
  const parts: string[] = [];

  parts.push(`Query: "${intent.rawQuery}"`);

  if (intent.roles.length > 0) {
    parts.push(`Required roles: ${intent.roles.join(", ")}`);
  }

  if (intent.skills.length > 0) {
    parts.push(`Key skills: ${intent.skills.join(", ")}`);
  }

  if (intent.locations.length > 0) {
    parts.push(`Location preference: ${intent.locations.join(", ")}`);
  }

  if (intent.mustHaves.length > 0) {
    parts.push(`Must have: ${intent.mustHaves.join(", ")}`);
  }

  if (intent.niceToHaves.length > 0) {
    parts.push(`Nice to have: ${intent.niceToHaves.join(", ")}`);
  }

  return parts.join("\n");
}

function parseScoreResponse(content: string): { score: number; reasoning: string } {
  const MAX_PARSE_LENGTH = 1000;
  const truncated = content.slice(0, MAX_PARSE_LENGTH);

  // Find first '{' and last '}' to extract JSON object
  const startIdx = truncated.indexOf("{");
  const endIdx = truncated.lastIndexOf("}");

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    return { score: 0, reasoning: "Failed to parse LLM response" };
  }

  const jsonStr = truncated.slice(startIdx, endIdx + 1);

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const result = ScoreSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    return { score: 0, reasoning: "Invalid score format" };
  } catch {
    return { score: 0, reasoning: "JSON parse failed" };
  }
}

/**
 * Extract candidate summary from search document, evidence, and person info.
 */
export function extractCandidateSummary(
  document: SearchDocument | undefined,
  evidence: EvidenceItem[],
  personId: string,
  personInfo?: { primaryName: string; primaryHeadline: string | null }
): CandidateSummary {
  const projects = evidence
    .filter((item) => item.evidenceType === "project")
    .slice(0, 3)
    .map((item) => ({
      title: item.title,
      description: typeof item.metadata?.description === "string"
        ? item.metadata.description
        : item.description
    }));

  const repositories = evidence
    .filter((item) => item.evidenceType === "repository")
    .slice(0, 3)
    .map((item) => ({
      name: item.title,
      language: typeof item.metadata?.language === "string" ? item.metadata.language : null,
      stars:
        typeof item.metadata?.stargazers_count === "number"
          ? item.metadata.stargazers_count
          : typeof item.metadata?.stars === "number"
            ? item.metadata.stars
            : 0
    }));

  return {
    personId,
    name: personInfo?.primaryName ?? "Unknown",
    headline: personInfo?.primaryHeadline ?? document?.docText?.slice(0, 100) ?? null,
    skills: document?.facetTags ?? [],
    roles: document?.facetRole ?? [],
    projects,
    repositories
  };
}

/**
 * Cross-encoder reranker using LLM for semantic relevance scoring.
 */
export class CrossEncoder {
  private readonly provider: LLMProvider;
  private readonly model?: string;
  private readonly batchSize: number;
  private readonly timeoutMs: number;

  constructor(config: CrossEncoderConfig) {
    this.provider = config.provider;
    this.model = config.model;
    this.batchSize = config.batchSize ?? 5;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  /**
   * Score a batch of candidates against the query intent.
   * Returns relevance scores (0-1) with brief reasoning.
   */
  async scoreBatch(
    intent: QueryIntent,
    candidates: CandidateSummary[]
  ): Promise<CrossEncoderScore[]> {
    if (candidates.length === 0) {
      return [];
    }

    const intentText = buildIntentText(intent);
    const results: CrossEncoderScore[] = [];

    // Process in batches to avoid overwhelming the LLM
    for (let i = 0; i < candidates.length; i += this.batchSize) {
      const batch = candidates.slice(i, i + this.batchSize);
      const batchResults = await Promise.all(
        batch.map((candidate) => this.scoreSingle(intentText, candidate))
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async scoreSingle(
    intentText: string,
    candidate: CandidateSummary
  ): Promise<CrossEncoderScore> {
    const candidateText = buildCandidateText(candidate);

    const messages: ChatMessage[] = [
      { role: "system", content: SCORING_PROMPT },
      {
        role: "user",
        content: `<SEARCH_INTENT>\n${intentText}\n</SEARCH_INTENT>\n\n<CANDIDATE>\n${candidateText}\n</CANDIDATE>`
      }
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.provider.chat(messages, {
        model: this.model,
        temperature: 0,
        signal: controller.signal as AbortSignal,
        responseFormat: "json"
      });

      const parsed = parseScoreResponse(response.content);

      return {
        personId: candidate.personId,
        relevanceScore: parsed.score,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      const errorMessage =
        (error as Error).name === "AbortError" ? "Timeout" : "LLM error";
      return {
        personId: candidate.personId,
        relevanceScore: 0,
        reasoning: errorMessage
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Score candidates using cross-encoder.
 * Convenience function for one-shot scoring.
 */
export async function crossEncoderScore(
  config: CrossEncoderConfig,
  intent: QueryIntent,
  candidates: CandidateSummary[]
): Promise<CrossEncoderScore[]> {
  const encoder = new CrossEncoder(config);
  return encoder.scoreBatch(intent, candidates);
}