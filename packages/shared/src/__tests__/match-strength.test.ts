import { describe, it, expect } from "vitest";
import { classifyMatchStrength } from "../match-strength.js";

describe("classifyMatchStrength", () => {
  describe("strong matches", () => {
    it("returns strong with 2+ substantive reasons and decent score", () => {
      const result = classifyMatchStrength(0.5, [
        "技术命中：Rust",
        "必须项满足：分布式系统经验"
      ]);
      expect(result).toBe("strong");
    });

    it("returns strong with 1 substantive reason + score >= 0.6", () => {
      const result = classifyMatchStrength(0.65, [
        "技术命中：Python"
      ]);
      expect(result).toBe("strong");
    });

    it("returns strong with substantive English reasons", () => {
      const result = classifyMatchStrength(0.6, [
        "role match: ML Engineer",
        "skill evidence: PyTorch"
      ]);
      expect(result).toBe("strong");
    });

    it("returns medium (not strong) with 2 substantive reasons but low score", () => {
      const result = classifyMatchStrength(0.35, [
        "技术命中：Rust",
        "必须项满足：分布式系统经验"
      ]);
      expect(result).toBe("medium");
    });

    it("returns medium (not strong) with 1 substantive reason + score 0.55", () => {
      const result = classifyMatchStrength(0.55, [
        "技术命中：Python"
      ]);
      expect(result).toBe("medium");
    });

    it("returns strong with github technical evidence + high score", () => {
      const result = classifyMatchStrength(0.65, [
        "github technical evidence",
        "skill evidence: rag"
      ]);
      expect(result).toBe("strong");
    });

    it("returns strong with bonjour technical evidence + high score", () => {
      const result = classifyMatchStrength(0.65, [
        "bonjour technical evidence",
        "role match: AI工程师"
      ]);
      expect(result).toBe("strong");
    });
  });

  describe("medium matches", () => {
    it("returns medium with 1 substantive reason + low score", () => {
      const result = classifyMatchStrength(0.3, [
        "技术命中：Go"
      ]);
      expect(result).toBe("medium");
    });

    it("returns medium with 2 supportive reasons + score >= 0.5", () => {
      const result = classifyMatchStrength(0.55, [
        "地点命中：北京",
        "近期活跃：2024"
      ]);
      expect(result).toBe("medium");
    });

    it("returns weak (not medium) with high score + single generic reason", () => {
      const result = classifyMatchStrength(0.8, ["generic reason"]);
      expect(result).toBe("weak");
    });

    it("returns medium with high score + 2+ non-empty reasons", () => {
      const result = classifyMatchStrength(0.75, ["reason a", "reason b"]);
      expect(result).toBe("medium");
    });

    it("returns medium with 1 supportive + score >= 0.6", () => {
      const result = classifyMatchStrength(0.65, ["地点命中：上海"]);
      expect(result).toBe("medium");
    });

    it("returns weak with 2 supportive reasons but low score", () => {
      const result = classifyMatchStrength(0.4, [
        "地点命中：北京",
        "近期活跃：2024"
      ]);
      expect(result).toBe("weak");
    });
  });

  describe("weak matches", () => {
    it("returns weak with low score and generic reasons", () => {
      const result = classifyMatchStrength(0.2, ["generic"]);
      expect(result).toBe("weak");
    });

    it("returns weak with empty reasons", () => {
      const result = classifyMatchStrength(0.5, []);
      expect(result).toBe("weak");
    });

    it("returns weak with only fallback reason", () => {
      const result = classifyMatchStrength(0.5, ["fallback match"]);
      expect(result).toBe("weak");
    });
  });

  describe("edge cases", () => {
    it("handles score > 1 (percentage)", () => {
      const result = classifyMatchStrength(75, ["技术命中：React"]);
      expect(result).toBe("strong"); // 75/100 = 0.75, substantive reason
    });

    it("handles NaN score", () => {
      const result = classifyMatchStrength(NaN, ["技术命中：Go"]);
      expect(result).toBe("medium"); // NaN → 0, but 1 substantive reason
    });

    it("handles Infinity score", () => {
      const result = classifyMatchStrength(Infinity, []);
      expect(result).toBe("weak");
    });

    it("handles negative score", () => {
      const result = classifyMatchStrength(-0.5, []);
      expect(result).toBe("weak");
    });

    it("handles whitespace-padded reasons", () => {
      const result = classifyMatchStrength(0.65, ["  技术命中：Python  "]);
      expect(result).toBe("strong");
    });

    it("classifies LLM reasoning as substantive", () => {
      const result = classifyMatchStrength(0.65, ["LLM: strong RAG evidence with recent repos"]);
      expect(result).toBe("strong");
    });

    it("classifies zju evidence as substantive", () => {
      const result = classifyMatchStrength(0.6, ["zju evidence"]);
      expect(result).toBe("strong");
    });
  });
});
