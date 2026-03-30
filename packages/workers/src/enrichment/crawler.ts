/**
 * SmartCrawler - 智能爬虫调度器 (Hardened)
 * 
 * DESIGN RATIONALE:
 * 本组件致力于解决高频反爬与内容提取率之间的平衡。
 * 已修复: Magic Numbers 提炼, 结构化日志导出。
 * 
 * @module Enrichment/Crawler
 */

export const CRAWLER_CONFIG = {
  FAST_TIMEOUT_MS: 10000,
  JINA_TIMEOUT_MS: 30000,
  MAX_CLEANED_LENGTH: 8000,
  MAX_JINA_LENGTH: 15000,
  BOT_SIGNALS: [403, 429, 999, 401] as number[]
} as const;

export interface CrawlResult {
  content: string;
  source: "fast" | "jina" | "failure";
  status: number;
}

export class SmartCrawler {
  private static readonly HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Cache-Control": "no-cache"
  };

  /**
   * 智能抓取主入口
   */
  static async crawl(url: string, jinaApiKey?: string): Promise<CrawlResult> {
    try {
      console.debug(`[SmartCrawler] Fast-fetching: ${url}`);
      const resp = await fetch(url, {
        headers: this.HEADERS,
        signal: AbortSignal.timeout(CRAWLER_CONFIG.FAST_TIMEOUT_MS)
      });

      if (CRAWLER_CONFIG.BOT_SIGNALS.includes(resp.status)) {
        console.info(`[SmartCrawler] Anti-bot (${resp.status}), switching to Jina: ${url}`);
        return await this.crawlWithJina(url, jinaApiKey);
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const text = await resp.text();
      return {
        content: this.cleanHtml(text),
        source: "fast",
        status: resp.status
      };
    } catch (error) {
      console.warn(`[SmartCrawler] Fast fetch failed, fallback: ${url} (Error: ${(error as Error).message})`);
      return await this.crawlWithJina(url, jinaApiKey);
    }
  }

  private static async crawlWithJina(url: string, apiKey?: string): Promise<CrawlResult> {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const headers: Record<string, string> = {
      "Accept": "text/event-stream",
      "X-With-Generated-Alt": "true"
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    try {
      const resp = await fetch(jinaUrl, {
        headers,
        signal: AbortSignal.timeout(CRAWLER_CONFIG.JINA_TIMEOUT_MS)
      });

      if (!resp.ok) {
        throw new Error(`Jina API Status ${resp.status}`);
      }

      const text = await resp.text();
      return {
        content: text.slice(0, CRAWLER_CONFIG.MAX_JINA_LENGTH),
        source: "jina",
        status: resp.status
      };
    } catch (error) {
      console.error(`[SmartCrawler] Jina fatal error: ${(error as Error).message}`);
      return { content: "", source: "failure", status: 500 };
    }
  }

  private static cleanHtml(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "") // Additional noise removal
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CRAWLER_CONFIG.MAX_CLEANED_LENGTH);
  }
}
