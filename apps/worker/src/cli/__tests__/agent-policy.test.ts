import { describe, expect, it } from "vitest";
import type { SearchConditions } from "../types.js";
import {
  decideClarifyAction,
  decideRecoveryActionV2,
  decidePostSearchAction,
  pickComparisonTargets
} from "../agent-policy.js";
import { buildSearchAttemptReport } from "../search-attempt-report.js";
import { buildSearchFailureReport } from "../search-failure-report.js";

const BASE_CONDITIONS: SearchConditions = {
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
  limit: 10
};

function createCandidate(overrides: Record<string, unknown> = {}) {
  return {
    personId: "person-1",
    name: "Ada",
    headline: "Python Backend Engineer",
    location: "杭州",
    company: null,
    experienceYears: null,
    matchScore: 0.82,
    matchStrength: "strong",
    sources: ["Bonjour"],
    ...overrides
  } as any;
}

describe("agent-policy", () => {
  it("asks for one clarification when the initial query lacks role and skill signals", () => {
    const decision = decideClarifyAction({
      conditions: {
        ...BASE_CONDITIONS,
        locations: ["杭州"]
      },
      clarificationCount: 0
    });

    expect(decision.action).toBe("clarify");
    expect(decision.prompt).toContain("角色或技术关键词");
  });

  it("biases toward early search once a role or skill signal exists", () => {
    const decision = decideClarifyAction({
      conditions: {
        ...BASE_CONDITIONS,
        skills: ["python"]
      },
      clarificationCount: 0
    });

    expect(decision.action).toBe("search");
  });

  it("caps clarification depth and searches after one follow-up", () => {
    const decision = decideClarifyAction({
      conditions: BASE_CONDITIONS,
      clarificationCount: 1
    });

    expect(decision.action).toBe("search");
    expect(decision.rationale).toContain("不再追问");
  });

  it("picks the top compare-ready candidates before weaker tails", () => {
    const targets = pickComparisonTargets([
      createCandidate({ personId: "person-1", matchStrength: "strong" }),
      createCandidate({ personId: "person-2", matchStrength: "medium" }),
      createCandidate({ personId: "person-3", matchStrength: "weak" })
    ]);

    expect(targets.map((candidate) => candidate.personId)).toEqual(["person-1", "person-2"]);
  });

  it("chooses compare when at least two candidates are decision-ready", () => {
    const decision = decidePostSearchAction({
      candidates: [
        createCandidate({ personId: "person-1", matchStrength: "strong" }),
        createCandidate({ personId: "person-2", matchStrength: "medium" }),
        createCandidate({ personId: "person-3", matchStrength: "weak" })
      ]
    });

    expect(decision.action).toBe("compare");
    expect(decision.targets.map((candidate) => candidate.personId)).toEqual(["person-1", "person-2"]);
  });

  it("stays in narrow mode when results are too weak for compare", () => {
    const decision = decidePostSearchAction({
      candidates: [
        createCandidate({ personId: "person-1", matchStrength: "weak" }),
        createCandidate({ personId: "person-2", matchStrength: "weak" })
      ]
    });

    expect(decision.action).toBe("narrow");
    expect(decision.rationale).toContain("不够强");
  });

  it("routes anchor failure to clarification with anchor prompt kind", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-1",
      attemptId: "attempt-1",
      attemptOrdinal: 1,
      trigger: "initial_search",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "像张三这样的人",
      conditions: {
        ...BASE_CONDITIONS,
        candidateAnchor: { name: "张三" }
      },
      candidates: [],
      recoveryState: {
        clarificationCount: 0,
        rewriteCount: 0
      },
      previousFailureCodes: [],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1
      },
      anchorResolution: {
        status: "not_found",
        failureReason: "anchor not found"
      }
    });
    const failure = buildSearchFailureReport({ attempt });

    const decision = decideRecoveryActionV2({ attempt, failure });

    expect(decision).toMatchObject({
      action: "clarify",
      promptKind: "anchor",
      targetFailureCode: "intent_anchor_missing"
    });
  });

  it("routes constraint-dominant weak results to rewrite", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-2",
      attemptId: "attempt-2",
      attemptOrdinal: 2,
      trigger: "post_rewrite",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "杭州 python backend",
      conditions: {
        ...BASE_CONDITIONS,
        role: "backend",
        skills: ["python"],
        locations: ["杭州"]
      },
      candidates: [
        {
          personId: "person-1",
          name: "Ada",
          matchScore: 0.58,
          matchStrength: "weak",
          queryReasons: ["命中 python"],
          conditionAudit: [
            { label: "Python", status: "unmet", detail: "只命中过一次" },
            { label: "杭州", status: "unknown", detail: "地点未知" }
          ],
          sources: ["Bonjour"]
        },
        {
          personId: "person-2",
          name: "Lin",
          matchScore: 0.56,
          matchStrength: "weak",
          queryReasons: ["命中 python"],
          conditionAudit: [
            { label: "Python", status: "unmet", detail: "只命中过一次" },
            { label: "杭州", status: "unknown", detail: "地点未知" }
          ],
          sources: ["Bonjour"]
        }
      ],
      recoveryState: {
        clarificationCount: 0,
        rewriteCount: 0
      },
      previousFailureCodes: [],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1
      }
    });
    const failure = buildSearchFailureReport({ attempt });

    const decision = decideRecoveryActionV2({ attempt, failure });

    expect(decision).toMatchObject({
      action: "rewrite",
      targetFailureCode: "condition_mismatch_dominant"
    });
  });

  it("uses low-confidence shortlist after terminal budget exhaustion with fallback candidates", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-3",
      attemptId: "attempt-3",
      attemptOrdinal: 3,
      trigger: "post_rewrite",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "python",
      conditions: {
        ...BASE_CONDITIONS,
        role: "backend",
        skills: ["python"]
      },
      candidates: [
        {
          personId: "person-1",
          name: "Ada",
          matchScore: 0.58,
          matchStrength: "weak",
          queryReasons: ["命中 python"],
          conditionAudit: [
            { label: "Python", status: "met", detail: "命中技能" }
          ],
          sources: ["Bonjour"]
        }
      ],
      recoveryState: {
        clarificationCount: 1,
        rewriteCount: 1
      },
      previousFailureCodes: ["retrieval_all_weak"],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1
      }
    });
    const failure = buildSearchFailureReport({ attempt });

    const decision = decideRecoveryActionV2({ attempt, failure });

    expect(decision.action).toBe("low_confidence_shortlist");
  });

  it("routes filter-too-strict failures to rewrite", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-4",
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
        mustHave: ["distributed systems"]
      },
      candidates: [],
      recoveryState: {
        clarificationCount: 0,
        rewriteCount: 0
      },
      previousFailureCodes: [],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1
      },
      retrievalDiagnostics: {
        filterDropoff: {
          status: "available",
          dominantFilter: "must_have",
          dropoffByFilter: {
            must_have: 2
          }
        }
      }
    });
    const failure = buildSearchFailureReport({ attempt });

    const decision = decideRecoveryActionV2({ attempt, failure });

    expect(decision).toMatchObject({
      action: "rewrite",
      targetFailureCode: "filter_too_strict"
    });
  });

  it("adds a query-too-broad hint into rewrite rationale", () => {
    const metAudit = [{ label: "Python", status: "met", detail: "命中技能" }] as const;
    const attempt = buildSearchAttemptReport({
      sessionId: "session-5",
      attemptId: "attempt-5",
      attemptOrdinal: 5,
      trigger: "system_retry",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "ai engineer",
      conditions: {
        ...BASE_CONDITIONS,
        role: "engineer",
        skills: ["ai"],
        sourceBias: undefined,
        locations: []
      },
      candidates: [
        {
          personId: "person-1",
          name: "Ada",
          matchScore: 0.56,
          matchStrength: "weak",
          queryReasons: ["命中 ai", "命中 engineer"],
          conditionAudit: [...metAudit],
          sources: ["Bonjour"]
        },
        {
          personId: "person-2",
          name: "Lin",
          matchScore: 0.55,
          matchStrength: "weak",
          queryReasons: ["命中 ai", "命中 engineer"],
          conditionAudit: [...metAudit],
          sources: ["Bonjour"]
        },
        {
          personId: "person-3",
          name: "Grace",
          matchScore: 0.53,
          matchStrength: "weak",
          queryReasons: ["命中 ai", "命中 engineer"],
          conditionAudit: [...metAudit],
          sources: ["GitHub"]
        }
      ],
      recoveryState: {
        clarificationCount: 0,
        rewriteCount: 0
      },
      previousFailureCodes: [],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1
      }
    });
    const failure = buildSearchFailureReport({ attempt });

    const decision = decideRecoveryActionV2({ attempt, failure });

    expect(decision.action).toBe("rewrite");
    expect(decision.rationale).toContain("收紧一下再搜");
  });

  it("adds a source-coverage hint into rewrite rationale", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-6",
      attemptId: "attempt-6",
      attemptOrdinal: 6,
      trigger: "system_retry",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "rare robotics founder",
      conditions: {
        ...BASE_CONDITIONS,
        role: "founder",
        skills: ["robotics"]
      },
      candidates: [],
      recoveryState: {
        clarificationCount: 0,
        rewriteCount: 0
      },
      previousFailureCodes: [],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1
      },
      retrievalDiagnostics: {
        filterDropoff: {
          status: "available",
          dominantFilter: "unknown",
          dropoffByFilter: {}
        },
        corpusCoverage: {
          status: "available",
          suspectedGap: true,
          supportingSignals: ["unrestricted retrieval also returned zero candidates"]
        },
        sourceCounterfactual: {
          status: "available",
          restrictedSource: "bonjour",
          unrestrictedRetrievedCount: 0
        }
      }
    });
    const failure = buildSearchFailureReport({ attempt });

    const decision = decideRecoveryActionV2({ attempt, failure });

    expect(decision.action).toBe("rewrite");
    expect(decision.rationale).toContain("换个方式再试一轮");
  });

  it("stops when budget is exhausted and no fallback candidates exist", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-exhausted-no-fallback",
      attemptId: "attempt-ex-1",
      attemptOrdinal: 3,
      trigger: "post_rewrite",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "obscure tech stack",
      conditions: {
        ...BASE_CONDITIONS,
        role: "engineer",
        skills: ["obscure-framework"]
      },
      candidates: [],
      recoveryState: {
        clarificationCount: 1,
        rewriteCount: 1
      },
      previousFailureCodes: ["retrieval_zero_hits"],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1
      }
    });
    const failure = buildSearchFailureReport({ attempt });

    const decision = decideRecoveryActionV2({ attempt, failure });

    expect(decision.action).toBe("stop");
    expect(decision.rationale).toContain("换个方向");
  });

  it("stops when budget is exhausted with retrieval-all-weak and weak candidates", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-exhausted-weak",
      attemptId: "attempt-ex-2",
      attemptOrdinal: 3,
      trigger: "post_rewrite",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "backend",
      conditions: {
        ...BASE_CONDITIONS,
        role: "backend",
        skills: ["python"]
      },
      candidates: [
        {
          personId: "person-1",
          name: "Ada",
          matchScore: 0.45,
          matchStrength: "weak",
          queryReasons: ["命中 backend"],
          conditionAudit: [{ label: "Backend", status: "unmet", detail: "只命中一次" }],
          sources: ["Bonjour"]
        }
      ],
      recoveryState: {
        clarificationCount: 1,
        rewriteCount: 1
      },
      previousFailureCodes: ["retrieval_all_weak"],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1
      }
    });
    const failure = buildSearchFailureReport({ attempt });

    const decision = decideRecoveryActionV2({ attempt, failure });

    expect(decision.action).toBe("low_confidence_shortlist");
  });

  it("falls back to rewrite when clarify is exhausted but rewrite remains", () => {
    const attempt = buildSearchAttemptReport({
      sessionId: "session-clarify-exhausted",
      attemptId: "attempt-ce-1",
      attemptOrdinal: 2,
      trigger: "post_clarification",
      startedAt: new Date("2026-04-21T00:00:00.000Z"),
      completedAt: new Date("2026-04-21T00:00:01.000Z"),
      effectiveQuery: "python backend",
      conditions: {
        ...BASE_CONDITIONS,
        skills: ["python"],
        locations: ["杭州"]
      },
      candidates: [],
      recoveryState: {
        clarificationCount: 1,
        rewriteCount: 0
      },
      previousFailureCodes: [],
      limits: {
        clarifyLimit: 1,
        rewriteLimit: 1
      },
      anchorResolution: {
        status: "not_found",
        failureReason: "anchor not found"
      }
    });
    const failure = buildSearchFailureReport({ attempt });

    const decision = decideRecoveryActionV2({ attempt, failure });

    expect(decision.action).toBe("rewrite");
    expect(decision.targetFailureCode).toBe("intent_anchor_missing");
  });
});
