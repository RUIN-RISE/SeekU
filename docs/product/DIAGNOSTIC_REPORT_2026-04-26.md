# Seeku 诊断报告 + 改进方案

> 生成时间：2026-04-26
> 触发：用户反馈「前端体验差 / 精准找人不佳 / 依赖预先设置好的模版」
> 范围：CLI 已交付的 v1.8 + 当前前端 / API / search package 全链路
> 模式：YOLO autopilot，无中途确认

---

## TL;DR（先看这一段）

| 反馈                 | 真正的根因（一句话）                                                                | 严重度 |
| -------------------- | ----------------------------------------------------------------------------------- | ------ |
| 前端体验差           | Web 前端**没接 agent runtime**，跑的是一个 mock 轮询 mission，与 CLI 是两套世界     | P0     |
| 精准找人不佳         | 三条搜索路径**全部绕过 SearchPipeline**，cross-encoder 在生产路径**从未被启用**     | P0     |
| 依赖预先设置好的模板 | Planner / Retriever / Reranker / 前端意图抽取**全部依赖手维护的 dict + 静态 prompt**| P1     |

简单说：CLI 那一套 agent loop 是好的（v1.8 ledger / V2 failure taxonomy / recovery loop），
但是**没有任何一条进入用户视野的路径**真正用上它 —— 用户在前端能感受到的，仍然是一个一次性的检索接口包了一层假装在思考的 UI。

---

## 0. 执行摘要

经过完整代码梳理（70+ 文件，~7300 LOC CLI runtime + ~3000 LOC web + ~2000 LOC search package）和单元测试验证（17 tests passed），可以确认这三个反馈**全部成立，且都来自同一个根因**：

> **「最好的能力没有被串起来。」**

具体表现在：

1. `apps/api/src/routes/search.ts:139-141`：`/search` 接口直接 `new QueryPlanner / new HybridRetriever / new Reranker`，**不走 SearchPipeline**，没有 cache、没有 cross-encoder、没有 recovery、没有 progressive。
2. `apps/api/src/routes/search-stream.ts:146`：`/search-stream` 走 SearchPipeline，但写死 `useCrossEncoder: false`，注释是 "Disabled for streaming speed"。
3. `apps/worker/src/search-cli.ts:134-137`：CLI 直接搜索也绕过 Pipeline，自己 new 了一遍。
4. `apps/worker/src/cli/workflow.ts:788-794`：连 agent runtime 自己也没用 Pipeline。
5. `apps/web/src/hooks/useChatSession.ts:290-441`：前端的 mission 循环是个 mock —— 用 `setTimeout(..., 200)` 反复打 `/search` 并 `slice(0, 5)` 当 shortlist，停止策略里 `evaluateMissionStopPolicy` 没有任何来自 agent runtime 的信号。

也就是说：**v1.8 ledger / V2 failure taxonomy / decideRecoveryActionV2 这三套已交付的核心能力，前端用户根本碰不到。**

---

## 1. 方法 & 范围

### 1.1 调研路径

- 全量阅读 monorepo 根 `pnpm-workspace.yaml`、turborepo、CLAUDE.md
- 前端：`apps/web/src/app/page.tsx`、`ChatInterface.tsx`、`ChatCopilotWorkboard`、`useChatSession.ts`（947 行）、`chat-session.ts`（602 行）
- API：`apps/api/src/routes/search.ts`、`search-stream.ts`、`chat-stream.ts`
- Search 核心：`packages/search/src/{pipeline,planner,retriever,reranker,cross-encoder,query-cache}.ts`
- CLI agent runtime：`apps/worker/src/cli/{workflow,recovery-handler,agent-policy,search-executor,condition-revision-service,...}.ts`
- 测试：`pnpm vitest run apps/worker/src/cli/__tests__/agent-policy.test.ts apps/worker/src/cli/__tests__/search-conditions.test.ts` → **17 passed**

### 1.2 没能跑的测试

- e2e 检索测试 — 本机无 docker，无法启动 Postgres + pgvector
- web 端到端 — 没启 dev server（与 e2e 同样依赖 DB）

这两块**只能纸面分析 + 单元测试覆盖**，下文会标注哪些结论需要 DB 起来后再回归。

---

