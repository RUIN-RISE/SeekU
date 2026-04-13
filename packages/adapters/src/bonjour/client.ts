import { DEFAULT_ADAPTER_CONFIG, type AdapterConfig } from "../types.js";

export const BONJOUR_BASE_URL =
  "https://fc-mp-b1a9bc8c-0aab-44ca-9af2-2bd604163a78.next.bspapp.com";

interface BonjourClientConfig extends AdapterConfig {
  authToken?: string;
}

export interface BonjourSocial {
  type: string;
  content: string;
}

export interface BonjourContact {
  type: string;
  content: string;
}

export interface BonjourCreation {
  url: string;
  title: string;
  description: string;
  image?: string;
}

export interface BonjourRegion {
  countryName?: string;
  provinceName?: string;
  cityName?: string;
}

export interface BonjourBasicInfo {
  region?: BonjourRegion;
  current_doing?: string;
  role?: string;
  skill?: string;
  gender?: string;
  personalCredit?: Record<string, unknown>;
}

export interface BonjourGridItem {
  id: string;
  sizeIndex: number;
  position: {
    x: number;
    y: number;
  };
  content: Record<string, unknown>;
}

export interface BonjourProfile {
  _id: string;
  user_id?: number;
  profile_id?: number;
  profile_link: string;
  user_link?: string;
  create_time?: string;
  update_time?: string;
  name?: string;
  bio?: string;
  description?: string;
  avatar?: string;
  socials?: BonjourSocial[];
  contacts?: BonjourContact[];
  creations?: BonjourCreation[];
  gridItems?: BonjourGridItem[];
  basicInfo?: BonjourBasicInfo;
  inflationInProgress?: boolean;
  inflationRequired?: boolean;
  inflationKey?: string;
  audit_details?: Record<string, unknown>;
  memories?: Record<string, unknown>;
}

export interface BonjourCategory {
  _id: string;
  key: string;
  title: string;
  description?: string;
  emoji?: string;
  plainText?: string;
  priority?: number;
  update_time?: string;
}

export interface BonjourProfileReference {
  profile_link: string;
  name?: string;
  description?: string;
  avatar?: string;
}

export interface BonjourCommunityPost {
  _id: string;
  content?: string;
  create_time?: string;
  update_time?: string;
  link?: string;
  type?: string;
  admin_state?: string;
  images?: string[];
  attachments?: string[];
  comments?: string[];
  like?: string[];
  event_id?: string[];
  linkDetail?: Record<string, unknown>;
  category?: BonjourCategory[];
  profile_link?: BonjourProfileReference[];
}

export interface BonjourCommunityComment {
  _id: string;
  content?: string;
  post_id: string;
  admin_state?: string;
  user_state?: string;
  profile_link?: string;
  create_time?: string;
  update_time?: string;
  profile?: {
    _id?: string;
    profile_link?: string;
    name?: string;
    description?: string;
    avatar?: string;
  };
}

export interface BonjourFriendLinkEntry {
  profile_link: string;
  name?: string;
  avatar?: string;
  description?: string;
  comment?: unknown;
  create_time?: string;
  update_time?: string;
}

export interface BonjourFriendLinkResponse {
  friend: BonjourFriendLinkEntry[];
  friended: BonjourFriendLinkEntry[];
}

interface BonjourApiSuccess<T> {
  success: true;
  data: T;
}

interface BonjourApiFailure {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
}

type BonjourApiResponse<T> = BonjourApiSuccess<T> | BonjourApiFailure;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBonjourApiFailure<T>(payload: BonjourApiResponse<T>): payload is BonjourApiFailure {
  return payload.success === false;
}

export class BonjourClient {
  private readonly config: BonjourClientConfig;
  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(config: Partial<BonjourClientConfig> = {}) {
    this.config = {
      baseUrl: BONJOUR_BASE_URL,
      ...DEFAULT_ADAPTER_CONFIG,
      ...config
    };
  }

