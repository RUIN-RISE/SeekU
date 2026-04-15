# Phase 7: CLI Search Agent Orchestration - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning
**Source:** Approved brainstorming spec and milestone kickoff

<domain>
## Phase Boundary

This phase introduces a CLI-first decision-oriented search agent on top of Seeku's existing search core.

The phase covers:

- agent-callable tool contracts around current search and inspect capabilities
- explicit session state for user goal, conditions, shortlist, compare set, confidence, and uncertainties
- structured 2-3 person compare as the mandatory pre-recommendation step
- recommendation gates that block unsupported certainty
- evaluation that checks both decision usefulness and non-regression on key search families

This phase does not cover:

- web parity
- ingestion orchestration
- outreach or recruiter operations
- generic multi-domain agent behavior

</domain>

<decisions>
## Implementation Decisions

### Product Shape
- Seeku remains an evidence-driven talent search engine, not a vector-database-first product.
- The new layer is a CLI search agent, not a general-purpose assistant.

### Agent Behavior
- The user-facing experience should feel free-form.
- Internally, the agent is constrained to clarify, search, narrow, compare, and decide actions.
- The first version must end at a 2-3 person compare plus a recommendation or explicit refusal.

### Safety / Honesty
- The agent may only recommend candidates that reached the active compare set.
- Every recommendation claim must be traceable to search reasons, structured evidence, sources, or compare advantages.
- Recommendation rights depend on explicit confidence classification.
- Low-confidence cases must produce conditional or refusal outcomes rather than unsupported certainty.

### Architecture
- The existing planner, retriever, reranker, and explanation layers remain the core evidence engine.
- Agent orchestration sits above the search core rather than replacing it.
- CLI is the only delivery surface in this phase.

### Evaluation
- Phase 7 must preserve the search-quality gains already recorded for controlled-open GitHub expansion.
- Non-regression on key families such as Q4, Q6, and Q8 is required.

</decisions>

<canonical_refs>
## Canonical References

**Downstream planning and implementation must read these before working.**

### Product and planning anchors
- `.planning/STATE.md` — current routing, milestone position, and v1.2 kickoff state
- `.planning/ROADMAP.md` — canonical phase list and success criteria for Phase 7
- `.planning/PROJECT.md` — current milestone framing and active requirements
- `.planning/REQUIREMENTS.md` — requirement ids including `AGENT-01` through `AGENT-06`

### Approved design
- `docs/superpowers/specs/2026-04-16-cli-search-agent-design.md` — approved design contract for the CLI search agent

### Current search and CLI core
- `apps/worker/src/search-cli.ts` — current script search entrypoint
- `apps/worker/src/cli/chat.ts` — current condition extraction and chat helper surface
- `apps/worker/src/cli/workflow.ts` — current CLI workflow and compare/refine logic
- `packages/search/src/planner.ts` — current query planning logic
- `packages/search/src/retriever.ts` — current hybrid retrieval logic
- `packages/search/src/reranker.ts` — current reranking logic

### Recent quality baseline
- `.planning/github-expansion/WS4-CONTROLLED-OPEN-CHECKPOINT-2026-04-15.md` — saved checkpoint baseline for Q4/Q6/Q8
- `.planning/github-expansion/V1.1-CONTROLLED-OPEN-CLOSEOUT-2026-04-15.md` — previous cycle closeout and routing boundaries

</canonical_refs>

<specifics>
## Specific Ideas

- Introduce explicit agent tools instead of having agent logic call arbitrary workflow internals.
- Move compare into a fixed contract with recommendation-ready output.
- Add a confidence state object that can block final recommendation.
- Keep the first version CLI-only to reduce integration surface and speed evaluation.

</specifics>

<deferred>
## Deferred Ideas

- web chat parity
- API-first session orchestration
- recruiter workflow outputs
- outreach drafting
- internal ops tool orchestration
- LangChain or other orchestration-framework adoption

</deferred>

---

*Phase: 07-cli-search-agent-orchestration*
*Context gathered: 2026-04-16 from approved spec and milestone kickoff*
