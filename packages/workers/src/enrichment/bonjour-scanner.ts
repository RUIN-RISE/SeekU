import { BonjourClient, type BonjourCommunityPost } from "@seeku/adapters";
import type { SeekuDatabase } from "@seeku/db";

export interface BonjourScannerConfig {
  client?: BonjourClient;
  db?: SeekuDatabase;
  batchSize?: number;
}

export interface BonjourScanResult {
  handles: string[];
  totalPostsChecked: number;
  matchCount: number;
}

/**
 * BonjourScanner - 定向人才采集引擎
 * 
 * 鉴于 Bonjour 全站搜索接口的权限限制，本 Scanner 采用策略性遍历：
 * 遍历所有公开分类（Categories）并抓取最新的社区动态，
 * 实时过滤包含特定关键词（如“浙大”）的人才资源。
 */
export class BonjourScanner {
  private readonly client: BonjourClient;
  private readonly batchSize: number;

  constructor(config: BonjourScannerConfig = {}) {
    this.client = config.client ?? new BonjourClient();
    this.batchSize = config.batchSize ?? 20;
  }

  /**
   * 按关键词扫描全平台
   */
  async scanByKeywords(
    keywords: string[],
    options: { limitPerCategory?: number; maxDepth?: number } = {}
  ): Promise<BonjourScanResult> {
    const categories = await this.client.fetchCategories();
    const uniqueHandles = new Set<string>();
    let totalPostsChecked = 0;
    let matchCount = 0;

    const queryRegex = new RegExp(keywords.join("|"), "i");
    const limit = options.limitPerCategory ?? 100;
    const maxDepth = options.maxDepth ?? 5; // 默认扫描前 5 页

    console.info(`[BonjourScanner] Starting scan for keywords: ${keywords.join(", ")}`);
    console.info(`[BonjourScanner] Total categories to scan: ${categories.length}`);

    for (const category of categories) {
      console.info(`[BonjourScanner] Scanning category: ${category.title} (${category.key})`);
      
      let skip = 0;
      let categoryMatches = 0;

      for (let depth = 0; depth < maxDepth; depth++) {
        try {
          const posts = await this.client.fetchCommunityPostsByCategory(
            category.key,
            this.batchSize,
            skip
          );

          if (posts.length === 0) break;

          totalPostsChecked += posts.length;

          for (const post of posts) {
            const matches = this.extractMatchingHandles(post, queryRegex);
            for (const handle of matches) {
              if (!uniqueHandles.has(handle)) {
                uniqueHandles.add(handle);
                matchCount++;
                categoryMatches++;
              }
            }
          }

          if (posts.length < this.batchSize) break;
          skip += this.batchSize;
          
          if (skip >= limit) break;
        } catch (error) {
          console.error(`[BonjourScanner] Error scanning ${category.key} at skip ${skip}:`, error);
          break;
        }
      }
      
      if (categoryMatches > 0) {
        console.info(`[BonjourScanner] Found ${categoryMatches} new leads in ${category.key}`);
      }
    }

    return {
      handles: Array.from(uniqueHandles),
      totalPostsChecked,
      matchCount
    };
  }

  /**
   * 从帖子中提取匹配关键词的 handle
   */
  private extractMatchingHandles(post: BonjourCommunityPost, regex: RegExp): string[] {
    const matches: string[] = [];
    const profiles = post.profile_link ?? [];

    for (const ref of profiles) {
      if (!ref.profile_link) continue;

      const searchableText = [
        ref.name || "",
        ref.description || "",
        post.content || ""
      ].join(" ");

      if (regex.test(searchableText)) {
        matches.push(ref.profile_link);
      }
    }

    return matches;
  }
}
