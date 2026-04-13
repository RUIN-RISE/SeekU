import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("SearchIndexWorker", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves all active persons for full rebuilds without applying batch-size limit", async () => {
    const fakeProvider = {
      name: "test",
      chat: vi.fn(),
      embed: vi.fn(),
      embedBatch: vi.fn(),
      getEmbeddingDimension: vi.fn(() => 3)
    } as any;
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
    const fakeProvider = {
      name: "test",
      chat: vi.fn(),
      embed: vi.fn(),
      embedBatch: vi.fn(),
      getEmbeddingDimension: vi.fn(() => 3)
    } as any;
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
      provider: {
        name: "test",
        chat: vi.fn(),
        embed: vi.fn(),
        embedBatch: vi.fn(),
        getEmbeddingDimension: vi.fn(() => 3)
      } as any
    });

    expect(rebuildSpy).toHaveBeenCalledWith(["person-1"]);
    expect(rebuildAllSpy).not.toHaveBeenCalled();
  });
});
