import { describe, expect, it } from "vitest";

import { buildDisambiguationNotes } from "../disambiguation.js";

describe("buildDisambiguationNotes", () => {
  it("emits per-candidate notes for repeated same-name matches", () => {
    const notes = buildDisambiguationNotes("Wayne 浙大", [
      {
        personId: "1",
        name: "Wayne",
        headline: "Researcher@Shanghai",
        matchReasons: ["zju evidence"],
        document: { facetSource: ["bonjour"], facetTags: [] }
      },
      {
        personId: "2",
        name: "Wayne",
        headline: "GP of stealth fund",
        matchReasons: [],
        document: { facetSource: ["bonjour"], facetTags: [] }
      }
    ]);

    expect(notes.get("1")).toContain("重名提示");
    expect(notes.get("1")).toContain("Researcher@Shanghai");
    expect(notes.get("1")).toContain("GP of stealth fund");
  });

  it("stays quiet when names are unique", () => {
    const notes = buildDisambiguationNotes("Aura 浙大", [
      {
        personId: "1",
        name: "Aura",
        headline: "CEO",
        matchReasons: ["zju manual seed"],
        document: { facetSource: ["bonjour"], facetTags: ["zju_manual_seed"] }
      },
      {
        personId: "2",
        name: "Clara",
        headline: "文物与博物馆学 @浙江大学",
        matchReasons: ["zju evidence"],
        document: { facetSource: ["bonjour"], facetTags: [] }
      }
    ]);

    expect(notes.size).toBe(0);
  });
});
