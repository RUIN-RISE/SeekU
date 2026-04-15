# Roadmap: Seeku

## Overview

Seeku is a Chinese AI talent search engine that finds candidates through evidence-driven matching. The roadmap builds from infrastructure and Bonjour data ingestion, through GitHub integration and identity resolution, to search retrieval, UI validation, and finally conversational refinement with compliance polish.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

Historical reconciliation note as of 2026-04-13:
- `05.5A` and `05.5B` share the same `05.5-*` on-disk lineage.
- `06.1`, `06.2`, and `06.3` are inserted sub-phases that completed before canonical Phase `6`.
- Canonical Phase `6` is the completed conversational/compliance phase on disk.

Current routing note as of 2026-04-15:
- do not use the historical per-phase checklist bodies below as the default “next task” selector
- use `.planning/STATE.md` first for current routing
- for the closed 2026-04-15 `v1.1 controlled-open` cycle, use:
  - `.planning/GITHUB-EXPANSION-STAGE-2026-04-13.md`
  - `.planning/github-expansion/WS6-MILESTONE-OPEN-REVIEW-2026-04-14.md`
  - `.planning/github-expansion/RETRIEVAL-REPAIR-FOLLOWUP-BATCH-2026-04-15.md`
  - `.planning/github-expansion/WS4-CONTROLLED-OPEN-CHECKPOINT-2026-04-15.md`
  - `.planning/github-expansion/V1.1-CONTROLLED-OPEN-CLOSEOUT-2026-04-15.md`
- default next move after that closeout is workspace cleanup and batch landing
- Bonjour coverage / cleanup docs are sidecar references unless the operator intentionally chooses that lane
- `.planning/workstreams/*` is not the default routing source during this cleanup pass

- [x] **Phase 1: Infrastructure & Bonjour Ingestion** - Foundation: project setup, Bonjour adapter, compliance opt-out
- [x] **Phase 2: GitHub & Identity Merge** - Data integration: GitHub adapter, profile merging, evidence extraction
- [x] **Phase 3: Search & Embeddings** - Retrieval: query parsing, hybrid search, reranking, embeddings
- [x] **Phase 4: UI & Evaluation** - Validation: web interface, candidate display, benchmark system
- [x] **Phase 5: CLI Interactive Search** - Conversational CLI: intelligent chat, multi-dimensional profiles, keyboard TUI
- [x] **Phase 05.1: CLI UX Optimization** - UX enhancement: loading states, parallel preload, unified config, retry mechanism, and acceptance hotfixes for CLI startup/caching/timeouts
- [x] **Phase 05.5A: Product Honesty** - 诚实化：匹配强度分层、弱结果提示、完整 reasons、三态条件审计、Banner 真实化、CLI/API parity
- [x] **Phase 05.5B: Source Visibility** - 展示补齐：多源 Primary Links、证据卡片增强、Bonjour 偏置移除
- [x] **Phase 05.6: Coverage Repair** - 覆盖修复：索引 100%、GitHub 覆盖 11.9%、source filter 恢复为真过滤
- [x] **Phase 6: Conversational & Compliance Polish** - UX enhancement: conversational refinement, profile claims

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
**Plans**: 8 plans in 5 waves

Plans:
- [x] 04-01-PLAN.md — Backend API endpoints: profiles, admin routes (SEARCH-05, UI-04 backend)
- [x] 04-02-PLAN.md — Eval package: datasets, loader functions (EVAL-01, EVAL-02)
- [x] 04-03-PLAN.md — CLI search interface: search and show commands (additional feature per user decision)
- [x] 04-04-PLAN.md — Eval benchmark runner: metrics computation (EVAL-03, EVAL-04)
- [x] 04-05-PLAN.md — Web frontend setup: Next.js app, SearchBar, CandidateCard (UI-01, UI-02)
- [x] 04-06a-PLAN.md — Web frontend components: Header, ResultsList, EvidenceTabs, CandidateDetailModal (UI-03, UI-04)
- [x] 04-06b-PLAN.md — Web frontend pages: search home, admin dashboard (UI-01, UI-02, EVAL-05)
- [ ] 04-07-PLAN.md — Human verification checkpoint

