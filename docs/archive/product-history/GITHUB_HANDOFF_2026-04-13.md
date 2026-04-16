# GitHub Handoff 2026-04-13

## Why GitHub Next

- `bonjour` 已基本见顶，最终边际新增只有个位数。
- `github` 现成有 scanner / sync / identity resolution 链路。
- 切换后第一批小样本已经验证有效。

## New CLI Added

- command:
  - `scan-github-zju`
- files:
  - `apps/worker/src/cli/scan-github-zju.ts`
  - `apps/worker/src/cli.ts`
- behavior:
  - search GitHub users with query:
    - `"zhejiang university" OR "浙江大学" in:bio,location,company`
  - optional auto-sync discovered handles into `source_profiles`
  - supports windowed scanning for deeper / parallel runs:
    - `--start-page`
    - `--page-limit`
    - `--query`

## First Verified Batch

Command already completed:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts scan-github-zju --limit 25 --per-page 25
node --import tsx/esm apps/worker/src/cli.ts resolve-identities
node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

Observed results:

- GitHub search reported:
  - `totalMatchCount = 4519`
- synced first `25` handles
- then `resolve-identities` produced:
  - `personsCreated = 72`
  - `identitiesCreated = 72`
- coverage moved from:
  - `githubCoveredPersons = 122`
- to:
  - `githubCoveredPersons = 194`
- total persons moved from:
  - `21114`
- to:
  - `21186`

Practical conclusion:

- `github` is a live growth surface
- the first small batch already outperformed late-stage `bonjour`

## Second Verified Batch

Command already completed:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts scan-github-zju --limit 100 --per-page 100
node --import tsx/esm apps/worker/src/cli.ts resolve-identities
node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

Observed results:

- GitHub search total matches:
  - `4519`
- synced first `100` handles
- then `resolve-identities` produced:
  - `personsCreated = 75`
  - `identitiesCreated = 75`
- coverage moved from:
  - `githubCoveredPersons = 194`
- to:
  - `githubCoveredPersons = 269`
- total persons moved from:
  - `21186`
- to:
  - `21261`

Practical conclusion:

- GitHub remains the active expansion surface
- the `100` batch produced another meaningful jump
- compared with late-stage `bonjour`, GitHub is clearly the better use of time right now

## Third Verified Batch

Command already completed:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts scan-github-zju --limit 200 --per-page 100
node --import tsx/esm apps/worker/src/cli.ts resolve-identities
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=seek_zju PGUSER=rosscai node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

Observed results:

- GitHub search total matches:
  - `4519`
- synced first `200` handles
- then `resolve-identities` produced:
  - `personsCreated = 100`
  - `identitiesCreated = 100`
  - `matchedPairs = 0`
  - `reviewPairs = 0`
  - `unresolvedProfiles = 100`
- coverage moved from:
  - `githubCoveredPersons = 269`
- to:
  - `githubCoveredPersons = 369`
- total persons moved from:
  - `21261`
- to:
  - `21361`

Practical conclusion:

- GitHub growth is still strong beyond the first `100`
- current verified marginal yield is still far above late-stage `bonjour`
- GitHub should remain the primary active source until deeper pages flatten materially

## Fourth Verified Batch: Deep Window Pages 3-4

Command already completed:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts scan-github-zju --limit 200 --per-page 100 --start-page 3 --page-limit 2
node --import tsx/esm apps/worker/src/cli.ts resolve-identities
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=seek_zju PGUSER=rosscai node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

Observed results:

- deep-window GitHub search total matches:
  - `4518`
- synced `200` handles from pages `3-4`
- then `resolve-identities` produced:
  - `personsCreated = 199`
  - `identitiesCreated = 199`
  - `matchedPairs = 0`
  - `reviewPairs = 0`
  - `unresolvedProfiles = 199`
- coverage moved from:
  - `githubCoveredPersons = 369`
- to:
  - `githubCoveredPersons = 568`
- total persons moved from:
  - `21361`
- to:
  - `21560`

Practical conclusion:

- deeper GitHub pages are still extremely productive
- the effective yield on pages `3-4` was almost `1 new person / handle`
- on `2026-04-13`, GitHub search total count fluctuated slightly between `4518` and `4519`, but the coverage gain is the stable signal that matters
- next work should prioritize pages `5+`, not new `bonjour` exploration

