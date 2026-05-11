import { describe, expect, it } from "vitest";

import {
  scoreRecruitingCandidate,
  selectRecruitingPrecisionQueries,
  summarizeRecruitingPrecision,
  type RecruitingPrecisionQuery
} from "./recruiting-precision.js";

const baseQuery: RecruitingPrecisionQuery = {
  id: "rp-test",
  text: "找一个会 RAG 的工程师",
  mustRoles: ["工程师", "AI工程师"],
  mustSkills: ["rag", "检索增强"],
  mustLocations: [],
  forbiddenTerms: [],
  minTop5Precision: 0.4
};

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    personId: "person-1",
    docText: "RAG retrieval augmented generation engineer",
    facetRole: ["AI工程师"],
    facetTags: ["rag", "llm"],
    facetLocation: [],
    facetSource: ["bonjour"],
    rankFeatures: {
      evidenceCount: 2,
      projectCount: 1,
      repoCount: 0,
      followerCount: 0,
      freshness: 1
    },
    updatedAt: new Date("2026-05-10T00:00:00.000Z"),
    ...overrides
  } as any;
}

describe("recruiting precision eval", () => {
  it("scores candidates that satisfy role and skill constraints", () => {
    const candidate = scoreRecruitingCandidate(baseQuery, {
      personId: "person-1",
      finalScore: 0.8,
      document: makeDocument()
    });

    expect(candidate.passed).toBe(true);
    expect(candidate.roleHit).toBe(true);
    expect(candidate.skillHit).toBe(true);
  });

  it("fails candidates missing required skill evidence", () => {
    const candidate = scoreRecruitingCandidate(baseQuery, {
      personId: "person-1",
      finalScore: 0.8,
      document: makeDocument({
        docText: "generic software engineer",
        facetTags: ["typescript"]
      })
    });

    expect(candidate.passed).toBe(false);
    expect(candidate.roleHit).toBe(true);
    expect(candidate.skillHit).toBe(false);
  });

  it("enforces location constraints when present", () => {
    const candidate = scoreRecruitingCandidate({
      ...baseQuery,
      mustLocations: ["杭州", "hangzhou"]
    }, {
      personId: "person-1",
      finalScore: 0.8,
      document: makeDocument({
        facetLocation: ["上海"]
      })
    });

    expect(candidate.passed).toBe(false);
    expect(candidate.locationHit).toBe(false);
  });

  it("summarizes gate pass rate and precision averages", () => {
    const summary = summarizeRecruitingPrecision([
      {
        queryId: "q1",
        text: "q1",
        top5Precision: 0.6,
        top10Precision: 0.5,
        passedGate: true,
        candidates: []
      },
      {
        queryId: "q2",
        text: "q2",
        top5Precision: 0.2,
        top10Precision: 0.3,
        passedGate: false,
        candidates: []
      }
    ]);

    expect(summary.totalQueries).toBe(2);
    expect(summary.passedQueries).toBe(1);
    expect(summary.avgTop5Precision).toBeCloseTo(0.4);
    expect(summary.avgTop10Precision).toBeCloseTo(0.4);
  });

  it("filters queries by query id while preserving dataset order", () => {
    const queries: RecruitingPrecisionQuery[] = [
      { ...baseQuery, id: "rp001", text: "q1" },
      { ...baseQuery, id: "rp002", text: "q2" },
      { ...baseQuery, id: "rp006", text: "q6" }
    ];

    expect(selectRecruitingPrecisionQueries(queries, ["rp006", "rp001"]).map((query) => query.id)).toEqual([
      "rp001",
      "rp006"
    ]);
  });

  it("throws when a requested query id does not exist", () => {
    expect(() => selectRecruitingPrecisionQueries([{ ...baseQuery, id: "rp001" }], ["rp404"])).toThrow(
      "Unknown recruiting precision query id(s): rp404"
    );
  });
});
