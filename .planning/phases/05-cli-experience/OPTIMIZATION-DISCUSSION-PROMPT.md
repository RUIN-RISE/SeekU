# CLI 优化与封装讨论提示词

**项目:** Seeku - AI人才搜索引擎
**当前状态:** Phase 5 CLI 已通过三审，评分 9.2/10，生产就绪
**目标:** 与 Antigravity 讨论 CLI 的进一步优化与封装策略

---

## 当前代码状态

### 已完成功能
- 交互式对话搜索（LLM 条件提取 + 最多 2 次追问）
- 混合评分引擎（规则 60% + LLM 40%）
- 6 维画像卡片（终端 boxen 渲染）
- PostgreSQL JSONB 缓存（TTL 7 天）
- 工业级安全防护（Prompt 注入防护、Zod 验证、AbortSignal 超时）

### 测试结果
- 通过率: 86.7% → 预期 95%+
- 三审评分: 9.2/10
- 0 个阻断性问题

### 文件结构
```
apps/worker/src/cli/
├── index.ts              # 主入口 (Orchestrator)
├── chat.ts               # 对话交互 + 条件提取
├── tui.ts                # 终端 UI (enquirer)
├── scorer.ts             # 混合评分引擎
├── profile-generator.ts  # 画像生成器
├── renderer.ts           # 终端卡片渲染
├── schemas.ts            # Zod 验证 + 工具函数
└── types.ts              # TypeScript 类型定义

packages/db/src/
├── schema.ts             # profile_cache 表定义
└── profile-cache.ts      # 缓存 Repository
```

---

## 待讨论的优化方向

### 1. 架构重构

**当前问题:**
- `index.ts` 职责过重（130+ 行），承担了 Orchestrator + Coordinator + Lifecycle
- 工具函数散落在各文件中（`dedupeArray` 在 `chat.ts`，`isEmptyInput` 也在）

**讨论点:**
- 是否需要引入 `SearchWorkflow` 类封装主流程？
- 是否需要独立的 `utils.ts` 或移入 `schemas.ts`？
- 是否需要引入轻量级 DI 容器（如 Inversify）？

### 2. 可扩展性

**当前问题:**
- 新增评分维度需要修改多个文件
- 新增搜索条件类型需要改 `types.ts` + `chat.ts` + `scorer.ts`

**讨论点:**
- 是否需要插件化架构（评分器可插拔）？
- 是否需要配置驱动的权重系统（YAML/JSON 配置文件）？
- 如何支持更多搜索条件类型（如薪资范围、学历要求）？

### 3. 用户体验

**当前问题:**
- LLM 调用延迟时终端无反馈（黑屏等待）
- 错误提示较简单，缺乏引导

**讨论点:**
- 是否需要引入 `ora` 或 `cli-spinners` 显示加载状态？
- 是否需要彩色错误分级（红色错误、黄色警告、绿色成功）？
- 是否需要进度条显示（如 "正在分析 5/10 候选人..."）？

### 4. 性能优化

**当前问题:**
- 多候选人详情查看时串行调用 LLM（每人 1-3 秒）
- 缓存命中后仍需渲染时间

**讨论点:**
- 是否需要预加载热门候选人的画像？
- 是否需要批量 LLM 调用并行化？
- 是否需要本地内存缓存层（LRU Cache）？

### 5. 测试覆盖

**当前问题:**
- 仅有 `chat.test.ts` 一个测试文件
- 交互式测试依赖手动执行

**讨论点:**
- 如何为 `scorer.ts` 编写单元测试（Mock LLMProvider）？
- 如何为 TUI 编写 E2E 测试（expect 脚本）？
- 测试覆盖率目标是多少？

### 6. 配置管理

**当前问题:**
- LLM 模型名、超时时间等散落在代码中
- 权重已在 `SCORING_WEIGHTS`，但其他配置未统一

**讨论点:**
- 是否需要统一的 `config.ts` 或 `config.json`？
- 是否需要环境变量覆盖机制？
- 是否需要运行时配置（如用户自定义权重）？

### 7. 错误处理

**当前问题:**
- 错误提示简单，缺乏恢复建议
- 部分错误直接退出程序

**讨论点:**
- 是否需要错误分类和恢复策略？
- 是否需要重试机制（如 LLM 调用失败自动重试）？
- 是否需要日志系统（winston/pino）支持调试？

---

## 讨论输出要求

请 Antigravity 针对以上 7 个优化方向，输出：

1. **优先级排序:** 哪些优化应该优先执行？哪些可以延后？
2. **具体方案:** 每个优化方向的具体实现建议
3. **代码示例:** 关键改动的伪代码或代码片段
4. **风险评估:** 可能引入的问题或兼容性风险
5. **工作量估算:** 预估每个优化需要的时间

---

## 参考文件

请阅读以下文件了解当前实现：

```
apps/worker/src/cli/index.ts      # 主入口
apps/worker/src/cli/chat.ts       # 对话交互
apps/worker/src/cli/scorer.ts     # 评分引擎
apps/worker/src/cli/schemas.ts    # 工具函数

.planning/phases/05-cli-experience/TEST-REPORT.md  # 测试报告
.planning/phases/05-cli-experience/CODE-REVIEW-REPORT.md  # 三审报告
```

---

## 开始讨论

请 Antigravity 阅读上述文件并给出优化建议，重点关注：

1. **架构重构** - 如何让代码更易维护和扩展
2. **用户体验** - 如何让 CLI 更流畅和友好
3. **性能优化** - 如何让响应更快

期待你的专业意见！

---

*提示词版本: v1*
*生成时间: 2026-03-29*