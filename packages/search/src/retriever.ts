import { and, desc, eq, sql } from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";

import type { SeekuDatabase, SearchDocument } from "@seeku/db";
import { persons, searchDocuments, searchEmbeddings } from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { generateEmbedding } from "@seeku/llm";

import type { QueryIntent } from "./planner.js";
import { SCORING_CONFIG } from "./scoring-config.js";
import {
  escapeRegexPattern,
  isBoundarySensitiveSearchTerm,
  normalizeSearchText,
} from "./search-normalization.js";

export interface SearchResult {
  personId: string;
  keywordScore: number;
  vectorScore: number;
  combinedScore: number;
  matchedText: string;
}

export interface RetrieverFilters {
  locations?: string[];
  sources?: string[];
}

export interface RetrieverConfig {
  db: SeekuDatabase;
  provider: LLMProvider;
  keywordWeight?: number;
  vectorWeight?: number;
  limit?: number;
}

export type RetrievalWarningCode =
  | "vector_search_failed"
  | "vector_search_empty"
  | "keyword_search_empty";

export interface RetrievalWarning {
  code: RetrievalWarningCode;
  message: string;
  cause?: string;
}

export interface RetrieveOptions {
  filters?: RetrieverFilters;
  embedding?: number[];
  signal?: AbortSignal;
  onWarning?: (warning: RetrievalWarning) => void;
}

const DEFAULT_KEYWORD_WEIGHT = SCORING_CONFIG.retriever.keywordWeight;
const DEFAULT_VECTOR_WEIGHT = SCORING_CONFIG.retriever.vectorWeight;
const DEFAULT_LIMIT = 50;
const DEFAULT_KEYWORD_THRESHOLD = SCORING_CONFIG.retriever.keywordThreshold;
const RETRIEVER_BOOST = SCORING_CONFIG.retriever.boost;
const SPECIALIZED_BLEND = SCORING_CONFIG.retriever.specializedBlend;
const VECTOR_DIMENSION_MISS_PENALTY = 0.5;
const VECTOR_DIMENSION_PARTIAL_WEIGHT = 0.5;
const SPECIALIZED_QUERY_TERMS = [
  "rag",
  "retrieval",
  "检索",
  "检索增强",
  "向量检索",
  "vector search",
  "multimodal",
  "multi-modal",
  "多模态",
  "computer vision",
  "计算机视觉",
  "llm",
  "大模型",
  "大语言模型",
  "agent",
  "智能体",
  "agentic",
  "transformer",
  "diffusion",
  "rlhf",
  "fine-tuning",
  "微调",
  "nlp",
  "自然语言处理",
  "deep learning",
  "深度学习",
  "机器学习",
  "machine learning",
  "pytorch",
  "tensorflow",
  "cuda",
  "triton",
  "langchain",
  "llamaindex",
  "vllm"
] as const;
const SHORT_TECH_TERMS = ["rag", "llm", "nlp", "cv", "ai", "ml", "go", "rl", "sft", "rlhf", "rlvr"] as const;
const OPEN_SOURCE_QUERY_TERMS = ["open source", "开源"] as const;
const OPEN_SOURCE_TEXT_TERMS = ["open source", "open-source", "开源"] as const;
const WEAK_MUST_HAVE_PATTERNS = [
  /\bgithub\b/i,
  /\bbonjour\b/i,
  /\bactive\b/i,
  /recently active/i,
  /活跃/
] as const;

const ROLE_EQUIVALENTS: Record<string, string[]> = {
  "tech lead": ["tech lead", "technical lead", "技术负责人", "负责人", "技术总监"],
  engineer: ["engineer", "工程师", "ai工程师", "后端工程师", "算法工程师", "机器学习工程师", "ml engineer"],
  "ai engineer": ["ai engineer", "ai工程师", "人工智能工程师", "ml engineer", "机器学习工程师", "算法工程师", "nlp工程师", "cv工程师", "rag工程师", "agent工程师"],
  "ml engineer": ["ml engineer", "机器学习工程师", "ai工程师", "算法工程师", "machine learning engineer"],
  "backend engineer": ["backend engineer", "backend", "后端", "后端工程师", "工程师"],
  developer: ["developer", "开发者", "工程师", "独立开发者"],
  founder: ["founder", "创始人", "联合创始人", "co-founder", "cofounder", "创业"],
  researcher: ["researcher", "研究员", "研究者", "ai研究员", "研究科学家"],
  scientist: ["scientist", "科学家", "研究科学家"],
  architect: ["architect", "架构师", "系统架构", "software architect"],
  "product manager": ["product manager", "product", "pm", "产品经理"],
  designer: ["designer", "设计师", "视觉设计", "ui设计师", "ux设计师"],
  manager: ["manager", "经理", "技术负责人", "技术总监"],
  "data engineer": ["data engineer", "数据工程师", "数据"],
  devops: ["devops", "sre", "site reliability", "运维"],
};

