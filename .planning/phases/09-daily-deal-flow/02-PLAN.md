# 02-PLAN: Opportunity Scoring And Daily Curation Pipeline

## Goal

Turn modeled user goals and candidate direction profiles into a daily ranked opportunity list with clear buckets.

## Scope

- interpretable scoring
- confidence classification
- daily list generation
- bucket assignment
- repeat / freshness / revisit control

## Tasks

1. Implement an `OpportunityScorer` that ranks primarily by direction match and secondarily by freshness, reachability, engagement fit, and revisit pressure.
2. Define the explanation payload fields: `whyMatched`, `whyNow`, `approachPath`, `confidence`, and `whyUncertain`.
3. Build a `DailyDealFlowCurator` that produces `5-10` candidates, splits `Top 3 today` from the rest, and assigns `new / high-confidence / needs-validation / revisit`.
4. Decide whether the first version stores a generated daily artifact, generates on page load with date pinning, or supports both.
5. Add tests that verify direction mismatch cannot dominate the top of the list through secondary weighting alone.

## Validation

- scorer tests for direction-priority behavior
- curator tests for bucket assignment, top-three split, and repetition limits
- fixture-based checks for explanation completeness

## Exit Criteria

- the system can generate a dated daily deal flow with stable card payloads
- the top of the list remains direction-driven
- every candidate payload has enough information to render the v1 card contract
