import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@seeku/db", async () => {
  return {
    columnsToScope: vi.fn(() => ({ kind: "global" })),
    createUserMemory: vi.fn(),
    deleteUserMemory: vi.fn(),
    deleteUserMemoriesByScope: vi.fn(),
    expireUserMemories: vi.fn(),
    getCandidateFeedbackHistory: vi.fn(),
    deleteCandidateFeedback: vi.fn(),
    getUserMemory: vi.fn(),
    getUserPreference: vi.fn(),
    hydrateUserMemoryContext: vi.fn(),
    isMemoryPaused: vi.fn(),
    listUserMemories: vi.fn(),
    setMemoryPaused: vi.fn(),
    updateUserMemory: vi.fn()
  };
});

import {
  getCandidateFeedbackHistory,
  hydrateUserMemoryContext,
  isMemoryPaused,
  listUserMemories
} from "@seeku/db";
import { UserMemoryStore } from "../user-memory-store.js";

const identityProvider = {
  getUserId: () => "user-1"
};

function createStore() {
  return new UserMemoryStore({} as any, identityProvider as any);
}

describe("UserMemoryStore missing schema fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats missing user_preferences as memory not paused", async () => {
    vi.mocked(isMemoryPaused).mockRejectedValueOnce(new Error('relation "user_preferences" does not exist'));

    await expect(createStore().isMemoryPaused()).resolves.toBe(false);
  });

  it("returns an empty memory context when memory tables are missing", async () => {
    vi.mocked(hydrateUserMemoryContext).mockRejectedValueOnce(new Error('relation "user_preferences" does not exist'));
    vi.mocked(getCandidateFeedbackHistory).mockResolvedValueOnce([] as any);

    await expect(createStore().hydrateContext()).resolves.toEqual({
      userId: "user-1",
      memoryPaused: false,
      preferences: [],
      feedbacks: [],
      candidateFeedbacks: [],
      hiringContexts: [],
      allMemories: []
    });
  });

  it("returns an empty list when user_memories table is missing", async () => {
    vi.mocked(listUserMemories).mockRejectedValueOnce(new Error('relation "user_memories" does not exist'));

    await expect(createStore().list()).resolves.toEqual([]);
  });

  it("rethrows non-recoverable memory DB errors", async () => {
    vi.mocked(isMemoryPaused).mockRejectedValueOnce(new Error("invalid input syntax for type json"));

    await expect(createStore().isMemoryPaused()).rejects.toThrow("invalid input syntax");
  });
});
