# 04-PLAN: Agent Eval Harness And Acceptance Validation

## Goal

Prove that the CLI search agent improves decision flow without regressing the underlying search quality.

## Scope

- add agent-level acceptance coverage
- preserve key search-family quality baselines
- validate compare usefulness and recommendation honesty on real goals

## Tasks

1. Define an acceptance set of 10-15 real search goals for the CLI search agent.
2. Add evaluation fixtures for process quality:
   - unnecessary clarification
   - failure to refine noisy results
   - compare omission
   - unsupported recommendation
3. Add non-regression checks for core search families such as Q4, Q6, and Q8.
4. Document manual and automated acceptance expectations.

## Validation

- agent acceptance runs over real goals
- explicit manual review checklist for compare usefulness and evidence traceability
- retained baseline quality on key search families

## Exit Criteria

- the project has a repeatable harness for agent decision quality
- key search baselines remain non-regressive
- the milestone can be judged on real compare/recommend usefulness rather than conversation feel alone
