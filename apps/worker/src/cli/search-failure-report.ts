import type {
  FailureCode,
  ObservationConfidence,
  ObservationStatus,
  SearchAttemptReport,
} from "./search-attempt-report.js";

export type FailureReportVersion = "search-failure-report/v0.1";
export type FailureLayer = "intent" | "retrieval" | "ranking" | "evidence" | "constraints" | "recovery";
export type FailureDisposition = "actionable" | "diagnostic" | "terminal";
export type FailureSeverity = "blocking" | "degrading" | "informational";
export type FailureConfidence = "high" | "medium" | "low";

export interface IntentAxisMissingBasis {
  kind: "intent_axis_missing";
  axis: "role" | "skill";
  signalCount: number;
  axisStatus: ObservationStatus;
  axisConfidence: ObservationConfidence;
  supportingAxes: Array<"role" | "skill" | "location" | "experience" | "sourceBias" | "anchor">;
  triggerContext: {
    zeroHits: boolean;
    allWeak: boolean;
  };
}

export interface IntentAnchorMissingBasis {
  kind: "intent_anchor_missing";
  input?: {
    personId?: string;
    name?: string;
    shortlistIndex?: number;
  };
  resolutionStatus: "not_found" | "ambiguous";
  failureReason?: string;
}

export interface RetrievalZeroHitsBasis {
  kind: "retrieval_zero_hits";
  retrievedCount: 0;
  signalCount: number;
  appliedFilters: Array<"role" | "skill" | "must_have" | "location" | "source_bias" | "exclude" | "anchor">;
}

export interface FilterTooStrictBasis {
  kind: "filter_too_strict";
  dominantFilter: "role" | "skill" | "must_have" | "location" | "source_bias" | "exclude" | "unknown";
  dropoffByFilter?: Partial<Record<"role" | "skill" | "must_have" | "location" | "source_bias" | "exclude", number>>;
  unrestrictedRetrievedCount?: number;
}

export interface SourceBiasConflictBasis {
  kind: "source_bias_conflict";
  restrictedSource?: "bonjour" | "github";
  unrestrictedRetrievedCount?: number;
  dropoffByFilter?: Partial<Record<"role" | "skill" | "must_have" | "location" | "source_bias" | "exclude", number>>;
}

export interface QueryTooBroadBasis {
  kind: "query_too_broad";
  scoreDistribution: NonNullable<SearchAttemptReport["ranking"]["scoreDistribution"]>;
  matchStrengthDistribution: SearchAttemptReport["ranking"]["matchStrengthDistribution"];
  rule: {
    minCandidateCount: number;
    maxTopGap: number;
    maxScoreSpread: number;
    requireAllWeak: boolean;
  };
}

export interface SourceCoverageGapBasis {
  kind: "source_coverage_gap";
  unrestrictedRetrievedCount?: number;
  supportingSignals: string[];
  filterDropoff?: Partial<Record<"role" | "skill" | "must_have" | "location" | "source_bias" | "exclude", number>>;
}

export interface RetrievalAllWeakBasis {
  kind: "retrieval_all_weak";
  candidateCount: number;
  matchStrengthDistribution: SearchAttemptReport["ranking"]["matchStrengthDistribution"];
}

export interface ConditionMismatchBasis {
  kind: "condition_mismatch_dominant";
  auditedCandidateCount: number;
  conditionAuditSummary: NonNullable<SearchAttemptReport["constraints"]["conditionAuditSummary"]>;
  dominantUnmetLabels?: string[];
  rule: {
    minMetCount: number;
    minMetRatio: number;
  };
}

export interface EvidenceTooSparseBasis {
  kind: "evidence_too_sparse";
  queryReasonStats: SearchAttemptReport["evidence"]["queryReasonStats"];
  matchStrengthDistribution: SearchAttemptReport["ranking"]["matchStrengthDistribution"];
  rule: {
    queryReasonThreshold: number;
    requireAllWeak: boolean;
  };
}

export interface RecoveryBudgetExhaustedBasis {
  kind: "recovery_budget_exhausted";
  clarifyUsed: number;
  clarifyLimit: number;
  rewriteUsed: number;
  rewriteLimit: number;
}

export type FailureBasis =
  | IntentAxisMissingBasis
  | IntentAnchorMissingBasis
  | RetrievalZeroHitsBasis
  | FilterTooStrictBasis
  | SourceBiasConflictBasis
  | QueryTooBroadBasis
  | SourceCoverageGapBasis
  | RetrievalAllWeakBasis
  | ConditionMismatchBasis
  | EvidenceTooSparseBasis
  | RecoveryBudgetExhaustedBasis;

