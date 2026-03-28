---
phase: 03-search-embeddings
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/db/src/schema.ts
  - packages/db/migrations/0004_search_tables.sql
autonomous: true
requirements: [DATA-07]
user_setup: []
must_haves:
  truths:
    - "search_documents table exists with person_id, doc_text, facets, and rank_features"
    - "search_embeddings table exists with person_id, embedding vector, and model metadata"
    - "pg_trgm GIN index exists on search_documents.doc_text"
    - "HNSW index exists on search_embeddings.embedding"
  artifacts:
    - path: "packages/db/src/schema.ts"
      provides: "Search tables schema definitions"
      exports: ["searchDocuments", "searchEmbeddings", "SearchDocument", "SearchEmbedding"]
    - path: "packages/db/migrations/0004_search_tables.sql"
      provides: "Database migration for search tables and indexes"
      contains: "CREATE TABLE search_documents"
  key_links:
    - from: "search_documents.person_id"
      to: "persons.id"
      via: "foreign key"
      pattern: "references persons(id)"
    - from: "search_embeddings.person_id"
      to: "persons.id"
      via: "foreign key"
      pattern: "references persons(id)"
---

<objective>
Extend the database schema with search infrastructure tables. Create search_documents for denormalized searchable content and search_embeddings for vector embeddings with appropriate indexes for hybrid search.

Purpose: Foundation for natural language search with keyword + vector retrieval
Output: Database tables and indexes ready for search document population
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/03-search-embeddings/01-RESEARCH.md

<interfaces>
<!-- Key types from existing schema that executor needs -->

From packages/db/src/schema.ts:
```typescript
export const persons = pgTable("persons", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  primaryName: text("primary_name").notNull(),
  primaryHeadline: text("primary_headline"),
  summary: text("summary"),
  primaryLocation: text("primary_location"),
  avatarUrl: text("avatar_url"),
  searchStatus: searchStatus("search_status").default("active").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const evidenceItems = pgTable("evidence_items", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  evidenceType: evidenceType("evidence_type").notNull(),
  title: text("title"),
  description: text("description"),
  url: text("url"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull()
});
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add search_documents and search_embeddings tables to schema</name>
  <files>packages/db/src/schema.ts</files>
  <read_first>
    - packages/db/src/schema.ts (existing schema for pattern reference)
  </read_first>
  <action>
Extend packages/db/src/schema.ts with search tables following Drizzle ORM patterns:

1. Add search_documents table:
```typescript
export const searchDocuments = pgTable("search_documents", {
  personId: uuid("person_id")
    .notNull()
    .references(() => persons.id, { onDelete: "cascade" })
    .primaryKey(),
  docText: text("doc_text").notNull(),
  facetRole: text("facet_role").array().notNull().default(sql`'{}'::text[]`),
  facetLocation: text("facet_location").array().notNull().default(sql`'{}'::text[]`),
  facetSource: text("facet_source").array().notNull().default(sql`'{}'::text[]`),
  facetTags: text("facet_tags").array().notNull().default(sql`'{}'::text[]`),
  rankFeatures: jsonb("rank_features")
    .$type<{
      evidenceCount: number;
      projectCount: number;
      repoCount: number;
      followerCount: number;
      freshness: number;
    }>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
```

2. Add search_embeddings table:
```typescript
export const searchEmbeddings = pgTable("search_embeddings", {
  personId: uuid("person_id")
    .notNull()
    .references(() => persons.id, { onDelete: "cascade" })
    .primaryKey(),
  embedding: text("embedding").notNull(), // Will be vector(1536) via raw SQL
  embeddingModel: text("embedding_model").notNull(),
  embeddedAt: timestamp("embedded_at", { withTimezone: true }).defaultNow().notNull()
});
```

3. Add type exports:
```typescript
export type SearchDocument = typeof searchDocuments.$inferSelect;
export type NewSearchDocument = typeof searchDocuments.$inferInsert;
export type SearchEmbedding = typeof searchEmbeddings.$inferSelect;
export type NewSearchEmbedding = typeof searchEmbeddings.$inferInsert;
```

Note: Using text for embedding column temporarily - migration will create proper vector(1536) type.
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/db</automated>
  </verify>
  <done>
    - searchDocuments table schema exists with doc_text, facet arrays, rank_features
    - searchEmbeddings table schema exists with embedding column
    - TypeScript type exports added
    - TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Task 2: Create migration for search tables with pgvector and pg_trgm indexes</name>
  <files>packages/db/migrations/0004_search_tables.sql</files>
  <read_first>
    - packages/db/src/schema.ts (schema definitions from Task 1)
    - packages/db/migrations/ (existing migrations for pattern reference)
  </read_first>
  <action>
Create packages/db/migrations/0004_search_tables.sql:

```sql
-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS search_embeddings CASCADE;
DROP TABLE IF EXISTS search_documents CASCADE;

-- Create search_documents table
CREATE TABLE search_documents (
  person_id UUID PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
  doc_text TEXT NOT NULL,
  facet_role TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  facet_location TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  facet_source TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  facet_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  rank_features JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create search_embeddings table with vector column
CREATE TABLE search_embeddings (
  person_id UUID PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
  embedding VECTOR(1536) NOT NULL,
  embedding_model TEXT NOT NULL,
  embedded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIN index for pg_trgm keyword search on doc_text
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_search_documents_doc_trgm ON search_documents USING GIN (doc_text gin_trgm_ops);

-- GIN indexes for array facets
CREATE INDEX idx_search_documents_facet_role ON search_documents USING GIN (facet_role);
CREATE INDEX idx_search_documents_facet_location ON search_documents USING GIN (facet_location);
CREATE INDEX idx_search_documents_facet_source ON search_documents USING GIN (facet_source);
CREATE INDEX idx_search_documents_facet_tags ON search_documents USING GIN (facet_tags);

-- HNSW index for vector cosine similarity search
CREATE INDEX idx_search_embeddings_hnsw ON search_embeddings USING hnsw (embedding vector_cosine_ops);

-- Index on updated_at for freshness queries
CREATE INDEX idx_search_documents_updated_at ON search_documents (updated_at DESC);
```

This migration creates:
- Proper vector(1536) column type for embeddings
- pg_trgm GIN index for full-text keyword search
- GIN indexes for array facets (role, location, source, tags)
- HNSW index for vector similarity search
  </action>
  <verify>
    <automated>cat packages/db/migrations/0004_search_tables.sql | grep -E "CREATE TABLE|CREATE INDEX|VECTOR|gin_trgm"</automated>
  </verify>
  <done>
    - Migration file exists with CREATE TABLE statements for both tables
    - vector(1536) column type specified for embedding
    - pg_trgm GIN index created on doc_text
    - HNSW index created on embedding column
    - Facet array GIN indexes created
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/db
2. Migration SQL contains all required tables and indexes
3. Schema exports include SearchDocument and SearchEmbedding types
</verification>

<success_criteria>
1. search_documents table schema defined with doc_text, facets, rank_features
2. search_embeddings table schema defined with vector(1536) embedding column
3. pg_trgm GIN index migration ready for keyword search
4. HNSW index migration ready for vector similarity search
5. TypeScript compilation succeeds (DATA-07 foundation complete)
</success_criteria>

<output>
After completion, create `.planning/phases/03-search-embeddings/01-SUMMARY.md`
</output>