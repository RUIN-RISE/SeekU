import type { NormalizedProfile } from "@seeku/shared";

import type { DiscoverResult, FetchResult, SourceAdapter } from "../types.js";
import { GithubClient, type GithubProfile } from "./client.js";
import { normalizeGithubProfile } from "./normalize.js";

export * from "./client.js";
export * from "./normalize.js";

export class GithubAdapter implements SourceAdapter<GithubProfile> {
  readonly source = "github" as const;
  readonly client: GithubClient;

  constructor(client = new GithubClient()) {
    this.client = client;
  }

  async discoverSeeds(_: { cursor?: Record<string, unknown>; limit: number }): Promise<DiscoverResult> {
    return {
      profiles: [],
      nextCursor: undefined,
      hasMore: false
    };
  }

  async fetchProfileByHandle(input: { handle: string }): Promise<FetchResult<GithubProfile>> {
    const rawPayload = await this.client.fetchProfileByUsername(input.handle);
    const profile = await this.normalizeProfile({ rawProfile: rawPayload });

    return {
      profile,
      rawPayload,
      sourceHandle: profile.sourceHandle
    };
  }

  async normalizeProfile(input: { rawProfile: GithubProfile }): Promise<NormalizedProfile> {
    return normalizeGithubProfile(input.rawProfile);
  }
}

export function createGithubAdapter(client?: GithubClient) {
  return new GithubAdapter(client);
}
