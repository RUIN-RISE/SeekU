---
phase: 03-search-embeddings
plan: 07
type: execute
wave: 4
depends_on: [03-03, 03-04, 03-05, 03-06]
files_modified:
  - apps/api/src/routes/search.ts
  - apps/api/src/index.ts
  - packages/workers/src/search-index-worker.ts
  - packages/workers/src/index.ts
autonomous: true
requirements: [SEARCH-01, DATA-07, DATA-08]
user_setup: []
must_haves:
  truths:
    - "POST /search endpoint accepts natural language query"
    - "Search returns ranked results with match reasons and evidence preview"
    - "Search index worker builds and updates search_documents"
    - "Embedding worker generates embeddings for new/updated documents"
  artifacts:
    - path: "apps/api/src/routes/search.ts"
      provides: "Search API endpoint"
      exports: ["searchRouter"]
    - path: "packages/workers/src/search-index-worker.ts"
      provides: "Background index building"
      exports: ["SearchIndexWorker"]
  key_links:
    - from: "apps/api/src/routes/search.ts"
      to: "packages/search/src/index.ts"
      via: "QueryPlanner, HybridRetriever, Reranker"
      pattern: "import { QueryPlanner, HybridRetriever, Reranker }"
    - from: "packages/workers/src/search-index-worker.ts"
      to: "packages/search/src/index-builder.ts"
      via: "buildSearchDocument"
      pattern: "import { buildSearchDocument }"
---

<objective>
Implement the POST /search API endpoint and worker integration for building and updating the search index. This connects all search components into a functional search pipeline.

Purpose: Expose search functionality via API (SEARCH-01) and integrate workers (DATA-07, DATA-08)
Output: Working search API and background index workers
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/03-search-embeddings/01-RESEARCH.md

<interfaces>
From packages/search/src/index.ts (Plans 03-06):
```typescript
export { QueryPlanner, QueryIntent, parseQuery } from "./planner.js";
export { HybridRetriever, SearchResult, createRetriever } from "./retriever.js";
export { Reranker, RerankResult, rerank } from "./reranker.js";
export { buildSearchDocument, buildAllSearchDocuments } from "./index-builder.js";
export { EmbeddingGenerator, generateSearchEmbedding, generateAllEmbeddings } from "./embedding-generator.js";
```

From packages/llm/src/index.ts:
```typescript
export { OpenAIProvider } from "./openai.js";
export type { LLMProvider } from "./provider.js";
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create POST /search API endpoint</name>
  <files>apps/api/src/routes/search.ts, apps/api/src/index.ts</files>
  <read_first>
    - packages/search/src/index.ts (all search module exports)
    - packages/llm/src/index.ts (OpenAIProvider)
    - apps/api/src/index.ts (current router setup)
  </read_first>
  <action>
Create apps/api/src/routes/search.ts:

```typescript
import { Hono } from "hono";
import { QueryPlanner, HybridRetriever, Reranker, type QueryIntent, type RerankResult } from "@seeku/search";
import { OpenAIProvider } from "@seeku/llm";
import { db } from "@seeku/db";
import { persons, evidenceItems, searchDocuments, searchEmbeddings } from "@seeku/db";
import { sql } from "drizzle-orm";

export const searchRouter = new Hono();

// Initialize providers (singleton pattern in production)
const llmProvider = new OpenAIProvider();
const queryPlanner = new QueryPlanner({ provider: llmProvider });
const retriever = new HybridRetriever({ limit: 50 });
const reranker = new Reranker();

interface SearchRequest {
  query: string;
  limit?: number;
  offset?: number;
  filters?: {
    locations?: string[];
    sources?: string[];
  };
}

interface SearchResponse {
  results: Array<{
    personId: string;
    name: string;
    headline: string | null;
    matchScore: number;
    matchReasons: string[];
    evidencePreview: Array<{
      type: string;
      title: string | null;
      stars?: number;
    }>;
  }>;
  total: number;
  intent: QueryIntent;
}

