import { describe, expect, it } from "vitest";

import { getGuideHint, suggestClosestCommand, MASCOT, type GuideTrigger } from "../guide.js";

describe("getGuideHint", () => {
  it("returns hint for home_empty with mascot prefix", () => {
    const hint = getGuideHint("home_empty");
    expect(hint).not.toBeNull();
    expect(hint!.text).toContain(MASCOT);
    expect(hint!.text).toContain("输入需求开始搜索");
    expect(hint!.trigger).toBe("home_empty");
  });

  it("returns hint for first_shortlist with mascot prefix", () => {
    const hint = getGuideHint("first_shortlist");
    expect(hint).not.toBeNull();
    expect(hint!.text).toContain(MASCOT);
    expect(hint!.text).toContain("↑↓");
    expect(hint!.text).toContain("Enter");
    expect(hint!.text).toContain("space");
  });

  it("returns hint for blocked with blockerLabel", () => {
    const hint = getGuideHint("blocked", { blockerLabel: "检索无结果" });
    expect(hint).not.toBeNull();
    expect(hint!.text).toContain("检索无结果");
    expect(hint!.text).toContain("/refine");
  });

  it("returns null for blocked without blockerLabel", () => {
    const hint = getGuideHint("blocked");
    expect(hint).toBeNull();
  });

  it("returns hint for decision_complete with candidateName", () => {
    const hint = getGuideHint("decision_complete", { candidateName: "Ada" });
    expect(hint).not.toBeNull();
    expect(hint!.text).toContain("Ada");
    expect(hint!.text).toContain("/export");
    expect(hint!.text).toContain("/new");
  });

  it("returns null for decision_complete without candidateName", () => {
    const hint = getGuideHint("decision_complete");
    expect(hint).toBeNull();
  });

  it("each trigger returns correct trigger field", () => {
    const triggers: GuideTrigger[] = ["home_empty", "first_shortlist"];
    for (const trigger of triggers) {
      const hint = getGuideHint(trigger);
      expect(hint!.trigger).toBe(trigger);
    }
  });
});

describe("suggestClosestCommand", () => {
  it("suggests refine for refnie", () => {
    expect(suggestClosestCommand("refnie")).toBe("refine");
  });

  it("suggests help for hepl", () => {
    expect(suggestClosestCommand("hepl")).toBe("help");
  });

  it("suggests compare for compaer", () => {
    expect(suggestClosestCommand("compaer")).toBe("compare");
  });

  it("suggests sort for srot", () => {
    expect(suggestClosestCommand("srot")).toBe("sort");
  });

  it("returns null for completely unknown input", () => {
    expect(suggestClosestCommand("xyzzy12345")).toBeNull();
  });

  it("returns exact match for valid command via alias", () => {
    expect(suggestClosestCommand("r")).toBe("refine");
  });

  it("limits suggestions to commands available in the current stage", () => {
    expect(suggestClosestCommand("sort", "compare")).not.toBe("sort");
    expect(suggestClosestCommand("compaer", "detail")).not.toBe("compare");
    expect(suggestClosestCommand("compaer", "shortlist")).toBe("compare");
  });
});
