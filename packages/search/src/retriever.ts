import { and, desc, eq, sql } from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";

import type { SeekuDatabase, SearchDocument } from "@seeku/db";
import { persons, searchDocuments, searchEmbeddings } from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { generateEmbedding } from "@seeku/llm";

import type { QueryIntent } from "./planner.js";
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

const DEFAULT_KEYWORD_WEIGHT = 0.4;
const DEFAULT_VECTOR_WEIGHT = 0.6;
const DEFAULT_LIMIT = 50;
const DEFAULT_KEYWORD_THRESHOLD = 0.08;
const SPECIALIZED_QUERY_TERMS = [
  "rag",
  "retrieval",
  "检索",
  "multimodal",
  "multi-modal",
  "多模态",
  "computer vision",
  "计算机视觉",
  "llm"
] as const;
const SHORT_TECH_TERMS = ["rag", "llm", "nlp", "cv"] as const;
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
  "tech lead": ["tech lead", "technical lead", "技术负责人", "负责人"],
  engineer: ["engineer", "工程师", "ai工程师", "后端工程师"],
  "backend engineer": ["backend engineer", "backend", "后端", "后端工程师", "工程师"],
  developer: ["developer", "开发者", "工程师"],
  founder: ["founder", "创始人", "联合创始人", "co-founder", "cofounder"],
  researcher: ["researcher", "研究员", "研究者", "ai研究员"],
  scientist: ["scientist", "科学家"],
  "product manager": ["product manager", "product", "pm", "产品经理"],
  designer: ["designer", "设计师", "视觉设计"],
  manager: ["manager", "经理"],
};

