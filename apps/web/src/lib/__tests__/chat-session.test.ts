import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localStorage for browser environment
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

// Mock createProvider
vi.mock("@seeku/llm", () => ({
  createProvider: () => mockLLMProvider
}));

// Mock fetch for search API
global.fetch = vi.fn();

import { WebChatSession, extractConditions, reviseConditions, createEmptyConditions } from "../chat-session.js";
import type { SearchConditions } from "../chat-session.js";

describe("chat-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
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

  describe("extractConditions", () => {
    it("Test 1: should parse '找上海的AI工程师' into {skills: ['AI工程师'], locations: ['上海']}", async () => {
      mockLLMProvider.chat.mockResolvedValueOnce({
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
      });

      const result = await extractConditions("找上海的AI工程师");

      expect(result.skills).toContain("AI工程师");
      expect(result.locations).toContain("上海");
    });

    it("should handle empty input gracefully", async () => {
      const result = await extractConditions("");
      expect(result.skills).toEqual([]);
      expect(result.locations).toEqual([]);
    });

    it("should fallback to heuristic extraction on LLM failure", async () => {
      mockLLMProvider.chat.mockRejectedValue(new Error("Network error"));

      const result = await extractConditions("找上海的Python工程师");

      // Heuristic should extract known keywords
      expect(result.skills).toBeDefined();
      expect(Array.isArray(result.skills)).toBe(true);
    });
  });

  describe("reviseConditions", () => {
    it("Test 2: should update conditions when given '只要有大模型经验的'", async () => {
      mockLLMProvider.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          skills: ["AI工程师", "大模型"],
          locations: ["上海"],
          experience: "大模型经验",
          role: null,
          mustHave: ["大模型经验"],
          niceToHave: [],
          exclude: [],
          preferFresh: false,
          candidateAnchor: null,
          limit: 10
        })
      });

      const current: SearchConditions = {
        skills: ["AI工程师"],
        locations: ["上海"],
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

      const result = await reviseConditions(current, "只要有大模型经验的", "tighten");

      expect(result.mustHave).toContain("大模型经验");
      expect(result.skills).toContain("AI工程师");
    });

    it("should preserve existing conditions when relaxing", async () => {
      mockLLMProvider.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          skills: [],
          locations: [],
          experience: null,
          role: null,
          mustHave: [],
          niceToHave: [],
          exclude: [],
          preferFresh: false,
          candidateAnchor: null,
          limit: 10
        })
      });

      const current: SearchConditions = {
        skills: ["Python", "CUDA"],
        locations: ["北京"],
        experience: "5年",
        role: "AI工程师",
        sourceBias: undefined,
        mustHave: ["GPU经验"],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      };

      const result = await reviseConditions(current, "放宽要求", "relax");

      // In relax mode with "放宽要求", experience should be relaxed
      expect(result.skills).toEqual(["Python", "CUDA"]);
    });
  });

  describe("createEmptyConditions", () => {
    it("should return conditions with empty arrays and default limit", () => {
      const result = createEmptyConditions();
      expect(result.skills).toEqual([]);
      expect(result.locations).toEqual([]);
      expect(result.experience).toBeUndefined();
      expect(result.limit).toBe(10);
    });
  });
});

describe("WebChatSession", () => {
  let session: WebChatSession;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    session = new WebChatSession();
  });

  describe("messages state", () => {
    it("Test 4: should persist messages across multiple interactions", async () => {
      // Add first message
      session.addMessage({ role: "user", content: "找上海的AI工程师" });
      expect(session.messages.length).toBe(1);

      // Add second message
      session.addMessage({ role: "assistant", content: "找到 23 位候选人" });
      expect(session.messages.length).toBe(2);

      // Verify messages persist
      expect(session.messages[0].role).toBe("user");
      expect(session.messages[0].content).toBe("找上海的AI工程师");
      expect(session.messages[1].role).toBe("assistant");
    });

    it("should clear messages when reset", () => {
      session.addMessage({ role: "user", content: "test" });
      session.reset();
      expect(session.messages.length).toBe(0);
    });
  });

  describe("currentConditions state", () => {
    it("should track current search conditions", () => {
      expect(session.currentConditions).toBeDefined();
      expect(session.currentConditions.skills).toEqual([]);

      session.setCurrentConditions({
        skills: ["Python"],
        locations: ["北京"],
        limit: 10,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false
      });

      expect(session.currentConditions.skills).toContain("Python");
    });
  });

  describe("localStorage persistence", () => {
    it("should save session to localStorage", () => {
      session.addMessage({ role: "user", content: "test query" });
      session.saveToStorage();

      const stored = localStorageMock.getItem("seeku_chat_session");
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed.messages.length).toBe(1);
    });

    it("should load session from localStorage", () => {
      localStorageMock.setItem("seeku_chat_session", JSON.stringify({
        messages: [{ id: "1", role: "user", content: "saved query" }],
        currentConditions: { skills: [], locations: [], limit: 10, mustHave: [], niceToHave: [], exclude: [], preferFresh: false }
      }));

      const newSession = new WebChatSession();
      newSession.loadFromStorage();

      expect(newSession.messages.length).toBe(1);
      expect(newSession.messages[0].content).toBe("saved query");
    });
  });
});