# 02-PLAN: Structured Compare Engine And Confidence Gates

## Goal

Turn compare into a fixed decision contract and block unsupported recommendations with explicit gates.

## Scope

- define the structured compare schema for 2-3 candidates
- implement evidence-backed compare dimensions
- implement confidence classification and recommendation gating
- define explicit low-confidence and conditional recommendation behaviors

## Tasks

1. Create a structured compare output model covering goal fit, evidence strength, technical relevance, source quality/recency, and uncertainty.
2. Implement compare generation over the active compare set only.
3. Add shortlist, evidence, and confidence gates before any final recommendation is allowed.
4. Add refusal / conditional recommendation outputs for weak evidence cases.
5. Test compare usefulness and unsupported-recommendation prevention.

## Validation

- compare tests over 2-3 candidate sets
- regression tests proving unsupported recommendation paths are blocked
- explicit low-confidence behavior tests

## Exit Criteria

- compare output is structured and recommendation-ready
- recommendation rights are gated by compare membership, evidence traceability, and confidence state
- low-confidence paths behave honestly instead of producing forced certainty
