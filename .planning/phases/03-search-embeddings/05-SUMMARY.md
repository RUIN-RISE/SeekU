---
phase: 03-search-embeddings
plan: 05
status: complete
completed_at: 2026-03-29
---

# Plan 05: Query Planner + Retriever

## Summary

Implemented hybrid search with query planning and retrieval combining keyword (pg_trgm) and vector (pgvector) search.

## Files Created

- `packages/search/src/planner.ts` - Query intent parsing
- `packages/search/src/retriever.ts` - Hybrid retrieval implementation

## Features

### Query Planner
- Parses natural language queries into structured intent
- Extracts roles, skills, locations, must-haves, nice-to-haves

### Hybrid Retriever
- Keyword search using pg_trgm similarity
- Vector search using cosine distance
- Configurable weights (default: 40% keyword, 60% vector)
- Facet filtering by location, source

## Usage

```typescript
import { QueryPlanner, HybridRetriever } from "@seeku/search";

const planner = new QueryPlanner(provider);
const intent = await planner.parse("AI engineer with Python experience in Beijing");

const retriever = new HybridRetriever({ db, provider });
const results = await retriever.retrieve(intent);
```