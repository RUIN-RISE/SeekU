import { describe, expect, it, vi } from "vitest";

import { SearchFacetBackfillWorker } from "./search-facet-backfill.js";

const { rebuildEmbeddingsMock } = vi.hoisted(() => ({
  rebuildEmbeddingsMock: vi.fn()
}));

vi.mock("./search-index-worker.js", () => ({
  SearchIndexWorker: vi.fn(() => ({
    rebuildEmbeddings: rebuildEmbeddingsMock
  }))
}));

function createChain(rows: unknown[]) {
  const offset = vi.fn(() => rows);
  const limit = vi.fn(() => ({ offset }));
  const orderBy = vi.fn(() => ({ limit }));

  return {
    offset,
    limit,
    orderBy,
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy
        }))
      })),
      where: vi.fn(() => ({
        limit: vi.fn(() => rows)
      }))
    }))
  };
}

type TestSearchDocument = ReturnType<typeof makeDocument>;

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    personId: "person-1",
    docText: "AI product builder. Built RAG workflow tools in Hangzhou.",
    facetRole: [],
    facetTags: [],
    facetLocation: [],
    facetSource: ["bonjour"],
    rankFeatures: {},
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...overrides
  };
}

function makeDb(document: TestSearchDocument | TestSearchDocument[] = makeDocument(), evidenceRows: unknown[] = []) {
  const documents = Array.isArray(document) ? document : [document];
  const candidateChain = createChain(documents.map((item) => ({ document: item })));
  const updateSet = vi.fn(() => ({
    where: vi.fn()
  }));
  const db = {
    select: vi.fn()
      .mockReturnValueOnce(candidateChain)
      .mockReturnValue(createChain(evidenceRows)),
    update: vi.fn(() => ({
      set: updateSet
    }))
  };

  return { db: db as any, updateSet, candidateChain };
}

