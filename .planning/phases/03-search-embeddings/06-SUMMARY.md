---
phase: 03-search-embeddings
plan: 06
status: complete
completed_at: 2026-03-29
---

# Plan 06: Reranker

## Summary

Implemented evidence-weighted reranking that boosts candidates based on matching projects, repositories, and freshness.

## Files Created

- `packages/search/src/reranker.ts` - Reranking logic

## Features

1. **Evidence boost**: +8% for matching projects, +4% for matching repos
2. **Follower scaling**: Logarithmic boost based on follower count
3. **Freshness penalty**: Exponential decay over time
4. **Match reasons**: Extracts and returns why each result matched

## Usage

```typescript
import { Reranker, rerank } from "@seeku/search";

const reranker = new Reranker();
const ranked = reranker.rerank(results, intent, documents, evidenceByPerson);
```

## Scoring Formula

```
finalScore = combinedScore * (1 + evidenceBoost) * freshnessPenalty
```