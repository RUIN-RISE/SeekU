import { Person, EvidenceItem, SearchDocument } from "@seeku/db";
import {
  CandidatePrimaryLink,
  ComparisonEntry,
  ComparisonResult,
  ConditionAuditItem,
  MatchStrength,
  MultiDimensionProfile,
  ScoredCandidate,
  SearchConditions
} from "./types.js";
import chalk from "chalk";
import boxen from "boxen";
import { formatPercentScore } from "./score-format.js";

type CompareOutcomeLabel = "明确推荐" | "条件式推荐" | "暂不推荐";
type CompareConfidenceLabel = "高信心" | "中信心" | "低信心";

interface ComparisonEntryPresentation {
  goalFit: string;
  evidenceStrength: string;
  technicalRelevance: string;
  sourceQualityRecency: string;
  uncertainty: string;
}

interface ComparisonDecisionPresentation {
  outcome: CompareOutcomeLabel;
  confidence: CompareConfidenceLabel;
  recommendedEntry?: ComparisonEntry;
  summary: string;
  nonSelectionReasons: string[];
  largestUncertainty: string;
  nextStep: string;
}

export class TerminalRenderer {
  renderProfile(
    candidate: Person,
    evidence: EvidenceItem[],
    profile: MultiDimensionProfile,
    matchReason?: string,
      extra?: {
        conditionAudit?: ConditionAuditItem[];
        queryReasons?: string[];
        matchStrength?: MatchStrength;
        recoveryMode?: "low-confidence";
        recoverySummary?: string;
        sources?: string[];
        bonjourUrl?: string;
        primaryLinks?: CandidatePrimaryLink[];
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

    const primaryLinksSection = this.renderPrimaryLinks(extra?.primaryLinks, extra?.bonjourUrl);

    const lastSyncedLine = extra?.lastSyncedAt
      ? chalk.dim(`资料刷新：${this.formatDate(extra.lastSyncedAt)}`)
      : chalk.dim("资料刷新：未知");

    const latestEvidenceLine = extra?.latestEvidenceAt
      ? chalk.dim(`最新证据：${this.formatDate(extra.latestEvidenceAt)}`)
      : chalk.dim("最新证据：未知");
    const matchStrengthLine = chalk.bold("匹配强度：") + " " + this.formatMatchStrengthBadge(extra?.matchStrength);
    const matchStrengthWarning = extra?.matchStrength === "weak"
      ? chalk.yellow("当前结果提示：没有找到强匹配，这位候选人仅弱相关。")
      : undefined;
    const recoveryWarning = extra?.recoveryMode === "low-confidence"
      ? chalk.yellow(`当前处于低置信 shortlist：${extra.recoverySummary || "这些人可以先看，但我还不能直接推荐。"} `)
      : undefined;
    const conditionAuditSection = this.renderConditionAudit(extra?.conditionAudit);

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
${chalk.bold("主链接：")}
${primaryLinksSection}
${lastSyncedLine} | ${latestEvidenceLine}
${evidenceSourcesLine}
${matchStrengthLine}
${recoveryWarning || ""}
${matchStrengthWarning || ""}

${chalk.bold("本次搜索为什么匹配：")} ${matchReason || "与本轮搜索条件高度相关"}
${queryReasonLines}

${chalk.bold("条件审计：")}
${conditionAuditSection}

${chalk.bold("综合模型评分：")} ${this.getOverallColor(overallScore)(overallScore.toFixed(1))} / 100

${chalk.bold("六维能力画像：")}
${renderedDims}

${chalk.bold("通用画像总结：")}
${chalk.italic(summary || "暂未生成画像总结。")}

${chalk.bold("核心亮点：")}
${highlightSection}

${chalk.bold("最新相关证据：")}
${this.renderEvidenceCards(evidence, extra?.queryReasons)}

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

  renderWhyMatched(
    candidate: ScoredCandidate,
    profile: MultiDimensionProfile,
    conditions: SearchConditions,
    options?: {
      recoveryMode?: "low-confidence";
      recoverySummary?: string;
    }
  ): string {
    const bullets = [
      `当前查询：${this.formatConditionsSummary(conditions)}`,
      ...(options?.recoveryMode === "low-confidence"
        ? [`当前处于低置信 shortlist：${options.recoverySummary || "这些人可以先看，但我还不能直接推荐。"}`]
        : []),
      `匹配强度：${this.getMatchStrengthLabel(candidate.matchStrength)}`,
      ...(candidate.matchStrength === "weak" ? ["当前结果提示：没有找到强匹配，这位候选人仅弱相关。"] : []),
      `本次搜索命中：${candidate.matchReason || "与当前条件整体相关度较高"}`,
      ...(candidate.queryReasons && candidate.queryReasons.length > 0
        ? candidate.queryReasons.map((item) => `细项：${item}`)
        : ["细项：暂无更细的 query-aware 理由"]),
      `条件审计：${this.renderConditionAuditSummary(candidate.conditionAudit)}`,
      ...this.renderConditionAuditLines(candidate.conditionAudit),
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

  renderComparison(
    comparison: ComparisonEntry[] | ComparisonResult,
    conditions?: SearchConditions
  ): string {
    const comparisonResult = Array.isArray(comparison) ? undefined : comparison;
    const entries = Array.isArray(comparison) ? comparison : comparison.entries;
    const rankedEntries = [...entries].sort(
      (left, right) => right.decisionScore - left.decisionScore
    );
    const presentation = this.buildComparisonDecisionPresentation(
      rankedEntries,
      conditions,
      comparisonResult
    );
    const contextLine = conditions
      ? chalk.dim(`当前判断环境：${this.formatConditionsSummary(conditions)}`)
      : chalk.dim("当前判断环境：未提供");

    const decisionSummary = this.renderComparisonDecisionSummary(presentation);
    const content = rankedEntries
      .map((entry) => {
        const { candidate, profile, topEvidence } = entry;
        const structuredView = this.buildComparisonEntryPresentation(entry, conditions);
        const titlePrefix = entry.shortlistIndex ? `#${entry.shortlistIndex} ` : "";
        const sourceBadge = this.formatSourceBadge(candidate.sources);
        const freshness = this.formatFreshness(candidate.latestEvidenceAt, candidate.lastSyncedAt);
        const bonjourLine = candidate.bonjourUrl
          ? chalk.cyan(`  🔗 Bonjour：${candidate.bonjourUrl}`)
          : chalk.dim("  🔗 Bonjour：无");

        const evidenceLines =
          topEvidence.length > 0
            ? topEvidence
                .map((item: ComparisonEntry["topEvidence"][number], index: number) => {
                  const freshnessLabel = item.freshnessLabel
                    ? chalk.dim(` · ${item.freshnessLabel}`)
                    : "";
                  const icon = item.sourceLabel === "GitHub" ? "" : "";
                  return `  ${chalk.dim(`[${index + 1}]`)} ${chalk.cyan(icon)} ${chalk.dim(`[${item.evidenceType}]`)} ${item.title}${freshnessLabel}`;
                })
                .join("\n")
            : chalk.dim("  暂无可展示的高价值证据");

        const radarLine = [
          `技术 ${this.getScoreColor(profile.dimensions.techMatch)(profile.dimensions.techMatch.toFixed(0))}%`,
          `项目 ${this.getScoreColor(profile.dimensions.projectDepth)(profile.dimensions.projectDepth.toFixed(0))}%`,
          `地点 ${this.getScoreColor(profile.dimensions.locationMatch)(profile.dimensions.locationMatch.toFixed(0))}%`,
          `稳健 ${this.getScoreColor(profile.dimensions.careerStability)(profile.dimensions.careerStability.toFixed(0))}%`
        ].join(chalk.dim(" | "));

        const decisionTagStyled = entry.decisionTag === "优先深看"
          ? chalk.bgGreen.black(` ${entry.decisionTag} `)
          : entry.decisionTag === "继续比较"
            ? chalk.bgYellow.black(` ${entry.decisionTag} `)
            : chalk.bgWhite.black(` ${entry.decisionTag} `);

        return [
          `${chalk.bold.blueBright(`${titlePrefix}${candidate.name}`)} ${chalk.dim("|")} ${candidate.headline || "暂无标题"}`,
          `${decisionTagStyled} ${chalk.dim("·")} 综合匹配度 ${chalk.green(formatPercentScore(candidate.matchScore))} ${chalk.dim("·")} ${sourceBadge} ${freshness}`,
          `${chalk.bold("结构化判断")}：`,
          `  目标贴合：${structuredView.goalFit}`,
          `  证据强度：${structuredView.evidenceStrength}`,
          `  技术相关性：${structuredView.technicalRelevance}`,
          `  来源/时效：${structuredView.sourceQualityRecency}`,
          `  关键不确定性：${structuredView.uncertainty}`,
          `${chalk.bold("能力概览")}：${radarLine}`,
          `${chalk.bold("本次命中")}：${candidate.matchReason || "与本轮条件相关"}`,
          bonjourLine,
          `${chalk.bold("核心证据")}\n${evidenceLines}`,
          `${chalk.bold("AI 建议")}：${chalk.italic(entry.whySelected)}`,
          `${chalk.bold("建议动作")}：${chalk.dim(entry.nextStep)}`
        ].join("\n");
      })
      .join(`\n${chalk.dim("─".repeat(72))}\n`);

    return boxen([contextLine, "", decisionSummary, "", content].join("\n"), {
      padding: 1,
      margin: 1,
      borderStyle: "double",
      borderColor: "cyan",
      title: "Seeku 决策对比工作台 (Decision View)",
      titleAlignment: "center"
    });
  }

  private getOverallColor(score: number) {
    if (score >= 85) return chalk.greenBright;
    if (score >= 70) return chalk.green;
    if (score >= 50) return chalk.yellow;
    return chalk.red;
  }

  private getScoreColor(score: number) {
    if (score >= 80) return chalk.green;
    if (score >= 60) return chalk.yellow;
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

  private renderPrimaryLinks(primaryLinks?: CandidatePrimaryLink[], bonjourUrl?: string) {
    const links = primaryLinks && primaryLinks.length > 0
      ? primaryLinks
      : bonjourUrl
        ? [{ type: "bonjour", label: "Bonjour", url: bonjourUrl }]
        : [];

    if (links.length === 0) {
      return chalk.dim("  暂无可打开的主链接");
    }

    return links
      .map((link) => chalk.cyan(`  🔗 ${link.label}：${link.url}`))
      .join("\n");
  }

  private renderEvidenceCards(evidence: EvidenceItem[], queryReasons?: string[]) {
    if (evidence.length === 0) {
      return chalk.dim("[无近期的相关证据或开源记录]");
    }

    return evidence
      .slice(0, 5)
      .map((item, index) => {
        const timeLabel = item.occurredAt ? this.formatDate(item.occurredAt) : "未知";
        const urlLabel = item.url?.trim() || "无";
        const title = item.title?.trim() || item.description?.trim() || "无标题";

        return [
          chalk.cyan(`  [证据 ${index + 1}]`),
          `  来源：${this.formatEvidenceSource(item.source)} · ${item.evidenceType}`,
          `  标题：${title}`,
          `  时间：${timeLabel}`,
          `  URL：${urlLabel}`,
          `  为什么相关：${this.describeEvidenceRelevance(item, queryReasons)}`
        ].join("\n");
      })
      .join(`\n${chalk.dim("  " + "─".repeat(48))}\n`);
  }

  private formatEvidenceSource(source?: string) {
    if (source === "bonjour") {
      return "Bonjour";
    }

    if (source === "github") {
      return "GitHub";
    }

    if (source === "web") {
      return "Web";
    }

    return source || "未知";
  }

  private describeEvidenceRelevance(item: EvidenceItem, queryReasons?: string[]) {
    const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();

    for (const reason of queryReasons || []) {
      if (reason.startsWith("技术命中：")) {
        const matched = this.extractReasonTerms(reason).filter((term) => text.includes(term.toLowerCase()));
        if (matched.length > 0) {
          return `提到技术 ${matched.join(" / ")}`;
        }
      }

      if (reason.startsWith("必须项满足：")) {
        const matched = this.extractReasonTerms(reason).filter((term) => text.includes(term.toLowerCase()));
        if (matched.length > 0) {
          return `覆盖必须项 ${matched.join(" / ")}`;
        }
      }

      if (reason.startsWith("角色贴合：")) {
        const matched = this.extractReasonTerms(reason).find((term) => text.includes(term.toLowerCase()));
        if (matched) {
          return `体现角色 ${matched}`;
        }
      }

      if (reason.startsWith("地点命中：")) {
        const matched = this.extractReasonTerms(reason).find((term) => text.includes(term.toLowerCase()));
        if (matched) {
          return `提到地点 ${matched}`;
        }
      }
    }

    if (item.evidenceType === "repository") {
      return item.source === "github" ? "提供了可验证的 GitHub 作品" : "提供了可验证的仓库证据";
    }

    if (item.evidenceType === "project") {
      return "展示了与本次搜索相关的项目经历";
    }

    if (item.evidenceType === "experience" || item.evidenceType === "job_signal") {
      return "补充了经历和职场信号";
    }

    if (item.evidenceType === "profile_field") {
      return "补充了结构化资料字段";
    }

    return "补充了公开可见的相关线索";
  }

  private extractReasonTerms(reason: string) {
    const [, rawValue = ""] = reason.split("：", 2);
    return rawValue
      .split("/")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private renderConditionAudit(conditionAudit?: ConditionAuditItem[]) {
    if (!conditionAudit || conditionAudit.length === 0) {
      return chalk.dim("  暂无可审计的查询条件");
    }

    return conditionAudit
      .map((item) => {
        if (item.status === "met") {
          return chalk.green(`  ✓ 已满足`) + ` ${item.label} · ${item.detail}`;
        }

        if (item.status === "unmet") {
          return chalk.red(`  ✗ 未满足`) + ` ${item.label} · ${item.detail}`;
        }

        return chalk.yellow(`  ? 暂无证据`) + ` ${item.label} · ${item.detail}`;
      })
      .join("\n");
  }

  private renderConditionAuditSummary(conditionAudit?: ConditionAuditItem[]) {
    if (!conditionAudit || conditionAudit.length === 0) {
      return "暂无可审计的查询条件";
    }

    const counts = conditionAudit.reduce(
      (summary, item) => {
        summary[item.status] += 1;
        return summary;
      },
      { met: 0, unmet: 0, unknown: 0 }
    );

    return `已满足 ${counts.met} · 未满足 ${counts.unmet} · 暂无证据 ${counts.unknown}`;
  }

  private renderConditionAuditLines(conditionAudit?: ConditionAuditItem[]) {
    if (!conditionAudit || conditionAudit.length === 0) {
      return [];
    }

    return conditionAudit.map((item) => `${item.label}：${item.detail}（${this.getConditionAuditLabel(item.status)}）`);
  }

  private getConditionAuditLabel(status: ConditionAuditItem["status"]) {
    if (status === "met") {
      return "已满足";
    }

    if (status === "unmet") {
      return "未满足";
    }

    return "暂无证据";
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

  private buildComparisonEntryPresentation(
    entry: ComparisonEntry,
    conditions?: SearchConditions
  ): ComparisonEntryPresentation {
    const evidenceCount = entry.topEvidence.length;
    const sourceCount = this.countKnownSources(entry.candidate.sources);
    const freshnessText = this.formatFreshnessText(
      entry.candidate.latestEvidenceAt,
      entry.candidate.lastSyncedAt
    );

    return {
      goalFit: `${this.formatVerdict(entry.goalFit.verdict)} · ${entry.goalFit.summary || entry.candidate.matchReason || "与当前目标条件相关"}`,
      evidenceStrength: `${this.formatVerdict(entry.evidenceStrength.verdict)} · ${entry.evidenceStrength.summary || `${evidenceCount} 条核心证据`}${sourceCount > 0 ? ` / ${sourceCount} 个来源` : ""}`,
      technicalRelevance: `${this.formatVerdict(entry.technicalRelevance.verdict)} · ${entry.technicalRelevance.summary || `技术 ${this.normalizePercent(entry.profile.dimensions.techMatch).toFixed(0)}% / 项目 ${this.normalizePercent(entry.profile.dimensions.projectDepth).toFixed(0)}%`}`,
      sourceQualityRecency: [
        entry.sourceQualityRecency.summary || (sourceCount > 0 ? `${sourceCount} 个来源` : "来源未知"),
        freshnessText
      ].join(" · "),
      uncertainty: this.buildEntryUncertainty(entry, conditions)
    };
  }

  private buildComparisonDecisionPresentation(
    entries: ComparisonEntry[],
    conditions?: SearchConditions,
    comparisonResult?: ComparisonResult
  ): ComparisonDecisionPresentation {
    const recommendedEntry = entries[0];
    if (!recommendedEntry) {
      return {
        outcome: "暂不推荐",
        confidence: "低信心",
        summary: "当前 compare 结果为空，我还没有足够证据推荐其中一位。",
        nonSelectionReasons: [],
        largestUncertainty: "当前还没有形成 2-3 位候选人的有效对照。",
        nextStep: "先补足候选人，再进入 compare。"
      };
    }

    const runnerUp = entries[1];
    const fallbackConfidence = this.deriveComparisonConfidence(recommendedEntry, runnerUp);
    const confidence = comparisonResult
      ? this.mapConfidence(comparisonResult.outcome.confidence)
      : fallbackConfidence;
    const outcome = comparisonResult
      ? this.mapRecommendationMode(comparisonResult.outcome.recommendationMode)
      : confidence === "高信心"
        ? "明确推荐"
        : confidence === "中信心"
          ? "条件式推荐"
          : "暂不推荐";

    const summary = comparisonResult?.outcome.recommendation
      || (confidence === "高信心"
        ? `推荐 ${recommendedEntry.candidate.name}，当前领先优势清晰且证据可追溯。`
        : confidence === "中信心"
          ? `当前更偏向 ${recommendedEntry.candidate.name}，但需要带着 caveat 使用这个结论。`
          : "我还没有足够证据推荐其中一位，当前结论应停在 compare 层。");

    const nextStep = confidence === "低信心"
      ? comparisonResult?.outcome.suggestedRefinement || "建议先 refine 条件，或继续查看详情补证据后再做推荐。"
      : confidence === "中信心"
        ? `${recommendedEntry.nextStep}；如果岗位偏好不同，再回看第二位候选人。`
        : recommendedEntry.nextStep;

    return {
      outcome,
      confidence,
      recommendedEntry: confidence === "低信心" ? undefined : recommendedEntry,
      summary,
      nonSelectionReasons: entries.slice(1).map((entry) =>
        this.buildNonSelectionReason(recommendedEntry, entry, conditions)
      ),
      largestUncertainty: comparisonResult?.outcome.largestUncertainty || this.buildLargestUncertainty(
        recommendedEntry,
        runnerUp,
        conditions,
        confidence
      ),
      nextStep
    };
  }

  private renderComparisonDecisionSummary(
    presentation: ComparisonDecisionPresentation
  ): string {
    const recommendedLabel = presentation.recommendedEntry
      ? chalk.blueBright(presentation.recommendedEntry.candidate.name)
      : chalk.dim("暂无");
    const nonSelectionLines = presentation.nonSelectionReasons.length > 0
      ? presentation.nonSelectionReasons.map((reason) => `  - ${reason}`).join("\n")
      : chalk.dim("  - 暂无其他候选人可对照");

    return [
      `${chalk.bold("推荐结果")}：${this.formatOutcomeBadge(presentation.outcome)} ${recommendedLabel}`,
      `${chalk.bold("信心等级")}：${this.formatConfidenceBadge(presentation.confidence)}`,
      `${chalk.bold("结论摘要")}：${presentation.summary}`,
      `${chalk.bold("为什么更强")}：${presentation.recommendedEntry?.whySelected || "当前没有形成足够稳的推荐理由。"}`,
      `${chalk.bold("为什么没选其他人")}：`,
      nonSelectionLines,
      `${chalk.bold("最大不确定性")}：${presentation.largestUncertainty}`,
      `${chalk.bold("建议动作")}：${chalk.cyan(presentation.nextStep)}`
    ].join("\n");
  }

  private buildEntryUncertainty(entry: ComparisonEntry, conditions?: SearchConditions) {
    if (entry.uncertainty.summary) {
      return `${this.formatUncertaintyLevel(entry.uncertainty.level)} · ${entry.uncertainty.summary}`;
    }

    const sourceCount = this.countKnownSources(entry.candidate.sources);
    const freshestAge = this.getAgeInDays(entry.candidate.latestEvidenceAt ?? entry.candidate.lastSyncedAt);

    if (entry.topEvidence.length === 0) {
      return "缺少可追溯的核心证据";
    }

    if (sourceCount < 2) {
      return "主要依赖单一来源，仍需交叉验证";
    }

    if (freshestAge !== undefined && freshestAge > 90) {
      return "近期信号偏旧，时效性不足";
    }

    if (conditions?.locations.length && this.normalizePercent(entry.profile.dimensions.locationMatch) < 75) {
      return "地点贴合度不是压倒性优势";
    }

    if (this.normalizePercent(entry.profile.dimensions.techMatch) < 70) {
      return "技术相关性仍需通过详情页确认";
    }

    return "仍建议结合详情页核对近况与上下文";
  }

  private buildLargestUncertainty(
    lead: ComparisonEntry,
    runnerUp: ComparisonEntry | undefined,
    conditions: SearchConditions | undefined,
    confidence: CompareConfidenceLabel
  ) {
    if (lead.uncertainty.summary) {
      return lead.uncertainty.summary;
    }

    if (!runnerUp) {
      return "当前 compare 还不到 2-3 位候选人，无法形成稳定对照。";
    }

    if (lead.topEvidence.length === 0) {
      return "领先候选人缺少可追溯的核心证据。";
    }

    if (this.countKnownSources(lead.candidate.sources) < 2) {
      return "领先判断主要依赖单一来源，仍需补一层交叉验证。";
    }

    const freshestAge = this.getAgeInDays(lead.candidate.latestEvidenceAt ?? lead.candidate.lastSyncedAt);
    if (freshestAge !== undefined && freshestAge > 90) {
      return "当前可用证据偏旧，无法确认近况是否仍成立。";
    }

    if (lead.decisionScore - runnerUp.decisionScore < 8) {
      return "第一名与第二名差距有限，如果你更重视其他维度，结论可能变化。";
    }

    if (confidence === "中信心" && conditions?.skills.length) {
      return "当前判断仍主要依赖技能命中，是否足够贴合真实岗位场景还需要详情页确认。";
    }

    return "仍建议打开详情页确认最新背景，避免把 compare 结果当成最终事实。";
  }

  private buildNonSelectionReason(
    lead: ComparisonEntry,
    entry: ComparisonEntry,
    conditions?: SearchConditions
  ) {
    if (entry.whyNotSelected) {
      return `${entry.candidate.name}：${entry.whyNotSelected}`;
    }

    const reasons: string[] = [];

    if (this.normalizePercent(lead.profile.dimensions.techMatch) - this.normalizePercent(entry.profile.dimensions.techMatch) >= 8) {
      reasons.push("技术相关性更弱");
    }

    if (this.normalizePercent(lead.profile.dimensions.projectDepth) - this.normalizePercent(entry.profile.dimensions.projectDepth) >= 8) {
      reasons.push("项目支撑更薄");
    }

    if (lead.topEvidence.length - entry.topEvidence.length >= 1) {
      reasons.push("核心证据更少");
    }

    if (this.countKnownSources(lead.candidate.sources) > this.countKnownSources(entry.candidate.sources)) {
      reasons.push("来源交叉验证更少");
    }

    const leadAge = this.getAgeInDays(lead.candidate.latestEvidenceAt ?? lead.candidate.lastSyncedAt);
    const entryAge = this.getAgeInDays(entry.candidate.latestEvidenceAt ?? entry.candidate.lastSyncedAt);
    if (leadAge !== undefined && entryAge !== undefined && entryAge - leadAge >= 30) {
      reasons.push("近期信号更旧");
    }

    if (
      reasons.length === 0 &&
      conditions?.locations.length &&
      this.normalizePercent(entry.profile.dimensions.locationMatch) <
        this.normalizePercent(lead.profile.dimensions.locationMatch)
    ) {
      reasons.push("地点贴合度稍弱");
    }

    const suffix = reasons.length > 0
      ? reasons.slice(0, 2).join("，")
      : "与推荐人选差距不大，但优势还不够稳定";

    return `${entry.candidate.name}：${suffix}`;
  }

  private formatOutcomeBadge(outcome: CompareOutcomeLabel) {
    if (outcome === "明确推荐") {
      return chalk.bgGreen.black(` ${outcome} `);
    }

    if (outcome === "条件式推荐") {
      return chalk.bgYellow.black(` ${outcome} `);
    }

    return chalk.bgRed.white(` ${outcome} `);
  }

  private formatConfidenceBadge(confidence: CompareConfidenceLabel) {
    if (confidence === "高信心") {
      return chalk.greenBright(confidence);
    }

    if (confidence === "中信心") {
      return chalk.yellow(confidence);
    }

    return chalk.red(confidence);
  }

  private formatVerdict(verdict: "strong" | "mixed" | "weak") {
    if (verdict === "strong") {
      return "强";
    }

    if (verdict === "mixed") {
      return "中";
    }

    return "弱";
  }

  private formatUncertaintyLevel(level: "low" | "medium" | "high") {
    if (level === "low") {
      return "低风险";
    }

    if (level === "medium") {
      return "中风险";
    }

    return "高风险";
  }

  private deriveComparisonConfidence(
    recommendedEntry: ComparisonEntry,
    runnerUp?: ComparisonEntry
  ): CompareConfidenceLabel {
    if (recommendedEntry.uncertainty.level === "high" || recommendedEntry.evidenceStrength.verdict === "weak") {
      return "低信心";
    }

    if (!runnerUp) {
      return recommendedEntry.uncertainty.level === "low" ? "中信心" : "低信心";
    }

    if (
      recommendedEntry.uncertainty.level === "low" &&
      recommendedEntry.goalFit.verdict === "strong" &&
      recommendedEntry.evidenceStrength.verdict === "strong" &&
      recommendedEntry.decisionScore - runnerUp.decisionScore >= 8
    ) {
      return "高信心";
    }

    return "中信心";
  }

  private mapConfidence(confidence: ComparisonResult["outcome"]["confidence"]): CompareConfidenceLabel {
    if (confidence === "high-confidence") {
      return "高信心";
    }

    if (confidence === "medium-confidence") {
      return "中信心";
    }

    return "低信心";
  }

  private mapRecommendationMode(mode: ComparisonResult["outcome"]["recommendationMode"]): CompareOutcomeLabel {
    if (mode === "clear-recommendation") {
      return "明确推荐";
    }

    if (mode === "conditional-recommendation") {
      return "条件式推荐";
    }

    return "暂不推荐";
  }

  private countKnownSources(sources: string[]) {
    return new Set((sources || []).filter((source) => source && source !== "Unknown")).size;
  }

  private normalizePercent(score: number) {
    return score <= 1 ? score * 100 : score;
  }

  private getAgeInDays(date?: Date) {
    if (!date) {
      return undefined;
    }

    return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  }

  private formatFreshnessText(latestEvidence?: Date, lastSynced?: Date) {
    const referenceDate = latestEvidence || lastSynced;
    if (!referenceDate) {
      return "时效未知";
    }

    const age = this.getAgeInDays(referenceDate);
    if (age === undefined) {
      return "时效未知";
    }

    if (age <= 7) {
      return `${age} 天内有更新`;
    }

    if (age <= 30) {
      return `${age} 天内有信号`;
    }

    if (age <= 90) {
      return `${age} 天前有信号`;
    }

    return `${age} 天前更新`;
  }
}
