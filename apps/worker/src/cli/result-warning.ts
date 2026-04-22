import type { ScoredCandidate } from "./types.js";

export function buildResultWarning(
  candidates: Array<Pick<ScoredCandidate, "matchStrength">>
): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  if (candidates.some((candidate) => candidate.matchStrength === "strong")) {
    return undefined;
  }

  if (candidates.some((candidate) => candidate.matchStrength === "medium")) {
    return "没有找到强匹配，当前结果以中等相关候选人为主。建议继续补充必须项、关键技术或放宽来源过滤。";
  }

  return "没有找到强匹配，只找到了弱相关候选人。建议继续补充必须项、关键技术或放宽来源过滤。";
}
