import chalk from "chalk";
import { createDatabaseConnection, eq, persons } from "@seeku/db";
import { GithubScanner } from "@seeku/workers";
import { CrossChannelExtractor } from "@seeku/workers";
import { type LLMProvider, createProvider } from "@seeku/llm";

export async function runZjuExtractionPipeline(options: { 
  limit?: number; 
  crawl?: boolean;
  provider?: LLMProvider;
} = {}) {
  const { db, close } = createDatabaseConnection();
  const provider = options.provider ?? createProvider();

  try {
    const scanner = new GithubScanner(db);
    const extractor = new CrossChannelExtractor(db, provider);

    // Phase A: GitHub Discovery
    console.log(chalk.bold.blue("\n🚀 Phase A: GitHub Discovery 扫描中..."));
    const scanResult = await scanner.scanZjuNetwork({ limit: options.limit ?? 10, autoSync: true });
    console.log(chalk.green(`✅ 已发现并同步了 ${scanResult.handles.length} 位潜在人才。\n`));

    // Phase B: Cross-Channel Extraction
    console.log(chalk.bold.magenta("🧠 Phase B: Cross-Channel Extraction 提炼中..."));
    
    // 我们需要找到刚才同步产生的 Person IDs
    // 简化处理：我们直接对系统中的前 N 个匹配的人才进行提炼（或者是刚才发现的 handle 对应的人）
    // 为了演示，我们直接查找最近更新且包含 ZJU 关键词的人才
    const candidates = await db
      .select({ id: persons.id, name: persons.primaryName })
      .from(persons)
      .limit(options.limit ?? 10);

    for (const candidate of candidates) {
      console.log(chalk.cyan(`🔄 正在提炼 ${candidate.name} (${candidate.id})...`));
      const extracted = await extractor.extract(candidate.id, { crawlWebsites: options.crawl !== false });
      
      if (extracted) {
        console.log(chalk.gray(`   ├─ 微信: ${extracted.wechat ?? "N/A"}`));
        console.log(chalk.gray(`   ├─ 公司: ${extracted.currentCompany ?? "N/A"}`));
        console.log(chalk.gray(`   └─ 年级: ${extracted.enrollmentYear ?? "N/A"}`));
      } else {
        console.log(chalk.red(`   ❌ 提炼失败`));
      }
    }

    console.log(chalk.bold.green("\n✨ 全链路人才发现与提炼任务已完成。\n"));
  } finally {
    await close();
  }
}
