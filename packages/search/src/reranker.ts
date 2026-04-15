import type { EvidenceItem, SearchDocument } from "@seeku/db";

import type { QueryIntent } from "./planner.js";
import type { SearchResult } from "./retriever.js";
import type { CrossEncoderScore } from "./cross-encoder.js";

export interface RerankResult extends SearchResult {
  finalScore: number;
  evidenceBoost: number;
  freshnessPenalty: number;
  crossEncoderScore?: number;
  crossEncoderReasoning?: string;
  matchReasons: string[];
}

export interface RerankerConfig {
  projectMatchBoost: number;
  repoMatchBoost: number;
  followerBoostScale: number;
  freshnessDecayDays: number;
  /** Weight for cross-encoder score when available (0-1, default: 0.3) */
  crossEncoderWeight?: number;
}

const DEFAULT_CONFIG: RerankerConfig = {
  projectMatchBoost: 0.08,
  repoMatchBoost: 0.04,
  followerBoostScale: 0.02,
  freshnessDecayDays: 365,
  crossEncoderWeight: 0.3
};

const OPEN_SOURCE_QUERY_TERMS = ["open source", "开源"] as const;
const OPEN_SOURCE_TEXT_TERMS = ["open source", "open-source", "开源"] as const;
const TECH_LEAD_ROLE_TERMS = ["tech lead", "technical lead", "技术负责人", "负责人", "lead"] as const;
const SPECIALIZED_QUERY_TERMS = [
  "rag",
  "retrieval",
  "检索",
  "multimodal",
  "multi-modal",
  "多模态",
  "computer vision",
  "计算机视觉",
  "llm"
] as const;

function textFromEvidence(item: EvidenceItem): string {
  return `${item.title ?? ""} ${item.description ?? ""}`.trim().toLowerCase();
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function hasRepositoryEvidence(evidence: EvidenceItem[]): boolean {
  return evidence.some((item) => item.evidenceType === "repository");
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter(Boolean))].slice(0, 5);
}

