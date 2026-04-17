# Seeku Daily Deal Flow Design

Date: 2026-04-17
Project: Seeku
Status: Approved for planning
Owner: Codex + Ross Cai

## Summary

Seeku should add a proactive product layer above its shipped search-agent runtime: a daily cofounder deal flow for one specific user.

The first version is not a general recommendation feed and not a CRM. It is a daily in-product list of `5-10` people from Seeku's existing candidate corpus who are worth contacting today because they appear directionally aligned with the user's cofounder goal.

The defining product promise is:

- the system maintains a lightweight model of the user's current cofounder-seeking goal
- the system compares that goal against candidate public-expression profiles
- the system proactively assembles a daily ranked opportunity list
- each recommendation explains `why this person`, `why now`, and `how to approach`
- user feedback and behavior shape the next day's list

## Why This Exists

Seeku has already shipped:

- an evidence-driven search core
- a bounded CLI search agent
- a visible copilot panel for agent execution state

What it does not yet do is operate on the user's behalf over time.

The next step toward a more agentic product is not more hidden search orchestration. It is a persistent operator-facing layer that learns the user's cofounder goal, notices where recent behavior shifts, and proactively delivers a daily opportunity pipeline.

The product direction is therefore:

- from reactive search to proactive opportunity surfacing
- from "find candidates when asked" to "maintain a living deal flow"
- from generic matching to a strong opinionated cofounder pipeline

## Product Goal

Build an in-product `Daily Deal Flow` that helps the user find `cofounder-type people` to contact.

The first version is successful if it does all of the following:

- produces a daily list reliably
- ranks primarily by `goal-direction match`
- gives clear, action-oriented reasons for each person
- tells the user how to approach each person
- learns from explicit and implicit feedback
- preserves the existing search/runtime quality bar rather than replacing it

## Non-Goals

The first version will not:

- replace the shipped CLI search agent as the product's authoritative runtime
- become a general social graph or relationship management system
- send outbound messages automatically
- push outside Seeku to email, IM, or notification channels
- expand the corpus to the full internet
- optimize primarily for reachability, virality, or engagement volume
- deeply infer personality or private intent beyond product-local evidence

## Product Definition

### Core Object

The product is a daily `cofounder deal flow`.

It is not:

- a passive recommendation carousel
- a search results page saved for later
- an "AI understands everything about you" narrative layer without action

It is:

- a ranked daily pipeline of people worth contacting
- organized around direction match and contactability guidance
- opinionated enough to surface uncertain opportunities instead of over-filtering them away

### First-Version User Intent

The first version is optimized for one user intent:

- the user is looking for `cofounder-type people`
- the user's highest-priority match signal is `goal-direction match`
- the user's desired output is a list of `people to contact`

### Output Shape

Each daily list contains `5-10` candidates from Seeku's existing corpus.

The list is split into:

- `Top 3 today`
- `More opportunities`

Each candidate is assigned one bucket:

- `new`
- `high-confidence`
- `needs-validation`
- `revisit`

The list may also include one short `drift note` if recent behavior suggests the user's short-term focus is shifting.

## User Experience

### Daily Entry Point

The user opens Seeku and lands on a dedicated deal flow surface, separate from the reactive search workflow.

The page answers one question:

- `who should I contact today?`

### Candidate Card Requirements

Every candidate card must show:

- `name / headline`
- `bucket`
- `direction match summary`
- `why now`
- `approach path`
- `confidence`
- `actions`

The actions in v1 are limited to:

- `感兴趣`
- `不感兴趣`
- `已联系`
- `稍后再看`

### Card Semantics

`direction match summary`
- one short explanation of why this person appears aligned with the user's cofounder goal

`why now`
- one short explanation of why the person appears worth acting on today, not just in general

`approach path`
- a concrete first-contact angle such as school, project, shared topic, or public-expression angle

`confidence`
- high / medium / low
- plus one sentence about what the system knows or does not know

### Drift Note

When the user's explicit goal and recent behavior diverge, show a short note at the top such as:

- the user is still modeled as seeking one direction long-term
- recent behavior has shifted toward another direction
- today's list slightly reweights the latter without abandoning the former

The note should be short, visible, and non-blocking. It should not force a settings update before the user can proceed.

## System Structure

The first version should use five bounded modules.

### 1. User Goal Model

Purpose:

- maintain a structured view of the user's current cofounder-seeking goal

Inputs:

- explicit long-term goal statements
- recent Seeku search behavior
- detail views and repeated views
- explicit feedback actions
- historical contacted / skipped / revisit states

Outputs:

- primary direction tags
- recent-direction drift signal
- negative direction tags
- feedback-weight summary
- daily curation preferences

Important constraint:

- this is a product-local user model, not a broad personality model

### 2. Candidate Direction Profile

Purpose:

- summarize what each candidate publicly appears to want to build or care about

Priority evidence in v1:

- bio
- headline
- public self-description
- project descriptions
- organization / community labels
- theme keywords already present in indexed evidence

Important constraint:

- v1 prioritizes `public expression`, not deep behavioral inference

### 3. Opportunity Scorer

Purpose:

- compare the user's goal model with each candidate direction profile

Outputs per candidate:

- `directionMatchScore`
- `confidence`
- `whyMatched`
- `whyUncertain`
- `suggestedApproachPath`
- `whyNow`

Primary ranking rule:

- `direction match` is the main driver and a soft gate
- all other factors can only tune ordering around it

### 4. Daily Deal Flow Curator

Purpose:

- transform scored candidates into a stable, varied daily list

Responsibilities:

- choose `5-10` entries
- assign buckets
- separate `Top 3 today` from the rest
- limit obvious repetition
- deliberately re-surface some deferred opportunities
- keep the list from collapsing into one noisy cluster

