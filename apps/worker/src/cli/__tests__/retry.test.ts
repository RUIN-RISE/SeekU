import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../retry.js";

describe("withRetry", () => {
  it("suppresses retry warnings when quiet is enabled", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let attempts = 0;

    const result = await withRetry(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("429 status code");
      }
      return "ok";
    }, {
      maxRetries: 1,
      baseDelay: 0,
      quiet: true
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
