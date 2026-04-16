---
phase: "07"
status: completed
started: "2026-04-16"
completed: "2026-04-16"
plans_total: 4
plans_complete: 4
---

# Phase 7: CLI Search Agent Orchestration — Summary

## One-liner

Seeku CLI now runs as a bounded, evidence-driven search agent that can clarify briefly, search, narrow, compare 2-3 candidates, gate recommendations by confidence, and validate itself against saved acceptance and regression baselines.

## What Was Built

### 01-PLAN: Agent Tools And Session State

- Added explicit agent-callable tool contracts above the existing search core.
- Centralized session state for:
  - user goal
  - normalized conditions
  - shortlist
  - compare set
  - confidence state
  - open uncertainties
- Preserved compare membership and recommendation validity through session transitions.

### 02-PLAN: Structured Compare Engine And Confidence Gates

- Added a fixed compare contract for 2-3 candidates with shared decision dimensions:
  - goal fit
  - evidence strength
  - technical relevance
  - source quality / recency
  - uncertainty
- Added explicit compare outcomes:
  - `clear-recommendation`
  - `conditional-recommendation`
  - `no-recommendation`
- Blocked unsupported recommendations unless compare membership, evidence traceability, and confidence state all pass.

### 03-PLAN: Bounded Free-Form Agent Policy

- Added a policy layer that chooses between:
  - `clarify`
  - `search`
  - `narrow`
  - `compare`
  - `decide`
- Limited clarification depth to avoid form-like interrogation.
- Biased toward early search when the query already contains enough role/skill signal.
- Let the CLI auto-converge to compare when shortlist quality is already decision-ready.

### 04-PLAN: Agent Eval Harness And Acceptance Validation

- Added `agent-eval` CLI command for repeatable agent validation.
- Added 12 acceptance fixtures covering:
  - unnecessary clarification avoidance
  - narrow vs compare routing
  - clear / conditional / refusal recommendation behavior
- Added regression checks over saved `Q4/Q6/Q8` baselines using:
  - `.planning/github-expansion/snapshots/ws4-rerun-2026-04-15-controlled-open-followup`
- Added manual review checklist at:
  - `docs/product/CLI_AGENT_EVAL_HARNESS_2026-04-16.md`

## Requirements Closed

- `AGENT-01`: CLI agent autonomously chooses among clarify, search, refine/narrow, compare, and decide
- `AGENT-02`: Session state persists goal, conditions, shortlist, compare set, confidence, and uncertainties
- `AGENT-03`: Structured 2-3 person compare on shared decision dimensions
- `AGENT-04`: Recommendation gated by compare membership, evidence traceability, and confidence
- `AGENT-05`: Low-confidence paths return conditional recommendation or explicit refusal
- `AGENT-06`: Acceptance and regression eval harness verifies compare usefulness and non-regression on `Q4/Q6/Q8`

## Verification

- Worker typecheck passed after each plan batch and final integration pass.
- Final worker validation passed:
  - `agent-policy.test.ts`
  - `agent-state.test.ts`
  - `agent-tools.test.ts`
  - `agent-eval.test.ts`
  - `chat.test.ts`
  - `workflow.test.ts`
  - `renderer.test.ts`
  - `honesty.test.ts`
  - `search-cli.test.ts`
- Final result:
  - `9` test files
  - `80` tests passing
- `agent-eval --json` passed with:
  - acceptance: `12 / 12`
  - regression: `3 / 3`
  - `Q4`: `watch-but-stable`
  - `Q6`: `pass`
  - `Q8`: `pass`

## Key Decisions

1. Keep the existing `planner / retriever / reranker` stack as the evidence engine and add orchestration above it instead of replacing it.
2. Treat compare as the mandatory pre-recommendation gate.
3. Prefer refusal or conditionality over unsupported certainty.
4. Reuse the saved controlled-open WS4 snapshots as the regression baseline instead of inventing a new ranking benchmark.

## Files Added Or Extended

- `apps/worker/src/cli/agent-state.ts`
- `apps/worker/src/cli/agent-tools.ts`
- `apps/worker/src/cli/agent-policy.ts`
- `apps/worker/src/cli/agent-eval.ts`
- `apps/worker/src/cli/agent-eval-fixtures.ts`
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/renderer.ts`
- `apps/worker/src/cli/exporter.ts`
- `apps/worker/src/cli.ts`
- `docs/product/CLI_AGENT_EVAL_HARNESS_2026-04-16.md`

## Closeout

- Phase 7 is complete.
- Milestone `v1.2 Agentic Search CLI` is complete.
- Default next move is no longer a new `05-PLAN`; it is milestone closeout / ship routing or definition of the next milestone.
