# Phase 3: Search & Embeddings - Research

**Gathered:** 2026-03-29
**Status:** Ready for planning
**Source:** Codex technical investigation + Phase 1-2 implementation

---

## Phase Boundary

This phase delivers:
- Search document builder from merged person data
- Embedding generation for semantic search
- Natural language query parsing to structured intent
- Hybrid retrieval (keyword + vector)
- Evidence-weighted reranking

---

## Technical Research

### Search Document Structure

```typescript
interface SearchDocument {
  personId: string;
  docText: string;           // Full-text searchable content
  facetRole: string[];       // Role facets for filtering
  facetLocation: string[];   // Location facets
  facetSource: string[];     // Source facets (bonjour, github)
  facetTags: string[];       // Skill/tag facets
  rankFeatures: {
    evidenceCount: number;
    projectCount: number;
    repoCount: number;
    followerCount: number;
    freshness: number;       // Days since last update
  };
}
```

### Database Schema (Phase 3 Tables)

```sql
-- Denormalized search document
create table search_documents (
  person_id uuid primary key references persons(id) on delete cascade,
  doc_text text not null,
  facet_role text[],
  facet_location text[],
  facet_source text[],
  facet_tags text[],
  rank_features jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Embeddings
create table search_embeddings (
  person_id uuid primary key references persons(id) on delete cascade,
  embedding vector(1536) not null,  -- OpenAI ada-002 dimension
  embedding_model text not null,
  embedded_at timestamptz not null default now()
);

-- Indexes for hybrid search
create index idx_search_documents_doc_trgm
  on search_documents using gin (doc_text gin_trgm_ops);

create index idx_search_documents_facet_role
  on search_documents using gin (facet_role);

create index idx_search_embeddings_hnsw
  on search_embeddings using hnsw (embedding vector_cosine_ops);
```

### Embedding Strategy

**Model Options:**
| Model | Dimension | Cost (per 1K tokens) | Quality |
|-------|-----------|---------------------|---------|
| OpenAI text-embedding-3-small | 1536 | $0.00002 | Good |
| OpenAI text-embedding-3-large | 3072 | $0.00013 | Better |
| Local (all-MiniLM-L6-v2) | 384 | Free | Moderate |

**Recommendation:** Start with OpenAI text-embedding-3-small for MVP, abstract behind interface for future swapping.

**Content to Embed:**
- Display name + headline
- Bio/summary text
- Project titles and descriptions
- Repository names and descriptions
- Skills from basicInfo

### Query Planning Strategy

**Intent Structure:**
```typescript
interface QueryIntent {
  rawQuery: string;
  roles: string[];           // e.g., ["engineer", "founder"]
  skills: string[];          // e.g., ["machine learning", "python"]
  locations: string[];       // e.g., ["beijing", "shanghai"]
  experienceLevel?: string;  // e.g., "senior", "junior"
  sourceBias?: string;       // e.g., "github", "bonjour"
  mustHaves: string[];       // Required terms
  niceToHaves: string[];     // Boost terms
}
```

**LLM Prompt Template:**
```
You are a query parser for an AI talent search engine.
Parse the user's natural language query into structured search intent.

User query: "{query}"

Extract:
1. Roles (job titles, positions)
2. Skills (technologies, domains)
3. Locations (cities, countries)
4. Experience level hints
5. Source preferences
6. Must-have vs nice-to-have terms

Return JSON with the extracted fields.
```

### Hybrid Search Pipeline

```
User Query
    │
    ▼
┌─────────────────┐
│ Query Planner   │  LLM parses to QueryIntent
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│Keyword│ │Vector │  Parallel retrieval
│Search │ │Search │
└───┬───┘ └───┬───┘
    │         │
    └────┬────┘
         │
         ▼
┌─────────────────┐
│ Merge & Rerank  │  Combine scores, evidence weighting
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Results       │  Top K with match reasons
└─────────────────┘
```

