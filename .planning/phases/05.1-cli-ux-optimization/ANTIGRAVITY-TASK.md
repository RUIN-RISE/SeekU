# Phase 05.1: CLI UX Optimization - Antigravity 任务委托

## 背景

Seeku CLI Phase 5 已通过三审 (9.2/10)，但测试报告指出用户体验问题：
- LLM 调用期间终端无反馈（黑屏等待）
- 多候选人串行 LLM 调用导致响应慢

我们已插入 **Phase 05.1: CLI UX Optimization** 作为紧急优化阶段。

---

## 你的任务

**按照 GSD 工作流推进 Phase 05.1：**

1. **执行 `/gsd:plan-phase 05.1`** 创建详细计划
2. **执行 `/gsd:execute-phase 05.1`** 实现优化
3. **完成后通知 Claude Code 进行验收**

---

## 优化需求（已评审确认）

### P0 - 用户感知优化（必须完成）

#### 1. ora spinner 加载状态

**问题:** LLM 调用期间终端完全静默

**方案:**
```typescript
import ora from 'ora';

// workflow.ts 改造
const spinner = ora('正在分析候选人画像...').start();

// 关键注意事项:
// - spinner 仅用于非交互等待阶段（LLM调用、缓存计算）
// - 在 tui.selectCandidate() 调用前必须 spinner.stop()
// - ora 使用 stderr，enquirer 使用 stdout raw mode，交替使用需确保 stop()
```

**验收标准:**
- LLM 调用期间显示 spinner 进度
- spinner 文案随阶段变化（"缓存检查..."、"计算评分..."、"生成洞察..."）
- 列表选择交互开始时 spinner 已停止

#### 2. 并行预加载 + 懒加载策略

**问题:** 5 候选人串行查看需 15+ 秒

**方案:**
```typescript
// workflow.ts - interactionLoop 改造
async interactionLoop(candidates, conditions) {
  // 后台启动预加载（不阻塞用户交互）
  const preloadPromise = this.preloadProfilesInBackground(candidates, conditions);

  while (!done) {
    const selected = await this.tui.selectCandidate(candidates);
    if (!selected) break;

    // 先检查缓存（可能预加载已完成）
    // 若无则即时计算（spinner介入）
    await this.showCandidateDetail(selected, conditions);
  }

  // 用户退出后静默取消预加载
  preloadPromise.catch(() => {});
}

// 并发控制工具函数 - 注意关键细节
async function promisePool<T>(
  tasks: (() => Promise<T>)[],  // 工厂函数数组！不是 Promise 数组
  concurrency: number
): Promise<T[]>

// ❌ 错误写法：Promise 数组在传入时已开始执行
// Promise.allLimit(tasks.slice(i, i + limit))

// ✅ 正确写法：工厂函数延迟执行
async function promisePool<T>(tasks: (() => Promise<T>)[], concurrency: number) {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const p = task().then(result => {
      results.push(result);
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}
```

**验收标准:**
- 用户选择第 1 个候选人时缓存可能已命中
- 并发限制默认 3（可配置）
- 预加载不阻塞交互循环

---

### P1 - 生产健壮性（建议完成）

#### 3. config.ts 统一配置 + Zod 验证

**问题:** 配置散落各文件，`parseInt` 可能返回 NaN

**方案:**
```typescript
// cli/config.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  llm: z.object({
    timeoutMs: z.number().int().min(1000).max(30000).default(8000),
    maxRetries: z.number().int().min(0).max(5).default(2),
    parallelLimit: z.number().int().min(1).max(10).default(3),
  }),
  ui: z.object({
    spinnerEnabled: z.boolean().default(true),
    defaultLimit: z.number().int().min(1).max(100).default(10),
    spinnerType: z.enum(['dots', 'line', 'moon']).default('dots'),
  }),
  cache: z.object({
    ttlDays: z.number().int().min(1).max(30).default(7),
  }),
});

// 环境变量覆盖 + fast-fail 验证
const rawConfig = {
  llm: {
    timeoutMs: parseInt(process.env.SEEKU_LLM_TIMEOUT ?? '8000'),
    maxRetries: parseInt(process.env.SEEKU_LLM_RETRIES ?? '2'),
    parallelLimit: parseInt(process.env.SEEKU_LLM_PARALLEL ?? '3'),
  },
  ui: {
    spinnerEnabled: process.env.SEEKU_SPINNER !== 'false',
    defaultLimit: parseInt(process.env.SEEKU_DEFAULT_LIMIT ?? '10'),
    spinnerType: process.env.SEEKU_SPINNER_TYPE ?? 'dots',
  },
  cache: {
    ttlDays: parseInt(process.env.SEEKU_CACHE_TTL ?? '7'),
  },
};

export const CLI_CONFIG = ConfigSchema.parse(rawConfig);
```

**验收标准:**
- 所有 CLI 常量从 config.ts 导入
- NaN 输入启动时 fast-fail 报错
- 环境变量可覆盖配置

#### 4. 重试机制 + 错误可重试性区分

**问题:** LLM 失败直接降级，无重试

**方案:**
```typescript
// cli/retry.ts
function isRetryable(error: Error): boolean {
  // 网络超时、限流 → 重试
  if (error.name === 'AbortError') return true;
  if (error.message.includes('429')) return true;  // Rate limit
  if (error.message.includes('503')) return true;  // Service unavailable
  if (error.message.includes('ETIMEDOUT')) return true;

  // 认证失败、参数错误 → 不重试
  if (error.message.includes('401')) return false;
  if (error.message.includes('400')) return false;
  if (error.message.includes('invalid')) return false;

  return true; // 默认重试
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = CLI_CONFIG.llm.maxRetries,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));

      if (attempt === maxRetries || !isRetryable(error)) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt); // 指数退避
      console.warn(`LLM调用失败，${delay}ms后重试 (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

// scorer.ts 改造
async scoreByLLM(candidate: Person, evidence: EvidenceItem[]) {
  return withRetry(
    () => this._scoreByLLMImpl(candidate, evidence),
    CLI_CONFIG.llm.maxRetries
  ).catch(() => this.fallbackScore(evidence)); // 最终降级
}
```

**验收标准:**
- 429/503/超时错误自动重试（指数退避）
- 401/400 错误不重试直接失败
- 重试日志显示进度

---

## 不执行的方向

- **DI容器**: 当前 Constructor 注入已足够
- **插件化评分器**: 6 维评分是业务固定需求
- **架构重构**: index.ts 已仅 26 行

---

## 验收流程

完成后通知 Claude Code，我将进行以下验收：

1. **代码审查:** 检查 ora/enquirer 冲突处理、promisePool 工厂函数模式
2. **功能测试:** 执行 CLI 验证 spinner 显示、预加载效果
3. **配置测试:** 设置无效环境变量验证 fast-fail
4. **重试测试:** 模拟 429 响应验证重试逻辑

---

## 工作量估算

| 任务 | 预估时间 |
|------|----------|
| config.ts + Zod 验证 | 30 min |
| ora spinner 集成 | 1-2 h |
| 并行预加载 + promisePool | 2-3 h |
| 重试机制 | 1 h |
| **总计** | **5-7 h** |

---

## 开始

请在 Codex 中执行：

```
/gsd:plan-phase 05.1
```

按照 GSD 工作流完成规划 → 执行 → 通知验收。

---

*委托方: Claude Code*
*验收方: Claude Code*
*执行方: Antigravity (Codex)*
*创建时间: 2026-03-30*