### Phase 5: CLI Interactive Search Experience
**Goal**: Users can search talents through intelligent conversational CLI with multi-dimensional profile visualization
**Depends on**: Phase 4
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06
**Success Criteria** (what must be TRUE):
  1. Users input natural language queries and LLM extracts structured search conditions
  2. Missing conditions are detected and follow-up questions asked (max 2, Enter to skip)
  3. Candidates are displayed with 6-dimensional profile cards (tech, project, academic, community, stability, location)
  4. Keyboard interaction allows ↑↓ selection, Enter for details, q to quit
  5. Profile cache in PostgreSQL JSONB enables instant repeated queries
  6. Hybrid scoring combines rule-based (location, tech, stability) and LLM-based (project, academic) evaluation
**Plans**: 6 plans in 3 waves

Plans:
- [x] 05-01-PLAN.md — Chat interaction module: LLM condition extraction, missing detection, follow-up (CLI-01)
- [x] 05-02-PLAN.md — TUI keyboard module: enquirer setup, ↑↓ selection, Enter/q handlers (CLI-02)
- [x] 05-03-PLAN.md — Hybrid scorer: rule-based (location/tech/stability) + LLM-based (project/academic) (CLI-03)
- [x] 05-04-PLAN.md — Profile cache layer: PostgreSQL JSONB schema, TTL 7 days, cache invalidation (CLI-04)
- [x] 05-05-PLAN.md — Profile generator: 6-dimension JSON generation, highlights extraction (CLI-05)
- [x] 05-06-PLAN.md — Terminal renderer: boxen/chalk cards, progress bars, color coding (CLI-06)

### Phase 05.1: CLI UX Optimization (INSERTED)

**Goal:** Transform Seeku CLI from single-shot search tool into conversational search assistant with session loop: clarify → search → shortlist → detail/compare/refine → search
**Requirements**: CLI-UX-01, CLI-UX-02, CLI-UX-03, CLI-UX-04, CLI-SESSION-01
**Depends on:** Phase 5
**Success Criteria** (what must be TRUE):
  1. `seeku` enters interactive session directly; `seeku "query"` carries initial requirement
  2. Pre-search clarification with understanding echo and user action choices
  3. Command-based shortlist: `v N`, `c N M`, `sort mode`, `r`, `m`, `q`
  4. Detail page with next actions: `back`, `why`, `refine`, `q`
  5. Session loop supports continuous refine without restart
**Plans**: 4 plans + acceptance fixes + session UX refactor

Plans:
- [x] 05.1-01-PLAN.md — Unified config: config.ts with Zod validation, env var override, fast-fail (CLI-UX-03)
- [x] 05.1-02-PLAN.md — ora spinner: loading state integration, enquirer compatibility (CLI-UX-01)
- [x] 05.1-03-PLAN.md — Retry mechanism: retry.ts with isRetryable, exponential backoff (CLI-UX-04)
- [x] 05.1-04-PLAN.md — Parallel preload: promisePool factory, background caching (CLI-UX-02)
- [x] 05.1-ACCEPTANCE-FIX-SUMMARY.md — Claude review findings remediation: startup UX, query-scoped cache, prompt timeout cleanup
- [x] CLI-SESSION-UX-CHANGE-REPORT.md — Session loop refactor: clarify → search → shortlist → detail → refine (CLI-SESSION-01)

### Phase 05.5A: Product Honesty (INSERTED)

