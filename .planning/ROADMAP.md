# Roadmap: Seeku

## Overview

Seeku is a Chinese AI talent search engine that finds candidates through evidence-driven matching. The roadmap builds from infrastructure and Bonjour data ingestion, through GitHub integration and identity resolution, to search retrieval, UI validation, and finally conversational refinement with compliance polish.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Infrastructure & Bonjour Ingestion** - Foundation: project setup, Bonjour adapter, compliance opt-out
- [ ] **Phase 2: GitHub & Identity Merge** - Data integration: GitHub adapter, profile merging, evidence extraction
- [ ] **Phase 3: Search & Embeddings** - Retrieval: query parsing, hybrid search, reranking, embeddings
- [ ] **Phase 4: UI & Evaluation** - Validation: web interface, candidate display, benchmark system
- [ ] **Phase 5: Conversational & Compliance Polish** - UX enhancement: conversational refinement, profile claims

## Phase Details

### Phase 1: Infrastructure & Bonjour Ingestion
**Goal**: Raw Bonjour profiles are ingested and stored with compliance infrastructure for opt-out requests
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-04, COMP-01, COMP-02
**Success Criteria** (what must be TRUE):
  1. Bonjour profiles are fetched from API and stored in source_profiles table
  2. Profile discovery seeds are collected from Bonjour endpoints
  3. Raw Bonjour data is normalized to a consistent schema
  4. Users can submit opt-out requests via a form
  5. Opted-out profiles are marked hidden and excluded from downstream processing
**Plans**: 2 plans (completed)

Plans:
- [x] 01-PLAN.md — Infrastructure: monorepo setup, database schema, migrations
- [x] 02-PLAN.md — Bonjour adapter: client, normalization, discovery

### Phase 2: GitHub & Identity Merge
**Goal**: Unified person entities are created from merged Bonjour and GitHub data with extracted evidence
**Depends on**: Phase 1
**Requirements**: DATA-03, DATA-05, DATA-06, EVID-01, EVID-02, EVID-03, EVID-04, EVID-05
**Success Criteria** (what must be TRUE):
  1. GitHub profiles and repositories are fetched and stored in source_profiles table
  2. Bonjour and GitHub profiles are linked into unified person entities
  3. Projects and repositories are extracted as classified evidence items
  4. Social links and job signals are extracted and stored with type classification
  5. Evidence items are associated with person entities for retrieval
**Plans**: 5 plans in 5 waves

Plans:
- [ ] 01-PLAN.md — GitHub adapter: client, normalization, SourceAdapter implementation (DATA-03, DATA-05)
- [ ] 02-PLAN.md — Schema extension: persons, person_identities, person_aliases, evidence_items tables (EVID-05)
- [ ] 03-PLAN.md — Evidence extraction: Bonjour projects/socials/job signals, GitHub repositories (EVID-01, EVID-02, EVID-03, EVID-04)
- [ ] 04-PLAN.md — Identity resolution: matcher, merger, resolver pipeline (DATA-06)
- [ ] 05-PLAN.md — Worker integration: GitHub sync, identity resolution, evidence storage

### Phase 3: Search & Embeddings
**Goal**: Natural language queries return ranked candidates with evidence-based matching
**Depends on**: Phase 2
**Requirements**: DATA-07, DATA-08, SEARCH-01, SEARCH-02, SEARCH-03, SEARCH-04
**Success Criteria** (what must be TRUE):
  1. Natural language queries are parsed to structured intent (role, skills, location, experience)
  2. Hybrid search combines keyword (pg_trgm) and vector (pgvector) retrieval
  3. Results are reranked with evidence-weighted scoring
  4. Embeddings are generated for all search documents
**Plans**: 7 plans in 4 waves

Plans:
- [ ] 01-PLAN.md — Schema extension: search_documents, search_embeddings tables with indexes (DATA-07 foundation)
- [ ] 02-PLAN.md — LLM provider: OpenAI abstraction for chat and embeddings (DATA-08, SEARCH-02 foundation)
- [ ] 03-PLAN.md — Index builder: Build search_documents from persons + evidence (DATA-07)
- [ ] 04-PLAN.md — Embedding generator: Generate and store embeddings (DATA-08)
- [ ] 05-PLAN.md — Query planner + Retriever: LLM intent parsing, hybrid search (SEARCH-02, SEARCH-03)
- [ ] 06-PLAN.md — Reranker: Evidence-weighted scoring (SEARCH-04)
- [ ] 07-PLAN.md — API endpoint + Worker: POST /search, search index workers (SEARCH-01, DATA-07, DATA-08 integration)

### Phase 4: UI & Evaluation
**Goal**: Users can search, view results, and validate search quality through benchmarks
**Depends on**: Phase 3
**Requirements**: SEARCH-05, UI-01, UI-02, UI-03, UI-04, EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVAL-05
**Success Criteria** (what must be TRUE):
  1. Users can input natural language searches via web UI
  2. Search results display candidate cards with match reasons and evidence preview
  3. Users can view detailed candidate profiles with evidence tabs (projects, repos, socials, signals)
  4. Admin dashboard shows sync status and eval metrics
  5. Eval benchmark validates coverage and precision@k against golden set
**UI hint**: yes
**Plans**: TBD

### Phase 5: Conversational & Compliance Polish
**Goal**: Users can refine searches conversationally and claim profile ownership
**Depends on**: Phase 4
**Requirements**: UI-05, COMP-03, COMP-04
**Success Criteria** (what must be TRUE):
  1. Users can iteratively refine search conditions through conversational UI
  2. Users can submit profile claim requests with verification proof
  3. Claimed profiles show verified status after admin approval workflow
**UI hint**: yes
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure & Bonjour Ingestion | 2/2 | Completed | 2026-03-28 |
| 2. GitHub & Identity Merge | 0/5 | Ready to execute | - |
| 3. Search & Embeddings | 0/7 | Ready to execute | - |
| 4. UI & Evaluation | 0/TBD | Not started | - |
| 5. Conversational & Compliance Polish | 0/TBD | Not started | - |

---

*Last updated: 2026-03-29 after Phase 3 planning*