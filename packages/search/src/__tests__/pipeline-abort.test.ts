import { describe, expect, it, vi } from "vitest";

import { SearchPipeline } from "../pipeline.js";

describe("SearchPipeline abort", () => {
  it("passes parent signal to planner and embedding provider", async () => {
    const controller = new AbortController();
    const provider = {
      name: "mock",
      chat: vi.fn(),
      embed: vi.fn(async (_text: string, options?: { signal?: AbortSignal }) => {
        expect(options?.signal).toBe(controller.signal);
        throw controller.signal.reason ?? new Error("pipeline interrupted");
      }),
      embedBatch: vi.fn()
    };

    const pipeline = new SearchPipeline({
      db: {} as any,
      provider: provider as any
    });

    (pipeline as any).planner = {
      parse: vi.fn(async (_query: string, options?: { signal?: AbortSignal }) => {
        expect(options?.signal).toBe(controller.signal);
        return {
          rawQuery: "python engineer",
          roles: [],
          skills: ["python"],
          locations: [],
          mustHaves: [],
          niceToHaves: []
        };
      })
    };

    controller.abort(new Error("pipeline interrupted"));

    await expect(
      pipeline.search("python engineer", undefined, undefined, { signal: controller.signal })
    ).rejects.toThrow("pipeline interrupted");
  });
});
