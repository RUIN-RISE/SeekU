---
phase: 04-ui-evaluation
plan: 03
subsystem: worker-cli
tags: [cli, search, automation, agent-friendly]
dependency_graph:
  requires: [04-01]
  provides: [CLI search/show commands]
  affects: [worker package]
tech_stack:
  added: [CLI search/show commands, JSON output format]
  patterns: [Command pattern, Search pipeline integration]
key_files:
  created:
    - path: apps/worker/src/search-cli.ts
      purpose: Search CLI implementation with runSearchCli and runShowCli
  modified:
    - path: apps/worker/src/cli.ts
      purpose: Added search and show command registration
    - path: apps/worker/package.json
      purpose: Added @seeku/llm and @seeku/search dependencies
decisions:
  - id: D-03-01
    summary: Import drizzle-orm operators from @seeku/db re-export
    rationale: Avoid direct drizzle-orm dependency in worker package
metrics:
  duration_minutes: 15
  tasks_completed: 2
  files_modified: 3
  completed_date: "2026-03-29"
---

# Phase 04 Plan 03: Worker CLI Search Commands Summary

## One-Liner

Extended worker CLI with search and show commands using QueryPlanner-HybridRetriever-Reranker pipeline for agent-friendly search interaction.

## Task Summary

### Task 1: Create search-cli.ts module

**Status:** Completed
**Commit:** 8f31588

Created apps/worker/src/search-cli.ts implementing:
- `runSearchCli`: Full search pipeline (QueryPlanner -> HybridRetriever -> Reranker)
- `runShowCli`: Person detail retrieval with evidence items
- JSON and human-readable output formats
- `SearchCliOptions` and `ShowCliOptions` interfaces

### Task 2: Integrate search and show commands into CLI

**Status:** Completed
**Commit:** 00bca89

Modified apps/worker/src/cli.ts to add:
- `search` command with `--json` and `--limit` flags
- `show` command with `--json` flag
- Updated error message to include new commands

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed drizzle-orm import**
- **Found during:** Build verification
- **Issue:** Cannot find module 'drizzle-orm' - package not in worker dependencies
- **Fix:** Import `and, eq, inArray` from `@seeku/db` (re-exported)
- **Files modified:** apps/worker/src/search-cli.ts
- **Commit:** 5bbef88

**2. [Rule 1 - Bug] Fixed ProfileOutput type**
- **Found during:** Build verification
- **Issue:** Type 'null' not assignable to Person in not-found case
- **Fix:** Changed interface to `person: Person | null`
- **Files modified:** apps/worker/src/search-cli.ts
- **Commit:** 5bbef88

**3. [Rule 3 - Blocking] Added missing dependencies**
- **Found during:** Build verification
- **Issue:** @seeku/llm and @seeku/search not in worker dependencies
- **Fix:** Added both as workspace dependencies
- **Files modified:** apps/worker/package.json, pnpm-lock.yaml
- **Commit:** 5bbef88

None - plan executed with minor build fixes.

## Key Decisions

1. **D-03-01: Import drizzle-orm operators from @seeku/db**
   - The @seeku/db package re-exports `and, eq, inArray` and other operators
   - Avoids direct drizzle-orm dependency in worker package

## Output Artifacts

| Artifact | Path | Purpose |
|----------|------|---------|
| Search CLI | apps/worker/src/search-cli.ts | runSearchCli, runShowCli functions |
| CLI integration | apps/worker/src/cli.ts | search/show command handlers |

## Verification Results

- Worker builds successfully: `pnpm --filter @seeku/worker build` passed
- search-cli.ts contains required exports (runSearchCli, runShowCli)
- cli.ts contains command handlers for "search" and "show"
- JSON flag parsing implemented for both commands
- Limit flag parsing implemented for search command

## Usage Examples

```bash
# Search with human-readable output
pnpm --filter @seeku/worker cli search "AI engineer with Python experience"

# Search with JSON output
pnpm --filter @seeku/worker cli search "AI engineer" --json

# Search with limit
pnpm --filter @seeku/worker cli search "ML researcher" --limit 20

# Show person details
pnpm --filter @seeku/worker cli show <personId>

# Show person details in JSON
pnpm --filter @seeku/worker cli show <personId> --json
```

## Self-Check: PASSED

- [x] apps/worker/src/search-cli.ts exists
- [x] apps/worker/src/cli.ts modified
- [x] Commits exist: 8f31588, 00bca89, 5bbef88
- [x] Worker builds successfully