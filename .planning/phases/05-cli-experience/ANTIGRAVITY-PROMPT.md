# Antigravity 开发任务: Phase 5 CLI Interactive Search

**项目:** Seeku
**Phase:** 05 - CLI Interactive Search Experience
**审核方:** Claude Code (Opus 4.6)

---

## 任务概述

实现 Seeku 的智能对话式人才搜索 CLI，核心流程：
```
对话交互 → 条件提取 → Bonjour搜索 → 多维画像 → 终端交付
```

---

## 核心设计决策（已确认）

| 决策项 | 结论 |
|--------|------|
| 对话模式 | 智能对话 + 条件补全，LLM 提取结构化条件 |
| 追问策略 | 最多 2 次，Enter 跳过直接搜索 |
| 画像缓存 | PostgreSQL JSONB，TTL 7天，CLI+Web 复用 |
| 交互方式 | 纯键盘：↑↓选择 / Enter详情 / q退出 |
| 评分策略 | 混合评分：规则(60%) + LLM(40%) |

---

## 混合评分分工

| 维度 | 权重 | 计算方式 | 实现者 |
|------|------|----------|--------|
| 地点匹配 | 10% | 规则: 字符串匹配 | 你 |
| 技术匹配 | 30% | 规则: 标签命中 + GitHub语言占比 | 你 |
| 职业稳定性 | 10% | 规则: 现职年限计算 | 你 |
| 项目深度 | 25% | LLM: 项目质量评估 | 你 |
| 学术影响力 | 15% | LLM: 论文价值判断 | 你 |
| 社区声望 | 10% | 规则+LLM: 数据提取 + 价值判断 | 你 |

---

## 实现任务清单

### Wave 1: 核心交互层

**T1: 对话交互模块**
- 文件: `apps/worker/src/cli/chat.ts`
- 功能: LLM 条件提取 + 缺失检测 + 追问补全
- 依赖: `packages/llm`

```typescript
// 关键接口
interface SearchConditions {
  skills: string[];
  locations: string[];
  experience?: string;
  role?: string;
  limit: number;
}

async function extractConditions(input: string): Partial<SearchConditions>
async function detectMissing(conditions: Partial<SearchConditions>): MissingField[]
async function askFollowUp(field: MissingField): Promise<string>
async function confirmConditions(conditions: SearchConditions): boolean
```

**T2: 键盘交互模块**
- 文件: `apps/worker/src/cli/tui.ts`
- 功能: 候选人列表选择 + 单键响应
- 依赖: `enquirer`

```typescript
// 关键接口
interface CandidateList {
  candidates: ScoredCandidate[];
  selectedIndex: number;
}

async function selectCandidate(list: CandidateList): ScoredCandidate | null
function handleKeyPress(key: string, list: CandidateList): Action
```

---

### Wave 2: 评分与缓存层

**T3: 混合评分引擎**
- 文件: `apps/worker/src/cli/scorer.ts`
- 功能: 规则评分 + LLM评分 + 综合聚合

```typescript
// 关键接口
interface DimensionScores {
  techMatch: number;      // 规则
  locationMatch: number;  // 规则
  careerStability: number; // 规则
  projectDepth: number;   // LLM
  academicImpact: number; // LLM
  communityReputation: number; // 规则+LLM
}

async function scoreByRules(candidate: Person, conditions: SearchConditions): Partial<DimensionScores>
async function scoreByLLM(candidate: Person): Partial<DimensionScores>
function aggregateScores(rule: Partial<DimensionScores>, llm: Partial<DimensionScores>): number
```

**T4: 画像缓存层**
- 文件: `packages/db/src/profile-cache.ts`
- 功能: PostgreSQL JSONB 存储 + TTL 管理

```sql
-- 表结构
CREATE TABLE profile_cache (
  person_id UUID PRIMARY KEY REFERENCES persons(id),
  profile JSONB NOT NULL,
  overall_score FLOAT,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX idx_profile_cache_expires ON profile_cache(expires_at);
```

```typescript
// 关键接口
async function getCachedProfile(personId: string): ProfileCache | null
async function setCachedProfile(personId: string, profile: MultiDimensionProfile): void
async function invalidateCache(personId: string): void
```

---

### Wave 3: 画像与渲染层

**T5: 画像生成模块**
- 文件: `apps/worker/src/cli/profile-generator.ts`
- 功能: 6维画像 JSON 生成 + 高亮点提取

