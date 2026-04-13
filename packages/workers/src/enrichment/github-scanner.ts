import { GithubClient } from "@seeku/adapters";
import { type SeekuDatabase } from "@seeku/db";
import { syncGithubProfile } from "../github-sync.js";

export interface GithubScanResult {
  handles: string[];
  totalMatchCount: number;
}

/**
 * GithubScanner - GitHub 人才主动发现引擎
 * 
 * 鉴于 GitHub Search API 的限制 (每页最多 100, 总量 1000):
 * 本 Scanner 实现了一套安全的分页抓取逻辑，并自动触发 Sync 流程。
 */
export class GithubScanner {
  private readonly client: GithubClient;
  private readonly db: SeekuDatabase;

  constructor(db: SeekuDatabase, client?: GithubClient) {
    this.db = db;
    this.client = client ?? new GithubClient();
  }

  /**
   * 扫描全站 ZJU 相关人才
   * 核心搜索词: "zhejiang university" OR "浙江大学" (in:bio,location,company)
   */
  async scanZjuNetwork(options: { 
    limit?: number; 
    perPage?: number;
    autoSync?: boolean;
    startPage?: number;
    pageLimit?: number;
    query?: string;
  } = {}): Promise<GithubScanResult> {
    const query = options.query ?? '"zhejiang university" OR "浙江大学" in:bio,location,company';
    const limit = options.limit ?? 100;
    const perPage = options.perPage ?? 30;
    const autoSync = options.autoSync ?? true;
    const startPage = Math.max(1, options.startPage ?? 1);
    const pageLimit = options.pageLimit && options.pageLimit > 0 ? options.pageLimit : undefined;

    console.info(
      `[GithubScanner] Starting sweep for ZJU talent (startPage=${startPage}, perPage=${perPage}, limit=${limit}${pageLimit ? `, pageLimit=${pageLimit}` : ""})...`
    );
    
    const uniqueHandles = new Set<string>();
    let page = startPage;
    let totalMatchCount = 0;
    let pagesFetched = 0;

    while (uniqueHandles.size < limit) {
      if (pageLimit !== undefined && pagesFetched >= pageLimit) {
        break;
      }

      try {
        const response = await this.client.searchUsers(query, { 
          page, 
          per_page: Math.min(perPage, limit - uniqueHandles.size) 
        });

        if (pagesFetched === 0) {
          totalMatchCount = response.total_count;
          console.info(`[GithubScanner] Total matches found: ${totalMatchCount}`);
        }

        if (response.items.length === 0) break;

        for (const user of response.items) {
          if (uniqueHandles.size < limit) {
            uniqueHandles.add(user.login);
          }
        }

        pagesFetched += 1;

        // GitHub API Limit: Search results are capped at 1000 items
        if (page * perPage >= 1000) {
          console.warn("[GithubScanner] Reached GitHub 1,000 result limit.");
          break;
        }

        page++;
      } catch (error) {
        console.error(`[GithubScanner] Error during scan at page ${page}:`, error);
        break;
      }
    }

    const handles = Array.from(uniqueHandles);
    
    if (autoSync && handles.length > 0) {
      console.info(`[GithubScanner] Auto-syncing ${handles.length} discovered handles...`);
      for (const handle of handles) {
        try {
          await syncGithubProfile(this.client, this.db, handle);
        } catch (e) {
          console.error(`[GithubScanner] Failed to sync ${handle}:`, e);
        }
      }
    }

    return {
      handles,
      totalMatchCount
    };
  }
}
