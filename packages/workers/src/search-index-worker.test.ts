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

import { SearchIndexWorker } from "./search-index-worker.js";

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
});
