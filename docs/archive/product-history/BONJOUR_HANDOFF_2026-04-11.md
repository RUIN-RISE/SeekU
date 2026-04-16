# Bonjour Handoff 2026-04-11

## Current State

- Repo: `seeku`
- Current coverage:
  - `totalPersons = 21114`
  - `bonjourCoveredPersons = 20999`
- Old watcher background processes were stopped before handoff.
- 2026-04-12 continuation:
  - ignore `bonjour-batch-i-depth2-from-h-delta`
  - that batch was a sandboxed dry run and produced only `fetch failed` / empty-filter behavior
  - active real continuation batch: `bonjour-batch-i2-depth2-from-h-delta`
  - next frontier after `i2` exhaustion: `bonjour-batch-j-depth2-from-i2-frontier`
  - next frontier after `j` exhaustion: `bonjour-batch-k-depth2-from-j-frontier`

## What Worked

- Copy/import from `seek-zju` plus historical raw reuse was already completed earlier.
- Old residual-pool squeezing on top of the existing raw union was mostly exhausted.
- The effective breakthrough was a new raw-surface auth frontier:
  - seed file: `output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier-seeds.json`
  - runner: `scripts/run_bonjour_auth_frontier_from_seed_file.sh`
  - batch tag: `bonjour-batch-h-depth2-frontier`

## Best Result So Far

Batch `bonjour-batch-h-depth2-frontier`:

- `25` seeds
- `depth = 2`
- `104` fetched auth nodes
- `8660` discovered handles
- `49` delta import handles after canonical/profile-id filtering
- delta import succeeded
- conservative dedupe merged `1` alias group
- net result: about `+48` persons

Relevant logs:

- `output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier-delta-runner.log`

## Current Continuation In Progress

Batch `bonjour-batch-i2-depth2-from-h-delta`:

- started on `2026-04-12`
- seed file:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier/delta-import-handles.json`
- runner:
  - `scripts/run_bonjour_auth_frontier_from_seed_file.sh`
- parameters:
  - `depth = 2`
  - `max_nodes = 2500`
  - `concurrency = 4`
- current observed auth result:
  - `49` seeds
  - `2500` fetched auth nodes
  - `14180` discovered handles
  - status `max_nodes_reached`
  - still had `2902` depth-2 nodes pending when auth stage stopped at cap
  - only `1` recorded auth error so far (`FunctionBizError: 名片不存在`)
- filter/delta stage status:
  - `filter-bonjour-import-handles --resolve-source-profiles` was still running when this note was updated
  - `delta-import-handles.json` for batch `i2` had not been written yet at that moment

Update after first `i2` completion:

- auth stage finished at `AUTH_MAX_NODES=2500`
- `14180` discovered handles
- `165` delta import handles after canonical/profile-id filtering
- delta import succeeded
- coverage moved to:
  - `totalPersons = 21025`
  - `bonjourCoveredPersons = 20910`

Update after second `i2` resume on `2026-04-12`:

- resumed the same frontier with `AUTH_MAX_NODES=5000`
- second auth stage reached:
  - `5000` fetched auth nodes
  - `15327` discovered handles
  - status `max_nodes_reached`
  - still had `402` depth-2 nodes pending when auth stopped at the new cap
- second filter/delta stage status:
  - filter finished with:
    - `15327` input handles
    - `31` delta import handles
  - direct reuse of `BATCH_TAG=bonjour-batch-i2-depth2-from-h-delta-delta` is misleading:
    - `run_bonjour_delta_batch.sh` reuses an existing `${BATCH_TAG}-raw` directory when it already exists
    - so rerunning the same delta batch tag after a frontier resume will re-import the old raw dump instead of fetching the newly reduced delta set
  - workaround used:
    - run a fresh delta batch tag `bonjour-batch-i2-depth2-from-h-delta-r2-delta`
    - point it at `output/bonjour-raw/2026-04-11/bonjour-batch-i2-depth2-from-h-delta/delta-import-handles.json`
  - fresh delta result:
    - `31` imported handles
    - `32` profiles dumped
    - delta import succeeded
    - no dedupe merges
  - coverage then moved to:
    - `totalPersons = 21056`
    - `bonjourCoveredPersons = 20941`

Update after final `i2` frontier completion:

- resumed once more with `AUTH_MAX_NODES=5600`
- frontier fully completed at:
  - `5402` fetched auth nodes
  - `15458` discovered handles
  - `pendingCurrentDepth = 0`
  - `pendingRetry = 0`
  - status `completed`
- the refreshed `delta-import-handles.json` still contained `31` handles
- therefore the last `5000 -> 5402` auth segment did not create any additional net-new delta beyond the already imported `31`-handle result
- practical conclusion:
  - `i2` is now exhausted as a depth-2 frontier
  - the useful net result from the resumed `i2` work was the extra `+31` persons captured via the fresh delta batch tag

## Next Frontier In Progress

Batch `bonjour-batch-j-depth2-from-i2-frontier`:

- seed source:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-seeds.json`
- how seeds were built:
  - merged the imported-handle files from:
    - `output/bonjour-raw/2026-04-11/bonjour-batch-i2-depth2-from-h-delta-delta-raw/imports/0000-delta-import-handles.json.json`
    - `output/bonjour-raw/2026-04-11/bonjour-batch-i2-depth2-from-h-delta-r2-delta-raw/imports/0000-delta-import-handles.json.json`
  - excluded the old `h` frontier delta seed file
  - final seed count: `196`
