# Phase 5 CLI 交互测试实验设计

**执行者:** Antigravity
**测试次数:** 30 次
**目标:** 验证 CLI 功能完整性、稳定性和用户体验

---

## 实验概述

本次实验采用**黑盒测试 + 白盒验证**相结合的方式，覆盖 CLI 的核心功能路径、边界条件和异常场景。测试结果将用于指导下一轮迭代优化。

---

## 测试环境准备

```bash
cd /Users/rosscai/seeku

# 1. 确保数据就绪
export $(grep -v '^#' .env | xargs)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM persons WHERE search_status = 'active'"
# 预期: >= 30 条

# 2. 确保搜索索引就绪
pnpm exec tsx apps/worker/src/cli.ts rebuild-search

# 3. 清空缓存（确保测试一致性）
psql $DATABASE_URL -c "TRUNCATE profile_cache"
```

---

## 测试用例设计 (30 个)

### Group A: 正常流程测试 (10 个)

| ID | 测试场景 | 输入序列 | 预期结果 |
|----|----------|----------|----------|
| A1 | 简单技能搜索 | `Python` → 跳过地点 → 跳过经验 | 显示候选人列表 |
| A2 | 技能+地点搜索 | `AI` → `北京` → 跳过 | 显示北京地区 AI 候选人 |
| A3 | 完整条件搜索 | `RAG` → `上海` → `3-5年` | 显示符合条件的候选人 |
| A4 | 中文技能词 | `深度学习` → 跳过 → 跳过 | 正确解析并搜索 |
| A5 | 英文技能词 | `PyTorch` → 跳过 → 跳过 | 正确解析并搜索 |
| A6 | 多技能组合 | `Python Rust CUDA` → 跳过 → 跳过 | 包含所有技能的候选人 |
| A7 | 远程地点 | `远程` → `远程` → 跳过 | 支持远程关键词 |
| A8 | 高级职位 | `AI` → `北京` → `senior` | 解析职级关键词 |
| A9 | 特定框架 | `LangChain` → 跳过 → 跳过 | 识别具体框架 |
| A10 | 领域搜索 | `推荐系统` → 跳过 → 跳过 | 识别业务领域 |

### Group B: 边界条件测试 (8 个)

| ID | 测试场景 | 输入序列 | 预期结果 |
|----|----------|----------|----------|
| B1 | 空输入提交 | 直接 Enter | 提示重新输入或合理默认 |
| B2 | 超长输入 | 200+ 字符描述 | 正确截断或处理 |
| B3 | 特殊字符 | `C++` → 跳过 → 跳过 | 正确处理特殊字符 |
| B4 | 纯空格 | 多个空格 → 跳过 | 视为无效输入 |
| B5 | 重复技能 | `Python Python Python` → 跳过 | 去重处理 |
| B6 | 中英混合 | `Python开发` → 跳过 → 跳过 | 正确分词 |
| B7 | 不存在的技能 | `Xyz123Nonexistent` → 跳过 → 跳过 | 空结果提示 |
| B8 | 所有追问都跳过 | 输入技能 → 跳过 → 跳过 | 显示全部或最大结果 |

### Group C: 交互体验测试 (6 个)

| ID | 测试场景 | 操作 | 预期结果 |
|----|----------|------|----------|
| C1 | 候选人列表滚动 | ↑↓ 键选择不同候选人 | 高亮切换正常 |
| C2 | 查看候选人详情 | Enter 选中候选人 | 显示 6 维画像卡片 |
| C3 | 返回列表 | 查看详情后按 Enter | 返回候选人列表 |
| C4 | 退出程序 | 按 q | 优雅退出 |
| C5 | 连续查看多人 | 查看 A → 返回 → 查看 B | 数据不混淆 |
| C6 | 缓存命中验证 | 查看同一人两次 | 第二次显示 "Cache hit!" |

### Group D: 异常与鲁棒性测试 (6 个)

| ID | 测试场景 | 模拟方式 | 预期结果 |
|----|----------|----------|----------|
| D1 | 网络超时降级 | LLM 超时场景 | 显示降级分数，不崩溃 |
| D2 | JSON 解析失败 | 模拟 LLM 返回非法 JSON | Zod 降级生效 |
| D3 | 数据库连接失败 | 暂时断开数据库 | 友好错误提示 |
| D4 | 大结果集处理 | 搜索返回 50+ 结果 | 分页或限制显示 |
| D5 | 无候选人时操作 | 空结果后按键 | 无异常崩溃 |
| D6 | 连续快速操作 | 快速按键/输入 | 无竞态条件 |

