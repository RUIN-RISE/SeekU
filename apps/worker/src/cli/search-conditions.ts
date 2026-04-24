import type { SearchConditions, SearchCandidateAnchor } from "./types.js";
import { CLI_CONFIG } from "./config.js";

const SKIPPED_QUERY_VALUES = new Set(["不限", "skip", "none"]);
const ZJU_ALIASES = new Set(["浙大", "浙江大学", "zju", "zhejiang university"]);
const STUDENT_TERMS = new Set(["本科生", "学生", "在读", "就读"]);

function isZjuAlias(value: string): boolean {
  return ZJU_ALIASES.has(value.trim().toLowerCase());
}

function hasAnyTerm(values: string[], terms: Set<string>): boolean {
  return values.some((value) => terms.has(value.trim().toLowerCase()));
}

function hasEducationIntent(conditions: Partial<SearchConditions>): boolean {
  return [
    conditions.role,
    conditions.experience,
    ...(conditions.skills ?? []),
    ...(conditions.locations ?? []),
    ...(conditions.mustHave ?? []),
    ...(conditions.niceToHave ?? [])
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => /浙大|浙江大学|\bzju\b|zhejiang university|本科生|学生|在读|就读/i.test(value));
}

function normalizeEducationIntent(conditions: Partial<SearchConditions>): Partial<SearchConditions> {
  if (!hasEducationIntent(conditions)) {
    return conditions;
  }

  const locations = (conditions.locations ?? []).filter((location) => !isZjuAlias(location));
  const mustHave = [...(conditions.mustHave ?? [])];
  const niceToHave = [...(conditions.niceToHave ?? [])];
  const skills = [...(conditions.skills ?? [])].filter((skill) => !isZjuAlias(skill));

  const sourceValues = [
    ...(conditions.locations ?? []),
    ...(conditions.skills ?? []),
    ...(conditions.mustHave ?? []),
    ...(conditions.niceToHave ?? []),
    conditions.role ?? "",
    conditions.experience ?? ""
  ];

  if (sourceValues.some(isZjuAlias)) {
    mustHave.push("zhejiang university");
  }

  if (hasAnyTerm(sourceValues, STUDENT_TERMS)) {
    niceToHave.push("本科生");
  }

  const role = conditions.role && STUDENT_TERMS.has(conditions.role.trim().toLowerCase())
    ? "学生"
    : conditions.role;

  return {
    ...conditions,
    skills,
    locations,
    role,
    mustHave,
    niceToHave
  };
}

export function normalizeConditions(conditions: Partial<SearchConditions>): SearchConditions {
  const normalizedEducation = normalizeEducationIntent(conditions);
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

  const candidateAnchor = normalizedEducation.candidateAnchor
    ? {
        shortlistIndex:
          typeof normalizedEducation.candidateAnchor.shortlistIndex === "number" &&
          normalizedEducation.candidateAnchor.shortlistIndex > 0
            ? normalizedEducation.candidateAnchor.shortlistIndex
            : undefined,
        personId: normalizedEducation.candidateAnchor.personId?.trim() || undefined,
        name: normalizedEducation.candidateAnchor.name?.trim() || undefined
      }
    : undefined;

  return {
    skills: dedupe(normalizedEducation.skills),
    locations: dedupe(normalizedEducation.locations),
    experience: normalizedEducation.experience?.trim() || undefined,
    role: normalizedEducation.role?.trim() || undefined,
    sourceBias: normalizedEducation.sourceBias,
    mustHave: dedupe(normalizedEducation.mustHave),
    niceToHave: dedupe(normalizedEducation.niceToHave),
    exclude: dedupe(normalizedEducation.exclude),
    preferFresh: Boolean(normalizedEducation.preferFresh),
    candidateAnchor:
      candidateAnchor?.shortlistIndex || candidateAnchor?.personId || candidateAnchor?.name
        ? candidateAnchor
        : undefined,
    limit: normalizedEducation.limit || CLI_CONFIG.ui.defaultLimit
  };
}

export function buildEffectiveQuery(conditions: SearchConditions): string {
  const expandedMustHave = conditions.mustHave.flatMap((value) =>
    value.toLowerCase() === "zhejiang university"
      ? ["zhejiang university", "zju", "浙江大学", "浙大"]
      : [value]
  );
  return [
    ...conditions.skills,
    ...conditions.locations,
    conditions.experience ?? "",
    conditions.role ?? "",
    conditions.sourceBias ?? "",
    ...expandedMustHave.map((value) => `must have ${value}`),
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
