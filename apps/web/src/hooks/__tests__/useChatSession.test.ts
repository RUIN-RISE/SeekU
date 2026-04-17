import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentPanelCandidateSnapshot } from "@/lib/agent-panel";

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

import { useChatSession } from "../useChatSession.js";
import { evaluateMissionStopPolicy } from "../mission-stop-policy.js";

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

function createSearchResponse(results: Array<{
  personId: string;
  name: string;
  headline?: string | null;
  matchScore: number;
  matchReasons?: string[];
}>, total = results.length) {
  return {
    results: results.map((candidate) => ({
      personId: candidate.personId,
      name: candidate.name,
      headline: candidate.headline ?? null,
      matchScore: candidate.matchScore,
      matchStrength: candidate.matchScore >= 0.85 ? "strong" : candidate.matchScore >= 0.7 ? "medium" : "weak",
      matchReasons: candidate.matchReasons ?? ["技能匹配"]
    })),
    total
  };
}

describe("useChatSession", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFetch.mockReset();
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
    const { result } = renderHook(() => useChatSession());

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

    const { result } = renderHook(() => useChatSession());

    await act(async () => {
      await result.current.sendMessage("找上海的 AI 工程师");
      await vi.runAllTimersAsync();
    });

    expect(result.current.mission?.missionId).toContain("mission-");
    expect(result.current.snapshot.currentShortlist.length).toBeGreaterThan(0);
    expect(result.current.events.length).toBeGreaterThan(0);
    expect(result.current.messages.some((message) => message.role === "assistant" && message.content.includes("我会先做一轮更大范围的候选探索"))).toBe(true);
  }, 15000);

  it("auto-stops after bounded rounds and produces a summary", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(async (_url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body ?? "{}"));
      const offset = Number(body.offset ?? 0);

      if (offset === 0) {
        return {
          ok: true,
          json: async () => createSearchResponse([
            { personId: "p1", name: "Ada", matchScore: 0.91 },
            { personId: "p2", name: "Lin", matchScore: 0.84 }
          ], 20)
        };
      }

      return {
        ok: true,
        json: async () => createSearchResponse([
          { personId: "p3", name: "Mina", matchScore: 0.89 },
          { personId: "p4", name: "Rui", matchScore: 0.81 }
        ], 20)
      };
    });

    const { result } = renderHook(() => useChatSession());

    await act(async () => {
      await result.current.sendMessage("找上海的 AI 工程师");
      await vi.runAllTimersAsync();
    });

    expect(result.current.mission?.phase).toBe("stopped");
    expect(result.current.mission?.stopReason).toBe("enough_compare");
    expect(result.current.snapshot.status).toBe("waiting-input");
    expect(result.current.snapshot.recommendedCandidate).toBeNull();
    expect(result.current.snapshot.activeCompareSet.length).toBeGreaterThanOrEqual(2);
    expect(result.current.messages[result.current.messages.length - 1]?.content).toContain("还不建议直接定第一名");
    expect(result.current.messages[result.current.messages.length - 1]?.toolResult?.results.length).toBeGreaterThan(0);
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

    const { result } = renderHook(() => useChatSession());

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

  it("reset clears mission, messages, and snapshot state", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => createSearchResponse([
        { personId: "p1", name: "Ada", matchScore: 0.91 }
      ], 10)
    });

    const { result } = renderHook(() => useChatSession());

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
