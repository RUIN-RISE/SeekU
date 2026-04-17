import type { SearchDocument } from "@seeku/db";

import { normalizeSearchText } from "./search-normalization.js";

export interface DisambiguationCandidate {
  personId: string;
  name: string;
  headline?: string | null;
  matchReasons?: string[];
  document?: Pick<SearchDocument, "facetSource" | "facetTags">;
}

function truncateLabel(value: string, maxChars: number): string {
  const chars = Array.from(value.trim());
  if (chars.length <= maxChars) {
    return value.trim();
  }

  return `${chars.slice(0, maxChars - 1).join("")}…`;
}

function queryReferencesName(query: string, candidateName: string): boolean {
  if (!query || !candidateName) {
    return false;
  }

  return query === candidateName || query.includes(candidateName) || candidateName.includes(query);
}

function buildCandidateLabel(candidate: DisambiguationCandidate): string {
  const headline = candidate.headline?.trim();
  if (headline && normalizeSearchText(headline) !== normalizeSearchText(candidate.name)) {
    return truncateLabel(headline, 20);
  }

  if (candidate.matchReasons?.includes("zju manual seed")) {
    return "浙大校友 seed";
  }

  if (candidate.matchReasons?.includes("zju evidence")) {
    return "浙大相关";
  }

  const source = candidate.document?.facetSource?.[0];
  if (source) {
    return `来源 ${source}`;
  }

  return "画像待区分";
}

export function buildDisambiguationNotes(
  query: string,
  candidates: DisambiguationCandidate[]
): Map<string, string> {
  const normalizedQuery = normalizeSearchText(query);
  const byName = new Map<string, DisambiguationCandidate[]>();

  for (const candidate of candidates) {
    const normalizedName = normalizeSearchText(candidate.name);
    if (!normalizedName) {
      continue;
    }

    const current = byName.get(normalizedName) ?? [];
    current.push(candidate);
    byName.set(normalizedName, current);
  }

  const notes = new Map<string, string>();

  for (const [normalizedName, group] of byName.entries()) {
    if (group.length < 2 || !queryReferencesName(normalizedQuery, normalizedName)) {
      continue;
    }

    const labels = group.map((candidate) => ({
      personId: candidate.personId,
      label: buildCandidateLabel(candidate)
    }));

    for (const candidate of group) {
      const currentLabel = labels.find((item) => item.personId === candidate.personId)?.label ?? "当前候选";
      const otherLabels = labels
        .filter((item) => item.personId !== candidate.personId)
        .map((item) => item.label)
        .filter((label, index, array) => array.indexOf(label) === index)
        .slice(0, 2);

      notes.set(
        candidate.personId,
        `重名提示：同名候选共 ${group.length} 个；当前是 ${currentLabel}${otherLabels.length > 0 ? `；其他还有 ${otherLabels.join(" / ")}` : ""}。`
      );
    }
  }

  return notes;
}
