---
phase: 03-search-embeddings
plan: 05
type: execute
wave: 3
depends_on: [03-01, 03-02]
files_modified:
  - packages/search/src/planner.ts
  - packages/search/src/retriever.ts
  - packages/search/src/index.ts
autonomous: true
requirements: [SEARCH-02, SEARCH-03]
user_setup: []
must_haves:
  truths:
    - "Natural language queries are parsed to structured QueryIntent"
    - "Query planner extracts roles, skills, locations, and must-have terms"
    - "Hybrid retrieval combines pg_trgm keyword search and pgvector similarity"
    - "Results merged from keyword and vector search with combined scores"
  artifacts:
    - path: "packages/search/src/planner.ts"
      provides: "LLM-based query intent parsing"
      exports: ["QueryIntent", "QueryPlanner", "parseQuery"]
    - path: "packages/search/src/retriever.ts"
      provides: "Hybrid keyword + vector retrieval"
      exports: ["HybridRetriever", "SearchResult", "retrieve"]
  key_links:
    - from: "packages/search/src/planner.ts"
      to: "packages/llm/src/provider.ts"
      via: "LLMProvider.chat"
      pattern: "provider.chat(messages)"
    - from: "packages/search/src/retriever.ts"
      to: "packages/db/src/schema.ts"
      via: "search_documents, search_embeddings"
      pattern: "sql queries with pg_trgm and vector"
---

<objective>
Implement the query planner for natural language parsing and the hybrid retriever for combining keyword and vector search. This enables semantic understanding and multi-modal retrieval.

Purpose: Parse queries to structured intent (SEARCH-02) and retrieve via hybrid search (SEARCH-03)
Output: Query planner and hybrid retriever modules
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/03-search-embeddings/01-RESEARCH.md

<interfaces>
From packages/llm/src/provider.ts (Plan 02):
```typescript
export interface LLMProvider {
  chat(messages: ChatMessage[], options?: { model?: string; temperature?: number }): Promise<ChatResponse>;
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create query planner for natural language parsing</name>
  <files>packages/search/src/planner.ts, packages/search/src/index.ts</files>
  <read_first>
    - packages/llm/src/provider.ts (LLMProvider interface)
    - packages/llm/src/openai.ts (OpenAIProvider)
  </read_first>
  <action>
Create packages/search/src/planner.ts for LLM-based query parsing:

```typescript
import type { LLMProvider, ChatMessage } from "@seeku/llm";

export interface QueryIntent {
  rawQuery: string;
  roles: string[];
  skills: string[];
  locations: string[];
  experienceLevel?: string;
  sourceBias?: string;
  mustHaves: string[];
  niceToHaves: string[];
}

const QUERY_PLANNER_PROMPT = `You are a query parser for an AI talent search engine.
Parse the user's natural language query into structured search intent.

Extract:
1. Roles - job titles or positions mentioned (e.g., "engineer", "founder", "CTO")
2. Skills - technologies, domains, or expertise areas (e.g., "machine learning", "python", "nlp")
3. Locations - cities, countries, or regions (e.g., "beijing", "shanghai", "china")
4. Experience level hints - junior, senior, lead, etc.
5. Source preferences - github, bonjour, etc.
6. Must-have terms - explicit requirements (e.g., "must have", "required")
7. Nice-to-have terms - preferences but not required

Return ONLY a JSON object with these fields:
{
  "roles": [],
  "skills": [],
  "locations": [],
  "experienceLevel": null,
  "sourceBias": null,
  "mustHaves": [],
  "niceToHaves": []
}

Be concise - only include terms that are explicitly mentioned or clearly implied.`;

export interface QueryPlannerConfig {
  provider: LLMProvider;
  model?: string;
}

export class QueryPlanner {
  private provider: LLMProvider;
  private model: string;

  constructor(config: QueryPlannerConfig) {
    this.provider = config.provider;
    this.model = config.model ?? "gpt-4o-mini";
  }

  async parse(query: string): Promise<QueryIntent> {
    const messages: ChatMessage[] = [
      { role: "system", content: QUERY_PLANNER_PROMPT },
      { role: "user", content: `Parse this query: "${query}"` }
    ];

    const response = await this.provider.chat(messages, {
      model: this.model,
      temperature: 0
    });

    const parsed = this.parseJsonResponse(response.content);

    return {
      rawQuery: query,
      roles: parsed.roles ?? [],
      skills: parsed.skills ?? [],
      locations: parsed.locations ?? [],
      experienceLevel: parsed.experienceLevel,
      sourceBias: parsed.sourceBias,
      mustHaves: parsed.mustHaves ?? [],
      niceToHaves: parsed.niceToHaves ?? []
    };
  }

  private parseJsonResponse(content: string): Record<string, unknown> {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {};
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return {};
    }
  }
}

