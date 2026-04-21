import type { FailureCode } from "./search-attempt-report.js";
import type { SearchFailureReport } from "./search-failure-report.js";
import type { SearchConditions } from "./types.js";

export type RecoveryBoundaryDiagnosticCode = Extract<
  FailureCode,
  "source_coverage_gap" | "query_too_broad" | "source_bias_conflict"
>;

interface RecoveryBoundaryGuidance {
  explanation: string;
  rewriteAction: string;
  buildRefinePrompt: (conditions: SearchConditions) => string;
}

const RECOVERY_BOUNDARY_PRIORITY: readonly RecoveryBoundaryDiagnosticCode[] = [
  "source_coverage_gap",
  "query_too_broad",
  "source_bias_conflict",
];

const RECOVERY_BOUNDARY_GUIDANCE: Record<
  RecoveryBoundaryDiagnosticCode,
  RecoveryBoundaryGuidance
> = {
  source_coverage_gap: {
    explanation: "当前库里可能没有完全匹配的人，这不一定是搜索条件的问题。",
    rewriteAction: "我换个方式再试一轮，看看能不能拉回更合适的人。",
    buildRefinePrompt: () =>
      "当前库里可能没有完全匹配的人。想怎么调整搜索？例如：放宽地点 / 去掉 must-have / 改成更常见的角色或技能。",
  },
  query_too_broad: {
    explanation: "搜索条件偏宽，候选人分数没有拉开。",
    rewriteAction: "我帮你收紧一下再搜。",
    buildRefinePrompt: () =>
      "搜索条件偏宽，候选人分数没有拉开。补一句更硬的角色、技能或 must-have，我再重试。",
  },
  source_bias_conflict: {
    explanation: "你选的来源偏好可能过滤掉了一些合适的人。",
    rewriteAction: "我先放宽来源再试一轮。",
    buildRefinePrompt: (conditions) =>
      conditions.sourceBias
        ? `当前来源偏好可能太强。想怎么调整？例如：取消 ${conditions.sourceBias} 限制 / 保留来源但补硬技能。`
        : "来源限制可能压掉了结果。想怎么调整？例如：去掉来源限制 / 补更硬的技能约束。",
  },
};

export function getRecoveryBoundaryDiagnosticCode(
  failure: Pick<SearchFailureReport, "summary">,
): RecoveryBoundaryDiagnosticCode | undefined {
  for (const code of RECOVERY_BOUNDARY_PRIORITY) {
    if (failure.summary.diagnosticFailures.includes(code)) {
      return code;
    }
  }

  return undefined;
}

export function buildRecoveryBoundaryHint(
  code?: RecoveryBoundaryDiagnosticCode,
): string | undefined {
  return code ? RECOVERY_BOUNDARY_GUIDANCE[code].explanation : undefined;
}

export function buildRecoveryBoundaryRewriteAction(
  code?: RecoveryBoundaryDiagnosticCode,
): string | undefined {
  return code ? RECOVERY_BOUNDARY_GUIDANCE[code].rewriteAction : undefined;
}

export function buildRecoveryBoundaryRefinePrompt(
  code: RecoveryBoundaryDiagnosticCode | undefined,
  conditions: SearchConditions,
): string | undefined {
  return code ? RECOVERY_BOUNDARY_GUIDANCE[code].buildRefinePrompt(conditions) : undefined;
}
