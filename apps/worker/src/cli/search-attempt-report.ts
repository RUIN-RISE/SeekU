import type {
  ConditionAuditItem,
  MatchStrength,
  ScoredCandidate,
  SearchConditions,
} from "./types.js";

export type FailureCode =
  | "intent_anchor_missing"
  | "intent_missing_role_axis"
  | "intent_missing_skill_axis"
  | "filter_too_strict"
  | "source_bias_conflict"
  | "query_too_broad"
  | "source_coverage_gap"
  | "retrieval_zero_hits"
  | "retrieval_all_weak"
  | "condition_mismatch_dominant"
  | "evidence_too_sparse"
  | "recovery_budget_exhausted";

export type AttemptTrigger =
  | "initial_search"
  | "post_clarification"
  | "post_rewrite"
  | "manual_refine"
  | "system_retry";

export type ObservationStatus =
  | "present"
  | "missing"
  | "weak"
  | "unresolved"
  | "conflicted"
  | "unavailable";

export type ObservationConfidence = "high" | "medium" | "low";

export interface AxisObservation {
  status: ObservationStatus;
  confidence: ObservationConfidence;
  evidence: string[];
}

export interface AnchorObservation extends AxisObservation {
  input?: {
    personId?: string;
    name?: string;
    shortlistIndex?: number;
  };
  resolution?: {
    status: "resolved" | "not_found" | "ambiguous" | "not_attempted";
    resolvedPersonId?: string;
    failureReason?: string;
  };
}

export interface MatchStrengthDistribution {
  weak: number;
  medium: number;
  strong: number;
  unknown: number;
}

export interface ScoreDistribution {
  min: number;
  max: number;
  median: number;
  top3Avg: number;
  gap: number;
}

export interface QueryReasonStats {
  min: number;
  max: number;
  avg: number;
  candidatesAtOrBelow1: number;
  allAtOrBelow1: boolean;
}

export interface ConditionAuditSummary {
  total: number;
  met: number;
  unmet: number;
  unknown: number;
}

export interface RecoveryBudgetSnapshot {
  clarifyUsed: number;
  clarifyLimit: number;
  rewriteUsed: number;
  rewriteLimit: number;
  exhausted: boolean;
}

export interface AllWeakEvaluationBasis {
  threshold: string;
  candidateCount: number;
  matchStrengthDistribution: MatchStrengthDistribution;
}

export interface EvidenceTooSparseEvaluationBasis {
  queryReasonThreshold: number;
  candidatesAtOrBelowThreshold: number;
  totalCandidates: number;
  avgQueryReasonCount: number;
  requireAllWeak: boolean;
  allWeak: boolean;
}

export interface ConditionMismatchEvaluationBasis {
  auditedCandidateCount: number;
  conditionAuditSummary: ConditionAuditSummary;
  dominantUnmetLabels?: string[];
  rule: {
    minMetCount: number;
    minMetRatio: number;
  };
}

export interface BooleanEvaluation<TBasis> {
  value: boolean;
  confidence: ObservationConfidence;
  basis: TBasis;
}

export interface SearchAttemptRuleConfig {
  conditionMismatch: {
    minMetCount: number;
    minMetRatio: number;
  };
  evidenceTooSparse: {
    queryReasonThreshold: number;
    requireAllWeak: boolean;
  };
}

export interface SearchAttemptCandidate
  extends Pick<
    ScoredCandidate,
    "personId" | "name" | "matchScore" | "matchStrength" | "queryReasons" | "conditionAudit" | "sources"
  > {}