- runner:
  - `scripts/run_bonjour_auth_frontier_from_seed_file.sh`
- current observed auth result:
  - `196` seeds
  - `2500` fetched auth nodes
  - `14396` discovered handles
  - status `max_nodes_reached`
  - still had `5430` depth-2 nodes pending when auth stopped at cap
  - only `1` auth error so far
- filter/delta stage status:
  - first filter finished with:
    - `14396` input handles
    - `28` delta import handles
  - first delta import succeeded
  - coverage then moved to:
    - `totalPersons = 21084`
    - `bonjourCoveredPersons = 20969`
  - second resume on `2026-04-12`:
    - resumed the same frontier with `AUTH_MAX_NODES=5000`
    - second auth stage reached:
      - `5000` fetched auth nodes
      - `15464` discovered handles
      - status `max_nodes_reached`
      - still had `2930` depth-2 nodes pending when auth stopped at the new cap
    - second filter finished with:
      - `15464` input handles
      - `1` delta import handle
    - direct reuse of `bonjour-batch-j-depth2-from-i2-frontier-delta` again reused the old raw dump and did not change coverage
    - workaround used:
      - run a fresh delta batch tag `bonjour-batch-j-depth2-from-i2-frontier-r2-delta`
    - fresh delta result:
      - `1` imported handle
      - `1` profile dumped
      - coverage then moved to:
        - `totalPersons = 21085`
        - `bonjourCoveredPersons = 20970`
  - final completion pass on `2026-04-12`:
    - resumed the same frontier with `AUTH_MAX_NODES=8500`
    - frontier fully completed at:
      - `7923` fetched auth nodes
      - `17758` discovered handles
      - `pendingCurrentDepth = 0`
      - `pendingRetry = 0`
      - status `completed`
    - refreshed `delta-import-handles.json` still contained the same single handle `ul5r2c`
    - therefore the last `5000 -> 7923` auth segment did not create any additional net-new delta beyond the already imported `+1`

Relevant paths:

- `output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-frontier-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-frontier/manifest.json`
- `output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-seeds.json`

Relevant paths:

- `output/bonjour-raw/2026-04-11/bonjour-batch-i2-depth2-from-h-delta-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-batch-i2-depth2-from-h-delta/manifest.json`
- `output/bonjour-raw/2026-04-11/bonjour-batch-i2-depth2-from-h-delta/errors.json`

## New Scripts Added

- `scripts/run_bonjour_batch_g_frontiers.sh`
  - sequential shallow probe over the new frontier seed slices `g0/g1/g2`
- `scripts/run_bonjour_auth_frontier_from_seed_file.sh`
  - generic auth frontier runner from a seed file
  - supports `AUTH_DEPTH`, `AUTH_MAX_NODES`, `AUTH_CONCURRENCY`, `AUTH_CHECKPOINT_EVERY`
  - runs:
    1. auth crawl
    2. canonical/profile-id overlap filter
    3. delta raw/import pipeline when delta handles exist

## Seed Files Worth Reusing