export interface SearchFailure {
  code: FailureCode;
  layer: FailureLayer;
  disposition: FailureDisposition;
  severity: FailureSeverity;
  confidence: FailureConfidence;
  rationale: string;
  userMessage: string;
  basis: FailureBasis;
  signalRefs: string[];
  ruleId: string;
}

export interface SearchFailureReport {
  version: FailureReportVersion;
  meta: {
    sessionId: string;
    attemptId: string;
    parentAttemptId?: string;
    generatedAt: string;
  };
  summary: {
    primaryFailureCode?: FailureCode;
    terminalFailureCodes: FailureCode[];
    actionableFailures: FailureCode[];
    diagnosticFailures: FailureCode[];
  };
  failures: SearchFailure[];
  builderTrace: {
    matchedRules: string[];
    suppressedRules: string[];
    primarySelectionReason?: string;
  };
}

export interface SearchFailureRuleConfig {
  primaryPriority: FailureCode[];
}

export interface BuildSearchFailureReportInput {
  attempt: SearchAttemptReport;
  generatedAt?: Date;
}

export interface LegacyRecoveryAssessment {
  usable: boolean;
  diagnosis?: "intent_missing" | "retrieval_failed";
  rationale?: string;
  weakCandidateCount: number;
  canEmitLowConfidenceShortlist: boolean;
}

const DEFAULT_PRIMARY_PRIORITY: FailureCode[] = [
  "intent_anchor_missing",
  "intent_missing_role_axis",
  "intent_missing_skill_axis",
  "filter_too_strict",
  "condition_mismatch_dominant",
  "retrieval_zero_hits",
  "retrieval_all_weak",
];

function getSupportingAxes(attempt: SearchAttemptReport): IntentAxisMissingBasis["supportingAxes"] {
  return (["role", "skill", "location", "experience", "sourceBias", "anchor"] as const).filter(
    (axis) => attempt.intent.axes[axis].status === "present",
  );
}

function getAppliedFilters(attempt: SearchAttemptReport): RetrievalZeroHitsBasis["appliedFilters"] {
  const filters: RetrievalZeroHitsBasis["appliedFilters"] = [];
  if (attempt.request.conditions.role) {
    filters.push("role");
  }
  if (attempt.request.conditions.skills.length > 0) {
    filters.push("skill");
  }
  if (attempt.request.conditions.mustHave.length > 0) {
    filters.push("must_have");
  }
  if (attempt.request.conditions.locations.length > 0) {
    filters.push("location");
  }
  if (attempt.request.conditions.sourceBias) {
    filters.push("source_bias");
  }
  if (attempt.request.conditions.exclude.length > 0) {
    filters.push("exclude");
  }
  if (attempt.request.conditions.candidateAnchor?.personId || attempt.request.conditions.candidateAnchor?.name) {
    filters.push("anchor");
  }
  return filters;
}

function computeIntentAxisFailureConfidence(
  attempt: SearchAttemptReport,
  axis: "role" | "skill",
): FailureConfidence {
  const observation = attempt.intent.axes[axis];
  if (observation.confidence === "high") {
    return "high";
  }
  if (attempt.retrieval.zeroHits) {
    return "high";
  }
  return "medium";
}

function hasActionableCode(codes: FailureCode[], code: FailureCode): boolean {
  return codes.includes(code);
}

