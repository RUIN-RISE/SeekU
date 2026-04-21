import type { SearchConditions, SearchCandidateAnchor } from "./types.js";
import { CLI_CONFIG } from "./config.js";

const SKIPPED_QUERY_VALUES = new Set(["不限", "skip", "none"]);

export function normalizeConditions(conditions: Partial<SearchConditions>): SearchConditions {
  const dedupe = (values: string[] | undefined) => {
    const seen = new Set<string>();
    return (values || []).filter((value) => {
      const normalized = value.trim();
      if (!normalized) {
        return false;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const candidateAnchor = conditions.candidateAnchor
    ? {
        shortlistIndex:
          typeof conditions.candidateAnchor.shortlistIndex === "number" &&
          conditions.candidateAnchor.shortlistIndex > 0
            ? conditions.candidateAnchor.shortlistIndex
            : undefined,
        personId: conditions.candidateAnchor.personId?.trim() || undefined,
        name: conditions.candidateAnchor.name?.trim() || undefined
      }
    : undefined;

  return {
    skills: dedupe(conditions.skills),
    locations: dedupe(conditions.locations),
    experience: conditions.experience?.trim() || undefined,
    role: conditions.role?.trim() || undefined,
    sourceBias: conditions.sourceBias,
    mustHave: dedupe(conditions.mustHave),
    niceToHave: dedupe(conditions.niceToHave),
    exclude: dedupe(conditions.exclude),
    preferFresh: Boolean(conditions.preferFresh),
    candidateAnchor:
      candidateAnchor?.shortlistIndex || candidateAnchor?.personId || candidateAnchor?.name
        ? candidateAnchor
        : undefined,
    limit: conditions.limit || CLI_CONFIG.ui.defaultLimit
  };
}

export function buildEffectiveQuery(conditions: SearchConditions): string {
  return [
    ...conditions.skills,
    ...conditions.locations,
    conditions.experience ?? "",
    conditions.role ?? "",
    conditions.sourceBias ?? "",
    ...conditions.mustHave.map((value) => `must have ${value}`),
    ...conditions.niceToHave.map((value) => `prefer ${value}`),
    ...conditions.exclude.map((value) => `exclude ${value}`),
    conditions.preferFresh ? "prefer recent active profiles" : "",
    conditions.candidateAnchor?.name ? `similar to ${conditions.candidateAnchor.name}` : "",
    conditions.candidateAnchor?.shortlistIndex
      ? `similar to shortlist ${conditions.candidateAnchor.shortlistIndex}`
      : ""
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && !SKIPPED_QUERY_VALUES.has(value.toLowerCase()))
    .join(" ");
}

export function formatConditionsAsPrompt(conditions: SearchConditions): string {
  const parts: string[] = [];

  if (conditions.role) {
    parts.push(`角色 ${conditions.role}`);
  }

  if (conditions.skills.length > 0) {
    parts.push(`技术栈 ${conditions.skills.join(" / ")}`);
  }

  if (conditions.locations.length > 0) {
    parts.push(`地点 ${conditions.locations.join(" / ")}`);
  }

  if (conditions.experience) {
    parts.push(`经验 ${conditions.experience}`);
  }

  if (conditions.sourceBias) {
    parts.push(`来源 ${conditions.sourceBias}`);
  }

  if (conditions.mustHave.length > 0) {
    parts.push(`必须项 ${conditions.mustHave.join(" / ")}`);
  }

  if (conditions.niceToHave.length > 0) {
    parts.push(`优先项 ${conditions.niceToHave.join(" / ")}`);
  }

  if (conditions.exclude.length > 0) {
    parts.push(`排除项 ${conditions.exclude.join(" / ")}`);
  }

  if (conditions.preferFresh) {
    parts.push("偏好最近活跃");
  }

  if (conditions.candidateAnchor?.name) {
    parts.push(`参考候选 ${conditions.candidateAnchor.name}`);
  } else if (conditions.candidateAnchor?.shortlistIndex) {
    parts.push(`参考 shortlist #${conditions.candidateAnchor.shortlistIndex}`);
  }

  return parts.length > 0 ? parts.join("，") : "不限条件";
}
