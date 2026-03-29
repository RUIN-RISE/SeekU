---
phase: 03-search-embeddings
plan: 01
status: complete
completed_at: 2026-03-29
---

# Plan 01: Schema Extension for Search

## Summary

Extended the database schema with search infrastructure tables:
- `search_documents`: Denormalized searchable content with facets and rank features
- `search_embeddings`: Vector embeddings with HNSW index for similarity search

## Files Created/Modified

- `packages/db/src/schema.ts` - Added searchDocuments and searchEmbeddings tables
- `packages/db/migrations/0004_search_tables.sql` - Migration with pgvector and pg_trgm indexes

## Key Decisions

1. **Vector dimension**: 4096 (Qwen3-Embedding-8B) instead of 1536 (OpenAI)
2. **Index strategy**: GIN for keyword search (pg_trgm), HNSW for vector similarity
3. **Facets**: Role, location, source, tags as arrays for efficient filtering

## Notes

- Migration requires pgvector extension (Docker pgvector/pgvector:pg16 recommended)
- search_documents table created successfully
- search_embeddings table requires pgvector extension