const SKILL_EQUIVALENTS: Record<string, string[]> = {
  "machine learning": ["machine learning", "ml"],
  backend: ["backend", "后端"],
  infra: ["infra", "infrastructure", "系统优化", "devops"],
  multimodal: ["multimodal", "multi-modal", "多模态"],
  "computer vision": ["computer vision", "cv", "计算机视觉"],
  retrieval: ["retrieval", "检索"],
  "open source": ["open source", "open-source", "开源"],
  agent: ["agent", "智能体"],
  ai: ["ai", "人工智能"],
  llm: ["llm", "大模型"],
  rag: ["rag"],
  nlp: ["nlp", "自然语言处理"],
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
  china: ["中国", "china"],
  singapore: ["新加坡", "singapore"],
  杭州: ["杭州", "hangzhou"],
  北京: ["北京", "beijing"],
  上海: ["上海", "shanghai"],
  深圳: ["深圳", "shenzhen"],
  广州: ["广州", "guangzhou"],
  中国: ["中国", "china"],
  新加坡: ["新加坡", "singapore"]
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
      exactMatchExpr: sql<number>`0`,
      prefixMatchExpr: sql<number>`0`
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
    exactMatchExpr: sql<number>`CASE WHEN ${exactCondition} THEN 1 ELSE 0 END`,
    prefixMatchExpr: prefixCondition
      ? sql<number>`CASE WHEN ${prefixCondition} THEN 1 ELSE 0 END`
      : sql<number>`0`
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
    const roleMatchExpr = sql<number>`CASE WHEN ${searchDocuments.facetRole} && ${toTextArray(
      expandedRoles.length > 0 ? expandedRoles : ["__none__"]
    )} THEN 1 ELSE 0 END`;
    const skillMatchExpr = sql<number>`CASE WHEN ${searchDocuments.facetTags} && ${toTextArray(
      expandedSkills.length > 0 ? expandedSkills : ["__none__"]
    )} THEN 1 ELSE 0 END`;
    const scoreExpr = sql<number>`similarity(${normalizedDocText}, ${keywordQuery})`;
    const githubSourceCondition = keywordSignals.wantsOpenSource
      ? sql`${searchDocuments.facetSource} && ${toTextArray(["github"])}`
      : null;
    const skillTextCondition = buildTextMatchCondition(expandedSkills, normalizedDocText);
    const leadershipTextCondition = buildTextMatchCondition(keywordSignals.leadershipTextTerms, normalizedDocText);
    const openSourceTextCondition = buildTextMatchCondition(keywordSignals.openSourceTextTerms, normalizedDocText);
    const skillTextMatchExpr = skillTextCondition
      ? sql<number>`CASE WHEN ${skillTextCondition} THEN 1 ELSE 0 END`
      : sql<number>`0`;
    const leadershipTextMatchExpr = leadershipTextCondition
      ? sql<number>`CASE WHEN ${leadershipTextCondition} THEN 1 ELSE 0 END`
      : sql<number>`0`;
    const openSourceTextMatchExpr = openSourceTextCondition
      ? sql<number>`CASE WHEN ${openSourceTextCondition} THEN 1 ELSE 0 END`
      : sql<number>`0`;
    const githubSourceMatchExpr = githubSourceCondition
      ? sql<number>`CASE WHEN ${githubSourceCondition} THEN 1 ELSE 0 END`
      : sql<number>`0`;
    const specializedGithubCondition = wantsSpecializedFocus && skillTextCondition
      ? sql`(${searchDocuments.facetSource} && ${toTextArray(["github"])} AND ${skillTextCondition})`
      : null;
    const specializedGithubMatchExpr = specializedGithubCondition
      ? sql<number>`CASE WHEN ${specializedGithubCondition} THEN 1 ELSE 0 END`
      : sql<number>`0`;

    const queryConditions: SQL[] = [
      sql`${scoreExpr} > ${DEFAULT_KEYWORD_THRESHOLD}`
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
      + ${roleMatchExpr} * 0.08
      + ${skillMatchExpr} * 0.12
      + ${skillTextMatchExpr} * 0.10
      + ${leadershipTextMatchExpr} * 0.08
      + ${openSourceTextMatchExpr} * 0.18
      + ${githubSourceMatchExpr} * 0.06
      + ${specializedGithubMatchExpr} * 0.12
      + ${nameMatchSignals.exactMatchExpr} * 0.45
      + ${nameMatchSignals.prefixMatchExpr} * 0.18
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
        + row.roleMatch * 0.08
        + row.skillMatch * 0.12
        + row.skillTextMatch * 0.10
        + row.leadershipTextMatch * 0.08
        + row.openSourceTextMatch * 0.18
        + row.githubSourceMatch * 0.06
        + row.specializedGithubMatch * 0.12
        + row.exactNameMatch * 0.45
        + row.prefixNameMatch * 0.18
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
    const rows = await this.db
      .select({
        personId: searchEmbeddings.personId,
        docText: searchDocuments.docText,
        score: sql<number>`1 - (${searchEmbeddings.embedding} <=> ${vector}::vector)`
      })
      .from(searchEmbeddings)
      .innerJoin(searchDocuments, eq(searchDocuments.personId, searchEmbeddings.personId))
      .innerJoin(persons, eq(persons.id, searchEmbeddings.personId))
      .where(and(...buildFilterConditions(intent, filters)))
      .orderBy(sql`${searchEmbeddings.embedding} <=> ${vector}::vector`)
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
        return { keywordWeight: 0.85, vectorWeight: 0.15 };
      }
      return { keywordWeight: 0.58, vectorWeight: 0.42 };
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
    options: { filters?: RetrieverFilters; embedding?: number[] } = {}
  ): Promise<SearchResult[]> {
    const blendWeights = this.resolveBlendWeights(intent);
    const keywordResults = await this.retrieveKeyword(intent, options.filters);
    let vectorResults: SearchResult[] = [];

    try {
      const embedding =
        options.embedding ?? (await generateEmbedding(this.provider, buildKeywordQuery(intent) || intent.rawQuery));
      vectorResults = await this.retrieveVector(embedding, intent, options.filters);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[HybridRetriever] Vector retrieval failed, falling back to keyword-only results: ${reason}`);
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
  options: { filters?: RetrieverFilters; embedding?: number[] } = {}
): Promise<SearchResult[]> {
  const retriever = new HybridRetriever(config);
  return retriever.retrieve(intent, options);
}
