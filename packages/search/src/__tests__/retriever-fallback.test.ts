import { describe, expect, it, vi } from "vitest";

const mockGenerateEmbedding = vi.fn();

vi.mock("@seeku/llm", async () => {
  const actual = await vi.importActual<typeof import("@seeku/llm")>("@seeku/llm");
  return {
    ...actual,
    generateEmbedding: mockGenerateEmbedding
  };
});

describe("HybridRetriever fallback", () => {
  it("returns keyword-only results when embedding generation fails", async () => {
    const { HybridRetriever } = await import("../retriever.js");

    const retriever = new HybridRetriever({
      db: {} as any,
      provider: {} as any,
      limit: 10
    });

    const keywordResults = [{
      personId: "person-1",
      keywordScore: 0.8,
      vectorScore: 0,
      combinedScore: 0.32,
      matchedText: "matched by keyword"
    }];

    vi.spyOn(retriever, "retrieveKeyword").mockResolvedValue(keywordResults);
    vi.spyOn(retriever, "retrieveVector").mockResolvedValue([]);
    mockGenerateEmbedding.mockRejectedValue(new Error("embedding unavailable"));

    const result = await retriever.retrieve({
      rawQuery: "GitHub 上活跃的 ML engineer",
      roles: ["engineer"],
      skills: ["machine learning"],
      locations: [],
      mustHaves: [],
      niceToHaves: [],
      sourceBias: "github"
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.personId).toBe("person-1");
    expect(result[0]?.keywordScore).toBe(0.8);
    expect(result[0]?.vectorScore).toBe(0);
    expect(result[0]?.combinedScore).toBeCloseTo(0.32, 6);
    expect(retriever.retrieveKeyword).toHaveBeenCalledTimes(1);
    expect(retriever.retrieveVector).not.toHaveBeenCalled();
  });

  it("prefers keyword-heavy blend for specialized retrieval queries", async () => {
    const { HybridRetriever } = await import("../retriever.js");

    const retriever = new HybridRetriever({
      db: {} as any,
      provider: {} as any,
      limit: 10
    });

    vi.spyOn(retriever, "retrieveKeyword").mockResolvedValue([
      {
        personId: "keyword-first",
        keywordScore: 0.8,
        vectorScore: 0,
        combinedScore: 0.32,
        matchedText: "keyword specialist"
      }
    ]);
    vi.spyOn(retriever, "retrieveVector").mockResolvedValue([
      {
        personId: "vector-first",
        keywordScore: 0,
        vectorScore: 0.8,
        combinedScore: 0.48,
        matchedText: "vector generic"
      }
    ]);
    mockGenerateEmbedding.mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      model: "mock",
      dimension: 3
    });

    const result = await retriever.retrieve({
      rawQuery: "RAG 检索工程师",
      roles: ["engineer"],
      skills: ["rag", "retrieval"],
      locations: [],
      mustHaves: [],
      niceToHaves: []
    });

    expect(result[0]?.personId).toBe("keyword-first");
    expect(result[0]?.combinedScore).toBeGreaterThan(result[1]?.combinedScore ?? 0);
  });
});