const SKILL_EQUIVALENTS: Record<string, string[]> = {
  "machine learning": ["machine learning", "ml", "机器学习"],
  algorithm: ["algorithm", "算法", "算法工程师", "算法研究员"],
  "deep learning": ["deep learning", "深度学习"],
  backend: ["backend", "后端"],
  frontend: ["frontend", "前端"],
  fullstack: ["fullstack", "full-stack", "全栈"],
  infra: ["infra", "infrastructure", "系统优化", "devops", "基础设施"],
  "ai infra": ["ai infra", "ai infrastructure", "ai基础设施", "ai infra"],
  multimodal: ["multimodal", "multi-modal", "多模态"],
  "computer vision": ["computer vision", "cv", "计算机视觉", "视觉"],
  retrieval: ["retrieval", "检索", "检索增强", "向量检索", "vector search", "vector database", "向量数据库"],
  "open source": ["open source", "open-source", "开源"],
  agent: ["agent", "智能体", "agentic", "agent infra"],
  ai: ["ai", "人工智能"],
  "generative ai": ["generative ai", "生成式 ai", "生成式人工智能", "生成式", "aigc", "ai"],
  llm: ["llm", "大模型", "大语言模型", "large language model"],
  rag: ["rag", "检索增强", "retrieval augmented"],
  nlp: ["nlp", "自然语言处理", "natural language processing"],
  research: ["research", "researcher", "研究", "研究员", "科研", "论文", "paper", "publication", "published"],
  paper: ["paper", "papers", "publication", "publications", "published", "论文", "发表"],
  transformer: ["transformer", "attention", "注意力机制"],
  diffusion: ["diffusion", "扩散模型"],
  "fine-tuning": ["fine-tuning", "fine tuning", "微调", "sft"],
  rlhf: ["rlhf", "rl", "rlvr", "强化学习", "reinforcement learning"],
  pytorch: ["pytorch", "torch"],
  tensorflow: ["tensorflow"],
  cuda: ["cuda", "triton"],
  docker: ["docker", "容器"],
  kubernetes: ["kubernetes", "k8s"],
  robotics: ["robotics", "机器人", "ros", "ros2"],
  speech: ["speech", "语音", "tts", "asr", "audio", "音频"],
  "prompt engineering": ["prompt engineering", "提示工程", "prompt"],
  embedding: ["embedding", "嵌入", "向量化"],
  quantization: ["quantization", "量化"],
  mlops: ["mlops", "ml ops", "ml运营"],
  observability: ["observability", "可观测性", "监控"],
  evaluation: ["evaluation", "eval", "benchmark", "评测"],
  langchain: ["langchain", "lang chain"],
  llamaindex: ["llamaindex", "llama index"],
  vllm: ["vllm", "vllm"],
  ollama: ["ollama"],
  dify: ["dify"],
  openai: ["openai", "open ai"],
  anthropic: ["anthropic", "claude"],
  blockchain: ["blockchain", "区块链", "web3"],
  startup: ["startup", "创业", "startup"],
};

