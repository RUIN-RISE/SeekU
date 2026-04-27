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

export interface CrossEncoderOptions {
  signal?: AbortSignal;
}

export interface CandidateSummary {
  personId: string;
  name: string;
  headline: string | null;
  location: string | null;
  skills: string[];
  roles: string[];
  projects: Array<{ title: string | null; description: string | null }>;
  repositories: Array<{ name: string | null; language: string | null; stars: number; description: string | null }>;
  experiences: Array<{ title: string | null; description: string | null; occurredAt: Date | null }>;
  /** Latest evidence timestamp — proxy for freshness/activity */
  latestEvidenceAt: Date | null;
}

const SCORING_PROMPT = `You are a talent matching evaluator for Seeku, an AI talent search engine.

Given a search intent and a candidate profile, score how well the candidate matches the intent on a 0.0–1.0 scale.

Return ONLY a valid JSON object:
{
  "score": number (0.0 to 1.0),
  "reasoning": string (max 100 chars, cite the strongest evidence or the gap)
}

CALIBRATION ANCHORS — use these to anchor the score:

0.0–0.2 — No match
  Example: query "RAG engineer in Hangzhou", candidate is a frontend designer in Beijing with no ML evidence.
  Reasoning style: "no ML/RAG evidence; wrong location; wrong role".

0.3–0.5 — Tangential match
  Example: query "open-source AI founder", candidate is a backend engineer with one Python repo and no founder/lead role.
  Reasoning style: "has Python but no founder/open-source signal".

0.6–0.75 — Partial match (most signals present, missing must-haves)
  Example: query "ML engineer with GitHub activity", candidate has ML in skills but no recent GitHub repos.
  Reasoning style: "ML skills strong, GitHub activity weak/old".

0.8–0.9 — Strong match (all skills + role + recent evidence)
  Example: query "RAG engineer", candidate ships a RAG retrieval repo in last 90 days, role is ML engineer.
  Reasoning style: "fresh RAG repo + ML engineer role".

0.95–1.0 — Exceptional / role-defining match
  Example: query "open-source AI founder", candidate is founder of a popular open-source LLM project with 10k+ stars.
  Reasoning style: "founder of named OSS project, exact intent fit".

Scoring discipline:
- Reward direct evidence (a project named in the query > a skill tag).
- Reward recency: evidence in the last 6 months counts more than 2-year-old work.
- Penalize claims without evidence (skill listed but no project/repo).
- Honor location and source filters when intent specifies them.
- Do NOT default to 0.5 when uncertain — pick the closest anchor band.

Output must be valid JSON. No prose, no markdown fences.`;

const ScoreSchema = z.object({
  score: z.number().min(0).max(1).default(0),
  reasoning: z.string().max(100).default("")
});

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