**Goal:** Make Seeku honest about result quality by clearly separating strong/medium/weak matches, exposing full reasoning in detail surfaces, and avoiding false certainty when evidence is missing.
**Depends on:** Phase 05.4 / Phase 05.1 CLI search surfaces
**Success Criteria** (what must be TRUE):
  1. Users can distinguish `strong` / `medium` / `weak` match strength on search results
  2. Weak or degraded result sets explicitly warn that no strong match was found
  3. Shortlist keeps a concise summary while detail / why / export surfaces show full reasons
  4. Condition audit uses three states: satisfied / not satisfied / no evidence
  5. CLI banner and surrounding copy do not overclaim unsupported capabilities
  6. `search --json` and API responses expose the same honesty metadata
**Plans**: 7/7 tasks completed

Plans:
- [x] A1 — Match strength layering
- [x] A2 — Weak-result warning banner
- [x] A3 — Summary vs full reasons split
- [x] A4 — Three-state condition audit
- [x] A5 — Honest CLI banner copy
- [x] A6 — CLI/API parity for `matchStrength` and `resultWarning`
- [x] A7 — Honesty regression coverage

### Phase 05.5B: Source Visibility (INSERTED)

**Goal:** Make result evidence and primary links visibly multi-source instead of over-centering Bonjour.
**Depends on:** Phase 05.5A
**Success Criteria** (what must be TRUE):
  1. Detail view shows Bonjour, GitHub, and web links as first-class primary links when available
  2. Evidence cards show source, title, time, URL, and relevance context
  3. Compare ranking no longer gives hidden Bonjour-only preference
**Plans**: 3/3 tasks completed

Plans:
- [x] B1 — Multi-source primary links
- [x] B2 — Richer evidence cards
- [x] B3 — Remove Bonjour bias from compare

### Phase 05.6: Coverage Repair (INSERTED)

**Goal:** Repair data coverage so search indexing is complete, GitHub evidence breadth is materially improved, and source filtering can safely return to hard enforcement.
**Depends on:** Phase 05.5B
**Success Criteria** (what must be TRUE):
  1. `rebuild-search` rebuilds all active persons by default
  2. Coverage metrics are visible through a dedicated CLI command
  3. Search documents and embeddings cover all active persons
  4. GitHub-covered active persons exceed the prior single-digit baseline
  5. Source filtering is restored as true hard filtering
**Plans**: 5/5 tasks completed

Plans:
- [x] C1a — Full rebuild semantics fix
- [x] C2 — Coverage command
- [x] C1b — Search index gap repair
- [x] C3 — GitHub breadth expansion
- [x] B4 — Restore hard source filter

- [x] **Phase 06.1: Security & Quality Hardening** — Security lockdown, retry resilience, CLI registry, test foundation
- [x] **Phase 06.2: Architecture & Maintainability** — Config centralization, ErrorBoundary, cleanup, evidence pagination
**Goal:** Eliminate P0 security vulnerabilities and P1 reliability/UX issues from code review
**Depends on:** Phase 05.6
**Success Criteria** (what must be TRUE):
  1. Admin API endpoints require authentication; unauthenticated requests get 401
  2. CORS restricts to configured origins only
  3. Identity matcher, search retriever, and planner have passing test suites
  4. All external API calls retry with exponential backoff on transient failures
  5. SearchBar triggers search only on Enter key or button click
  6. CLI uses command registry pattern; all existing commands work identically
  7. All API route params use Fastify schema validation
  8. Search API clamps limit to [1, 50] range
**Plans**: 8 tasks in 4 waves

Plans:
- [x] Wave 1: Admin auth, CORS restriction, input validation (Tasks 1-3)
- [x] Wave 2: External API retry with exponential backoff (Task 4)
- [x] Wave 3: CLI command registry + SearchBar Enter-trigger (Tasks 5-6)
- [x] Wave 4: Test foundation — unit + integration tests (Tasks 7-8)

### Phase 06.2: Architecture & Maintainability (INSERTED)
**Goal:** Clean up architectural debt — config centralization, adapter restoration, error handling
**Depends on:** Phase 06.1
**Success Criteria** (what must be TRUE):
  1. All hard-coded values extracted to env-driven config
  2. Adapters package contains proper SourceAdapter implementations
  3. Web app has React Error Boundary
  4. No leftover console.log or disconnected TODOs
