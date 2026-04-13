import {
  and,
  createDatabaseConnection,
  evidenceItems,
  inArray,
  not,
  sourceProfiles,
  sql,
  eq,
  type SeekuDatabase
} from "@seeku/db";
import { type LLMProvider } from "@seeku/llm";
import { EnrichmentHub } from "./enrichment/hub.js";

/**
 * EnrichmentOptions - 画像补全任务配置
 */
export interface EnrichmentOptions {
  limit?: number;
  personIds?: string[];
  db?: SeekuDatabase;
  provider?: LLMProvider;
}

export interface EnrichmentResult {
  profilesProcessed: number;
  profilesEnriched: number;
  errors: Array<{ url: string; message: string }>;
}

/**
 * runProfileEnrichmentWorker - 深度画像补全工件 (Hardened 2.0)
 * 
 * 核心逻辑：
 * 1. 扫描 evidence_items 中的外部 URL 证据。
 * 2. 已修复: [P2] Person Filter。正确处理 personIds 过滤逻辑，支持定向补全。
 */
export async function runProfileEnrichmentWorker(options: EnrichmentOptions = {}): Promise<EnrichmentResult> {
  const ownedConnection = options.db ? null : createDatabaseConnection();
  const db = options.db ?? ownedConnection!.db;
  const hub = new EnrichmentHub(db, options.provider);
  const limit = options.limit ?? 10;

  const result: EnrichmentResult = {
    profilesProcessed: 0,
    profilesEnriched: 0,
    errors: []
  };

  try {
    // 1. Identify enrichment targets (Focus on external links)
    const query = db
      .select({
        personId: evidenceItems.personId,
        url: evidenceItems.url
      })
      .from(evidenceItems);

    const conditions = [
      inArray(evidenceItems.evidenceType, ["social", "project"]),
      sql`${evidenceItems.url} IS NOT NULL`,
      sql`${evidenceItems.url} LIKE 'http%'`,
      sql`${evidenceItems.url} NOT LIKE '%github.com%'`,
      sql`${evidenceItems.url} NOT LIKE '%twitter.com%'`,
      sql`${evidenceItems.url} NOT LIKE '%jike.com%'`,
      sql`${evidenceItems.url} NOT LIKE '%xiaohongshu.com%'`,
      not(
        inArray(
          evidenceItems.url,
          db.select({ url: sourceProfiles.canonicalUrl }).from(sourceProfiles).where(eq(sourceProfiles.source, "web"))
        )
      )
    ];

    // FIX [P2]: Apply personIds filter if provided
    if (options.personIds && options.personIds.length > 0) {
      conditions.push(inArray(evidenceItems.personId, options.personIds));
    }

    const targets = await query.where(and(...conditions)).limit(limit);

    for (const target of targets) {
      if (!target.url) continue;
      result.profilesProcessed += 1;
      
      const enrichResult = await hub.enrichPerson(target.personId, target.url);
      
      if (enrichResult.success) {
        result.profilesEnriched += 1;
      } else {
        result.errors.push({ url: target.url, message: enrichResult.error ?? "Enrichment failed" });
      }
    }

    return result;
  } finally {
    await ownedConnection?.close();
  }
}