## 2. 问题一：前端体验差 — 根因拆解

### 2.1 Web 完全没用 agent runtime

```
Web UI ─► /chat-stream（仅 LLM 寒暄）
       ─► /search（一次性，9 步打包返回）
       ─► /search-stream（SSE 但 useCrossEncoder=false）

CLI Agent runtime（clarify→search→narrow→compare→decide）
       ─► 没有任何 HTTP/SSE 端口暴露给前端
```

**file:line 证据：**

- `apps/web/src/lib/chat-session.ts` 中 web 调用的所有后端只有 `/api/chat`、`/api/search`，没有任何调用进入 worker/cli。
- `apps/api/src/routes/search.ts:204-298` 整个 `handleSearch` 是同步流水线，没有循环。
- `apps/worker/src/cli/workflow.ts` 暴露的是 CLI 命令，没有 HTTP adapter。

**用户感受：** 「为什么 CLI 里能澄清、能改条件、能停下来，前端却像一个搜索框？」—— 因为前端真的就是搜索框包了一层聊天皮。

### 2.2 前端的 "mission" 是个 mock

`useChatSession.ts:290-441` 的 `runMissionStep`：

- L306：`buildSearchQuery(conditionsRef.current)` 把结构化条件**重新拼回自然语言**字符串再发给 `/search`
- L326：调一次 `/search`，固定 `MISSION_PAGE_SIZE=10`
- L332：`shortlist = deduped.slice(0, Math.min(5, deduped.length))` —— shortlist 就是前 5 名
- L333：`compareSet = shortlist.filter(c => c.matchScore >= 0.75).slice(0, 3)` —— 阈值 0.75 写死
- L337-342：`evaluateMissionStopPolicy` 决定要不要停，输入只有 round/shortlist/compareSet/newTop，**没有任何 evidence、conviction、failure taxonomy**
- L434-440：`window.setTimeout(() => runMissionStep(token), 200)` —— 200ms 后再来一轮

这就是「mission」的全部：一个用前端定时器实现的伪 agent。

**前端代码自己也露馅：**

- L309-311：「正在执行第 N 轮大范围候选搜索。」—— 文案是写死的，不是 runtime 给的
- L351：`confidenceLevel: compareSet.length >= 3 ? "high" : "medium"` —— 信心度直接靠 compare set 大小定，不是真的 conviction

### 2.3 状态机散落 + 双模式分支地狱

`useChatSession` 维护了：

```
missionRef, missionRuntimeRef, conditionsRef, shortlistRef,
compareSetRef, recommendedCandidateRef, uncertaintyRef,
searchHistoryRef, turnIdRef, attachedSnapshotRef, ...
```

**而且是「local mock mission」和「attached runtime session」两套系统并存**，每个回调都要先判断 `effectiveAttachedSessionId` 走哪条路。修一个 bug 要在两处都改，新人 onboarding 噩梦。

### 2.4 文案 / placeholder / 错误提示全是硬编码

- `ChatInterface.tsx`：placeholder 写死为「帮我持续找上海的 agent infra 候选人，自动收敛后再停」
- 状态标签：`live / connecting / reconnecting / disconnected / missing / error` 在前端写死中文映射
- `search.ts:166-169`：「没有找到强匹配，当前结果以中等相关候选人为主。建议继续补充必须项、关键技术或放宽来源过滤。」—— 这种话应该由 agent 根据 V2 failure code 生成，不是 API 写死

### 2.5 缺失的"工作姿态"

CLI 有 `agent-policy.ts:buildClarifyPrompt`，前端有什么？
**前端的"思考"动画就是一个状态文字 + spinner**，没有：

- 这一轮在干嘛（retrieve / rerank / cross-encoder / recovery）
- 上一轮命中数和 conviction 的对比
- 哪些条件正在松绑、哪些在收紧
- 失败时的 V2 failure code 和它对应的 recovery 策略

用户只能看到结果，看不到推理过程 —— 跟 AI agent 应该有的 working posture 完全相反。

---

## 3. 问题二：精准找人不佳 — 根因拆解

### 3.1 Cross-encoder 在所有生产路径都被关闭

**这是最 high-impact 的发现。**