- `output/bonjour-raw/2026-04-11/bonjour-batch-g0-import-comment-seeds.json`
- `output/bonjour-raw/2026-04-11/bonjour-batch-g1-comment-no-name-occ2-seeds.json`
- `output/bonjour-raw/2026-04-11/bonjour-batch-g2-import-any-seeds.json`
- merged frontier seed file:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier-seeds.json`

## Important Notes

- Do not keep spending time on the old residual frontier slices alone:
  - `comment_occ*`
  - `import_comment_occ*`
  - `tail_visible`
  These were effectively exhausted.
- The deep frontier path is the current productive path.
- Keep the conservative canonical/profile-id filter; the temporary “fast prefilter” experiment was reverted because it could incorrectly drop alias cases.

## Recommended Next Step

Continue on top of the new raw surface, not the old union-only slicing.

Best next move:

1. Build a second deep batch from the newly discovered/auth-confirmed surface.
2. Either:
   - resume the same frontier with a higher `AUTH_MAX_NODES`, or
   - derive a new seed file from `bonjour-batch-h-depth2-frontier/delta-import-handles.json` and the newly dumped profiles, then run another `depth=2` or `depth=0` targeted frontier.

Update after 2026-04-12 continuation:

1. Wait for `bonjour-batch-i2-depth2-from-h-delta` filter/delta stage to finish.
2. If its delta import count is materially positive, keep following this path.
3. Because auth already hit `AUTH_MAX_NODES=2500` with `2902` depth-2 nodes still pending, the next auth continuation should prefer:
   - resuming the same `i2` frontier with a higher `AUTH_MAX_NODES`, or
   - splitting a follow-up frontier from the `i2` delta surface once `delta-import-handles.json` exists.

Update after the second `i2` resume:

1. The second-resume delta was smaller but still positive (`31` handles, about `+31` persons).
2. There is likely one more worthwhile continuation because only `402` depth-2 nodes remained pending at `AUTH_MAX_NODES=5000`.
3. If resuming again, use only a modest cap increase on the same `i2` frontier.
4. If that resume produces another positive delta, do not reuse the old delta batch tag; create a fresh delta batch tag so the raw dump is rebuilt for the new handle set.

Update after final `i2` completion:

1. Treat `bonjour-batch-i2-depth2-from-h-delta` as exhausted.
2. Current meaningful post-`h` gains are:
   - first `i2` completion: about `+166`
   - second `i2` resume via fresh delta batch tag: about `+31`
3. The final completion pass did not add more delta beyond that `31`.
4. The next productive move should be a new frontier seed source, not another resume of `i2`.

Update after starting `j`:

1. `j` is the current productive path; do not resume `i2` again.
2. `j` already proved positive on its first pass:
   - first `2500`-node pass produced about `+28`
3. Continue by resuming `j` with a higher `AUTH_MAX_NODES`, same pattern as `i2`.
4. If `j` needs repeated delta imports across resumes, keep using fresh delta batch tags to avoid raw-dir reuse.

Update after final `j` completion:

1. Treat `bonjour-batch-j-depth2-from-i2-frontier` as exhausted.
2. Current meaningful post-`i2` gains are:
   - first `j` completion: about `+28`
   - second `j` resume via fresh delta batch tag: about `+1`
3. The final completion pass did not add more delta beyond that `1`.
4. The next productive move should be a genuinely new seed surface again, not another resume of `j`.

## Next Surface After J

Batch `bonjour-batch-k-depth2-from-j-frontier`:

- seed source:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-k-depth2-from-j-seeds.json`
- how seeds were built:
  - merged the imported-handle files from:
    - `output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-frontier-delta-raw/imports/0000-delta-import-handles.json.json`
    - `output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-frontier-r2-delta-raw/imports/0000-delta-import-handles.json.json`
  - excluded:
    - `output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-seeds.json`
    - `output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier/delta-import-handles.json`
  - final seed count: `29`
- runner:
  - `scripts/run_bonjour_auth_frontier_from_seed_file.sh`
- current observed auth result:
  - `29` seeds
  - `216` fetched auth nodes
  - `9308` discovered handles
  - status `completed`
  - `pendingCurrentDepth = 0`
  - `pendingRetry = 0`
  - auth error count `0`
- filter/delta stage status:
  - filter finished with:
    - `9308` input handles
    - `7` delta import handles
  - delta import succeeded
  - coverage then moved to:
    - `totalPersons = 21092`
    - `bonjourCoveredPersons = 20977`

Relevant paths:

- `output/bonjour-raw/2026-04-11/bonjour-batch-k-depth2-from-j-frontier-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-batch-k-depth2-from-j-frontier/manifest.json`
- `output/bonjour-raw/2026-04-11/bonjour-batch-k-depth2-from-j-seeds.json`

## Next Surface After K

Batch `bonjour-batch-l-depth2-from-k-frontier`:

