import { describe, expect, it } from "vitest";
import {
  buildAgentSessionSnapshot,
  createAgentSessionEvent,
  summarizeInterventionCommand
} from "../agent-session-events.js";
import { createAgentSessionState } from "../agent-state.js";

describe("agent-session-events", () => {
  it("serializes session snapshots with ISO dates and candidate state", () => {
    const state = createAgentSessionState({
      userGoal: "找做多智能体产品的工程负责人",
      currentConditions: {
        skills: ["python", "llm"],
        locations: ["上海"],
        experience: "资深",
        role: "engineering manager",
        sourceBias: "github",
        mustHave: ["multi-agent"],
        niceToHave: [],
        exclude: [],
        preferFresh: true,
        candidateAnchor: undefined,
        limit: 10
      },
      currentShortlist: [
        {
          personId: "person-1",
          name: "Ada",
          headline: "Engineering Manager",
          location: "上海",
          company: "Seeku",
          experienceYears: 8,
          matchScore: 0.92,
          sources: ["GitHub"],
          lastSyncedAt: new Date("2026-03-29T00:00:00.000Z"),
          latestEvidenceAt: new Date("2026-03-28T00:00:00.000Z")
        }
      ],
      confidenceStatus: {
        level: "medium",
        rationale: "证据还不够完整",
        updatedAt: new Date("2026-03-31T00:00:00.000Z")
      },
      openUncertainties: ["最近 90 天活跃度未知"]
    });

    const snapshot = buildAgentSessionSnapshot({
      sessionId: "session-1",
      state,
      status: "shortlist",
      statusSummary: "正在查看 shortlist"
    });

    expect(snapshot).toMatchObject({
      sessionId: "session-1",
      status: "shortlist",
      statusSummary: "正在查看 shortlist",
      userGoal: "找做多智能体产品的工程负责人",
      currentShortlist: [
        {
          personId: "person-1",
          lastSyncedAt: "2026-03-29T00:00:00.000Z",
          latestEvidenceAt: "2026-03-28T00:00:00.000Z"
        }
      ],
      confidenceStatus: {
        level: "medium",
        updatedAt: "2026-03-31T00:00:00.000Z"
      }
    });
  });

  it("creates deterministic event envelopes and intervention summaries", () => {
    const event = createAgentSessionEvent({
      sessionId: "session-1",
      sequence: 2,
      type: "intervention_rejected",
      status: "waiting-input",
      summary: "移出 shortlist：person-1（已拒绝：candidate_not_found）",
      data: {
        command: {
          type: "remove_from_shortlist" as const,
          candidateId: "person-1"
        },
        reason: "candidate_not_found"
      },
      timestamp: new Date("2026-03-31T00:00:00.000Z")
    });

    expect(event).toMatchObject({
      sessionId: "session-1",
      sequence: 2,
      type: "intervention_rejected",
      status: "waiting-input",
      timestamp: "2026-03-31T00:00:00.000Z"
    });
    expect(summarizeInterventionCommand({
      type: "apply_feedback",
      tag: "less_academic"
    })).toBe("应用反馈：less_academic");
  });
});