function textIncludesAny(text: string, terms: readonly string[]): boolean {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

export class Reranker {
  private readonly config: RerankerConfig;

  constructor(config: Partial<RerankerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  rerank(
    results: SearchResult[],
    intent: QueryIntent,
    documents: Map<string, SearchDocument>,
    evidenceByPerson: Map<string, EvidenceItem[]>,
    crossEncoderScores?: Map<string, CrossEncoderScore>
  ): RerankResult[] {
    return results
      .map((result) => {
        const document = documents.get(result.personId);
        const evidence = evidenceByPerson.get(result.personId) ?? [];
        const evidenceBoost = this.computeEvidenceBoost(evidence, intent, document);
        const freshnessPenalty = this.computeFreshnessPenalty(document);
        const crossEncoderResult = crossEncoderScores?.get(result.personId);

        // Combine heuristic score with cross-encoder if available
        const heuristicScore = result.combinedScore * (1 + evidenceBoost) * freshnessPenalty;
        const crossEncoderWeight = this.config.crossEncoderWeight ?? 0.3;

        const finalScore = crossEncoderResult
          ? heuristicScore * (1 - crossEncoderWeight) +
            crossEncoderResult.relevanceScore * crossEncoderWeight
          : heuristicScore;

        const matchReasons = this.extractMatchReasons(
          result,
          intent,
          document,
          evidence,
          crossEncoderResult
        );

        return {
          ...result,
          finalScore,
          evidenceBoost,
          freshnessPenalty,
          crossEncoderScore: crossEncoderResult?.relevanceScore,
          crossEncoderReasoning: crossEncoderResult?.reasoning,
          matchReasons
        };
      })
      .sort((left, right) => right.finalScore - left.finalScore);
  }

  private computeEvidenceBoost(
    evidence: EvidenceItem[],
    intent: QueryIntent,
    document?: SearchDocument
  ): number {
    const skills = intent.skills.map((skill) => skill.toLowerCase());
    let boost = 0;
    const wantsOpenSource = this.queryWantsOpenSource(intent);
    const wantsTechLead = this.queryWantsTechLead(intent);
    const wantsSpecializedFocus = this.queryWantsSpecializedFocus(intent);
    const documentText = document?.docText?.toLowerCase() ?? "";

    for (const item of evidence) {
      const text = textFromEvidence(item);
      const language = typeof item.metadata?.language === "string"
        ? item.metadata.language.toLowerCase()
        : "";
      const matchesSkill = skills.some((skill) => text.includes(skill) || language === skill);

      if (item.evidenceType === "project" && matchesSkill) {
        boost += this.config.projectMatchBoost;
      }

      if (item.evidenceType === "repository" && matchesSkill) {
        boost += this.config.repoMatchBoost;
      }
    }

    if (
      wantsSpecializedFocus
      && document?.facetSource?.includes("github")
      && (
        skills.some((skill) => documentText.includes(skill))
        || evidence.some((item) => {
          const text = textFromEvidence(item);
          return item.evidenceType === "repository" && skills.some((skill) => text.includes(skill));
        })
      )
    ) {
      boost += 0.12;

      if (hasRepositoryEvidence(evidence)) {
        boost += 0.08;
      }
    }

    if (wantsOpenSource) {
      if (document?.facetSource?.includes("github")) {
        boost += 0.12;
      }

      if ((document?.docText && textIncludesAny(document.docText, OPEN_SOURCE_TEXT_TERMS))
        || evidence.some((item) => item.evidenceType === "repository")) {
        boost += 0.08;
      }
    }

    if (wantsTechLead) {
      const roleText = [
        ...(document?.facetRole ?? []),
        document?.docText ?? ""
      ].join(" ").toLowerCase();

      if (textIncludesAny(roleText, TECH_LEAD_ROLE_TERMS)) {
        boost += 0.08;
      }
    }

    const followerCount = evidence.reduce((sum, item) => {
      return (
        sum +
        asNumber(item.metadata?.followers) +
        asNumber(item.metadata?.followersCount) +
        asNumber(item.metadata?.stargazers_count)
      );
    }, 0);

    boost += this.config.followerBoostScale * Math.log10(followerCount + 1);

    return boost;
  }

  private queryWantsOpenSource(intent: QueryIntent): boolean {
    const text = [intent.rawQuery, ...intent.skills, ...intent.mustHaves, ...intent.niceToHaves]
      .join(" ")
      .toLowerCase();
    return textIncludesAny(text, OPEN_SOURCE_QUERY_TERMS);
  }

  private queryWantsTechLead(intent: QueryIntent): boolean {
    const text = [intent.rawQuery, ...intent.roles].join(" ").toLowerCase();
    return textIncludesAny(text, TECH_LEAD_ROLE_TERMS);
  }

  private queryWantsSpecializedFocus(intent: QueryIntent): boolean {
    const text = [intent.rawQuery, ...intent.skills, ...intent.mustHaves, ...intent.niceToHaves]
      .join(" ")
      .toLowerCase();
    return textIncludesAny(text, SPECIALIZED_QUERY_TERMS);
  }

  private computeFreshnessPenalty(document?: SearchDocument): number {
    const freshness = document?.rankFeatures?.freshness ?? 365;
    return Math.max(0.35, Math.exp(-freshness / this.config.freshnessDecayDays));
  }

  private extractMatchReasons(
    result: SearchResult,
    intent: QueryIntent,
    document: SearchDocument | undefined,
    evidence: EvidenceItem[],
    crossEncoderResult?: CrossEncoderScore
  ): string[] {
    const reasons: string[] = [];
    const matchedText = result.matchedText.toLowerCase();

    // Include cross-encoder reasoning if available and meaningful
    if (crossEncoderResult?.reasoning && crossEncoderResult.relevanceScore >= 0.5) {
      reasons.push(`LLM: ${crossEncoderResult.reasoning}`);
    }

    for (const role of intent.roles) {
      if (document?.facetRole?.some((value) => value.includes(role)) || matchedText.includes(role)) {
        reasons.push(`role match: ${role}`);
      }
    }

    if (this.queryWantsOpenSource(intent) && document?.facetSource?.includes("github")) {
      reasons.push("github open-source evidence");
    }

    if (
      this.queryWantsSpecializedFocus(intent)
      && document?.facetSource?.includes("github")
    ) {
      const documentText = (document?.docText ?? "").toLowerCase();
      const hasSpecializedEvidence = intent.skills.some((skill) => documentText.includes(skill))
        || evidence.some((item) => {
          const text = textFromEvidence(item);
          return item.evidenceType === "repository"
            && intent.skills.some((skill) => text.includes(skill));
        });

      if (hasSpecializedEvidence) {
        reasons.push("github technical evidence");
      }
    }

    if (this.queryWantsTechLead(intent)) {
      const roleText = [
        ...(document?.facetRole ?? []),
        document?.docText ?? ""
      ].join(" ").toLowerCase();
      if (textIncludesAny(roleText, TECH_LEAD_ROLE_TERMS)) {
        reasons.push("tech lead evidence");
      }
    }

    for (const skill of intent.skills) {
      const matchedEvidence = evidence.find((item) => textFromEvidence(item).includes(skill));
      const matchedTag = document?.facetTags?.includes(skill);

      if (matchedTag || matchedEvidence) {
        reasons.push(`skill evidence: ${skill}`);
      }
    }

    for (const term of intent.mustHaves) {
      if (matchedText.includes(term)) {
        reasons.push(`must-have matched: ${term}`);
      }
    }

    if (result.vectorScore >= 0.75) {
      reasons.push("strong semantic similarity");
    }

    if (result.keywordScore >= 0.5) {
      reasons.push("strong keyword overlap");
    }

    const featuredProject = evidence.find((item) => item.evidenceType === "project" && item.title);
    if (featuredProject?.title) {
      reasons.push(`project: ${featuredProject.title}`);
    }

    return uniqueReasons(reasons);
  }
}

export function rerank(
  results: SearchResult[],
  intent: QueryIntent,
  documents: Map<string, SearchDocument>,
  evidenceByPerson: Map<string, EvidenceItem[]>,
  config: Partial<RerankerConfig> = {},
  crossEncoderScores?: Map<string, CrossEncoderScore>
): RerankResult[] {
  const reranker = new Reranker(config);
  return reranker.rerank(results, intent, documents, evidenceByPerson, crossEncoderScores);
}
