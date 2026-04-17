# Phase 09: Daily Deal Flow - Context

**Gathered:** 2026-04-17
**Status:** Ready for execution
**Source:** Approved design spec and milestone kickoff

<domain>
## Phase Boundary

This phase adds a proactive daily cofounder deal flow above Seeku's shipped search-agent and visible-copilot baseline.

The phase covers:

- user goal modeling for cofounder-seeking direction
- candidate direction profiling from public-expression evidence
- interpretable opportunity scoring and daily curation
- a dedicated web surface for the daily deal flow
- explicit feedback and basic implicit behavior capture
- drift-note handling and milestone acceptance validation

This phase does not cover:

- outbound message sending
- external push notifications
- whole-internet sourcing
- a full relationship CRM
- replacing the existing search runtime or web chat workflow

</domain>

<decisions>
## Implementation Decisions

### Product Shape
- Seeku remains an evidence-driven AI talent engine, but the next milestone adds a proactive `cofounder deal flow`.
- The first version optimizes for one user and one high-value use case: surfacing people worth contacting.

### Matching Priority
- Primary ranking signal is `goal-direction match`.
- Public-expression evidence is the first-version source of truth for candidate direction.
- Secondary factors may tune order but may not rescue obvious direction mismatches into the top of the list.

### User Model
- The user goal model combines explicit long-term goal statements with recent Seeku behavior.
- Goal drift should be surfaced as a short explanatory note rather than forced settings reconciliation.

### Product Boundary
- The deal flow is an in-product proactive surface, not an outbound notification system.
- The shipped CLI runtime and search stack remain authoritative foundations rather than being replaced.

### Quality
- Low-confidence opportunities may still be surfaced, but must be labeled honestly.
- Preserve recommendation honesty and saved `Q4/Q6/Q8` quality posture while adding the proactive layer.

</decisions>

<canonical_refs>
## Canonical References

**Downstream planning and implementation must read these before working.**

### Product and planning anchors
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`

### Approved design
- `docs/superpowers/specs/2026-04-17-daily-deal-flow-design.md`

### Existing runtime and search foundations
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/agent-state.ts`
- `packages/search/src/retriever.ts`
- `packages/search/src/reranker.ts`
- `apps/api/src/routes/search.ts`

### Existing web surfaces
- `apps/web/src/app/chat/page.tsx`
- `apps/web/src/components/ChatInterface.tsx`
- `apps/web/src/hooks/useChatSession.ts`
- `apps/web/src/lib/api.ts`

### Quality baseline
- `.planning/phases/08-cli-agent-panel/SUMMARY.md`
- `.planning/phases/07-cli-search-agent-orchestration/SUMMARY.md`

</canonical_refs>

<specifics>
## Specific Ideas

- Start with a dedicated deal flow page or panel rather than folding the proactive list into the reactive chat results.
- Use a stored daily artifact or on-demand daily builder so the list has a date boundary and repeatable acceptance behavior.
- Keep recommendation reasoning short and operational: `why this person`, `why now`, `how to approach`, `how sure`.
- Keep feedback semantics user-centric; feedback updates ranking and user-goal weighting, not the candidate's objective profile.

</specifics>

<deferred>
## Deferred Ideas

- External message delivery
- Auto-generated outreach execution
- Full operator CRM for relationship stages
- Global corpus expansion beyond existing Seeku records
- Rich personality or private-intent inference

</deferred>

---

*Phase: 09-daily-deal-flow*
*Context gathered: 2026-04-17 from approved spec and milestone kickoff*
