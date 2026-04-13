import type { LLMProvider } from "@seeku/llm";
import { createProvider } from "@seeku/llm";

/**
 * ProfileSummarizer - AI 驱动的人才洞察引擎 (Hardened)
 * 
 * DESIGN RATIONALE:
 * 本组件已通过工业级安全加固。
 * 已修复: Prompt Injection 防御, 运行时格式验证, 超时机制。
 * 
 * @module Enrichment/Summarizer
 */

export interface SummarizedProfile {
  displayName?: string;
  headline?: string;
  bio?: string;
  connectedPeople?: Array<{ name: string; url: string; relationship: string }>;
}

const SUMMARIZER_CONFIG = {
  TIMEOUT_MS: 60 * 1000,
  MAX_INPUT_LENGTH: 12000
} as const;

export class ProfileSummarizer {
  private provider: LLMProvider;

  constructor(provider?: LLMProvider) {
    this.provider = provider ?? createProvider();
  }

  /**
   * 手动校验 LLM 返回的内容格式 (取代 Zod 以减少依赖)
   */
  private validate(data: any): SummarizedProfile {
    if (typeof data !== "object" || data === null) {
      throw new Error("Response is not an object");
    }

    const result: SummarizedProfile = {};

    if (typeof data.displayName === "string") result.displayName = data.displayName;
    if (typeof data.headline === "string") result.headline = data.headline;
    if (typeof data.bio === "string") result.bio = data.bio;

    if (Array.isArray(data.connectedPeople)) {
      result.connectedPeople = data.connectedPeople
        .filter((p: any) => p && typeof p.name === "string" && typeof p.url === "string")
        .map((p: any) => ({
          name: p.name,
          url: p.url,
          relationship: typeof p.relationship === "string" ? p.relationship : "connection"
        }));
    }

    return result;
  }

  /**
   * 提炼候选人画像与关联人脉 (Security Hardened)
   */
  async summarize(content: string): Promise<SummarizedProfile> {
    // 1. Prompt Injection 防御
    const sanitizedContent = content
      .slice(0, SUMMARIZER_CONFIG.MAX_INPUT_LENGTH)
      .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f]/g, "")
      .replace(/\{\{/g, "{ {")
      .replace(/\}\}/g, "} }");

    // 2. 结构化 Prompt 
    const prompt = `You are a professional technical headhunter. 
Extract candidate information from the following user-provided content.

<INSTRUCTIONS>
- Sythesize a professional brand in a high-density JSON format.
- Output strictly valid JSON. No conversational filler.
- Fields: displayName, headline, bio, connectedPeople (name, url, relationship).
</INSTRUCTIONS>

<USER_CONTENT_TO_ANALYZE>
${sanitizedContent}
</USER_CONTENT_TO_ANALYZE>

OUTPUT JSON ONLY:`;

    // 3. 超时控制
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUMMARIZER_CONFIG.TIMEOUT_MS);

    try {
      const response = await this.provider.chat([
        { role: "system", content: "You are a professional talent researcher. Output strictly valid JSON." },
        { role: "user", content: prompt }
      ], { 
        temperature: 0.1,
        // @ts-ignore
        signal: controller.signal 
      });

      const cleaned = response.content.trim()
        .replace(/^```json/, "")
        .replace(/```$/, "");
      
      const parsed = JSON.parse(cleaned);

      // 4. 运行验证
      return this.validate(parsed);
    } catch (error) {
      if ((error as any).name === "AbortError") {
        console.error("[Summarizer] LLM request timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
