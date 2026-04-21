import type {
  MatchStrength,
  ScoredCandidate,
  SearchConditions
} from "./types.js";
import type { FailureCode, SearchAttemptReport } from "./search-attempt-report.js";
import type { SearchFailureReport } from "./search-failure-report.js";

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

function hasDiagnosticFailure(
  failure: SearchFailureReport,
  code: FailureCode
): boolean {
  return failure.summary.diagnosticFailures.includes(code);
}

function buildRewriteRecoveryRationale(failure: SearchFailureReport): string {
  if (hasDiagnosticFailure(failure, "source_coverage_gap")) {
    return "这轮也可能碰到数据覆盖边界，我先自动收敛检索表达再试一轮。";
  }

  if (hasDiagnosticFailure(failure, "query_too_broad")) {
    return "目标已经基本清楚，但当前检索表达偏宽，我先自动收敛检索表达再试一轮。";
  }

  if (hasDiagnosticFailure(failure, "source_bias_conflict")) {
    return "目标已经基本清楚，但来源偏好可能压掉了可召回结果，我先自动收敛检索表达再试一轮。";
  }

  return "目标已经基本清楚，先自动收敛检索表达再试一轮。";
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
          ? "recovery 预算已用完，但还有可供低置信参考的候选人。"
          : "当前主恢复动作已用完，先给低置信 shortlist 作为 fallback。"
      };
    }

    return {
      action: "stop",
      rationale: exhausted
        ? "recovery 预算已用完，且当前没有可用 fallback。"
        : "当前主恢复动作已用完，且没有可用 fallback。"
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
              rationale: "参照锚点澄清机会已用完，先自动收敛检索表达再试一轮。",
              targetFailureCode: primary
            }
          : fallbackDecision();
      }
      return {
        action: "clarify",
        rationale: "当前参照人失效，先换一个参照人或直接描述目标更稳。",
        targetFailureCode: primary,
        promptKind: "anchor"
      };
    case "intent_missing_role_axis":
      if (!clarifyAvailable) {
        return rewriteAvailable
          ? {
              action: "rewrite",
              rationale: "角色澄清机会已用完，先自动收敛检索表达再试一轮。",
              targetFailureCode: primary
            }
          : fallbackDecision();
      }
      return {
        action: "clarify",
        rationale: "当前缺少角色主轴，先补角色方向再重试。",
        targetFailureCode: primary,
        promptKind: "role"
      };
    case "intent_missing_skill_axis":
      if (!clarifyAvailable) {
        return rewriteAvailable
          ? {
              action: "rewrite",
              rationale: "技能澄清机会已用完，先自动收敛检索表达再试一轮。",
              targetFailureCode: primary
            }
          : fallbackDecision();
      }
      return {
        action: "clarify",
        rationale: "当前缺少技能主轴，先补关键技能或方向再重试。",
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
