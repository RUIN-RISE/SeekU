import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateEmbedding = vi.fn();

vi.mock("@seeku/llm", async () => {
  const actual = await vi.importActual<typeof import("@seeku/llm")>("@seeku/llm");
  return {
    ...actual,
    generateEmbedding: mockGenerateEmbedding
  };
});

describe("HybridRetriever abort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rethrows abort errors instead of falling back to keyword-only results", async () => {
    const controller = new AbortController();
    const aborted = new Error("retriever interrupted");
    controller.abort(aborted);

    const { HybridRetriever } = await import("../retriever.js");

    const retriever = new HybridRetriever({
      db: {} as any,
      provider: {} as any,
      limit: 10
    });

    vi.spyOn(retriever, "retrieveKeyword").mockResolvedValue([
      {
        personId: "person-1",
        keywordScore: 0.8,
        vectorScore: 0,
        combinedScore: 0.32,
        matchedText: "matched by keyword"
      }
    ]);
    vi.spyOn(retriever, "retrieveVector").mockResolvedValue([]);
    mockGenerateEmbedding.mockRejectedValue(aborted);

    await expect(
      retriever.retrieve(
        {
          rawQuery: "GitHub 上活跃的 ML engineer",
          roles: ["engineer"],
          skills: ["machine learning"],
          locations: [],
          mustHaves: [],
          niceToHaves: [],
          sourceBias: "github"
        },
        { signal: controller.signal }
      )
    ).rejects.toThrow("retriever interrupted");

    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockGenerateEmbedding.mock.calls[0]?.[0]).toBe(retriever["provider"]);
    expect(mockGenerateEmbedding.mock.calls[0]?.[1]).toEqual(expect.any(String));
    expect(mockGenerateEmbedding.mock.calls[0]?.[2]).toBeUndefined();
    expect(mockGenerateEmbedding.mock.calls[0]?.[3]).toEqual({ signal: controller.signal });
    expect(retriever.retrieveVector).not.toHaveBeenCalled();
  });
});
