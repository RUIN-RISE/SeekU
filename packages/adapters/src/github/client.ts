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

  private async withRateLimit<T>(operation: () => Promise<T>) {
    const previous = this.requestQueue;
    let release!: () => void;

    this.requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      const waitMs = Math.max(0, this.lastRequestAt + this.config.requestDelay - Date.now());
      if (waitMs > 0) {
        await sleep(waitMs);
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

  private async fetchWithRetry<T>(pathname: string, searchParams?: Record<string, string | number>) {
    const url = new URL(pathname, this.config.baseUrl);

    for (const [key, value] of Object.entries(searchParams ?? {})) {
      url.searchParams.set(key, String(value));
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt += 1) {
      try {
        return await this.withRateLimit(async () => {
          const response = await fetch(url, {
            headers: this.createHeaders(),
            signal: AbortSignal.timeout(this.config.timeout)
          });

          if (response.status === 404) {
            throw new Error(`GitHub resource not found: ${url.pathname}`);
          }

          if (!response.ok) {
            const body = await response.text();
            throw new Error(`GitHub API error ${response.status}: ${body || response.statusText}`);
          }

          return (await response.json()) as T;
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.maxRetries - 1) {
          await sleep(500 * 2 ** attempt);
        }
      }
    }

    throw lastError ?? new Error("GitHub API request failed.");
  }

  async fetchProfileByUsername(username: string) {
    return this.fetchWithRetry<GithubProfile>(`/users/${encodeURIComponent(username)}`);
  }

  async fetchRepositoriesByUsername(username: string) {
    return this.fetchWithRetry<GithubRepository[]>(`/users/${encodeURIComponent(username)}/repos`, {
      per_page: 100,
      sort: "updated",
      direction: "desc",
      type: "owner"
    });
  }

  async fetchFollowingByUsername(username: string) {
    return this.fetchWithRetry<GithubUserSummary[]>(`/users/${encodeURIComponent(username)}/following`, {
      per_page: 30
    });
  }

  async fetchFollowersByUsername(username: string) {
    return this.fetchWithRetry<GithubUserSummary[]>(`/users/${encodeURIComponent(username)}/followers`, {
      per_page: 30
    });
  }

  async searchUsers(query: string, options: { page?: number; per_page?: number } = {}) {
    return this.fetchWithRetry<{
      total_count: number;
      incomplete_results: boolean;
      items: GithubUserSummary[];
    }>("/search/users", {
      q: query,
      page: options.page ?? 1,
      per_page: options.per_page ?? 30
    });
  }
}
