---
phase: 03-search-embeddings
plan: 07
status: complete
completed_at: 2026-03-29
---

# Plan 07: API Endpoint + Worker

## Summary

Integrated search functionality into Fastify API and created worker CLI for search index management.

## Files Created/Modified

- `apps/api/src/routes/search.ts` - POST /search endpoint
- `apps/api/src/server.ts` - Route registration
- `apps/worker/src/cli.ts` - Worker commands

## API Endpoint

### POST /search

```json
{
  "query": "AI工程师 有Python经验 北京",
  "limit": 20,
  "filters": {
    "locations": ["beijing", "北京"],
    "sources": ["github"]
  }
}
```

Response:
```json
{
  "results": [
    {
      "personId": "uuid",
      "name": "张三",
      "headline": "AI Engineer @ Startup",
      "matchScore": 0.85,
      "matchReasons": ["skill evidence: python", "role match: ai engineer"],
      "evidencePreview": [...]
    }
  ],
  "total": 42
}
```

## Worker Commands

```bash
# Rebuild search index
pnpm worker rebuild-search

# Build search documents only
pnpm worker search-index

# Generate embeddings only
pnpm worker search-embeddings
```

## Notes

- Requires pgvector extension for full functionality
- SiliconFlow API key required for embedding generation
- Search documents table works without pgvector (keyword search only)