import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentPanelCandidateSnapshot, AgentPanelSessionSnapshot } from "@/lib/agent-panel";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockLLMProvider = {
  name: "mock",
  chat: vi.fn(async () => ({
    content: JSON.stringify({
      skills: ["AI工程师"],
      locations: ["上海"],
      experience: null,
      role: "AI Engineer",
      mustHave: [],
      niceToHave: [],
      exclude: [],
      preferFresh: false,
      candidateAnchor: null,
      limit: 10
    })
  })),
  embed: vi.fn(),
  embedBatch: vi.fn()
};

vi.mock("@seeku/llm", () => ({
  createProvider: () => mockLLMProvider
}));

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  onerror: (() => void) | null = null;
  readonly url: string;

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
    const message = { data: JSON.stringify(data) } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(message);
    }
  }

  close() {}

  static reset() {
    MockEventSource.instances = [];
  }
}

vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

import { useChatSession } from "../useChatSession.js";
import { evaluateMissionStopPolicy } from "../mission-stop-policy.js";
import {
  MISSION_REPLAY_CASES,
  classifyReplayResult,
  createReplaySearchResponse,
  replayResponsesForCase,
  type MissionReplayCase
} from "./mission-replay-fixtures.js";

function createCandidateSnapshot(personId: string, name: string, matchScore: number): AgentPanelCandidateSnapshot {
  return {
    personId,
    name,
    headline: null,
    location: null,
    company: null,
    experienceYears: null,
    matchScore,
    queryReasons: [],
    sources: ["search"]
  };
}

const createSearchResponse = createReplaySearchResponse;

function queueMissionResponses(...responses: Array<ReturnType<typeof createSearchResponse>>) {
  const queue = [...responses];
  const sessionId = "runtime-session-1";

  mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.includes("/chat-missions")) {
      const first = queue.shift() ?? createSearchResponse([], 0);
      const snapshot = createRuntimeSnapshotFromResponse(sessionId, first);
      queueRuntimeEvents(sessionId, queue);
      return {
        ok: true,
        json: async () => ({
          sessionId,
          snapshot
        })
      };
    }

    if (url.includes("/search")) {
      const next = queue.shift() ?? createSearchResponse([], 0);
      return {
        ok: true,
        json: async () => next
      };
    }

    if (url.includes(`/agent-panel/${sessionId}/events?once=1`)) {
      const snapshot = createRuntimeSnapshotFromResponse(sessionId, createSearchResponse([], 0));
      return {
        ok: true,
        status: 200,
        text: async () => `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`
      };
    }

    throw new Error(`Unhandled fetch url in test: ${url}`);
  });
}

function createRuntimeSnapshotFromResponse(sessionId: string, response: ReturnType<typeof createSearchResponse>): AgentPanelSessionSnapshot {
  const shortlist = response.results.slice(0, 5).map((candidate) => ({
    personId: candidate.personId,
    name: candidate.name,
    headline: candidate.headline,
    location: null,
    company: null,
    experienceYears: null,
    matchScore: candidate.matchScore,
    queryReasons: candidate.matchReasons,
    sources: ["search"]
  }));
  const compareSet = shortlist.filter((candidate) => candidate.matchScore >= 0.75).slice(0, 3);

  return {
    sessionId,
    status: compareSet.length >= 2 ? "comparing" : "waiting-input",
    statusSummary: "runtime-backed snapshot",
    userGoal: "runtime goal",
    currentConditions: {
      skills: ["AI工程师"],
      locations: ["上海"],
      experience: undefined,
      role: "AI Engineer",
      sourceBias: undefined,
      mustHave: [],
      niceToHave: [],
      exclude: [],
      preferFresh: false,
      candidateAnchor: undefined,
      limit: 10
    },
    currentShortlist: shortlist,
    activeCompareSet: compareSet,
    confidenceStatus: {
      level: "low",
      rationale: "runtime-backed",
      updatedAt: "2026-04-18T00:00:00.000Z"
    },
    recommendedCandidate: null,
    openUncertainties: [],
    clarificationCount: 0,
    searchHistory: []
  };
}

