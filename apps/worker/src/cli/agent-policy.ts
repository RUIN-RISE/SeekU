import type {
  MatchStrength,
  ScoredCandidate,
  SearchConditions
} from "./types.js";
import type { FailureCode, SearchAttemptReport } from "./search-attempt-report.js";
import type { SearchFailureReport } from "./search-failure-report.js";
import {
  buildRecoveryBoundaryRewriteAction,
  getRecoveryBoundaryDiagnosticCode,
} from "./recovery-boundary.js";

export type AgentLoopAction = "clarify" | "search" | "narrow" | "compare" | "decide";
export type RecoveryAction = "clarify" | "rewrite" | "low_confidence_shortlist" | "stop";

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

export type RecoveryPromptKind = "anchor" | "role" | "skill" | "generic";

export interface RecoveryPolicyDecisionV2 {
  action: RecoveryAction;
  rationale: string;
  targetFailureCode?: FailureCode;
  promptKind?: RecoveryPromptKind;
}

interface ClarifyPolicyInput {
  conditions: SearchConditions;
  clarificationCount: number;
}

interface PostSearchPolicyInput<TCandidate extends ScoredCandidate = ScoredCandidate> {
  candidates: TCandidate[];
}

interface RecoveryPolicyInputV2 {
  attempt: SearchAttemptReport;
  failure: SearchFailureReport;
}

function buildRewriteRecoveryRationale(failure: SearchFailureReport): string {
  const boundaryDiagnosticCode = getRecoveryBoundaryDiagnosticCode(failure);
  const boundaryRewriteAction = buildRecoveryBoundaryRewriteAction(boundaryDiagnosticCode);
  if (boundaryRewriteAction) {
    return boundaryRewriteAction;
  }

  return "我换个更精确的搜索方式再试一轮。";
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
      rationale: "条件够用了，我先跑一轮搜索看看结果。"
    };
  }

  if (input.clarificationCount >= 1) {
    return {
      action: "search",
      rationale: "不再追问了，先搜一轮看结果，之后可以再调整。"
    };
  }

  return {
    action: "clarify",
    rationale: "我还需要确认一个关键点才能开始搜索。你最重要的一项要求是什么？",
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
      rationale: "有几位比较合适的候选人，我帮你放在一起对比看看。",
      targets
    };
  }

  if (input.candidates.length === 1) {
    return {
      action: "narrow",
      rationale: "目前只找到 1 位候选人，还不够做对比。你可以试试放宽条件或换方向。",
      targets
    };
  }

  return {
    action: "narrow",
    rationale: "当前结果还不够强，先看看 shortlist，你可以用 refine 调整方向。",
    targets
  };
}

export function decideRecoveryActionV2(input: RecoveryPolicyInputV2): RecoveryPolicyDecisionV2 {
  const primary = input.failure.summary.primaryFailureCode;
  const exhausted = input.failure.summary.terminalFailureCodes.includes("recovery_budget_exhausted");
  const clarifyAvailable =
    input.attempt.history.budget.clarifyUsed < input.attempt.history.budget.clarifyLimit;
  const rewriteAvailable =
    input.attempt.history.budget.rewriteUsed < input.attempt.history.budget.rewriteLimit;

  const fallbackDecision = (): RecoveryPolicyDecisionV2 => {
    if (input.attempt.outcome.lowConfidenceShortlistPossible) {
      return {
        action: "low_confidence_shortlist",
        rationale: exhausted
          ? "我已经试了几轮，但结果还不够稳。先给你一份可以参考的候选人，但我不建议直接推荐。"
          : "当前结果还不够稳，先给你一份可以参考的候选人。"
      };
    }

    return {
      action: "stop",
      rationale: exhausted
        ? "我试了几轮都没找到足够合适的候选人。你可以换个方向试试，或者告诉我更具体的需求。"
        : "当前没有找到足够合适的候选人。你可以试试放宽条件或换一个方向。"
    };
  };

  if (exhausted) {
    return fallbackDecision();
  }

  switch (primary) {
    case "intent_anchor_missing":
      if (!clarifyAvailable) {
        return rewriteAvailable
          ? {
              action: "rewrite",
              rationale: "你提到的那位参照人我找不到匹配。我换个搜索方式再试一轮。",
              targetFailureCode: primary
            }
          : fallbackDecision();
      }
      return {
        action: "clarify",
        rationale: "你提到的那位参照人我找不到匹配。能换一个人名，或者直接描述你想找什么样的人吗？",
        targetFailureCode: primary,
        promptKind: "anchor"
      };
    case "intent_missing_role_axis":
      if (!clarifyAvailable) {
        return rewriteAvailable
          ? {
              action: "rewrite",
              rationale: "我还没搞清楚你要找什么角色。我先按当前理解搜一轮，你再调整。",
              targetFailureCode: primary
            }
          : fallbackDecision();
      }
      return {
        action: "clarify",
        rationale: "我还不知道你想找哪类人——比如后端、算法、前端？补一句角色方向我再搜。",
        targetFailureCode: primary,
        promptKind: "role"
      };
    case "intent_missing_skill_axis":
      if (!clarifyAvailable) {
        return rewriteAvailable
          ? {
              action: "rewrite",
              rationale: "我还没搞清楚你最看重什么技术。我先按当前理解搜一轮，你再调整。",
              targetFailureCode: primary
            }
          : fallbackDecision();
      }
      return {
        action: "clarify",
        rationale: "我还不知道你最看重什么技术或方向。补一句关键词，比如 CUDA / RAG / 搜索工程？",
        targetFailureCode: primary,
        promptKind: "skill"
      };
    case "condition_mismatch_dominant":
    case "filter_too_strict":
    case "retrieval_zero_hits":
    case "retrieval_all_weak":
      if (!rewriteAvailable) {
        return fallbackDecision();
      }
      return {
        action: "rewrite",
        rationale: buildRewriteRecoveryRationale(input.failure),
        targetFailureCode: primary
      };
    default:
      return fallbackDecision();
  }
}
