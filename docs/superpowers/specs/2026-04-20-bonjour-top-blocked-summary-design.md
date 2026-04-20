# Seeku Bonjour Top Blocked Summary Design

Date: 2026-04-20
Project: Seeku
Status: Approved for implementation
Owner: Codex + Ross Cai

## Summary

Seeku should add a compact blocked-summary report to the Bonjour fresh-auth probe flow.

The current flow already writes detailed files for:

- overall run summary
- blocked reason counts
- per-handle blocked attribution

That is enough to explain a zero-output run, but it is still too expensive to inspect by hand because the operator has to open the per-handle attribution file and mentally aggregate the main offender.

The next step is to add one small derived report that answers the first triage question immediately:

- which historical exclude file or prior campaign stage blocked the most fresh candidates

## Why This Exists

The latest verified zero-output case was not mysterious after instrumentation was added.

It was explainable, but only after reading the detailed blocked-handle attribution and noticing that all blocked handles traced back to the same historical fresh-auth probe import file.

That exposed a usability gap in the current reporting shape:

- the flow now records the right evidence
- the operator still has to do manual aggregation to understand the dominant blocker

This design closes that gap without changing seed selection behavior or auto-exclude policy.

## Product Goal

Add a compact report that lets an operator identify the top historical blocker in one read.

The first version is successful if it does all of the following:

- writes a new `top-blocked-summary.json` file for each fresh-auth probe run
- derives that file only from existing blocked attribution data
- keeps existing report formats intact
- adds the new file path to `summary.json`
- makes the dominant exclude file and dominant prior campaign stage obvious without opening the full per-handle report

## Non-Goals

The first version will not:

- change auto-exclude policy
- change seed ranking or filtering logic
- rewrite historical output artifacts
- replace `recent-seed-blocked-handles.json`
- replace `blocked-reasons.json`
- introduce a new CLI command or UI surface for reading the summary

## Product Definition

### Report Ownership

The new summary belongs to the fresh-auth probe orchestration layer, not the seed builder.

The seed builder should remain responsible for:

- seed merge and ranking
- exclusion filtering
- exclusion counters

The orchestration layer should remain responsible for:

- collecting run artifacts
- deriving operator-facing summary reports
- writing file-path references into the run summary

This keeps screening logic and reporting logic separate.

### Output Location

Each run should write:

- `top-blocked-summary.json` in the same campaign directory as `summary.json`

`summary.json` should add:

- `reports.topBlockedSummaryPath`

No other existing file names or contracts should change.

## Output Contract

### Required Fields

`top-blocked-summary.json` should contain:

- `recordedAt`
- `campaignTag`
- `blockedHandleCount`
- `blockedHandleCountsBySourceType`
- `topExcludeFiles`
- `topCampaignStages`
- `sampleBlockedHandles`

### Top Exclude Files

`topExcludeFiles` should aggregate all `matchedExcludeSources` by `excludeFile`.

Each entry should include:

- `excludeFile`
- `count`
- `sourceType`
- `campaignTag`
- `campaignStage`
- `sampleHandles`

This section answers:

- which concrete file blocked the most fresh candidates

### Top Campaign Stages

`topCampaignStages` should aggregate all `matchedExcludeSources` by:

- `campaignTag`
- `campaignStage`

Each entry should include:

- `campaignTag`
- `campaignStage`
- `count`
- `sampleExcludeFiles`

This section answers:

- which prior experiment round or stage is dominating the exclusions

### Sample Blocked Handles

`sampleBlockedHandles` should include a short sample of blocked handle rows so the operator can sanity-check the aggregation without opening the full attribution file.

Each sample entry should keep:

- `handle`
- `name`
- `matchedExcludeSources`

The sample should be intentionally small and should not duplicate the full detailed report.

## Data Flow

### Inputs

The report should be derived from the existing:

- `recent-seed-blocked-handles.json`

It may also reference existing summary metadata such as:

- current `campaignTag`

No new raw instrumentation should be added for the first version.

### Aggregation Rules

Aggregation should treat each `matchedExcludeSources` entry as one attribution event.

That means:

- `blockedHandleCount` remains the number of unique blocked handles from the source file
- `topExcludeFiles` counts attribution events grouped by `excludeFile`
- `topCampaignStages` counts attribution events grouped by `campaignTag + campaignStage`

If one blocked handle matched multiple exclude sources, each matched source contributes to the grouped counts.

This preserves fidelity with the detailed attribution file instead of flattening multi-match cases into a single guess.

### Sorting

Grouped outputs should sort by:

1. `count` descending
2. stable lexical tiebreakers

This keeps results deterministic and easy to diff across runs.

## Error Handling

The summary generation must not break the primary probe summary flow.

If the blocked attribution file is:

- missing
- unreadable
- not an array
- partially missing expected fields

the orchestration should still write `top-blocked-summary.json` with zero-value arrays and counts instead of exiting the run with an error.

This is a diagnostic convenience report, not a hard dependency of the probe.

## Testing And Verification

The first verification target is the existing 2026-04-18 `bonjour-fresh-auth-probe-test9` output.

Acceptance criteria:

- rerunning the summary logic writes `top-blocked-summary.json`
- `summary.json` gains `reports.topBlockedSummaryPath`
- `top-blocked-summary.json` reports `blockedHandleCount = 8`
- `topExcludeFiles[0]` points to `bonjour-fresh-auth-probe-test2-probe/import-handles.json`
- `topExcludeFiles[0].count = 8`
- `topCampaignStages[0]` reports `campaignTag = bonjour-fresh-auth-probe-test2` and `campaignStage = probe`
- existing `blocked-reasons.json` content stays unchanged
- existing `recent-seed-blocked-handles.json` content stays unchanged

## Implementation Notes

Implementation should modify:

- `scripts/run_bonjour_fresh_auth_probe.sh`

Implementation should not modify:

- `apps/worker/src/cli/build-bonjour-fresh-auth-seeds.ts`

The first version should stay as a small orchestration-layer extension rather than a wider refactor.
