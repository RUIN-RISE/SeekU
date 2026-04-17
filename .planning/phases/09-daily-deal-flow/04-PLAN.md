# 04-PLAN: Drift Logic, Learning Loop, And Acceptance

## Goal

Close the learning loop so today's feedback influences tomorrow's list, while validating product honesty and milestone quality.

## Scope

- drift-note generation
- feedback-to-ranking update path
- milestone acceptance and product-quality review
- non-regression on existing search/runtime posture

## Tasks

1. Implement the first version of drift detection from explicit long-term goals versus recent behavior signals.
2. Add a short drift-note presentation rule that explains reweighting without blocking use of the list.
3. Connect explicit and implicit feedback so subsequent deal flows visibly change in rank, bucket, or surfaced direction clusters.
4. Define and run a milestone acceptance pass that covers daily generation, explanation completeness, feedback effects, and honesty under low confidence.
5. Re-run saved or equivalent regression checks to confirm the proactive layer does not weaken the shipped `Q4/Q6/Q8` posture.

## Validation

- tests for drift-note emission conditions
- tests proving feedback changes subsequent curation results
- milestone acceptance checklist pass
- preserved regression posture on core search-quality watch items

## Exit Criteria

- drift-note logic works and remains understandable
- feedback measurably affects future lists
- v1.4 acceptance passes without weakening the existing evidence-driven quality bar