function uniqueLowercase(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function expandEquivalentTerms(values: string[], equivalents: Record<string, string[]>): string[] {
  const expanded = new Set<string>();

  for (const value of uniqueLowercase(values)) {
    expanded.add(value);

    for (const [canonical, variants] of Object.entries(equivalents)) {
      const family = uniqueLowercase([canonical, ...variants]);
      if (family.includes(value)) {
        for (const item of family) {
          expanded.add(item);
        }
      }
    }
  }

  return [...expanded];
}

function expandRoleTerms(values: string[]): string[] {
  return expandEquivalentTerms(values, ROLE_EQUIVALENTS);
}

function expandSkillTerms(values: string[]): string[] {
  return expandEquivalentTerms(values, SKILL_EQUIVALENTS);
}

function textIncludesAny(text: string, terms: readonly string[]): boolean {
  const normalized = normalizeSearchText(text);
  return terms.some((term) => normalized.includes(normalizeSearchText(term)));
}

function isStrongTextMatchTerm(term: string): boolean {
  const normalized = normalizeSearchText(term);
  if (!normalized) {
    return false;
  }

  if (SHORT_TECH_TERMS.includes(normalized as typeof SHORT_TECH_TERMS[number])) {
    return true;
  }

  if (/[\u3400-\u9fff]/u.test(normalized)) {
    return true;
  }

  if (normalized.includes(" ") || normalized.includes("-")) {
    return true;
  }

  return normalized.length >= 4;
}

function normalizeSearchExpression(expression: SQLWrapper): SQL<string> {
  let normalized = sql<string>`lower(coalesce(${expression}, ''))`;

  for (const [from, to] of [
    ["！", "!"],
    ["？", "?"],
    ["，", ","],
    ["。", "."],
    ["；", ";"],
    ["：", ":"],
    ["（", "("],
    ["）", ")"],
    ["【", "["],
    ["】", "]"],
    ["《", "<"],
    ["》", ">"],
    ["“", "\""],
    ["”", "\""],
    ["‘", "'"],
    ["’", "'"],
    ["｜", "|"],
    ["－", "-"],
    ["　", " "],
    ["浙江大学", "zhejiang university"],
    ["浙大", "zhejiang university"],
  ] as const) {
    normalized = sql<string>`replace(${normalized}, ${from}, ${to})`;
  }

  normalized = sql<string>`regexp_replace(${normalized}, ${"\\mzju\\M"}, ${"zhejiang university"}, 'g')`;
  normalized = sql<string>`regexp_replace(${normalized}, ${"[[:space:][:punct:]]+"}, ${" "}, 'g')`;
  return sql<string>`trim(${normalized})`;
}

function buildNormalizedTermCondition(term: string, expression: SQLWrapper): SQL | null {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm || !isStrongTextMatchTerm(normalizedTerm)) {
    return null;
  }

  if (isBoundarySensitiveSearchTerm(normalizedTerm)) {
    return sql`${expression} ~ ${`\\m${escapeRegexPattern(normalizedTerm)}\\M`}`;
  }

  const escaped = escapeLikePattern(normalizedTerm);
  return sql`${expression} LIKE ${`%${escaped}%`} ESCAPE '\\'`;
}

function buildTextMatchCondition(terms: string[], expression: SQLWrapper): SQL | null {
  const conditions = uniqueLowercase(terms)
    .map((term) => buildNormalizedTermCondition(term, expression))
    .filter((condition): condition is SQL => Boolean(condition))
    .slice(0, 12);

  if (conditions.length === 0) {
    return null;
  }

  return sql`(${sql.join(conditions, sql.raw(" OR "))})`;
}

function queryWantsSpecializedFocus(intent: QueryIntent, expandedSkills: string[] = []): boolean {
  const text = normalizeSearchText([intent.rawQuery, ...intent.skills, ...expandedSkills].join(" "));
  return SPECIALIZED_QUERY_TERMS.some((term) => text.includes(normalizeSearchText(term)));
}

export interface KeywordIntentSignals {
  wantsOpenSource: boolean;
  openSourceTextTerms: string[];
  leadershipTextTerms: string[];
}

export function buildKeywordIntentSignals(intent: QueryIntent): KeywordIntentSignals {
  const wantsOpenSource = textIncludesAny(
    [intent.rawQuery, ...intent.skills, ...intent.mustHaves, ...intent.niceToHaves].join(" "),
    OPEN_SOURCE_TEXT_TERMS
  );

  if (!wantsOpenSource) {
    return {
      wantsOpenSource,
      openSourceTextTerms: [],
      leadershipTextTerms: []
    };
  }

  return {
    wantsOpenSource,
    openSourceTextTerms: [...OPEN_SOURCE_TEXT_TERMS],
    leadershipTextTerms: expandRoleTerms(intent.roles).filter(isStrongTextMatchTerm)
  };
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(score, 1));
}

function float8Param(value: number): SQL<number> {
  return sql<number>`${value}::double precision`;
}

function numericFlagExpr(condition: SQL | null): SQL<number> {
  if (!condition) {
    return sql<number>`0::double precision`;
  }

  return sql<number>`CASE WHEN ${condition} THEN 1::double precision ELSE 0::double precision END`;
}

