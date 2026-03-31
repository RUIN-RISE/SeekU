import { Person, EvidenceItem, SearchDocument } from "@seeku/db";
import {
  ComparisonEntry,
  MatchStrength,
  MultiDimensionProfile,
  ScoredCandidate,
  SearchConditions
} from "./types.js";
import chalk from "chalk";
import boxen from "boxen";

export class TerminalRenderer {
  renderProfile(
    candidate: Person,
    evidence: EvidenceItem[],
    profile: MultiDimensionProfile,
    matchReason?: string,
      extra?: {
        queryReasons?: string[];
        matchStrength?: MatchStrength;
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
      chalk.italic(candidate.primaryHeadline || "暂无标题");
    const highlightSection = highlights.length > 0
      ? highlights.map((item) => chalk.green("  ✔ ") + item).join("\n")
      : chalk.dim("  暂无结构化亮点");
    const queryReasonLines = extra?.queryReasons && extra.queryReasons.length > 0
      ? extra.queryReasons.map((item) => `- ${item}`).join("\n")
      : chalk.dim("- 暂无更细的 query-aware 理由");

    // Source info section
    const sourceBadge = extra?.sources && extra.sources.length > 0
      ? extra.sources.map((source) =>
          source === "Bonjour" ? chalk.bgCyan.black(" Bonjour ") :
          source === "GitHub" ? chalk.bgMagenta.white(" GitHub ") :
          chalk.dim(source)
        ).join(" ")
      : chalk.dim("来源未知");

    const bonjourLine = extra?.bonjourUrl
      ? chalk.cyan(`🔗 Bonjour 链接：${extra.bonjourUrl}`)
      : chalk.dim("无 Bonjour 链接");

    const lastSyncedLine = extra?.lastSyncedAt
      ? chalk.dim(`资料刷新：${this.formatDate(extra.lastSyncedAt)}`)
      : chalk.dim("资料刷新：未知");

    const latestEvidenceLine = extra?.latestEvidenceAt
      ? chalk.dim(`最新证据：${this.formatDate(extra.latestEvidenceAt)}`)
      : chalk.dim("最新证据：未知");
    const matchStrengthLine = chalk.bold("匹配强度：") + " " + this.formatMatchStrengthBadge(extra?.matchStrength);

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
      ? chalk.dim(`证据来源：${evidenceSources.join(", ")}`)
      : chalk.dim("证据来源：无");

    const content = `
${header}

${chalk.bold("数据来源：")} ${sourceBadge}
${bonjourLine}
${lastSyncedLine} | ${latestEvidenceLine}
${evidenceSourcesLine}
${matchStrengthLine}

${chalk.bold("本次搜索为什么匹配：")} ${matchReason || "与本轮搜索条件高度相关"}
${queryReasonLines}

${chalk.bold("综合模型评分：")} ${this.getOverallColor(overallScore)(overallScore.toFixed(1))} / 100

${chalk.bold("六维能力画像：")}
${renderedDims}

${chalk.bold("通用画像总结：")}
${chalk.italic(summary || "暂未生成画像总结。")}

${chalk.bold("核心亮点：")}
${highlightSection}

${chalk.bold("最新相关证据：")}
${
  evidence.length > 0
    ? evidence
        .slice(0, 5)
        .map((item) => chalk.cyan("[证据] ") + chalk.dim(`[${item.evidenceType}] `) + (item.title || "无标题"))
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
      title: "Seeku 候选人工作台",
      titleAlignment: "center"
    });
  }

  renderWhyMatched(candidate: ScoredCandidate, profile: MultiDimensionProfile, conditions: SearchConditions): string {
    const bullets = [
      `当前查询：${this.formatConditionsSummary(conditions)}`,
      `匹配强度：${this.getMatchStrengthLabel(candidate.matchStrength)}`,
      `本次搜索命中：${candidate.matchReason || "与当前条件整体相关度较高"}`,
      ...(candidate.queryReasons && candidate.queryReasons.length > 0
        ? candidate.queryReasons.map((item) => `细项：${item}`)
        : ["细项：暂无更细的 query-aware 理由"]),
      `通用画像总结：${profile.summary || "暂未生成画像总结。"}`,
      `六维画像：技术 ${profile.dimensions.techMatch.toFixed(0)} | 项目 ${profile.dimensions.projectDepth.toFixed(0)} | 地点 ${profile.dimensions.locationMatch.toFixed(0)} | 稳健 ${profile.dimensions.careerStability.toFixed(0)}`
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

  renderComparison(entries: ComparisonEntry[], conditions?: SearchConditions): string {
    const recommended = [...entries].sort((left, right) => right.decisionScore - left.decisionScore)[0];
    const contextLine = conditions
      ? chalk.dim(`当前判断上下文：${this.formatConditionsSummary(conditions)}`)
      : chalk.dim("当前判断上下文：未提供");

    const content = entries
      .map((entry) => {
        const { candidate, profile, topEvidence } = entry;
        const titlePrefix = entry.shortlistIndex ? `#${entry.shortlistIndex} ` : "";
        const sourceBadge = this.formatSourceBadge(candidate.sources);
        const freshness = this.formatFreshness(candidate.latestEvidenceAt, candidate.lastSyncedAt);
        const bonjourLine = candidate.bonjourUrl
          ? chalk.cyan(`🔗 Bonjour 链接：${candidate.bonjourUrl}`)
          : chalk.dim("🔗 Bonjour 链接：无");
        const evidenceLines =
          topEvidence.length > 0
            ? topEvidence
                .map((item, index) => {
                  const freshnessLabel = item.freshnessLabel
                    ? chalk.dim(` · ${item.freshnessLabel}`)
                    : "";
                  return `  ${index + 1}. ${chalk.cyan(`[${item.sourceLabel}]`)} ${chalk.dim(`[${item.evidenceType}]`)} ${item.title}${freshnessLabel}`;
                })
                .join("\n")
            : chalk.dim("  暂无可展示的高价值证据");

        return [
          `${chalk.bold.blueBright(`${titlePrefix}${candidate.name}`)} ${chalk.dim("|")} ${candidate.headline || "暂无标题"}`,
          `${chalk.bold(entry.decisionTag)} · 综合分 ${chalk.green(candidate.matchScore.toFixed(1))} · ${sourceBadge} ${freshness}`,
          `六维判断：技术 ${profile.dimensions.techMatch.toFixed(0)} | 项目 ${profile.dimensions.projectDepth.toFixed(0)} | 地点 ${profile.dimensions.locationMatch.toFixed(0)} | 稳健 ${profile.dimensions.careerStability.toFixed(0)}`,
          `当前查询下为什么值得比较：${candidate.matchReason || "与本轮条件相关"}`,
          bonjourLine,
          `${chalk.bold("关键证据")}\n${evidenceLines}`,
          `${chalk.bold("建议")}：${entry.recommendation}`,
          `${chalk.bold("下一步")}：${entry.nextStep}`
        ].join("\n");
      })
      .join(`\n${chalk.dim("─".repeat(72))}\n`);

