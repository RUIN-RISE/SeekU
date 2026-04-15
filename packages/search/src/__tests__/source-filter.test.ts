import { describe, expect, it } from "vitest";

import { QueryPlanner } from "../planner.js";
import { buildFilterConditions, buildKeywordIntentSignals } from "../retriever.js";

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

  it("keeps heuristic alias hints when llm output is sparse but valid", async () => {
    const planner = new QueryPlanner({
      provider: {
        chat: async () => ({
          content: JSON.stringify({
            roles: ["engineer"],
            skills: [],
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

    const intent = await planner.parse("GitHub 上活跃的 ML engineer");

    expect(intent.sourceBias).toBe("github");
    expect(intent.roles).toContain("engineer");
    expect(intent.skills).toContain("machine learning");
    expect(intent.mustHaves).not.toContain("active");
    expect(intent.mustHaves).not.toContain("活跃");
  });

  it("infers github sourceBias from open-source intent when source is implicit", async () => {
    const planner = new QueryPlanner({
      provider: {
        chat: async () => ({
          content: JSON.stringify({
            roles: ["founder", "tech lead"],
            skills: ["ai", "open source"],
            locations: [],
            experienceLevel: "lead",
            sourceBias: null,
            mustHaves: [],
            niceToHaves: []
          }),
          model: "mock"
        })
      } as any
    });

    const intent = await planner.parse("开源 AI founder 或 tech lead");

    expect(intent.sourceBias).toBe("github");
    expect(intent.skills).toContain("open source");
  });

  it("arms open-source retrieval signals for founder and tech lead queries", () => {
    const signals = buildKeywordIntentSignals({
      rawQuery: "开源 AI founder 或 tech lead",
      roles: ["founder", "tech lead"],
      skills: ["ai", "open source"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    });

    expect(signals.wantsOpenSource).toBe(true);
    expect(signals.openSourceTextTerms).toEqual(["open source", "open-source", "开源"]);
    expect(signals.leadershipTextTerms).toEqual(expect.arrayContaining([
      "founder",
      "创始人",
      "tech lead",
      "technical lead",
      "技术负责人"
    ]));
  });

  it("keeps open-source retrieval signals disabled for Q2 and Q6 intents", () => {
    const q2Signals = buildKeywordIntentSignals({
      rawQuery: "AI infra backend engineer",
      roles: ["engineer"],
      skills: ["ai", "infra", "backend"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    });
    const q6Signals = buildKeywordIntentSignals({
      rawQuery: "GitHub 上活跃的 ML engineer",
      roles: ["engineer"],
      skills: ["machine learning"],
      locations: [],
      mustHaves: [],
      niceToHaves: [],
      sourceBias: "github"
    });

    expect(q2Signals).toEqual({
      wantsOpenSource: false,
      openSourceTextTerms: [],
      leadershipTextTerms: []
    });
    expect(q6Signals).toEqual({
      wantsOpenSource: false,
      openSourceTextTerms: [],
      leadershipTextTerms: []
    });
  });

  it("adds zju must-have guardrails when llm parse is sparse for zju builder queries", async () => {
    const planner = new QueryPlanner({
      provider: {
        chat: async () => ({
          content: JSON.stringify({
            roles: ["ai builder"],
            skills: ["ai"],
            locations: [],
            experienceLevel: null,
            sourceBias: "zhejiang university",
            mustHaves: [],
            niceToHaves: []
          }),
          model: "mock"
        })
      } as any
    });

    const intent = await planner.parse("浙大 AI builder");

    expect(intent.mustHaves).toContain("zhejiang university");
    expect(intent.locations).toContain("hangzhou");
    expect(intent.sourceBias).toBeUndefined();
  });
});
