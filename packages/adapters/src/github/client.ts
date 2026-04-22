import { DEFAULT_ADAPTER_CONFIG, type AdapterConfig } from "../types.js";

export const GITHUB_BASE_URL = "https://api.github.com";

export interface GithubProfile {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  bio: string | null;
  twitter_username: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export interface GithubRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  owner: {
    login: string;
  };
}

export interface GithubUserSummary {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortError(message: string) {
  return new DOMException(message, "AbortError");
}

async function sleepWithSignal(ms: number, signal?: AbortSignal) {
  if (ms <= 0) {
    return;
  }

  if (signal?.aborted) {
    throw signal.reason ?? createAbortError("GitHub request aborted.");
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? createAbortError("GitHub request aborted."));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createRequestSignal(timeoutMs: number, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const onParentAbort = () => {
    controller.abort(parentSignal?.reason ?? createAbortError("GitHub request aborted."));
  };

  if (parentSignal?.aborted) {
    controller.abort(parentSignal.reason ?? createAbortError("GitHub request aborted."));
  } else if (parentSignal) {
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(createAbortError(`GitHub request timed out after ${timeoutMs}ms.`));
    }
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", onParentAbort);
    }
  };
}

export class GithubClient {
  private readonly config: AdapterConfig;
  private readonly token?: string;
  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(config: Partial<AdapterConfig> = {}, token = process.env.GITHUB_TOKEN) {
    this.config = {
      baseUrl: GITHUB_BASE_URL,
      ...DEFAULT_ADAPTER_CONFIG,
      ...config
    };
    this.token = token;
  }

  private async withRateLimit<T>(operation: () => Promise<T>, signal?: AbortSignal) {
    const previous = this.requestQueue;
    let release!: () => void;

    this.requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      if (signal?.aborted) {
        throw signal.reason ?? createAbortError("GitHub request aborted.");
      }

      const waitMs = Math.max(0, this.lastRequestAt + this.config.requestDelay - Date.now());
      if (waitMs > 0) {
        await sleepWithSignal(waitMs, signal);
      }

      this.lastRequestAt = Date.now();
      return await operation();
    } finally {
      release();
    }
  }

  private createHeaders() {
    return {
      accept: "application/vnd.github+json",
      "user-agent": "seeku-github-adapter",
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
    };
  }

  private async fetchWithRetry<T>(
    pathname: string,
    searchParams?: Record<string, string | number>,
    signal?: AbortSignal
  ) {
    const url = new URL(pathname, this.config.baseUrl);

    for (const [key, value] of Object.entries(searchParams ?? {})) {
      url.searchParams.set(key, String(value));
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt += 1) {
      try {
        return await this.withRateLimit(async () => {
          const request = createRequestSignal(this.config.timeout, signal);

          try {
          const response = await fetch(url, {
            headers: this.createHeaders(),
            signal: request.signal
          });

          if (response.status === 404) {
            throw new Error(`GitHub resource not found: ${url.pathname}`);
          }

          if (!response.ok) {
            const body = await response.text();
            throw new Error(`GitHub API error ${response.status}: ${body || response.statusText}`);
          }

          return (await response.json()) as T;
          } finally {
            request.cleanup();
          }
        }, signal);
      } catch (error) {
        if (signal?.aborted) {
          throw signal.reason ?? (error instanceof Error ? error : new Error(String(error)));
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.maxRetries - 1) {
          await sleepWithSignal(500 * 2 ** attempt, signal);
        }
      }
    }

    throw lastError ?? new Error("GitHub API request failed.");
  }

  async fetchProfileByUsername(username: string, options: { signal?: AbortSignal } = {}) {
    return this.fetchWithRetry<GithubProfile>(`/users/${encodeURIComponent(username)}`, undefined, options.signal);
  }

  async fetchRepositoriesByUsername(username: string, options: { signal?: AbortSignal } = {}) {
    return this.fetchWithRetry<GithubRepository[]>(`/users/${encodeURIComponent(username)}/repos`, {
      per_page: 100,
      sort: "updated",
      direction: "desc",
      type: "owner"
    }, options.signal);
  }

  async fetchFollowingByUsername(username: string, options: { signal?: AbortSignal } = {}) {
    return this.fetchWithRetry<GithubUserSummary[]>(`/users/${encodeURIComponent(username)}/following`, {
      per_page: 30
    }, options.signal);
  }

  async fetchFollowersByUsername(username: string, options: { signal?: AbortSignal } = {}) {
    return this.fetchWithRetry<GithubUserSummary[]>(`/users/${encodeURIComponent(username)}/followers`, {
      per_page: 30
    }, options.signal);
  }

  async searchUsers(
    query: string,
    options: { page?: number; per_page?: number; signal?: AbortSignal } = {}
  ) {
    return this.fetchWithRetry<{
      total_count: number;
      incomplete_results: boolean;
      items: GithubUserSummary[];
    }>("/search/users", {
      q: query,
      page: options.page ?? 1,
      per_page: options.per_page ?? 30
    }, options.signal);
  }
}
