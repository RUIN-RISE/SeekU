import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatInterface } from "../chat.js";

// Mock enquirer
vi.mock("enquirer", () => {
  return {
    default: {
      Input: class {
        run = vi.fn().mockResolvedValue("test answer");
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
  });
});