function queueRuntimeEvents(sessionId: string, remainingResponses: Array<ReturnType<typeof createSearchResponse>>) {
  queueMicrotask(() => {
    const instance = MockEventSource.instances.find((item) => item.url.includes(`/agent-panel/${sessionId}/events`));
    if (!instance) return;

    let round = 0;
    for (const response of remainingResponses) {
      round += 1;
      const snapshot = createRuntimeSnapshotFromResponse(sessionId, response);
      instance.emit("snapshot", snapshot);
      instance.emit("search_started", {
        sessionId,
        sequence: round,
        timestamp: "2026-04-18T00:00:00.000Z",
        type: "search_started",
        status: "searching",
        summary: `第 ${round} 轮搜索已开始。`,
        data: { round }
      });
    }

    const final = remainingResponses[remainingResponses.length - 1];
    if (final) {
      const finalSnapshot = createRuntimeSnapshotFromResponse(sessionId, final);
      finalSnapshot.status = "waiting-input";
      finalSnapshot.statusSummary = "runtime-backed mission 已停止。";
      instance.emit("snapshot", finalSnapshot);
    }
  });
}

function expectedFocusAssertions(result: ReturnType<typeof renderHook<typeof useChatSession>>["result"], testCase: MissionReplayCase) {
  if (testCase.expectedFocus === "compare") {
    expect(result.current.snapshot.activeCompareSet.length).toBeGreaterThanOrEqual(2);
  }

  if (testCase.expectedFocus === "shortlist") {
    expect(result.current.snapshot.recommendedCandidate).toBeNull();
    expect(result.current.snapshot.currentShortlist.length).toBeGreaterThan(0);
  }

  if (testCase.expectedFocus === "clarification") {
    expect(result.current.snapshot.activeCompareSet).toHaveLength(0);
    expect(result.current.snapshot.openUncertainties[0]).toContain("方向");
  }
}

function collectReplayEvidence(result: ReturnType<typeof renderHook<typeof useChatSession>>["result"]) {
  const finalMessage = result.current.messages[result.current.messages.length - 1]?.content ?? "";
  return {
    stopReason: result.current.mission?.stopReason,
    phase: result.current.mission?.phase,
    summary: finalMessage,
    uncertainty: result.current.snapshot.openUncertainties,
    compareCount: result.current.snapshot.activeCompareSet.length,
    shortlistCount: result.current.snapshot.currentShortlist.length
  };
}

