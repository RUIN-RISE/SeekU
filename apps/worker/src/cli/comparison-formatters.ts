import type { EvidenceItem } from "@seeku/db";
import type { ComparisonEvidenceSummary } from "./types.js";

export function describeRelativeDate(date: Date): string {
  const ageInDays = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (ageInDays <= 0) {
    return "今天";
  }

  return `${ageInDays}天前`;
}

export function truncateForDisplay(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const chars = Array.from(normalized);
  if (chars.length <= maxLength) {
    return normalized;
  }

  return `${chars.slice(0, maxLength - 3).join("")}...`;
}

export function buildEvidenceHeadline(item: EvidenceItem): string {
  const title = item.title?.trim();
  const description = item.description?.trim();

  if (item.evidenceType === "profile_field" && title && description) {
    return truncateForDisplay(`${title}: ${description}`, 54);
  }

  if (title) {
    return truncateForDisplay(title, 54);
  }

  return truncateForDisplay(description || "未命名证据", 54);
}

export function buildComparisonEvidence(evidence: EvidenceItem[]): ComparisonEvidenceSummary[] {
  const priority: Record<string, number> = {
    project: 0,
    repository: 1,
    experience: 2,
    job_signal: 3,
    profile_field: 4,
    social: 5
  };

  return evidence
    .map((item) => ({
      item,
      priority: priority[item.evidenceType] ?? 99
    }))
    .filter(({ item }) => Boolean(item.title?.trim() || item.description?.trim()))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      const leftTime = left.item.occurredAt?.getTime() ?? 0;
      const rightTime = right.item.occurredAt?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .slice(0, 3)
    .map(({ item }) => ({
      evidenceType: item.evidenceType,
      title: buildEvidenceHeadline(item),
      sourceLabel: item.source === "bonjour" ? "Bonjour" : item.source === "github" ? "GitHub" : item.source,
      freshnessLabel: item.occurredAt ? describeRelativeDate(item.occurredAt) : undefined
    }));
}
