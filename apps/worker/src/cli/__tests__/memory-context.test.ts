import { describe, expect, it, vi } from "vitest";

import { hydrateMemoryContextSafely } from "../memory-context.js";

describe("hydrateMemoryContextSafely", () => {
  it("returns null when no store is provided", async () => {
    await expect(hydrateMemoryContextSafely()).resolves.toBeNull();
  });

  it("returns hydrated context when store succeeds", async () => {
    const context = {
      userId: "user-1",
      memoryPaused: false,
      preferences: [],
      feedbacks: [],
      candidateFeedbacks: [],
      hiringContexts: [],
      allMemories: []
    };

    await expect(
      hydrateMemoryContextSafely({
        hydrateContext: vi.fn().mockResolvedValue(context)
      } as any)
    ).resolves.toEqual(context);
  });

  it("falls back to null when hydration fails", async () => {
    await expect(
      hydrateMemoryContextSafely({
        hydrateContext: vi.fn().mockRejectedValue(new Error("memory unavailable"))
      } as any)
    ).resolves.toBeNull();
  });
});
