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
- [ ] **SEARCH-05**: API endpoint `GET /profiles/:personId` returns candidate detail with evidence

### Evidence Layer

- [ ] **EVID-01**: Extract projects from Bonjour `creations` field
- [ ] **EVID-02**: Extract repositories from GitHub profile
- [ ] **EVID-03**: Extract social links from Bonjour `socials` field
- [ ] **EVID-04**: Extract job signals from Bonjour community posts ("Open to Work", "We Are Hiring")
- [ ] **EVID-05**: Store all evidence in `evidence_items` table with type classification

### Evaluation Layer

- [ ] **EVAL-01**: Create eval query set (50-100 realistic search queries)
- [ ] **EVAL-02**: Create golden set (known AI talent with expected matches)
- [ ] **EVAL-03**: Benchmark runner computes coverage (how many golden set found)
- [ ] **EVAL-04**: Benchmark runner computes precision@k (top results relevance)
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

| Phase | Requirements | Status |
|-------|--------------|--------|
| Phase 1 | DATA-01, DATA-02, DATA-04, DATA-05, COMP-01, COMP-02 | Pending |
| Phase 2 | DATA-03, DATA-06, EVID-01, EVID-02, EVID-03, EVID-04, EVID-05 | Pending |
| Phase 3 | DATA-07, DATA-08, SEARCH-01, SEARCH-02, SEARCH-03, SEARCH-04 | Pending |
| Phase 4 | SEARCH-05, UI-01, UI-02, UI-03, UI-04, EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVAL-05 | Pending |
| Phase 5 | UI-05, COMP-03, COMP-04 | Pending |

---
*Last updated: 2026-03-28 after initialization*