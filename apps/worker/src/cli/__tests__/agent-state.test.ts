import { describe, expect, it } from "vitest";
import type { ScoredCandidate, SearchConditions } from "../types.js";
import {
  addCandidateToCompareSet,
  addOpenUncertainty,
  createAgentSessionState,
  recordClarification,
  recordSearch,
  removeCandidateFromCompareSet,
  setConfidenceStatus,
  setCurrentShortlist,
  setSessionShortlist,
  setRecommendedCandidate
} from "../agent-state.js";

function createConditions(overrides: Partial<SearchConditions> = {}): SearchConditions {
  return {
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
    ...overrides
  };
}

function createCandidate(personId: string, name = personId): ScoredCandidate {
  return {
    personId,
    name,
    headline: null,
    location: null,
    company: null,
    experienceYears: null,
    matchScore: 0.8,
    sources: ["GitHub"]
  };
}

describe("agent-state", () => {
  it("creates a default session state with explicit fields", () => {
    const state = createAgentSessionState({
      userGoal: "Find an open-source backend engineer"
    });

    expect(state.userGoal).toBe("Find an open-source backend engineer");
    expect(state.currentConditions.limit).toBe(10);
    expect(state.clarificationHistory).toEqual([]);
    expect(state.searchHistory).toEqual([]);
    expect(state.currentShortlist).toEqual([]);
    expect(state.activeCompareSet).toEqual([]);
    expect(state.confidenceStatus.level).toBe("low");
    expect(state.recommendedCandidate).toBeNull();
    expect(state.openUncertainties).toEqual([]);
  });

  it("records a search, updates conditions, and preserves compare selection across searches", () => {
    const previous = createCandidate("person-1", "Ada");
    const next = createCandidate("person-2", "Lin");
    let state = createAgentSessionState({
      currentShortlist: [previous],
      activeCompareSet: [previous]
    });
    state = setConfidenceStatus(state, {
      level: "medium",
      rationale: "existing compare looked usable",
      updatedAt: new Date("2026-04-16T08:00:00.000Z")
    });
    state = setRecommendedCandidate(state, previous, {
      rationale: "old recommendation"
    }).state;

    const updated = recordSearch(state, {
      results: [next],
      conditions: createConditions({ skills: ["rag"] }),
      timestamp: new Date("2026-04-16T09:00:00.000Z")
    });

    expect(updated.currentConditions.skills).toEqual(["rag"]);
    expect(updated.currentShortlist.map((candidate) => candidate.personId)).toEqual(["person-2"]);
    expect(updated.activeCompareSet.map((candidate) => candidate.personId)).toEqual(["person-1"]);
    expect(updated.confidenceStatus.level).toBe("low");
    expect(updated.recommendedCandidate).toBeNull();
    expect(updated.searchHistory).toHaveLength(1);
    expect(updated.searchHistory[0]).toMatchObject({
      resultCount: 1
    });
    expect(updated.searchHistory[0]?.timestamp.toISOString()).toBe("2026-04-16T09:00:00.000Z");
  });

  it("keeps compare candidates unique and clears recommendation when compare membership changes", () => {
    const ada = createCandidate("person-1", "Ada");
    const lin = createCandidate("person-2", "Lin");
    let state = createAgentSessionState({
      currentShortlist: [ada, lin]
    });

    state = addCandidateToCompareSet(state, ada);
    state = addCandidateToCompareSet(state, ada);
    state = addCandidateToCompareSet(state, lin);
    state = setConfidenceStatus(state, {
      level: "medium",
      rationale: "enough evidence to compare",
      updatedAt: new Date("2026-04-16T10:00:00.000Z")
    });

    const recommendation = setRecommendedCandidate(state, ada, {
      rationale: "better open-source evidence"
    });

    expect(recommendation.ok).toBe(true);
    expect(recommendation.state.activeCompareSet.map((candidate) => candidate.personId)).toEqual([
      "person-1",
      "person-2"
    ]);
    expect(recommendation.state.recommendedCandidate?.candidate.personId).toBe("person-1");

    const afterRemoval = removeCandidateFromCompareSet(recommendation.state, "person-1");
    expect(afterRemoval.activeCompareSet.map((candidate) => candidate.personId)).toEqual([
      "person-2"
    ]);
    expect(afterRemoval.recommendedCandidate).toBeNull();
  });

  it("blocks recommendation when candidate is outside compare set", () => {
    const ada = createCandidate("person-1", "Ada");
    const lin = createCandidate("person-2", "Lin");
    let state = createAgentSessionState({
      currentShortlist: [ada, lin]
    });

    state = addCandidateToCompareSet(state, ada);
    state = setConfidenceStatus(state, {
      level: "high",
      rationale: "strong evidence",
      updatedAt: new Date("2026-04-16T10:00:00.000Z")
    });

    const result = setRecommendedCandidate(state, lin);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("candidate_not_in_compare_set");
    expect(result.state.recommendedCandidate).toBeNull();
  });

  it("blocks recommendation when confidence is low and clears stale recommendation on downgrade", () => {
    const ada = createCandidate("person-1", "Ada");
    let state = createAgentSessionState({
      currentShortlist: [ada]
    });

    state = addCandidateToCompareSet(state, ada);
    state = setConfidenceStatus(state, {
      level: "medium",
      rationale: "compare is usable",
      updatedAt: new Date("2026-04-16T10:00:00.000Z")
    });

    const allowed = setRecommendedCandidate(state, ada, {
      rationale: "best project depth"
    });
    expect(allowed.ok).toBe(true);
    expect(allowed.state.recommendedCandidate?.confidenceLevel).toBe("medium");

    const downgraded = setConfidenceStatus(allowed.state, {
      level: "low",
      rationale: "evidence confidence dropped after re-check",
      updatedAt: new Date("2026-04-16T11:00:00.000Z")
    });
    expect(downgraded.recommendedCandidate).toBeNull();

    const blocked = setRecommendedCandidate(downgraded, ada);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("low_confidence");
  });

  it("dedupes uncertainties and can still filter compare set when explicitly narrowing shortlist", () => {
    const ada = createCandidate("person-1", "Ada");
    const lin = createCandidate("person-2", "Lin");
    let state = createAgentSessionState({
      currentShortlist: [ada, lin],
      activeCompareSet: [ada, lin]
    });

    state = addOpenUncertainty(state, "Need fresher project evidence");
    state = addOpenUncertainty(state, "need fresher project evidence");
    state = setCurrentShortlist(state, [lin], { resetCompareSet: false });

    expect(state.openUncertainties).toEqual(["Need fresher project evidence"]);
    expect(state.activeCompareSet.map((candidate) => candidate.personId)).toEqual(["person-2"]);
  });

  it("keeps compare set untouched when session shortlist is refreshed for rerank-only updates", () => {
    const ada = createCandidate("person-1", "Ada");
    const lin = createCandidate("person-2", "Lin");
    const grace = createCandidate("person-3", "Grace");
    const state = createAgentSessionState({
      activeCompareSet: [grace]
    });

    const updated = setSessionShortlist(state, [lin, ada]);

    expect(updated.currentShortlist.map((candidate) => candidate.personId)).toEqual(["person-2", "person-1"]);
    expect(updated.activeCompareSet.map((candidate) => candidate.personId)).toEqual(["person-3"]);
  });

  it("preserves previously pooled candidates when adding a new candidate after a later search", () => {
    const ada = createCandidate("person-1", "Ada");
    const lin = createCandidate("person-2", "Lin");
    const grace = createCandidate("person-3", "Grace");

    let state = createAgentSessionState({
      currentShortlist: [ada],
      activeCompareSet: [ada]
    });

    state = recordSearch(state, {
      results: [lin],
      conditions: createConditions({ skills: ["rag"] }),
      timestamp: new Date("2026-04-16T12:00:00.000Z")
    });
    state = addCandidateToCompareSet(state, lin);
    state = addCandidateToCompareSet(state, grace);

    expect(state.currentShortlist.map((candidate) => candidate.personId)).toEqual(["person-2"]);
    expect(state.activeCompareSet.map((candidate) => candidate.personId)).toEqual([
      "person-1",
      "person-2",
      "person-3"
    ]);
  });

  it("records clarification prompts with a conditions snapshot instead of fake q/a text", () => {
    const conditions = createConditions({ skills: ["python"], role: "backend" });
    const state = recordClarification(
      createAgentSessionState(),
      "更偏后端，保留 python",
      conditions,
      new Date("2026-04-16T10:30:00.000Z")
    );

    expect(state.clarificationHistory).toEqual([
      {
        prompt: "更偏后端，保留 python",
        conditions,
        askedAt: new Date("2026-04-16T10:30:00.000Z")
      }
    ]);
  });
});
