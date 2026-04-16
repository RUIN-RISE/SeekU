import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ExportArtifact,
  ExportCandidateRecord,
  ExportFormat,
  ExportTarget
} from "./types.js";

interface ExportRequest {
  format: ExportFormat;
  target: ExportTarget;
  querySummary: string;
  records: ExportCandidateRecord[];
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, "../../../..");
const EXPORT_ROOT = resolve(REPO_ROOT, "output", "shortlists");

export class ShortlistExporter {
  async export(request: ExportRequest): Promise<ExportArtifact> {
    const generatedAt = new Date();
    const stamp = this.buildTimestamp(generatedAt);
    const outputDir = resolve(EXPORT_ROOT, stamp);
    const fileName = request.target === "pool"
      ? `compare-pool.${request.format}`
      : `shortlist.${request.format}`;
    const filePath = resolve(outputDir, fileName);

    await mkdir(outputDir, { recursive: true });

    const artifact: ExportArtifact = {
      target: request.target,
      format: request.format,
      generatedAt: generatedAt.toISOString(),
      outputDir,
      querySummary: request.querySummary,
      count: request.records.length,
      files: [
        {
          format: request.format,
          label: fileName,
          path: filePath
        }
      ],
      records: request.records
    };

    const content = this.renderArtifact(artifact);
    await writeFile(filePath, content, "utf8");

    return artifact;
  }

  private renderArtifact(artifact: ExportArtifact): string {
    if (artifact.format === "csv") {
      return this.renderCsv(artifact);
    }

    if (artifact.format === "json") {
      return JSON.stringify(artifact, null, 2);
    }

    return this.renderMarkdown(artifact);
  }

  private renderMarkdown(artifact: ExportArtifact): string {
    const targetLabel = artifact.target === "pool" ? "Compare Pool" : "Shortlist";
    const compareSummary = this.buildPresentationSummary(artifact.records);
    const header = [
      `# Seeku ${targetLabel} Export`,
      "",
      `- 生成时间：${this.formatDisplayTime(artifact.generatedAt)}`,
      `- 导出对象：${artifact.target === "pool" ? "当前对比池" : "当前 shortlist"}`,
      `- 查询摘要：${artifact.querySummary}`,
      `- 候选人数：${artifact.count}`,
      `- 推荐结果：${compareSummary.outcome}`,
      `- 信心等级：${compareSummary.confidence}`,
      `- 推荐对象：${compareSummary.recommendedName || "暂无"}`,
      `- 最大不确定性：${compareSummary.largestUncertainty}`,
      ""
    ];

    const sections = artifact.records.map((record, index) => {
      const entryView = this.buildRecordPresentation(record);
      const lines = [
        `## ${index + 1}. ${record.name}`,
        "",
        `- Headline: ${record.headline || "未知"}`,
        `- Location: ${record.location || "未知"}`,
        `- Company: ${record.company || "未知"}`,
        `- Score: ${record.matchScore.toFixed(1)}`,
        `- Source: ${record.source}`,
        `- Freshness: ${record.freshness}`,
        `- Bonjour: ${record.bonjourUrl || "无"}`,
        `- Why Matched: ${record.whyMatched}`,
        `- Goal Fit: ${entryView.goalFit}`,
        `- Evidence Strength: ${entryView.evidenceStrength}`,
        `- Source Quality / Recency: ${entryView.sourceQualityRecency}`,
        `- Key Uncertainty: ${entryView.uncertainty}`,
        `- Recommendation Outcome: ${entryView.outcome}`,
        `- Confidence: ${entryView.confidence}`
      ];

      if (record.decisionTag) {
        lines.push(`- Decision: ${record.decisionTag}`);
      }

      if (record.recommendation) {
        lines.push(`- Recommendation: ${record.recommendation}`);
      }

      if (record.nextStep) {
        lines.push(`- Next Click: ${record.nextStep}`);
      }

      if (record.topEvidence.length > 0) {
        lines.push("- Top Evidence:");
        record.topEvidence.forEach((item) => {
          const freshness = item.freshnessLabel ? ` · ${item.freshnessLabel}` : "";
          lines.push(`  - [${item.sourceLabel}] [${item.evidenceType}] ${item.title}${freshness}`);
        });
      }

      lines.push("");
      return lines.join("\n");
    });

    return [...header, ...sections].join("\n");
  }

  private renderCsv(artifact: ExportArtifact): string {
    const headers = [
      "shortlistIndex",
      "name",
      "headline",
      "location",
      "company",
      "matchScore",
      "source",
      "freshness",
      "bonjourUrl",
      "whyMatched",
      "goalFit",
      "evidenceStrength",
      "sourceQualityRecency",
      "uncertainty",
      "recommendationOutcome",
      "confidence",
      "decisionTag",
      "recommendation",
      "nextStep",
      "topEvidence"
    ];

    const rows = artifact.records.map((record) => {
      const entryView = this.buildRecordPresentation(record);
      return [
        record.shortlistIndex ?? "",
        record.name,
        record.headline || "",
        record.location || "",
        record.company || "",
        record.matchScore.toFixed(1),
        record.source,
        record.freshness,
        record.bonjourUrl || "",
        record.whyMatched,
        entryView.goalFit,
        entryView.evidenceStrength,
        entryView.sourceQualityRecency,
        entryView.uncertainty,
        entryView.outcome,
        entryView.confidence,
        record.decisionTag || "",
        record.recommendation || "",
        record.nextStep || "",
        record.topEvidence
          .map((item) => {
            const freshness = item.freshnessLabel ? ` (${item.freshnessLabel})` : "";
            return `[${item.sourceLabel}/${item.evidenceType}] ${item.title}${freshness}`;
          })
          .join(" | ")
      ];
    });

    return [headers, ...rows]
      .map((row) => row.map((value) => this.escapeCsv(String(value))).join(","))
      .join("\n");
  }

