---
phase: 05-cli-experience
created: 2026-03-29
status: planning
depends_on: 04-ui-evaluation
---

# Phase 5: CLI Interactive Search Experience

**目标:** 构建智能对话式人才搜索 CLI，实现"对话→条件→搜索→画像→交付"完整流程

---

## 核心设计决策

### 对话模式
- **方案 C**: 智能对话 + 条件补全
- LLM 提取结构化条件，智能追问缺失项
- 最多追问 2 次，Enter 跳过直接搜索

### 交互方式
- **纯键盘**: ↑↓ 选择候选人 / Enter 详情 / q 退出
- 使用 `enquirer` 或原生 `keypress` 实现

### 画像缓存
- PostgreSQL JSONB 存储多维画像
- 按 `personId` 哈希缓存，CLI + Web 复用

### 混合评分策略
| 维度 | 权重 | 计算方式 |
|------|------|----------|
| 地点匹配 | 10% | 规则: 字符串匹配 |
| 技术匹配 | 30% | 规则: 标签命中 + GitHub语言占比 |
| 职业稳定性 | 10% | 规则: 现职年限计算 |
| 项目深度 | 25% | LLM: 项目质量评估 |
| 学术影响力 | 15% | LLM: 论文价值判断 |
| 社区声望 | 10% | 规则+LLM: 数据 + 价值判断 |

---

## 实现任务

### T1: 对话交互模块
**文件:** `apps/worker/src/cli/chat.ts`

```
用户输入 → LLM 条件提取 → 缺失检测 → 追问补全 → 条件确认
```

**关键函数:**
- `extractConditions(input: string): PartialConditions`
- `detectMissing(conditions): MissingField[]`
- `askFollowUp(field: MissingField): string`
- `confirmConditions(conditions): Conditions`

### T2: 键盘交互模块
**文件:** `apps/worker/src/cli/tui.ts`

**依赖:** `enquirer` 或原生 `keypress`

**功能:**
- 候选人列表滚动选择
- 单键响应（↑↓ Enter q）
- 卡片式渲染

### T3: 混合评分引擎
**文件:** `apps/worker/src/cli/scorer.ts`

```
规则评分 (地点、技术、稳定性) + LLM评分 (项目、学术) → 综合分数
```

**关键函数:**
- `scoreByRules(candidate, conditions): RuleScores`
- `scoreByLLM(candidate, conditions): LLMScores`
- `aggregateScores(rule, llm): FinalScore`

### T4: 画像缓存层
**文件:** `packages/db/src/profile-cache.ts`

**表结构:**
```sql
CREATE TABLE profile_cache (
  person_id UUID PRIMARY KEY,
  profile JSONB NOT NULL,
  score FLOAT,
  cached_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);
```

**缓存策略:**
- TTL: 7 天
- 缓存命中直接返回
- 缓存失效重新生成

### T5: 画像生成模块
**文件:** `apps/worker/src/cli/profile-generator.ts`

**输入:** BonjourProfile + GitHubData + ScholarData

**输出:** 6维画像 JSON

```json
{
  "dimensions": {
    "techMatch": { "score": 85, "details": "..." },
    "projectDepth": { "score": 90, "details": "..." },
    "academicImpact": { "score": 75, "details": "..." },
    "communityReputation": { "score": 80, "details": "..." },
    "careerStability": { "score": 70, "details": "..." },
    "locationMatch": { "score": 100, "details": "北京" }
  },
  "overallScore": 94.2,
  "highlights": ["CVPR 2024 一作", "vLLM 核心 PR"],
  "summary": "..."
}
```

### T6: 终端卡片渲染
**文件:** `apps/worker/src/cli/renderer.ts`

**依赖:** `boxen`, `chalk`, `ansi-escapes`

**功能:**
- 卡片式布局
- 颜色编码（分数高亮）
- 进度条可视化

---

## 用户流程

```
$ seeku search

👋 我是 Seeku 人才搜索助手，请描述你的需求:

> 找个做 RAG 的工程师

📍 地点有要求吗？（如北京、上海，或不限）
> 北京

⏱ 经验年限要求？（如3-5年，或不限）
> [Enter 跳过]

🔍 搜索条件确认:
   技能: RAG, LLM
   地点: 北京
   经验: 不限

正在搜索... 找到 3 位候选人

┌──────────────────────────────────────────────────────────┐
│ #1 张明远 · 94.2分 · ⚡高匹配                              │
│ 字节跳动 · AI算法工程师 · 6年 · 📍北京                     │
│ ...                                                      │
├──────────────────────────────────────────────────────────┤
│ ↑↓选择  Enter详情  q退出                                  │
└──────────────────────────────────────────────────────────┘
```

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

---

## 验收标准

1. 用户输入自然语言，LLM 正确提取条件
2. 追问最多 2 次，Enter 可跳过
3. 候选人列表支持 ↑↓ 键盘选择
4. 每个候选人展示 6 维画像卡片
5. 画像缓存生效，重复查询秒级响应
6. 综合评分计算准确

---

## 技术风险

| 风险 | 缓解措施 |
|------|----------|
| LLM 响应慢 | 条件提取超时 3s，画像异步生成 |
| 终端兼容性 | 使用 ANSI 标准码，Windows 测试 |
| 缓存失效 | TTL 7天，手动刷新命令 |

---

*状态: 规划完成，待实现*
*创建: 2026-03-29*