import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../../server.js";
import type {
  AgentPanelInterventionCommand,
  AgentPanelInterventionResult,
  AgentPanelSessionEvent,
  AgentPanelSessionSnapshot,
  AgentSessionBridge
} from "../agent-panel.js";

const SNAPSHOT: AgentPanelSessionSnapshot = {
  sessionId: "session-1",
  status: "waiting-input",
  statusSummary: "等待输入",
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
    preferFresh: true,
    candidateAnchor: undefined,
    limit: 10
  },
  currentShortlist: [],
  activeCompareSet: [],
  confidenceStatus: {
    level: "low",
    rationale: undefined,
    updatedAt: "2026-04-17T00:30:00.000Z"
  },
  recommendedCandidate: null,
  openUncertainties: [],
  clarificationCount: 0,
  searchHistory: []
};

function createBridge(overrides: Partial<AgentSessionBridge> = {}): AgentSessionBridge {
  const bridge: AgentSessionBridge = {
    hasSession: (sessionId: string) => sessionId === "session-1",
    getSnapshot: (sessionId: string) => sessionId === "session-1" ? SNAPSHOT : null,
    subscribe: (sessionId: string, listener: (event: AgentPanelSessionEvent) => void) => {
      if (sessionId !== "session-1") {
        return null;
      }

      const event: AgentPanelSessionEvent = {
        sessionId,
        sequence: 1,
        timestamp: "2026-04-17T00:31:00.000Z",
        type: "status_changed",
        status: "waiting-input",
        summary: "等待输入",
        data: {
          status: "waiting-input",
          statusSummary: "等待输入"
        }
      };
      listener(event);
      return () => {};
    },
    applyIntervention: async (
      sessionId: string,
      command: AgentPanelInterventionCommand
    ): Promise<AgentPanelInterventionResult | null> => {
      if (sessionId !== "session-1") {
        return null;
      }

      return {
        ok: true,
        command,
        summary: "accepted",
        snapshot: SNAPSHOT
      } satisfies AgentPanelInterventionResult;
    },
    ...overrides
  };

  return bridge;
}

describe("Agent panel routes", () => {
  let server: FastifyInstance | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("streams the initial snapshot for an existing session", async () => {
    server = await buildApiServer({ agentSessionBridge: createBridge() });

    const response = await server.inject({
      method: "GET",
      url: "/agent-panel/session-1/events?once=1"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: snapshot");
    expect(response.body).toContain("\"sessionId\":\"session-1\"");
  });

  it("returns 404 for missing event sessions", async () => {
    server = await buildApiServer({ agentSessionBridge: createBridge() });

    const response = await server.inject({
      method: "GET",
      url: "/agent-panel/missing/events"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "session_not_found"
    });
  });

  it("accepts valid intervention commands", async () => {
    const applyIntervention = vi.fn(async (): Promise<AgentPanelInterventionResult> => ({
      ok: true,
      command: {
        type: "add_to_compare" as const,
        candidateId: "person-1"
      },
      summary: "accepted",
      snapshot: SNAPSHOT
    }));
    server = await buildApiServer({
      agentSessionBridge: createBridge({ applyIntervention })
    });

    const response = await server.inject({
      method: "POST",
      url: "/agent-panel/session-1/interventions",
      payload: {
        type: "add_to_compare",
        candidateId: "person-1"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(applyIntervention).toHaveBeenCalledWith("session-1", {
      type: "add_to_compare",
      candidateId: "person-1"
    });
  });

  it("returns 409 for rejected interventions", async () => {
    server = await buildApiServer({
      agentSessionBridge: createBridge({
        applyIntervention: async () => ({
          ok: false,
          command: {
            type: "remove_from_shortlist",
            candidateId: "missing"
          },
          reason: "candidate_not_found",
          summary: "rejected",
          snapshot: SNAPSHOT
        })
      })
    });

    const response = await server.inject({
      method: "POST",
      url: "/agent-panel/session-1/interventions",
      payload: {
        type: "remove_from_shortlist",
        candidateId: "missing"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "intervention_rejected",
      reason: "candidate_not_found"
    });
  });

  it("returns 400 for invalid intervention payloads", async () => {
    server = await buildApiServer({ agentSessionBridge: createBridge() });

    const response = await server.inject({
      method: "POST",
      url: "/agent-panel/session-1/interventions",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_request"
    });
  });
});
