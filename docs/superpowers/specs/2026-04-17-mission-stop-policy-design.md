# Seeku Mission Stop Policy Design

Date: 2026-04-17
Project: Seeku
Status: Approved for planning
Owner: Codex + Ross Cai

## Summary

Seeku should harden the first bounded mission runner so it stops later, more honestly, and more explicitly when evidence is still weak.

The immediate product problem is not that the mission cannot stop. It is that the current stop policy can stop too early once a small compare set appears, even when the search has not yet crossed a credible exploration floor.

This design changes the stop policy so that:

- the mission must clear a minimum exploration floor before auto-stop is allowed
- `reportable` is distinct from `recommendable`
- the default stop output is `shortlist / compare first`, not `top1 first`
- scattered results should stop at `needs_user_clarification` instead of forcing a weak low-confidence wrap-up

## Why This Exists

The shipped frontstage mission runner already does the following:

- starts a bounded mission from chat
- runs multiple rounds in one foreground session
- accepts natural-language course corrections
- stops automatically with an explicit stop reason

The current weakness is stop quality.

Right now, the mission can auto-stop when a small compare set appears after only a small number of rounds. That creates an avoidable failure mode:

- the user sees a plausible early result
- the runtime treats it as convergence too quickly
- the product presents a stronger posture than the evidence actually supports

The next iteration should therefore focus on one narrow objective: reduce early stopping without turning the product into a slow, over-cautious workflow.

## Product Goal

Refine the mission stop policy so that Seeku:

- does not auto-stop on thin early evidence
- can still produce an interim report once the result is useful
- avoids making a premature recommendation
- asks for clarification when the search remains noisy after the extra exploration allowance

The first version is successful if it does all of the following:

- prevents `enough_compare` from firing too early
- keeps the mission bounded rather than open-ended
- returns a user-readable `shortlist / compare` report before making a recommendation
- routes noisy missions to `needs_user_clarification`
- preserves current honesty and compare-gating posture

## Non-Goals

This change will not:

- redesign the full mission runner architecture
- add background missions or multi-session continuity
- introduce a probabilistic ranking model or learned stop scorer
- make the system always wait for a final recommendation before stopping
- replace chat-first steering with explicit operator controls

## Problem Statement

The current stop policy is too close to:

- "a few strong-looking candidates appeared"
- "compare is technically possible"
- "there were no obvious new top picks in the latest round"

That is not yet the same as:

- the mission explored enough breadth
- the compare set is stable enough to trust
- the system is justified in recommending one person

The product should therefore separate three ideas that are currently too compressed:

1. the mission has found something worth showing
2. the mission has explored enough to stop
3. the mission has enough evidence to recommend

## Preferred Approach

Use a `conservative evidence gate`.

This approach adds explicit, readable policy rules rather than relying only on marginal-gain heuristics.

Why this is the right fit:

- it directly targets the observed early-stop failure mode
- it keeps behavior inspectable and testable
- it aligns with the product preference of "run a bit longer, but report before overcommitting"

Alternative approaches considered but not chosen:

- `pure marginal-gain heuristic`
  - too easy to confuse "no visible change this round" with "safe to stop"
- `user-checkpoint-first stop policy`
  - safer, but pushes too much stop responsibility back to the user

## Stop Policy

### Core Rule

Auto-stop should change from `found something plausible` to `crossed a minimum exploration floor and now has something reportable`.

### Exploration Floor

The mission should not auto-stop for `enough_compare` or `enough_shortlist` until it has completed a minimum exploration floor.

For the first hardening pass, the minimum floor is:

- at least `3` rounds of mission execution

This is intentionally simple. The goal is not to discover the perfect stopping formula in one iteration. The goal is to remove the most obvious early-stop behavior with a small, explicit rule.

### Reportable Versus Recommendable

The stop policy should distinguish `reportable` from `recommendable`.

`reportable`
- there is enough output to show the user a credible current state
- this may be a shortlist or a compare set
- this does not imply the runtime should recommend a top candidate

`recommendable`
- evidence is strong enough to present a leading candidate as the default next move
- this requires a stricter threshold than "compare exists"

Under this design, the default stop posture after the exploration floor is:

- report `shortlist / compare`
- do not automatically provide `top1`

### Enough Compare

`enough_compare` may fire only when all of the following are true:

- the exploration floor has been met
- the compare set is still stable at `2-3` candidates
- there is no material sign that another search round is still substantially improving the set

When this stop reason fires, the user-facing output should be:

- "I can stop here and show you the current compare set"
- not "I have already fully converged on one winner"

### Enough Shortlist

`enough_shortlist` may fire only when all of the following are true:

- the exploration floor has been met
- the shortlist is credible enough to review
- the latest additional round does not surface a clearly stronger replacement candidate

This is a valid stop even if the system cannot yet justify a recommendation.

### Low Marginal Gain

`low_marginal_gain` remains a valid stop category, but only after the exploration floor has been met.

It should be treated as a secondary stop reason, not the first line of stop behavior.

The intent is:

- do not stop early just because one round happened to look unchanged
- do stop once the runtime has already done the minimum additional work and the next round is unlikely to change the user-facing output

### Needs User Clarification

`needs_user_clarification` should become the preferred stop when the mission remains noisy after the extra exploration allowance.

This stop reason should fire when:

- the exploration floor has been met
- top picks remain unstable or scattered
- compare is still weak or not meaningfully formed
- another automatic round is more likely to amplify noise than improve confidence

When this happens, the product should stop cleanly and ask the user for one tighter direction instead of fabricating a weak result.

## State Semantics

The public mission phases can remain:

1. `running_search`
2. `narrowing`
3. `comparing`
4. `summarizing`
5. `stopped`

The change should happen in internal stop semantics rather than through a larger public state explosion.

The stop-policy layer should explicitly distinguish:

- `exploration_floor_not_met`
- `reportable_not_final`
- `clarification_blocked`

These do not need to become public product enums. They can remain internal helper outcomes that drive:

- stop decisions
- summary generation
- confidence copy
- whether `recommendedCandidate` is populated

## User Experience Changes

### Chat Thread

When the mission reaches a `reportable_not_final` stop, the assistant should say a version of:

- "I will stop here and show you the current shortlist / compare set."
- "This is enough to review, but not strong enough to default to one recommendation yet."

The assistant should not imply:

- final convergence
- decisive recommendation
- stronger evidence than the runtime actually has

### Right Rail

The workboard should align to the same stop semantics.

When the mission is `reportable_not_final`:

- `Focus` should prefer `shortlist` or `compare`
- `recommendedCandidate` should remain empty
- the rail should not visually imply that the mission has already converged on a winner

When the mission is `clarification_blocked`:

- `Now` should reflect that the mission has stopped
- `Why` should state that the direction is still too broad or noisy
- uncertainty copy should explicitly ask for one tighter direction

### Confidence Posture

Confidence should communicate:

- useful enough to inspect
- not strong enough to recommend

That is materially different from both:

- "nothing useful exists"
- "the mission is done and highly confident"

## Testing Strategy

The testing goal is not merely "the mission stops." The goal is "the mission no longer stops too early."

### Stop Policy Unit Tests

Extract the stop-policy logic into a pure helper and cover cases such as:

- round `2` has `2-3` promising compare candidates, but auto-stop is still blocked because the exploration floor is not met
- round `3` has a stable compare set, so `enough_compare` may now fire
- round `3` has a credible shortlist but not a strong compare set, so `enough_shortlist` may fire
- extra rounds still produce scattered top picks, so `needs_user_clarification` fires
- `low_marginal_gain` cannot fire before the exploration floor

### Hook Behavior Tests

Add `useChatSession` behavior coverage to confirm that:

- the mission actually runs through the new minimum round floor
- reportable stops do not populate `recommendedCandidate`
- the final assistant message reports `shortlist / compare` rather than a premature recommendation
- clarification stops update `stopReason`, `statusSummary`, and uncertainty state together

### UI Tests

Update workboard tests to confirm that:

- compare content can render without recommendation posture
- a clarification stop produces explicit "tighten the direction" copy
- the rail does not show recommendation framing when the mission is only reportable

## Acceptance Criteria

This design is complete when all of the following are true:

- the mission does not auto-stop at round `2` solely because `compare >= 2`
- automatic stop defaults to `shortlist / compare first`
- recommendation posture is withheld until stronger evidence rules are met
- noisy missions stop at `needs_user_clarification` instead of forcing a weak closing summary
- the stop outcome remains explicit, user-readable, and aligned between chat and right rail

## Open Implementation Notes

The first implementation pass should prefer:

- explicit helper functions over hidden inline thresholds
- readable stop-reason summaries over opaque confidence math
- a minimal ruleset that can be extended later if product evidence justifies it

Future iterations may later add:

- richer stability signals
- more nuanced compare-strength checks
- learned or data-driven stop heuristics

Those are intentionally out of scope for this hardening pass.