// Per-field caps keep individual fields from dominating the prompt; the total
// cap protects against the sum (many medium fields) blowing past context.
// LLM scoring is per-token, so a single 5KB candidate inflates cost for every
// rerank pass. 2000 chars ≈ 500 tokens — enough to convey the strongest signal.
const FIELD_TEXT_LIMIT = 200;
const MAX_LIST_ITEMS = 12;
const TOTAL_TEXT_LIMIT = 2000;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function buildCandidateText(summary: CandidateSummary): string {
  const parts: string[] = [];

  parts.push(`Name: ${truncate(summary.name, FIELD_TEXT_LIMIT)}`);
  if (summary.headline) {
    parts.push(`Headline: ${truncate(summary.headline, FIELD_TEXT_LIMIT)}`);
  }
  if (summary.location) {
    parts.push(`Location: ${truncate(summary.location, FIELD_TEXT_LIMIT)}`);
  }

  if (summary.roles.length > 0) {
    parts.push(`Roles: ${summary.roles.slice(0, MAX_LIST_ITEMS).join(", ")}`);
  }

  if (summary.skills.length > 0) {
    parts.push(`Skills: ${summary.skills.slice(0, MAX_LIST_ITEMS).join(", ")}`);
  }

  if (summary.experiences.length > 0) {
    const experienceTexts = summary.experiences
      .slice(0, 3)
      .map((e) => {
        const date = formatDate(e.occurredAt);
        const dateSuffix = date ? ` [${date}]` : "";
        const title = truncate(e.title ?? "Untitled role", FIELD_TEXT_LIMIT);
        const description = truncate(e.description ?? "No description", FIELD_TEXT_LIMIT);
        return `${title}${dateSuffix}: ${description}`;
      });
    parts.push(`Work history: ${experienceTexts.join("; ")}`);
  }

  if (summary.projects.length > 0) {
    const projectTexts = summary.projects
      .slice(0, 3)
      .map((p) => {
        const title = truncate(p.title ?? "Untitled", FIELD_TEXT_LIMIT);
        const description = truncate(p.description ?? "No description", FIELD_TEXT_LIMIT);
        return `${title}: ${description}`;
      });
    parts.push(`Projects: ${projectTexts.join("; ")}`);
  }

  if (summary.repositories.length > 0) {
    const repoTexts = summary.repositories
      .slice(0, 3)
      .map((r) => {
        const name = truncate(r.name ?? "untitled", FIELD_TEXT_LIMIT);
        const desc = r.description ? ` — ${truncate(r.description, FIELD_TEXT_LIMIT)}` : "";
        return `${name} (${r.language ?? "unknown"}, ${r.stars} stars)${desc}`;
      });
    parts.push(`Repos: ${repoTexts.join("; ")}`);
  }

  const latest = formatDate(summary.latestEvidenceAt);
  if (latest) {
    parts.push(`Latest evidence: ${latest}`);
  }

  return truncate(parts.join("\n"), TOTAL_TEXT_LIMIT);
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

function parseScoreResponse(content: string): { score: number; reasoning: string } | null {
  const MAX_PARSE_LENGTH = 1000;
  const truncated = content.slice(0, MAX_PARSE_LENGTH);

  // Find first '{' and last '}' to extract JSON object
  const startIdx = truncated.indexOf("{");
  const endIdx = truncated.lastIndexOf("}");

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    return null;
  }

  const jsonStr = truncated.slice(startIdx, endIdx + 1);

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const result = ScoreSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract the most relevant activity timestamp for an evidence item.
 *
 * Prefers the canonical `occurredAt` column when present. Falls back to GitHub
 * repo metadata fields (pushedAt > updatedAt > createdAt) — repository evidence
 * extracted in packages/identity/src/evidence/github.ts only stores activity
 * dates in metadata, so without this fallback `latestEvidenceAt` would always
 * be null for GitHub-sourced candidates and the freshness prompt signal would
 * silently disappear.
 */
function resolveEvidenceTimestamp(item: EvidenceItem): Date | null {
  if (item.occurredAt) {
    return item.occurredAt;
  }

  const candidates = [
    item.metadata?.pushedAt,
    item.metadata?.updatedAt,
    item.metadata?.createdAt,
    item.metadata?.pushed_at,
    item.metadata?.updated_at,
    item.metadata?.created_at
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

/**
 * Extract candidate summary from search document, evidence, and person info.
 */
export function extractCandidateSummary(
  document: SearchDocument | undefined,
  evidence: EvidenceItem[],
  personId: string,
  personInfo?: { primaryName: string; primaryHeadline: string | null; primaryLocation?: string | null }
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
            : 0,
      description: item.description ?? (typeof item.metadata?.description === "string" ? item.metadata.description : null)
    }));

  const experiences = evidence
    .filter((item) => item.evidenceType === "experience")
    .sort((a, b) => {
      const aTs = a.occurredAt ? a.occurredAt.getTime() : 0;
      const bTs = b.occurredAt ? b.occurredAt.getTime() : 0;
      return bTs - aTs;
    })
    .slice(0, 3)
    .map((item) => ({
      title: item.title,
      description: item.description,
      occurredAt: item.occurredAt
    }));

  // Freshness signal must reflect work-related activity, not arbitrary
  // evidence. A fresh social/profile update would otherwise make a years-old
  // repo look recent. Prompt rewards recency, so this matters for scoring.
  //
  // GitHub repo evidence (see packages/identity/src/evidence/github.ts) does
  // not populate `occurredAt`; activity dates live in metadata. Read pushedAt
  // (last code activity) → updatedAt → createdAt as fallback so freshness
  // actually reflects repo work, not just project entries that have occurredAt.
  let latestEvidenceAt: Date | null = null;
  for (const item of evidence) {
    if (item.evidenceType !== "project" && item.evidenceType !== "repository") {
      continue;
    }
    const candidate = resolveEvidenceTimestamp(item);
    if (!candidate) continue;
    if (!latestEvidenceAt || candidate.getTime() > latestEvidenceAt.getTime()) {
      latestEvidenceAt = candidate;
    }
  }

  const docLocation = document?.facetLocation?.[0] ?? null;

  return {
    personId,
    name: personInfo?.primaryName ?? "Unknown",
    headline: personInfo?.primaryHeadline ?? document?.docText?.slice(0, 100) ?? null,
    location: personInfo?.primaryLocation ?? docLocation,
    skills: document?.facetTags ?? [],
    roles: document?.facetRole ?? [],
    projects,
    repositories,
    experiences,
    latestEvidenceAt
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
   * Returns relevance scores only for candidates the LLM successfully scored —
   * timeouts, parse failures, and LLM errors are dropped from the result rather
   * than treated as score=0 (which would otherwise feed into the reranker as a
   * strong negative signal at 0.3 weight). Skipped candidates fall back to
   * heuristic-only scoring downstream.
   */
  async scoreBatch(
    intent: QueryIntent,
    candidates: CandidateSummary[],
    options: CrossEncoderOptions = {}
  ): Promise<CrossEncoderScore[]> {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error("Cross-encoder aborted.");
    }

    if (candidates.length === 0) {
      return [];
    }

    const intentText = buildIntentText(intent);
    const results: CrossEncoderScore[] = [];

    // Process in batches to avoid overwhelming the LLM
    for (let i = 0; i < candidates.length; i += this.batchSize) {
      const batch = candidates.slice(i, i + this.batchSize);
      const batchResults = await Promise.all(
        batch.map((candidate) => this.scoreSingle(intentText, candidate, options))
      );
      for (const result of batchResults) {
        if (result !== null) {
          results.push(result);
        }
      }
    }

    return results;
  }

  private async scoreSingle(
    intentText: string,
    candidate: CandidateSummary,
    options: CrossEncoderOptions = {}
  ): Promise<CrossEncoderScore | null> {
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
    const abortFromParent = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromParent, { once: true });

    try {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new Error("Cross-encoder aborted.");
      }

      const response = await this.provider.chat(messages, {
        model: this.model,
        temperature: 0,
        signal: controller.signal as AbortSignal,
        responseFormat: "json"
      });

      const parsed = parseScoreResponse(response.content);
      if (parsed === null) {
        return null;
      }

      return {
        personId: candidate.personId,
        relevanceScore: parsed.score,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      if (options.signal?.aborted) {
        throw error;
      }
      // Timeout or LLM error: drop this candidate from the score map so the
      // reranker treats it as no-signal rather than score=0 (strong negative).
      return null;
    } finally {
      options.signal?.removeEventListener("abort", abortFromParent);
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
  candidates: CandidateSummary[],
  options: CrossEncoderOptions = {}
): Promise<CrossEncoderScore[]> {
  const encoder = new CrossEncoder(config);
  return encoder.scoreBatch(intent, candidates, options);
}
