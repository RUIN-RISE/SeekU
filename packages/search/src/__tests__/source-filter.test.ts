import { describe, expect, it } from "vitest";

import { QueryPlanner } from "../planner.js";
import { buildFilterConditions } from "../retriever.js";

describe("source filtering", () => {
  it("adds a hard facetSource condition when sourceBias is present", () => {
    const conditions = buildFilterConditions({
      rawQuery: "github python",
      roles: [],
      skills: [],
      locations: [],
      mustHaves: [],
      niceToHaves: [],
      sourceBias: "github"
    });

    expect(conditions).toHaveLength(2);
  });

  it("keeps source restriction out of mustHaves in heuristic parsing", async () => {
    const planner = new QueryPlanner({
      provider: {
        chat: async () => ({
          content: "not json",
          model: "mock"
        })
      } as any
    });

    const intent = await planner.parse("github python engineer");

    expect(intent.sourceBias).toBe("github");
    expect(intent.mustHaves).not.toContain("github");
    expect(intent.skills).toContain("python");
  });

  it("backfills source restriction from the raw query when llm output omits it", async () => {
    const planner = new QueryPlanner({
      provider: {
        chat: async () => ({
          content: JSON.stringify({
            roles: ["engineer"],
            skills: ["python"],
            locations: [],
            experienceLevel: null,
            sourceBias: null,
            mustHaves: [],
            niceToHaves: []
          }),
          model: "mock"
        })
      } as any
    });

    const intent = await planner.parse("bonjour python engineer");

    expect(intent.sourceBias).toBe("bonjour");
    expect(intent.skills).toContain("python");
  });
});
