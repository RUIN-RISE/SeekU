# Bonjour Closure 2026-04-13

## Final Verdict

- `bonjour` 本轮扩张已经基本见顶。
- 不是绝对 `0`，但新增已经掉到个位数。
- 后续不应继续在 `bonjour` 上做更多小切片或长尾 residual 试探。
- 下一步应转向其他数据源。

## Final Coverage

- `totalPersons = 21114`
- `bonjourCoveredPersons = 20999`

Compared with the pre-closure checkpoint:

- before final closure push:
  - `totalPersons = 21111`
  - `bonjourCoveredPersons = 20996`
- final net closure gain:
  - about `+3`

## Productive Branches

These were the only branches that materially moved coverage late in the run:

- `bonjour-batch-h-depth2-frontier`
  - about `+48`
- `bonjour-batch-i2-depth2-from-h-delta`
  - first completion: about `+166`
  - resumed completion via fresh delta tag: about `+31`
- `bonjour-batch-j-depth2-from-i2-frontier`
  - first completion: about `+28`
  - resumed completion via fresh delta tag: about `+1`
- `bonjour-batch-k-depth2-from-j-frontier`
  - about `+7`
- `bonjour-batch-l-depth2-from-k-frontier`
  - about `+2`
- `bonjour-batch-m-depth2-from-l-frontier`
  - about `+2`
- `bonjour-batch-o2-post-like-frontier`
  - first completion: about `+14`
  - final resume to `AUTH_MAX_NODES=3000`: about `+1`
- `bonjour-parallel-post-like-r3-residual-window-1`
  - about `+2`

## Exhausted Or Weak Branches

These should be treated as exhausted or too weak to keep pursuing:

- `bonjour-batch-n-depth2-from-m-frontier`
  - `0`
- `bonjour-batch-p-depth2-from-o2-frontier`
  - `+1`
- `bonjour-parallel-post-like-r3-residual-window-2`
  - `0`
- `bonjour-parallel-post-like-r4-residual-window-1`
  - `0`
- residual post-like wide windows overall
  - only one small positive pocket (`+2`) was found
  - the rest were effectively empty

## Final O2 Result

Final resumed run:

- batch:
  - `bonjour-batch-o2-post-like-frontier`
- parameters:
  - `AUTH_MAX_NODES = 3000`
  - `AUTH_CONCURRENCY = 1`
- auth result:
  - `3000` fetched auth nodes
  - `16453` discovered handles
  - `10941` depth-2 nodes still pending at the cap
  - status `max_nodes_reached`
- filter result:
  - `16453` input handles
  - `1` delta import handle
- delta import succeeded through:
  - `bonjour-batch-o2-post-like-frontier-r20260413-final-delta`
- final imported handle:
  - `7pp1o8`
- practical conclusion:
  - `o2` still has breadth, but marginal yield has collapsed
  - continuing to spend time on this frontier is no longer justified

## Important Operational Note

When resuming an existing frontier, never rely on the default delta batch tag:

- `scripts/run_bonjour_auth_frontier_from_seed_file.sh` now supports `DELTA_BATCH_TAG`
- this is required because `scripts/run_bonjour_delta_batch.sh` reuses an existing `${BATCH_TAG}-raw` directory if present
- without a fresh delta batch tag, resumed frontier work can appear to produce no change because it re-imports stale raw output

## Keep / Archive

Keep these artifacts as the final `bonjour` reference set:

- handoff:
  - `docs/archive/product-history/BONJOUR_HANDOFF_2026-04-11.md`
- closure:
  - `docs/archive/product-history/BONJOUR_CLOSURE_2026-04-13.md`
- strongest late-stage frontier logs:
  - `output/bonjour-raw/2026-04-11/bonjour-batch-o2-post-like-frontier-runner.log`
  - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3-residual-window-1-runner.log`
  - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r3-residual-window-2-runner.log`
  - `output/bonjour-raw/2026-04-11/bonjour-parallel-post-like-r4-residual-window-1-runner.log`

## Stop Condition Reached

The stop condition for `bonjour` is met:

1. residual windows are mostly `0`
2. the strongest remaining frontier (`o2`) now yields only `+1`
3. current marginal yield is too low to justify more `bonjour`-only exploration

## Next Move

- Stop opening new `bonjour` batches.
- Shift effort to other data sources / other graph surfaces.
