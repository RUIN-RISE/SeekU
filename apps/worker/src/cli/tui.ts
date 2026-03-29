import enquirer from "enquirer";
const { Select } = enquirer as unknown as { Select: any };
import { ScoredCandidate } from "./types.js";
import chalk from "chalk";

export class TerminalUI {
  async selectCandidate(candidates: ScoredCandidate[]): Promise<ScoredCandidate | null> {
    if (candidates.length === 0) {
      console.log(chalk.yellow("No candidates found matching those criteria."));
      return null;
    }

    const choices = candidates.map((c, i) => ({
      name: c.personId,
      message: `${chalk.bold(`#${i + 1}`)} ${chalk.blueBright(c.name)} ${chalk.dim("·")} ${chalk.green(c.matchScore.toFixed(1) + "分")} ${chalk.gray("|")} ${chalk.italic(c.headline || "No headline")} ${chalk.dim("📍" + (c.location || "N/A"))}`,
    }));

    const prompt = new Select({
      name: "candidate",
      message: "Select a candidate to view high-dimensional profile (Enter to view, q to quit)",
      choices: [
        ...choices,
        { name: "quit", message: chalk.dim("--- 退出 ---") }
      ]
    });

    const result = await prompt.run();
    if (result === "quit") return null;
    
    return candidates.find(c => c.personId === result) || null;
  }

  displayInitialSearch(query: string) {
    console.log(`\n🚀 ${chalk.bold("Seeku 正在深度理解您的需求:")} "${chalk.cyan(query)}"`);
  }

  displayRefinedConditions(conditions: any) {
    console.log(`\n✅ ${chalk.bold("已锁定搜索条件:")}`);
    if (conditions.skills.length > 0) console.log(`   ${chalk.blue("🛠 核心技能:")} ${conditions.skills.join(", ")}`);
    if (conditions.locations.length > 0) console.log(`   ${chalk.green("📍 目标地点:")} ${conditions.locations.join(", ")}`);
    if (conditions.experience) console.log(`   ${chalk.yellow("⏱ 经验年限:")} ${conditions.experience}`);
    console.log(chalk.dim("------------------------------------------"));
  }
}