describe("useChatSession", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFetch.mockReset();
    MockEventSource.reset();
    mockLLMProvider.chat.mockReset();
    mockLLMProvider.chat.mockImplementation(async () => ({
      content: JSON.stringify({
        skills: ["AI工程师"],
        locations: ["上海"],
        experience: null,
        role: "AI Engineer",
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: null,
        limit: 10
      })
    }));
  });

  it("initializes with mission-aware empty state", () => {
    const { result } = renderHook(() => useChatSession({ runtimeStartEnabled: false }));

    expect(result.current.messages).toEqual([]);
    expect(result.current.mission).toBeNull();
    expect(result.current.snapshot.status).toBe("idle");
  });

  it("blocks enough_compare before the exploration floor is met", () => {
    const decision = evaluateMissionStopPolicy({
      round: 2,
      shortlist: [
        createCandidateSnapshot("p1", "Ada", 0.92),
        createCandidateSnapshot("p2", "Lin", 0.88)
      ],
      compareSet: [
        createCandidateSnapshot("p1", "Ada", 0.92),
        createCandidateSnapshot("p2", "Lin", 0.88)
      ],
      newTop: 1
    });

    expect(decision.stopReason).toBeNull();
    expect(decision.assessment).toBe("exploration_floor_not_met");
  });

  it("stops for enough_compare once the exploration floor is met", () => {
    const decision = evaluateMissionStopPolicy({
      round: 3,
      shortlist: [
        createCandidateSnapshot("p1", "Ada", 0.92),
        createCandidateSnapshot("p2", "Lin", 0.88),
        createCandidateSnapshot("p3", "Mina", 0.84)
      ],
      compareSet: [
        createCandidateSnapshot("p1", "Ada", 0.92),
        createCandidateSnapshot("p2", "Lin", 0.88)
      ],
      newTop: 1
    });

    expect(decision.stopReason).toBe("enough_compare");
    expect(decision.shouldRecommend).toBe(false);
  });

  it("routes scattered late results to clarification instead of a weak wrap-up", () => {
    const decision = evaluateMissionStopPolicy({
      round: 4,
      shortlist: [
        createCandidateSnapshot("p1", "Ada", 0.79),
        createCandidateSnapshot("p2", "Lin", 0.74)
      ],
      compareSet: [],
      newTop: 2
    });

    expect(decision.stopReason).toBe("needs_user_clarification");
    expect(decision.assessment).toBe("clarification_blocked");
  });

  it("starts a bounded search mission from the first user message", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(async (_url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body ?? "{}"));
      const offset = Number(body.offset ?? 0);

      if (offset === 0) {
        return {
          ok: true,
          json: async () => createSearchResponse([
            { personId: "p1", name: "Ada", matchScore: 0.92 },
            { personId: "p2", name: "Lin", matchScore: 0.88 }
          ], 20)
        };
      }

      return {
        ok: true,
        json: async () => createSearchResponse([
          { personId: "p3", name: "Mina", matchScore: 0.9 },
          { personId: "p4", name: "Rui", matchScore: 0.82 }
        ], 20)
      };
    });

    const { result } = renderHook(() => useChatSession({ runtimeStartEnabled: false }));

    await act(async () => {
      await result.current.sendMessage("找上海的 AI 工程师");
      await vi.runAllTimersAsync();
    });

    expect(result.current.mission?.missionId).toContain("mission-");
    expect(result.current.snapshot.currentShortlist.length).toBeGreaterThan(0);
    expect(result.current.events.length).toBeGreaterThan(0);
    expect(result.current.messages.some((message) => message.role === "assistant" && message.content.includes("我会先做一轮更大范围的候选探索"))).toBe(true);
  }, 15000);

  it("attaches to a runtime-backed mission when the chat-missions route succeeds", async () => {
    const runtimeSnapshot: AgentPanelSessionSnapshot = {
      sessionId: "runtime-session-1",
      status: "searching",
      statusSummary: "runtime session 正在搜索。",
      userGoal: "找上海的 AI 工程师",
      currentConditions: {
        skills: ["AI工程师"],
        locations: ["上海"],
        experience: undefined,
        role: "AI Engineer",
        sourceBias: undefined,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      },
      currentShortlist: [],
      activeCompareSet: [],
      confidenceStatus: {
        level: "low",
        rationale: "runtime-backed",
        updatedAt: "2026-04-18T00:00:00.000Z"
      },
      recommendedCandidate: null,
      openUncertainties: ["任务刚启动，正在扩大搜索范围。"],
      clarificationCount: 0,
      searchHistory: []
    };

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/chat-missions")) {
        return {
          ok: true,
          json: async () => ({
            sessionId: "runtime-session-1",
            snapshot: runtimeSnapshot
          })
        };
      }

      if (url.includes("/agent-panel/runtime-session-1/events?once=1")) {
        return {
          ok: true,
          status: 200,
          text: async () => `event: snapshot\ndata: ${JSON.stringify(runtimeSnapshot)}\n\n`
        };
      }

      throw new Error(`Unhandled fetch url in runtime start test: ${url}`);
    });

    const { result } = renderHook(() => useChatSession());

    await act(async () => {
      await result.current.sendMessage("找上海的 AI 工程师");
    });

    await waitFor(() => {
      expect(result.current.mission?.missionId).toBe("runtime-session-1");
    });

    expect(result.current.mission?.latestSummary).toContain("runtime session");
    expect(result.current.snapshot.sessionId).toBe("runtime-session-1");
    expect(result.current.messages.some((message) =>
      message.role === "assistant" && message.content.includes("已接入 runtime-backed mission")
    )).toBe(true);
  });

  it("routes attached runtime feedback through intervention commands instead of local mission fallback", async () => {
    const runtimeSnapshot: AgentPanelSessionSnapshot = {
      sessionId: "runtime-session-1",
      status: "waiting-input",
      statusSummary: "等待你收紧方向。",
      userGoal: "找上海的 AI 工程师",
      currentConditions: {
        skills: ["AI工程师"],
        locations: ["上海"],
        experience: undefined,
        role: "AI Engineer",
        sourceBias: undefined,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      },
      currentShortlist: [],
      activeCompareSet: [],
      confidenceStatus: {
        level: "low",
        rationale: "runtime-backed",
        updatedAt: "2026-04-18T00:00:00.000Z"
      },
      recommendedCandidate: null,
      openUncertainties: [],
      clarificationCount: 0,
      searchHistory: []
    };

    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.includes("/agent-panel/runtime-session-1/events?once=1")) {
        return {
          ok: true,
          status: 200,
          text: async () => `event: snapshot\ndata: ${JSON.stringify(runtimeSnapshot)}\n\n`
        };
      }

      if (url.includes("/agent-panel/runtime-session-1/interventions")) {
        expect(JSON.parse(String(options?.body ?? "{}"))).toMatchObject({
          type: "apply_feedback",
          tag: "less_academic"
        });

        return {
          ok: true,
          status: 202,
          json: async () => ({
            ok: true,
            summary: "已按 runtime 指令降低学术导向权重。",
            snapshot: runtimeSnapshot
          })
        };
      }

      throw new Error(`Unhandled fetch url in attached runtime correction test: ${url}`);
    });

    const { result } = renderHook(() => useChatSession({ attachedSessionId: "runtime-session-1" }));

    await waitFor(() => {
      expect(result.current.snapshot.sessionId).toBe("runtime-session-1");
    });

    await act(async () => {
      await result.current.sendMessage("别太学术");
    });

    await waitFor(() => {
      expect(result.current.mission?.missionId).toBe("runtime-session-1");
      expect(result.current.mission?.corrections).toHaveLength(1);
      expect(result.current.messages.some((message) =>
        message.role === "assistant" && message.content.includes("降低学术导向权重")
      )).toBe(true);
    });

    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/search"),
      expect.anything()
    );
  });

  it("surfaces explicit degraded guidance for attached runtime sessions instead of falling back locally", async () => {
    const runtimeSnapshot: AgentPanelSessionSnapshot = {
      sessionId: "runtime-session-1",
      status: "waiting-input",
      statusSummary: "等待输入",
      userGoal: "找上海的 AI 工程师",
      currentConditions: {
        skills: ["AI工程师"],
        locations: ["上海"],
        experience: undefined,
        role: "AI Engineer",
        sourceBias: undefined,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      },
      currentShortlist: [],
      activeCompareSet: [],
      confidenceStatus: {
        level: "low",
        rationale: "runtime-backed",
        updatedAt: "2026-04-18T00:00:00.000Z"
      },
      recommendedCandidate: null,
      openUncertainties: [],
      clarificationCount: 0,
      searchHistory: []
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => `event: snapshot\ndata: ${JSON.stringify(runtimeSnapshot)}\n\n`
    });

    const { result } = renderHook(() => useChatSession({ attachedSessionId: "runtime-session-1" }));

    await waitFor(() => {
      expect(result.current.snapshot.sessionId).toBe("runtime-session-1");
    });

    act(() => {
      MockEventSource.instances[0].onerror?.();
    });

    await act(async () => {
      await result.current.sendMessage("更看近期执行");
    });

    expect(result.current.runtimeConnectionStatus).toBe("disconnected");
    expect(result.current.messages[result.current.messages.length - 1]?.content).toContain("当前 runtime 连接已中断");
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/search"),
      expect.anything()
    );
  });

  it.each(MISSION_REPLAY_CASES)("replays mission case: $id", async (testCase) => {
    vi.useFakeTimers();
    queueMissionResponses(...replayResponsesForCase(testCase));

    const { result } = renderHook(() => useChatSession({ runtimeStartEnabled: false }));

    await act(async () => {
      await result.current.sendMessage(testCase.prompt);
      await vi.runAllTimersAsync();
    });

    expect(result.current.mission?.phase).toBe(testCase.expectedPhase);
    expect(result.current.mission?.stopReason).toBe(testCase.expectedStopReason);
    expect(result.current.snapshot.status).toBe("waiting-input");
    expect(result.current.snapshot.recommendedCandidate).toBeNull();

    const finalMessage = result.current.messages[result.current.messages.length - 1]?.content ?? "";
    for (const snippet of testCase.expectedSummaryIncludes) {
      expect(finalMessage).toContain(snippet);
    }

    for (const snippet of testCase.expectedUncertaintyIncludes) {
      expect(result.current.snapshot.openUncertainties.some((item) => item.includes(snippet))).toBe(true);
    }

    expectedFocusAssertions(result, testCase);

    const replayResult = classifyReplayResult(testCase, collectReplayEvidence(result));
    expect(replayResult.passed).toBe(true);
    expect(replayResult.mismatches).toEqual([]);
  }, 15000);

  it("applies mid-run course correction within the same mission", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(async (_url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body ?? "{}"));
      const offset = Number(body.offset ?? 0);
      const query = String(body.query ?? "");

      if (query.includes("上海")) {
        return {
          ok: true,
          json: async () => createSearchResponse([
            { personId: "p2", name: "Mina", matchScore: 0.94 },
            { personId: "p3", name: "Rui", matchScore: 0.87 }
          ], 20)
        };
      }

      if (offset === 0) {
        return {
          ok: true,
          json: async () => createSearchResponse([
            { personId: "p1", name: "Ada", matchScore: 0.78 }
          ], 20)
        };
      }

      return {
        ok: true,
        json: async () => createSearchResponse([
          { personId: "p4", name: "Lin", matchScore: 0.76 }
        ], 20)
      };
    });

    const { result } = renderHook(() => useChatSession({ runtimeStartEnabled: false }));

    await act(async () => {
      await result.current.sendMessage("找 AI 工程师");
    });

    const missionId = result.current.mission?.missionId;

    await act(async () => {
      await result.current.sendMessage("先只看上海");
      await vi.runAllTimersAsync();
    });

    expect(result.current.mission?.missionId).toBe(missionId);
    expect(result.current.mission?.corrections.length).toBe(1);
    expect(result.current.mission?.phase).toBe("stopped");
    expect(result.current.snapshot.status).toBe("waiting-input");
  }, 15000);

  it("supports retarget corrections without spawning a new mission", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(async (_url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body ?? "{}"));
      const query = String(body.query ?? "");

      if (query.includes("换成产品负责人")) {
        return {
          ok: true,
          json: async () => createSearchResponse([
            { personId: "p5", name: "Nora", matchScore: 0.93 },
            { personId: "p6", name: "Kai", matchScore: 0.88 }
          ], 20)
        };
      }

      return {
        ok: true,
        json: async () => createSearchResponse([
          { personId: "p1", name: "Ada", matchScore: 0.79 },
          { personId: "p2", name: "Lin", matchScore: 0.76 }
        ], 20)
      };
    });

    const { result } = renderHook(() => useChatSession({ runtimeStartEnabled: false }));

    await act(async () => {
      await result.current.sendMessage("找 AI 工程师");
    });

    const missionId = result.current.mission?.missionId;

    await act(async () => {
      await result.current.sendMessage("换成产品负责人，更看上海");
      await vi.runAllTimersAsync();
    });

    expect(result.current.mission?.missionId).toBe(missionId);
    expect(result.current.mission?.corrections).toHaveLength(1);
    expect(result.current.mission?.corrections[0]?.type).toBe("retarget");
    expect(result.current.events.some((event) =>
      event.type === "conditions_updated" && event.data?.correctionType === "retarget"
    )).toBe(true);
    expect(result.current.messages.some((message) =>
      message.role === "assistant" && message.content.includes("按这个方向继续当前 mission")
    )).toBe(true);
  }, 15000);

  it("stops cleanly when the user asks to pause and show current results", async () => {
    vi.useFakeTimers();
    queueMissionResponses(
      createSearchResponse([
        { personId: "p1", name: "Ada", matchScore: 0.91 },
        { personId: "p2", name: "Lin", matchScore: 0.83 }
      ], 20)
    );

    const { result } = renderHook(() => useChatSession({ runtimeStartEnabled: false }));

    await act(async () => {
      await result.current.sendMessage("找上海的 AI 工程师");
      await vi.advanceTimersByTimeAsync(120);
    });

    const missionId = result.current.mission?.missionId;

    await act(async () => {
      await result.current.sendMessage("先停一下，直接汇报");
    });

    expect(result.current.mission?.missionId).toBe(missionId);
    expect(result.current.mission?.phase).toBe("stopped");
    expect(result.current.mission?.stopReason).toBe("enough_compare");
    expect(result.current.snapshot.status).toBe("waiting-input");
    expect(result.current.messages[result.current.messages.length - 1]?.content).toContain("收到，我先停在这里并给你当前结果");
    expect(result.current.messages[result.current.messages.length - 1]?.content).toContain("当前 compare 集合");
  }, 15000);

  it("reset clears mission, messages, and snapshot state", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => createSearchResponse([
        { personId: "p1", name: "Ada", matchScore: 0.91 }
      ], 10)
    });

    const { result } = renderHook(() => useChatSession({ runtimeStartEnabled: false }));

    await act(async () => {
      await result.current.sendMessage("找 AI 工程师");
      await vi.advanceTimersByTimeAsync(200);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.mission).toBeNull();
    expect(result.current.snapshot.status).toBe("idle");
    expect(result.current.events).toEqual([]);
  });
});
