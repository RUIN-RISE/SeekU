export type MatchStrength = "strong" | "medium" | "weak";

function normalizeMatchScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  if (score > 1) {
    return Math.max(0, Math.min(score / 100, 1));
  }

  return Math.max(0, Math.min(score, 1));
}

function categorizeReason(reason: string): "substantive" | "supportive" | "generic" {
  const normalized = reason.trim();
  if (!normalized || normalized.includes("fallback")) {
    return "generic";
  }

  if (
    normalized.startsWith("技术命中：") ||
    normalized.startsWith("必须项满足：") ||
    normalized.startsWith("角色贴合：") ||
    normalized.startsWith("经验层级贴合：") ||
    normalized.startsWith("检索技能命中：") ||
    normalized.startsWith("检索必须项命中：") ||
    normalized.startsWith("检索角色命中：") ||
    normalized.startsWith("相关证据：") ||
    normalized.startsWith("相关项目：") ||
    normalized.startsWith("role match:") ||
    normalized.startsWith("skill evidence:") ||
    normalized.startsWith("must-have matched:") ||
    normalized.startsWith("project:") ||
    normalized === "语义相似度高" ||
    normalized === "关键词重合度高" ||
    normalized === "strong semantic similarity" ||
    normalized === "strong keyword overlap"
  ) {
    return "substantive";
  }

  if (
    normalized.startsWith("地点命中：") ||
    normalized.startsWith("来源过滤命中：") ||
    normalized.startsWith("近期活跃：")
  ) {
    return "supportive";
  }

  return "generic";
}

export function classifyMatchStrength(score: number, reasons: string[]): MatchStrength {
  const normalizedScore = normalizeMatchScore(score);
  const normalizedReasons = reasons.map((reason) => reason.trim()).filter(Boolean);
  const substantiveCount = normalizedReasons.filter(
    (reason) => categorizeReason(reason) === "substantive"
  ).length;
  const supportiveCount = normalizedReasons.filter(
    (reason) => categorizeReason(reason) === "supportive"
  ).length;

  if (substantiveCount >= 2) {
    return "strong";
  }

  if (substantiveCount >= 1 && normalizedScore >= 0.55) {
    return "strong";
  }

  if (substantiveCount >= 1) {
    return "medium";
  }

  if (supportiveCount >= 2 && normalizedScore >= 0.45) {
    return "medium";
  }

  if (supportiveCount >= 1 && normalizedScore >= 0.55) {
    return "medium";
  }

  if (normalizedScore >= 0.7 && normalizedReasons.length > 0) {
    return "medium";
  }

  return "weak";
}
