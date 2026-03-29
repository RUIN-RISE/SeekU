---
phase: 03-search-embeddings
plan: 03
status: complete
completed_at: 2026-03-29
---

# Plan 03: Index Builder

## Summary

Created `@seeku/search` package with index builder that constructs denormalized search documents from person data and evidence items.

## Files Created

- `packages/search/src/index-builder.ts` - Search document construction
- `packages/search/src/index.ts` - Module exports
- `packages/search/package.json` - Package configuration
- `packages/search/tsconfig.json` - TypeScript configuration

## Features

1. **Document text generation**: Combines person info + evidence descriptions
2. **Facet extraction**: Roles, locations, sources, tags
3. **Rank features**: Evidence counts, project counts, repo counts, freshness

## Usage

```typescript
import { buildSearchDocument, buildAllSearchDocuments } from "@seeku/search";

const doc = buildSearchDocument({ person, evidence });
const docs = await buildAllSearchDocuments(persons, evidenceByPerson);
```