export const RULE_TRIGGERS = {
  F01: (attempt: SearchAttemptReport) =>
    attempt.intent.axes.anchor.resolution?.status === "not_found"
    || attempt.intent.axes.anchor.resolution?.status === "ambiguous",
  F02: (attempt: SearchAttemptReport) =>
    attempt.intent.axes.role.status === "missing"
    && (attempt.retrieval.zeroHits || attempt.ranking.evaluations.allWeak.value),
  F03: (attempt: SearchAttemptReport) =>
    attempt.intent.axes.skill.status === "missing"
    && (attempt.retrieval.zeroHits || attempt.ranking.evaluations.allWeak.value),
  F04: (attempt: SearchAttemptReport) =>
    attempt.retrieval.zeroHits,
  F05: (attempt: SearchAttemptReport) =>
    attempt.ranking.evaluations.allWeak.value
    && attempt.retrieval.retrievedCount > 0,
  F06: (attempt: SearchAttemptReport) =>
    attempt.constraints.evaluations.conditionMismatchDominant.value,
  F07: (attempt: SearchAttemptReport) =>
    attempt.evidence.evaluations.evidenceTooSparse.value,
  F08: (attempt: SearchAttemptReport) =>
    attempt.history.budget.exhausted,
  F09: (attempt: SearchAttemptReport) =>
    attempt.retrieval.zeroHits
    && attempt.retrieval.diagnostics.filterDropoff.status === "available"
    && Boolean(attempt.retrieval.diagnostics.filterDropoff.dropoffByFilter)
    && Object.values(attempt.retrieval.diagnostics.filterDropoff.dropoffByFilter ?? {}).some((count) => (count ?? 0) > 0),
  F10: (attempt: SearchAttemptReport) =>
    Boolean(attempt.request.conditions.sourceBias)
    && attempt.retrieval.diagnostics.sourceCounterfactual.status === "available"
    && (attempt.retrieval.diagnostics.sourceCounterfactual.unrestrictedRetrievedCount ?? 0) > 0
    && attempt.retrieval.diagnostics.filterDropoff.status === "available"
    && attempt.retrieval.diagnostics.filterDropoff.dominantFilter === "source_bias",
  F11: (attempt: SearchAttemptReport) =>
    attempt.ranking.evaluations.allWeak.value
    && attempt.retrieval.retrievedCount >= 3
    && Boolean(attempt.ranking.scoreDistribution)
    && (attempt.ranking.scoreDistribution?.gap ?? Number.POSITIVE_INFINITY) <= 0.03
    && ((attempt.ranking.scoreDistribution?.max ?? 0) - (attempt.ranking.scoreDistribution?.min ?? 0)) <= 0.08,
  F12: (attempt: SearchAttemptReport) =>
    attempt.retrieval.zeroHits
    && attempt.retrieval.diagnostics.corpusCoverage.status === "available"
    && attempt.retrieval.diagnostics.corpusCoverage.suspectedGap === true,
} as const;

function selectPrimaryFailureCode(
  actionableCodes: FailureCode[],
  priority: FailureCode[],
): { code?: FailureCode; reason?: string } {
  if (hasActionableCode(actionableCodes, "intent_anchor_missing")) {
    return {
      code: "intent_anchor_missing",
      reason: "anchor resolution failure overrides downstream retrieval symptoms",
    };
  }

  if (
    hasActionableCode(actionableCodes, "intent_missing_role_axis")
    && hasActionableCode(actionableCodes, "intent_missing_skill_axis")
  ) {
    return {
      code: "intent_missing_role_axis",
      reason: "role and skill axes are both missing; role is treated as the tighter primary intent axis",
    };
  }

  for (const code of priority) {
    if (hasActionableCode(actionableCodes, code)) {
      return {
        code,
        reason: `selected by primary priority order: ${code}`,
      };
    }
  }

  return {};
}

