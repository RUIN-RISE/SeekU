# CLI Agent Eval Harness

Date: 2026-04-16
Scope: Phase 7 / 04-PLAN

## Automated Harness

Command:

```bash
pnpm exec tsx apps/worker/src/cli.ts agent-eval --json
```

Default coverage:

- acceptance fixture set over 12 real talent-search goals
- process checks for:
  - unnecessary clarification
  - failure to converge to compare
  - honest no-recommendation behavior
  - conditional vs clear recommendation separation
- saved non-regression checks over:
  - `Q4` = `watch-but-stable`
  - `Q6` = `pass`
  - `Q8` = `pass`

Default snapshot baseline:

- `.planning/github-expansion/snapshots/ws4-rerun-2026-04-15-controlled-open-followup`

Override snapshot baseline:

```bash
pnpm exec tsx apps/worker/src/cli.ts agent-eval --json --snapshot-dir /abs/path/to/snapshots
```

## Manual Review Checklist

Run this manual pass when the agent loop, compare contract, or ranking behavior changes materially.

Use 3-5 representative goals from the acceptance fixture set and confirm:

1. The agent asks at most one clarification before searching unless the input is completely underspecified.
2. Search-ready goals move into shortlist immediately instead of stalling in clarify.
3. When shortlist already contains 2-3 comparable candidates, the flow converges into compare rather than drifting into open-ended chat.
4. Compare output names concrete evidence, source visibility, and uncertainty.
5. A clear recommendation only appears when the lead is materially stronger.
6. Medium-confidence cases stay conditional instead of sounding final.
7. Weak-evidence cases stop at compare or refusal rather than forcing a winner.
8. `Q4` still shows visible GitHub technical lift near the head results.
9. `Q6` stays out of zero-result regression and remains GitHub-heavy.
10. `Q8` remains GitHub-led for open-source builder / founder intent.

## Review Threshold

Treat the batch as acceptable only if:

- automated harness passes end to end
- no saved `Q4/Q6/Q8` baseline regresses
- manual review does not surface unsupported recommendation language