searchRouter.post("/", async (c) => {
  const body: SearchRequest = await c.req.json();

  // 1. Parse query to intent
  const intent = await queryPlanner.parse(body.query);

  // 2. Generate query embedding
  const queryEmbeddingResponse = await llmProvider.embed(intent.rawQuery);
  const queryEmbedding = queryEmbeddingResponse.embedding;

  // 3. Keyword search (pg_trgm)
  const keywordResults = await db
    .select({
      personId: searchDocuments.personId,
      score: sql<number>`similarity(${searchDocuments.docText}, ${intent.rawQuery})`
    })
    .from(searchDocuments)
    .where(sql`${searchDocuments.docText} % ${intent.rawQuery}`)
    .orderBy(sql`similarity(${searchDocuments.docText}, ${intent.rawQuery}) DESC`)
    .limit(50);

  // 4. Vector search (pgvector)
  const vectorString = `[${queryEmbedding.join(",")}]`;
  const vectorResults = await db
    .select({
      personId: searchEmbeddings.personId,
      score: sql<number>`1 - (${searchEmbeddings.embedding} <=> ${vectorString}::vector)`
    })
    .from(searchEmbeddings)
    .orderBy(sql`${searchEmbeddings.embedding} <=> ${vectorString}::vector ASC`)
    .limit(50);

  // 5. Merge results
  const mergedResults = retriever.mergeResults(
    keywordResults.map(r => ({ personId: r.personId, keywordScore: r.score, vectorScore: 0, combinedScore: r.score * 0.4, matchedText: "" })),
    vectorResults.map(r => ({ personId: r.personId, keywordScore: 0, vectorScore: r.score, combinedScore: r.score * 0.6, matchedText: "" }))
  );

  // 6. Load documents and evidence for reranking
  const personIds = mergedResults.map(r => r.personId);
  const docs = await db.select().from(searchDocuments).where(sql`${searchDocuments.personId} IN ${personIds}`);
  const evidence = await db.select().from(evidenceItems).where(sql`${evidenceItems.personId} IN ${personIds}`);

  const docMap = new Map(docs.map(d => [d.personId, d]));
  const evidenceMap = new Map<string, typeof evidence>();
  for (const e of evidence) {
    const arr = evidenceMap.get(e.personId) ?? [];
    arr.push(e);
    evidenceMap.set(e.personId, arr);
  }

  // 7. Rerank
  const reranked = reranker.rerank(mergedResults, intent, docMap, evidenceMap);

  // 8. Load person details and format response
  const topResults = reranked.slice(0, body.limit ?? 20);
  const personDetails = await db.select().from(persons).where(sql`${persons.id} IN ${topResults.map(r => r.personId)}`);
  const personMap = new Map(personDetails.map(p => [p.id, p]));

  const response: SearchResponse = {
    results: topResults.map(r => {
      const person = personMap.get(r.personId);
      const ev = evidenceMap.get(r.personId) ?? [];
      return {
        personId: r.personId,
        name: person?.primaryName ?? "Unknown",
        headline: person?.primaryHeadline ?? null,
        matchScore: r.finalScore,
        matchReasons: r.matchReasons,
        evidencePreview: ev.slice(0, 3).map(e => ({
          type: e.evidenceType,
          title: e.title,
          stars: e.metadata?.stargazers_count as number | undefined
        }))
      };
    }),
    total: reranked.length,
    intent
  };

  return c.json(response);
});
```

Update apps/api/src/index.ts to include search router:
```typescript
import { searchRouter } from "./routes/search.js";
// ... existing imports

app.route("/search", searchRouter);
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/api && pnpm build --filter=@seeku/api</automated>
  </verify>
  <done>
    - POST /search endpoint accepts query and returns results
    - Query parsed via QueryPlanner
    - Hybrid retrieval merges keyword + vector results
    - Reranker applies evidence weighting
    - Response includes match reasons and evidence preview
    - TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Task 2: Create search index and embedding workers</name>
  <files>packages/workers/src/search-index-worker.ts, packages/workers/src/index.ts</files>
  <read_first>
    - packages/search/src/index-builder.ts (buildSearchDocument)
    - packages/search/src/embedding-generator.ts (generateAllEmbeddings)
    - packages/workers/src/index.ts (existing worker exports)
    - packages/db/src/schema.ts (all relevant tables)
  </read_first>
  <action>
Create packages/workers/src/search-index-worker.ts:

