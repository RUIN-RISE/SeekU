---
phase: 03-search-embeddings
plan: 04
type: execute
wave: 2
depends_on: [03-01, 03-02]
files_modified:
  - packages/search/src/embedding-generator.ts
  - packages/search/src/index.ts
autonomous: true
requirements: [DATA-08]
user_setup: []
must_haves:
  truths:
    - "Embeddings are generated for search documents using OpenAI text-embedding-3-small"
    - "Embeddings stored in search_embeddings table with vector(1536) type"
    - "Batch embedding generation handles multiple documents efficiently"
    - "Embedding timestamps tracked for freshness monitoring"
  artifacts:
    - path: "packages/search/src/embedding-generator.ts"
      provides: "Embedding generation and storage"
      exports: ["generateSearchEmbedding", "generateAllEmbeddings", "EmbeddingGenerator"]
  key_links:
    - from: "packages/search/src/embedding-generator.ts"
      to: "packages/llm/src/embeddings.ts"
      via: "generateEmbeddings function"
      pattern: "import { generateEmbeddings }"
    - from: "packages/search/src/embedding-generator.ts"
      to: "packages/db/src/schema.ts"
      via: "searchEmbeddings table"
      pattern: "import { searchEmbeddings }"
---

<objective>
Create the embedding generator that produces and stores vector embeddings for search documents. This enables semantic similarity search using pgvector.

Purpose: Generate embeddings for all search documents (DATA-08)
Output: Embedding generator module integrated with LLM provider and database
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/03-search-embeddings/01-RESEARCH.md

<interfaces>
From packages/llm/src/index.ts (Plan 02):
```typescript
export interface LLMProvider {
  embed(text: string): Promise<EmbeddingResponse>;
  embedBatch(texts: string[]): Promise<EmbeddingResponse[]>;
}

export class OpenAIProvider implements LLMProvider { ... }
export function generateEmbedding(provider: LLMProvider, text: string): Promise<number[]>;
export function generateEmbeddings(provider: LLMProvider, texts: string[]): Promise<number[][]>;
```

From packages/db/src/schema.ts (Plan 01):
```typescript
export type NewSearchEmbedding = typeof searchEmbeddings.$inferInsert;
// searchEmbeddings has: personId, embedding (vector), embeddingModel, embeddedAt
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create embedding generator with batch processing</name>
  <files>packages/search/src/embedding-generator.ts, packages/search/src/index.ts</files>
  <read_first>
    - packages/llm/src/embeddings.ts (generateEmbeddings)
    - packages/llm/src/provider.ts (LLMProvider interface)
    - packages/db/src/schema.ts (NewSearchEmbedding type)
  </read_first>
  <action>
Create packages/search/src/embedding-generator.ts:

```typescript
import type { LLMProvider } from "@seeku/llm";
import { generateEmbeddings } from "@seeku/llm";
import type { SearchDocument, NewSearchEmbedding } from "@seeku/db";

const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 100; // OpenAI batch limit

export interface EmbeddingGeneratorConfig {
  provider: LLMProvider;
  batchSize?: number;
}

export class EmbeddingGenerator {
  private provider: LLMProvider;
  private batchSize: number;

  constructor(config: EmbeddingGeneratorConfig) {
    this.provider = config.provider;
    this.batchSize = config.batchSize ?? BATCH_SIZE;
  }

  async generateForDocument(doc: SearchDocument): Promise<number[]> {
    return generateEmbeddings(this.provider, [doc.docText])[0];
  }

  async generateForDocuments(docs: SearchDocument[]): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();

    // Process in batches
    for (let i = 0; i < docs.length; i += this.batchSize) {
      const batch = docs.slice(i, i + this.batchSize);
      const texts = batch.map(d => d.docText);

      const embeddings = await generateEmbeddings(this.provider, texts);

      for (let j = 0; j < batch.length; j++) {
        results.set(batch[j].personId, embeddings[j]);
      }
    }

    return results;
  }

  toDatabaseEmbedding(personId: string, embedding: number[]): NewSearchEmbedding {
    // Convert array to PostgreSQL vector string format
    const vectorString = `[${embedding.join(",")}]`;

    return {
      personId,
      embedding: vectorString,
      embeddingModel: EMBEDDING_MODEL,
      embeddedAt: new Date()
    };
  }

  async generateAllForDatabase(
    docs: SearchDocument[]
  ): Promise<NewSearchEmbedding[]> {
    const embeddings = await this.generateForDocuments(docs);
    return docs.map(doc => this.toDatabaseEmbedding(doc.personId, embeddings.get(doc.personId)!));
  }
}

// Convenience functions for one-off usage
export async function generateSearchEmbedding(
  provider: LLMProvider,
  doc: SearchDocument
): Promise<NewSearchEmbedding> {
  const generator = new EmbeddingGenerator({ provider });
  const embedding = await generator.generateForDocument(doc);
  return generator.toDatabaseEmbedding(doc.personId, embedding);
}

export async function generateAllEmbeddings(
  provider: LLMProvider,
  docs: SearchDocument[]
): Promise<NewSearchEmbedding[]> {
  const generator = new EmbeddingGenerator({ provider });
  return generator.generateAllForDatabase(docs);
}
```

Update packages/search/src/index.ts to export:
```typescript
export * from "./index-builder.js";
export * from "./embedding-generator.js";
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/search && pnpm build --filter=@seeku/search</automated>
  </verify>
  <done>
    - EmbeddingGenerator class exists with batch processing
    - generateForDocuments processes docs in configurable batches
    - toDatabaseEmbedding converts array to PostgreSQL vector string format
    - Convenience functions exported
    - TypeScript compilation succeeds
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/search
2. Build passes for @seeku/search
3. EmbeddingGenerator produces valid NewSearchEmbedding
4. Batch processing handles 100+ documents efficiently
</verification>

<success_criteria>
1. Embedding generator produces 1536-dimensional vectors (DATA-08)
2. Embeddings stored with PostgreSQL vector format
3. Batch processing respects OpenAI API limits
4. Model and timestamp tracked for freshness monitoring
5. All packages compile and build successfully
</success_criteria>

<output>
After completion, create `.planning/phases/03-search-embeddings/04-SUMMARY.md`
</output>