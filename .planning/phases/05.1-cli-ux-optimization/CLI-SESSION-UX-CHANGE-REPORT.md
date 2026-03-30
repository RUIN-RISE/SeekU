# CLI Session UX Change Report

## Goal

把 Seeku CLI 从“单次搜索流程”推进到“会话式搜索助手”的第一阶段，优先解决：

- 默认入口不够产品化
- 搜索前缺少理解回显
- 结果页更像名单页，不像决策页
- 详情页缺少下一步动作
- 搜索后无法自然 refine

## What Changed

### 1. 默认入口改成会话式助手

文件：

- `apps/worker/src/cli.ts`
- `apps/worker/src/cli/index.ts`

行为变化：

- `seeku` 现在直接进入 interactive session
- `seeku "query"` 会把整句自然语言作为初始需求进入 session
- `seeku search` 在没有 query 且非 `--json` 时，也会自动进入 interactive session
- `version/help` 文案改成更贴近“搜索助手”

### 2. 搜索前增加“理解回显 + 下一步动作”

文件：

- `apps/worker/src/cli/chat.ts`
- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/types.ts`

行为变化：

- 用户输入自然语言需求后，不再直接进入“抽字段 + 补洞”
- 系统先回显当前理解：
  - 角色
  - 技术栈
  - 地点
  - 经验
  - 当前缺失项
- 用户可在搜索前主动选择：
  - 直接搜索
  - 再补充条件
  - 放宽条件
  - 重新描述需求
  - 退出

实现说明：

- 新增 `reviseConditions()`，支持在当前条件上做 `tighten / relax / edit`
- `workflow` 现在先跑 clarify loop，再进入 search loop

### 3. 结果页从列表选择改成命令式 shortlist

文件：

- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/types.ts`

行为变化：

- 不再使用 `Select` 式的“上下键选人”
- shortlist 默认展示 Top 5
- 每个候选人新增 1 行 `为什么匹配`
- 支持结果页命令：
  - `v 2` 查看第 2 位候选人
  - `c 1 3` 对比第 1 和第 3 位候选人
  - `sort overall|tech|project|location`
  - `r` 继续 refine
  - `m` 展示更多
  - `q` 退出

实现说明：

- `matchReason` 目前是基于 query term / 地点 / 证据标题的启发式生成，不是 LLM 解释
- `sort tech/project/location` 会按需拉起 profile 生成，再按对应维度排序

### 4. 详情页加入下一步动作

文件：

- `apps/worker/src/cli/renderer.ts`
- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/workflow.ts`

行为变化：

- 详情页顶部新增 `为什么值得看`
- 详情页底部固定展示动作：
  - `back`
  - `why`
  - `refine`
  - `q`
- `why` 会展开当前候选人的匹配依据卡片
- `refine` 会直接把用户带回下一轮搜索收敛，而不是只能退回列表

### 5. 搜索会话支持连续 refine

文件：

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/chat.ts`

行为变化：

- shortlist 页可直接输入 refine 指令进入下一轮
- detail 页也可直接输入 refine 指令进入下一轮
- 没结果时，系统会提示用户直接调整当前条件，而不是流程结束

实现说明：

- `workflow.execute()` 现在是 session loop，而不是一次性执行
- 主循环结构已经变成：

`clarify -> search -> shortlist -> detail/compare/refine -> search`

## Files Changed

- `apps/worker/src/cli.ts`
- `apps/worker/src/cli/index.ts`
- `apps/worker/src/cli/chat.ts`
- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/renderer.ts`
- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/types.ts`

## Validation

已验证：

- `pnpm --filter @seeku/worker typecheck`
- `pnpm vitest run apps/worker/src/cli/__tests__/chat.test.ts`

结果：

- TypeScript typecheck 通过
- chat 相关测试 6/6 通过

## Current Limitations

这次是“第一阶段会话化”，还没有做完的点：

- 结果页的 `matchReason` 还是启发式，不是更强的结构化解释
- 没有真正的 compare pool，只支持即时 `c 1 3` 对比
- 没有 `save shortlist` / 收藏 / 导出
- 没有会话持久化，CLI 重启后 session 会丢失
- `refine` 目前统一走 `reviseConditions(..., "edit")`，还可以继续细分 tighten / relax intent

## Recommended Next Steps

建议 Claude Code 接着做这几项，优先级从高到低：

1. 强化 shortlist 的“为什么匹配”
   - 最好把原因和评分维度打通，而不是纯关键词命中

2. 增加 compare pool / save shortlist
   - 详情页支持 `compare`
   - 结果页支持把候选人加入候选池

3. 引入 session memory
   - 保留本轮 search history
   - 支持 `undo` / `show filters`

4. 把 refine 指令做成更明确的 action parser
   - 区分 tighten / relax / rerank
   - 例如“按项目深度重排”应尽量只 rerank，不要整轮重搜

## Notes For Handoff

- 当前实现尽量复用已有检索、重排、画像、缓存逻辑，主要改 orchestration 层
- `apps/worker/src/cli/workflow.ts` 现在是本轮 UX 逻辑的核心入口
- 如果下一步继续做产品化，建议避免再回到 `Select` 式 TUI；当前命令式 shortlist 更接近“工作台”模型
