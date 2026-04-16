import { describe, expect, it } from "vitest";
import type { SearchConditions } from "../types.js";
import {
  decideClarifyAction,
  decidePostSearchAction,
  pickComparisonTargets
} from "../agent-policy.js";

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
    expect(decision.rationale).toContain("上限");
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
    expect(decision.rationale).toContain("偏弱");
  });
});
