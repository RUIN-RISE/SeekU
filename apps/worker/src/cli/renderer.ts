import { Person, EvidenceItem } from "@seeku/db";
import { MultiDimensionProfile } from "./types.js";
import chalk, { type Chalk } from "chalk";
import boxen from "boxen";

export class TerminalRenderer {
  renderProfile(candidate: Person, evidence: EvidenceItem[], profile: MultiDimensionProfile): string {
    const { dimensions, overallScore, summary, highlights } = profile;

    // Build dimensions table
    const dims = [
      { label: "🛠 技术匹配", score: dimensions.techMatch, color: chalk.blue },
      { label: "🚀 项目深度", score: dimensions.projectDepth, color: chalk.cyan },
      { label: "🎓 学术影响", score: dimensions.academicImpact, color: chalk.magenta },
      { label: "⏱ 职场稳健", score: dimensions.careerStability, color: chalk.yellow },
      { label: "👥 社区声望", score: dimensions.communityReputation, color: chalk.green },
      { label: "📍 地点匹配", score: dimensions.locationMatch, color: chalk.white }
    ];

    const renderedDims = dims.map(d => {
      const barLength = Math.round(d.score / 5);
      const bar = d.color("█".repeat(barLength) + "░".repeat(20 - barLength));
      return `${d.label.padEnd(10)} ${bar} ${chalk.bold(d.score.toFixed(0) + "%")}`;
    }).join("\n");

    const header = chalk.bold.blueBright(candidate.primaryName) + " " + chalk.dim("|") + " " + chalk.italic(candidate.primaryHeadline || "No headline");
    
    // Summary & Highlights
    const highlightSection = highlights.map(h => chalk.green("  ✔ ") + h).join("\n");
    
    const content = `
${header}

${chalk.bold("🏆 综合模型评分: ")} ${this.getOverallColor(overallScore)(overallScore.toFixed(1))} / 100

${chalk.bold("📊 六维能力画像:")}
${renderedDims}

${chalk.bold("📝 深度评估分析:")}
${chalk.italic(summary || "No summary generated.")}

${chalk.bold("💡 核心亮点:")}
${highlightSection}

${chalk.bold("📂 最新相关证据:")}
${evidence.slice(0, 3).map(e => chalk.dim(`- [${e.evidenceType}] `) + e.title).join("\n")}
    `;

    return boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "blue",
      title: "Seeku Talent Insight",
      titleAlignment: "center"
    });
  }

  private getOverallColor(score: number): any {
    if (score >= 85) return chalk.greenBright;
    if (score >= 70) return chalk.green;
    if (score >= 50) return chalk.yellow;
    return chalk.red;
  }
}
