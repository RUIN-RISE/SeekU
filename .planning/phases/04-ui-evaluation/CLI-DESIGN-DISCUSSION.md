# Seeku CLI 交互式人才搜索设计方案

**日期:** 2026-03-29
**状态:** 待讨论
**发起方:** Claude Code

---

## 问题背景

当前 CLI 实现过于简单：
```bash
pnpm exec tsx cli.ts search --query "Python AI engineer"
# 输出: "50bffc21-...: Nexmoe (0.46)"
```

这只是单次搜索，缺少：
- 对话交互理解用户意图
- 结构化条件提取
- 候选人多维画像展示

---

## 用户期望的核心流程

```
┌─────────────────────────────────────────────────────────────┐
│  用户对话                                                    │
│  "我想找一个在北京做 RAG 的工程师，                            │
│   最好有开源项目经验"                                         │
├─────────────────────────────────────────────────────────────┤
│  条件提取                                                    │
│  → { skills: ["RAG"], location: "北京",                      │
│      experience: "开源项目", limit: 5 }                       │
├─────────────────────────────────────────────────────────────┤
│  Bonjour 搜索                                                │
│  → 从 Bonjour.bio 匹配候选人                                  │
├─────────────────────────────────────────────────────────────┤
│  多维画像生成                                                │
│  → 技术能力 | 项目经验 | 学术产出 | 社交影响力                 │
├─────────────────────────────────────────────────────────────┤
│  结果交付                                                    │
│  → 终端卡片式展示，支持交互浏览                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 设计方案对比

### 方案 A: 单轮问答 + LLM 提取

```typescript
// 优点: 简单直接，用户输入即搜索
// 缺点: 用户可能描述不完整，需要多次尝试

async function search() {
  console.log("请描述你想找的人才:");
  const input = await readInput();

  // LLM 提取结构化条件
  const conditions = await llm.extractConditions(input);
  // { skills: ["RAG"], location: "北京", ... }

  const candidates = await searchBonjour(conditions);

  for (const c of candidates) {
    const profile = await generateProfile(c);
    display(profile);
  }
}
```

### 方案 B: 多轮引导式对话

```typescript
// 优点: 逐步引导，确保条件完整
// 缺点: 交互复杂，可能用户不耐烦

async function search() {
  console.log("你想找什么类型的人才?");
  const role = await readInput();  // "AI工程师"

  console.log("需要哪些技术技能?");
  const skills = await readInput(); // "Python, RAG"

  console.log("地点要求?");
  const location = await readInput(); // "北京"

  console.log("经验要求?");
  const experience = await readInput(); // "3-5年"

  // 汇总条件，确认后搜索
  const conditions = { role, skills, location, experience };
  console.log("确认搜索条件:", conditions);

  const candidates = await searchBonjour(conditions);
  // ...
}
```

### 方案 C: 智能对话 + 条件补全（推荐）

```typescript
// 优点: 兼顾流畅性和准确性
// 缺点: 实现复杂度高

async function search() {
  console.log("👋 我是 Seeku 人才搜索助手，请描述你的需求:");

  const input = await readInput();
  // 用户: "找个做 RAG 的"

  // LLM 提取 + 识别缺失条件
  const partial = await llm.extractConditions(input);
  // { skills: ["RAG"] } - 缺少 location, experience

  // 智能追问缺失条件
  if (!partial.location) {
    console.log("📍 地点有要求吗？（如北京、上海，或不限）");
    partial.location = await readInput();
  }

  if (!partial.experience) {
    console.log("⏱ 经验年限要求？（如3-5年，或不限）");
    partial.experience = await readInput();
  }

  console.log("🔍 搜索条件确认:", partial);

  const candidates = await searchBonjour(partial);

  for (const c of candidates) {
    const profile = await generateMultiDimensionProfile(c);
    displayRichCard(profile);
  }
}
```

---

## 多维画像设计

### 画像维度

| 维度 | 数据来源 | 指标 |
|------|----------|------|
| **技术能力** | GitHub 仓库 | 语言分布、stars、commits |
| **项目经验** | Bonjour + GitHub | 项目数量、类型、角色 |
| **学术产出** | Google Scholar | 论文数、引用数、顶会发表 |
| **社区影响力** | GitHub + Kaggle | followers、竞赛排名、开源贡献 |
| **职业轨迹** | Bonjour | 公司、职位、年限 |

### 展示格式（终端卡片）

```
┌──────────────────────────────────────────────────────────┐
│ 张明远 · AI算法工程师 · 字节跳动 · 6年                     │
│ 📍 北京 · 📧 mingyuan@email.com                           │
├──────────────────────────────────────────────────────────┤
│ 综合评分: 94.2 ████████████████████████░░                 │
├──────────────────────────────────────────────────────────┤
│ 技术能力                                                   │
│   Python ████████ 85  CUDA ██████ 70  Rust ████ 55       │
│                                                          │
│ 项目经验 (12个)                                           │
│   📚 vLLM PagedAttention  ⭐ 1.2k  核心 PR: 3             │
│   📚 LangChain-RAG       ⭐ 800   维护者                   │
│                                                          │
│ 学术产出                                                  │
│   📄 CVPR 2024 一作 (引用 450+)                           │
│                                                          │
│ 社区影响力                                                │
│   🏆 Kaggle LLM竞赛 Solo Gold                             │
│   👥 GitHub followers: 2.3k                              │
├──────────────────────────────────────────────────────────┤
│ [1] 查看详情  [2] 收藏  [3] 下一个  [q] 退出               │
└──────────────────────────────────────────────────────────┘
```

---

## 需要讨论的问题

### 1. 对话模式选择

- **方案 A** 简单但可能需要多次尝试
- **方案 B** 引导完整但交互冗长
- **方案 C** 平衡但实现复杂

**问题:** 你倾向于哪种？用户画像是什么（技术背景、耐心程度）？

### 2. LLM 参与程度

- **轻度参与**: 只做条件提取，画像基于规则生成
- **重度参与**: 对话理解 + 条件提取 + 画像评价 + 推荐理由生成

**问题:** LLM 成本和延迟如何权衡？是否需要缓存策略？

### 3. 条件提取准确性

- 关键词匹配 vs LLM 结构化提取
- 条件冲突处理（如"北京"但候选人都在上海）
- 缺失条件的默认值策略

**问题:** 如何处理模糊描述？"有开源经验"的具体标准？

### 4. 画像评分算法

- 各维度权重如何分配？
- 单维度评分如何计算？
- 综合评分如何聚合？

**问题:** 是否需要用户自定义权重？如何处理数据缺失？

### 5. 展示交互设计

- 单候选人详情 vs 列表浏览
- 分页 vs 流式加载
- 终端美化程度（boxen/chalk/ansi-escapes）

**问题:** 终端兼容性如何考虑？Windows vs macOS？

---

## 现有代码参考

```
apps/worker/src/cli.ts              # 当前 CLI 入口
apps/worker/src/search-cli.ts       # 搜索逻辑
packages/adapters/src/bonjour/      # Bonjour 数据源
packages/llm/src/                   # LM 接口
packages/search/src/                # 搜索引擎
```

---

## 请回复你的分析

1. 对话模式建议
2. LLM 参与程度建议
3. 画像维度和评分建议
4. 展示格式建议
5. 其他关注点

---

*等待其他 Agent 回复*