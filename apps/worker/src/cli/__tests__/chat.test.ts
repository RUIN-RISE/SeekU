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

// Mock @seeku/llm
vi.mock("@seeku/llm", () => ({
  SiliconFlowProvider: {
    fromEnv: vi.fn(() => ({
      chat: vi.fn(async () => ({
        content: JSON.stringify({
          skills: ["RAG"],
          locations: ["Beijing"],
          experience: "3 years",
          role: "Engineer",
          limit: 10
        })
      }))
    }))
  }
}));

describe("ChatInterface", () => {
  let chat: ChatInterface;

  beforeEach(() => {
    chat = new ChatInterface();
    vi.clearAllMocks();
  });

  describe("extractConditions", () => {
    it("should extract structured data from natural language", async () => {
      const result = await chat.extractConditions("Need a RAG expert in Beijing");
      expect(result.skills).toContain("RAG");
      expect(result.locations).toContain("Beijing");
    });

    it("should handle malformed JSON from LLM", async () => {
      // Setup mock to fail JSON parsing once
      const mockLlm = chat["llm"];
      mockLlm.chat = vi.fn().mockResolvedValue({ content: "not a json" });
      
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
