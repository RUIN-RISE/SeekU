import { Person, EvidenceItem } from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { createProvider } from "@seeku/llm";
import { MultiDimensionProfile, SearchConditions } from "./types.js";
import { ProfileSummarySchema, sanitizeForPrompt, safeParseJSON } from "./schemas.js";
import { CLI_CONFIG } from "./config.js";
import { isRetryable, withRetry } from "./retry.js";

interface ProfileGenerationOptions {
  quiet?: boolean;
  maxRetries?: number;
  signal?: AbortSignal;
}

export class ProfileGenerator {
  constructor(private llm: LLMProvider) {}

  // Factory method for convenience (backward compatibility)
  static withDefaultProvider(): ProfileGenerator {
    return new ProfileGenerator(createProvider());
  }

  async generate(
    candidate: Person,
    evidence: EvidenceItem[],
    profile: MultiDimensionProfile,
    conditions?: SearchConditions,
    options: ProfileGenerationOptions = {}
  ): Promise<MultiDimensionProfile> {
    // Sanitize all external data
    const safeName = sanitizeForPrompt(candidate.primaryName || "未知候选人", "name");
    const safeHeadline = sanitizeForPrompt(candidate.primaryHeadline || "暂无标题", "headline");
    const evidenceLines = evidence.slice(0, 15).map(e =>
      sanitizeForPrompt(e.title || "未命名证据", "title")
    );
    const safeEvidence = evidenceLines.length > 0
      ? evidenceLines.join("\n- ")
      : "暂无高价值结构化证据";
    const searchLens = this.formatSearchLens(conditions);

    const summaryPrompt = `
你是 Seeku 的资深人才顾问，请为候选人生成一段通用画像总结和 3 条关键亮点。

候选人：
- 姓名：${safeName}
- 标题：${safeHeadline}

六维评分：
- 技术匹配：${profile.dimensions.techMatch}/100
- 项目深度：${profile.dimensions.projectDepth}/100
- 学术影响：${profile.dimensions.academicImpact}/100
- 职场稳健：${profile.dimensions.careerStability}/100
- 社区声望：${profile.dimensions.communityReputation}/100

关键证据：
- ${safeEvidence}

当前搜索视角：
${searchLens}

请只返回 JSON 对象：
{
  "summary": "用 1-2 句简体中文总结其稳定、通用画像。",
  "highlights": [
    "亮点 1：简体中文，简洁有判断价值",
    "亮点 2",
    "亮点 3"
  ]
}

关键要求：
1. 只能输出 JSON，不要输出 markdown、解释或额外前后缀
2. summary 和 highlights 必须全部使用简体中文
3. 即使原始证据是英文，也要翻译或转述成中文
4. 保持客观，但要有招聘判断价值
5. summary 要尽量保持“离开当前搜索也成立”的通用画像
6. 当前搜索视角只用于决定强调什么，不要把它写成“为什么匹配本次 query”
`;

    try {
      const response = await withRetry(
        async () => {
          if (options.signal?.aborted) {
            throw options.signal.reason ?? new Error("Profile generation aborted.");
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), CLI_CONFIG.llm.timeoutMs);
          const abortFromParent = () => controller.abort(options.signal?.reason);
          options.signal?.addEventListener("abort", abortFromParent, { once: true });

          try {
            return await this.llm.chat([
              { role: "system", content: "你是专业的人才画像分析助手，只输出合法 JSON，且所有用户可见文案都使用简体中文。" },
              { role: "user", content: summaryPrompt }
            ], { signal: controller.signal });
          } finally {
            options.signal?.removeEventListener("abort", abortFromParent);
            clearTimeout(timeoutId);
          }
        },
        {
          maxRetries: options.maxRetries ?? CLI_CONFIG.llm.maxRetries,
          quiet: options.quiet,
          isRetryable: (error) => !options.signal?.aborted && isRetryable(error)
        }
      );

      const result = safeParseJSON(
        response.content,
        ProfileSummarySchema,
        {
          summary: "候选人在相关方向具备一定积累，建议结合更多证据继续判断。",
          highlights: ["具备相关技术与项目实践", "资料显示有持续投入记录", "可作为后续深看的候选人"]
        }
      );

      return {
        ...profile,
        summary: result.data.summary ?? "候选人在相关方向具备一定积累，建议结合更多证据继续判断。",
        highlights: result.data.highlights ?? ["具备相关技术与项目实践", "资料显示有持续投入记录", "可作为后续深看的候选人"]
      };
    } catch (e) {
      if (options.signal?.aborted) {
        throw e;
      }

      if (!options.quiet) {
        if (e instanceof Error && e.name === "AbortError") {
          console.warn("Profile generation timed out after", CLI_CONFIG.llm.timeoutMs, "ms");
        } else {
          console.warn("Failed to generate profile details:", e instanceof Error ? e.message : String(e));
        }
      }
      return {
        ...profile,
        summary: "候选人在相关方向具备一定积累，建议结合更多证据继续判断。",
        highlights: ["具备相关技术与项目实践", "资料显示有持续投入记录", "可作为后续深看的候选人"]
      };
    }
  }

  private formatSearchLens(conditions?: SearchConditions): string {
    if (!conditions) {
      return "未提供明确搜索视角。";
    }

    const parts = [
      conditions.role ? `角色：${conditions.role}` : "",
      conditions.skills.length > 0 ? `技能：${conditions.skills.join(" / ")}` : "",
      conditions.locations.length > 0 ? `地点：${conditions.locations.join(" / ")}` : "",
      conditions.experience ? `经验：${conditions.experience}` : "",
      conditions.sourceBias ? `来源过滤：${conditions.sourceBias}` : "",
      conditions.mustHave.length > 0 ? `必须项：${conditions.mustHave.join(" / ")}` : "",
      conditions.niceToHave.length > 0 ? `优先项：${conditions.niceToHave.join(" / ")}` : "",
      conditions.preferFresh ? "偏好：最近活跃" : ""
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(" | ") : "当前搜索较宽，没有严格限制。";
  }
}