function combineOrConditions(conditions: Array<SQL | null>): SQL | null {
  const present = conditions.filter((condition): condition is SQL => Boolean(condition));
  if (present.length === 0) {
    return null;
  }

  return sql`(${sql.join(present, sql.raw(" OR "))})`;
}

function buildDimensionMatchExpressions(intent: QueryIntent, normalizedDocText: SQLWrapper) {
  const expandedRoles = expandRoleTerms(intent.roles);
  const expandedSkills = expandSkillTerms(intent.skills);
  const roleTextCondition = buildTextMatchCondition(expandedRoles, normalizedDocText);
  const skillTextCondition = buildTextMatchCondition(expandedSkills, normalizedDocText);
  const mustHaveConditions = buildMustHaveConditions(intent);

  return {
    dimensionCount:
      (expandedRoles.length > 0 ? 1 : 0)
      + (expandedSkills.length > 0 ? 1 : 0)
      + (mustHaveConditions.length > 0 ? 1 : 0),
    roleMatchExpr: numericFlagExpr(
      expandedRoles.length > 0
        ? combineOrConditions([
          sql`${searchDocuments.facetRole} && ${toTextArray(expandedRoles)}`,
          roleTextCondition
        ])
        : null
    ),
    skillMatchExpr: numericFlagExpr(
      expandedSkills.length > 0
        ? combineOrConditions([
          sql`${searchDocuments.facetTags} && ${toTextArray(expandedSkills)}`,
          skillTextCondition
        ])
        : null
    ),
    mustHaveMatchExpr: numericFlagExpr(
      mustHaveConditions.length > 0
        ? sql`(${sql.join(mustHaveConditions, sql.raw(" AND "))})`
        : null
    )
  };
}

function toSnippet(text: string): string {
  return text.trim().slice(0, 280);
}

