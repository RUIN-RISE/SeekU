import { and, desc, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { SeekuDatabase, SearchDocument } from "@seeku/db";
import { persons, searchDocuments, searchEmbeddings } from "@seeku/db";
import type { LLMProvider } from "@seeku/llm";
import { generateEmbedding } from "@seeku/llm";

import type { QueryIntent } from "./planner.js";

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

function uniqueLowercase(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
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

function buildMustHaveConditions(intent: QueryIntent): SQL[] {
  return intent.mustHaves
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => sql`${searchDocuments.docText} ILIKE ${`%${term}%`}`);
}

function buildFilterConditions(intent: QueryIntent, filters?: RetrieverFilters): SQL[] {
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

  // Source filter: TEMPORARILY DISABLED as facetSource is mostly empty
  // TODO: Re-enable when facetSource coverage improves
  // if (sources.length > 0) {
  //   conditions.push(sql`${searchDocuments.facetSource} && ${toTextArray(sources)}`);
  // }

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
  const parts = [
    intent.rawQuery,
    ...intent.roles,
    ...intent.skills,
    ...intent.mustHaves,
    ...intent.niceToHaves
  ];

  return uniqueLowercase(parts).join(" ");
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
    if (!keywordQuery) {
      return [];
    }

    const queryConditions: SQL[] = [
      sql`similarity(${searchDocuments.docText}, ${keywordQuery}) > ${DEFAULT_KEYWORD_THRESHOLD}`
    ];

    if (intent.roles.length > 0) {
      queryConditions.push(sql`${searchDocuments.facetRole} && ${toTextArray(intent.roles)}`);
    }

    if (intent.skills.length > 0) {
      queryConditions.push(sql`${searchDocuments.facetTags} && ${toTextArray(intent.skills)}`);
    }

    const rows = await this.db
      .select({
        personId: searchDocuments.personId,
        docText: searchDocuments.docText,
        roleMatch: sql<number>`CASE WHEN ${searchDocuments.facetRole} && ${toTextArray(
          intent.roles.length > 0 ? intent.roles : ["__none__"]
        )} THEN 1 ELSE 0 END`,
        skillMatch: sql<number>`CASE WHEN ${searchDocuments.facetTags} && ${toTextArray(
          intent.skills.length > 0 ? intent.skills : ["__none__"]
        )} THEN 1 ELSE 0 END`,
        score: sql<number>`similarity(${searchDocuments.docText}, ${keywordQuery})`
      })
      .from(searchDocuments)
      .innerJoin(persons, eq(persons.id, searchDocuments.personId))
      .where(and(...buildFilterConditions(intent, filters), sql`(${sql.join(queryConditions, sql.raw(" OR "))})`))
      .orderBy(desc(sql`similarity(${searchDocuments.docText}, ${keywordQuery})`))
      .limit(this.limit);

    return rows.map((row) => {
      const boostedScore = clampScore(row.score + row.roleMatch * 0.08 + row.skillMatch * 0.12);

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

  mergeResults(keywordResults: SearchResult[], vectorResults: SearchResult[]): SearchResult[] {
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
        combinedScore: keywordScore * this.keywordWeight + vectorScore * this.vectorWeight,
        matchedText: mergeMatchedText(existing.matchedText, result.matchedText)
      });
    }

    return [...merged.values()].sort((left, right) => right.combinedScore - left.combinedScore);
  }

  async retrieve(
    intent: QueryIntent,
    options: { filters?: RetrieverFilters; embedding?: number[] } = {}
  ): Promise<SearchResult[]> {
    const embedding =
      options.embedding ?? (await generateEmbedding(this.provider, buildKeywordQuery(intent) || intent.rawQuery));
    const [keywordResults, vectorResults] = await Promise.all([
      this.retrieveKeyword(intent, options.filters),
      this.retrieveVector(embedding, intent, options.filters)
    ]);

    return this.mergeResults(keywordResults, vectorResults).slice(0, this.limit);
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
