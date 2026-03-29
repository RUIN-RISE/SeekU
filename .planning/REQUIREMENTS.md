# Requirements — Seeku v1

## v1 Requirements

### Data Layer

- [ ] **DATA-01**: Worker fetches Bonjour profiles via `/profile/{link}` API and stores in `source_profiles` table
- [ ] **DATA-02**: Worker discovers profile seeds via Bonjour `/user/category` and `/community` endpoints
- [ ] **DATA-03**: Worker fetches GitHub user profiles and repositories via REST API
- [ ] **DATA-04**: Adapter normalizes Bonjour raw JSON to `NormalizedProfile` schema
- [ ] **DATA-05**: Adapter normalizes GitHub raw JSON to `NormalizedProfile` schema
- [ ] **DATA-06**: Identity module links Bonjour and GitHub profiles into unified `persons` entities
- [ ] **DATA-07**: Worker builds `search_documents` from merged person data
- [ ] **DATA-08**: Worker generates embeddings for search documents

### Search Layer

- [ ] **SEARCH-01**: API endpoint `POST /search` accepts natural language query
- [ ] **SEARCH-02**: Query planner converts natural language to structured intent (role, skills, location, experience level)
- [ ] **SEARCH-03**: Hybrid retrieval — keyword (pg_trgm) + vector (pgvector) search
- [ ] **SEARCH-04**: Reranking with evidence-weighted scoring
- [x] **SEARCH-05**: API endpoint `GET /profiles/:personId` returns candidate detail with evidence

### Evidence Layer

- [ ] **EVID-01**: Extract projects from Bonjour `creations` field
- [ ] **EVID-02**: Extract repositories from GitHub profile
- [ ] **EVID-03**: Extract social links from Bonjour `socials` field
- [ ] **EVID-04**: Extract job signals from Bonjour community posts ("Open to Work", "We Are Hiring")
- [ ] **EVID-05**: Store all evidence in `evidence_items` table with type classification

### Evaluation Layer

- [x] **EVAL-01**: Create eval query set (50-100 realistic search queries)
- [x] **EVAL-02**: Create golden set (known AI talent with expected matches)
- [x] **EVAL-03**: Benchmark runner computes coverage (how many golden set found)
- [x] **EVAL-04**: Benchmark runner computes precision@k (top results relevance)
- [ ] **EVAL-05**: Eval dashboard shows metrics and regression reports

### UI Layer

- [ ] **UI-01**: Search page with natural language input box
- [ ] **UI-02**: Results page with candidate cards (name, headline, match score, evidence preview)
- [ ] **UI-03**: Candidate detail page with evidence tabs (projects, repos, socials, signals)
- [ ] **UI-04**: Admin page showing sync status, eval results, and manual trigger buttons
- [ ] **UI-05**: Search refinement conversation UI (iteratively adjust conditions)

### Compliance Layer

- [ ] **COMP-01**: Opt-out request form (email + profile link)
- [ ] **COMP-02**: Opt-out processing (mark person as hidden, remove from search index)
- [ ] **COMP-03**: Profile claim form (contact + verification proof)
- [ ] **COMP-04**: Claim processing workflow (verification + profile ownership transfer)

---

## v2 Requirements (Deferred)

### Additional Data Sources

- [ ] **DATA-09**: ModelScope adapter for AI model/project signals
- [ ] **DATA-10**: Google Scholar enrichment (only when user provides link)
- [ ] **DATA-11**: Zhihu/CSDN/Juejin identity signals

### Advanced Features

- [ ] **SEARCH-06**: Saved searches and alerts
- [ ] **SEARCH-07**: Bulk export for enterprise users
- [ ] **UI-06**: Talent active signup flow (full profile creation)
- [ ] **UI-07**: Recruiter job posting and matching

---

## Out of Scope

| Exclusion | Reason |
|-----------|--------|
| Real-time crawling for search | Pre-built index model; better UX and compliance |
| Google Scholar bulk scraping | Official policy prohibits; only use for enrichment |
| Full ModelScope user database | Use as signal source, not primary profile source |
| Multi-sided marketplace (talent signup platform) | Too early; focus on search quality first |
| Mobile app | Web MVP first; mobile later if validated |
| Payment/subscription system | Defer until product validated |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Pending |
| COMP-01 | Phase 1 | Pending |
| COMP-02 | Phase 1 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| DATA-06 | Phase 2 | Pending |
| EVID-01 | Phase 2 | Pending |
| EVID-02 | Phase 2 | Pending |
| EVID-03 | Phase 2 | Pending |
| EVID-04 | Phase 2 | Pending |
| EVID-05 | Phase 2 | Pending |
| DATA-07 | Phase 3 | Pending |
| DATA-08 | Phase 3 | Pending |
| SEARCH-01 | Phase 3 | Pending |
| SEARCH-02 | Phase 3 | Pending |
| SEARCH-03 | Phase 3 | Pending |
| SEARCH-04 | Phase 3 | Pending |
| SEARCH-05 | Phase 4 | Complete (04-01) |
| UI-01 | Phase 4 | Pending |
| UI-02 | Phase 4 | Pending |
| UI-03 | Phase 4 | Pending |
| UI-04 | Phase 4 | Partial (backend 04-01) |
| EVAL-01 | Phase 4 | Complete |
| EVAL-02 | Phase 4 | Complete |
| EVAL-03 | Phase 4 | Complete |
| EVAL-04 | Phase 4 | Complete |
| EVAL-05 | Phase 4 | Pending |
| UI-05 | Phase 5 | Pending |
| COMP-03 | Phase 5 | Pending |
| COMP-04 | Phase 5 | Pending |

---
*Last updated: 2026-03-29 after 04-01 completion*