- seed source:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-l-depth2-from-k-seeds.json`
- how seeds were built:
  - used:
    - `output/bonjour-raw/2026-04-11/bonjour-batch-k-depth2-from-j-frontier-delta-raw/imports/0000-delta-import-handles.json.json`
  - excluded:
    - `output/bonjour-raw/2026-04-11/bonjour-batch-k-depth2-from-j-seeds.json`
    - `output/bonjour-raw/2026-04-11/bonjour-batch-j-depth2-from-i2-seeds.json`
    - `output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier/delta-import-handles.json`
  - final seed count: `7`
- runner:
  - `scripts/run_bonjour_auth_frontier_from_seed_file.sh`
- auth result:
  - `7` seeds
  - `111` fetched auth nodes
  - `5230` discovered handles
  - status `completed`
  - `pendingCurrentDepth = 0`
  - `pendingRetry = 0`
  - auth error count `0`
- filter result:
  - `5230` input handles
  - `2` delta import handles
- delta import succeeded
- coverage then moved to:
  - `totalPersons = 21094`
  - `bonjourCoveredPersons = 20979`

Relevant paths:

- `output/bonjour-raw/2026-04-11/bonjour-batch-l-depth2-from-k-frontier-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-batch-l-depth2-from-k-frontier/manifest.json`
- `output/bonjour-raw/2026-04-11/bonjour-batch-l-depth2-from-k-seeds.json`

## Next Surface After L

Batch `bonjour-batch-m-depth2-from-l-frontier`:

- seed source:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-m-depth2-from-l-seeds.json`
- how seeds were built:
  - used:
    - `output/bonjour-raw/2026-04-11/bonjour-batch-l-depth2-from-k-frontier-delta-raw/imports/0000-delta-import-handles.json.json`
  - excluded prior seed surfaces (`l`, `k`, `j`, `h`)
  - final seed count: `2`
- auth result:
  - `2` seeds
  - `280` fetched auth nodes
  - `7054` discovered handles
  - status `completed`
- filter result:
  - `7054` input handles
  - `2` delta import handles
- delta import succeeded
- coverage then moved to:
  - `totalPersons = 21096`
  - `bonjourCoveredPersons = 20981`

Relevant paths:

- `output/bonjour-raw/2026-04-11/bonjour-batch-m-depth2-from-l-frontier-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-batch-m-depth2-from-l-frontier/manifest.json`
- `output/bonjour-raw/2026-04-11/bonjour-batch-m-depth2-from-l-seeds.json`

## Next Surface After M

Batch `bonjour-batch-n-depth2-from-m-frontier`:

- seed source:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-n-depth2-from-m-seeds.json`
- how seeds were built:
  - used:
    - `output/bonjour-raw/2026-04-11/bonjour-batch-m-depth2-from-l-frontier-delta-raw/imports/0000-delta-import-handles.json.json`
  - excluded prior seed surfaces (`m`, `l`, `k`, `j`, `h`)
  - final seed count: `2`
- auth result:
  - `2` seeds
  - `139` fetched auth nodes
  - `5269` discovered handles
  - status `completed`
- filter result:
  - `delta_import_handle_count = 0`
- practical conclusion:
  - this small chained frontier path is now exhausted
  - no delta batch was needed for `n`

Relevant paths:

- `output/bonjour-raw/2026-04-11/bonjour-batch-n-depth2-from-m-frontier-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-batch-n-depth2-from-m-frontier/manifest.json`
- `output/bonjour-raw/2026-04-11/bonjour-batch-n-depth2-from-m-seeds.json`

## Known Good Command Pattern

```bash
cd /Users/rosscai/seeku
RUN_DATE=2026-04-11 \
BATCH_TAG=bonjour-batch-h-depth2-frontier \
SEED_FILE=/Users/rosscai/seeku/output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier-seeds.json \
AUTH_DEPTH=2 \
AUTH_MAX_NODES=2500 \
AUTH_CONCURRENCY=4 \
AUTH_CHECKPOINT_EVERY=50 \
scripts/run_bonjour_auth_frontier_from_seed_file.sh
```

## If Resuming Later

- First inspect:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier-runner.log`
  - `output/bonjour-raw/2026-04-11/bonjour-batch-h-depth2-frontier-delta-runner.log`
- Then check current coverage:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

## Post-O2 Follow-Up

Batch `bonjour-batch-p-depth2-from-o2-frontier`:

- seed source:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-p-depth2-from-o2-seeds.json`
- source handles:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-o2-post-like-frontier/delta-import-handles.json`
- auth result:
  - `14` seeds
  - `585` fetched auth nodes
  - `11864` discovered handles
  - status `completed`