## Fifth Verified Batch: Parallel Deep Windows Pages 5-8

Commands already completed:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts scan-github-zju --limit 200 --per-page 100 --start-page 5 --page-limit 2
node --import tsx/esm apps/worker/src/cli.ts scan-github-zju --limit 200 --per-page 100 --start-page 7 --page-limit 2
node --import tsx/esm apps/worker/src/cli.ts resolve-identities
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=seek_zju PGUSER=rosscai node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

Observed results:

- both deep windows reported:
  - `totalMatchCount = 4518`
- synced `400` handles from pages `5-8`
- then `resolve-identities` produced:
  - `personsCreated = 400`
  - `identitiesCreated = 400`
  - `matchedPairs = 0`
  - `reviewPairs = 0`
  - `unresolvedProfiles = 400`
- coverage moved from:
  - `githubCoveredPersons = 568`
- to:
  - `githubCoveredPersons = 968`
- total persons moved from:
  - `21560`
- to:
  - `21960`

Practical conclusion:

- parallel deep-window scanning works
- pages `5-8` remained fully productive
- GitHub was still yielding essentially one new covered person per synced handle in this range

## Sixth Verified Batch: Final Search Window Pages 9-10

Command already completed:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts scan-github-zju --limit 200 --per-page 100 --start-page 9 --page-limit 2
node --import tsx/esm apps/worker/src/cli.ts resolve-identities
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=seek_zju PGUSER=rosscai node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

Observed results:

- final deep window reported:
  - `totalMatchCount = 4519`
- scanner reached GitHub search's `1000`-result ceiling
- synced `200` handles from pages `9-10`
- then `resolve-identities` produced:
  - `personsCreated = 199`
  - `identitiesCreated = 199`
  - `matchedPairs = 0`
  - `reviewPairs = 0`
  - `unresolvedProfiles = 199`
- coverage moved from:
  - `githubCoveredPersons = 968`
- to:
  - `githubCoveredPersons = 1167`
- total persons moved from:
  - `21960`
- to:
  - `22159`

Practical conclusion:

- the current GitHub search query has now been exhausted through its accessible top `1000` results
- even the final accessible window still produced near-full new-person yield
- GitHub remains high-value, but the next increment should come from query diversification, not more paging on the same query

## Seventh Verified Batch: Parallel Diversified Queries Via Subagents

This stage was run in parallel through multiple subagents, each owning one GitHub user-search tranche. The main agent handled centralized post-processing only after all discovery jobs finished.

Completed tranche results:

- tranche A query:
  - `"zju" in:bio,location,company`
  - `totalMatchCount = 4869`
  - synced `200` handles from pages `1-2`
- tranche B initial query:
  - `"浙大" in:bio,location,company`
  - `totalMatchCount = 0`
  - no handles
  - this branch was immediately reassigned to fallback probing
- tranche B fallback probes:
  - `"zju" hangzhou in:bio,location,company` -> `8`
  - `"zhejiang university" hangzhou in:bio,location,company` -> `54`
  - `"qiushi" in:bio,location,company` -> `496`
  - selected query:
    - `"qiushi" in:bio,location,company`
  - synced `200` handles from pages `1-2`
- tranche C query:
  - `"zjuer" in:bio,location,company`
  - `totalMatchCount = 124`
  - synced all `124` accessible handles

Centralized post-processing:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts resolve-identities
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=seek_zju PGUSER=rosscai node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

Observed results:

- unified `resolve-identities` produced:
  - `personsCreated = 499`
  - `identitiesCreated = 499`
  - `matchedPairs = 0`
  - `reviewPairs = 0`
  - `unresolvedProfiles = 499`
- coverage moved from:
  - `githubCoveredPersons = 1167`
- to:
  - `githubCoveredPersons = 1666`
- total persons moved from:
  - `22159`
- to:
  - `22658`

Practical conclusion:

- subagent-parallel GitHub expansion worked cleanly
- `"zju"` is the strongest broad follow-up query so far
- `"zjuer"` is a smaller but precise alumni / self-identifier pocket
- `"qiushi"` is a valid secondary expansion surface
- `"浙大"` is not useful in GitHub user search under the current field constraints

## Important Note

`scan-github-zju` only syncs GitHub source profiles. To turn those into covered persons, run:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts resolve-identities
```

Then re-check:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

For reliable DB-backed output in this environment, use:

```bash
cd /Users/rosscai/seeku
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=seek_zju PGUSER=rosscai node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

