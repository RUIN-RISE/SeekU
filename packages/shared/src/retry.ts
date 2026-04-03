/**
 * Generic retry utility with exponential backoff and jitter.
 *
 * @module shared/retry
 */

export interface RetryOptions {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 30000) */
  maxDelayMs?: number;
  /** Predicate to decide if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ENETUNREACH"
]);

function defaultIsRetryable(error: unknown): boolean {
  if (error && typeof error === "object") {
    // OpenAI SDK errors have a `status` property
    if ("status" in error) {
      const status = (error as { status: number }).status;
      return RETRYABLE_HTTP_STATUSES.has(status);
    }
    // Node.js network errors have a `code` property
    if ("code" in error) {
      const code = (error as { code: string }).code;
      return RETRYABLE_ERROR_CODES.has(code);
    }
  }
  // Unknown errors: don't retry by default (conservative)
  return false;
}

/**
 * Execute `fn` with automatic retry on transient failures.
 * Uses exponential backoff with random jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    isRetryable = defaultIsRetryable,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }

      const jitter = Math.random() * baseDelayMs;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, maxDelayMs);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