export function buildSearchFailureReport(
  input: BuildSearchFailureReportInput,
  config: Partial<SearchFailureRuleConfig> = {},
): SearchFailureReport {
  const priority = config.primaryPriority ?? DEFAULT_PRIMARY_PRIORITY;
  const { attempt } = input;
  const failures: SearchFailure[] = [];
  const matchedRules: string[] = [];

  if (RULE_TRIGGERS.F01(attempt)) {
    matchedRules.push("F01");
    failures.push({
      code: "intent_anchor_missing",
      layer: "intent",
      disposition: "actionable",
      severity: "blocking",
      confidence: "high",
      rationale: "当前参照锚点无法解析成可用候选，必须先修复参照对象。",
      userMessage: "你给的参照人我没能识别出来，换一个参照人或直接描述目标更稳。",
      basis: {
        kind: "intent_anchor_missing",
        input: attempt.intent.axes.anchor.input,
        resolutionStatus: attempt.intent.axes.anchor.resolution?.status as "not_found" | "ambiguous",
        failureReason: attempt.intent.axes.anchor.resolution?.failureReason,
      },
      signalRefs: [
        "intent.axes.anchor.input",
        "intent.axes.anchor.resolution.status",
      ],
      ruleId: "F01",
    });
  }

  if (RULE_TRIGGERS.F02(attempt)) {
    matchedRules.push("F02");
    failures.push({
      code: "intent_missing_role_axis",
      layer: "intent",
      disposition: "actionable",
      severity: "blocking",
      confidence: computeIntentAxisFailureConfidence(attempt, "role"),
      rationale: "当前缺少角色主轴，系统不知道该找工程师、研究员还是负责人。",
      userMessage: "补一句你最想找的是哪类人，会比继续盲搜更稳。",
      basis: {
        kind: "intent_axis_missing",
        axis: "role",
        signalCount: attempt.intent.signalCount,
        axisStatus: attempt.intent.axes.role.status,
        axisConfidence: attempt.intent.axes.role.confidence,
        supportingAxes: getSupportingAxes(attempt),
        triggerContext: {
          zeroHits: attempt.retrieval.zeroHits,
          allWeak: attempt.ranking.evaluations.allWeak.value,
        },
      },
      signalRefs: ["intent.axes.role", "retrieval.zeroHits", "ranking.evaluations.allWeak"],
      ruleId: "F02",
    });
  }

  if (RULE_TRIGGERS.F03(attempt)) {
    matchedRules.push("F03");
    failures.push({
      code: "intent_missing_skill_axis",
      layer: "intent",
      disposition: "actionable",
      severity: "blocking",
      confidence: computeIntentAxisFailureConfidence(attempt, "skill"),
      rationale: "当前缺少技能或领域主轴，系统不知道该收紧到哪类能力。",
      userMessage: "补一句你最不能妥协的技术或方向，结果会更准。",
      basis: {
        kind: "intent_axis_missing",
        axis: "skill",
        signalCount: attempt.intent.signalCount,
        axisStatus: attempt.intent.axes.skill.status,
        axisConfidence: attempt.intent.axes.skill.confidence,
        supportingAxes: getSupportingAxes(attempt),
        triggerContext: {
          zeroHits: attempt.retrieval.zeroHits,
          allWeak: attempt.ranking.evaluations.allWeak.value,
        },
      },
      signalRefs: ["intent.axes.skill", "retrieval.zeroHits", "ranking.evaluations.allWeak"],
      ruleId: "F03",
    });
  }

  if (RULE_TRIGGERS.F04(attempt)) {
    matchedRules.push("F04");
    failures.push({
      code: "retrieval_zero_hits",
      layer: "retrieval",
      disposition: "actionable",
      severity: "blocking",
      confidence: "high",
      rationale: "这轮检索没有带回任何候选人。",
      userMessage: "这轮没有搜到人，我会优先尝试改写检索表达。",
      basis: {
        kind: "retrieval_zero_hits",
        retrievedCount: 0,
        signalCount: attempt.intent.signalCount,
        appliedFilters: getAppliedFilters(attempt),
      },
      signalRefs: ["retrieval.zeroHits", "retrieval.filters", "intent.signalCount"],
      ruleId: "F04",
    });
  }

  if (RULE_TRIGGERS.F09(attempt)) {
    matchedRules.push("F09");
    failures.push({
      code: "filter_too_strict",
      layer: "retrieval",
      disposition: "actionable",
      severity: "blocking",
      confidence: "high",
      rationale: "不是完全搜不到，而是召回后的硬过滤把候选人基本都掐掉了。",
      userMessage: "当前过滤条件太严，我会优先收敛或放宽过滤相关表达再试。",
      basis: {
        kind: "filter_too_strict",
        dominantFilter: attempt.retrieval.diagnostics.filterDropoff.dominantFilter ?? "unknown",
        dropoffByFilter: attempt.retrieval.diagnostics.filterDropoff.dropoffByFilter,
        unrestrictedRetrievedCount:
          attempt.retrieval.diagnostics.sourceCounterfactual.unrestrictedRetrievedCount,
      },
      signalRefs: [
        "retrieval.zeroHits",
        "retrieval.diagnostics.filterDropoff",
        "retrieval.diagnostics.sourceCounterfactual",
      ],
      ruleId: "F09",
    });
  }

  if (RULE_TRIGGERS.F10(attempt)) {
    matchedRules.push("F10");
    failures.push({
      code: "source_bias_conflict",
      layer: "retrieval",
      disposition: "diagnostic",
      severity: "informational",
      confidence: "medium",
      rationale: "sourceBias 与当前召回现实发生冲突，不加来源限制时其实能召回到候选人。",
      userMessage: "来源偏好可能正在压掉原本可召回的人，这条信息先作为诊断提示。",
      basis: {
        kind: "source_bias_conflict",
        restrictedSource: attempt.retrieval.diagnostics.sourceCounterfactual.restrictedSource,
        unrestrictedRetrievedCount:
          attempt.retrieval.diagnostics.sourceCounterfactual.unrestrictedRetrievedCount,
        dropoffByFilter: attempt.retrieval.diagnostics.filterDropoff.dropoffByFilter,
      },
      signalRefs: [
        "request.conditions.sourceBias",
        "retrieval.diagnostics.sourceCounterfactual",
        "retrieval.diagnostics.filterDropoff",
      ],
      ruleId: "F10",
    });
  }

  if (RULE_TRIGGERS.F11(attempt) && attempt.ranking.scoreDistribution) {
    matchedRules.push("F11");
    failures.push({
      code: "query_too_broad",
      layer: "ranking",
      disposition: "diagnostic",
      severity: "informational",
      confidence: "medium",
      rationale: "这轮候选人的分数分布过平，像是查询表达太宽，没能拉开真正相关的人。",
      userMessage: "当前检索表达可能过宽，这条先作为诊断提示，不直接抢恢复动作。",
      basis: {
        kind: "query_too_broad",
        scoreDistribution: attempt.ranking.scoreDistribution,
        matchStrengthDistribution: attempt.ranking.matchStrengthDistribution,
        rule: {
          minCandidateCount: 3,
          maxTopGap: 0.03,
          maxScoreSpread: 0.08,
          requireAllWeak: true,
        },
      },
      signalRefs: [
        "ranking.scoreDistribution",
        "ranking.matchStrengthDistribution",
        "ranking.evaluations.allWeak",
      ],
      ruleId: "F11",
    });
  }

  if (RULE_TRIGGERS.F12(attempt)) {
    matchedRules.push("F12");
    failures.push({
      code: "source_coverage_gap",
      layer: "retrieval",
      disposition: "diagnostic",
      severity: "informational",
      confidence: "medium",
      rationale: "这轮更像是语料覆盖边界而不是单纯搜偏了，当前数据里可能就没有可用候选。",
      userMessage: "这轮结果可能碰到了数据覆盖边界，这条先作为诊断提示。",
      basis: {
        kind: "source_coverage_gap",
        unrestrictedRetrievedCount:
          attempt.retrieval.diagnostics.sourceCounterfactual.unrestrictedRetrievedCount,
        supportingSignals: attempt.retrieval.diagnostics.corpusCoverage.supportingSignals ?? [],
        filterDropoff: attempt.retrieval.diagnostics.filterDropoff.dropoffByFilter,
      },
      signalRefs: [
        "retrieval.zeroHits",
        "retrieval.diagnostics.corpusCoverage",
        "retrieval.diagnostics.sourceCounterfactual",
        "retrieval.diagnostics.filterDropoff",
      ],
      ruleId: "F12",
    });
  }

  if (RULE_TRIGGERS.F05(attempt)) {
    matchedRules.push("F05");
    failures.push({
      code: "retrieval_all_weak",
      layer: "retrieval",
      disposition: "actionable",
      severity: "degrading",
      confidence: "high",
      rationale: "当前召回到的人都偏弱，还不够支撑直接推荐。",
      userMessage: "这轮搜到了一些人，但整体都偏弱，我会先收敛搜索再试。",
      basis: {
        kind: "retrieval_all_weak",
        candidateCount: attempt.retrieval.retrievedCount,
        matchStrengthDistribution: attempt.ranking.matchStrengthDistribution,
      },
      signalRefs: ["ranking.evaluations.allWeak", "ranking.matchStrengthDistribution"],
      ruleId: "F05",
    });
  }

  if (RULE_TRIGGERS.F06(attempt)) {
    matchedRules.push("F06");
    failures.push({
      code: "condition_mismatch_dominant",
      layer: "constraints",
      disposition: "actionable",
      severity: "blocking",
      confidence: "high",
      rationale: "候选人整体对关键条件满足度太低，问题更像约束失配而不是单纯弱召回。",
      userMessage: "这批人的关键条件满足度太低，我会优先调整检索表达。",
      basis: {
        kind: "condition_mismatch_dominant",
        auditedCandidateCount: attempt.constraints.auditedCandidateCount,
        conditionAuditSummary: attempt.constraints.conditionAuditSummary ?? {
          total: 0,
          met: 0,
          unmet: 0,
          unknown: 0,
        },
        dominantUnmetLabels: attempt.constraints.dominantUnmetLabels,
        rule: attempt.constraints.evaluations.conditionMismatchDominant.basis.rule,
      },
      signalRefs: [
        "constraints.auditedCandidateCount",
        "constraints.conditionAuditSummary",
        "constraints.evaluations.conditionMismatchDominant",
      ],
      ruleId: "F06",
    });
  }

  if (RULE_TRIGGERS.F07(attempt)) {
    matchedRules.push("F07");
    failures.push({
      code: "evidence_too_sparse",
      layer: "evidence",
      disposition: "diagnostic",
      severity: "informational",
      confidence: "medium",
      rationale: "当前 query reasons 太稀，更多是证据层的解释信息，不单独驱动恢复动作。",
      userMessage: "这轮证据偏稀，只能作为辅助诊断，不单独决定下一步动作。",
      basis: {
        kind: "evidence_too_sparse",
        queryReasonStats: attempt.evidence.queryReasonStats,
        matchStrengthDistribution: attempt.ranking.matchStrengthDistribution,
        rule: {
          queryReasonThreshold: attempt.evidence.evaluations.evidenceTooSparse.basis.queryReasonThreshold,
          requireAllWeak: attempt.evidence.evaluations.evidenceTooSparse.basis.requireAllWeak,
        },
      },
      signalRefs: ["evidence.queryReasonStats", "evidence.evaluations.evidenceTooSparse"],
      ruleId: "F07",
    });
  }

  if (RULE_TRIGGERS.F08(attempt)) {
    matchedRules.push("F08");
    failures.push({
      code: "recovery_budget_exhausted",
      layer: "recovery",
      disposition: "terminal",
      severity: "blocking",
      confidence: "high",
      rationale: "这轮 recovery 预算已经用完，不能再无限继续重试。",
      userMessage: "我已经把这轮恢复机会用完了，只能停下或给低置信 fallback。",
      basis: {
        kind: "recovery_budget_exhausted",
        clarifyUsed: attempt.history.budget.clarifyUsed,
        clarifyLimit: attempt.history.budget.clarifyLimit,
        rewriteUsed: attempt.history.budget.rewriteUsed,
        rewriteLimit: attempt.history.budget.rewriteLimit,
      },
      signalRefs: ["history.budget"],
      ruleId: "F08",
    });
  }

  const actionableCodes = failures
    .filter((failure) => failure.disposition === "actionable")
    .map((failure) => failure.code);
  const { code: primaryFailureCode, reason: primarySelectionReason } = selectPrimaryFailureCode(
    actionableCodes,
    priority,
  );
  const suppressedRules = failures
    .filter((failure) => failure.disposition === "actionable" && failure.code !== primaryFailureCode)
    .map((failure) => failure.ruleId);

  return {
    version: "search-failure-report/v0.1",
    meta: {
      sessionId: attempt.meta.sessionId,
      attemptId: attempt.meta.attemptId,
      parentAttemptId: attempt.meta.parentAttemptId,
      generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    },
    summary: {
      primaryFailureCode,
      terminalFailureCodes: failures
        .filter((failure) => failure.disposition === "terminal")
        .map((failure) => failure.code),
      actionableFailures: failures
        .filter((failure) => failure.disposition === "actionable")
        .map((failure) => failure.code),
      diagnosticFailures: failures
        .filter((failure) => failure.disposition === "diagnostic")
        .map((failure) => failure.code),
    },
    failures,
    builderTrace: {
      matchedRules,
      suppressedRules,
      primarySelectionReason,
    },
  };
}

export function toLegacyRecoveryAssessment(
  attempt: SearchAttemptReport,
  failure: SearchFailureReport,
): LegacyRecoveryAssessment {
  if (attempt.outcome.usable) {
    return {
      usable: true,
      weakCandidateCount: attempt.ranking.matchStrengthDistribution.weak,
      canEmitLowConfidenceShortlist: false,
    };
  }

  const primaryFailure = failure.failures.find(
    (item) => item.code === failure.summary.primaryFailureCode,
  );
  const diagnosis = primaryFailure?.code.startsWith("intent_")
    ? "intent_missing"
    : "retrieval_failed";

  return {
    usable: false,
    diagnosis,
    rationale: primaryFailure?.rationale,
    weakCandidateCount: attempt.ranking.matchStrengthDistribution.weak,
    canEmitLowConfidenceShortlist: attempt.outcome.lowConfidenceShortlistPossible,
  };
}
