# V7 Enrichment Workflow Verification Record

Date: 2026-03-31
Phase: V7 Database Enrichment (OpenRouter Path)
Status: Completed & Hardened (Final V9.0 Pass)

## 1. 结果汇总 (Regression Summary)

- `pnpm typecheck`: **PASSED**
- `pnpm test`: **PASSED**
- 已通过测试文件: 20 个
- 已通过测试点: 85 个

## 2. 指标解读 (Metric Definitions)

在本次任务中，我们对 GitHub 相关的指标进行了口径对齐：

| 指标 | 当前值 | 定义说明 |
| :--- | :--- | :--- |
| **GitHub Identity (Distinct)** | **108** | 在 `person_identities` 中关联了 `source = 'github'` 档案的去重 `person` 数量。代表了库中“拥有 GitHub 身份”的人选总数。 |
| **GitHub Coverage** | **107** | `active` 状态且在 `evidence_items` 中拥有 `repository` 证据的 `person` 数量。代表了搜索侧“有代码背景”的核心人才规模。 |
| **Search Coverage** | **100%** | `search_documents` 总数 / `active persons` 总数。确保所有通过线索发现的新人选均已进入搜索索引。 |

## 3. 执行证据记录 (Execution Logs)

### A. 全链路富集流水线 (Enrichment Pipeline)
```bash
# 1. 建立 GitHub 基线 (支持以 Username 形式定向同步)
npx tsx apps/worker/src/cli.ts sync-github --handles "rosscai" --limit 10
# 产出: processed: 10

# 2. 线索发现 (OpenRouter 免费模型路径)
npx tsx apps/worker/src/cli.ts enrich-profiles --limit 10
# 日志摘要: [EnrichmentHub] Starting Enrichment...
# 产出: 5 条 "discovered_connection" 线索

# 3. 社交拓扑转换 (相位审计)
npx tsx apps/worker/src/cli.ts mine-network --limit 20
# 产出摘要:
# {
#   "discoveryPhase": { "processed": 5, "newProfiles": 0 },
#   "networkPhase": { "attempted": 15, "newProfiles": 15 }
# }
```

### B. 索引加固验证 (Isolation & Consistency)
```bash
# 4. 索引重构 (CLI 显式锁定 SiliconFlowStrict)
npx tsx apps/worker/src/cli.ts rebuild-search
# 验证 SQL: SELECT embedding_dimension FROM search_embeddings LIMIT 1;
# 结果: 4096 (硬隔离达标)
```

## 4. 自动化回归验收 (Regression Results)

运行新增的自动化测试套件：
- `provider-routing.test.ts`: **PASSED** (验证了富集链路可注入指定 Provider，且索引路径强制锁死 SiliconFlowStrict)
- `mining-result.test.ts`: **PASSED** (验证了 Discovery/Network 相位计数与汇总逻辑)

## 5. 最终覆盖率快照 (Coverage Snapshot)

```text
Seeku Enrichment Stats
active persons    902
indexed           902 / 902   100.0%
embedded          902 / 902   100.0%
discovery leads   5
github persons    108
```