### Scoring Formula

```typescript
function computeFinalScore(candidate: Candidate, intent: QueryIntent): number {
  // Base scores from retrieval
  const keywordScore = candidate.keywordScore || 0;
  const vectorScore = candidate.vectorScore || 0;

  // Combine retrieval scores (weighted)
  const retrievalScore = 0.4 * keywordScore + 0.6 * vectorScore;

  // Evidence boost
  const evidenceBoost = computeEvidenceBoost(candidate, intent);

  // Freshness penalty
  const freshnessPenalty = Math.exp(-candidate.daysSinceUpdate / 365);

  // Final score
  return retrievalScore * evidenceBoost * freshnessPenalty;
}

function computeEvidenceBoost(candidate: Candidate, intent: QueryIntent): number {
  let boost = 1.0;

  // Projects matching skills
  boost += 0.1 * countMatchingProjects(candidate, intent.skills);

  // Repositories matching skills
  boost += 0.05 * countMatchingRepos(candidate, intent.skills);

  // Follower count (log scale)
  boost += 0.02 * Math.log10(candidate.followerCount + 1);

  return boost;
}
```

### Package Structure for Phase 3

```
packages/
├─ search/               # NEW: Search module
│  ├─ planner.ts         # Query intent parsing
│  ├─ retriever.ts       # Hybrid retrieval
│  ├─ reranker.ts        # Evidence-weighted reranking
│  ├─ index-builder.ts   # Build search_documents
│  └─ index.ts           # Exports
├─ llm/                  # NEW: LLM abstraction
│  ├─ provider.ts        # LLM provider interface
│  ├─ openai.ts          # OpenAI implementation
│  ├─ embeddings.ts      # Embedding generation
│  └─ index.ts           # Exports
├─ db/
│  └─ src/
│     ├─ schema.ts       # Add search_documents, search_embeddings
│     └─ repositories.ts # Add search repos
```

---

## Key Decisions

| Decision | Rationale | Phase |
|----------|-----------|-------|
| OpenAI text-embedding-3-small | Good quality/cost ratio for MVP | Phase 3 |
| Vector dimension 1536 | Matches OpenAI ada-002/small | Phase 3 |
| HNSW index for vectors | Faster than IVFFlat for small datasets | Phase 3 |
| LLM for query parsing | Natural language understanding | Phase 3 |
| 0.4 keyword + 0.6 vector weight | Balance precision and semantic matching | Phase 3 |

---

## API Design

### POST /search

**Request:**
```json
{
  "query": "Find me ML engineers who have built RAG systems",
  "limit": 20,
  "offset": 0,
  "filters": {
    "locations": ["beijing", "shanghai"],
    "sources": ["github"]
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "personId": "uuid",
      "name": "张三",
      "headline": "AI Engineer @ Startup",
      "matchScore": 0.92,
      "matchReasons": [
        "Built RAG systems",
        "ML engineering experience"
      ],
      "evidencePreview": [
        { "type": "repository", "title": "rag-chatbot", "stars": 150 }
      ]
    }
  ],
  "total": 45,
  "intent": {
    "roles": ["engineer"],
    "skills": ["machine learning", "rag"]
  }
}
```

---

## Dependencies

- OpenAI API key (OPENAI_API_KEY)
- pgvector extension in Postgres
- Phase 1-2 data (persons, evidence_items)

---

## Recommended Build Order

1. **Schema extension** — Add search_documents, search_embeddings tables
2. **LLM provider** — OpenAI client abstraction
3. **Index builder** — Build search_documents from persons + evidence
4. **Embedding generator** — Generate and store embeddings
5. **Query planner** — LLM-based intent parsing
6. **Retriever** — Hybrid keyword + vector search
7. **Reranker** — Evidence-weighted scoring
8. **API endpoint** — POST /search
9. **Worker integration** — Reindex job

---

*Research completed 2026-03-29 based on Codex investigation and Phase 1-2 implementation*