function toTextArray(values: string[]) {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql.raw(", ")
  )}]::text[]`;
}

function escapeLikePattern(term: string): string {
  // Escape special LIKE pattern characters to prevent injection
  return term.replace(/[%_\\]/g, "\\$&");
}

function buildMustHaveConditions(intent: QueryIntent): SQL[] {
  const normalizedDocText = normalizeSearchExpression(searchDocuments.docText);

  return intent.mustHaves
    .map((term) => term.trim())
    .filter(Boolean)
    .filter((term) => !WEAK_MUST_HAVE_PATTERNS.some((pattern) => pattern.test(term)))
    .slice(0, 20) // Limit number of conditions to prevent query explosion
    .map((term) => buildNormalizedTermCondition(term, normalizedDocText))
    .filter((condition): condition is SQL => Boolean(condition));
}

export function buildFilterConditions(intent: QueryIntent, filters?: RetrieverFilters): SQL[] {
  const conditions: SQL[] = [eq(persons.searchStatus, "active")];
  const locations = uniqueLowercase([...(intent.locations ?? []), ...(filters?.locations ?? [])]);
  const sources = uniqueLowercase([
    ...(filters?.sources ?? []),
    ...(intent.sourceBias ? [intent.sourceBias] : [])
  ]);

  // Location filter: use lenient matching (array overlap OR text ILIKE)
  // Expand locations to include both Chinese and English variants
  if (locations.length > 0) {
    const expandedLocations = expandLocationVariants(locations);
    const locationClauses = expandedLocations.map((loc) => [
      sql`${searchDocuments.facetLocation} && ${toTextArray([loc])}`,
      sql`${searchDocuments.facetLocation}::text ILIKE ${`%${loc}%`}`,
      sql`${persons.primaryLocation} ILIKE ${`%${loc}%`}`
    ]).flat();

    conditions.push(sql`(${sql.join(locationClauses, sql.raw(" OR "))})`);
  }

  if (sources.length > 0) {
    conditions.push(sql`${searchDocuments.facetSource} && ${toTextArray(sources)}`);
  }

  conditions.push(...buildMustHaveConditions(intent));

  return conditions;
}

// Chinese-English location mapping
const LOCATION_VARIANTS: Record<string, string[]> = {
  hangzhou: ["杭州", "hangzhou"],
  beijing: ["北京", "beijing"],
  shanghai: ["上海", "shanghai"],
  shenzhen: ["深圳", "shenzhen"],
  guangzhou: ["广州", "guangzhou"],
  suzhou: ["苏州", "suzhou"],
  nanjing: ["南京", "nanjing"],
  chengdu: ["成都", "chengdu"],
  wuhan: ["武汉", "wuhan"],
  china: ["中国", "china"],
  singapore: ["新加坡", "singapore"],
  tokyo: ["东京", "tokyo"],
  "new york": ["纽约", "new york"],
  remote: ["远程", "remote"],
  杭州: ["杭州", "hangzhou"],
  北京: ["北京", "beijing"],
  上海: ["上海", "shanghai"],
  深圳: ["深圳", "shenzhen"],
  广州: ["广州", "guangzhou"],
  苏州: ["苏州", "suzhou"],
  南京: ["南京", "nanjing"],
  成都: ["成都", "chengdu"],
  武汉: ["武汉", "wuhan"],
  中国: ["中国", "china"],
  新加坡: ["新加坡", "singapore"],
  东京: ["东京", "tokyo"],
  纽约: ["纽约", "new york"],
  远程: ["远程", "remote"]
};

function expandLocationVariants(locations: string[]): string[] {
  const expanded = new Set<string>();
  for (const loc of locations) {
    expanded.add(loc);
    const variants = LOCATION_VARIANTS[loc.toLowerCase()];
    if (variants) {
      variants.forEach((v) => expanded.add(v));
    }
  }
  return Array.from(expanded);
}

function buildKeywordQuery(intent: QueryIntent): string {
  const expandedRoles = expandRoleTerms(intent.roles);
  const expandedSkills = expandSkillTerms(intent.skills);
  const parts = [
    intent.rawQuery,
    ...expandedRoles,
    ...expandedSkills,
    ...intent.mustHaves,
    ...intent.niceToHaves
  ];

  return [...new Set(parts.map((value) => normalizeSearchText(value)).filter(Boolean))].join(" ");
}

function buildNameMatchSignals(rawQuery: string, normalizedPersonName: SQLWrapper) {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) {
    return {
      exactCondition: null,
      prefixCondition: null,
      exactMatchExpr: sql<number>`0::double precision`,
      prefixMatchExpr: sql<number>`0::double precision`
    };
  }

  const escaped = escapeLikePattern(normalizedQuery);
  const exactCondition = sql`${normalizedPersonName} = ${normalizedQuery}`;
  const prefixCondition = normalizedQuery.includes(" ")
    ? null
    : sql`${normalizedPersonName} LIKE ${`${escaped} %`} ESCAPE '\\'`;

  return {
    exactCondition,
    prefixCondition,
    exactMatchExpr: numericFlagExpr(exactCondition),
    prefixMatchExpr: prefixCondition
      ? numericFlagExpr(prefixCondition)
      : sql<number>`0::double precision`
  };
}

function mergeMatchedText(existing: string, next: string): string {
  if (existing && existing.length >= next.length) {
    return existing;
  }

  return next;
}

export class HybridRetriever {
  private readonly db: SeekuDatabase;
  private readonly provider: LLMProvider;
  private readonly keywordWeight: number;
  private readonly vectorWeight: number;
  private readonly limit: number;

  constructor(config: RetrieverConfig) {
    this.db = config.db;
    this.provider = config.provider;
    this.keywordWeight = config.keywordWeight ?? DEFAULT_KEYWORD_WEIGHT;
    this.vectorWeight = config.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
    this.limit = config.limit ?? DEFAULT_LIMIT;
  }

  async retrieveKeyword(intent: QueryIntent, filters?: RetrieverFilters): Promise<SearchResult[]> {
    const keywordQuery = buildKeywordQuery(intent);
    const expandedRoles = expandRoleTerms(intent.roles);
    const expandedSkills = expandSkillTerms(intent.skills);
    const keywordSignals = buildKeywordIntentSignals(intent);
    const wantsSpecializedFocus = queryWantsSpecializedFocus(intent, expandedSkills);
    if (!keywordQuery) {
      return [];
    }

    const normalizedDocText = normalizeSearchExpression(searchDocuments.docText);
    const normalizedPersonName = normalizeSearchExpression(persons.primaryName);
    const nameMatchSignals = buildNameMatchSignals(intent.rawQuery, normalizedPersonName);
    const roleMatchExpr = numericFlagExpr(sql`${searchDocuments.facetRole} && ${toTextArray(
      expandedRoles.length > 0 ? expandedRoles : ["__none__"]
    )}`);
    const skillMatchExpr = numericFlagExpr(sql`${searchDocuments.facetTags} && ${toTextArray(
      expandedSkills.length > 0 ? expandedSkills : ["__none__"]
    )}`);
    const scoreExpr = sql<number>`similarity(${normalizedDocText}, ${keywordQuery})`;
    const githubSourceCondition = keywordSignals.wantsOpenSource
      ? sql`${searchDocuments.facetSource} && ${toTextArray(["github"])}`
      : null;
    const skillTextCondition = buildTextMatchCondition(expandedSkills, normalizedDocText);
    const leadershipTextCondition = buildTextMatchCondition(keywordSignals.leadershipTextTerms, normalizedDocText);
    const openSourceTextCondition = buildTextMatchCondition(keywordSignals.openSourceTextTerms, normalizedDocText);
    const skillTextMatchExpr = skillTextCondition
      ? numericFlagExpr(skillTextCondition)
      : sql<number>`0::double precision`;
    const leadershipTextMatchExpr = leadershipTextCondition
      ? numericFlagExpr(leadershipTextCondition)
      : sql<number>`0::double precision`;
    const openSourceTextMatchExpr = openSourceTextCondition
      ? numericFlagExpr(openSourceTextCondition)
      : sql<number>`0::double precision`;
    const githubSourceMatchExpr = githubSourceCondition
      ? numericFlagExpr(githubSourceCondition)
      : sql<number>`0::double precision`;
    const specializedGithubCondition = wantsSpecializedFocus && skillTextCondition
      ? sql`(${searchDocuments.facetSource} && ${toTextArray(["github"])} AND ${skillTextCondition})`
      : null;
    const specializedGithubMatchExpr = specializedGithubCondition
      ? numericFlagExpr(specializedGithubCondition)
      : sql<number>`0::double precision`;

    const queryConditions: SQL[] = [
      sql`${scoreExpr} > ${float8Param(DEFAULT_KEYWORD_THRESHOLD)}`
    ];

    if (expandedRoles.length > 0) {
      queryConditions.push(sql`${searchDocuments.facetRole} && ${toTextArray(expandedRoles)}`);
    }

    if (expandedSkills.length > 0) {
      queryConditions.push(sql`${searchDocuments.facetTags} && ${toTextArray(expandedSkills)}`);
    }

    if (skillTextCondition) {
      queryConditions.push(skillTextCondition);
    }

    if (leadershipTextCondition) {
      queryConditions.push(leadershipTextCondition);
    }

    if (openSourceTextCondition) {
      queryConditions.push(openSourceTextCondition);
    }

    if (githubSourceCondition) {
      const githubOpenSourceSignals = [
        openSourceTextCondition,
        leadershipTextCondition,
        expandedRoles.length > 0 ? sql`${searchDocuments.facetRole} && ${toTextArray(expandedRoles)}` : null,
        expandedSkills.length > 0 ? sql`${searchDocuments.facetTags} && ${toTextArray(expandedSkills)}` : null
      ].filter((value): value is SQL => Boolean(value));

      if (githubOpenSourceSignals.length > 0) {
        queryConditions.push(sql`(${githubSourceCondition} AND (${sql.join(githubOpenSourceSignals, sql.raw(" OR "))}))`);
      }
    }

    if (specializedGithubCondition) {
      queryConditions.push(specializedGithubCondition);
    }

    if (nameMatchSignals.exactCondition) {
      queryConditions.push(nameMatchSignals.exactCondition);
    }

    if (nameMatchSignals.prefixCondition) {
      queryConditions.push(nameMatchSignals.prefixCondition);
    }

    const keywordRankExpr = sql<number>`
      ${scoreExpr}
      + ${roleMatchExpr} * ${float8Param(RETRIEVER_BOOST.role)}
      + ${skillMatchExpr} * ${float8Param(RETRIEVER_BOOST.skill)}
      + ${skillTextMatchExpr} * ${float8Param(RETRIEVER_BOOST.skillText)}
      + ${leadershipTextMatchExpr} * ${float8Param(RETRIEVER_BOOST.leadership)}
      + ${openSourceTextMatchExpr} * ${float8Param(RETRIEVER_BOOST.openSource)}
      + ${githubSourceMatchExpr} * ${float8Param(RETRIEVER_BOOST.githubSource)}
      + ${specializedGithubMatchExpr} * ${float8Param(RETRIEVER_BOOST.specializedGithub)}
      + ${nameMatchSignals.exactMatchExpr} * ${float8Param(RETRIEVER_BOOST.exactName)}
      + ${nameMatchSignals.prefixMatchExpr} * ${float8Param(RETRIEVER_BOOST.prefixName)}
    `;

    const rows = await this.db
      .select({
        personId: searchDocuments.personId,
        docText: searchDocuments.docText,
        roleMatch: roleMatchExpr,
        skillMatch: skillMatchExpr,
        skillTextMatch: skillTextMatchExpr,
        leadershipTextMatch: leadershipTextMatchExpr,
        openSourceTextMatch: openSourceTextMatchExpr,
        githubSourceMatch: githubSourceMatchExpr,
        specializedGithubMatch: specializedGithubMatchExpr,
        exactNameMatch: nameMatchSignals.exactMatchExpr,
        prefixNameMatch: nameMatchSignals.prefixMatchExpr,
        score: scoreExpr
      })
      .from(searchDocuments)
      .innerJoin(persons, eq(persons.id, searchDocuments.personId))
      .where(and(...buildFilterConditions(intent, filters), sql`(${sql.join(queryConditions, sql.raw(" OR "))})`))
      .orderBy(desc(keywordRankExpr))
      .limit(this.limit);

    return rows.map((row) => {
      const boostedScore = clampScore(
        row.score
        + row.roleMatch * RETRIEVER_BOOST.role
        + row.skillMatch * RETRIEVER_BOOST.skill
        + row.skillTextMatch * RETRIEVER_BOOST.skillText
        + row.leadershipTextMatch * RETRIEVER_BOOST.leadership
        + row.openSourceTextMatch * RETRIEVER_BOOST.openSource
        + row.githubSourceMatch * RETRIEVER_BOOST.githubSource
        + row.specializedGithubMatch * RETRIEVER_BOOST.specializedGithub
        + row.exactNameMatch * RETRIEVER_BOOST.exactName
        + row.prefixNameMatch * RETRIEVER_BOOST.prefixName
      );

      return {
        personId: row.personId,
        keywordScore: boostedScore,
        vectorScore: 0,
        combinedScore: boostedScore * this.keywordWeight,
        matchedText: toSnippet(row.docText)
      };
    });
  }

  async retrieveVector(
    queryEmbedding: number[],
    intent: QueryIntent,
    filters?: RetrieverFilters
  ): Promise<SearchResult[]> {
    if (queryEmbedding.length === 0) {
      return [];
    }

    const vector = `[${queryEmbedding.join(",")}]`;
    const normalizedDocText = normalizeSearchExpression(searchDocuments.docText);
    const dimensionMatches = buildDimensionMatchExpressions(intent, normalizedDocText);
    const dimensionMatchTotal = sql<number>`
      ${dimensionMatches.roleMatchExpr}
      + ${dimensionMatches.skillMatchExpr}
      + ${dimensionMatches.mustHaveMatchExpr}
    `;
    const dimensionCoverageExpr = dimensionMatches.dimensionCount >= 2
      ? sql<number>`
          ${float8Param(VECTOR_DIMENSION_MISS_PENALTY)}
          + LEAST(${dimensionMatchTotal}, ${dimensionMatches.dimensionCount}::double precision)
            / ${dimensionMatches.dimensionCount}::double precision
            * ${float8Param(VECTOR_DIMENSION_PARTIAL_WEIGHT)}
        `
      : sql<number>`1::double precision`;
    const vectorScoreExpr = sql<number>`1 - (${searchEmbeddings.embedding} <=> ${vector}::vector)`;
    const adjustedVectorScoreExpr = sql<number>`(${vectorScoreExpr}) * ${dimensionCoverageExpr}`;

    const rows = await this.db
      .select({
        personId: searchEmbeddings.personId,
        docText: searchDocuments.docText,
        score: adjustedVectorScoreExpr
      })
      .from(searchEmbeddings)
      .innerJoin(searchDocuments, eq(searchDocuments.personId, searchEmbeddings.personId))
      .innerJoin(persons, eq(persons.id, searchEmbeddings.personId))
      .where(and(...buildFilterConditions(intent, filters)))
      .orderBy(desc(adjustedVectorScoreExpr))
      .limit(this.limit);

    return rows.map((row) => {
      const score = clampScore(row.score);
      return {
        personId: row.personId,
        keywordScore: 0,
        vectorScore: score,
        combinedScore: score * this.vectorWeight,
        matchedText: toSnippet(row.docText)
      };
    });
  }

  private resolveBlendWeights(intent: QueryIntent): { keywordWeight: number; vectorWeight: number } {
    if (queryWantsSpecializedFocus(intent)) {
      if (!intent.sourceBias) {
        return {
          keywordWeight: SPECIALIZED_BLEND.withoutSourceBias.keyword,
          vectorWeight: SPECIALIZED_BLEND.withoutSourceBias.vector
        };
      }
      return {
        keywordWeight: SPECIALIZED_BLEND.withSourceBias.keyword,
        vectorWeight: SPECIALIZED_BLEND.withSourceBias.vector
      };
    }

    return { keywordWeight: this.keywordWeight, vectorWeight: this.vectorWeight };
  }

  private applyBlendWeights(
    results: SearchResult[],
    blendWeights: { keywordWeight: number; vectorWeight: number }
  ): SearchResult[] {
    return results
      .map((result) => ({
        ...result,
        combinedScore:
          result.keywordScore * blendWeights.keywordWeight
          + result.vectorScore * blendWeights.vectorWeight
      }))
      .sort((left, right) => right.combinedScore - left.combinedScore);
  }

  mergeResults(
    keywordResults: SearchResult[],
    vectorResults: SearchResult[],
    blendWeights: { keywordWeight: number; vectorWeight: number }
  ): SearchResult[] {
    const merged = new Map<string, SearchResult>();

    for (const result of keywordResults) {
      merged.set(result.personId, { ...result });
    }

    for (const result of vectorResults) {
      const existing = merged.get(result.personId);
      if (!existing) {
        merged.set(result.personId, { ...result });
        continue;
      }

      const keywordScore = Math.max(existing.keywordScore, result.keywordScore);
      const vectorScore = Math.max(existing.vectorScore, result.vectorScore);

      merged.set(result.personId, {
        personId: result.personId,
        keywordScore,
        vectorScore,
        combinedScore: keywordScore * blendWeights.keywordWeight + vectorScore * blendWeights.vectorWeight,
        matchedText: mergeMatchedText(existing.matchedText, result.matchedText)
      });
    }

    return this.applyBlendWeights([...merged.values()], blendWeights);
  }

  async retrieve(
    intent: QueryIntent,
    options: RetrieveOptions = {}
  ): Promise<SearchResult[]> {
    const blendWeights = this.resolveBlendWeights(intent);
    const keywordResults = await this.retrieveKeyword(intent, options.filters);
    let vectorResults: SearchResult[] = [];
    let vectorFailed = false;

    try {
      const embedding =
        options.embedding ??
        (await generateEmbedding(
          this.provider,
          buildKeywordQuery(intent) || intent.rawQuery,
          undefined,
          { signal: options.signal }
        ));
      vectorResults = await this.retrieveVector(embedding, intent, options.filters);
    } catch (error) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? error;
      }

      vectorFailed = true;
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[HybridRetriever] Vector retrieval failed, falling back to keyword-only results: ${reason}`);
      options.onWarning?.({
        code: "vector_search_failed",
        message: "向量检索失败，当前结果仅基于关键词匹配。",
        cause: reason
      });
    }

    if (!vectorFailed && vectorResults.length === 0 && keywordResults.length > 0) {
      options.onWarning?.({
        code: "vector_search_empty",
        message: "向量检索没有返回候选,可能 embedding 维度不匹配或语料未索引。"
      });
    }

    if (keywordResults.length === 0 && vectorResults.length === 0) {
      options.onWarning?.({
        code: "keyword_search_empty",
        message: "关键词和向量检索均无命中。"
      });
    }

    if (vectorResults.length === 0) {
      return this.applyBlendWeights(keywordResults, blendWeights).slice(0, this.limit);
    }

    return this.mergeResults(keywordResults, vectorResults, blendWeights).slice(0, this.limit);
  }
}

export async function retrieve(
  config: RetrieverConfig,
  intent: QueryIntent,
  options: RetrieveOptions = {}
): Promise<SearchResult[]> {
  const retriever = new HybridRetriever(config);
  return retriever.retrieve(intent, options);
}
