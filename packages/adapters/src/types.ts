import type { NormalizedProfile, SourceName } from "@seeku/shared";

export interface SourceSeed {
  handle: string;
  sourceProfileId?: string;
  rawPayload: unknown;
}

export interface DiscoverResult {
  profiles: SourceSeed[];
  nextCursor?: Record<string, unknown>;
  hasMore: boolean;
}

export interface FetchResult<T = unknown> {
  profile: NormalizedProfile;
  rawPayload: T;
  sourceHandle: string;
}

export interface SourceAdapter<T = unknown> {
  readonly source: SourceName;
  discoverSeeds(input: { cursor?: Record<string, unknown>; limit: number; signal?: AbortSignal }): Promise<DiscoverResult>;
  fetchProfileByHandle(input: { handle: string; signal?: AbortSignal }): Promise<FetchResult<T>>;
  normalizeProfile(input: { rawProfile: T }): Promise<NormalizedProfile>;
}

export interface AdapterConfig {
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  requestDelay: number;
}

export const DEFAULT_ADAPTER_CONFIG: Omit<AdapterConfig, "baseUrl"> = {
  timeout: 10_000,
  maxRetries: 3,
  requestDelay: 250
};
