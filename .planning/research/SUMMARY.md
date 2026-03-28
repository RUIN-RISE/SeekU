# Research Summary — Seeku

## Stack Recommendations

### Core Infrastructure
| Layer | Recommendation | Rationale |
|-------|---------------|-----------|
| Monorepo | pnpm + turbo + TypeScript | User preference, proven for large projects |
| API | Fastify | Lightweight, high performance |
| Web | Next.js | Standard React framework, good DX |
| Database | Postgres 16 + pgvector + pg_trgm | Vector search, trigram matching, single system |
| Query Builder | Drizzle or Kysely | Type-safe, good DX |
| Jobs | pg-boss | Postgres-backed job queue, simple |
| Validation | zod | Type-safe schema validation |

### Confidence Levels
- Postgres + pgvector: **High** — Proven stack for vector search
- TypeScript monorepo: **High** — User preference, well-understood
- Fastify + Next.js: **Medium** — Standard choices, alternatives available

### What NOT to Use
- Elasticsearch/OpenSearch — Overkill for MVP, Postgres sufficient
- Redis caching layer — Postgres can handle MVP scale
- Real-time crawling infrastructure — Pre-built index model preferred

## Feature Categories

### Table Stakes (Must Have)
1. **Data Sync**: Bonjour profile sync, GitHub profile sync
2. **Identity Resolution**: Merge profiles into unified person entities
3. **Search**: Keyword + semantic search with ranking
4. **Evidence Display**: Show why a candidate matches
5. **Opt-out**: Profile removal mechanism
6. **Eval Benchmark**: Validate coverage and quality

### Differentiators (Competitive Advantage)
1. **Natural Language Search**: "Find me ML engineers who've built RAG systems"
2. **Evidence-Driven Ranking**: Match on projects, not profile text
3. **Conversational Refinement**: Iterate on search conditions
4. **Multi-Source Merge**: Bonjour + GitHub + signals from ModelScope

### Anti-Features (Deliberately NOT Build)
1. **Real-time crawling** — Compliance risk, UX degradation
2. **Full marketplace** — Too early, defer to later
3. **Google Scholar bulk scraping** — Policy violation

## Architecture Overview

### Package Structure
```
seeku/
├─ apps/
│  ├─ api/          # Fastify API
│  ├─ web/          # Next.js UI
│  └─ worker/       # Async jobs
├─ packages/
│  ├─ adapters/     # Bonjour, GitHub data sources
│  ├─ identity/     # Profile merge logic
│  ├─ search/       # Query planning, retrieval, ranking
│  ├─ eval/         # Benchmark runner
│  ├─ db/           # Schema, migrations
│  ├─ llm/          # Query planner, embeddings
│  └─ shared/       # Types, utils
```

### Data Flow
```
Bonjour/GitHub → adapters → source_profiles → identity → persons → search_documents → search_embeddings
                                    ↓
                            evidence_items
```

### Build Order Implications
1. **Phase 1**: db + shared + adapters/bonjour → raw profile ingestion
2. **Phase 2**: adapters/github + identity → merge profiles
3. **Phase 3**: search + eval → test retrieval quality
4. **Phase 4**: api + web → thin UI for validation

## Pitfalls Identified

### Critical Mistakes

1. **Bonjour API Instability**
   - Warning: No public rate-limit documentation, could change without notice
   - Prevention: Adapter isolation, aggressive caching, pursue official partnership early
   - Phase: Address in Phase 1 (adapter design) and continuously (partnership)

2. **Compliance Neglect**
   - Warning: GDPR-style opt-out is not optional for talent search
   - Prevention: Build opt-out and claim mechanisms from day one
   - Phase: Phase 1 infrastructure

3. **Premature Marketplace**
   - Warning: Building talent signup platform too early distracts from core value
   - Prevention: Keep claim profile minimal, defer full marketplace
   - Phase: Out of scope for v1

4. **Real-time Crawling**
   - Warning: UX suffers, compliance risk increases
   - Prevention: Pre-built index + incremental refresh model
   - Phase: Architecture decision from Phase 1

5. **Identity Merge Errors**
   - Warning: Wrong merges more damaging than missed merges
   - Prevention: Human review queue for ambiguous cases, conservative merge policy
   - Phase: Phase 2 (identity resolution)

---
*Research synthesized from Codex technical investigation on 2026-03-28*