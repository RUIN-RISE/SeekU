# Bonjour Frontier Expansion

目标：持续扩张 `seeku` 的 Bonjour 覆盖，不重复吃旧 dump，并把新数据稳定导入、去重、入检索。

## Pipeline

1. 抓 auth friend frontier

```bash
pnpm exec tsx apps/worker/src/cli.ts dump-bonjour-auth-handles \
  --seed-file <seed-file.json> \
  --depth 0 \
  --max-nodes 5000 \
  --checkpoint-every 100 \
  --concurrency 8 \
  --output output/bonjour-raw/<date>/bonjour-auth-handles-<tag>
```

2. 用 frontier handles 抓 raw profiles / timelines

```bash
pnpm exec tsx apps/worker/src/cli.ts dump-bonjour-raw \
  --import-handles output/bonjour-raw/<date>/bonjour-auth-handles-<tag>/import-handles.json \
  --scan-imported-profile-timelines \
  --scan-global-timeline \
  --scan-commenters \
  --timeline-concurrency 8 \
  --profile-concurrency 8 \
  --comment-concurrency 8 \
  --output output/bonjour-raw/<date>/bonjour-raw-<tag>
```

增量 batch 若已经做过 overlap 过滤，应该跳过 category timeline，只围绕净新增 handles 扩张：

```bash
pnpm exec tsx apps/worker/src/cli.ts dump-bonjour-raw \
  --import-handles output/bonjour-raw/<date>/bonjour-auth-handles-<tag>/delta-import-handles.json \
  --skip-category-timeline \
  --scan-imported-profile-timelines \
  --scan-commenters \
  --timeline-concurrency 4 \
  --profile-concurrency 4 \
  --comment-concurrency 4 \
  --output output/bonjour-raw/<date>/bonjour-delta-raw-<tag>
```

3. 导入 `seeku`

```bash
pnpm exec tsx apps/worker/src/cli.ts import-bonjour-dump \
  --dump-dir output/bonjour-raw/<date>/bonjour-raw-<tag> \
  --concurrency 12 \
  --run-local-pipeline \
  --pipeline-batch-size 250
```

4. 同源去重 + 覆盖率检查

```bash
pnpm exec tsx apps/worker/src/cli.ts dedupe-bonjour
pnpm exec tsx apps/worker/src/cli.ts coverage --json
```

5. 先做 overlap 过滤，再决定是否跑 imported timelines

```bash
pnpm exec tsx apps/worker/src/cli.ts filter-bonjour-import-handles \
  --input output/bonjour-raw/<date>/bonjour-auth-handles-<tag>/import-handles.json \
  --exclude output/bonjour-raw/<prev-date>/bonjour-auth-handles-<prev-tag>/import-handles.json \
  --resolve-source-profiles \
  --resolve-concurrency 8 \
  --output output/bonjour-raw/<date>/bonjour-auth-handles-<tag>/delta-import-handles.json
```

## Batch Policy

- 先跑 `depth=0` 的大 frontier 批次，不盲目深搜。
- 优先 `import-handles + profile timeline`，这条比重复扫 categories 更容易出新。
- 第二批开始默认先做 handle overlap 过滤，优先只喂净新增 frontier handles 给 `dump-bonjour-raw`。
- overlap 过滤后的 mini-batch 禁止再扫全量 category timeline；否则会把旧覆盖整批重新吃回来。
- 每批结束后记录：
  - 新增 source profiles
  - 新增 persons
  - 去重后 persons
  - 错误数
  - top error messages

## Notes

- `dump-bonjour-raw` 产物与 `import-bonjour-dump` 兼容。
- `dedupe-bonjour` 当前只做强信号低风险合并，不处理模糊重复。
- 旧 dump 可重复导入；导入器现在会优先按 `(source, sourceProfileId)` replay/upsert，再回退到 `(source, sourceHandle)`。
- 历史坏 dump 若 `profiles-index.json` 指向缺失的 profile 文件，会按 skip 记录，不会拖垮整批导入。
- `filter-bonjour-import-handles` 可以把“上一轮已覆盖 + 当前库里已存在”的 handles 过滤掉，避免后续 batch 整批重扫旧 frontier。
- 若开启 `--resolve-source-profiles`，过滤器会先把输入 handle 解析成 `sourceProfileId + canonical handle`。这一步可以吃掉 Bonjour 的别名 handle 重叠，例如输入短链 handle 实际指向库里已存在的 canonical profile。
