import { describe, expect, it, vi } from "vitest";

import { CrossEncoder } from "../cross-encoder.js";

describe("CrossEncoder abort", () => {
  it("rethrows when parent signal aborts scoring", async () => {
    const controller = new AbortController();
    const provider = {
      chat: vi.fn(async (_messages: unknown, options?: { signal?: AbortSignal }) =>
        await new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
        })
      )
    };

    const encoder = new CrossEncoder({
      provider: provider as any,
      timeoutMs: 5000
    });

    const scoring = encoder.scoreBatch(
      {
        rawQuery: "python engineer",
        roles: ["engineer"],
        skills: ["python"],
        locations: [],
        mustHaves: [],
        niceToHaves: []
      },
      [{
        personId: "person-1",
        name: "Ada",
        headline: "Python Engineer",
        skills: ["python"],
        roles: ["engineer"],
        projects: [],
        repositories: []
      }],
      { signal: controller.signal }
    );

    controller.abort(new Error("cross encoder interrupted"));

    await expect(scoring).rejects.toThrow("cross encoder interrupted");
  });
});