  private escapeCsv(value: string): string {
    if (!/[",\n]/.test(value)) {
      return value;
    }

    return `"${value.replace(/"/g, "\"\"")}"`;
  }

  private formatDisplayTime(value: string): string {
    return new Date(value).toLocaleString("zh-CN", {
      hour12: false
    });
  }

  private buildTimestamp(date: Date): string {
    const parts = [
      date.getFullYear(),
      this.pad(date.getMonth() + 1),
      this.pad(date.getDate())
    ].join("");

    const time = [
      this.pad(date.getHours()),
      this.pad(date.getMinutes()),
      this.pad(date.getSeconds())
    ].join("");

    return `${parts}-${time}-${String(date.getMilliseconds()).padStart(3, "0")}`;
  }

  private pad(value: number): string {
    return String(value).padStart(2, "0");
  }

  private buildPresentationSummary(records: ExportCandidateRecord[]) {
    const ranked = [...records].sort((left, right) => right.matchScore - left.matchScore);
    const lead = ranked[0];
    const runnerUp = ranked[1];
    const outcome = !lead
      ? "暂不推荐"
      : this.classifyConfidence(lead, runnerUp).outcome;
    const confidence = !lead
      ? "低信心"
      : this.classifyConfidence(lead, runnerUp).confidence;

    return {
      outcome,
      confidence,
      recommendedName: outcome === "暂不推荐" ? undefined : lead?.name,
      largestUncertainty: this.buildLargestUncertainty(lead, runnerUp)
    };
  }

  private buildRecordPresentation(record: ExportCandidateRecord) {
    const { outcome, confidence } = this.classifyConfidence(record);
    return {
      goalFit: `${this.describeLevel(this.normalizePercent(record.matchScore), { high: 80, medium: 65 })} · ${record.whyMatched}`,
      evidenceStrength: `${this.describeEvidenceStrength(record)} · ${record.topEvidence.length} 条核心证据`,
      sourceQualityRecency: `${record.source || "来源未知"} · ${record.freshness}`,
      uncertainty: this.buildRecordUncertainty(record),
      outcome,
      confidence
    };
  }

  private classifyConfidence(
    lead: ExportCandidateRecord,
    runnerUp?: ExportCandidateRecord
  ) {
    const gap = runnerUp ? this.normalizePercent(lead.matchScore) - this.normalizePercent(runnerUp.matchScore) : 0;
    const evidenceCount = lead.topEvidence.length;
    const sourceCount = lead.source.split(",").map((item) => item.trim()).filter(Boolean).length;
    const freshEnough = !/(未知|月前|年前)/.test(lead.freshness);

    const confidence = runnerUp &&
      gap >= 8 &&
      evidenceCount >= 2 &&
      sourceCount >= 2 &&
      freshEnough
      ? "高信心"
      : runnerUp &&
          evidenceCount >= 1 &&
          (gap >= 4 || sourceCount >= 2 || freshEnough)
        ? "中信心"
        : "低信心";

    return {
      confidence,
      outcome: confidence === "高信心"
        ? "明确推荐"
        : confidence === "中信心"
          ? "条件式推荐"
          : "暂不推荐"
    };
  }

  private buildLargestUncertainty(
    lead?: ExportCandidateRecord,
    runnerUp?: ExportCandidateRecord
  ) {
    if (!lead || !runnerUp) {
      return "当前导出里缺少足够的 compare 对照。";
    }

    if (lead.topEvidence.length === 0) {
      return "领先候选人缺少核心证据。";
    }

    if (lead.source.split(",").map((item) => item.trim()).filter(Boolean).length < 2) {
      return "领先判断主要依赖单一来源，仍需交叉验证。";
    }

    if (this.normalizePercent(lead.matchScore) - this.normalizePercent(runnerUp.matchScore) < 8) {
      return "第一名与第二名差距有限，岗位偏好变化可能改变结论。";
    }

    return "仍建议结合详情页确认最新背景，避免把导出结论当成最终事实。";
  }

  private buildRecordUncertainty(record: ExportCandidateRecord) {
    if (record.topEvidence.length === 0) {
      return "缺少可追溯的核心证据";
    }

    if (record.source.split(",").map((item) => item.trim()).filter(Boolean).length < 2) {
      return "主要依赖单一来源";
    }

    if (/(月前|年前|未知)/.test(record.freshness)) {
      return "近期信号偏旧或时效未知";
    }

    return "仍建议查看详情页确认上下文";
  }

  private describeEvidenceStrength(record: ExportCandidateRecord) {
    const sourceCount = record.source.split(",").map((item) => item.trim()).filter(Boolean).length;
    if (record.topEvidence.length >= 2 && sourceCount >= 2 && !/(月前|年前|未知)/.test(record.freshness)) {
      return "强";
    }

    if (record.topEvidence.length >= 1) {
      return "中";
    }

    return "弱";
  }

  private describeLevel(score: number, thresholds: { high: number; medium: number }) {
    if (score >= thresholds.high) {
      return "强";
    }

    if (score >= thresholds.medium) {
      return "中";
    }

    return "弱";
  }

  private normalizePercent(score: number) {
    return score <= 1 ? score * 100 : score;
  }
}