export interface BuildSearchAttemptReportInput {
  sessionId: string;
  attemptId: string;
  parentAttemptId?: string;
  attemptOrdinal: number;
  trigger: AttemptTrigger;
  startedAt: Date;
  completedAt: Date;
  rawUserGoal?: string;
  inputReceivedAt?: Date;
  effectiveQuery: string;
  rewrittenFromQuery?: string;
  conditions: SearchConditions;
  candidates: ReadonlyArray<SearchAttemptCandidate>;
  recoveryState: {
    clarificationCount: number;
    rewriteCount: number;
  };
  previousFailureCodes: FailureCode[];
  limits: {
    clarifyLimit: number;
    rewriteLimit: number;
  };
  anchorResolution?: {
    status: "resolved" | "not_found" | "ambiguous" | "not_attempted";
    resolvedPersonId?: string;
    failureReason?: string;
  };
  retrievalDiagnostics?: {
    filterDropoff?: {
      status: "available" | "unavailable";
      dominantFilter?: "role" | "skill" | "must_have" | "location" | "source_bias" | "exclude" | "unknown";
      dropoffByFilter?: Partial<Record<"role" | "skill" | "must_have" | "location" | "source_bias" | "exclude", number>>;
    };
    sourceCounterfactual?: {
      status: "available" | "unavailable";
      restrictedSource?: "bonjour" | "github";
      unrestrictedRetrievedCount?: number;
    };
    corpusCoverage?: {
      status: "available" | "unavailable";
      suspectedGap: boolean;
      supportingSignals: string[];
    };
  };
}

export interface SearchAttemptReport {
  version: "search-attempt-report/v0.1";
  meta: {
    sessionId: string;
    attemptId: string;
    parentAttemptId?: string;
    attemptOrdinal: number;
    trigger: AttemptTrigger;
    startedAt: string;
    completedAt: string;
  };
  request: {
    rawUserGoal?: string;
    inputReceivedAt?: string;
    effectiveQuery: string;
    rewrittenFromQuery?: string;
    conditions: SearchConditions;
  };
  history: {
    previousFailureCodes: FailureCode[];
    clarificationCount: number;
    rewriteCount: number;
    budget: RecoveryBudgetSnapshot;
  };
  intent: {
    signalCount: number;
    axes: {
      role: AxisObservation;
      skill: AxisObservation;
      location: AxisObservation;
      experience: AxisObservation;
      sourceBias: AxisObservation;
      anchor: AnchorObservation;
    };
  };
  retrieval: {
    requestedLimit: number;
    retrievedCount: number;
    zeroHits: boolean;
    filters: {
      role?: string;
      skills: string[];
      mustHave: string[];
      niceToHave: string[];
      locations: string[];
      exclude: string[];
      sourceBias?: "bonjour" | "github";
    };
    diagnostics: {
      filterDropoff: {
        status: "available" | "unavailable";
        dominantFilter?: "role" | "skill" | "must_have" | "location" | "source_bias" | "exclude" | "unknown";
        dropoffByFilter?: Partial<Record<"role" | "skill" | "must_have" | "location" | "source_bias" | "exclude", number>>;
      };
      corpusCoverage: {
        status: "available" | "unavailable";
        suspectedGap?: boolean;
        supportingSignals?: string[];
      };
      sourceCounterfactual: {
        status: "available" | "unavailable";
        restrictedSource?: "bonjour" | "github";
        unrestrictedRetrievedCount?: number;
      };
    };
  };
  ranking: {
    rerankedCount: number;
    topCandidate?: {
      personId: string;
      score: number;
      matchStrength?: MatchStrength;
    };
    matchStrengthDistribution: MatchStrengthDistribution;
    scoreDistribution?: ScoreDistribution;
    evaluations: {
      allWeak: BooleanEvaluation<AllWeakEvaluationBasis>;
    };
  };
  evidence: {
    queryReasonStats: QueryReasonStats;
    sourceEvidenceStats: {
      singleSourceCandidates: number;
      multiSourceCandidates: number;
    };
    evaluations: {
      evidenceTooSparse: BooleanEvaluation<EvidenceTooSparseEvaluationBasis>;
    };
  };
  constraints: {
    auditedCandidateCount: number;
    conditionAuditSummary?: ConditionAuditSummary;
    dominantUnmetLabels?: string[];
    evaluations: {
      conditionMismatchDominant: BooleanEvaluation<ConditionMismatchEvaluationBasis>;
    };
  };
  outcome: {
    usable: boolean;
    lowConfidenceShortlistPossible: boolean;
    shortlistedCandidateCount: number;
  };
}

const DEFAULT_CONFIG: SearchAttemptRuleConfig = {
  conditionMismatch: {
    minMetCount: 1,
    minMetRatio: 1 / 3,
  },
  evidenceTooSparse: {
    queryReasonThreshold: 1,
    requireAllWeak: true,
  },
};

function toIsoString(value?: Date): string | undefined {
  return value?.toISOString();
}

