# 04-PLAN: Regression Coverage, Stop-Quality Verification, And Milestone Acceptance

## Goal

Verify that the bounded mission runner improves task horizon without weakening current quality and honesty guarantees.

## Scope

- stop-quality verification
- compare-gating preservation
- honesty regression checks
- mission acceptance scenarios

## Tasks

1. Add regression coverage confirming that mission execution preserves compare gating and recommendation honesty.
2. Verify that each stop reason produces an explicit, user-readable outcome rather than a silent halt.
3. Re-run or extend saved quality checks for `Q4`, `Q6`, and `Q8`.
4. Define a milestone acceptance pass for:
   - mission start
   - multi-round bounded progression
   - course correction
   - automatic stop
   - final session summary
5. Document residual debt intentionally deferred beyond the first mission runner.

## Validation

- regression tests for honesty and compare gating
- stop-reason acceptance coverage
- preserved saved posture for `Q4`, `Q6`, and `Q8`
- milestone acceptance checklist pass

## Exit Criteria

- the mission runner stops clearly and honestly
- no existing recommendation-quality guarantees regress
- the first mission type is end-to-end verifiable in the chat-first product
