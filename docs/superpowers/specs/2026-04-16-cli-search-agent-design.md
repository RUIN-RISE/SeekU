# CLI Search Agent Design

Date: 2026-04-16
Project: Seeku
Status: Proposed
Scope: CLI-first agentic evolution for talent search

## Summary

Seeku should evolve into a CLI-first search agent, not a general-purpose agent platform and not a vector-database-first product.

The first version should behave like a free-form agent from the user's perspective, but remain tightly constrained by Seeku's existing evidence-driven search core. Its job is to move from an initial talent-search goal to a 2-3 person structured comparison and produce a clear recommendation, while explicitly avoiding confident recommendations that are not supported by evidence.

This design targets the current CLI chat/workflow surface first. It does not include web parity, ingestion orchestration, outreach automation, or autonomous back-office operations.

## Goal

Build a CLI search assistant that can:

- accept a loose hiring or talent-search goal
- decide whether to clarify, search, refine, inspect, or compare
- narrow toward a 2-3 person comparison set
- output a clear recommendation between those candidates
- refuse to overstate confidence when evidence is weak

## Non-Goals

The first version will not:

- replace the existing `planner / retriever / reranker` core
- become a generic tool-using assistant outside talent search
- run ingestion, sync, indexing, or eval jobs as part of the agent loop
- send outreach messages or generate recruiter operations workflows
- provide web-first UX or API-first session orchestration
- rely on pure vector similarity as the decision mechanism

## Product Positioning

Seeku remains an evidence-driven talent search engine.

The new agent layer is an orchestration surface on top of that engine. It should feel more autonomous than the current CLI flow, but it must still be grounded in:

- retrieved candidates
- structured evidence
- source visibility
- explicit comparison outputs

The correct mental model is:

- existing search core decides what evidence-backed candidates exist
- the agent decides how to move the conversation toward a decision
- the final recommendation is only allowed after a comparison-backed confidence check

## User Experience

### Primary User Journey

The first version should support this end-to-end journey in the CLI:

1. User states a goal in natural language.
2. Agent decides whether one short clarification is needed.
3. Agent runs search and returns an initial shortlist.
4. Agent decides whether to refine search conditions or inspect candidates.
5. Agent assembles a 2-3 person compare set.
6. Agent produces a structured comparison.
7. Agent recommends one candidate, or explicitly says that evidence is insufficient.

### Definition of Done

The first version is successful if it reaches a decision-oriented compare end state:

- a 2-3 person comparison is produced
- the agent states which candidate it recommends
- the recommendation is traceable to evidence
- the output includes uncertainty or risk when confidence is not high

The first version is not considered successful if it only chats more naturally but does not improve the user’s ability to choose between candidates.

## System Boundary

The first version is a decision-oriented search agent with a narrow domain boundary.

In scope:

- talent search goals
- clarification for search intent
- candidate retrieval and narrowing
- candidate inspection
- structured candidate comparison
- final recommendation or explicit non-recommendation

Out of scope:

- arbitrary general assistance
- external message sending
- internal pipeline orchestration
- corpus growth strategy
- autonomous long-running tasks

## Behavioral Model

The agent should appear free-form, but operate inside a constrained loop.

### Agent States

The internal loop has five states:

1. `clarify`
2. `search`
3. `narrow`
4. `compare`
5. `decide`

### State Semantics

`clarify`
- Used when the initial goal is too ambiguous to run a useful search.
- The agent may ask one short follow-up.
- The first version should cap clarification to 1-2 turns.

`search`
- Calls the existing search core.
- Produces a shortlist, not a final recommendation.

`narrow`
- Refines conditions, inspects candidates, or reduces result spread.
- Used when the shortlist is too broad or too noisy.

`compare`
- Selects 2-3 candidates for structured side-by-side evaluation.
- This is the mandatory gate before any final recommendation.

`decide`
- Outputs a recommendation, a conditional recommendation, or an explicit “not enough evidence” result.

### Stopping Rules

The agent should stop advancing and conclude when one of these is true:

- a valid 2-3 person compare result exists
- evidence remains too weak to support a recommendation
- the user goal is under-specified and requires a reset rather than more refinement