function cloneConditions(conditions: SearchConditions): SearchConditions {
  return {
    ...conditions,
    skills: [...conditions.skills],
    locations: [...conditions.locations],
    mustHave: [...conditions.mustHave],
    niceToHave: [...conditions.niceToHave],
    exclude: [...conditions.exclude],
    candidateAnchor: conditions.candidateAnchor
      ? { ...conditions.candidateAnchor }
      : undefined,
  };
}

function countTruthy(values: unknown[]): number {
  return values.filter(Boolean).length;
}

function summarizeStringEvidence(values: Array<string | undefined>): string[] {
  return values
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());
}

function createAxisObservation(values: string[]): AxisObservation {
  return values.length > 0
    ? {
        status: "present",
        confidence: "high",
        evidence: values,
      }
    : {
        status: "missing",
        confidence: "high",
        evidence: [],
      };
}

function createAnchorObservation(
  conditions: SearchConditions,
  resolution?: BuildSearchAttemptReportInput["anchorResolution"],
): AnchorObservation {
  const anchor = conditions.candidateAnchor;
  const hasAnchor = Boolean(anchor?.personId || anchor?.name || anchor?.shortlistIndex !== undefined);

  return {
    status: hasAnchor ? "present" : "missing",
    confidence: "high",
    evidence: summarizeStringEvidence([
      anchor?.personId ? `personId:${anchor.personId}` : undefined,
      anchor?.name ? `name:${anchor.name}` : undefined,
      anchor?.shortlistIndex !== undefined ? `shortlistIndex:${anchor.shortlistIndex}` : undefined,
    ]),
    input: anchor ? { ...anchor } : undefined,
    resolution: resolution ? { ...resolution } : { status: "not_attempted" },
  };
}

function incrementMatchStrength(
  distribution: MatchStrengthDistribution,
  strength: MatchStrength | undefined,
): void {
  if (strength === "weak" || strength === "medium" || strength === "strong") {
    distribution[strength] += 1;
    return;
  }

  distribution.unknown += 1;
}

function computeMatchStrengthDistribution(
  candidates: ReadonlyArray<SearchAttemptCandidate>,
): MatchStrengthDistribution {
  const distribution: MatchStrengthDistribution = {
    weak: 0,
    medium: 0,
    strong: 0,
    unknown: 0,
  };

  for (const candidate of candidates) {
    incrementMatchStrength(distribution, candidate.matchStrength);
  }

  return distribution;
}

function computeScoreDistribution(
  candidates: ReadonlyArray<SearchAttemptCandidate>,
): ScoreDistribution | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  const scores = candidates.map((candidate) => candidate.matchScore).sort((left, right) => left - right);
  const topScores = candidates
    .map((candidate) => candidate.matchScore)
    .sort((left, right) => right - left);
  const mid = Math.floor(scores.length / 2);
  const median =
    scores.length % 2 === 0
      ? (scores[mid - 1] + scores[mid]) / 2
      : scores[mid];
  const top3 = topScores.slice(0, 3);

  return {
    min: scores[0] ?? 0,
    max: scores[scores.length - 1] ?? 0,
    median,
    top3Avg: top3.reduce((sum, score) => sum + score, 0) / top3.length,
    gap: topScores.length >= 2 ? topScores[0] - topScores[1] : 0,
  };
}

function computeQueryReasonStats(
  candidates: ReadonlyArray<SearchAttemptCandidate>,
): QueryReasonStats {
  if (candidates.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      candidatesAtOrBelow1: 0,
      allAtOrBelow1: false,
    };
  }

  const counts = candidates.map((candidate) => candidate.queryReasons?.length ?? 0);
  const candidatesAtOrBelow1 = counts.filter((count) => count <= 1).length;

  return {
    min: Math.min(...counts),
    max: Math.max(...counts),
    avg: counts.reduce((sum, count) => sum + count, 0) / counts.length,
    candidatesAtOrBelow1,
    allAtOrBelow1: candidatesAtOrBelow1 === candidates.length,
  };
}

function flattenConditionAudit(
  candidates: ReadonlyArray<SearchAttemptCandidate>,
): ConditionAuditItem[] {
  return candidates.flatMap((candidate) => candidate.conditionAudit ?? []);
}

