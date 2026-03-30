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
    const header = [
      `# Seeku ${targetLabel} Export`,
      "",
      `- 生成时间：${this.formatDisplayTime(artifact.generatedAt)}`,
      `- 导出对象：${artifact.target === "pool" ? "当前对比池" : "当前 shortlist"}`,
      `- 查询摘要：${artifact.querySummary}`,
      `- 候选人数：${artifact.count}`,
      ""
    ];

    const sections = artifact.records.map((record, index) => {
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
        `- Why Matched: ${record.whyMatched}`
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
      "decisionTag",
      "recommendation",
      "nextStep",
      "topEvidence"
    ];

    const rows = artifact.records.map((record) => [
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
      record.decisionTag || "",
      record.recommendation || "",
      record.nextStep || "",
      record.topEvidence
        .map((item) => {
          const freshness = item.freshnessLabel ? ` (${item.freshnessLabel})` : "";
          return `[${item.sourceLabel}/${item.evidenceType}] ${item.title}${freshness}`;
        })
        .join(" | ")
    ]);

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
}
