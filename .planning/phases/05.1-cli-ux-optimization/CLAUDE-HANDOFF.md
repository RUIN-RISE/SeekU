# Phase 05.1 回交 Claude Code 报告

**时间:** 2026-03-30  
**阶段:** Phase 05.1: CLI UX Optimization  
**状态:** 已完成本轮验收修复，等待 Claude Code 复核

## 给 Claude Code 的简报

本轮工作不是新增功能，而是对你在验收中指出的 CLI 关键缺陷做定点修复。  
修复范围覆盖启动体验、缓存正确性、LLM 超时弹性、跳过语义和 prompt 生命周期。

## 已修复的 5 个验收问题

### 1. 交互模式启动失败提示不友好

- 现状:
  - `apps/worker/src/cli/index.ts` 已改为在 `try` 内初始化 provider / DB
  - 缺失 LLM 凭证或 `DATABASE_URL` 时，会输出 CLI 可读错误提示
- 验证:
  - 本地执行 `pnpm --filter @seeku/worker start search --interactive`
  - 缺失 key 时不再输出 JSON blob，而是明确提示设置环境变量

### 2. 画像缓存按 personId 全局复用

- 现状:
  - `apps/worker/src/cli/workflow.ts` 现在会基于 `SearchConditions` 生成稳定 query key
  - `packages/db/src/profile-cache.ts` 在现有单行 JSONB 缓存结构中按 query key 存储多个 entry
  - `processingProfiles` 也改成按 `personId + queryKey` 去重
- 说明:
  - 这次没有引入 schema migration，而是做了向后兼容的存储封装
  - legacy 单画像缓存不再被读取复用，避免污染新查询

### 3. 画像摘要生成缺少超时控制

- 现状:
  - `apps/worker/src/cli/profile-generator.ts` 已接入 `AbortController`
  - 使用 `CLI_CONFIG.llm.timeoutMs`
  - 超时时降级返回默认 summary/highlights

### 4. 跳过经验要求后把“不限”带入检索

- 现状:
  - `apps/worker/src/cli/chat.ts` 中跳过经验追问不再写入 `"不限"`
  - `apps/worker/src/cli/workflow.ts` 的 `buildEffectiveQuery()` 对 `"不限" / "skip" / "none"` 做了防御过滤

### 5. 输入超时不清理 prompt

- 现状:
  - `apps/worker/src/cli/chat.ts` 在超时分支中调用 `promptBuffer.cancel()`
  - 会等待 prompt promise 清理后再继续流程

## 新增或更新的测试

- `apps/worker/src/cli/__tests__/chat.test.ts`
  - 跳过经验时不会把 `experience` 写成 `"不限"`
  - 输入超时后会 cancel prompt
- `apps/worker/src/cli/__tests__/profile-generator.test.ts`
  - 验证 LLM summary 生成收到 `AbortSignal`

## 本地验证结果

### 通过

- `pnpm build`
- `pnpm test`
- `pnpm --filter @seeku/worker typecheck`
- `pnpm --filter @seeku/api typecheck`
- `pnpm vitest run apps/worker/src/cli/__tests__/chat.test.ts apps/worker/src/cli/__tests__/profile-generator.test.ts apps/worker/src/search-cli.test.ts`

### 本轮顺手收口的 API 测试问题

- `apps/api/src/routes/profiles.ts`
  - 对非法 UUID 显式返回 400
  - 对合法但不存在的 UUID 继续返回 404
- `apps/api/src/routes/search.ts` + `apps/api/src/server.ts`
  - 增加可注入 search services，测试不再依赖真实 LLM
- `apps/api/src/server.test.ts`
  - 改为使用受控 mock services，避免 5s 超时

## 关键文件

- `apps/worker/src/cli/index.ts`
- `apps/worker/src/cli/chat.ts`
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/profile-generator.ts`
- `packages/db/src/profile-cache.ts`
- `apps/api/src/routes/search.ts`
- `apps/api/src/routes/profiles.ts`
- `apps/api/src/server.ts`
- `apps/api/src/server.test.ts`
- `apps/worker/src/cli/__tests__/chat.test.ts`
- `apps/worker/src/cli/__tests__/profile-generator.test.ts`
- `vitest.config.ts`

## 建议你下一步复核的点

1. 确认 query-scoped cache 的建模是否满足你对“条件相关画像”的验收标准
2. 确认交互启动失败提示的文案是否符合最终产品口径
3. 如你要继续做最终交付，可以直接基于当前版本复核，因为全仓 `pnpm test` 已恢复绿灯

---
**结论:** 本轮 CLI 验收缺陷已完成修复并补充回归测试，可以进入 Claude Code 复核。
