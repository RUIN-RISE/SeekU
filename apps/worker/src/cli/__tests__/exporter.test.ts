import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { ShortlistExporter } from "../exporter.js";
import type { ExportCandidateRecord } from "../types.js";

const record: ExportCandidateRecord = {
  shortlistIndex: 1,
  name: "Ada",
  headline: "Backend Engineer",
  location: "杭州",
  company: null,
  matchScore: 0.82,
  source: "Bonjour",
  freshness: "3天前",
  whyMatched: "技术命中",
  topEvidence: []
};

describe("ShortlistExporter score formatting", () => {
  it("exports markdown scores as percentages", async () => {
    const artifact = await new ShortlistExporter().export({
      format: "md",
      target: "shortlist",
      querySummary: "backend",
      records: [record]
    });

    const output = await readFile(artifact.files[0].path, "utf8");
    expect(output).toContain("- Score: 82%");
    expect(output).not.toContain("- Score: 0.8");
  });

  it("exports csv scores as percentages", async () => {
    const artifact = await new ShortlistExporter().export({
      format: "csv",
      target: "shortlist",
      querySummary: "backend",
      records: [record]
    });

    const output = await readFile(artifact.files[0].path, "utf8");
    expect(output).toContain("82%");
    expect(output).not.toContain("0.8");
  });
});
