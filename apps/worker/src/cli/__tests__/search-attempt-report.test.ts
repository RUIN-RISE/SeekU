import { describe, expect, it } from "vitest";
import type { SearchConditions } from "../types.js";
import { buildSearchAttemptReport } from "../search-attempt-report.js";

const BASE_CONDITIONS: SearchConditions = {
  skills: ["rag"],
  locations: ["杭州"],
  experience: undefined,
  role: undefined,
  sourceBias: "bonjour",
  mustHave: [],
  niceToHave: [],
  exclude: [],
  preferFresh: false,
  candidateAnchor: undefined,
  limit: 10,
};

function createCandidate(overrides: Record<string, unknown> = {}) {
  return {
    personId: "person-1",
    name: "Ada",
    matchScore: 0.72,
    matchStrength: "weak" as const,
    queryReasons: ["命中 rag"],
    conditionAudit: [
      { label: "RAG", status: "met" as const, detail: "做过 RAG" },
      { label: "杭州", status: "unmet" as const, detail: "地点不符" },
    ],
    sources: ["Bonjour"],
    ...overrides,
  };
}

describe("search-attempt-report", () => {
  it("builds aggregated ranking, evidence, constraint, and budget signals", () => {
    const report = buildSearchAttemptReport({
      sessionId: "session-1",
      attemptId: "attempt-2",
      parentAttemptId: "attempt-1",
      attemptOrdinal: 2,
      trigger: "post_rewrite",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:03.000Z"),
      rawUserGoal: "找做 RAG 的人",
      effectiveQuery: "杭州 rag",
      rewrittenFromQuery: "rag engineer",
      conditions: BASE_CONDITIONS,
      candidates: [
        createCandidate(),
        createCandidate({
          personId: "person-2",
          name: "Lin",
          matchScore: 0.61,
          conditionAudit: [
            { label: "RAG", status: "unknown" as const, detail: "证据不足" },
            { label: "杭州", status: "unmet" as const, detail: "地点不符" },
          ],
        }),
      ],
      recoveryState: {
        clarificationCount: 1,
        rewriteCount: 1,
      },
      previousFailureCodes: ["retrieval_all_weak"],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1,
      },
    });

    expect(report.intent.signalCount).toBe(3);
    expect(report.ranking.matchStrengthDistribution).toEqual({
      weak: 2,
      medium: 0,
      strong: 0,
      unknown: 0,
    });
    expect(report.ranking.evaluations.allWeak.value).toBe(true);
    expect(report.evidence.queryReasonStats).toMatchObject({
      min: 1,
      max: 1,
      avg: 1,
      candidatesAtOrBelow1: 2,
      allAtOrBelow1: true,
    });
    expect(report.evidence.evaluations.evidenceTooSparse.value).toBe(true);
    expect(report.constraints.conditionAuditSummary).toEqual({
      total: 4,
      met: 1,
      unmet: 2,
      unknown: 1,
    });
    expect(report.constraints.dominantUnmetLabels).toEqual(["杭州"]);
    expect(report.constraints.evaluations.conditionMismatchDominant.value).toBe(true);
    expect(report.history.budget.exhausted).toBe(true);
    expect(report.outcome.usable).toBe(false);
    expect(report.outcome.lowConfidenceShortlistPossible).toBe(true);
  });

  it("treats zero-hit searches as zeroHits without collapsing into allWeak or sparse", () => {
    const report = buildSearchAttemptReport({
      sessionId: "session-1",
      attemptId: "attempt-1",
      attemptOrdinal: 1,
      trigger: "initial_search",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "杭州 rag",
      conditions: {
        ...BASE_CONDITIONS,
        candidateAnchor: { name: "张三" },
      },
      candidates: [],
      recoveryState: {
        clarificationCount: 0,
        rewriteCount: 0,
      },
      previousFailureCodes: [],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1,
      },
      anchorResolution: {
        status: "not_found",
        failureReason: "anchor not in corpus",
      },
    });

    expect(report.retrieval.zeroHits).toBe(true);
    expect(report.ranking.evaluations.allWeak.value).toBe(false);
    expect(report.evidence.queryReasonStats.allAtOrBelow1).toBe(false);
    expect(report.intent.axes.anchor.resolution).toEqual({
      status: "not_found",
      failureReason: "anchor not in corpus",
    });
  });

  it("passes through retrieval diagnostics for filter dropoff and source counterfactual", () => {
    const report = buildSearchAttemptReport({
      sessionId: "session-1",
      attemptId: "attempt-4",
      attemptOrdinal: 4,
      trigger: "system_retry",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "python backend",
      conditions: {
        ...BASE_CONDITIONS,
        role: "backend",
        skills: ["python"],
        sourceBias: "bonjour",
        mustHave: ["distributed systems"],
      },
      candidates: [],
      recoveryState: {
        clarificationCount: 0,
        rewriteCount: 0,
      },
      previousFailureCodes: [],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1,
      },
      retrievalDiagnostics: {
        filterDropoff: {
          status: "available",
          dominantFilter: "must_have",
          dropoffByFilter: {
            must_have: 3,
            source_bias: 1,
          },
        },
        sourceCounterfactual: {
          status: "available",
          restrictedSource: "bonjour",
          unrestrictedRetrievedCount: 5,
        },
      },
    });

    expect(report.retrieval.diagnostics.filterDropoff).toEqual({
      status: "available",
      dominantFilter: "must_have",
      dropoffByFilter: {
        must_have: 3,
        source_bias: 1,
      },
    });
    expect(report.retrieval.diagnostics.sourceCounterfactual).toEqual({
      status: "available",
      restrictedSource: "bonjour",
      unrestrictedRetrievedCount: 5,
    });
  });
});
