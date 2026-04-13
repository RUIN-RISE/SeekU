import { createHash } from "node:crypto";
import {
  createPersonIdentity,
  evidenceItems,
  sourceProfiles,
  upsertSourceProfile,
  type SeekuDatabase
} from "@seeku/db";
import { type LLMProvider, SiliconFlowProvider } from "@seeku/llm";
import { GithubClient } from "@seeku/adapters";
import type { NormalizedProfile } from "@seeku/shared";

import { SmartCrawler } from "./crawler.js";
import { ProfileSummarizer } from "./summarizer.js";
import { SocialDiscoveryService } from "./discovery.js";

/**
 * EnrichmentHub - Seeku 深度挖掘核心中枢 (Hardened 2.0)
 * 
 * DESIGN RATIONALE:
 * 本组件经过工业级加固 2.0。
 * 已修复: [P0] 身份碰撞问题。使用 URL 全路径哈希作为 handle，确保平台型站点（如 LinkedIn）的多用户共存。
 * 
 * @module Enrichment/Hub
 */

export class EnrichmentHub {
  private db: SeekuDatabase;
  private crawler: typeof SmartCrawler;
  private summarizer: ProfileSummarizer;
  private discovery: SocialDiscoveryService;

  constructor(db: SeekuDatabase, provider?: LLMProvider) {
    this.db = db;
    this.crawler = SmartCrawler;
    this.summarizer = new ProfileSummarizer(provider);
    this.discovery = new SocialDiscoveryService(db);
  }

  /**
   * 深度补全候选人画像并挖掘其人脉 (Security & Identity Hardened)
   */
  async enrichPerson(personId: string, url: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.info(`[EnrichmentHub] Starting Enrichment for ${personId} (URL: ${url})`);
      
      // 1. URL 解析与 Handle 生成 (FIX P0: Identity Isolation)
      let sourceHandle: string;
      try {
        const parsedUrl = new URL(url);
        const host = parsedUrl.hostname;
        // 对于平台型站点（同域名多用户），使用路径哈希以区分身份
        const pathPart = parsedUrl.pathname.replace(/\/$/, "");
        if (pathPart && pathPart !== "/") {
          const pathHash = createHash("md5").update(pathPart).digest("hex").slice(0, 8);
          sourceHandle = `${host}:${pathHash}`;
        } else {
          sourceHandle = host;
        }
      } catch (e) {
        console.error(`[EnrichmentHub] Invalid URL: ${url}`);
        return { success: false, error: "Invalid URL format" };
      }

      // 2. 抓取 (带有反爬回退)
      const crawlResult = await this.crawler.crawl(url, process.env.JINA_API_KEY);
      if (crawlResult.source === "failure") {
        throw new Error(`Crawl failed with status ${crawlResult.status}`);
      }

      // 3. AI 提炼 (带有人脉发现指令与运行时验证)
      const summary = await this.summarizer.summarize(crawlResult.content);

      // 4. 构建 Normalized Profile
      const profileHash = createHash("sha256").update(url + JSON.stringify(summary)).digest("hex");

      const normalized: NormalizedProfile = {
        source: "web",
        sourceHandle,
        sourceProfileId: url, // 使用完整 URL 作为 Profile ID 也是一种保障
        canonicalUrl: url,
        displayName: summary.displayName ?? sourceHandle,
        headline: summary.headline ?? "",
        bio: summary.bio ?? "",
        locationText: "",
        avatarUrl: "",
        aliases: [{ type: "person_id", value: personId, confidence: 1.0 }],
        rawMetadata: { crawledAt: new Date().toISOString(), url, source: crawlResult.source }
      };

      // 5. 画像入库
      const profile = await upsertSourceProfile(this.db, {
        profile: normalized,
        rawPayload: { summary, crawlSource: crawlResult.source },
        profileHash
      });

      await createPersonIdentity(this.db, {
        personId,
        sourceProfileId: profile.id,
        matchScore: 1.0,
        matchReason: [{ signal: "manual-link-from-evidence", confidence: 1.0 }],
        isPrimary: false
      });

      // 6. 社交连接导出
      if (summary.connectedPeople && summary.connectedPeople.length > 0) {
        const foundConnections = summary.connectedPeople.filter((c: any) => c.url);
        for (const conn of foundConnections) {
          const connHash = createHash("sha256").update(conn.url).digest("hex");
          const insertResult = await this.db.insert(evidenceItems).values({
            personId,
            sourceProfileId: profile.id,
            source: "web",
            evidenceType: "social",
            title: "discovered_connection",
            url: conn.url,
            description: `Mentioned: ${conn.name} (${conn.relationship})`,
            metadata: { discoveredName: conn.name, relationship: conn.relationship },
            evidenceHash: connHash
          }).onConflictDoNothing().returning();

          if (insertResult.length === 0) {
            console.debug(`[EnrichmentHub] Social lead skipped (Dupe): ${conn.url}`);
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error(`[EnrichmentHub] Fatal Enrichment Error: ${(error as Error).message}`);
      return { success: false, error: (error as Error).message };
    }
  }

  async mineGithubNetwork(
    handle: string,
    limit = 5
  ): Promise<{ attempted: number; newProfiles: number }> {
    return this.discovery.mineGithubNetwork(handle, limit);
  }

  async processDiscoveryLeads(limit = 20): Promise<{ processed: number; newProfiles: number }> {
    return this.discovery.processDiscoveredLeads(limit);
  }
}