**Plans**: Placeholder — detailed after Phase 06.1

### Phase 06.3: Intelligence & Performance (INSERTED)
**Goal:** Upgrade search intelligence — JSON mode planner, semantic cache, cross-encoder reranker, streaming
**Depends on:** Phase 06.2
**Success Criteria** (what must be TRUE):
  1. Query Planner uses LLM JSON mode, zero text parsing
  2. Repeated/similar queries hit cache, avoiding LLM calls
  3. Cross-encoder reranker scores query-doc pairs for relevance
  4. Search results stream progressively via SSE
  5. Pipeline orchestrator chains all steps with state tracking
**Plans**: 5/5 tasks completed

Plans:
- [x] T1 — Query Planner JSON mode with Zod validation
- [x] T2 — Semantic QueryCache (cosine > 0.95 threshold)
- [x] T3 — Cross-encoder Reranker (LLM-based scoring)
- [x] T4 — SSE streaming endpoint POST /search/stream
- [x] T5 — SearchPipeline orchestrator with callbacks

### Phase 6: Conversational & Compliance Polish
**Goal**: Users can refine searches conversationally and claim profile ownership
**Depends on**: Phase 06.3
**Requirements**: UI-05, COMP-03, COMP-04
**Success Criteria** (what must be TRUE):
  1. Users can iteratively refine search conditions through conversational UI
  2. Users can submit profile claim requests with verification proof
  3. Claimed profiles show verified status after admin approval workflow
**UI hint**: yes
**Plans**: 5 plans in 4 waves

Plans:
- [x] 6-01-PLAN.md — Database + Auth Foundation: profile_claims schema, Auth.js v5 GitHub provider (COMP-03, COMP-04 foundation)
- [x] 6-02-PLAN.md — Conversational REPL Interface: ChatInterface, ChatMessage, /chat page (UI-05)
- [x] 6-03-PLAN.md — Claim Verification API: email verification, GitHub OAuth callback, JWT tokens (COMP-03, COMP-04)
- [x] 6-04-PLAN.md — Verified Badge + Claim UI: VerifiedBadge, ClaimForm, profile detail integration (UI-05, COMP-03)
- [x] 6-05-PLAN.md — Profile Editing + Admin Audit: edit endpoint, admin claims page (COMP-04)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 05.1 → 05.5A → 05.5B → 05.6 → 06.1 → 06.2 → 06.3 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure & Bonjour Ingestion | 2/2 | ✅ Completed | 2026-03-28 |
| 2. GitHub & Identity Merge | 5/5 | ✅ Completed | 2026-03-29 |
| 3. Search & Embeddings | 7/7 | ✅ Completed | 2026-03-29 |
| 4. UI & Evaluation | 8/8 | ✅ Completed | 2026-03-29 |
| 5. CLI Interactive Search | 6/6 | ✅ Completed | 2026-03-29 |
| 05.1. CLI UX Optimization | 4/4 | ✅ Completed | 2026-03-30 |
| 05.5A Product Honesty | 7/7 | ✅ Completed | 2026-03-31 |
| 05.5B Source Visibility | 3/3 | ✅ Completed | 2026-03-31 |
| 05.6 Coverage Repair | 5/5 | ✅ Completed | 2026-03-31 |
| 06.1. Security & Quality Hardening | 4/4 | ✅ Completed | 2026-04-03 |
| 06.2. Architecture & Maintainability | 1/1 | ✅ Completed | 2026-04-03 |
| 06.3. Intelligence & Performance | 5/5 | ✅ Completed | 2026-04-03 |
| 6. Conversational & Compliance Polish | 5/5 | ✅ Completed | 2026-04-03 |

---
*Last updated: 2026-04-13 - Roadmap reconciled with completed Phase 6 / v1.0 baseline*