  private async withRateLimit<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.requestQueue;
    let releaseQueue!: () => void;

    this.requestQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
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
      releaseQueue();
    }
  }

  private async fetchWithRetry<T>(url: URL): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt += 1) {
      try {
        return await this.withRateLimit(async () => {
          const response = await fetch(url, {
            headers: {
              accept: "application/json",
              ...(this.config.authToken ? { token: this.config.authToken } : {})
            },
            signal: AbortSignal.timeout(this.config.timeout)
          });

          if (!response.ok) {
            throw new Error(`Bonjour API returned HTTP ${response.status} for ${url.pathname}`);
          }

          const payload = (await response.json()) as BonjourApiResponse<T>;

          if (isBonjourApiFailure(payload)) {
            const message = payload.error?.message ?? "Unknown Bonjour API error";
            const code = payload.error?.code ? `${payload.error.code}: ` : "";
            throw new Error(`${code}${message}`);
          }

          return payload.data;
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.maxRetries - 1) {
          await sleep(500 * 2 ** attempt);
        }
      }
    }

    throw lastError ?? new Error("Bonjour API request failed.");
  }

  private buildUrl(pathname: string, searchParams?: Record<string, string | number | undefined>) {
    const url = new URL(pathname, this.config.baseUrl);

    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url;
  }

  async fetchProfileByLink(link: string, options: { inflate?: boolean } = {}): Promise<BonjourProfile> {
    return this.fetchWithRetry<BonjourProfile>(
      this.buildUrl(
        `/profile/${encodeURIComponent(link)}`,
        options.inflate ? { inflate: "true" } : undefined
      )
    );
  }

  async fetchProfileByHandle(handle: string, options: { inflate?: boolean } = {}): Promise<BonjourProfile> {
    return this.fetchProfileByLink(handle, options);
  }

  async fetchProfileByProfileLink(profileLink: string, options: { inflate?: boolean } = {}): Promise<BonjourProfile> {
    return this.fetchProfileByLink(profileLink, options);
  }

  async fetchCategories(): Promise<BonjourCategory[]> {
    return this.fetchWithRetry<BonjourCategory[]>(this.buildUrl("/user/category"));
  }

  async fetchCommunityPostsByCategory(
    category: string,
    limit = 20,
    skip = 0
  ): Promise<BonjourCommunityPost[]> {
    return this.fetchWithRetry<BonjourCommunityPost[]>(
      this.buildUrl("/user/community", {
        type: "category",
        category,
        limit,
        skip
      })
    );
  }

  async fetchCommunityPostsByProfileLink(
    profileLink: string,
    limit = 20,
    skip = 0
  ): Promise<BonjourCommunityPost[]> {
    return this.fetchWithRetry<BonjourCommunityPost[]>(
      this.buildUrl("/user/community", {
        type: "profile_link",
        profile_link: profileLink,
        limit,
        skip
      })
    );
  }

  async fetchGlobalCommunityPosts(limit = 20, skip = 0): Promise<BonjourCommunityPost[]> {
    return this.fetchWithRetry<BonjourCommunityPost[]>(
      this.buildUrl("/user/community", {
        limit,
        skip
      })
    );
  }

  async fetchCommunityCommentsByPostId(postId: string): Promise<BonjourCommunityComment[]> {
    return this.fetchWithRetry<BonjourCommunityComment[]>(
      this.buildUrl("/user/communitycomment", {
        _id: postId
      })
    );
  }

  async fetchOwnProfile(): Promise<BonjourProfile> {
    return this.fetchWithRetry<BonjourProfile>(this.buildUrl("/user/profile"));
  }

  async fetchFriendLinks(handle?: string): Promise<BonjourFriendLinkResponse> {
    return this.fetchWithRetry<BonjourFriendLinkResponse>(
      handle
        ? this.buildUrl(`/user/friend/${encodeURIComponent(handle)}`)
        : this.buildUrl("/user/friend")
    );
  }
}
