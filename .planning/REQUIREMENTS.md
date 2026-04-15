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
- [x] **EVAL-05**: Eval dashboard shows metrics and regression reports

### UI Layer

- [x] **UI-01**: Search page with natural language input box
- [x] **UI-02**: Results page with candidate cards (name, headline, match score, evidence preview)
- [x] **UI-03**: Candidate detail page with evidence tabs (projects, repos, socials, signals)
- [x] **UI-04**: Admin page showing sync status, eval results, and manual trigger buttons
- [x] **UI-05**: Search refinement conversation UI (iteratively adjust conditions)

### Agent Layer

- [ ] **AGENT-01**: CLI search assistant autonomously chooses among clarify, search, refine, compare, and decide actions within the talent-search domain
- [ ] **AGENT-02**: Agent session state persists user goal, normalized conditions, shortlist, compare set, confidence state, and open uncertainties across turns
- [ ] **AGENT-03**: Agent produces a structured 2-3 person comparison with shared decision dimensions
- [ ] **AGENT-04**: Final recommendation is gated by shortlist membership, evidence traceability, and explicit confidence classification
- [ ] **AGENT-05**: Low-confidence cases return a conditional or refusal result instead of an unsupported recommendation
- [ ] **AGENT-06**: Agent evals verify useful compare outputs without regressing key search families

### Compliance Layer

- [ ] **COMP-01**: Opt-out request form (email + profile link)
- [ ] **COMP-02**: Opt-out processing (mark person as hidden, remove from search index)
- [x] **COMP-03**: Profile claim form (contact + verification proof)
- [x] **COMP-04**: Claim processing workflow (verification + profile ownership transfer)

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
| UI-01 | Phase 4 | Complete |
| UI-02 | Phase 4 | Complete |
| UI-03 | Phase 4 | Complete |
| UI-04 | Phase 4 | Partial (backend 04-01) |
| EVAL-01 | Phase 4 | Complete |
| EVAL-02 | Phase 4 | Complete |
| EVAL-03 | Phase 4 | Complete |
| EVAL-04 | Phase 4 | Complete |
| EVAL-05 | Phase 4 | Complete |
| UI-05 | Phase 5 | Complete |
| COMP-03 | Phase 5 | Complete |
| COMP-04 | Phase 5 | Complete |
| AGENT-01 | Phase 7 | Planned |
| AGENT-02 | Phase 7 | Planned |
| AGENT-03 | Phase 7 | Planned |
| AGENT-04 | Phase 7 | Planned |
| AGENT-05 | Phase 7 | Planned |
| AGENT-06 | Phase 7 | Planned |

---
*Last updated: 2026-04-16 for milestone v1.2 Agentic Search CLI kickoff*
