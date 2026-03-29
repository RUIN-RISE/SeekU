import type { EvidenceItem, SearchDocument } from "@seeku/db";

import type { QueryIntent } from "./planner.js";
import type { SearchResult } from "./retriever.js";

export interface RerankResult extends SearchResult {
  finalScore: number;
  evidenceBoost: number;
  freshnessPenalty: number;
  matchReasons: string[];
}

export interface RerankerConfig {
  projectMatchBoost: number;
  repoMatchBoost: number;
  followerBoostScale: number;
  freshnessDecayDays: number;
}

const DEFAULT_CONFIG: RerankerConfig = {
  projectMatchBoost: 0.08,
  repoMatchBoost: 0.04,
  followerBoostScale: 0.02,
  freshnessDecayDays: 365
};

function textFromEvidence(item: EvidenceItem): string {
  return `${item.title ?? ""} ${item.description ?? ""}`.trim().toLowerCase();
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter(Boolean))].slice(0, 5);
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
    evidenceByPerson: Map<string, EvidenceItem[]>
  ): RerankResult[] {
    return results
      .map((result) => {
        const document = documents.get(result.personId);
        const evidence = evidenceByPerson.get(result.personId) ?? [];
        const evidenceBoost = this.computeEvidenceBoost(evidence, intent);
        const freshnessPenalty = this.computeFreshnessPenalty(document);
        const finalScore = result.combinedScore * (1 + evidenceBoost) * freshnessPenalty;

        return {
          ...result,
          finalScore,
          evidenceBoost,
          freshnessPenalty,
          matchReasons: this.extractMatchReasons(result, intent, document, evidence)
        };
      })
      .sort((left, right) => right.finalScore - left.finalScore);
  }

  private computeEvidenceBoost(evidence: EvidenceItem[], intent: QueryIntent): number {
    const skills = intent.skills.map((skill) => skill.toLowerCase());
    let boost = 0;

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

  private computeFreshnessPenalty(document?: SearchDocument): number {
    const freshness = document?.rankFeatures?.freshness ?? 365;
    return Math.max(0.35, Math.exp(-freshness / this.config.freshnessDecayDays));
  }

  private extractMatchReasons(
    result: SearchResult,
    intent: QueryIntent,
    document: SearchDocument | undefined,
    evidence: EvidenceItem[]
  ): string[] {
    const reasons: string[] = [];
    const matchedText = result.matchedText.toLowerCase();

    for (const role of intent.roles) {
      if (document?.facetRole?.some((value) => value.includes(role)) || matchedText.includes(role)) {
        reasons.push(`role match: ${role}`);
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
  config: Partial<RerankerConfig> = {}
): RerankResult[] {
  const reranker = new Reranker(config);
  return reranker.rerank(results, intent, documents, evidenceByPerson);
}