- filter result:
  - `11864` input handles
  - `1` delta import handle
- delta import succeeded
- coverage then moved to:
  - `totalPersons = 21111`
  - `bonjourCoveredPersons = 20996`
- practical conclusion:
  - `p` is real but weak (`+1`)
  - do not keep extending `p` serially as the main strategy

Relevant paths:

- `output/bonjour-raw/2026-04-11/bonjour-batch-p-depth2-from-o2-frontier-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-batch-p-depth2-from-o2-frontier/manifest.json`
- `output/bonjour-raw/2026-04-11/bonjour-batch-p-depth2-from-o2-frontier/delta-import-handles.json`

## New Parallel Strategy

The strategy changed on `2026-04-13`:

1. Stop spending most time on tiny serial chains.
2. Keep `o2` as the main strong route because it still had a large unfinished depth-2 frontier.
3. In parallel, cut the broad residual `post_like` surface into disjoint windows and test them concurrently.

Residual-surface measurement with the current exclude set:

- base raw union still has about `595` unconsumed residual candidates when using:
  - `--no-exclude-pure-post-like`
- old stricter residual slices are mostly exhausted:
  - comment-only `occ>=2`: `11`
  - comment+import `occ>=2`: `0`
  - category-visible tail: `2`
- practical conclusion:
  - the only surface large enough for an overnight parallel campaign is the broad residual `post_like` pool

## Script Updates

- `scripts/run_bonjour_auth_frontier_from_seed_file.sh`
  - added `DELTA_BATCH_TAG`
  - use this when resuming an existing frontier so the delta raw dump is written to a fresh batch tag instead of reusing stale `${BATCH_TAG}-delta-raw`
- `scripts/run_bonjour_parallel_post_like_campaign.sh`
  - builds residual post-like seed windows from the base raw union
  - launches multiple frontier batches in parallel
  - supports:
    - `WINDOW_SKIPS`
    - `WINDOW_LIMIT`
    - `RESUME_O2`
    - `O2_MAX_NODES`
    - `RESIDUAL_MAX_NODES`

## Overnight Parallel Runs Started On 2026-04-13

Strong-route continuation already launched:

- `bonjour-batch-o2-post-like-frontier`
  - resumed at `2026-04-13 00:40` Beijing time (`2026-04-12T16:40:59Z`)
  - resume cap:
    - `AUTH_MAX_NODES = 3000`
    - `AUTH_CONCURRENCY = 1`
  - delta batch tag override:
    - `bonjour-batch-o2-post-like-frontier-r20260413004059-delta`
  - runner log:
    - `output/bonjour-raw/2026-04-11/bonjour-batch-o2-post-like-frontier-runner.log`

Parallel residual full-size windows launched:

- campaign `bonjour-parallel-post-like-r3`
  - launched at `2026-04-13 00:46` Beijing time (`2026-04-12T16:46:21Z`)
  - residual window 1:
    - batch tag `bonjour-parallel-post-like-r3-residual-window-1`
    - seed window effectively corresponds to residual skip `100`
    - seed file:
      - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3/residual-window-1-seeds.json`
    - runner log:
      - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3-residual-window-1-runner.log`
  - residual window 2:
    - batch tag `bonjour-parallel-post-like-r3-residual-window-2`
    - seed window effectively corresponds to residual skip `200`
    - seed file:
      - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3/residual-window-2-seeds.json`
    - runner log:
      - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3-residual-window-2-runner.log`
  - launch log:
    - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3/campaign.log`

- campaign `bonjour-parallel-post-like-r4`
  - launched at `2026-04-13 00:47` Beijing time (`2026-04-12T16:47:31Z`)
  - residual window 1:
    - batch tag `bonjour-parallel-post-like-r4-residual-window-1`
    - seed window effectively corresponds to residual skip `300`
    - seed file:
      - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r4/residual-window-1-seeds.json`
    - runner log:
      - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r4-residual-window-1-runner.log`
  - launch log:
    - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r4/campaign.log`

Debug-only side run:

- campaign `bonjour-parallel-post-like-debug`
  - do not treat this as the main overnight result source
  - it launched:
    - one `o2` resume to `AUTH_MAX_NODES=3000`
    - one residual window with `AUTH_MAX_NODES=100`
  - main purpose:
    - verify the new parallel launcher worked end-to-end
  - paths:
    - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-debug/campaign.log`
    - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-debug-residual-window-1-runner.log`