---

## 测试执行方法

### 自动化测试脚本

由于 CLI 需要交互输入，建议使用 `expect` 或 `stdin` 管道进行半自动化测试：

```bash
# 示例: 使用 echo 管道模拟输入
echo -e "Python\n\n\n" | pnpm exec tsx apps/worker/src/cli.ts search --interactive

# 示例: 使用 expect 脚本 (更精确的控制)
# 详见 test-expect.exp
```

### 手动测试记录表

对于无法自动化的交互测试，请手动执行并记录：

```
## 测试记录

### 测试 A1
- **时间:** YYYY-MM-DD HH:MM
- **输入:** Python → [Enter] → [Enter]
- **实际结果:** [描述]
- **是否通过:** [PASS/FAIL]
- **截图/日志:** [如有]

### 测试 A2
...
```

---

## 测试结果记录格式

请按以下 JSON 格式记录每次测试结果：

```json
{
  "testRun": "2026-03-29T15:00:00Z",
  "tester": "Antigravity",
  "totalTests": 30,
  "results": [
    {
      "id": "A1",
      "group": "A",
      "scenario": "简单技能搜索",
      "input": ["Python", "", ""],
      "expected": "显示候选人列表",
      "actual": "显示了 15 个候选人",
      "passed": true,
      "severity": null,
      "notes": "响应时间 2.3s"
    },
    {
      "id": "B7",
      "group": "B",
      "scenario": "不存在的技能",
      "input": ["Xyz123Nonexistent", "", ""],
      "expected": "空结果提示",
      "actual": "显示 'No candidates found'",
      "passed": true,
      "severity": null,
      "notes": ""
    },
    {
      "id": "C2",
      "group": "C",
      "scenario": "查看候选人详情",
      "input": ["AI", "北京", "", "↓", "Enter"],
      "expected": "显示 6 维画像卡片",
      "actual": "卡片显示正常，但进度条颜色错误",
      "passed": false,
      "severity": "MINOR",
      "notes": "技术匹配度 80% 显示红色，应为蓝色"
    }
  ],
  "summary": {
    "passed": 28,
    "failed": 2,
    "blocked": 0,
    "passRate": "93.3%"
  },
  "issues": [
    {
      "id": "ISSUE-001",
      "testId": "C2",
      "title": "进度条颜色逻辑错误",
      "severity": "MINOR",
      "description": "技术匹配度 80% 显示红色，根据设计应为蓝色",
      "file": "renderer.ts",
      "line": 59
    }
  ],
  "recommendations": [
    "修复进度条颜色判断逻辑",
    "考虑添加搜索耗时显示"
  ]
}
```

---

## 问题严重等级定义

| 等级 | 标签 | 说明 | 处理优先级 |
|------|------|------|------------|
| 阻断 | BLOCK | 程序崩溃、数据丢失、核心功能不可用 | P0 立即修复 |
| 严重 | CRITICAL | 主要功能异常、错误结果 | P1 本轮修复 |
| 中等 | MAJOR | 功能可用但有明显缺陷 | P2 下轮修复 |
| 轻微 | MINOR | 体验问题、UI 瑕疵 | P3 可选修复 |

---

## 测试完成后的行动项

1. **汇总结果:** 统计通过率，列出所有失败用例
2. **问题分类:** 按严重等级和模块分类
3. **根因分析:** 对每个问题进行原因定位
4. **修复计划:** 制定优先级排序的修复清单
5. **回归测试:** 修复后重新执行相关测试用例

---

## 输出要求

测试完成后，请输出以下文件：

1. **测试报告:** `.planning/phases/05-cli-experience/TEST-REPORT.md`
2. **问题清单:** `.planning/phases/05-cli-experience/TEST-ISSUES.md`
3. **原始数据:** `.planning/phases/05-cli-experience/TEST-RESULTS.json`

---

## 开始测试指令

```
请按照上述测试计划执行 30 次测试：

1. 首先运行环境准备命令确保测试数据就绪
2. 按 Group A → B → C → D 顺序执行测试
3. 记录每次测试的实际结果
4. 汇总问题并生成测试报告

对于交互式测试，请手动执行并记录结果。
对于可通过管道自动化的测试，可使用脚本批量执行。

完成后输出三个文件：
- TEST-REPORT.md (测试报告摘要)
- TEST-ISSUES.md (问题清单详情)
- TEST-RESULTS.json (原始测试数据)
```

---

*设计: Claude Opus 4.6*
*创建: 2026-03-29*