```typescript
import { db } from "@seeku/db";
import { persons, evidenceItems, searchDocuments, searchEmbeddings } from "@seeku/db";
import { buildSearchDocument, generateAllEmbeddings, type SearchDocument } from "@seeku/search";
import { OpenAIProvider } from "@seeku/llm";
import { sql } from "drizzle-orm";

const llmProvider = new OpenAIProvider();

export interface IndexWorkerConfig {
  batchSize: number;
}

export class SearchIndexWorker {
  private config: IndexWorkerConfig;

  constructor(config?: Partial<IndexWorkerConfig>) {
    this.config = { batchSize: 100, ...config };
  }

  async runFullReindex(): Promise<{ documentsBuilt: number; embeddingsGenerated: number }> {
    // 1. Load all active persons
    const allPersons = await db
      .select()
      .from(persons)
      .where(sql`${persons.searchStatus} = 'active'`);

    // 2. Load all evidence for these persons
    const allEvidence = await db
      .select()
      .from(evidenceItems)
      .where(sql`${evidenceItems.personId} IN ${allPersons.map(p => p.id)}`);

    const evidenceByPerson = new Map<string, typeof allEvidence>();
    for (const e of allEvidence) {
      const arr = evidenceByPerson.get(e.personId) ?? [];
      arr.push(e);
      evidenceByPerson.set(e.personId, arr);
    }

    // 3. Build search documents
    const newDocs = allPersons.map(person =>
      buildSearchDocument({
        person,
        evidence: evidenceByPerson.get(person.id) ?? []
      })
    );

    // 4. Clear existing and insert new documents
    await db.delete(searchDocuments);
    await db.insert(searchDocuments).values(newDocs);

    // 5. Generate embeddings for all documents
    const embeddings = await generateAllEmbeddings(llmProvider, newDocs as SearchDocument[]);

    // 6. Clear existing and insert new embeddings
    await db.delete(searchEmbeddings);
    await db.insert(searchEmbeddings).values(embeddings);

    return {
      documentsBuilt: newDocs.length,
      embeddingsGenerated: embeddings.length
    };
  }

  async runIncrementalUpdate(personIds: string[]): Promise<{ updated: number }> {
    // Load specified persons and their evidence
    const updatedPersons = await db
      .select()
      .from(persons)
      .where(sql`${persons.id} IN ${personIds}`);

    const updatedEvidence = await db
      .select()
      .from(evidenceItems)
      .where(sql`${evidenceItems.personId} IN ${personIds}`);

    const evidenceByPerson = new Map<string, typeof updatedEvidence>();
    for (const e of updatedEvidence) {
      const arr = evidenceByPerson.get(e.personId) ?? [];
      arr.push(e);
      evidenceByPerson.set(e.personId, arr);
    }

    // Build and update documents
    const newDocs = updatedPersons.map(person =>
      buildSearchDocument({
        person,
        evidence: evidenceByPerson.get(person.id) ?? []
      })
    );

    // Upsert documents (delete then insert for simplicity)
    for (const doc of newDocs) {
      await db.delete(searchDocuments).where(sql`${searchDocuments.personId} = ${doc.personId}`);
      await db.insert(searchDocuments).values([doc]);
    }

    // Generate embeddings
    const embeddings = await generateAllEmbeddings(llmProvider, newDocs as SearchDocument[]);

    for (const emb of embeddings) {
      await db.delete(searchEmbeddings).where(sql`${searchEmbeddings.personId} = ${emb.personId}`);
      await db.insert(searchEmbeddings).values([emb]);
    }

    return { updated: newDocs.length };
  }
}

export function createSearchIndexWorker(config?: Partial<IndexWorkerConfig>): SearchIndexWorker {
  return new SearchIndexWorker(config);
}
```

Update packages/workers/src/index.ts:
```typescript
export * from "./search-index-worker.js";
// ... existing exports
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/workers && pnpm build --filter=@seeku/workers</automated>
  </verify>
  <done>
    - SearchIndexWorker class exists
    - runFullReindex builds all documents and embeddings
    - runIncrementalUpdate handles specific persons
    - Integration with search module for building and embedding
    - TypeScript compilation succeeds
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for all packages
2. Build passes for all packages
3. POST /search endpoint returns valid SearchResponse
4. Search index worker builds search_documents from persons + evidence
5. Embedding worker generates and stores embeddings
</verification>

<success_criteria>
1. POST /search endpoint accepts natural language queries (SEARCH-01)
2. Query parsing returns structured intent (SEARCH-02 verified)
3. Hybrid retrieval combines keyword + vector (SEARCH-03 verified)
4. Results reranked with evidence weighting (SEARCH-04 verified)
5. Worker builds search_documents from person data (DATA-07)
6. Worker generates embeddings for search (DATA-08)
7. All packages compile and build successfully
</success_criteria>

<output>
After completion, create `.planning/phases/03-search-embeddings/07-SUMMARY.md`
</output>