# Seeku

## What This Is

Seeku is a Chinese AI talent search engine designed for AI Builders, Founders, and Engineers. It enables high-precision talent discovery through evidence-driven matching, replacing LinkedIn-style profile browsing with structured data from Bonjour.bio and GitHub. Users input natural language search queries and receive ranked candidate profiles with verifiable evidence (projects, contributions, publications).

## Core Value

**Find the right AI talent through what they've done, not what they claim.** Evidence-based matching over profile text matching.

## Milestone Status: v1.2 Agentic Search CLI — Completed

**Goal delivered:** Seeku now has a CLI-first decision-oriented search agent that can autonomously clarify, search, compare 2-3 candidates, and recommend with explicit evidence and confidence gates.

**Delivered features:**
- Free-form CLI search agent loop for clarify/search/narrow/compare/decide
- Explicit tool contracts and session state for agent decision flow
- Structured 2-3 person compare with confidence-gated recommendation
- Honest low-confidence behavior that refuses unsupported certainty

**Verification:**
- Phase 7 summary recorded at `.planning/phases/07-cli-search-agent-orchestration/SUMMARY.md`
- worker validation passed: `9` files / `80` tests
- `agent-eval --json`: pass
- saved regression baselines preserved:
  - `Q4`: `watch-but-stable`
  - `Q6`: `pass`
  - `Q8`: `pass`

**Default next move:** close out the completed v1.2 milestone via GSD milestone closeout / ship routing. Do not extend Phase 7 ad hoc.

## Requirements

### Validated

- [x] **AGENT-01**: Closed by Phase 7 on 2026-04-16
- [x] **AGENT-02**: Closed by Phase 7 on 2026-04-16
- [x] **AGENT-03**: Closed by Phase 7 on 2026-04-16
- [x] **AGENT-04**: Closed by Phase 7 on 2026-04-16
- [x] **AGENT-05**: Closed by Phase 7 on 2026-04-16
- [x] **AGENT-06**: Closed by Phase 7 on 2026-04-16

### Active

- [ ] **DATA-01**: Sync and normalize Bonjour.bio profiles via public JSON API
- [ ] **DATA-02**: Sync GitHub user profiles and repositories via REST/GraphQL API
- [ ] **DATA-03**: Identity resolution — merge Bonjour and GitHub profiles into unified person entities
- [ ] **DATA-04**: Build search documents with denormalized evidence for retrieval
- [ ] **SEARCH-01**: Natural language query parsing to structured intent (role, skills, location, experience)
- [ ] **SEARCH-02**: Hybrid search — keyword + vector semantic retrieval with reranking
- [ ] **SEARCH-03**: Candidate cards with match reasons and evidence links
- [ ] **EVAL-01**: Coverage benchmark — test against 100-200 known AI talent samples
- [ ] **EVAL-02**: Precision/recall metrics for search quality validation
- [ ] **UI-01**: Search input with conversational refinement capability
- [ ] **UI-02**: Candidate detail page with evidence tabs (projects, socials, activity)
- [ ] **UI-03**: Admin dashboard for sync status and eval results
- [ ] **COMPLY-01**: Opt-out mechanism for profile removal requests
- [ ] **COMPLY-02**: Profile claim mechanism for talent to verify ownership

### Out of Scope

- Large-scale Google Scholar scraping — Official policy prohibits bulk access; only use for enrichment when user provides Scholar link
- Full ModelScope user scanning — Use as AI project signal source only, not primary talent profile source
- Zhihu/CSDN/Juejin cross-platform identity merge — Deferred to Phase 3+ due to merge complexity
- Real-time crawling for search results — Pre-built index + incremental refresh model instead
- Multi-sided marketplace features (talent active signup platform) — Keep claim profile minimal, defer full marketplace operations

## Context

### Market Background

- Dinq exists for LinkedIn-based AI talent search, but LinkedIn data is incomplete for Chinese AI community
- Bonjour.bio is a Chinese AI community with ~160k daily active users, offering public personal websites at `bonjour.bio/{slug}`
- Bonjour exposes public JSON API endpoints for profile, community, and category discovery
- GitHub provides stable REST/GraphQL APIs for developer profiles and project history

### Technical Findings (from Codex research)

- Bonjour profile API: `GET /profile/{link}` returns structured JSON with name, bio, socials, creations, gridItems
- Bonjour discovery: `/user/category` and `/community` endpoints provide seed flow for profile discovery
- Bonjour tools: `tools.bonjour.bio/link2json` can parse external links into structured data
- Bonjour has no public rate-limit documentation — treat as unstable dependency, plan for official partnership
- GitHub API: Rate limits exist (5000 requests/hour for authenticated), stable and documented

### Domain Research Summary

- AI Builder community in China is concentrated in Bonjour.bio, GitHub, and ModelScope
- Key talent signals: GitHub contributions, ModelScope models, Bonjour "Open to Work" status, community posts
- Identity merge signals: social links in Bonjour profiles, same name + company/school + city, GitHub/Twitter cross-links

## Constraints

- **Data Source**: Bonjour.bio primary, GitHub secondary — Must design adapter abstraction for source switching
- **API Stability**: Bonjour API undocumented — Design for graceful degradation, cache aggressively, pursue official partnership
- **Compliance**: GDPR-style opt-out required from day one — Not optional feature, must-have infrastructure
- **Tech Stack**: TypeScript monorepo (pnpm + turbo), Postgres 16 + pgvector + pg_trgm — User preference
- **Architecture**: Worker-first (async jobs before API), Adapter-first (source logic isolated), Eval-first (benchmark before UI polish)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bonjour + GitHub as MVP sources | Highest data quality, lowest acquisition cost, covers Chinese AI community density | — Pending |
| Pre-built index over real-time crawl | Better search UX, lower compliance risk, more stable | — Pending |
| Postgres + pgvector for MVP | Sufficient for initial scale, avoids premature infra complexity | — Pending |
| Evidence-driven ranking over text matching | "What they've done" > "What they write in bio" | — Pending |
| Thin UI first, conversation later | Validate data quality before polishing interaction | — Pending |
| Official Bonjour partnership in parallel | Dependency risk mitigation, 25-30% data source reliance | — Pending |
| Agent orchestration must sit above the search core | Preserve evidence-driven retrieval/reranking quality while making the CLI behave more autonomously | Implemented and validated in v1.2 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-16 for milestone v1.2 Agentic Search CLI completion*
