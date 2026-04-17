import { describe, expect, it } from "vitest";

import type { EvidenceItem, SearchDocument } from "@seeku/db";

import { Reranker } from "../reranker.js";
import type { QueryIntent } from "../planner.js";
import type { SearchResult } from "../retriever.js";

function makeIntent(overrides: Partial<QueryIntent> = {}): QueryIntent {
  return {
    rawQuery: "Skylar 浙大",
    roles: [],
    skills: [],
    locations: [],
    mustHaves: ["zhejiang university"],
    niceToHaves: [],
    ...overrides
  };
}

function makeResult(personId: string): SearchResult {
  return {
    personId,
    keywordScore: 0.8,
    vectorScore: 0.1,
    combinedScore: 0.38,
    matchedText: "Skylar"
  };
}

function makeDocument(personId: string, docText: string): SearchDocument {
  return {
    personId,
    docText,
    facetRole: [],
    facetLocation: [],
    facetSource: ["bonjour"],
    facetTags: [],
    rankFeatures: {
      evidenceCount: 0,
      projectCount: 0,
      repoCount: 0,
      followerCount: 0,
      freshness: 30
    },
    updatedAt: new Date("2026-04-17T00:00:00.000Z")
  };
}

describe("Reranker university preference", () => {
  it("prefers university-signal candidates for university-constrained same-name queries", () => {
    const reranker = new Reranker();
    const results = [makeResult("zju"), makeResult("other")];
    const documents = new Map<string, SearchDocument>([
      ["zju", { ...makeDocument("zju", "Skylar Law@ZJU 浙江大学启真交叉学科创新创业实验室运营团队成员"), facetTags: ["zju_manual_seed"] }],
      ["other", makeDocument("other", "Skylar AI Dating founder")]
    ]);
    const evidence = new Map<string, EvidenceItem[]>([
      ["zju", []],
      ["other", []]
    ]);

    const ranked = reranker.rerank(results, makeIntent(), documents, evidence);

    expect(ranked[0]?.personId).toBe("zju");
    expect(ranked[0]?.matchReasons).toContain("zju evidence");
    expect(ranked[0]?.matchReasons).toContain("zju manual seed");
  });

  it("does not inject university preference into generic same-name queries", () => {
    const reranker = new Reranker();
    const results = [makeResult("zju"), makeResult("other")];
    const documents = new Map<string, SearchDocument>([
      ["zju", makeDocument("zju", "Skylar Law@ZJU 浙江大学启真交叉学科创新创业实验室运营团队成员")],
      ["other", makeDocument("other", "Skylar AI Dating founder")]
    ]);
    const evidence = new Map<string, EvidenceItem[]>([
      ["zju", []],
      ["other", []]
    ]);

    const ranked = reranker.rerank(
      results,
      makeIntent({ rawQuery: "Skylar", mustHaves: [] }),
      documents,
      evidence
    );

    expect(ranked[0]?.personId).toBe("zju");
    expect(ranked[0]?.matchReasons).not.toContain("zju evidence");
    expect(ranked[0]?.finalScore).toBe(ranked[1]?.finalScore);
  });
});
