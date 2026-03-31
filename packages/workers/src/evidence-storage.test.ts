import { afterEach, describe, expect, it, vi } from "vitest";

const {
  listActivePersonsMock,
  listIdentitiesByPersonIdMock
} = vi.hoisted(() => ({
  listActivePersonsMock: vi.fn(),
  listIdentitiesByPersonIdMock: vi.fn()
}));

vi.mock("@seeku/db", async () => {
  const actual = await vi.importActual<typeof import("@seeku/db")>("@seeku/db");
  return {
    ...actual,
    listActivePersons: listActivePersonsMock,
    listIdentitiesByPersonId: listIdentitiesByPersonIdMock
  };
});

import { runEvidenceStorageWorker } from "./evidence-storage.js";

describe("runEvidenceStorageWorker", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("processes all active people when no personIds are provided", async () => {
    listActivePersonsMock.mockResolvedValue([
      { id: "person-1" },
      { id: "person-2" }
    ]);
    listIdentitiesByPersonIdMock.mockResolvedValue([]);

    const result = await runEvidenceStorageWorker(undefined, {} as any);

    expect(listActivePersonsMock).toHaveBeenCalledWith(expect.anything());
    expect(result.personsProcessed).toBe(2);
  });
});
