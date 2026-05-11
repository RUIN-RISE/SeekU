import { afterEach, describe, expect, it, vi } from "vitest";
import { searchDocuments } from "@seeku/db";

const { listActivePersonsMock } = vi.hoisted(() => ({
  listActivePersonsMock: vi.fn()
}));

vi.mock("@seeku/db", async () => {
  const actual = await vi.importActual<typeof import("@seeku/db")>("@seeku/db");
  return {
    ...actual,
    listActivePersons: listActivePersonsMock
  };
});

import { runSearchRebuildWorker, SearchIndexWorker } from "./search-index-worker.js";

const fakeProvider = {
  name: "test",
  chat: vi.fn(),
  embed: vi.fn(),
  embedBatch: vi.fn(),
  getEmbeddingDimension: vi.fn(() => 3)
} as any;

describe("SearchIndexWorker", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves all active persons for full rebuilds without applying batch-size limit", async () => {
    const worker = new SearchIndexWorker({} as any, {
      batchSize: 25,
      provider: fakeProvider
    });
    const people = [
      { id: "person-1" },
      { id: "person-2" }
    ];

    listActivePersonsMock.mockResolvedValue(people);

    const resolved = await (worker as any).resolvePersons();

    expect(listActivePersonsMock).toHaveBeenCalledWith(expect.anything());
    expect(resolved).toEqual(people);
  });

  it("treats an explicit empty person-id list as a no-op instead of a full rebuild", async () => {
    const worker = new SearchIndexWorker({} as any, {
      batchSize: 25,
      provider: fakeProvider
    });

    const resolved = await (worker as any).resolvePersons([]);

    expect(listActivePersonsMock).not.toHaveBeenCalled();
    expect(resolved).toEqual([]);
  });

  it("uses targeted rebuild when person ids are provided", async () => {
    const rebuildSpy = vi
      .spyOn(SearchIndexWorker.prototype, "rebuild")
      .mockResolvedValue({} as any);
    const rebuildAllSpy = vi
      .spyOn(SearchIndexWorker.prototype, "rebuildAll")
      .mockResolvedValue({} as any);

    await runSearchRebuildWorker(["person-1"], {} as any, {
      provider: fakeProvider
    });

    expect(rebuildSpy).toHaveBeenCalledWith(["person-1"]);
    expect(rebuildAllSpy).not.toHaveBeenCalled();
  });

  it("stores force flag from config", () => {
    const workerForced = new SearchIndexWorker({} as any, {
      provider: fakeProvider,
      force: true
    });
    const workerNormal = new SearchIndexWorker({} as any, {
      provider: fakeProvider
    });

    expect((workerForced as any).force).toBe(true);
    expect((workerNormal as any).force).toBe(false);
  });

  it("force mode targets every search document exactly once", async () => {
    const worker = new SearchIndexWorker(
      {
        select() {
          return {
            from(table: unknown) {
              expect(table).toBe(searchDocuments);
              return {
                orderBy() {
                  return [
                    { personId: "person-1" },
                    { personId: "person-2" },
                    { personId: "person-3" },
                    { personId: "person-4" }
                  ];
                }
              };
            }
          };
        }
      } as any,
      {
        batchSize: 2,
        provider: fakeProvider,
        force: true
      }
    );

    const rebuildSpy = vi.spyOn(worker as any, "rebuildEmbeddings").mockImplementation(
      async (...args: unknown[]) => {
        const ids = args[0] as string[];
        return {
          documentsProcessed: ids.length,
          embeddingsUpserted: ids.length,
          personIds: ids
        };
      }
    );

    const result = await worker.rebuildAllEmbeddings();

    expect(rebuildSpy).toHaveBeenCalledTimes(2);
    expect(rebuildSpy).toHaveBeenNthCalledWith(1, ["person-1", "person-2"]);
    expect(rebuildSpy).toHaveBeenNthCalledWith(2, ["person-3", "person-4"]);
    expect(result.personIds).toEqual(["person-1", "person-2", "person-3", "person-4"]);
    expect(result.errors).toEqual([]);
  });

  it("rebuildAllEmbeddings processes all targets in batches", async () => {
    const worker = new SearchIndexWorker({} as any, {
      batchSize: 2,
      provider: fakeProvider
    });

    vi.spyOn(worker as any, "loadEmbeddingTargetIds").mockResolvedValue([
      "person-1",
      "person-2",
      "person-3",
      "person-4",
      "person-5"
    ]);
    const rebuildSpy = vi.spyOn(worker as any, "rebuildEmbeddings").mockImplementation(
      async (...args: unknown[]) => {
        const ids = args[0] as string[];
        return {
          documentsProcessed: ids.length,
          embeddingsUpserted: ids.length,
          personIds: ids
        };
      }
    );

    const result = await worker.rebuildAllEmbeddings();

    expect(rebuildSpy).toHaveBeenCalledTimes(3);
    expect(rebuildSpy).toHaveBeenNthCalledWith(1, ["person-1", "person-2"]);
    expect(rebuildSpy).toHaveBeenNthCalledWith(2, ["person-3", "person-4"]);
    expect(rebuildSpy).toHaveBeenNthCalledWith(3, ["person-5"]);
    expect(result.documentsProcessed).toBe(5);
    expect(result.embeddingsUpserted).toBe(5);
    expect(result.errors).toEqual([]);
  });

  it("rebuildAllEmbeddings reports batch errors and keeps going", async () => {
    const worker = new SearchIndexWorker({} as any, {
      batchSize: 2,
      provider: fakeProvider
    });

    vi.spyOn(worker as any, "loadEmbeddingTargetIds").mockResolvedValue([
      "person-1",
      "person-2",
      "person-3",
      "person-4",
      "person-5"
    ]);
    const rebuildSpy = vi
      .spyOn(worker, "rebuildEmbeddings")
      .mockResolvedValueOnce({
        documentsProcessed: 2,
        embeddingsUpserted: 2,
        personIds: ["person-1", "person-2"]
      })
      .mockRejectedValueOnce(new Error("embedding API timeout"))
      .mockResolvedValueOnce({
        documentsProcessed: 1,
        embeddingsUpserted: 1,
        personIds: ["person-5"]
      });

    const result = await worker.rebuildAllEmbeddings();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("embedding API timeout");
    expect(rebuildSpy).toHaveBeenCalledTimes(3);
    expect(result.documentsProcessed).toBe(3);
    expect(result.embeddingsUpserted).toBe(3);
  });

  it("refreshes updatedAt when facets or rank features change", async () => {
    const onConflictDoUpdate = vi.fn();
    const values = vi.fn(() => ({
      onConflictDoUpdate
    }));
    const insert = vi.fn(() => ({
      values
    }));
    const worker = new SearchIndexWorker(
      {
        insert
      } as any,
      {
        provider: fakeProvider
      }
    );

    await (worker as any).upsertDocument({
      personId: "person-1",
      docText: "same text",
      facetRole: ["工程师"],
      facetLocation: ["杭州"],
      facetSource: ["bonjour"],
      facetTags: ["rag"],
      rankFeatures: {
        evidenceCount: 1,
        projectCount: 0,
        repoCount: 0,
        followerCount: 0,
        freshness: 0
      },
      updatedAt: new Date("2026-05-11T00:00:00.000Z")
    });

    expect(insert).toHaveBeenCalledWith(searchDocuments);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const [{ set }] = onConflictDoUpdate.mock.calls[0];
    expect(set.facetRole).toEqual(["工程师"]);
    expect(set.facetTags).toEqual(["rag"]);
    expect(set.rankFeatures).toEqual({
      evidenceCount: 1,
      projectCount: 0,
      repoCount: 0,
      followerCount: 0,
      freshness: 0
    });
    expect(set.updatedAt).toBeTruthy();
  });
});
