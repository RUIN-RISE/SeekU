import type { MatchStrength, ScoredCandidate, SearchConditions } from "./types.js";

export type AgentLoopAction = "clarify" | "search" | "narrow" | "compare" | "decide";

export interface ClarifyPolicyDecision {
  action: Extract<AgentLoopAction, "clarify" | "search">;
  rationale: string;
  prompt?: string;
}

export interface PostSearchPolicyDecision<TCandidate extends ScoredCandidate = ScoredCandidate> {
  action: Extract<AgentLoopAction, "narrow" | "compare">;
  rationale: string;
  targets: TCandidate[];
}

interface ClarifyPolicyInput {
  conditions: SearchConditions;
  clarificationCount: number;
}

interface PostSearchPolicyInput<TCandidate extends ScoredCandidate = ScoredCandidate> {
  candidates: TCandidate[];
}

function hasNonEmptyValue(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

function hasSearchReadySignal(conditions: SearchConditions): boolean {
  return (
    conditions.skills.length > 0
    || hasNonEmptyValue(conditions.role)
    || hasNonEmptyValue(conditions.experience)
    || conditions.mustHave.length > 0
    || conditions.niceToHave.length > 0
    || Boolean(conditions.candidateAnchor?.personId || conditions.candidateAnchor?.name)
  );
}

function buildClarifyPrompt(conditions: SearchConditions): string {
  if (!hasSearchReadySignal(conditions) && conditions.locations.length > 0) {
    return "先补一句你最看重的角色或技术关键词，例如：后端 / RAG / CUDA / 搜索工程。";
  }

  if (!hasSearchReadySignal(conditions)) {
    return "先补一句你最想找的角色、技术栈或方向，例如：后端 / RAG / CUDA / 搜索工程。";
  }

  if (conditions.locations.length === 0) {
    return "如果地点有要求，再补一句；没有的话我就先按当前条件搜索。";
  }

  return "如果还有必须项或排除项，再补一句；没有的话我就先按当前条件搜索。";
}

function isComparableStrength(strength: MatchStrength | undefined): boolean {
  return strength === "strong" || strength === "medium";
}

export function decideClarifyAction(input: ClarifyPolicyInput): ClarifyPolicyDecision {
  if (hasSearchReadySignal(input.conditions)) {
    return {
      action: "search",
      rationale: "当前条件已经足够启动搜索，优先先跑出 shortlist。"
    };
  }

  if (input.clarificationCount >= 1) {
    return {
      action: "search",
      rationale: "clarify 已达到上限，先搜索再根据结果收敛，避免反复追问。"
    };
  }

  return {
    action: "clarify",
    rationale: "当前还缺少角色或技能主轴，先补一句再搜索会更稳。",
    prompt: buildClarifyPrompt(input.conditions)
  };
}

export function pickComparisonTargets<TCandidate extends ScoredCandidate>(
  candidates: TCandidate[],
  limit = 3
): TCandidate[] {
  const compareReady = candidates.filter((candidate) =>
    isComparableStrength(candidate.matchStrength)
  );

  const selected = compareReady.length >= 2 ? compareReady : candidates;
  return selected.slice(0, Math.min(limit, selected.length));
}

export function decidePostSearchAction<TCandidate extends ScoredCandidate>(
  input: PostSearchPolicyInput<TCandidate>
): PostSearchPolicyDecision<TCandidate> {
  const targets = pickComparisonTargets(input.candidates);
  const comparableCount = input.candidates.filter((candidate) =>
    isComparableStrength(candidate.matchStrength)
  ).length;

  if (targets.length >= 2 && comparableCount >= 2) {
    return {
      action: "compare",
      rationale: "当前已有 2-3 位可比候选人，优先进入 compare 收敛决策。",
      targets
    };
  }

  if (input.candidates.length === 1) {
    return {
      action: "narrow",
      rationale: "当前只有 1 位候选人，不足以形成 compare，需要继续扩充或 refine。",
      targets
    };
  }

  return {
    action: "narrow",
    rationale: "当前结果还偏弱，先保留 shortlist 继续 refine，再进入 compare。",
    targets
  };
}
