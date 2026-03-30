import { CLI_CONFIG } from "./config.js";
import chalk from "chalk";

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  factor?: number;
  quiet?: boolean;
}

/**
 * Check if an error is considered retryable (e.g. rate limit, timeout, server error)
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    // AbortError from our AbortController timeout
    if (error.name === "AbortError") return true;
    
    const msg = error.message.toLowerCase();
    
    // HTTP Status codes
    if (msg.includes("429")) return true; // Rate limit
    if (msg.includes("503")) return true; // Service unavailable
    if (msg.includes("504")) return true; // Gateway timeout
    if (msg.includes("502")) return true; // Bad gateway
    
    // Network errors
    if (msg.includes("timeout")) return true;
    if (msg.includes("etimedout")) return true;
    if (msg.includes("econnreset")) return true;
    
    // Explicit exclusions
    if (msg.includes("401") || msg.includes("unauthorized")) return false;
    if (msg.includes("403") || msg.includes("forbidden")) return false;
    if (msg.includes("400") || msg.includes("bad request")) return false;
    if (msg.includes("404") || msg.includes("not found")) return false;
  }
  
  return true; // Default to retry if unknown
}

/**
 * Executes a function with exponential backoff retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? CLI_CONFIG.llm.maxRetries;
  const baseDelay = options.baseDelay ?? 1000;
  const factor = options.factor ?? 2;
  const quiet = options.quiet ?? false;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!isRetryable(error) || attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * Math.pow(factor, attempt);
      if (!quiet) {
        console.warn(chalk.yellow(`\n⚠️  Operation failed, retrying in ${delay}ms (Attempt ${attempt + 1}/${maxRetries})...`));
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
