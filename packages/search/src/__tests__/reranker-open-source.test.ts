import { describe, expect, it } from "vitest";

import { Reranker } from "../reranker.js";
import type { QueryIntent } from "../planner.js";

describe("Reranker open-source boost", () => {
  it("promotes github-backed open-source founder results for open-source founder queries", () => {
    const reranker = new Reranker();
    const intent: QueryIntent = {
      rawQuery: "开源 AI founder 或 tech lead",
      roles: ["founder", "tech lead"],
      skills: ["ai", "open source"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "bonjour-founder",
        keywordScore: 0.72,
        vectorScore: 0,
        combinedScore: 0.72,
        matchedText: "Founder AI company"
      },
      {
        personId: "github-founder",
        keywordScore: 0.68,
        vectorScore: 0,
        combinedScore: 0.68,
        matchedText: "Founder open source AI tools"
      }
    ];

    const documents = new Map([
      ["bonjour-founder", {
        personId: "bonjour-founder",
        docText: "Founder building AI products",
        facetSource: ["bonjour"],
        facetRole: ["创始人"],
        facetTags: ["ai"],
        rankFeatures: { freshness: 30 }
      }],
      ["github-founder", {
        personId: "github-founder",
        docText: "Founder building open source AI tooling and acting as technical lead",
        facetSource: ["github"],
        facetRole: ["创始人", "技术负责人"],
        facetTags: ["ai"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["bonjour-founder", []],
      ["github-founder", [{
        personId: "github-founder",
        evidenceType: "repository",
        title: "open-source-ai-sdk",
        description: "open source ai toolkit",
        metadata: {}
      }]]
    ] as const);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any);

    expect(reranked[0]?.personId).toBe("github-founder");
    expect(reranked[0]?.matchReasons).toContain("github open-source evidence");
    expect(reranked[0]?.matchReasons).toContain("tech lead evidence");
  });

  it("promotes github technical evidence for specialized retrieval queries", () => {
    const reranker = new Reranker();
    const intent: QueryIntent = {
      rawQuery: "RAG 检索工程师",
      roles: ["engineer"],
      skills: ["rag", "retrieval"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "bonjour-rag",
        keywordScore: 0.74,
        vectorScore: 0,
        combinedScore: 0.74,
        matchedText: "Agent / RAG 工程师"
      },
      {
        personId: "github-rag",
        keywordScore: 0.72,
        vectorScore: 0,
        combinedScore: 0.72,
        matchedText: "retrieval augmented generation"
      }
    ];

    const documents = new Map([
      ["bonjour-rag", {
        personId: "bonjour-rag",
        docText: "Agent / RAG 工程师",
        facetSource: ["bonjour"],
        facetRole: ["工程师"],
        facetTags: ["rag"],
        rankFeatures: { freshness: 30 }
      }],
      ["github-rag", {
        personId: "github-rag",
        docText: "Built RAG retrieval tooling and search systems",
        facetSource: ["github"],
        facetRole: ["engineer"],
        facetTags: ["rag", "retrieval"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["bonjour-rag", []],
      ["github-rag", [{
        personId: "github-rag",
        evidenceType: "repository",
        title: "rag-retrieval-toolkit",
        description: "retrieval augmented generation toolkit",
        metadata: {}
      }]]
    ] as const);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any);

    expect(reranked[0]?.personId).toBe("github-rag");
    expect(reranked[0]?.matchReasons).toContain("github technical evidence");
  });

  it("prefers github repo-backed specialized candidates over headline-only bonjour hits when scores are close", () => {
    const reranker = new Reranker();
    const intent: QueryIntent = {
      rawQuery: "RAG 检索工程师",
      roles: ["engineer"],
      skills: ["rag", "retrieval"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "bonjour-rag",
        keywordScore: 0.7,
        vectorScore: 0,
        combinedScore: 0.7,
        matchedText: "Agent / RAG 工程师"
      },
      {
        personId: "github-rag",
        keywordScore: 0.58,
        vectorScore: 0,
        combinedScore: 0.58,
        matchedText: "retrieval augmented generation"
      }
    ];

    const documents = new Map([
      ["bonjour-rag", {
        personId: "bonjour-rag",
        docText: "Agent / RAG 工程师",
        facetSource: ["bonjour"],
        facetRole: ["工程师"],
        facetTags: ["rag"],
        rankFeatures: { freshness: 30 }
      }],
      ["github-rag", {
        personId: "github-rag",
        docText: "Built retrieval tooling and RAG workflows",
        facetSource: ["github"],
        facetRole: ["engineer"],
        facetTags: ["rag", "retrieval"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["bonjour-rag", []],
      ["github-rag", [{
        personId: "github-rag",
        evidenceType: "repository",
        title: "rag-retrieval-toolkit",
        description: "retrieval augmented generation toolkit",
        metadata: {}
      }]]
    ] as const);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any);

    expect(reranked[0]?.personId).toBe("github-rag");
    expect(reranked[0]?.evidenceBoost).toBeGreaterThan(0.2);
  });
});
