import { Person, EvidenceItem, SearchDocument } from "@seeku/db";
import { MultiDimensionProfile, ScoredCandidate, SearchConditions } from "./types.js";
import chalk from "chalk";
import boxen from "boxen";

interface ComparisonEntry {
  candidate: ScoredCandidate;
  profile: MultiDimensionProfile;
}

export class TerminalRenderer {
  renderProfile(
    candidate: Person,
    evidence: EvidenceItem[],
    profile: MultiDimensionProfile,
    matchReason?: string,
    extra?: {
      sources?: string[];
      bonjourUrl?: string;
      lastSyncedAt?: Date;
      latestEvidenceAt?: Date;
      document?: SearchDocument;
    }
  ): string {
    const { dimensions, overallScore, summary, highlights } = profile;

    const dims = [
      { label: "技术匹配", score: dimensions.techMatch, color: chalk.blue },
      { label: "项目深度", score: dimensions.projectDepth, color: chalk.cyan },
      { label: "学术影响", score: dimensions.academicImpact, color: chalk.magenta },
      { label: "职场稳健", score: dimensions.careerStability, color: chalk.yellow },
      { label: "社区声望", score: dimensions.communityReputation, color: chalk.green },
      { label: "地点匹配", score: dimensions.locationMatch, color: chalk.white }
    ];

    const renderedDims = dims
      .map((dimension) => {
        const barLength = Math.round(dimension.score / 5);
        const bar = dimension.color("█".repeat(barLength) + "░".repeat(20 - barLength));
        return `${dimension.label.padEnd(8)} ${bar} ${chalk.bold(`${dimension.score.toFixed(0)}%`)}`;
      })
      .join("\n");

    const header =
      chalk.bold.blueBright(candidate.primaryName) +
      " " +
      chalk.dim("|") +
      " " +
      chalk.italic(candidate.primaryHeadline || "No headline");
    const highlightSection = highlights.map((item) => chalk.green("  ✔ ") + item).join("\n");

    // Source info section
    const sourceBadge = extra?.sources && extra.sources.length > 0
      ? extra.sources.map((source) =>
          source === "Bonjour" ? chalk.bgCyan.black(" Bonjour ") :
          source === "GitHub" ? chalk.bgMagenta.white(" GitHub ") :
          chalk.dim(source)
        ).join(" ")
      : chalk.dim("来源未知");

    const bonjourLine = extra?.bonjourUrl
      ? chalk.cyan(`🔗 Bonjour: ${extra.bonjourUrl}`)
      : chalk.dim("无 Bonjour 链接");

    const lastSyncedLine = extra?.lastSyncedAt
      ? chalk.dim(`Last Synced: ${this.formatDate(extra.lastSyncedAt)}`)
      : chalk.dim("Last Synced: 未知");

    const latestEvidenceLine = extra?.latestEvidenceAt
      ? chalk.dim(`Latest Evidence: ${this.formatDate(extra.latestEvidenceAt)}`)
      : chalk.dim("Latest Evidence: 未知");

    // Evidence sources summary
    const evidenceSources = evidence.length > 0
      ? [...new Set(evidence.map((item) => item.source).filter(Boolean))]
          .map((source) => {
            if (source === "bonjour") return "Bonjour";
            if (source === "github") return "GitHub";
            return source;
          })
      : [];

    const evidenceSourcesLine = evidenceSources.length > 0
      ? chalk.dim(`Evidence Sources: ${evidenceSources.join(", ")}`)
      : chalk.dim("Evidence Sources: 无");

    const content = `
${header}

${chalk.bold("数据来源：")} ${sourceBadge}
${bonjourLine}
${lastSyncedLine} | ${latestEvidenceLine}
${evidenceSourcesLine}

${chalk.bold("为什么值得看：")} ${matchReason || "与本轮搜索条件高度相关"}

${chalk.bold("综合模型评分：")} ${this.getOverallColor(overallScore)(overallScore.toFixed(1))} / 100

${chalk.bold("六维能力画像：")}
${renderedDims}

${chalk.bold("深度评估分析：")}
${chalk.italic(summary || "No summary generated.")}

${chalk.bold("核心亮点：")}
${highlightSection}

${chalk.bold("最新相关证据：")}
${
  evidence.length > 0
    ? evidence
        .slice(0, 5)
        .map((item) => chalk.cyan("[Evidence] ") + chalk.dim(`[${item.evidenceType}] `) + (item.title || "无标题"))
        .join("\n")
    : chalk.dim("[无近期的相关证据或开源记录]")
}

${chalk.dim("下一步：back 返回 | o 打开 Bonjour | why 评分依据 | refine 收敛 | q 退出")}
    `;

    return boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "blue",
      title: "Seeku Candidate Workspace",
      titleAlignment: "center"
    });
  }

  renderWhyMatched(candidate: ScoredCandidate, profile: MultiDimensionProfile, conditions: SearchConditions): string {
    const bullets = [
      candidate.matchReason || "与当前条件整体相关度较高",
      `技术匹配 ${profile.dimensions.techMatch.toFixed(0)} / 100`,
      `项目深度 ${profile.dimensions.projectDepth.toFixed(0)} / 100`,
      `地点匹配 ${profile.dimensions.locationMatch.toFixed(0)} / 100`,
      conditions.experience ? `当前经验要求：${conditions.experience}` : "当前经验要求：未限制"
    ];

    return boxen(
      bullets.map((item) => `- ${item}`).join("\n"),
      {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "yellow",
        title: `${candidate.name} · 匹配依据`,
        titleAlignment: "center"
      }
    );
  }

  renderComparison(entries: ComparisonEntry[]): string {
    const content = entries
      .map((entry) => {
        const { candidate, profile } = entry;
        return [
          `${chalk.bold.blueBright(candidate.name)} ${chalk.dim("|")} ${candidate.headline || "No headline"}`,
          `综合分 ${chalk.green(candidate.matchScore.toFixed(1))} | 技术 ${profile.dimensions.techMatch.toFixed(0)} | 项目 ${profile.dimensions.projectDepth.toFixed(0)} | 地点 ${profile.dimensions.locationMatch.toFixed(0)}`,
          `为什么匹配：${candidate.matchReason || "与本轮条件相关"}`,
          `摘要：${profile.summary}`
        ].join("\n");
      })
      .join(`\n${chalk.dim("-".repeat(64))}\n`);

    return boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "green",
      title: "Seeku Candidate Compare",
      titleAlignment: "center"
    });
  }

  private getOverallColor(score: number) {
    if (score >= 85) return chalk.greenBright;
    if (score >= 70) return chalk.green;
    if (score >= 50) return chalk.yellow;
    return chalk.red;
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) {
      return "今天";
    }
    if (daysDiff === 1) {
      return "昨天";
    }
    if (daysDiff <= 7) {
      return `${daysDiff}天前`;
    }
    if (daysDiff <= 30) {
      return `${Math.floor(daysDiff / 7)}周前`;
    }
    if (daysDiff <= 365) {
      return `${Math.floor(daysDiff / 30)}个月前`;
    }
    return `${Math.floor(daysDiff / 365)}年前`;
  }
}