export async function parseQuery(provider: LLMProvider, query: string): Promise<QueryIntent> {
  const planner = new QueryPlanner({ provider });
  return planner.parse(query);
}
```

Update packages/search/src/index.ts:
```typescript
export * from "./index-builder.js";
export * from "./embedding-generator.js";
export * from "./planner.js";
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/search</automated>
  </verify>
  <done>
    - QueryIntent interface defines structured search intent
    - QueryPlanner class uses LLM to parse natural language
    - parseQuery convenience function exported
    - TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Task 2: Create hybrid retriever for keyword + vector search</name>
  <files>packages/search/src/retriever.ts, packages/search/src/index.ts</files>
  <read_first>
    - packages/search/src/planner.ts (QueryIntent type)
    - packages/db/src/schema.ts (SearchDocument, SearchEmbedding types)
  </read_first>
  <action>
Create packages/search/src/retriever.ts for hybrid retrieval:

```typescript
import { sql } from "drizzle-orm";
import type { QueryIntent } from "./planner.js";

export interface SearchResult {
  personId: string;
  keywordScore: number;
  vectorScore: number;
  combinedScore: number;
  matchedText: string;
}

export interface RetrieverConfig {
  keywordWeight: number;
  vectorWeight: number;
  limit: number;
}

const DEFAULT_CONFIG: RetrieverConfig = {
  keywordWeight: 0.4,
  vectorWeight: 0.6,
  limit: 50
};

export class HybridRetriever {
  private config: RetrieverConfig;

  constructor(config?: Partial<RetrieverConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // These methods will be implemented with actual DB queries
  // For now, define the interface and structure

  async retrieveKeyword(queryIntent: QueryIntent): Promise<SearchResult[]> {
    // Build keyword search query:
    // 1. Must-have terms as AND conditions
    // 2. Roles/skills/nice-to-haves as OR boost
    // 3. Use pg_trgm similarity for matching

    // SQL structure (to be implemented with drizzle):
    // SELECT person_id, similarity(doc_text, query) as score
    // FROM search_documents
    // WHERE doc_text % query (pg_trgm operator)
    // ORDER BY score DESC LIMIT limit

    // Placeholder for now - actual implementation needs DB connection
    return [];
  }

  async retrieveVector(embedding: number[]): Promise<SearchResult[]> {
    // Build vector similarity query:
    // SELECT person_id, 1 - (embedding <=> query_vector) as score
    // FROM search_embeddings
    // ORDER BY embedding <=> query_vector ASC LIMIT limit

    // Placeholder for now - actual implementation needs DB connection
    return [];
  }

  async retrieve(
    queryIntent: QueryIntent,
    queryEmbedding: number[]
  ): Promise<SearchResult[]> {
    const [keywordResults, vectorResults] = await Promise.all([
      this.retrieveKeyword(queryIntent),
      this.retrieveVector(queryEmbedding)
    ]);

    // Merge results by person_id
    const merged = this.mergeResults(keywordResults, vectorResults);

    // Sort by combined score
    return merged.sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, this.config.limit);
  }

  private mergeResults(
    keyword: SearchResult[],
    vector: SearchResult[]
  ): SearchResult[] {
    const byPersonId = new Map<string, SearchResult>();

    // Add keyword results
    for (const r of keyword) {
      byPersonId.set(r.personId, {
        personId: r.personId,
        keywordScore: r.keywordScore,
        vectorScore: 0,
        combinedScore: r.keywordScore * this.config.keywordWeight,
        matchedText: r.matchedText
      });
    }

    // Merge vector results
    for (const r of vector) {
      const existing = byPersonId.get(r.personId);
      if (existing) {
        existing.vectorScore = r.vectorScore;
        existing.combinedScore =
          existing.keywordScore * this.config.keywordWeight +
          r.vectorScore * this.config.vectorWeight;
      } else {
        byPersonId.set(r.personId, {
          personId: r.personId,
          keywordScore: 0,
          vectorScore: r.vectorScore,
          combinedScore: r.vectorScore * this.config.vectorWeight,
          matchedText: r.matchedText
        });
      }
    }

    return Array.from(byPersonId.values());
  }
}

export function createRetriever(config?: Partial<RetrieverConfig>): HybridRetriever {
  return new HybridRetriever(config);
}
```

Update packages/search/src/index.ts:
```typescript
export * from "./index-builder.js";
export * from "./embedding-generator.js";
export * from "./planner.js";
export * from "./retriever.js";
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/search</automated>
  </verify>
  <done>
    - SearchResult interface defined with combined scores
    - HybridRetriever class structure for keyword + vector merge
    - retrieve method combines parallel retrieval
    - Score merging with configurable weights (0.4 keyword + 0.6 vector)
    - TypeScript compilation succeeds
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/search
2. QueryIntent has all required fields (roles, skills, locations, mustHaves)
3. HybridRetriever defines keyword and vector score merging
4. Configurable weights for retrieval combination
</verification>

<success_criteria>
1. Query planner parses natural language to structured intent (SEARCH-02)
2. Hybrid retriever combines keyword and vector search (SEARCH-03)
3. 0.4 keyword + 0.6 vector weight default for balanced retrieval
4. Results merged by person_id with combined scores
5. All packages compile successfully
</success_criteria>

<output>
After completion, create `.planning/phases/03-search-embeddings/05-SUMMARY.md`
</output>