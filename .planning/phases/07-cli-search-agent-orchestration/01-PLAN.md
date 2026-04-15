# 01-PLAN: Agent Tools And Session State Foundation

## Goal

Create the bounded tool layer and explicit session state that the CLI search agent will depend on.

## Scope

- define agent-callable tool contracts around search, inspect, compare preparation, and query revision
- centralize session state instead of scattering flow state across CLI workflow internals
- preserve existing search quality and current CLI output semantics while introducing new abstractions

## Tasks

1. Extract current search and inspect flows into explicit tool service boundaries.
2. Define a session state model for:
   - user goal
   - current conditions
   - clarification history
   - search history
   - current shortlist
   - active compare set
   - confidence status
   - open uncertainties
3. Refactor CLI workflow code to read/write through the new session state model.
4. Add tests that prove tool outputs remain compatible with existing search behavior.

## Validation

- targeted tests for extracted tool services and session state reducers
- non-regression on current script search behavior
- no change in search ranking quality caused purely by toolization

## Exit Criteria

- agent-callable tools exist for search, inspect, revise, and compare preparation
- a single session state model exists and is the source of truth for CLI decision flow
- current search results remain non-regressive under the refactor