## Parallel Window Strategy

The scanner no longer needs to restart from page `1` every time. It now supports disjoint page windows:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts scan-github-zju --limit 200 --per-page 100 --start-page 3 --page-limit 2
node --import tsx/esm apps/worker/src/cli.ts scan-github-zju --limit 200 --per-page 100 --start-page 5 --page-limit 2
```

Practical use:

- keep each worker on a non-overlapping page window
- resolve identities immediately after each completed scan batch
- refresh coverage after each verified tranche
- stay within GitHub search's practical `1000`-result ceiling (`perPage * page <= 1000`)
- verified high-yield windows so far:
  - prefix expansion through first `200` handles
  - deep window `pages 3-4`
  - parallel deep windows `pages 5-8`
  - final deep window `pages 9-10`

## Stage Summary

Current latest verified coverage after exhausting the current GitHub query window:

- `totalPersons = 22658`
- `githubCoveredPersons = 1666`
- `bonjourCoveredPersons = 20999`
- `indexedPersons = 21114`

Net effect of the GitHub expansion stage:

- `githubCoveredPersons: 122 -> 1666`
- net gain:
  - `+1544`
- `totalPersons: 21114 -> 22658`
- net gain:
  - `+1544`

Practical stage verdict:

- switching away from `bonjour` was decisively correct
- GitHub outperformed late-stage `bonjour` by a very large margin
- the current single-query GitHub sweep is operationally complete
- diversified GitHub query expansion is now also validated
- the biggest follow-up gap is no longer discovery yield but search-index lag

## Eighth Verified Stage: Search Reindex Catch-Up

After the diversified GitHub expansion stage, the search gap was:

- `totalPersons = 22658`
- `indexedPersons = 21114`
- missing search documents:
  - `1544`

Parallel reindex was attempted through multiple subagents. During execution we found an implementation bug:

- `rebuild-search --person-ids ...` ignored the provided `personIds`
- it incorrectly fell back to `rebuildAll()`
- explicit empty `personIds` could also fall through to full-active rebuilds in the lower-level worker path

Despite that bug, the resulting rebuild work successfully caught search indexing up to the current corpus. Final verified coverage after the reindex pass:

```bash
cd /Users/rosscai/seeku
DATABASE_URL='postgres://seeku:seeku_dev_password@localhost:5432/seeku' node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

Observed final results:

- `totalPersons = 22658`
- `indexedPersons = 22658`
- `embeddedPersons = 6738`
- `githubCoveredPersons = 1666`
- `coveragePercentage.indexed = 100`
- `coveragePercentage.embedded = 30`

Practical conclusion:

- the immediate search-index bottleneck is cleared
- newly added GitHub persons are now fully present in search documents
- embedding coverage also moved materially upward (`924 -> 6738`)

## Operational Fix Applied

The reindex bug has been fixed in code:

- [search-index-worker.ts](/Users/rosscai/seeku/packages/workers/src/search-index-worker.ts)
  - explicit empty `personIds` now returns a no-op instead of falling back to full-active processing
  - `runSearchRebuildWorker(personIds)` now respects targeted rebuilds instead of always calling `rebuildAll()`
- [search-index-worker.test.ts](/Users/rosscai/seeku/packages/workers/src/search-index-worker.test.ts)
  - added regression coverage for:
    - explicit empty person-id lists
    - targeted `runSearchRebuildWorker(...)`

Verification:

```bash
cd /Users/rosscai/seeku
pnpm exec vitest packages/workers/src/search-index-worker.test.ts
```

Result:

- `1` test file passed
- `3` tests passed

## Recommended Next Step

1. Continue diversified GitHub expansion, but now bias toward the queries already validated in production:
   - `"zju" in:bio,location,company`
   - `"qiushi" in:bio,location,company`
   - `"zjuer" in:bio,location,company`
2. Avoid spending more time on:
   - `"浙大" in:bio,location,company`
   - `hangzhou`-constrained variants unless used only as low-cost probes
3. After each new GitHub discovery batch, immediately run `resolve-identities`.
4. Then refresh coverage and watch:
   - `githubCoveredPersons`
   - `totalPersons`
5. Because indexed coverage is now at `100%`, the next bottleneck is no longer indexing but the next discovery surface.