Ignore these failed outer launch attempts:

- `bonjour-parallel-post-like-r1`
- `bonjour-parallel-post-like-r2`

They only recorded the campaign start line and did not become the main running batches.

## Tomorrow Morning First Checks

First inspect these logs:

- `output/bonjour-raw/2026-04-11/bonjour-batch-o2-post-like-frontier-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3-residual-window-1-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3-residual-window-2-runner.log`
- `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r4-residual-window-1-runner.log`

Then check coverage:

```bash
cd /Users/rosscai/seeku
node --import tsx/esm apps/worker/src/cli.ts coverage --json
```

Then inspect whether each route produced a non-zero delta file:

- `output/bonjour-raw/2026-04-11/bonjour-batch-o2-post-like-frontier/delta-import-handles.json`
- `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3-residual-window-1/delta-import-handles.json`
- `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3-residual-window-2/delta-import-handles.json`
- `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r4-residual-window-1/delta-import-handles.json`

## Resume Recommendation

When resuming from this handoff:

1. Treat the overnight parallel run as the primary branch, not the old `k/l/m/n` or `p` serial extensions.
2. If any residual window is positive, keep splitting the residual `post_like` pool by new skip windows instead of falling back to tiny chained deltas.
3. If resuming `o2` again after the current pass, keep using a fresh `DELTA_BATCH_TAG`.

## Restart Results On 2026-04-13

After the initial background launch turned out to be unreliable, the routes were rerun directly.

Residual windows:

- `bonjour-parallel-post-like-r3-residual-window-1`
  - rerun completed
  - auth result:
    - `20` seeds
    - `22` fetched auth nodes
    - `22` discovered handles
    - status `completed`
  - filter result:
    - `22` input handles
    - `2` delta import handles
  - delta import succeeded via:
    - `bonjour-parallel-post-like-r3-residual-window-1-debug-delta`
  - net result:
    - about `+2`

- `bonjour-parallel-post-like-r3-residual-window-2`
  - rerun completed
  - auth result:
    - `20` seeds
    - `20` fetched auth nodes
    - `20` discovered handles
    - status `completed`
  - filter result:
    - `0` delta import handles
  - net result:
    - `0`

- `bonjour-parallel-post-like-r4-residual-window-1`
  - rerun completed
  - auth result:
    - `20` seeds
    - `20` fetched auth nodes
    - `20` discovered handles
    - status `completed`
  - filter result:
    - `0` delta import handles
  - net result:
    - `0`

Coverage after the positive residual-window rerun:

- `totalPersons = 21113`
- `bonjourCoveredPersons = 20998`

Current main route still running:

- `bonjour-batch-o2-post-like-frontier`
  - foreground resume restarted at `2026-04-13T02:37:51Z`
  - current observed in-progress snapshot:
    - `AUTH_MAX_NODES = 3000`
    - `fetchedNodes = 2600`
    - `discoveredHandles = 16140`
    - `pendingCurrentDepth = 11341`
    - `status = running`
  - practical conclusion:
    - `o2` is still the only route with clearly large remaining frontier breadth
    - residual post-like windows are mostly weak, with one small positive pocket (`+2`)

## Final Closure Update On 2026-04-13

The `o2` rerun finished and the final result was weak:

- `bonjour-batch-o2-post-like-frontier`
  - resumed to:
    - `AUTH_MAX_NODES = 3000`
    - `AUTH_CONCURRENCY = 1`
  - auth result:
    - `3000` fetched auth nodes
    - `16453` discovered handles
    - status `max_nodes_reached`
  - filter result:
    - `16453` input handles
    - `1` delta import handle
  - delta import succeeded through:
    - `bonjour-batch-o2-post-like-frontier-r20260413-final-delta`
  - final imported handle:
    - `7pp1o8`
  - net result:
    - about `+1`

Final late-stage scoreboard:

- `bonjour-parallel-post-like-r3-residual-window-1`
  - `+2`
- `bonjour-parallel-post-like-r3-residual-window-2`
  - `0`
- `bonjour-parallel-post-like-r4-residual-window-1`
  - `0`
- final `o2` rerun
  - `+1`

Final coverage after closure:

- `totalPersons = 21114`
- `bonjourCoveredPersons = 20999`

Practical conclusion:

- `bonjour` is now effectively exhausted for this campaign
- do not open more `bonjour` batches
- switch effort to other data sources

Closure document:

- `docs/archive/product-history/BONJOUR_CLOSURE_2026-04-13.md`
