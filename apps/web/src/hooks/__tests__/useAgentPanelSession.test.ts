import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentPanelSession } from "../useAgentPanelSession.js";
import type {
  AgentPanelInterventionCommand,
  AgentPanelSessionEvent,
  AgentPanelSessionSnapshot
} from "@/lib/agent-panel";

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
  currentShortlist: [
    {
      personId: "person-1",
      name: "Ada",
      headline: "Engineering Manager",
      location: "上海",
      company: "Seeku",
      experienceYears: 8,
      matchScore: 0.91,
      profile: {
        summary: "负责过 agent runtime 与搜索平台。",
        highlights: ["做过多智能体平台治理"]
      },
      queryReasons: ["角色贴合"],
      sources: ["GitHub"]
    }
  ],
  activeCompareSet: [],
  confidenceStatus: {
    level: "low",
    rationale: "证据还不够。",
    updatedAt: "2026-04-17T01:00:00.000Z"
  },
  recommendedCandidate: null,
  openUncertainties: ["最近 90 天活跃度不足"],
  clarificationCount: 1,
  searchHistory: []
};

const RECOMMENDATION_EVENT: AgentPanelSessionEvent = {
  sessionId: "session-1",
  sequence: 2,
  timestamp: "2026-04-17T01:05:00.000Z",
  type: "recommendation_updated",
  status: "waiting-input",
  summary: "推荐候选人已更新为 Ada。",
  data: {
    recommendedCandidate: {
      candidate: SNAPSHOT.currentShortlist[0],
      rationale: "角色与近期执行都更贴近目标。",
      createdAt: "2026-04-17T01:05:00.000Z",
      confidenceLevel: "medium"
    }
  }
};

function formatSnapshotResponse(snapshot: AgentPanelSessionSnapshot): string {
  return `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  onerror: (() => void) | null = null;
  readonly url: string;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener as (event: MessageEvent<string>) => void);
    this.listeners.set(type, existing);
  }

  emit(type: string, data: unknown) {
    const message = {
      data: JSON.stringify(data)
    } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(message);
    }
  }

  close() {
    this.closed = true;
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

describe("useAgentPanelSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.reset();
  });

  it("hydrates from snapshot and applies incoming events", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => formatSnapshotResponse(SNAPSHOT)
    });

    const { result } = renderHook(() => useAgentPanelSession("session-1"));

    await waitFor(() => {
      expect(result.current.snapshot?.sessionId).toBe("session-1");
    });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(result.current.connectionStatus).toBe("connecting");

    act(() => {
      MockEventSource.instances[0].emit("snapshot", SNAPSHOT);
      MockEventSource.instances[0].emit("recommendation_updated", RECOMMENDATION_EVENT);
    });

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe("live");
      expect(result.current.snapshot?.recommendedCandidate?.candidate.personId).toBe("person-1");
      expect(result.current.events).toHaveLength(1);
    });
  });

  it("marks the session as missing when snapshot fetch returns 404", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => ""
    });

    const { result } = renderHook(() => useAgentPanelSession("missing-session"));

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe("missing");
      expect(result.current.errorMessage).toContain("session");
    });
  });

  it("submits bounded interventions and surfaces rejection notices", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => formatSnapshotResponse(SNAPSHOT)
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: "intervention_rejected",
          summary: "加入 compare 被拒绝：candidate_not_found",
          snapshot: SNAPSHOT
        })
      });

    const { result } = renderHook(() => useAgentPanelSession("session-1"));

    await waitFor(() => {
      expect(result.current.snapshot?.sessionId).toBe("session-1");
    });

    await act(async () => {
      await result.current.sendIntervention({
        type: "add_to_compare",
        candidateId: "missing"
      } satisfies AgentPanelInterventionCommand);
    });

    expect(result.current.latestNotice?.kind).toBe("error");
    expect(result.current.latestNotice?.message).toContain("被拒绝");
  });
});