describe("SearchFacetBackfillWorker", () => {
  it("returns accepted suggestions in dry-run mode without updating documents", async () => {
    const { db } = makeDb();
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["AI工程师"],
          tags: ["RAG"],
          location: ["杭州"],
          confidence: 0.91,
          evidence: "Built RAG workflow tools in Hangzhou",
          reason: "Explicit RAG builder evidence"
        }),
        model: "test"
      })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({
      provider,
      limit: 1,
      missing: ["role", "tags", "location"]
    });

    expect(result.dryRun).toBe(true);
    expect(result.nextAfterPersonId).toBe("person-1");
    expect(result.suggestionsAccepted).toBe(1);
    expect(result.documentsUpdated).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
    expect(result.suggestions[0]?.role).toEqual(["AI工程师"]);
    expect(result.suggestions[0]?.tags).toEqual(["rag"]);
  });

  it("does not accept low-confidence suggestions", async () => {
    const { db } = makeDb();
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["AI工程师"],
          tags: [],
          location: [],
          confidence: 0.5,
          evidence: "weak",
          reason: "weak"
        }),
        model: "test"
      })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({ provider, limit: 1 });

    expect(result.suggestionsAccepted).toBe(0);
    expect(result.suggestions).toEqual([]);
  });

  it("filters noisy role labels even when the provider returns them", async () => {
    const { db } = makeDb();
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["魔法师", "牛马"],
          tags: [],
          location: [],
          confidence: 0.99,
          evidence: "joke profile",
          reason: "joke profile"
        }),
        model: "test"
      })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({ provider, limit: 1 });

    expect(result.suggestionsAccepted).toBe(0);
    expect(result.suggestions).toEqual([]);
  });

  it("applies accepted suggestions by merging with existing facets", async () => {
    const document = makeDocument({
      facetRole: [],
      facetTags: [],
      facetLocation: []
    });
    const { db, updateSet } = makeDb(document);
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["产品经理"],
          tags: ["Python", "LLM"],
          location: ["上海"],
          confidence: 0.85,
          evidence: "AI product work",
          reason: "product role is explicit"
        }),
        model: "test"
      })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({
      provider,
      limit: 1,
      apply: true,
      missing: ["role", "tags", "location"]
    });

    expect(result.documentsUpdated).toBe(1);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      facetRole: ["产品经理"],
      facetTags: ["python", "llm"],
      facetLocation: ["上海"]
    }));
  });

  it("refreshes embeddings for updated documents when requested", async () => {
    rebuildEmbeddingsMock.mockResolvedValueOnce({
      documentsProcessed: 1,
      embeddingsUpserted: 1,
      personIds: ["person-1"]
    });
    const { db } = makeDb();
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["AI工程师"],
          tags: ["RAG"],
          location: [],
          confidence: 0.9,
          evidence: "RAG engineer",
          reason: "explicit"
        }),
        model: "test"
      })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({
      provider,
      limit: 1,
      apply: true,
      refreshEmbeddings: true
    });

    expect(rebuildEmbeddingsMock).toHaveBeenCalledWith(["person-1"]);
    expect(result.embeddingsRefreshed).toBe(1);
  });

  it("only applies the requested missing facet dimensions", async () => {
    const { db, updateSet } = makeDb();
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["创始人"],
          tags: ["公益"],
          location: ["甘孜"],
          confidence: 0.9,
          evidence: "基金发起人 甘孜",
          reason: "explicit"
        }),
        model: "test"
      })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({
      provider,
      limit: 1,
      apply: true,
      missing: ["role"]
    });

    expect(result.suggestionsAccepted).toBe(1);
    expect(result.suggestions[0]).toEqual(expect.objectContaining({
      role: ["创始人"],
      tags: [],
      location: []
    }));
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      facetRole: ["创始人"],
      facetTags: [],
      facetLocation: []
    }));
  });

  it("passes offset to candidate loading so rejected batches can be skipped", async () => {
    const { db, candidateChain } = makeDb();
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["AI工程师"],
          tags: [],
          location: [],
          confidence: 0.9,
          evidence: "AI engineer",
          reason: "explicit"
        }),
        model: "test"
      })
    } as any;

    await new SearchFacetBackfillWorker(db).run({
      provider,
      limit: 25,
      offset: 50
    });

    expect(candidateChain.limit).toHaveBeenCalledWith(25);
    expect(candidateChain.offset).toHaveBeenCalledWith(50);
  });

  it("returns a keyset cursor for safe apply pagination", async () => {
    const first = makeDocument({ personId: "person-1" });
    const second = makeDocument({ personId: "person-2" });
    const { db } = makeDb([first, second]);
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["AI工程师"],
          tags: [],
          location: [],
          confidence: 0.9,
          evidence: "AI engineer",
          reason: "explicit"
        }),
        model: "test"
      })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({
      provider,
      limit: 2,
      afterPersonId: "person-0"
    });

    expect(result.candidatesScanned).toBe(2);
    expect(result.nextAfterPersonId).toBe("person-2");
  });

  it("supports random candidate sampling", async () => {
    const { db, candidateChain } = makeDb();
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["AI工程师"],
          tags: [],
          location: [],
          confidence: 0.9,
          evidence: "AI engineer",
          reason: "explicit"
        }),
        model: "test"
      })
    } as any;

    await new SearchFacetBackfillWorker(db).run({
      provider,
      limit: 10,
      sample: true
    });

    expect(candidateChain.orderBy).toHaveBeenCalled();
    expect(candidateChain.limit).toHaveBeenCalledWith(10);
  });

  it("rejects random sampling in apply mode", async () => {
    const { db } = makeDb();
    const provider = {
      chat: vi.fn()
    } as any;

    await expect(new SearchFacetBackfillWorker(db).run({
      provider,
      limit: 10,
      sample: true,
      apply: true
    })).rejects.toThrow("--sample is dry-run only");

    expect(provider.chat).not.toHaveBeenCalled();
  });

  it("caps suggested roles to avoid over-broad facet expansion", async () => {
    const { db } = makeDb();
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["学生", "后端工程师", "开源开发者", "AI工程师"],
          tags: [],
          location: [],
          confidence: 0.9,
          evidence: "many signals",
          reason: "many signals"
        }),
        model: "test"
      })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({ provider, limit: 1 });

    expect(result.suggestionsAccepted).toBe(1);
    expect(result.suggestions[0]?.role).toEqual(["学生", "后端工程师"]);
  });

  it("requests text output and parses json content", async () => {
    const { db } = makeDb();
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          role: ["AI Engineer"],
          tags: ["RAG"],
          location: [],
          confidence: 0.9,
          evidence: "AI Engineer and RAG",
          reason: "explicit"
        }),
        model: "test"
      })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({ provider, limit: 1 });

    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(provider.chat).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ responseFormat: "text" }));
    expect(result.suggestionsAccepted).toBe(1);
    expect(result.suggestions[0]?.role).toEqual(["AI工程师"]);
  });

  it("records provider failures and continues with later candidates", async () => {
    const first = makeDocument({ personId: "person-1" });
    const second = makeDocument({ personId: "person-2" });
    const { db } = makeDb([first, second]);
    const provider = {
      chat: vi.fn()
        .mockRejectedValueOnce(new Error("The operation was aborted"))
        .mockResolvedValueOnce({
          content: JSON.stringify({
            role: ["AI Engineer"],
            tags: ["RAG"],
            location: [],
            confidence: 0.9,
            evidence: "AI Engineer and RAG",
            reason: "explicit"
          }),
          model: "test"
        })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({
      provider,
      limit: 2,
      missing: ["role", "tags"]
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.personId).toBe("person-1");
    expect(result.suggestionsAccepted).toBe(1);
    expect(result.suggestions[0]?.personId).toBe("person-2");
  });

  it("parses fenced JSON responses from text fallback", async () => {
    const { db } = makeDb();
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: [
          "```json",
          JSON.stringify({
            role: ["AI Engineer"],
            tags: [],
            location: [],
            confidence: 0.9,
            evidence: "AI Engineer",
            reason: "explicit"
          }),
          "```"
        ].join("\n"),
        model: "test"
      })
    } as any;

    const result = await new SearchFacetBackfillWorker(db).run({ provider, limit: 1 });

    expect(result.suggestionsAccepted).toBe(1);
    expect(result.suggestions[0]?.role).toEqual(["AI工程师"]);
  });
});
