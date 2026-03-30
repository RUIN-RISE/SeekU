import {
  and,
  eq,
  evidenceItems,
  inArray,
  not,
  sourceProfiles,
  type SeekuDatabase
} from "@seeku/db";
import { GithubClient } from "@seeku/adapters";
import { syncGithubProfile } from "../github-sync.js";

/**
 * SocialDiscoveryService - 人脉与社交挖掘引擎 (Hardened 2.0)
 * 
 * DESIGN RATIONALE:
 * 已修复: [P1] 发现泄露问题。改为调用底层 syncGithubProfile，确保只同步发现的 handle，
 * 不会触发 Bonjour 历史数据的大规模全量重对齐。
 * 
 * @module Enrichment/Discovery
 */

export class SocialDiscoveryService {
  private db: SeekuDatabase;
  private githubClient: GithubClient;

  constructor(db: SeekuDatabase, githubClient?: GithubClient) {
    this.db = db;
    this.githubClient = githubClient ?? new GithubClient();
  }

  /**
   * 处理未决的发现链接 (Targeted Sync Only)
   */
  async processDiscoveredLeads(limit = 20): Promise<{ processed: number; newProfiles: number }> {
    const leads = await this.db
      .select({
        url: evidenceItems.url,
        personId: evidenceItems.personId
      })
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.evidenceType, "social"),
          eq(evidenceItems.title, "discovered_connection"),
          not(
            inArray(
              evidenceItems.url,
              this.db.select({ url: sourceProfiles.canonicalUrl }).from(sourceProfiles)
            )
          )
        )
      )
      .limit(limit);

    if (leads.length === 0) return { processed: 0, newProfiles: 0 };

    console.info(`[Discovery] Target-syncing ${leads.length} discovered leads...`);

    let newProfilesCount = 0;
    const batchSize = 3;
    
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const results: number[] = await Promise.all(batch.map(async (lead) => {
        if (!lead.url) return 0;
        try {
          if (lead.url.includes("github.com/")) {
            const handle = lead.url.split("github.com/")[1]?.split(/[/?#]/)[0];
            if (handle) {
              // FIX [P1]: Use direct profile sync helper instead of global runSync
              const result = await syncGithubProfile(this.githubClient, this.db, handle);
              return result.success ? 1 : 0;
            }
          }
        } catch (e) {
          console.error(`[Discovery] Target sync fail for ${lead.url}:`, (e as Error).message);
        }
        return 0;
      }));
      newProfilesCount += results.reduce((acc, val) => acc + val, 0);
    }

    return { processed: leads.length, newProfiles: newProfilesCount };
  }

  /**
   * 拓扑挖掘：GitHub Network (Targeted)
   */
  async mineGithubNetwork(
    handle: string,
    limit = 5
  ): Promise<{ attempted: number; newProfiles: number }> {
    try {
      console.info(`[Discovery] Target-mining network for: ${handle}`);
      const following = await this.githubClient.fetchFollowingByUsername(handle);
      const targets = (following || []).map(f => f.login).filter(Boolean).slice(0, limit);

      let attempted = 0;
      let syncedCount = 0;
      if (targets.length > 0) {
        // FIX [P1]: Loop through targets and sync each individually to avoid leakage
        for (const targetHandle of targets) {
          attempted += 1;
          const result = await syncGithubProfile(this.githubClient, this.db, targetHandle);
          if (result.success) syncedCount++;
        }
      }
      return { attempted, newProfiles: syncedCount };
    } catch (error) {
      console.error(`[Discovery] Network mining fail for ${handle}:`, error);
    }
    return { attempted: 0, newProfiles: 0 };
  }
}
