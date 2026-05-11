import chalk from "chalk";
import { createDatabaseConnection } from "@seeku/db";
import { runCoverageReport, type CoverageReport } from "@seeku/search";

export interface CoverageOptions {
  json?: boolean;
}

export async function runCoverageCli(options: CoverageOptions = {}) {
  const { db, close } = createDatabaseConnection();

  try {
    const report = await runCoverageReport(db);

    if (options.json) {
      return report;
    }

    console.log(chalk.bold.blue("\n📊 Seeku 搜索覆盖率报告\n"));

    console.log(`${chalk.bold("人才库规模:")}`);
    console.log(`  - 总候选人数: ${chalk.cyan(report.totalPersons)}`);
    console.log(`  - ${chalk.green("Active")} 候选人: ${chalk.cyan(report.activePersons)}\n`);

    console.log(`${chalk.bold("搜索引擎状态 (基于 Active 候选人):")}`);
    console.log(`  - 已建立索引: ${renderStat(report.indexedPersons, report.activePersons, report.coveragePercentage.indexed)}`);
    console.log(`  - 已完成向量: ${renderStat(report.embeddedPersons, report.activePersons, report.coveragePercentage.embedded)}`);
    console.log(`  - 可用新鲜向量: ${renderStat(report.freshEmbeddedPersons, report.activePersons, report.coveragePercentage.freshEmbedded)}`);
    if (report.staleEmbeddedPersons > 0) {
      console.log(`  - ${chalk.yellow("过期向量")}: ${chalk.yellow(report.staleEmbeddedPersons)} (search_documents 已更新，需要重新生成 embedding)`);
    }
    console.log("");

    const fq = report.facetQuality;
    console.log(`${chalk.bold("索引质量 (基于已索引文档):")}`);
    console.log(`  - 有 Role 标签: ${renderFacetStat(fq.withRole, report.indexedPersons, fq.withRolePct)}`);
    console.log(`  - 有 Tag 标签:  ${renderFacetStat(fq.withTags, report.indexedPersons, fq.withTagsPct)}`);
    console.log(`  - 有地点信息:   ${renderFacetStat(fq.withLocation, report.indexedPersons, fq.withLocationPct)}\n`);

    console.log(`${chalk.bold("数据源覆盖情况:")}`);
    console.log(`  - Bonjour 涵盖: ${chalk.cyan(report.bonjourCoveredPersons)}`);
    console.log(`  - GitHub 涵盖: ${chalk.cyan(report.githubCoveredPersons)}`);
    console.log(`  - ${chalk.magenta("多源聚合")} (B+G): ${renderStat(report.multiSourcePersons, report.activePersons, report.coveragePercentage.multiSource)}\n`);

    const needsReindex = report.coveragePercentage.indexed < 100;
    const needsFacetRefresh = fq.withRolePct < 50 || fq.withTagsPct < 50;
    const needsReembed =
      report.coveragePercentage.embedded < report.coveragePercentage.indexed ||
      report.staleEmbeddedPersons > 0;

    if (needsReindex || needsFacetRefresh || needsReembed) {
      console.log(chalk.yellow("💡 建议操作:"));
      if (needsReindex) {
        console.log(chalk.yellow(`   - ${report.activePersons - report.indexedPersons} 人尚未索引 → rebuild-search`));
      }
      if (needsFacetRefresh) {
        console.log(chalk.yellow(`   - Role/Tag 覆盖率低 → rebuild-search (会用最新提取逻辑重建)`));
      }
      if (needsReembed) {
        console.log(chalk.yellow(`   - 向量缺失或过期 → search-embeddings --force`));
      }
      console.log("");
    } else {
      console.log(chalk.green("✨ 恭喜: 所有 active 人才已完成索引覆盖，facet 质量良好。\n"));
    }
  } finally {
    await close();
  }
}

function renderStat(count: number, total: number, percentage: number): string {
  const color = percentage >= 95 ? chalk.green : percentage >= 80 ? chalk.yellow : chalk.red;
  return `${chalk.cyan(count)} / ${total} (${color(percentage + "%")})`;
}

function renderFacetStat(count: number, total: number, percentage: number): string {
  const color = percentage >= 70 ? chalk.green : percentage >= 40 ? chalk.yellow : chalk.red;
  return `${chalk.cyan(count)} / ${total} (${color(percentage + "%")})`;
}
