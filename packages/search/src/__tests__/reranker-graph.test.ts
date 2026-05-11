import { describe, expect, it } from "vitest";

import { analyzeSkillCoverage, Reranker, type GraphRerankFeatures } from "../reranker.js";
import type { QueryIntent } from "../planner.js";

describe("Reranker graph features", () => {
  it("applies mutual connection boost when graph features are present", () => {
    const reranker = new Reranker({ graphRerankEnabled: true, graphSameComponentBoost: 0.08 });
    const intent: QueryIntent = {
      rawQuery: "AI 工程师",
      roles: ["engineer"],
      skills: ["ai"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "candidate-a",
        keywordScore: 0.70,
        vectorScore: 0,
        combinedScore: 0.70,
        matchedText: "AI engineer"
      },
      {
        personId: "candidate-b",
        keywordScore: 0.70,
        vectorScore: 0,
        combinedScore: 0.70,
        matchedText: "AI engineer"
      }
    ];

    const documents = new Map([
      ["candidate-a", {
        personId: "candidate-a",
        docText: "AI engineer",
        facetSource: ["bonjour"],
        facetRole: ["engineer"],
        facetTags: ["ai"],
        rankFeatures: { freshness: 30 }
      }],
      ["candidate-b", {
        personId: "candidate-b",
        docText: "AI engineer",
        facetSource: ["bonjour"],
        facetRole: ["engineer"],
        facetTags: ["ai"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["candidate-a", []],
      ["candidate-b", []]
    ]);

    // Candidate B has mutual connections
    const graphFeatures = new Map<string, GraphRerankFeatures>([
      ["candidate-b", {
        mutualConnectionCount: 3,
        isDirectNeighbor: false,
        sameComponentAsAnchor: true
      }]
    ]);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any, undefined, graphFeatures);

    // Candidate B should rank higher due to graph boost
    expect(reranked[0]?.personId).toBe("candidate-b");
    expect(reranked[0]?.matchReasons).toContain("graph: 3 mutual connections");
    expect(reranked[0]?.matchReasons).toContain("graph: same component");
  });

  it("applies direct neighbor boost", () => {
    const reranker = new Reranker({ graphRerankEnabled: true });
    const intent: QueryIntent = {
      rawQuery: "AI 工程师",
      roles: ["engineer"],
      skills: ["ai"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "candidate-a",
        keywordScore: 0.70,
        vectorScore: 0,
        combinedScore: 0.70,
        matchedText: "AI engineer"
      },
      {
        personId: "candidate-b",
        keywordScore: 0.70,
        vectorScore: 0,
        combinedScore: 0.70,
        matchedText: "AI engineer"
      }
    ];

    const documents = new Map([
      ["candidate-a", {
        personId: "candidate-a",
        docText: "AI engineer",
        facetSource: ["bonjour"],
        facetRole: ["engineer"],
        facetTags: ["ai"],
        rankFeatures: { freshness: 30 }
      }],
      ["candidate-b", {
        personId: "candidate-b",
        docText: "AI engineer",
        facetSource: ["bonjour"],
        facetRole: ["engineer"],
        facetTags: ["ai"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["candidate-a", []],
      ["candidate-b", []]
    ]);

    // Candidate B is a direct neighbor
    const graphFeatures = new Map<string, GraphRerankFeatures>([
      ["candidate-b", {
        mutualConnectionCount: 0,
        isDirectNeighbor: true,
        sameComponentAsAnchor: false
      }]
    ]);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any, undefined, graphFeatures);

    // Candidate B should rank higher due to direct neighbor boost
    expect(reranked[0]?.personId).toBe("candidate-b");
    expect(reranked[0]?.matchReasons).toContain("graph: direct neighbor");
  });

  it("caps mutual connection boost to avoid runaway scores", () => {
    const reranker = new Reranker({ graphRerankEnabled: true });
    const intent: QueryIntent = {
      rawQuery: "AI 工程师",
      roles: ["engineer"],
      skills: ["ai"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "candidate-a",
        keywordScore: 0.70,
        vectorScore: 0,
        combinedScore: 0.70,
        matchedText: "AI engineer"
      },
      {
        personId: "candidate-b",
        keywordScore: 0.70,
        vectorScore: 0,
        combinedScore: 0.70,
        matchedText: "AI engineer"
      }
    ];

    const documents = new Map([
      ["candidate-a", {
        personId: "candidate-a",
        docText: "AI engineer",
        facetSource: ["bonjour"],
        facetRole: ["engineer"],
        facetTags: ["ai"],
        rankFeatures: { freshness: 30 }
      }],
      ["candidate-b", {
        personId: "candidate-b",
        docText: "AI engineer",
        facetSource: ["bonjour"],
        facetRole: ["engineer"],
        facetTags: ["ai"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["candidate-a", []],
      ["candidate-b", []]
    ]);

    // Candidate B has 10 mutual connections (should be capped at 5)
    const graphFeatures = new Map<string, GraphRerankFeatures>([
      ["candidate-b", {
        mutualConnectionCount: 10,
        isDirectNeighbor: false,
        sameComponentAsAnchor: false
      }]
    ]);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any, undefined, graphFeatures);

    // Candidate B should rank higher, but boost should be capped
    expect(reranked[0]?.personId).toBe("candidate-b");
    // With cap at 5, boost = 5 * 0.02 = 0.10
    // Score = 0.70 * (1 + 0.10) * freshness_penalty
    // freshness_penalty for 30 days = exp(-30/365) ≈ 0.921
    // Final score ≈ 0.70 * 1.10 * 0.921 ≈ 0.71
    expect(reranked[0]?.finalScore).toBeGreaterThan(0.70);
    expect(reranked[0]?.finalScore).toBeLessThan(0.75);
  });

  it("gracefully handles missing graph features", () => {
    const reranker = new Reranker();
    const intent: QueryIntent = {
      rawQuery: "AI 工程师",
      roles: ["engineer"],
      skills: ["ai"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "candidate-a",
        keywordScore: 0.70,
        vectorScore: 0,
        combinedScore: 0.70,
        matchedText: "AI engineer"
      }
    ];

    const documents = new Map([
      ["candidate-a", {
        personId: "candidate-a",
        docText: "AI engineer",
        facetSource: ["bonjour"],
        facetRole: ["engineer"],
        facetTags: ["ai"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["candidate-a", []]
    ]);

    // No graph features provided
    const reranked = reranker.rerank(results, intent, documents as any, evidence as any, undefined, undefined);

    // Should still work without graph features
    expect(reranked).toHaveLength(1);
    expect(reranked[0]?.personId).toBe("candidate-a");
    // No graph reasons should be present
    expect(reranked[0]?.matchReasons.some((r) => r.startsWith("graph:"))).toBe(false);
  });

  it("does not let graph features overwhelm strong relevance signals", () => {
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
        personId: "candidate-strong-relevance",
        keywordScore: 0.85,
        vectorScore: 0,
        combinedScore: 0.85,
        matchedText: "RAG retrieval engineer"
      },
      {
        personId: "candidate-weak-relevance-graph",
        keywordScore: 0.50,
        vectorScore: 0,
        combinedScore: 0.50,
        matchedText: "engineer"
      }
    ];

    const documents = new Map([
      ["candidate-strong-relevance", {
        personId: "candidate-strong-relevance",
        docText: "RAG retrieval engineer",
        facetSource: ["github"],
        facetRole: ["engineer"],
        facetTags: ["rag", "retrieval"],
        rankFeatures: { freshness: 30 }
      }],
      ["candidate-weak-relevance-graph", {
        personId: "candidate-weak-relevance-graph",
        docText: "engineer",
        facetSource: ["bonjour"],
        facetRole: ["engineer"],
        facetTags: [],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["candidate-strong-relevance", [{
        personId: "candidate-strong-relevance",
        evidenceType: "repository",
        title: "rag-toolkit",
        description: "retrieval augmented generation toolkit",
        metadata: {}
      }]],
      ["candidate-weak-relevance-graph", []]
    ]);

    // Weak relevance candidate has strong graph features
    const graphFeatures = new Map<string, GraphRerankFeatures>([
      ["candidate-weak-relevance-graph", {
        mutualConnectionCount: 5,
        isDirectNeighbor: true,
        sameComponentAsAnchor: true
      }]
    ]);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any, undefined, graphFeatures);

    // Strong relevance candidate should still win
    // Strong: 0.85 * (1 + 0.12 + 0.08 + 0.08) = 0.85 * 1.28 = 1.088
    // Weak with graph: 0.50 * (1 + 0.10 + 0.08 + 0.01) = 0.50 * 1.19 = 0.595
    expect(reranked[0]?.personId).toBe("candidate-strong-relevance");
  });

  it("prefers complete multi-dimension matches over higher-scoring partial matches", () => {
    const reranker = new Reranker();
    const intent: QueryIntent = {
      rawQuery: "深圳 计算机视觉 算法研究员",
      roles: ["researcher"],
      skills: ["computer vision", "algorithm"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "role-only",
        keywordScore: 0.64,
        vectorScore: 0,
        combinedScore: 0.64,
        matchedText: "深圳 algorithm researcher"
      },
      {
        personId: "complete-match",
        keywordScore: 0.58,
        vectorScore: 0,
        combinedScore: 0.58,
        matchedText: "深圳 computer vision algorithm researcher"
      }
    ];

    const documents = new Map([
      ["role-only", {
        personId: "role-only",
        docText: "深圳 algorithm researcher working on NLP systems",
        facetSource: ["bonjour"],
        facetRole: ["researcher"],
        facetTags: ["algorithm", "nlp"],
        rankFeatures: { freshness: 30 }
      }],
      ["complete-match", {
        personId: "complete-match",
        docText: "深圳 computer vision algorithm researcher",
        facetSource: ["bonjour"],
        facetRole: ["researcher"],
        facetTags: ["computer vision", "algorithm"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["role-only", []],
      ["complete-match", []]
    ]);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any);

    expect(reranked[0]?.personId).toBe("complete-match");
    expect(reranked[0]?.finalScore).toBeGreaterThan(reranked[1]?.finalScore ?? 0);
  });

  it("does not treat 'currently' as a computer vision skill hit via 'cv' alias", () => {
    const reranker = new Reranker();
    const intent: QueryIntent = {
      rawQuery: "深圳 计算机视觉 算法研究员",
      roles: ["researcher"],
      skills: ["computer vision", "algorithm"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "false-cv",
        keywordScore: 0.64,
        vectorScore: 0,
        combinedScore: 0.64,
        matchedText: "currently algorithm researcher"
      },
      {
        personId: "true-cv",
        keywordScore: 0.58,
        vectorScore: 0,
        combinedScore: 0.58,
        matchedText: "computer vision algorithm researcher"
      }
    ];

    const documents = new Map([
      ["false-cv", {
        personId: "false-cv",
        docText: "currently an algorithm researcher",
        facetSource: ["github"],
        facetRole: ["researcher"],
        facetTags: ["algorithm"],
        rankFeatures: { freshness: 30 }
      }],
      ["true-cv", {
        personId: "true-cv",
        docText: "computer vision algorithm researcher",
        facetSource: ["github"],
        facetRole: ["researcher"],
        facetTags: ["computer vision", "algorithm"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["false-cv", []],
      ["true-cv", []]
    ]);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any);

    expect(reranked[0]?.personId).toBe("true-cv");
  });

  it("tracks multi-skill coverage by substantive skill families", () => {
    const partialCoverage = analyzeSkillCoverage(
      ["computer vision", "algorithm", "research", "paper"],
      {
        personId: "partial",
        docText: "currently an algorithm researcher",
        facetRole: ["researcher"],
        facetTags: ["algorithm"],
        facetLocation: ["shenzhen"],
        facetSource: ["github"],
        rankFeatures: { freshness: 30 }
      } as any
    );
    const fullCoverage = analyzeSkillCoverage(
      ["computer vision", "algorithm", "research", "paper"],
      {
        personId: "full",
        docText: "computer vision algorithm researcher",
        facetRole: ["researcher"],
        facetTags: ["computer vision", "algorithm"],
        facetLocation: ["shenzhen"],
        facetSource: ["github"],
        rankFeatures: { freshness: 30 }
      } as any
    );

    expect(partialCoverage).toEqual({ familyCount: 2, matchedCount: 1 });
    expect(fullCoverage).toEqual({ familyCount: 2, matchedCount: 2 });
  });

  it("penalizes partial multi-skill matches enough to let a complete match win", () => {
    const reranker = new Reranker();
    const intent: QueryIntent = {
      rawQuery: "深圳 计算机视觉 算法研究员",
      roles: ["researcher"],
      skills: ["computer vision", "algorithm"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "partial-skill",
        keywordScore: 0.64,
        vectorScore: 0,
        combinedScore: 0.64,
        matchedText: "深圳 algorithm researcher"
      },
      {
        personId: "complete-skill",
        keywordScore: 0.58,
        vectorScore: 0,
        combinedScore: 0.58,
        matchedText: "深圳 computer vision algorithm researcher"
      }
    ];

    const documents = new Map([
      ["partial-skill", {
        personId: "partial-skill",
        docText: "深圳 algorithm researcher working on NLP systems",
        facetSource: ["bonjour"],
        facetRole: ["researcher"],
        facetTags: ["algorithm", "nlp"],
        rankFeatures: { freshness: 30 }
      }],
      ["complete-skill", {
        personId: "complete-skill",
        docText: "深圳 computer vision algorithm researcher",
        facetSource: ["bonjour"],
        facetRole: ["researcher"],
        facetTags: ["computer vision", "algorithm"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["partial-skill", []],
      ["complete-skill", []]
    ]);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any);

    expect(reranked[0]?.personId).toBe("complete-skill");
    expect(reranked[1]?.personId).toBe("partial-skill");
  });

  it("penalizes missing leadership role signals for strict role queries", () => {
    const reranker = new Reranker();
    const intent: QueryIntent = {
      rawQuery: "开源 AI founder 或 tech lead",
      roles: ["founder", "tech lead"],
      skills: ["llm", "open source"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "role-miss",
        keywordScore: 0.75,
        vectorScore: 0,
        combinedScore: 0.75,
        matchedText: "open source ai builder"
      },
      {
        personId: "role-hit",
        keywordScore: 0.68,
        vectorScore: 0,
        combinedScore: 0.68,
        matchedText: "open source ai founder"
      }
    ];

    const documents = new Map([
      ["role-miss", {
        personId: "role-miss",
        docText: "open source ai builder",
        facetSource: ["github"],
        facetRole: [],
        facetTags: ["llm", "open source", "ai"],
        rankFeatures: { freshness: 30 }
      }],
      ["role-hit", {
        personId: "role-hit",
        docText: "open source ai founder",
        facetSource: ["github"],
        facetRole: ["创始人"],
        facetTags: ["llm", "open source", "ai"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["role-miss", []],
      ["role-hit", []]
    ]);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any);

    expect(reranked[0]?.personId).toBe("role-hit");
    expect(reranked[1]?.personId).toBe("role-miss");
  });

  it("does not count doc-text-only entrepreneurship terms as a strict founder role hit", () => {
    const reranker = new Reranker();
    const intent: QueryIntent = {
      rawQuery: "开源 AI founder 或 tech lead",
      roles: ["founder", "tech lead"],
      skills: ["open source ai", "ai", "open source"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "doctext-only-founder",
        keywordScore: 0.78,
        vectorScore: 0,
        combinedScore: 0.78,
        matchedText: "open source ai founder"
      },
      {
        personId: "facet-founder",
        keywordScore: 0.70,
        vectorScore: 0,
        combinedScore: 0.70,
        matchedText: "open source ai founder"
      }
    ];

    const documents = new Map([
      ["doctext-only-founder", {
        personId: "doctext-only-founder",
        docText: "开源 ai 创业 builder",
        facetSource: ["github"],
        facetRole: [],
        facetTags: ["ai", "open source"],
        rankFeatures: { freshness: 30 }
      }],
      ["facet-founder", {
        personId: "facet-founder",
        docText: "开源 ai founder",
        facetSource: ["github"],
        facetRole: ["创始人"],
        facetTags: ["ai", "open source"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const evidence = new Map([
      ["doctext-only-founder", []],
      ["facet-founder", []]
    ]);

    const reranked = reranker.rerank(results, intent, documents as any, evidence as any);

    expect(reranked[0]?.personId).toBe("facet-founder");
    expect(reranked[0]?.matchReasons).toContain("role match: founder");
    expect(reranked[1]?.matchReasons).not.toContain("role match: founder");
  });

  it("treats researcher and 研究员 as the same role family during rerank", () => {
    const reranker = new Reranker();
    const intent: QueryIntent = {
      rawQuery: "深圳 计算机视觉 算法研究员",
      roles: ["researcher"],
      skills: ["computer vision", "algorithm"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    };

    const results = [
      {
        personId: "cn-researcher",
        keywordScore: 0.4,
        vectorScore: 0,
        combinedScore: 0.4,
        matchedText: "研究员"
      }
    ];

    const documents = new Map([
      ["cn-researcher", {
        personId: "cn-researcher",
        docText: "深圳 计算机视觉 算法研究员",
        facetSource: ["bonjour"],
        facetRole: ["研究员"],
        facetTags: ["计算机视觉", "算法"],
        rankFeatures: { freshness: 30 }
      }]
    ] as const);

    const reranked = reranker.rerank(results, intent, documents as any, new Map([["cn-researcher", []]]) as any);

    expect(reranked[0]?.matchReasons).toContain("role match: researcher");
  });
});
