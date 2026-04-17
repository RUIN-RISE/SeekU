# 01-PLAN: Goal Model And Candidate Direction Foundation

## Goal

Create the minimal modeling layer required to understand the user's cofounder direction and candidate public-expression direction.

## Scope

- define the stored user goal model shape
- ingest explicit long-term goal inputs and recent product-local behavior summaries
- derive candidate direction profiles from public-expression evidence
- make both model outputs inspectable and testable

## Tasks

1. Define a durable `UserGoalModel` schema that captures explicit direction tags, negative tags, drift-relevant recent behavior, and feedback-weight summaries.
2. Identify the minimum existing data sources in Seeku needed to seed the model without introducing a new broad memory system.
3. Define and implement a `CandidateDirectionProfile` extraction path based on bio, headline, self-description, project text, and other public-expression fields already present in the corpus.
4. Add tests or fixtures that prove direction extraction stays stable for representative candidate examples.
5. Ensure model outputs are available to downstream scoring logic without bypassing existing search/runtime boundaries.

## Validation

- unit tests for goal-model shape and candidate-direction extraction
- representative fixtures showing clear-direction and weak-direction examples
- review that extracted fields stay within product-local evidence boundaries

## Exit Criteria

- user goal model exists with explicit and behavioral inputs
- candidate direction profile extraction works for the existing corpus
- downstream modules can consume both structures without ad hoc parsing