| 入口                     | 是否走 SearchPipeline | useCrossEncoder |
| ------------------------ | --------------------- | --------------- |
| Web → `/search`          | ❌ 直接 new 三件套    | N/A（未启用）   |
| Web → `/search-stream`   | ✅                    | **false**（写死，L146）|
| CLI `search-cli.ts`      | ❌ 直接 new 三件套    | N/A             |
| CLI workflow.ts          | ❌ 直接 new 三件套    | N/A             |
| `evals/`                 | 视具体 harness        | 不一致          |

也就是说：`packages/search/src/cross-encoder.ts`（328 行，`SCORING_PROMPT` + LLM 0-100 打分 + 批量调用 + 超时） **在生产里从未跑过**。

精准度的最大杠杆没有被拉。

### 3.2 Hybrid 权重和 boost 全是 magic numbers，未经 calibration

`packages/search/src/retriever.ts`：

- L?: `roleMatch * 0.08, skillMatch * 0.12, skillTextMatch * 0.10, leadershipText * 0.08, openSourceText * 0.18, githubSource * 0.06, specializedGithub * 0.12, exactName * 0.45, prefixName * 0.18`
- `resolveBlendWeights`：分支 1 → `{vector:0.85, keyword:0.15}`，分支 2 → `{vector:0.58, keyword:0.42}`
- `DEFAULT_KEYWORD_THRESHOLD = 0.08`

`packages/search/src/reranker.ts`：

- `projectMatchBoost: 0.08, repoMatchBoost: 0.04, followerBoostScale: 0.02`
- `freshnessDecayDays: 365, crossEncoderWeight: 0.3`

**没有任何一处** 这些数字是从 user feedback / eval 数据反向标定的。它们就是某次拍脑袋的结果，然后再也没动过。

### 3.3 Vector retrieval 静默降级

retriever 在向量检索失败时会 fallback 到 keyword-only，但**前端不知道**、agent 也不知道。
用户看到的"找不到"和"向量挂了导致召回崩"在 UI 上长一样。

### 3.4 前端预处理破坏结构

`useChatSession.ts:733-765` 的 `buildSearchQuery`：

```ts
const parts: string[] = [];
if (role) parts.push(role);
if (skills.length) parts.push(skills.join(" "));
if (location) parts.push(location);
// ...
return parts.join(" ") || "搜索候选人";
```

**用户在前端慢慢澄清出来的结构化条件 → 被拼成一个空格分隔的字符串 → 发给 /search → planner 再用正则把它拆回来。**

这是典型的"翻译两次损失两次"，而且第二次拆解还要靠下面 3.5 说的硬编码 hint patterns。

### 3.5 Recovery loop 在 web 路径上不存在

CLI 的 `recovery-handler.ts` + `agent-policy.ts:decideRecoveryActionV2` 已经能：

- 命中 `intent_anchor_missing` → 走 clarify
- 命中 `retrieval_zero_hits` → 走 rewrite
- 命中 `retrieval_all_weak` → 走 low_confidence_shortlist
- 命中 `recovery_budget_exhausted` → 走 stop

**Web 用户搜不到的时候只会拿到 `search.ts:160-169` 的那段写死中文文案，没有任何后续动作。**

### 3.6 等价词典手维护、规模小

`retriever.ts` 中的：

- `ROLE_EQUIVALENTS` ≈ 10 条
- `SKILL_EQUIVALENTS` ≈ 12 条
- `LOCATION_VARIANTS` 中英映射

`planner.ts` 中的：

- `ROLE_HINT_PATTERNS` ≈ 12 条
- `SKILL_HINT_PATTERNS` ≈ 22 条
- `UNIVERSITY_MUST_HAVE_HINTS` 只有"浙大"一条

候选人池一大就会出现「query 里写了某个同义词 → planner 不识别 → retriever boost 错位 → 排到第二屏」。

---

## 4. 问题三：模板依赖 — 根因拆解

> 这是用户最敏锐的反馈。Seeku 的"智能"很大程度上还是规则系统包了一层 LLM。

### 4.1 静态 prompt（应该热可改）

