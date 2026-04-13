import { 
  eq, 
  inArray, 
  sourceProfiles, 
  personIdentities, 
  extractedProfiles,
  type SeekuDatabase,
  type SourceProfile
} from "@seeku/db";
import { type LLMProvider, createProvider } from "@seeku/llm";
import { SmartCrawler } from "./crawler.js";

export interface ExtractedProfileData {
  name: string;
  wechat?: string;
  email?: string;
  enrollmentYear?: string;
  major?: string;
  gender?: string;
  currentCompany?: string;
  bio?: string;
  industryTags: string[];
  socialLinks: Record<string, string>;
}

/**
 * CrossChannelExtractor - 多源交叉特征提取引擎
 * 
 * 核心逻辑:
 * 1. 聚合候选人的所有来源 (Bonjour + GitHub)
 * 2. 如果存在个人网站，进行深度抓取
 * 3. 喂给 LLM 进行结构化提取，特别关注微信、入学年份等高难度字段
 */
export class CrossChannelExtractor {
  private db: SeekuDatabase;
  private provider: LLMProvider;

  constructor(db: SeekuDatabase, provider?: LLMProvider) {
    this.db = db;
    this.provider = provider ?? createProvider();
  }

  /**
   * 执行单个人才的深度提取
   */
  async extract(personId: string, options: { crawlWebsites?: boolean } = {}): Promise<ExtractedProfileData | null> {
    const skipCrawling = options.crawlWebsites === false;

    // 1. 获取所有关联的 Source Profiles
    const identities = await this.db
      .select()
      .from(personIdentities)
      .where(eq(personIdentities.personId, personId));

    if (identities.length === 0) return null;

    const profileIds = identities.map(id => id.sourceProfileId);
    const profiles = await this.db
      .select()
      .from(sourceProfiles)
      .where(inArray(sourceProfiles.id, profileIds));

    // 2. 识别并抓取个人网站
    let crawledText = "";
    if (!skipCrawling) {
      const websites = profiles
        .flatMap(p => (p.normalizedPayload as any).aliases || [])
        .filter((a: any) => a.type === "website")
        .map((a: any) => a.value);

      if (websites.length > 0) {
        console.info(`[Extractor] Crawling ${websites.length} websites for ${personId}...`);
        for (const url of websites) {
          try {
            const result = await SmartCrawler.crawl(url, process.env.JINA_API_KEY);
            if (result.source !== "failure") {
              crawledText += `\n\n--- Content from ${url} ---\n${result.content}`;
            }
          } catch (e) {
            console.error(`[Extractor] Crawl failed for ${url}:`, e);
          }
        }
      }
    }

    // 3. 构建模型输入
    const inputPayload = {
      personId,
      sourceData: profiles.map(p => ({
        source: p.source,
        handle: p.sourceHandle,
        url: p.canonicalUrl,
        raw: p.rawPayload,
        normalized: p.normalizedPayload
      })),
      webContext: crawledText.slice(0, 8000) // 限制长度
    };

    // 4. LLM 提炼
    const prompt = `You are a professional talent researcher at Seeku. 
Extract a high-fidelity profile from the provided multi-source JSON data and web context.

<DATA>
${JSON.stringify(inputPayload, null, 2)}
</DATA>

<EXTRACTION_RULES>
- Output strictly valid JSON.
- Synthesize 'enrollmentYear' from educational background or mentions (e.g., '20级' means '2020').
- Look for 'wechat', 'vx', '微信', 'Weixin' in bios and web content.
- 'industryTags' should be high-density keywords like 'LLM', 'vLLM', 'Inference Optimization'.
- Use the most confident value across sources for 'name' and 'currentCompany'.
</EXTRACTION_RULES>

RETURN JSON FORMAT:
{
  "name": "Full Name",
  "wechat": "WeChat ID or null",
  "email": "Email or null",
  "enrollmentYear": "YYYY or null",
  "major": "Major Name or null",
  "gender": "Male/Female or null",
  "currentCompany": "Company Name or null",
  "bio": "One sentence summary",
  "industryTags": ["tag1", "tag2"],
  "socialLinks": { "github": "url", "linkedin": "url", ... }
}`;

    try {
      const response = await this.provider.chat([
        { role: "system", content: "You are a professional talent research tool. Output strictly valid JSON." },
        { role: "user", content: prompt }
      ], { temperature: 0 });

      const cleaned = response.content.replace(/^```json/, "").replace(/```$/, "").trim();
      const extracted = JSON.parse(cleaned) as ExtractedProfileData;

      // 5. 保存结果
      await this.db
        .insert(extractedProfiles)
        .values({
          personId,
          ...extracted,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: extractedProfiles.personId,
          set: {
            ...extracted,
            updatedAt: new Date()
          }
        });

      return extracted;
    } catch (error) {
      console.error(`[Extractor] LLM Extraction failed for ${personId}:`, error);
      return null;
    }
  }
}