### 5. Feedback Loop

Purpose:

- update tomorrow's list based on today's choices

Explicit signals:

- interested
- not interested
- contacted
- revisit later

Implicit signals:

- profile detail opened
- evidence expanded
- repeated candidate revisits
- dwell time
- copy / outbound-intent actions when available

Important constraint:

- feedback updates the `user model` and `ranking weights`
- feedback does not rewrite the candidate's objective direction profile

## Ranking Logic

The first version should use an interpretable weighted score.

### Primary Factor

`direction match`

- highest-weight factor
- compares the user's current cofounder direction with the candidate's public-expression direction
- direction mismatch must not be rescued into the top of the list by secondary factors alone

### Secondary Factors

`freshness`
- gives modest preference to candidates the user has not seen too often recently

`reachability`
- gives modest preference when there is an identifiable approach path or relationship-adjacent entry

`engagement fit`
- raises or lowers rank based on feedback patterns around similar candidates or similar directions

`revisit pressure`
- brings back previously deferred candidates at controlled intervals

### Confidence Model

Confidence should be based on the clarity of public-expression evidence and the consistency of those signals.

Example interpretation:

- `high`: clear direction signal, coherent rationale, usable approach path
- `medium`: plausible direction signal with some gaps
- `low`: candidate still worth surfacing, but alignment or approach path is under-supported

Low confidence does not automatically exclude a person from the list. It changes bucketing and explanation tone.

## Bucketing Rules

### `high-confidence`

Use when:

- direction signal is clear
- recommendation rationale is complete
- approach path is present

### `new`

Use when:

- the person is a fresh opportunity for the user
- match signal is workable
- no meaningful previous progression exists

### `needs-validation`

Use when:

- there is upside
- the candidate is not directionally disproven
- evidence is incomplete enough that the user should probe lightly first

### `revisit`

Use when:

- the user previously deferred, ignored, or nearly acted
- the candidate still looks relevant
- the system decides today is a reasonable point to re-surface them

## Data Flow

The daily generation loop should be:

1. read the current `User Goal Model`
2. gather recent explicit and implicit user signals
3. fetch eligible candidates from the existing Seeku corpus
4. load or derive `Candidate Direction Profiles`
5. compute opportunity scores and rationales
6. assign buckets
7. curate the daily list
8. save the list as a dated artifact for the user session
9. render in the dedicated deal flow surface

Feedback loop:

1. user interacts with cards
2. explicit actions and implicit behavior are recorded
3. the next-day model update adjusts user-goal weighting and candidate priority
4. drift logic decides whether to show a drift note

## Relationship To Existing Seeku Runtime

The shipped CLI runtime remains intact.

This design does not replace:

- the search core
- the CLI agent session state
- the visible copilot event bridge

Instead, the new layer sits above them:

- reactive search still answers direct search intent
- the daily deal flow provides proactive opportunity curation

This boundary matters because Seeku already has a tested evidence-driven engine. The deal flow should consume and reframe that foundation, not fork into a second contradictory product brain.

## Error Handling And Safety

### Failure Modes

The product must handle:

- no daily list generated
- too few viable candidates
- repeated overexposure of the same people
- weak candidate direction evidence
- user model drift becoming noisy or contradictory

### Safe Degradation

If daily generation fails:

- show the last successful deal flow if it is still recent
- clearly mark it as not newly generated today

If too few strong matches exist:

- allow the list to shrink
- keep explanations honest
- do not pad with obvious direction mismatches merely to hit a quota

If confidence is weak:

- surface more `needs-validation` entries
- explain uncertainty instead of suppressing all output

### Product Honesty

The system must never imply:

- guaranteed compatibility
- confirmed cofounder intent from the candidate
- private knowledge beyond the visible evidence

Recommendation language must stay grounded in:

- apparent direction
- visible expression
- model confidence

## Testing And Evaluation

The first version should be evaluated as a product behavior, not only a scoring function.

### Acceptance Criteria

The phase is acceptable if:

- a daily list is generated reliably
- each candidate card includes `why matched`, `why now`, and `approach path`
- explicit feedback changes subsequent results in a visible way
- low-confidence candidates are clearly marked
- the experience remains distinct from a generic search result list

### Suggested Product Metrics

- daily generation success rate
- duplicate-candidate rate within a rolling window
- `Top 3` open rate
- explicit `interested` rate
- explicit `contacted` rate
- `not interested` rate
- `revisit` reopen rate
- distribution of confidence buckets over time

### Qualitative Review

The core qualitative question for internal use is:

- does this list actually make the user want to contact someone today?

If the answer is no, the product is not succeeding even if scoring outputs look coherent.

## First Delivery Slice

The first implementation phase should be a narrow end-to-end skeleton.

### Build In Phase 1

- minimal `User Goal Model`
- initial `Candidate Direction Profile` extraction based on public-expression fields
- interpretable `Opportunity Scorer`
- daily curation job or on-demand daily builder
- dedicated web surface for the deal flow
- four explicit feedback actions
- basic implicit behavior logging
- one-line drift note support

### Do Not Build In Phase 1

- external push delivery
- auto-generated outreach execution
- full relationship CRM
- heavy long-term memory machinery
- full-web + CLI unification of all agent flows
- whole-internet opportunity sourcing

## Recommended Next Step

After this design is approved, the next milestone should define a first phase focused on:

- generating a credible daily deal flow from the existing Seeku corpus
- proving that feedback changes tomorrow's list
- validating that the surface drives real contact intent rather than passive browsing

If the internal user does not return to this page daily or does not act on the list, the product should be corrected before any expansion into push notifications, broader sourcing, or message automation.
