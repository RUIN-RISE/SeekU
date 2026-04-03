import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../retry.js";

describe("withRetry", () => {
  it("returns result on first successful call", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable errors and succeeds", async () => {
    const error = Object.assign(new Error("Server Error"), { status: 500 });
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue("recovered");

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1, // Fast for tests
    });

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on non-retryable errors (400)", async () => {
    const error = Object.assign(new Error("Bad Request"), { status: 400 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn)).rejects.toThrow("Bad Request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws immediately on non-retryable errors (401)", async () => {
    const error = Object.assign(new Error("Unauthorized"), { status: 401 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn)).rejects.toThrow("Unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exhausted", async () => {
    const error = Object.assign(new Error("Service Unavailable"), { status: 503 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })
    ).rejects.toThrow("Service Unavailable");

    // 1 initial + 2 retries = 3 total calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries on 429 rate limit", async () => {
    const error = Object.assign(new Error("Too Many Requests"), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on network error codes", async () => {
    const error = new Error("connection reset");
    (error as NodeJS.ErrnoException).code = "ECONNRESET";

    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects custom isRetryable predicate", async () => {
    const error = new Error("custom");
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        isRetryable: () => false
      })
    ).rejects.toThrow("custom");

    expect(fn).toHaveBeenCalledTimes(1); // No retries
  });

  it("uses exponential backoff with jitter", async () => {
    const error = Object.assign(new Error("retry"), { status: 500 });
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue("ok");

    const start = Date.now();
    await withRetry(fn, { maxRetries: 1, baseDelayMs: 50 });
    const elapsed = Date.now() - start;

    // Should have waited ~50ms + jitter (0-50ms)
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