| 文件                            | 常量                  | 长度        | 上次改动 |
| ------------------------------- | --------------------- | ----------- | -------- |
| `packages/search/src/planner.ts:20-`     | `QUERY_PLANNER_PROMPT` | 大段中文规则 | 静态     |
| `packages/search/src/cross-encoder.ts:47-` | `SCORING_PROMPT`     | 0-100 评分 | 静态     |
| `apps/worker/src/cli/agent-policy.ts:76-90` | `buildClarifyPrompt` | 模板拼接   | 静态     |
| `apps/web/src/lib/chat-session.ts` | `extractConditions` 提示词 | 内嵌字符串 | 静态     |

修一句话要发布一次代码。

### 4.2 硬编码的领域字典

```
planner.ts:        ROLE_HINT_PATTERNS, SKILL_HINT_PATTERNS,
                   UNIVERSITY_MUST_HAVE_HINTS, EXPERIENCE_HINTS,
                   WEAK_MUST_HAVE_PATTERNS, SOURCE_HINTS

retriever.ts:      ROLE_EQUIVALENTS, SKILL_EQUIVALENTS,
                   LOCATION_VARIANTS

reranker.ts:       TECH_LEAD_ROLE_TERMS, SPECIALIZED_QUERY_TERMS,
                   OPEN_SOURCE_QUERY_TERMS

chat-session.ts:   knownSkills, knownLocations, role hints
```

**所有这些应该是：**

- 来自语料/embedding 的语义扩展（不是手写）
- 从用户实际查询日志离线挖掘出来的
- 至少存在 DB 表里，而不是 TS 常量

### 4.3 反馈分类器是正则

`useChatSession.ts:911-919` `classifyMissionCorrection`:

```ts
if (/先给我结果|先停一下|先停|...|直接汇报|先总结/.test(text)) ...
```

`useChatSession.ts:921-939` `classifyAttachedRuntimeFeedback`：只识别 4 个 tag：
`less_academic / prefer_recent_execution / more_engineering_manager / more_hands_on_builder`

**用户用任何这 4 个 tag 之外的话表达偏好，前端都听不见。**

### 4.4 Heuristic intent fallback 在工业品里不可接受

`planner.ts` 的 `heuristicIntent`：当 LLM 失败时用正则解析 `/(beijing|shanghai|...)/`、技能 hint 列表等。

这意味着 LLM 一抖动，搜索结果质量就大幅滑坡，且**用户无感**（只看到结果变差，不知道是 fallback）。

### 4.5 V2 failure 的中文 rationale 也是硬编码

`agent-policy.ts:decideRecoveryActionV2` 里每个 case 的中文解释都是写死字符串。
应该让 LLM 根据 attempt + failure 报告**生成**解释，而不是从 7 个 enum 里二选一选个固定文案。

---

## 5. 测试结果

### 5.1 已跑通

```
$ pnpm vitest run \
    apps/worker/src/cli/__tests__/agent-policy.test.ts \
    apps/worker/src/cli/__tests__/search-conditions.test.ts

✓ agent-policy decides V2 actions correctly
✓ buildClarifyPrompt produces non-empty output
✓ search-conditions extracts/revises correctly
...
17 passed (17)
```

→ Agent runtime 内部逻辑稳定。问题不在内部逻辑，在串联。

### 5.2 没能跑

- 端到端检索（依赖 docker + pgvector，本机没 docker）
- Web e2e（同上）
- Cross-encoder 真实打分（需要 SiliconFlow key + DB）

恢复 docker 后建议跑：

```bash
# 在 infra/ 下
docker compose up -d
pnpm --filter worker run search:eval     # 看 baseline 召回
pnpm --filter worker run agent:eval      # 看 V2 recovery 命中率
```

---

## 6. 改进方案

> 按 **能否在 1 周内交付** 和 **对用户感知的杠杆** 排序。

### P0 — 让"能力"和"用户"接通（核心）

#### P0-1：Web 接 agent runtime（不再用 mock mission）

**做什么：**

1. 把 `apps/worker/src/cli/workflow.ts` 的 agent runtime 抽出来变成 `packages/agent-runtime` 的可复用模块
2. 在 `apps/api` 加 `/api/agent/sessions/:id/events` 的 SSE 端点，把 runtime 事件流式推到前端（`session_started / clarify_question / search_started / shortlist_updated / recovery_decision / completed`）
3. 在 `apps/api` 加 `/api/agent/sessions/:id/messages` 的 POST 端点，前端发用户消息进 runtime
4. 删掉 `useChatSession.ts:290-441` 整个 `runMissionStep` 假循环，改成"订阅 runtime 事件 + 发用户消息"两件事

