import { describe, expect, it } from "vitest";

import { formatPercentScore, normalizePercentScore } from "../score-format.js";

describe("score-format", () => {
  it("keeps existing 0-100 scores as percentages", () => {
    expect(formatPercentScore(82)).toBe("82%");
    expect(formatPercentScore(82.4, 1)).toBe("82.4%");
  });

  it("converts normalized 0-1 scores to percentages", () => {
    expect(formatPercentScore(0.82)).toBe("82%");
    expect(formatPercentScore(0.825, 1)).toBe("82.5%");
  });

  it("clamps out-of-range values", () => {
    expect(normalizePercentScore(-5)).toBe(0);
    expect(normalizePercentScore(120)).toBe(100);
  });
});
