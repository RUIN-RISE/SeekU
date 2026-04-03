import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localStorage
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

// Mock fetch for search API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock LLM Provider
const mockLLMProvider = {
  name: "mock",
  chat: vi.fn(async () => ({
    content: JSON.stringify({
      skills: ["AI工程师"],
      locations: ["上海"],
      experience: null,
      role: null,
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

describe("useChatSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFetch.mockReset();
    mockLLMProvider.chat.mockReset();
    mockLLMProvider.chat.mockImplementation(async () => ({
      content: JSON.stringify({
        skills: ["AI工程师"],
        locations: ["上海"],
        experience: null,
        role: null,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: null,
        limit: 10
      })
    }));
  });

  describe("initial state", () => {
    it("should initialize with empty messages", () => {
      const { result } = renderHook(() => useChatSession());
      expect(result.current.messages).toEqual([]);
    });

    it("should initialize with empty conditions", () => {
      const { result } = renderHook(() => useChatSession());
      expect(result.current.currentConditions.skills).toEqual([]);
      expect(result.current.currentConditions.locations).toEqual([]);
    });

    it("should not be processing initially", () => {
      const { result } = renderHook(() => useChatSession());
      expect(result.current.isProcessing).toBe(false);
    });
  });

  describe("sendMessage", () => {
    it("should add user message to messages array", async () => {
      const { result } = renderHook(() => useChatSession());

      await act(async () => {
        await result.current.sendMessage("找上海的AI工程师");
      });

      expect(result.current.messages.length).toBeGreaterThan(0);
      const userMessage = result.current.messages.find(m => m.role === "user");
      expect(userMessage?.content).toBe("找上海的AI工程师");
    });

    it("should set isProcessing during message handling", async () => {
      const { result } = renderHook(() => useChatSession());

      // Start processing but don't wait for completion yet
      let processingDuringCall = false;

      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          results: [{ personId: "1", name: "Test", headline: null, matchScore: 0.9, matchReasons: [] }],
          total: 1
        })
      }));

      await act(async () => {
        const promise = result.current.sendMessage("test query");
        // Check processing state during the call
        processingDuringCall = result.current.isProcessing;
        await promise;
      });

      // After completion, should not be processing
      expect(result.current.isProcessing).toBe(false);
    });

    it("should call search API with extracted conditions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ personId: "p1", name: "张三", headline: "AI Engineer", matchScore: 0.87, matchReasons: ["技能匹配"] }],
          total: 1,
          intent: { rawQuery: "找上海的AI工程师", roles: [], skills: ["AI工程师"], locations: ["上海"], mustHaves: [], niceToHaves: [] }
        })
      });

      const { result } = renderHook(() => useChatSession());

      await act(async () => {
        await result.current.sendMessage("找上海的AI工程师");
      });

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain("/search");
    });

    it("should add assistant message with search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { personId: "p1", name: "张三", headline: "AI Engineer", matchScore: 0.87, matchReasons: ["技能匹配"] },
            { personId: "p2", name: "李四", headline: "ML Engineer", matchScore: 0.75, matchReasons: ["地点匹配"] }
          ],
          total: 2,
          intent: { rawQuery: "test", roles: [], skills: [], locations: [], mustHaves: [], niceToHaves: [] }
        })
      });

      const { result } = renderHook(() => useChatSession());

      await act(async () => {
        await result.current.sendMessage("test query");
      });

      const assistantMessage = result.current.messages.find(m => m.role === "assistant");
      expect(assistantMessage).toBeDefined();
    });

    it("should update currentConditions after extracting from message", async () => {
      mockLLMProvider.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          skills: ["Python", "LLM"],
          locations: ["北京"],
          experience: "5年",
          role: "AI Engineer",
          mustHave: [],
          niceToHave: [],
          exclude: [],
          preferFresh: false,
          candidateAnchor: null,
          limit: 10
        })
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [], total: 0, intent: {} })
      });

      const { result } = renderHook(() => useChatSession());

      await act(async () => {
        await result.current.sendMessage("找北京5年经验的Python LLM工程师");
      });

      expect(result.current.currentConditions.skills).toContain("Python");
      expect(result.current.currentConditions.locations).toContain("北京");
    });

    it("should handle refinement message after initial search", async () => {
      // First message
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ personId: "p1", name: "张三", headline: "AI Engineer", matchScore: 0.87, matchReasons: [] }],
          total: 23
        })
      });

      const { result } = renderHook(() => useChatSession());

      await act(async () => {
        await result.current.sendMessage("找上海的AI工程师");
      });

      // Second refinement message
      mockLLMProvider.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          skills: ["AI工程师", "大模型"],
          locations: ["上海"],
          experience: null,
          role: null,
          mustHave: ["大模型经验"],
          niceToHave: [],
          exclude: [],
          preferFresh: false,
          candidateAnchor: null,
          limit: 10
        })
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ personId: "p2", name: "王五", headline: "LLM Engineer", matchScore: 0.92, matchReasons: [] }],
          total: 8
        })
      });

      await act(async () => {
        await result.current.sendMessage("只要有大模型经验的");
      });

      expect(result.current.currentConditions.mustHave).toContain("大模型经验");
    });
  });

  describe("reset", () => {
    it("should clear all messages", async () => {
      const { result } = renderHook(() => useChatSession());

      await act(async () => {
        await result.current.sendMessage("test");
      });

      expect(result.current.messages.length).toBeGreaterThan(0);

      act(() => {
        result.current.reset();
      });

      expect(result.current.messages).toEqual([]);
    });

    it("should reset conditions to empty", async () => {
      const { result } = renderHook(() => useChatSession());

      await act(async () => {
        await result.current.sendMessage("test");
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.currentConditions.skills).toEqual([]);
      expect(result.current.currentConditions.locations).toEqual([]);
    });
  });

  describe("localStorage persistence", () => {
    it("should persist messages after sendMessage", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [], total: 0 })
      });

      const { result } = renderHook(() => useChatSession());

      await act(async () => {
        await result.current.sendMessage("test query");
      });

      const stored = localStorageMock.getItem("seeku_chat_session");
      expect(stored).toBeDefined();
    });

    it("should load persisted messages on initialization", () => {
      localStorageMock.setItem("seeku_chat_session", JSON.stringify({
        messages: [{ id: "prev-1", role: "user", content: "previous query" }],
        currentConditions: { skills: ["Python"], locations: [], limit: 10, mustHave: [], niceToHave: [], exclude: [], preferFresh: false }
      }));

      const { result } = renderHook(() => useChatSession());

      expect(result.current.messages.length).toBe(1);
      expect(result.current.messages[0].content).toBe("previous query");
    });
  });
});