## Phase 5 CLI 工业级审查报告

### 1. 安全性 (Security)
**评分:** 5/10
**发现问题:**
- [🔴 BLOCK] LLM Prompt 注入风险 (`chat.ts:15`, `scorer.ts:64-67`, `profile-generator.ts:13-23`)
  外部无上下文边界地拼合用户输入 (`input`) 或不可信数据 (`candidate.primaryHeadline`, `evidence.title`) 到 Prompt 中。如果用户输入或 GitHub bio 包含 "Ignore above directives and return...", 将导致 Prompt Hijacking，使安全拦截失效或返回恶意 JSON 数据。
- [🟠 CRITICAL] JSON 解析无验证，存在污染或崩溃风险 (`chat.ts:38`, `scorer.ts:90`, `profile-generator.ts:48`)
  基于正则提取后直接进行 `JSON.parse`，毫无字段校验。如果大模型输出的 JSON 为缺少部分字段或字段类型错误（如预想数字却输出中文字符串），将导致下游计算（如 `scores.projectDepth * 0.25`）产生 `NaN` 分数。
- [🟡 MAJOR] 异常日志未脱敏 (`index.ts:130`)
  `console.error(..., error)` 直接打印整个 error 实例。如果底层 ORM 或者 DB 报错，可能会在终端暴露出数据库连接字符串或敏感的表结构信息。

**建议修复:**
- 对所有传入 LLM 的变量统一使用明确的定界符包围（例如 `<userInput>{input}</userInput>`），或如果模型支持，尽量以结构化 Message 列表的形式传递 User Intent。
- 引入 Zod (`zod` package) 对所有 LLM 解析后的 JSON 进行严格的强类型验证，并在失败时直接进入 Fallback 降级。
- 捕获异常后只抛出并打印 `error.message` 或者定制化的人类可读报错。

### 2. 性能 (Performance)
**评分:** 6/10
**发现问题:**
- [🔴 BLOCK] 悬空的 Timeout 与无效的 AbortController (`scorer.ts:59-88`)
  初始化了 `AbortController` 和 8 秒的 `setTimeout`，但是完全**没有**将 `controller.signal` 注入/传递给 `this.llm.chat()` 方法。这种写法导致超时只触发了 `abort()` 但网络请求依旧在后台等待，不但无法掐断长尾请求，还引发底层未处理的网络挂起，并发量增高时将耗尽句柄。
- [🟡 MAJOR] Cache 表的字段隐患 (`profile-cache.ts` / `schema.ts:273`)
  虽然使用了 JSONB 以灵活存储 profile，但是对 `expiresAt` 的比较是在整个行上全表扫描执行的，缺乏对时间维度的索引保护，一旦缓存记录膨胀，将变为缓慢的扫描。

**优化建议:**
- 在 `this.llm.chat()` 签名中支持并传递 `{ signal: controller.signal }`。
- 在 `schema.ts` 针对 `expiresAt` 追加数据库索引。

### 3. 可靠性 (Reliability)
**评分:** 7/10
**发现问题:**
- [🟠 CRITICAL] 粗暴的 JSON 降级策略导致空跑 (`chat.ts:41-42`)
  当大模型抽取条件的 JSON 解析失败时，直白地 catch 中返回 `{ skills: [], locations: [] }`。这意味着用户的长难句搜索会被直接转化为无条件降级，不但引发业务逻辑困惑，还间接导致无限制查找全体人才。
- [🟡 MAJOR] 默认评分的一刀切降级 (`scorer.ts:98-103`)
  LLM 请求报错后返回 `projectDepth: 60, academicImpact: 40, communityReputation: 5` 固定面值。如果一批数据网络抖动，会导致候选人出现极度相似的分数和并列排序，失去了 rule-based 优势。

**改进建议:**
- 在 `chat.ts` 的条件抽取中加入 LLM Retry 机制（例如允许失败重试最多两次）。
- LLM 故障降级时，基于 Rule 分数的中位数或 Evidence 记录数，赋予更动态的兜底默认值。

### 4. 可维护性 (Maintainability)
**评分:** 6/10
**发现问题:**
- [🟠 CRITICAL] Typescript Any 的滥用腐蚀了类型安全 (`profile-cache.ts:7`, `schema.ts:273`)
  `ProfileCacheRepository` 及 ORM 原生表定义直接使用 `any` 接收 `profile`，导致缓存读出的 `MultiDimensionProfile` 完全没有静态验证，在 `index.ts` 中如果不小心修改了类型，此防线将失守。
- [🟡 MAJOR] 关键评分权重的魔法数字 (`scorer.ts:125-131`)
  不同维度的聚合权重（如 0.30、0.25）完全分散硬编码在代码中。作为 AI 产品，权重必然需要根据 Feedback 进行快速实验和调优，散落的硬代码阻滞了灵活性。

**重构建议:**
- 在 `schema.ts` 将其规范化：`jsonb("profile").$type<MultiDimensionProfile>()`。
- 新建统一 `config/score.config.ts` 管理权重，便于后续读取环境变量进行 A/B 测试。

### 5. 架构设计 (Architecture)
**评分:** 6/10
**发现问题:**
- [🟠 CRITICAL] 核心业务组件违反了依赖倒置原则（DIP） (`scorer.ts:6`, `chat.ts:9`, `profile-generator.ts:6`)
  各处分别直接调用了 `SiliconFlowProvider.fromEnv()` 这个静态具象类。这使得项目与唯一的 Provider 完全耦合：后续更换 OpenAI SDK、进行业务逻辑 Mock 单元测试时都将遭遇困局。
- [🟡 MAJOR] CLI Orchestrator 耦合过重 (`index.ts:23-134`)
  当前入口承担了交互收集 (`chat`)、UI 呈现 (`tui`)、引擎评分 (`scorer`) 以及 协调逻辑 (Coordinator) 的多重工作，代码达到了 130 行以上的单一巨石状态。

**改进建议:**
- 在 `HybridScoringEngine` 和 `ChatInterface` 的 Constructor() 中声明要求提供一个实现了统一 `LLMProvider` 抽象的对象，而在应用启动入口统一组装后注入（DI）。
- 把核心执行序列提出到单独的 `SearchWorkflow` 中独立封装，仅让 index 控制 Lifecycle。

### 综合评估
**总体评分:** 6/10
**阻断性问题:** 2
**严重问题:** 5
**一般问题:** 4

### 结论
**🔴 BLOCK**
该模块虽功能基本实现，但因存在明显的网络隐患（无效超时的 AbortController 陷阱）、类型安全漏洞（JSON 不校验造成产生 NaN 的连锁污染）以及 Prompt Injection 开口，暂不可直接合入主分支。强烈建议彻底重构依赖注入、完善 Zod Schema 与超时控制器。

### 优先修复清单
1. [🔴 BLOCK] `scorer.ts:59-88`：重写大语言模型访问，使其合法传入并消费 `controller.signal` 实现真级断网防泄漏。
2. [🔴 BLOCK] 审查及转义全量外部变量注入点，以规避 LLM 级指令窃取和注入。
3. [🟠 CRITICAL] 为所有涉及 JSON 提取的地方使用 Zod。并防止非预期返回类型的空跑错误（比如缺字段引发计算中的 `NaN`）。
4. [🟠 CRITICAL] 完成 Constructor 层依赖注入，摒除类中的 `fromEnv()` 静态依赖。
