# Phase 4 持续修复提示词

## 给新会话 Claude 的指令

```
请继续 Seeku 项目 Phase 4 的修复工作。

## 当前状态

**已完成修复 (commit efa22f6):**
- ✅ 首页标题: "寻找简历上写不出来的硬实力"
- ✅ 打字机效果: 4个示例查询循环
- ✅ 证据引擎可视化: EvidenceEngine.tsx (3节点+SVG连线)
- ✅ 分数环形图: CandidateCard.tsx (SVG circle)
- ✅ 验证标记: "已验证" 徽章
- ✅ 筛选器面板: FilterPanel.tsx
- ✅ 测试文件: search-cli.test.ts, server.test.ts

## 待审核项

其他 Agent 正在审核新代码，可能发现以下问题：

1. **EvidenceEngine.tsx** - 检查交互逻辑是否正确
2. **CandidateCard.tsx** - 分数计算逻辑 (matchScore * 100 是否合理)
3. **打字机效果** - 是否与 SearchBar 组件正确集成
4. **测试文件** - vitest 配置是否正确

## 你需要做的

1. **读取审核结果**:
   - 查看 `.planning/phases/04-ui-evaluation/` 目录下的审核报告
   - 询问用户其他 Agent 发现了什么问题

2. **修复审核发现的问题**:
   - 按优先级修复 (P0 > P1 > P2)
   - 每个修复单独提交

3. **验证修复**:
   - `pnpm --filter @seeku/web build`
   - `pnpm test` (如有测试)

4. **更新文档**:
   - 更新 FIX-PLAN.md 状态
   - 标记已修复项

## 关键文件位置

```
apps/web/src/app/page.tsx              # 首页
apps/web/src/components/SearchBar.tsx  # 搜索框
apps/web/src/components/CandidateCard.tsx  # 候选人卡片
apps/web/src/components/EvidenceEngine.tsx # 证据引擎
apps/web/src/components/FilterPanel.tsx    # 筛选器
apps/worker/src/search-cli.test.ts     # CLI测试
apps/api/src/server.test.ts            # API测试
.planning/phases/04-ui-evaluation/FIX-PLAN.md  # 修复计划
.planning/phases/04-ui-evaluation/04-UI-SPEC.md # 设计契约
```

## 设计参考

设计稿位置:
- `.claude-design/ui-previews/seeku-landing.html` - 首页设计
- `.claude-design/ui-previews/seeku-search-results.html` - 搜索结果页

设计契约:
- `.planning/phases/04-ui-evaluation/04-UI-SPEC.md`

## 验收标准

修复完成后，确认:
1. 首页与 UI-SPEC 设计一致
2. 打字机效果流畅运行
3. 证据引擎悬停交互正常
4. 候选人卡片分数环形图正确显示
5. 测试可运行 (`pnpm test`)

## 完成后

修复全部通过后，Phase 4 完成，可以进入 Phase 5。
```

---

**使用方法:**

新开会话后，直接复制上面的提示词发送给 Claude 即可。

如果审核发现了具体问题，可以在提示词后补充：
```
其他 Agent 发现了以下问题:
1. [具体问题描述]
2. [具体问题描述]
请逐个修复。
```