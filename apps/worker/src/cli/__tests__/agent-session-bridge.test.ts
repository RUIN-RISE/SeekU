import { describe, expect, it } from "vitest";
import { createAgentSessionState, addCandidateToCompareSet, setConfidenceStatus, setRecommendedCandidate } from "../agent-state.js";
import { InMemoryAgentSessionBridge } from "../agent-session-bridge.js";
import { SearchWorkflow } from "../workflow.js";

function createCandidate(overrides: Record<string, unknown> = {}) {
  return {
    personId: "person-1",
    name: "Ada",
    headline: "Engineering Manager",
    location: "上海",
    company: null,
    experienceYears: 8,
    matchScore: 0.91,
    sources: ["GitHub"],
    ...overrides
  } as any;
}

function createWorkflowWithState() {
  const workflow = new SearchWorkflow({} as any, {} as any);
  const first = createCandidate();
  const second = createCandidate({ personId: "person-2", name: "Lin" });

  (workflow as any).sessionState = createAgentSessionState({
    userGoal: "找多智能体工程负责人",
    currentConditions: {
      skills: ["python"],
      locations: ["上海"],
      experience: undefined,
      role: "engineering manager",
      sourceBias: "github",
      mustHave: [],
      niceToHave: [],
      exclude: [],
      preferFresh: false,
      candidateAnchor: undefined,
      limit: 10
    },
    currentShortlist: [first, second]
  });
  return { workflow, first, second };
}

describe("InMemoryAgentSessionBridge", () => {
  it("registers sessions and delegates add_to_compare interventions", async () => {
    const { workflow, first } = createWorkflowWithState();
    const bridge = new InMemoryAgentSessionBridge();
    const snapshot = bridge.registerWorkflow(workflow);

    expect(bridge.hasSession(snapshot.sessionId)).toBe(true);

    const result = await bridge.applyIntervention(snapshot.sessionId, {
      type: "add_to_compare",
      candidateId: first.personId
    });

    expect(result?.ok).toBe(true);
    expect(result?.snapshot.activeCompareSet).toHaveLength(1);
    expect(result?.snapshot.activeCompareSet[0]?.personId).toBe(first.personId);
  });

  it("rejects invalid feedback tags and returns null for missing sessions", async () => {
    const { workflow } = createWorkflowWithState();
    const bridge = new InMemoryAgentSessionBridge();
    const snapshot = bridge.registerWorkflow(workflow);
    const beforeSnapshot = bridge.getSnapshot(snapshot.sessionId);

    const rejected = await bridge.applyIntervention(snapshot.sessionId, {
      type: "apply_feedback",
      tag: "not-a-real-tag"
    });
    const missing = await bridge.applyIntervention("missing", {
      type: "add_to_compare",
      candidateId: "person-1"
    });

    expect(rejected?.ok).toBe(false);
    expect(rejected?.reason).toBe("invalid_feedback_tag");
    expect(rejected?.snapshot.currentShortlist).toEqual(beforeSnapshot?.currentShortlist ?? []);
    expect(rejected?.snapshot.activeCompareSet).toEqual(beforeSnapshot?.activeCompareSet ?? []);
    expect(missing).toBeNull();
  });

  it("clears compare membership and stale recommendation when removing the recommended shortlist candidate", async () => {
    const { workflow, first } = createWorkflowWithState();
    const bridge = new InMemoryAgentSessionBridge();
    const snapshot = bridge.registerWorkflow(workflow);

    (workflow as any).sessionState = addCandidateToCompareSet((workflow as any).sessionState, first);
    (workflow as any).sessionState = setConfidenceStatus((workflow as any).sessionState, {
      level: "high",
      rationale: "strong compare evidence",
      updatedAt: new Date("2026-04-17T01:00:00.000Z")
    });
    (workflow as any).sessionState = setRecommendedCandidate((workflow as any).sessionState, first, {
      rationale: "strongest operator fit"
    }).state;

    const result = await bridge.applyIntervention(snapshot.sessionId, {
      type: "remove_from_shortlist",
      candidateId: first.personId
    });

    expect(result?.ok).toBe(true);
    expect(result?.snapshot.currentShortlist.some((candidate) => candidate.personId === first.personId)).toBe(false);
    expect(result?.snapshot.activeCompareSet.some((candidate) => candidate.personId === first.personId)).toBe(false);
    expect(result?.snapshot.recommendedCandidate).toBeNull();
  });
});