**收益：** 一砍砍掉 ~600 行 mock 代码 + 让用户看到真正的 agent 行为。

**依赖：** runtime 抽出来。Phase 0 是抽包，Phase 1 是接 HTTP。

#### P0-2：所有搜索入口走 SearchPipeline

把 `apps/api/src/routes/search.ts:139-141`、`apps/worker/src/search-cli.ts:134-137`、`apps/worker/src/cli/workflow.ts:788-794` 全部替换成 `new SearchPipeline({...})`。

收益：cache + 统一 progressive callback + 未来 cross-encoder 一处开关全局生效。

#### P0-3：默认开 cross-encoder（streaming 也开）

把 `search-stream.ts:146` 的 `useCrossEncoder: false` 改成 `true`，注释里 "Disabled for streaming speed" 不成立 —— cross-encoder 是异步流式的，可以晚一点送结果上去，不影响首字节。

如果担心 LLM 调用费用，加一个：cross-encoder **只对前 20 名跑**，且对 `matchStrength === "strong"` 跳过。`pipeline.ts` 已有 `crossEncoderLimit: 20`，开就是了。

#### P0-4：把前端 buildSearchQuery 的 NL 拼接干掉

让 `/search` 和 agent runtime 都接受**结构化** intent（直接传 conditions 对象），不要再让前端把结构条件序列化成自然语言再让 planner 解析回来。

要做的事：在 `SearchRequestBody` 里加 `intent?: QueryIntent` 字段，传了就跳过 planner.parse。

### P0 — 精准度的快速胜利

#### P0-5：Boost 系数从 magic number → 可配置

把 `retriever.ts` 和 `reranker.ts` 的所有 boost 抽成 `packages/search/src/scoring-config.ts`，从 ENV / DB 读，加一个 `seeku_scoring_config` 表。

跟 P0-6 配套：在前端开发模式下提供"调参面板"，让运营 / 开发当场调系数看效果。

#### P0-6：召回失败时，agent 接管（不是 API 自己写死文案）

把 `search.ts:160-169` 的 `buildApiResultWarning` 删掉，改成：API 返回 V2 failure 报告（`SearchAttemptReport + SearchFailureReport`），由 agent runtime 决定下一步（clarify / rewrite / accept low-confidence / stop），文案由 LLM 生成。

#### P0-7：Vector 失败显式告警，不静默降级

retriever 走 fallback 时往 result.warnings 里塞 `vector_search_failed`，前端 UI 上明确显示「向量检索异常，当前结果仅基于关键词。建议稍后重试。」

### P1 — 拆模板（去硬编码）

#### P1-1：等价词典 → embedding semantic expansion

不维护 `ROLE_EQUIVALENTS` / `SKILL_EQUIVALENTS` 这种字典。改成：在 retriever 里给每个 role/skill 词跑一次 embedding，找语料里 cosine top-K 同义词作为扩展查询。

落地：新增 `packages/search/src/expander.ts`，TTL cache 24h。

#### P1-2：Hint patterns 从代码常量挪到 DB

`ROLE_HINT_PATTERNS / SKILL_HINT_PATTERNS / TECH_LEAD_ROLE_TERMS / ...` → `seeku_taxonomy` 表，admin UI 里可以加。

短期价值：运营不依赖发版就能加同义词。
长期价值：用户查询日志可以反向 mining 出新词，自动补到表里。

#### P1-3：Prompt 外置 + 版本化

`QUERY_PLANNER_PROMPT / SCORING_PROMPT / buildClarifyPrompt` 全部挪到 `packages/search/src/prompts/*.md`，加 `prompt-version` 字段写到 telemetry。

收益：iterate prompt 不用发布、能 A/B、能回归。

#### P1-4：反馈分类用 LLM，不用正则

`classifyMissionCorrection / classifyAttachedRuntimeFeedback` 改成调一次 LLM，输出统一的 `FeedbackTag` enum 但允许 free-text rationale。