function summarizeConditionAudit(items: ConditionAuditItem[]): ConditionAuditSummary | undefined {
  if (items.length === 0) {
    return undefined;
  }

  return {
    total: items.length,
    met: items.filter((item) => item.status === "met").length,
    unmet: items.filter((item) => item.status === "unmet").length,
    unknown: items.filter((item) => item.status === "unknown").length,
  };
}

function pickDominantUnmetLabels(items: ConditionAuditItem[], limit = 3): string[] | undefined {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.status !== "unmet") {
      continue;
    }
    counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
  }

  const labels = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label]) => label);

  return labels.length > 0 ? labels : undefined;
}

function computeSourceEvidenceStats(candidates: ReadonlyArray<SearchAttemptCandidate>) {
  return {
    singleSourceCandidates: candidates.filter((candidate) => (candidate.sources?.length ?? 0) === 1).length,
    multiSourceCandidates: candidates.filter((candidate) => (candidate.sources?.length ?? 0) > 1).length,
  };
}

export function buildSearchAttemptReport(
  input: BuildSearchAttemptReportInput,
  config: Partial<SearchAttemptRuleConfig> = {},
): SearchAttemptReport {
  const mergedConfig: SearchAttemptRuleConfig = {
    conditionMismatch: {
      ...DEFAULT_CONFIG.conditionMismatch,
      ...config.conditionMismatch,
    },
    evidenceTooSparse: {
      ...DEFAULT_CONFIG.evidenceTooSparse,
      ...config.evidenceTooSparse,
    },
  };

  const candidates = [...input.candidates];
  const matchStrengthDistribution = computeMatchStrengthDistribution(candidates);
  const scoreDistribution = computeScoreDistribution(candidates);
  const queryReasonStats = computeQueryReasonStats(candidates);
  const auditItems = flattenConditionAudit(candidates);
  const conditionAuditSummary = summarizeConditionAudit(auditItems);
  const dominantUnmetLabels = pickDominantUnmetLabels(auditItems);
  const allWeak = candidates.length > 0 && matchStrengthDistribution.weak === candidates.length;
  const zeroHits = candidates.length === 0;
  const auditedCandidateCount = candidates.filter((candidate) => (candidate.conditionAudit?.length ?? 0) > 0).length;
  const metCount = conditionAuditSummary?.met ?? 0;
  const totalAuditCount = conditionAuditSummary?.total ?? 0;
  const metRatio = totalAuditCount > 0 ? metCount / totalAuditCount : 0;
  const conditionMismatchDominant =
    totalAuditCount === 0
      ? true
      : metCount < mergedConfig.conditionMismatch.minMetCount
        || metRatio < mergedConfig.conditionMismatch.minMetRatio;
  const evidenceTooSparse =
    queryReasonStats.allAtOrBelow1
    && (!mergedConfig.evidenceTooSparse.requireAllWeak || allWeak);
  const legacyRoleSignal = Boolean(
    input.conditions.role
      || input.conditions.candidateAnchor?.personId
      || input.conditions.candidateAnchor?.name,
  );
  const signalCount = countTruthy([
    legacyRoleSignal,
    input.conditions.skills.length + input.conditions.mustHave.length > 0,
    input.conditions.locations.length > 0,
    Boolean(input.conditions.experience),
    Boolean(input.conditions.sourceBias),
    Boolean(input.conditions.candidateAnchor?.personId || input.conditions.candidateAnchor?.name),
  ]);
  const budget: RecoveryBudgetSnapshot = {
    clarifyUsed: input.recoveryState.clarificationCount,
    clarifyLimit: input.limits.clarifyLimit,
    rewriteUsed: input.recoveryState.rewriteCount,
    rewriteLimit: input.limits.rewriteLimit,
    exhausted:
      input.recoveryState.clarificationCount >= input.limits.clarifyLimit
      && input.recoveryState.rewriteCount >= input.limits.rewriteLimit,
  };

  return {
    version: "search-attempt-report/v0.1",
    meta: {
      sessionId: input.sessionId,
      attemptId: input.attemptId,
      parentAttemptId: input.parentAttemptId,
      attemptOrdinal: input.attemptOrdinal,
      trigger: input.trigger,
      startedAt: input.startedAt.toISOString(),
      completedAt: input.completedAt.toISOString(),
    },
    request: {
      rawUserGoal: input.rawUserGoal,
      inputReceivedAt: toIsoString(input.inputReceivedAt),
      effectiveQuery: input.effectiveQuery,
      rewrittenFromQuery: input.rewrittenFromQuery,
      conditions: cloneConditions(input.conditions),
    },
    history: {
      previousFailureCodes: [...input.previousFailureCodes],
      clarificationCount: input.recoveryState.clarificationCount,
      rewriteCount: input.recoveryState.rewriteCount,
      budget,
    },
    intent: {
      signalCount,
      axes: {
        role: createAxisObservation(summarizeStringEvidence([input.conditions.role])),
        skill: createAxisObservation([
          ...summarizeStringEvidence(input.conditions.skills),
          ...summarizeStringEvidence(input.conditions.mustHave),
        ]),
        location: createAxisObservation(summarizeStringEvidence(input.conditions.locations)),
        experience: createAxisObservation(summarizeStringEvidence([input.conditions.experience])),
        sourceBias: createAxisObservation(summarizeStringEvidence([input.conditions.sourceBias])),
        anchor: createAnchorObservation(input.conditions, input.anchorResolution),
      },
    },
    retrieval: {
      requestedLimit: input.conditions.limit,
      retrievedCount: candidates.length,
      zeroHits,
      filters: {
        role: input.conditions.role,
        skills: [...input.conditions.skills],
        mustHave: [...input.conditions.mustHave],
        niceToHave: [...input.conditions.niceToHave],
        locations: [...input.conditions.locations],
        exclude: [...input.conditions.exclude],
        sourceBias: input.conditions.sourceBias,
      },
      diagnostics: {
        filterDropoff: input.retrievalDiagnostics?.filterDropoff ?? { status: "unavailable" },
        corpusCoverage: input.retrievalDiagnostics?.corpusCoverage ?? { status: "unavailable" },
        sourceCounterfactual: input.retrievalDiagnostics?.sourceCounterfactual ?? { status: "unavailable" },
      },
    },
    ranking: {
      rerankedCount: candidates.length,
      topCandidate: candidates[0]
        ? {
            personId: candidates[0].personId,
            score: candidates[0].matchScore,
            matchStrength: candidates[0].matchStrength,
          }
        : undefined,
      matchStrengthDistribution,
      scoreDistribution,
      evaluations: {
        allWeak: {
          value: allWeak,
          confidence: "high",
          basis: {
            threshold: "all retrieved candidates are weak",
            candidateCount: candidates.length,
            matchStrengthDistribution,
          },
        },
      },
    },
    evidence: {
      queryReasonStats,
      sourceEvidenceStats: computeSourceEvidenceStats(candidates),
      evaluations: {
        evidenceTooSparse: {
          value: evidenceTooSparse,
          confidence: evidenceTooSparse && allWeak ? "high" : "medium",
          basis: {
            queryReasonThreshold: mergedConfig.evidenceTooSparse.queryReasonThreshold,
            candidatesAtOrBelowThreshold: queryReasonStats.candidatesAtOrBelow1,
            totalCandidates: candidates.length,
            avgQueryReasonCount: queryReasonStats.avg,
            requireAllWeak: mergedConfig.evidenceTooSparse.requireAllWeak,
            allWeak,
          },
        },
      },
    },
    constraints: {
      auditedCandidateCount,
      conditionAuditSummary,
      dominantUnmetLabels,
      evaluations: {
        conditionMismatchDominant: {
          value: conditionMismatchDominant,
          confidence: auditedCandidateCount >= 2 ? "high" : "medium",
          basis: {
            auditedCandidateCount,
            conditionAuditSummary: conditionAuditSummary ?? {
              total: 0,
              met: 0,
              unmet: 0,
              unknown: 0,
            },
            dominantUnmetLabels,
            rule: {
              minMetCount: mergedConfig.conditionMismatch.minMetCount,
              minMetRatio: mergedConfig.conditionMismatch.minMetRatio,
            },
          },
        },
      },
    },
    outcome: {
      usable: candidates.length > 0 && !allWeak,
      lowConfidenceShortlistPossible: candidates.length > 0,
      shortlistedCandidateCount: candidates.length,
    },
  };
}
