---
phase: 04-ui-evaluation
status: planning
created: 2026-03-29
---

# Phase 4: UI & Evaluation - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can search, view results, and validate search quality through benchmarks.

**Dual Output Requirement:**
1. **CLI Version** - Agent-friendly interface for automation and integration
2. **Web Frontend Version** - Beautiful UI using `frontend-slides` skill

</domain>

<decisions>
## Implementation Decisions

### Dual Interface Strategy
- CLI comes first (smaller scope, faster validation)
- Web frontend second (using frontend-slides skill)
- Both interfaces share the same search API backend

### CLI Version (Agent-Friendly)
- Command-line search interface
- JSON output format for parsing
- Scriptable and automatable
- Direct integration with existing worker CLI

### Web Frontend Version
- Use `frontend-slides` skill for UI design
- Modern, visually appealing interface
- Search input with natural language queries
- Results display with candidate cards
- Evidence preview and detail views

### Evaluation System
- Benchmark dataset for search quality
- Precision@K metrics
- Coverage metrics
- Admin dashboard for eval results

### Claude's Discretion
- Specific CLI commands and flags
- Web framework choice (React/Vue/Svelte)
- Component structure
- Styling approach
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Search API
- `apps/api/src/routes/search.ts` — POST /search endpoint
- `packages/search/src/planner.ts` — Query intent parsing
- `packages/search/src/retriever.ts` — Hybrid retrieval
- `packages/search/src/reranker.ts` — Evidence-weighted reranking

### Existing Worker CLI
- `apps/worker/src/cli.ts` — Current CLI structure

### Skills
- `frontend-slides` skill — Use for UI design

</canonical_refs>

<specifics>
## Specific Ideas

### CLI Commands
```bash
# Search via CLI
seeku search "AI工程师 Python 北京" --json

# Interactive mode
seeku search -i

# Get candidate details
seeku show <person-id>
```

### Web UI Components
- Search bar with placeholder examples
- Result cards showing name, headline, match score
- Match reasons tags
- Evidence preview (projects, repos)
- Candidate detail modal/page
- Eval benchmark dashboard

</specifics>

<deferred>
## Deferred Ideas

- Real-time search suggestions
- Saved searches
- Advanced filters UI
- Export results
- Batch operations

</deferred>

---

*Phase: 04-ui-evaluation*
*Context gathered: 2026-03-29*