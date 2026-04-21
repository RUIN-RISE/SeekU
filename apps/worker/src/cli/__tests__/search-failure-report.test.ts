import { describe, expect, it } from "vitest";
import type { SearchConditions } from "../types.js";
import { buildSearchAttemptReport } from "../search-attempt-report.js";
import { RULE_TRIGGERS, buildSearchFailureReport } from "../search-failure-report.js";

const EMPTY_CONDITIONS: SearchConditions = {
  skills: [],
  locations: [],
  experience: undefined,
  role: undefined,
  sourceBias: undefined,
  mustHave: [],
  niceToHave: [],
  exclude: [],
  preferFresh: false,
  candidateAnchor: undefined,
  limit: 10,
};

function createWeakCandidate(overrides: Record<string, unknown> = {}) {
  return {
    personId: "person-1",
    name: "Ada",
    matchScore: 0.58,
    matchStrength: "weak" as const,
    queryReasons: ["命中 python"],
    conditionAudit: [
      { label: "Python", status: "unmet" as const, detail: "只命中过一次" },
      { label: "杭州", status: "unknown" as const, detail: "地点未知" },
    ],
    sources: ["Bonjour"],
    ...overrides,
  };
}

describe("search-failure-report", () => {
  it("prioritizes anchor failure over retrieval symptoms", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-1",
      attemptId: "attempt-1",
      attemptOrdinal: 1,
      trigger: "initial_search",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "像张三这样的人",
      conditions: {
        ...EMPTY_CONDITIONS,
        candidateAnchor: { name: "张三" },
      },
      candidates: [],
      recoveryState: { clarificationCount: 0, rewriteCount: 0 },
      previousFailureCodes: [],
      limits: { clarifyLimit: 1, rewriteLimit: 1 },
      anchorResolution: { status: "not_found", failureReason: "anchor not found" },
    });

    const report = buildSearchFailureReport({ attempt });

    expect(RULE_TRIGGERS.F01(attempt)).toBe(true);
    expect(report.summary.primaryFailureCode).toBe("intent_anchor_missing");
    expect(report.summary.actionableFailures).toEqual([
      "intent_anchor_missing",
      "intent_missing_role_axis",
      "intent_missing_skill_axis",
      "retrieval_zero_hits",
      "condition_mismatch_dominant",
    ]);
    expect(report.builderTrace.suppressedRules).toEqual(["F02", "F03", "F04", "F06"]);
  });

  it("keeps evidence sparse as diagnostic while condition mismatch outranks all-weak", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-2",
      attemptId: "attempt-3",
      attemptOrdinal: 3,
      trigger: "post_rewrite",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:03.000Z"),
      effectiveQuery: "杭州 python backend",
      conditions: {
        ...EMPTY_CONDITIONS,
        role: "backend",
        skills: ["python"],
        locations: ["杭州"],
      },
      candidates: [
        createWeakCandidate(),
        createWeakCandidate({ personId: "person-2", name: "Lin" }),
      ],
      recoveryState: { clarificationCount: 1, rewriteCount: 1 },
      previousFailureCodes: ["retrieval_all_weak"],
      limits: { clarifyLimit: 1, rewriteLimit: 1 },
    });

    const report = buildSearchFailureReport({
      attempt,
      generatedAt: new Date("2026-04-21T00:00:04.000Z"),
    });

    expect(RULE_TRIGGERS.F05(attempt)).toBe(true);
    expect(RULE_TRIGGERS.F06(attempt)).toBe(true);
    expect(RULE_TRIGGERS.F07(attempt)).toBe(true);
    expect(RULE_TRIGGERS.F08(attempt)).toBe(true);
    expect(report.summary.primaryFailureCode).toBe("condition_mismatch_dominant");
    expect(report.summary.diagnosticFailures).toEqual(["evidence_too_sparse"]);
    expect(report.summary.terminalFailureCodes).toEqual(["recovery_budget_exhausted"]);
    expect(report.builderTrace.suppressedRules).toEqual(["F05"]);
  });

  it("promotes filter-too-strict over zero-hits and keeps source-bias conflict diagnostic", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-3",
      attemptId: "attempt-4",
      attemptOrdinal: 4,
      trigger: "post_rewrite",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:03.000Z"),
      effectiveQuery: "python backend",
      conditions: {
        ...EMPTY_CONDITIONS,
        role: "backend",
        skills: ["python"],
        sourceBias: "bonjour",
        mustHave: ["distributed systems"],
      },
      candidates: [],
      recoveryState: { clarificationCount: 0, rewriteCount: 0 },
      previousFailureCodes: [],
      limits: { clarifyLimit: 1, rewriteLimit: 1 },
      retrievalDiagnostics: {
        filterDropoff: {
          status: "available",
          dominantFilter: "source_bias",
          dropoffByFilter: {
            must_have: 1,
            source_bias: 3,
          },
        },
        sourceCounterfactual: {
          status: "available",
          restrictedSource: "bonjour",
          unrestrictedRetrievedCount: 5,
        },
      },
    });

    const report = buildSearchFailureReport({ attempt });

    expect(RULE_TRIGGERS.F04(attempt)).toBe(true);
    expect(RULE_TRIGGERS.F09(attempt)).toBe(true);
    expect(RULE_TRIGGERS.F10(attempt)).toBe(true);
    expect(report.summary.primaryFailureCode).toBe("filter_too_strict");
    expect(report.summary.actionableFailures).toContain("filter_too_strict");
    expect(report.summary.diagnosticFailures).toContain("source_bias_conflict");
    expect(report.builderTrace.suppressedRules).toEqual(["F04", "F06"]);
  });

  it("emits query-too-broad and source-coverage-gap as diagnostic boundary signals", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-4",
      attemptId: "attempt-5",
      attemptOrdinal: 5,
      trigger: "system_retry",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:03.000Z"),
      effectiveQuery: "ai engineer",
      conditions: {
        ...EMPTY_CONDITIONS,
        role: "engineer",
        skills: ["ai"],
      },
      candidates: [
        createWeakCandidate({ personId: "person-1", matchScore: 0.56 }),
        createWeakCandidate({ personId: "person-2", matchScore: 0.55 }),
        createWeakCandidate({ personId: "person-3", matchScore: 0.53 }),
      ],
      recoveryState: { clarificationCount: 0, rewriteCount: 0 },
      previousFailureCodes: [],
      limits: { clarifyLimit: 1, rewriteLimit: 1 },
      retrievalDiagnostics: {
        filterDropoff: {
          status: "available",
          dominantFilter: "unknown",
          dropoffByFilter: {},
        },
        corpusCoverage: {
          status: "available",
          suspectedGap: false,
          supportingSignals: [],
        },
      },
    });

    const zeroHitCoverageAttempt = buildSearchAttemptReport({
      sessionId: "session-5",
      attemptId: "attempt-6",
      attemptOrdinal: 6,
      trigger: "system_retry",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:03.000Z"),
      effectiveQuery: "rare robotics founder",
      conditions: {
        ...EMPTY_CONDITIONS,
        role: "founder",
        skills: ["robotics"],
      },
      candidates: [],
      recoveryState: { clarificationCount: 0, rewriteCount: 0 },
      previousFailureCodes: [],
      limits: { clarifyLimit: 1, rewriteLimit: 1 },
      retrievalDiagnostics: {
        filterDropoff: {
          status: "available",
          dominantFilter: "unknown",
          dropoffByFilter: {},
        },
        corpusCoverage: {
          status: "available",
          suspectedGap: true,
          supportingSignals: [
            "no dominant hard-filter dropoff detected",
            "unrestricted retrieval also returned zero candidates",
          ],
        },
        sourceCounterfactual: {
          status: "available",
          unrestrictedRetrievedCount: 0,
        },
      },
    });

    const broadReport = buildSearchFailureReport({ attempt });
    const coverageReport = buildSearchFailureReport({ attempt: zeroHitCoverageAttempt });

    expect(RULE_TRIGGERS.F11(attempt)).toBe(true);
    expect(broadReport.summary.diagnosticFailures).toContain("query_too_broad");
    expect(broadReport.summary.primaryFailureCode).toBe("condition_mismatch_dominant");
    expect(RULE_TRIGGERS.F12(zeroHitCoverageAttempt)).toBe(true);
    expect(coverageReport.summary.diagnosticFailures).toContain("source_coverage_gap");
  });
});
