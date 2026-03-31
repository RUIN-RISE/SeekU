import { describe, expect, it } from "vitest";

import { formatCoverageReport } from "./coverage.js";

describe("formatCoverageReport", () => {
  it("renders active-person coverage metrics with ratios and gaps", () => {
    const output = formatCoverageReport({
      activePersons: 100,
      indexed: {
        count: 80,
        total: 100,
        ratio: 0.8,
        missing: 20
      },
      embedded: {
        count: 75,
        total: 100,
        ratio: 0.75,
        missing: 25
      },
      multiSource: {
        count: 12,
        total: 100,
        ratio: 0.12,
        missing: 88
      },
      githubCovered: {
        count: 9,
        total: 100,
        ratio: 0.09,
        missing: 91
      }
    });

    expect(output).toContain("Seeku Coverage");
    expect(output).toContain("active persons   100");
    expect(output).toContain("indexed");
    expect(output).toContain("80.0%");
    expect(output).toContain("缺口 20");
    expect(output).toContain("github-covered");
    expect(output).toContain("9.0%");
  });
});
