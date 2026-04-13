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
    console.log(`  - 已完成向量: ${renderStat(report.embeddedPersons, report.activePersons, report.coveragePercentage.embedded)}\n`);
    
    console.log(`${chalk.bold("数据源覆盖情况:")}`);
    console.log(`  - Bonjour 涵盖: ${chalk.cyan(report.bonjourCoveredPersons)}`);
    console.log(`  - GitHub 涵盖: ${chalk.cyan(report.githubCoveredPersons)}`);
    console.log(`  - ${chalk.magenta("多源聚合")} (B+G): ${renderStat(report.multiSourcePersons, report.activePersons, report.coveragePercentage.multiSource)}\n`);

    if (report.coveragePercentage.indexed < 100) {
      console.log(chalk.yellow(`💡 提示: 还有 ${report.activePersons - report.indexedPersons} 个人才尚未索引，请执行 rebuild-search 修复。\n`));
    } else {
      console.log(chalk.green("✨ 恭喜: 所有 active 人才已完成索引覆盖。\n"));
    }
  } finally {
    await close();
  }
}

function renderStat(count: number, total: number, percentage: number): string {
  const color = percentage >= 95 ? chalk.green : percentage >= 80 ? chalk.yellow : chalk.red;
  return `${chalk.cyan(count)} / ${total} (${color(percentage + "%")})`;
}
