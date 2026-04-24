import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatInterface } from "../chat.js";

const mockInputRun = vi.fn().mockResolvedValue("test answer");
const mockInputCancel = vi.fn().mockResolvedValue(undefined);

// Mock enquirer
vi.mock("enquirer", () => {
  return {
    default: {
      Input: class {
        run = mockInputRun;
        cancel = mockInputCancel;
      }
    }
  };
});

// Mock LLM Provider
const mockLLMProvider = {
  name: "mock",
  chat: vi.fn(async () => ({
    content: JSON.stringify({
      skills: ["RAG"],
      locations: ["Beijing"],
      experience: "3 years",
      role: "Engineer",
      limit: 10
    })
  })),
  embed: vi.fn(),
  embedBatch: vi.fn()
};

describe("ChatInterface", () => {
  let chat: ChatInterface;

  beforeEach(() => {
    chat = new ChatInterface(mockLLMProvider as any);
    vi.clearAllMocks();
    mockInputRun.mockResolvedValue("test answer");
    mockInputCancel.mockResolvedValue(undefined);
  });

  describe("extractConditions", () => {
    it("should extract structured data from natural language", async () => {
      const result = await chat.extractConditions("Need a RAG expert in Beijing");
      expect(result.skills).toContain("RAG");
      expect(result.locations).toContain("Beijing");
    });

    it("should handle malformed JSON from LLM", async () => {
      mockLLMProvider.chat.mockResolvedValueOnce({ content: "not a json" });

      const result = await chat.extractConditions("invalid");
      expect(result).toHaveProperty("skills");
      expect(Array.isArray(result.skills)).toBe(true);
    });
  });

  describe("detectMissing", () => {
    it("should identify missing skills and locations", () => {
      const missing = chat.detectMissing({ skills: [], locations: [] });
      expect(missing).toContain("skills");
      expect(missing).toContain("locations");
    });

    it("should return empty array if all core fields present", () => {
      const missing = chat.detectMissing({ skills: ["abc"], locations: ["xyz"], experience: "1y" });
      expect(missing.length).toBe(0);
    });

    it("does not require skills or experience for education-background searches", () => {
      const missing = chat.detectMissing({
        skills: [],
        locations: [],
        experience: undefined,
        role: "学生",
        mustHave: ["zhejiang university"],
        niceToHave: ["本科生"]
      });

      expect(missing).not.toContain("skills");
      expect(missing).not.toContain("experience");
    });
  });

  describe("refineConditions", () => {
    it("should keep experience undefined when user skips the follow-up", async () => {
      vi.spyOn(chat, "extractConditions").mockResolvedValue({
        skills: ["RAG"],
        locations: ["Beijing"],
        limit: 10
      });
      vi.spyOn(chat, "askFollowUp").mockResolvedValue("跳过");

      const result = await chat.refineConditions("Need a RAG expert in Beijing");

      expect(result.experience).toBeUndefined();
    });
  });

  describe("reviseConditions", () => {
    it("should resolve shortlist candidate anchor from refine context", async () => {
      mockLLMProvider.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          skills: [],
          locations: ["杭州"],
          experience: null,
          role: "后端",
          sourceBias: "bonjour",
          mustHave: [],
          niceToHave: ["后端"],
          exclude: ["销售"],
          preferFresh: true,
          candidateAnchor: { shortlistIndex: 2 },
          limit: 10
        })
      });

      const result = await chat.reviseConditions(
        {
          skills: ["python"],
          locations: ["杭州"],
          experience: undefined,
          role: undefined,
          sourceBias: undefined,
          mustHave: [],
          niceToHave: [],
          exclude: [],
          preferFresh: false,
          candidateAnchor: undefined,
          limit: 10
        },
        "像 2 号但更偏后端，先看最近活跃，不要销售，更偏 Bonjour",
        "edit",
        {
          shortlist: [
            {
              shortlistIndex: 2,
              personId: "person-2",
              name: "Ada",
              headline: "创始人 / 后端工程师",
              location: "杭州",
              sources: ["Bonjour"],
              matchReason: "后端与地点匹配"
            }
          ]
        }
      );

      expect(result.role).toBe("后端");
      expect(result.sourceBias).toBe("bonjour");
      expect(result.preferFresh).toBe(true);
      expect(result.exclude).toContain("销售");
      expect(result.candidateAnchor).toEqual({
        shortlistIndex: 2,
        personId: "person-2",
        name: "Ada"
      });
    });

    it("should fall back to heuristic relax updates when llm revision fails", async () => {
      mockLLMProvider.chat.mockRejectedValue(new Error("Request was aborted."));

      const result = await chat.reviseConditions(
        {
          skills: ["python"],
          locations: ["杭州"],
          experience: "后端经验",
          role: "python工程师",
          mustHave: [],
          niceToHave: [],
          exclude: [],
          preferFresh: false,
          candidateAnchor: undefined,
          limit: 10
        },
        "放宽要求给我提供几个bonjour人选",
        "relax"
      );

      expect(result.experience).toBeUndefined();
      expect(result.sourceBias).toBe("bonjour");
      expect(result.locations).toEqual(["杭州"]);
    });
  });

  describe("askFollowUp", () => {
    it("should cancel the prompt when input times out", async () => {
      vi.useFakeTimers();
      let rejectPrompt: ((error?: unknown) => void) | undefined;
      mockInputRun.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectPrompt = reject;
          })
      );
      mockInputCancel.mockImplementation(async (error?: unknown) => {
        rejectPrompt?.(error);
      });

      try {
        const resultPromise = chat.askFollowUp("experience");
        await vi.advanceTimersByTimeAsync(120000);
        const result = await resultPromise;

        expect(result).toBe("");
        expect(mockInputCancel).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
