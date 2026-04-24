import { describe, expect, it } from "vitest";

import { buildEffectiveQuery, formatConditionsAsPrompt, normalizeConditions } from "../search-conditions.js";

describe("search condition normalization", () => {
  it("treats ZJU as an education constraint instead of a location", () => {
    const conditions = normalizeConditions({
      skills: [],
      locations: ["浙大"],
      role: "本科生",
      mustHave: [],
      niceToHave: [],
      exclude: [],
      preferFresh: false
    });

    expect(conditions.locations).toEqual([]);
    expect(conditions.mustHave).toContain("zhejiang university");
    expect(conditions.niceToHave).toContain("本科生");
    expect(formatConditionsAsPrompt(conditions)).not.toContain("地点 浙大");
  });

  it("expands ZJU aliases in the effective query", () => {
    const conditions = normalizeConditions({
      locations: ["zju"],
      role: "学生",
      mustHave: [],
      niceToHave: [],
      exclude: [],
      preferFresh: false
    });

    const query = buildEffectiveQuery(conditions);
    expect(query).toContain("must have zhejiang university");
    expect(query).toContain("must have 浙江大学");
    expect(query).toContain("must have 浙大");
    expect(query).toContain("prefer 本科生");
  });
});