延迟成本：~300ms。换来"用户用任何说法都能被理解"。

#### P1-5：V2 failure 的解释文案 LLM 化

`agent-policy.ts:decideRecoveryActionV2` 不再返回硬编码 rationale 字符串。改成返回 `{action, evidence}`，由上层 LLM 调用根据 evidence 生成给用户看的话。

### P1 — 前端体验

#### P1-6：单一 session 模型

删掉 useChatSession 的 dual-mode（local mission vs attached runtime），统一只走 attached runtime。前端从 947 行预计可缩到 ~400 行。

#### P1-7：暴露 working posture

新增 `<AgentTrace>` 组件展示：

- 当前 stage（intent / retrieve / rerank / cross_encoder / recovery）
- 这一轮的 attempt 报告（命中数 / conviction）
- 上一轮 vs 这一轮的 delta
- 触发的 V2 failure（如果有）和选中的 recovery action

数据全部来自 P0-1 的 SSE 事件流。

#### P1-8：placeholder / 文案统一进 i18n 文件

最低要求：`apps/web/src/i18n/zh.ts`，至少 placeholder、状态标签、错误提示、空态文案不再写死在组件里。

### P2 — 长期投资

- **Calibration 数据收集**：每次 search 完埋点 `(intent, candidates, finalScore, userFeedback)` 落到 `seeku_search_telemetry`，定期跑离线 fit 拿到新的 boost weights
- **Eval harness 扩到 web 路径**：现在的 eval 都在 worker，web /search 没 baseline，加 `apps/api/eval/`
- **Bonjour API 监控**：现在 graceful degradation 是写在代码里的，加一个 `seeku_source_health` 表 + dashboard

---

## 7. Quick Wins（< 1 天能改完）

按 PR 顺序排：

1. **PR-A**：`search-stream.ts:146` `useCrossEncoder: false` → `true`，并把 `crossEncoderLimit` 从默认 20 调成 15 控费用 → **精准度立竿见影**
2. **PR-B**：删掉 `search.ts:166-169` 的硬编码 warning，让 API 返回 attempt + failure 报告 → **为 P0-6 铺路**
3. **PR-C**：把 `useChatSession.ts:332-333` 的 `slice(0, 5)` 和 `>= 0.75` 抽到 ENV，标记 TODO → **不是真修，是停止伪装**
4. **PR-D**：`ChatInterface.tsx` placeholder 抽到 i18n → **文案不再藏在组件**
5. **PR-E**：retriever vector fallback 时 push warning → **解决静默降级**

---

## 8. 风险 & 前置条件

- **PR-A 前置**：要确认 SiliconFlow 的 cross-encoder LLM 调用配额够（前 15 个候选 × 每次 search ≈ 一次额外 LLM call）
- **P0-1 前置**：需要把 worker runtime 抽包，会动 import 路径，建议跟 v1.9 milestone 一起规划
- **P1-1 前置**：embedding-based expansion 会增加每次 search 的 embedding 调用量，建议先做 24h TTL cache
- **不要做的**：不要尝试一次性把 magic numbers 全标定 —— 先把 telemetry 落到位，让数据说话

---

## 9. 与既有规划文档的关系

- `.planning/STATE.md` 标记的"between milestones" → 这份诊断的 P0 应该收敛进 v1.9 milestone goal
- `docs/product/CLI_AGENT_RECOVERY_LOOP_REVIEW_BRIEF_2026-04-21.md` 已经定义了 V2 failure taxonomy，**P0-6 是把它从 CLI 搬到 Web 的工程化**
- `docs/superpowers/specs/2026-04-16-cli-search-agent-design.md` 是 CLI 设计，**P0-1 是把它产品化到 Web 的工程化**

---

## 10. 一句话总结给醒来的你

> Seeku 现在的状态是：**CLI 上跑着一个真 agent，前端用户用着一个假 agent，中间隔了一层叫做"我们没把它接起来"。**
> P0 不是发明新东西，是把已有的东西串起来 —— 把 SearchPipeline 用上、把 cross-encoder 打开、把 agent runtime 暴露成 SSE、把前端 mock 删掉。
> 一周左右就能让用户感受到「精准度 + 工作姿态」的双重跃迁。