```typescript
// 关键接口
interface MultiDimensionProfile {
  dimensions: DimensionScores;
  overallScore: number;
  highlights: string[];
  summary: string;
}

async function generateProfile(candidate: Person, conditions: SearchConditions): MultiDimensionProfile
```

**T6: 终端卡片渲染**
- 文件: `apps/worker/src/cli/renderer.ts`
- 功能: boxen 卡片布局 + chalk 颜色编码 + 进度条

```typescript
// 关键接口
function renderCard(profile: MultiDimensionProfile, candidate: Person): string
function renderProgressBar(score: number, max: number): string
function renderList(candidates: ScoredCandidate[], selectedIndex: number): string
```

---

## 输出规范要求

### 代码提交规范

每次提交必须包含：
1. **Commit Message 格式:**
   ```
   <type>(cli): <description>

   <body explaining what changed and why>

   Co-Authored-By: Antigravity <noreply@antigravity.ai>
   ```

2. **类型前缀:**
   - `feat(cli):` 新功能
   - `fix(cli):` Bug修复
   - `refactor(cli):` 重构
   - `test(cli):` 测试文件

### 文件结构规范

```
apps/worker/src/cli/
├── index.ts          # CLI 入口，整合各模块
├── chat.ts           # T1: 对话交互
├── tui.ts            # T2: 键盘交互
├── scorer.ts         # T3: 混合评分
├── profile-generator.ts  # T5: 画像生成
├── renderer.ts       # T6: 终端渲染
└── types.ts          # 共享类型定义

packages/db/src/
└── profile-cache.ts  # T4: 画像缓存
```

### TypeScript 类型规范

所有公共接口必须在 `types.ts` 中定义：
```typescript
// types.ts
export interface SearchConditions { ... }
export interface DimensionScores { ... }
export interface MultiDimensionProfile { ... }
export interface ScoredCandidate { ... }
export type MissingField = 'location' | 'experience' | 'skills';
```

### 测试规范

每个模块需配套测试文件：
```
apps/worker/src/cli/__tests__/
├── chat.test.ts
├── scorer.test.ts
├── profile-generator.test.ts
└── renderer.test.ts
```

---

## 进度报告格式

每完成一个 Wave，输出报告：

```markdown
## Wave X 完成报告

### 已完成文件
- [文件路径] - [功能描述]

### 关键实现
- [列出关键技术决策和实现细节]

### 测试状态
- [测试文件路径] - [测试覆盖率]

### 待审核项
- [列出需要 Claude Code 审核的具体文件]

### 下一步
- [下一个 Wave 的任务]
```

---

## 最终验收标准

Claude Code 将按以下标准验收：

1. ✅ 用户输入自然语言，LLM 正确提取条件
2. ✅ 追问最多 2 次，Enter 可跳过
3. ✅ 候选人列表支持 ↑↓ 键盘选择
4. ✅ 每个候选人展示 6 维画像卡片
5. ✅ 画像缓存生效，重复查询秒级响应
6. ✅ 综合评分计算准确（规则60% + LLM40%）
7. ✅ TypeScript 无编译错误
8. ✅ 测试覆盖率 > 80%

---

## 依赖新增

```json
{
  "dependencies": {
    "enquirer": "^2.4.1",
    "boxen": "^7.1.1",
    "chalk": "^5.3.0",
    "ansi-escapes": "^6.2.0"
  }
}
```

请添加到 `apps/worker/package.json`

---

## 参考文件

- `.planning/phases/05-cli-experience/05-PLAN.md` - 详细设计
- `apps/worker/src/cli.ts` - 当前 CLI 入口（需重构）
- `apps/worker/src/search-cli.ts` - 当前搜索逻辑
- `packages/llm/src/` - LLM 接口
- `packages/adapters/src/bonjour/` - Bonjour 数据源

---

## 开始指令

收到此提示词后，请回复：

```
## Antigravity 开发确认

**任务:** Phase 5 CLI Interactive Search
**状态:** 开始执行

**执行顺序:** Wave 1 → Wave 2 → Wave 3
**预计产出:** 6 个核心文件 + 4 个测试文件

正在开始 Wave 1: 核心交互层...
```

然后按 Wave 顺序逐个实现，每完成一个 Wave 输出进度报告等待审核。

---

*生成: 2026-03-29*
*审核方: Claude Code (Opus 4.6)*