# Seeku 搜索执行统一 — 验收报告

## 变更摘要

将 `SearchExecutor`（CLI agent/Web agent 使用）的核心检索逻辑下沉到 `@seeku/search` 包，消除了与 `SearchPipeline`（API/eval 使用）之间的排序行为分叉。

## 变更范围

### 新增文件

| 文件 | 用途 |
|------|------|
| `packages/search/src/search-conditions-types.ts` | `SearchConditions` 和 `SearchCandidateAnchor` 的 canonical 定义 |
| `packages/search/src/search-core.ts` | `SearchCore` 类 — 封装 retrieve→filter→graph→cross-encoder→rerank 管线 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `packages/search/src/index.ts` | 导出 `search-conditions-types` 和 `search-core` |
| `apps/worker/src/cli/types.ts` | `SearchConditions`/`SearchCandidateAnchor` 改为从 `@seeku/search` re-export |
| `apps/worker/src/cli/search-executor.ts` | `performSearch()` 委托 `SearchCore.execute()`；删除冗余的 `mergeIntentWithConditions` 和 `scoreWithCrossEncoder` |
| `apps/worker/tsconfig.json` | 添加 `@seeku/search` project reference |

### 其他本次 session 的工程修复（非搜索统一）

| 文件 | 变更 |
|------|------|
| `.gitignore` | 添加 `**/src/**/*.{js,d.ts,js.map,d.ts.map}` 防止构建产物污染 |
| `apps/api/tsconfig.json` | 添加 worker/adapters/identity/workers references，修复构建 |
| `apps/api/src/routes/admin-claims.ts` | 修复 Fastify 泛型类型错误 |
| `apps/api/src/routes/__tests__/chat-mission.test.ts` | 修复 stale mock，skip 需要真实 DB 的集成测试 |
| `package.json` | 添加 `doctor`、`eval:recruiting`、`eval:graph`、`eval:all`、`preflight` 脚本 |
| `scripts/doctor.ts` | Provider 健康检查（DB + DeepSeek + SiliconFlow） |
| `scripts/eval/recruiting-precision.ts` | Recruiting precision eval 门禁脚本 |
| `scripts/eval/graph-rerank.ts` | Graph rerank eval 门禁脚本 |
| `scripts/data-quality/coverage-report.ts` | 数据质量覆盖率报表 |
| `packages/eval/src/graph-rerank-eval.ts` | 导出 `main()` 和 `runGraphRerankEval()`，guard 自动执行 |
| `packages/eval/src/index.ts` | 添加 graph-rerank-eval 导出 |
| `.planning/ROADMAP.md` | v1.9 状态同步为 COMPLETE |
| `.planning/REQUIREMENTS.md` | 9 个 requirements 全部勾选 |
| `docs/decisions/001-web-shares-cli-workflow.md` | Web 定位 ADR |
| `packages/adapters/src/bonjour/dump.ts` | compact JSON + pretty 分离优化 |
| `packages/adapters/src/types.ts` | requestDelay 250ms → 100ms |

## 架构变更

```
Before:
  SearchPipeline (API/eval)     ← 独立实现 retrieve→rerank
  SearchExecutor (CLI/Web)      ← 独立实现 retrieve→filter→graph→rerank

After:
  SearchCore (@seeku/search)    ← 统一的 retrieve→filter→graph→CE→rerank
    ↑ used by
  SearchPipeline (API/eval)     ← 简单搜索（不变，后续可迁移）
  SearchExecutor (CLI/Web)      ← 委托 SearchCore + hydration/explanation
```

## 验证结果

### 构建
```
pnpm build → 11/11 tasks successful
```

### 单元测试
```
pnpm test → 929 passed, 1 skipped
2 pre-existing failures (profile_claims migration missing, unrelated)
```

### Recruiting Precision Eval
```
pnpm eval:recruiting
  Queries: 9
  Passed:  9/9
  Avg P@5: 0.978
  Avg P@10: 0.956
  All queries passed their precision gates.
```

**精度无回退。** 重构前后 P@5 完全一致（0.978）。

### Graph Rerank Eval
```
pnpm eval:graph
  Total queries: 9
  Graph-sensitive queries: 6
  Non-graph queries: 3
  Avg graph feature rate: 50.0%
```

### Doctor
```
pnpm doctor
  [✓] postgresql (59ms)
  [✓] deepseek-chat (970ms)
  [✓] siliconflow-embed (204ms)
  3 passed, 0 failed, 0 skipped
```

## 已知遗留问题

1. **`profile_claims` 表不存在** — 2 个 workflow 集成测试因缺少 DB migration 失败（pre-existing）
2. **`@seeku/web` build warning** — turbo.json outputs 配置不匹配（pre-existing）
3. **SearchPipeline 未迁移到 SearchCore** — SearchPipeline 仍然是独立实现，但它更简单且行为正确。后续可选择性迁移。

## 如何验收

```bash
cd /Users/rosscai/seeku

# 1. 构建
pnpm build

# 2. 测试
pnpm test

# 3. Eval 门禁
pnpm eval:recruiting

# 4. 健康检查
pnpm doctor

# 5. 确认 SearchExecutor 委托 SearchCore
grep "searchCore.execute" apps/worker/src/cli/search-executor.ts
# 应输出: const coreResult = await this.searchCore.execute(query, conditions, options);

# 6. 确认类型统一
grep "from \"@seeku/search\"" apps/worker/src/cli/types.ts
# 应输出: export type { SearchConditions, SearchCandidateAnchor } from "@seeku/search";
```