## Architecture

The design adds an agent orchestration layer without replacing the existing search stack.

### Core Layers

1. Search Core
- current `QueryPlanner`
- current `HybridRetriever`
- current `Reranker`
- current explanation / match reasoning logic

2. Tool Layer
- explicit agent-callable capabilities built around the CLI and search code

3. Session State Layer
- persistent per-conversation state for agent decisions

4. Agent Policy Layer
- chooses the next action
- decides when to ask, search, refine, compare, or stop

5. CLI Interaction Layer
- renders messages, result summaries, compare outputs, and next-step guidance

### Key Constraint

The agent policy layer must not bypass the search core. It is allowed to orchestrate the flow, but not to invent candidate decisions that are not supported by retrieved evidence and structured comparison.

## Tool Design

The first version should expose a small fixed toolset to the agent.

### `search_candidates`

Purpose:
- run the existing search pipeline from the current goal or conditions

Input:
- query text
- normalized conditions
- limit

Output:
- shortlist candidates with scores, reasons, sources, and freshness

### `inspect_candidate`

Purpose:
- inspect a single person in more detail before comparison

Input:
- person id

Output:
- detailed evidence, sources, and explanation-ready context

### `compare_candidates`

Purpose:
- generate a structured comparison across 2-3 selected candidates

Input:
- candidate ids
- optional focus, such as “RAG execution” or “hands-on engineering”

Output:
- side-by-side evaluation across shared dimensions

### `revise_query`

Purpose:
- refine conditions based on user feedback or weak results

Input:
- current conditions
- user feedback
- current shortlist signals

Output:
- revised conditions with an explicit delta from the previous state

### `assess_evidence_confidence`

Purpose:
- determine whether the current compare result is strong enough to support a recommendation

Input:
- compare result
- evidence coverage
- source quality
- unresolved uncertainty list

Output:
- `high-confidence`, `medium-confidence`, or `low-confidence`

### `final_recommendation`

Purpose:
- generate the final recommendation message only after comparison and confidence assessment

Input:
- compare result
- confidence status
- selected candidate

Output:
- a recommendation, or an explicit refusal to overstate certainty

## Session State Design

The first version needs an explicit session model rather than scattering state across ad hoc CLI flow variables.

### Required State Fields

- `userGoal`
- `currentConditions`
- `clarificationHistory`
- `searchHistory`
- `currentShortlist`
- `activeCompareSet`
- `compareResult`
- `confidenceStatus`
- `recommendedCandidate`
- `openUncertainties`

### Why This State Matters

The recommendation gate depends on state, not just one model response.

That means:

- the agent cannot recommend outside the active compare set
- confidence must be explicit, not implied
- unresolved uncertainty must be visible in state
- the system can explain why it decided to stop, refine, or refuse recommendation

## Compare Output Contract

The compare step is the heart of the product and should use a fixed structure.

The first version should compare candidates on:

- goal fit
- evidence strength
- technical relevance
- source quality and recency
- key risks or uncertainty

The final compare output should always contain:

- who is recommended
- why that candidate is stronger
- why the other candidate(s) were not selected
- the largest remaining uncertainty

This fixed structure reduces the risk of verbose but unhelpful comparison output.

## Anti-Hallucination Guardrails

This design is built around avoiding confident but weak recommendations.

### Gate 1: Candidate Gate

The agent may only recommend candidates that already passed through:

- search
- shortlist
- compare

It may not recommend directly from a broad search result list.

### Gate 2: Evidence Gate

Every positive recommendation claim must be traceable to at least one of:

- retrieval reasons
- structured evidence
- source information
- compare advantages

If a sentence cannot be tied back to evidence, it should not appear in the recommendation.

### Gate 3: Confidence Gate

After comparison, the system must classify the result:

- `high-confidence`
- `medium-confidence`
- `low-confidence`

Behavior:

- `high-confidence`: clear recommendation allowed
- `medium-confidence`: conditional recommendation allowed, with explicit caveats
- `low-confidence`: no recommendation; the system must suggest refinement or state that evidence is insufficient

### Required Failure Behaviors

The first version must explicitly support these outputs:

- “There is no strong recommendation in the current result set.”
- “This depends on whether you value X over Y.”
- “I do not have enough evidence to recommend one candidate yet.”

These are product successes, not failures, when evidence is weak.

## Data Flow

The intended flow is:

1. User provides a goal.
2. Agent checks if the goal is specific enough.
3. Agent optionally asks a short clarification.
4. Agent calls `search_candidates`.
5. Agent evaluates shortlist quality.
6. Agent either:
   - inspects candidates,
   - revises query,
   - or enters compare.
7. Agent calls `compare_candidates` on 2-3 candidates.
8. Agent calls `assess_evidence_confidence`.
9. Agent either:
   - calls `final_recommendation`, or
   - returns a low-confidence response and suggests refinement.

## Error Handling

The first version should handle errors conservatively.

### Retrieval Errors

- If search fails, the agent should report failure plainly and avoid pretending partial understanding.
- If partial results exist, they may be shown as incomplete, but must be labeled as such.

### Weak Result Sets

- If the shortlist is weak, the agent should prefer refine over forced compare.
- If compare still proceeds with weak evidence, the final result must default to conditional or no recommendation.

### State Drift

- If the conversation no longer matches the stored conditions, the agent should reframe or reset conditions rather than silently continuing from stale assumptions.

### Contradictory User Inputs

- If the user changes the target profile materially, the agent should acknowledge the shift and restart narrowing.

## Testing Strategy

The agent should be evaluated at three layers.

### 1. Tool Regression

The underlying search core must not regress.

At minimum:

- reuse existing search query families
- keep current checkpoint-sensitive families such as `Q4`, `Q6`, and `Q8` non-regressive
- verify that toolization does not change ranking quality unexpectedly

### 2. Agent Process Evaluation

Test whether the agent behaves sensibly:

- asks clarification only when needed
- searches once information is sufficient
- refines when results are noisy
- enters compare when the shortlist is decision-ready
- refuses recommendation when confidence is low

### 3. Decision Quality Evaluation

Test whether the compare output is useful:

- does it actually help decide between candidates
- are recommendation reasons evidence-backed
- are rejected candidates explained fairly
- are uncertainties called out clearly

### Acceptance Slice

The first version should be validated against 10-15 real search goals.

For each run, manually check:

- whether the agent made an unsupported recommendation
- whether it produced a useful 2-3 person compare
- whether the final recommendation is traceable to evidence
- whether weak cases ended honestly instead of overconfidently

If the agent becomes more conversational but less trustworthy, the design has failed.

## Rollout Strategy

The first delivery should be CLI-only and behind the existing chat/workflow surface.

Recommended sequence:

1. toolize current search and inspect flows
2. centralize session state
3. add constrained agent policy
4. add confidence-gated comparison and recommendation
5. run focused evaluation before any web adaptation

This keeps the first implementation small and preserves the ability to compare behavior against the current CLI flow.

## Risks

### Risk: Agent Feels Smart but Helps Less

The agent may sound more fluid while producing weaker compare outcomes.

Mitigation:
- evaluate compare usefulness, not just conversation quality

### Risk: Recommendation Gate Is Too Loose

If recommendation is allowed before compare and confidence checks, the agent will drift into unsupported decisions.

Mitigation:
- treat compare and confidence classification as hard gates

### Risk: Recommendation Gate Is Too Strict

If the agent refuses too often, it may feel inert.

Mitigation:
- allow medium-confidence recommendations with explicit caveats

### Risk: CLI Flow Becomes Too Heavy

Too many clarification turns will make the product feel like a form.

Mitigation:
- cap clarification count and bias toward early search

## Open Decisions Deferred

These are intentionally out of scope for this spec and should be handled later if the first version works:

- web chat parity
- API-first agent sessions
- recruiter workflow outputs
- outreach drafting
- internal ops tool orchestration
- external framework adoption such as LangChain

## Recommended Next Planning Step

Create a new post-cleanup milestone, tentatively:

- `v1.2 agentic-search-cli`

And split implementation into three phases:

1. toolization
2. session-state centralization
3. free-form agent policy with recommendation gates
