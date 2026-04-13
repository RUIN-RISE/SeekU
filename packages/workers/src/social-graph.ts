import {
  and,
  createDatabaseConnection,
  desc,
  eq,
  gt,
  inArray,
  not,
  personIdentities,
  persons,
  sourceProfiles,
  type SeekuDatabase
} from "@seeku/db";
import { type LLMProvider } from "@seeku/llm";
import { EnrichmentHub } from "./enrichment/hub.js";

/**
 * MiningOptions - 社交图谱挖掘任务配置
 */
export interface MiningOptions {
  limit?: number;
  db?: SeekuDatabase;
  depth?: number;
  provider?: LLMProvider;
}

export interface MiningResult {
  linksProcessed: number;
  newProfilesCreated: number;
  discoveryPhase: { processed: number; newProfiles: number };
  networkPhase: { attempted: number; newProfiles: number };
  errors: Array<{ url: string; message: string }>;
}

/**
 * runSocialGraphWorker - 社交图谱递归挖掘工件 (Hardened 3.0)
 * 
 * 核心逻辑：
 * 1. 扫描由 EnrichmentHub 导出的 "discovered_connection" 线索。
 * 2. 挖掘高价值人才（Seeds）的 GitHub 社交网络。
 * 
 * 已修复: [P2] 操作配额硬核化。改以“处理量”为上限扣减基准，而非仅以“成功数”计。
 */
export async function runSocialGraphWorker(options: MiningOptions = {}): Promise<MiningResult> {
  const ownedConnection = options.db ? null : createDatabaseConnection();
  const db = options.db ?? ownedConnection!.db;
  const hub = new EnrichmentHub(db, options.provider);
  const workBudget = options.limit ?? 20;

  const result: MiningResult = {
    linksProcessed: 0,
    newProfilesCreated: 0,
    discoveryPhase: { processed: 0, newProfiles: 0 },
    networkPhase: { attempted: 0, newProfiles: 0 },
    errors: []
  };

  try {
    // --- 策略 A: 递归同步 (Discovery Leads) ---
    // 优先消耗预算处理现有线索
    const discoveryLeads = await hub.processDiscoveryLeads(workBudget);
    result.discoveryPhase = discoveryLeads;
    result.linksProcessed = discoveryLeads.processed;
    result.newProfilesCreated = discoveryLeads.newProfiles;

    // --- 策略 B: 拓扑挖掘 (GitHub Network Seeds) ---
    // 按剩余“工作量预算”而非“成功产出量”执行
    let remainingBudget = workBudget - result.linksProcessed;

    if (remainingBudget > 0) {
      const seeds = await db
        .select({
          id: persons.id,
          name: persons.primaryName
        })
        .from(persons)
        .where(gt(persons.confidenceScore, "0.5"))
        .orderBy(desc(persons.confidenceScore))
        .limit(Math.min(5, remainingBudget)); // 限制种子扫描范围

      for (const seed of seeds) {
        if (remainingBudget <= 0) break;

        const githubHandle = await db
          .select({ handle: sourceProfiles.sourceHandle })
          .from(sourceProfiles)
          .innerJoin(personIdentities, eq(sourceProfiles.id, personIdentities.sourceProfileId))
          .where(
            and(
              eq(personIdentities.personId, seed.id),
              eq(sourceProfiles.source, "github")
            )
          )
          .limit(1);

        const handle = githubHandle[0]?.handle;
        if (!handle) continue;

        // 预算按真实尝试次数扣减，避免失败/重复同步绕过上限。
        const perSeedLimit = Math.min(10, remainingBudget);
        const minedResult = await hub.mineGithubNetwork(handle, perSeedLimit);

        result.networkPhase.attempted += minedResult.attempted;
        result.networkPhase.newProfiles += minedResult.newProfiles;
        result.linksProcessed += minedResult.attempted;
        result.newProfilesCreated += minedResult.newProfiles;
        remainingBudget -= minedResult.attempted;
      }
    }

    return result;
  } finally {
    await ownedConnection?.close();
  }
}