    const recommendationBlock = recommended
      ? [
          `${chalk.bold("推荐先看")}：${chalk.blueBright(recommended.candidate.name)}`,
          `${chalk.bold("理由")}：${recommended.recommendation}`,
          `${chalk.bold("建议动作")}：${recommended.nextStep}`
        ].join("\n")
      : `${chalk.bold("推荐先看")}：暂无`;

    return boxen([contextLine, "", content, "", recommendationBlock].join("\n"), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "green",
      title: "Seeku 决策对比视图",
      titleAlignment: "center"
    });
  }

  private getOverallColor(score: number) {
    if (score >= 85) return chalk.greenBright;
    if (score >= 70) return chalk.green;
    if (score >= 50) return chalk.yellow;
    return chalk.red;
  }

  private getMatchStrengthLabel(matchStrength?: MatchStrength) {
    if (matchStrength === "strong") {
      return "强匹配";
    }

    if (matchStrength === "medium") {
      return "中匹配";
    }

    return "弱匹配";
  }

  private formatMatchStrengthBadge(matchStrength?: MatchStrength) {
    if (matchStrength === "strong") {
      return chalk.bgGreen.black(" 强匹配 ");
    }

    if (matchStrength === "medium") {
      return chalk.bgYellow.black(" 中匹配 ");
    }

    return chalk.bgRed.white(" 弱匹配 ");
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

  private formatSourceBadge(sources: string[]): string {
    if (!sources || sources.length === 0 || sources[0] === "Unknown") {
      return chalk.dim("来源未知");
    }

    return sources
      .map((source) => {
        if (source === "Bonjour") {
          return chalk.bgCyan.black(" Bonjour ");
        }

        if (source === "GitHub") {
          return chalk.bgMagenta.white(" GitHub ");
        }

        return chalk.dim(source);
      })
      .join(" ");
  }

  private formatFreshness(latestEvidence?: Date, lastSynced?: Date): string {
    const referenceDate = latestEvidence || lastSynced;
    if (!referenceDate) {
      return chalk.dim("新鲜度未知");
    }

    const daysDiff = Math.floor((Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 7) {
      return chalk.greenBright(`新鲜 ${daysDiff}天`);
    }

    if (daysDiff <= 30) {
      return chalk.green(`${daysDiff}天前`);
    }

    if (daysDiff <= 90) {
      return chalk.yellow(`${daysDiff}天前`);
    }

    return chalk.dim(`${daysDiff}天前`);
  }

  private formatConditionsSummary(conditions: SearchConditions): string {
    const parts = [
      conditions.role ? `角色 ${conditions.role}` : "",
      conditions.skills.length > 0 ? `技能 ${conditions.skills.join("/")}` : "",
      conditions.locations.length > 0 ? `地点 ${conditions.locations.join("/")}` : "",
      conditions.experience ? `经验 ${conditions.experience}` : "",
      conditions.sourceBias ? `来源 ${conditions.sourceBias}` : "",
      conditions.mustHave.length > 0 ? `必须 ${conditions.mustHave.join("/")}` : "",
      conditions.niceToHave.length > 0 ? `优先 ${conditions.niceToHave.join("/")}` : "",
      conditions.exclude.length > 0 ? `排除 ${conditions.exclude.join("/")}` : "",
      conditions.preferFresh ? "最近活跃优先" : "",
      conditions.candidateAnchor?.name
        ? `参考 ${conditions.candidateAnchor.name}`
        : conditions.candidateAnchor?.shortlistIndex
          ? `参考 #${conditions.candidateAnchor.shortlistIndex}`
          : ""
    ].filter(Boolean);

    return parts.join(" | ") || "未设置明确条件";
  }
}
