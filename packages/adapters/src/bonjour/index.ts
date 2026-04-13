import type { NormalizedProfile } from "@seeku/shared";

import type { DiscoverResult, FetchResult, SourceAdapter } from "../types.js";
import { BonjourClient, type BonjourProfile } from "./client.js";
import { discoverBonjourSeeds } from "./discover.js";
import { normalizeBonjourProfile } from "./normalize.js";

export * from "./client.js";
export * from "./discover.js";
export * from "./dump.js";
export * from "./normalize.js";

export class BonjourAdapter implements SourceAdapter<BonjourProfile> {
  readonly source = "bonjour" as const;
  readonly client: BonjourClient;

  constructor(client = new BonjourClient()) {
    this.client = client;
  }

  async discoverSeeds(input: {
    cursor?: Record<string, unknown>;
    limit: number;
  }): Promise<DiscoverResult> {
    return discoverBonjourSeeds(this.client, input);
  }

  async fetchProfileByHandle(input: { handle: string }): Promise<FetchResult<BonjourProfile>> {
    const rawPayload = await this.client.fetchProfileByLink(input.handle);
    const profile = await this.normalizeProfile({ rawProfile: rawPayload });

    return {
      profile,
      rawPayload,
      sourceHandle: profile.sourceHandle
    };
  }

  async normalizeProfile(input: { rawProfile: BonjourProfile }): Promise<NormalizedProfile> {
    return normalizeBonjourProfile(input.rawProfile);
  }
}

export function createBonjourAdapter(client?: BonjourClient) {
  return new BonjourAdapter(client);
}
