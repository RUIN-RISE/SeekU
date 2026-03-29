# Phase 4 质量核查清单

**目的:** 外置 Agent 完成了 Phase 4，但存在严重质量问题。此清单用于多 Agent 交叉核查。

**核查时间:** 2026-03-29
**核查范围:** Phase 4 UI & Evaluation (8 个计划)

---

## 一、前端实现核查 (最严重)

### 1.1 首页 Hero 区

| 检查项 | UI-SPEC 要求 | 实际代码位置 | 状态 |
|-------|-------------|-------------|------|
| 主标题 | `"寻找简历上写不出来的硬实力"` | `apps/web/src/app/page.tsx` | ❌ 实际是 "发现AI人才" |
| 副标题 | `"不要再用'精通Python'来筛选AI工程师了..."` | 同上 | ❌ 实际是 "通过项目代码找到..." |
| 打字机效果 | 自动循环4个示例查询 | 应在 SearchBar 或 Hero 区 | ❌ 完全缺失 |
| 下拉推荐面板 | 搜索聚焦时显示用例 | SearchBar 组件 | ❌ 完全缺失 |
| 光晕背景 | `radial-gradient` 渐变 | Hero section | ❌ 缺失 |
| 毛玻璃效果 | `.glass-premium` class | 各组件 | ❌ 缺失 |

**核查命令:**
```bash
# 检查实际标题
grep -n "发现AI人才" apps/web/src/app/page.tsx
grep -n "寻找简历" apps/web/src/app/page.tsx

# 检查是否有打字机效果
grep -rn "typewriter\|打字机\|cursor-blink" apps/web/src/

# 对比设计稿
cat .claude-design/ui-previews/seeku-landing.html | grep -A5 "寻找简历"
```

### 1.2 证据引擎可视化 (Hero 区下方)

| 检查项 | UI-SPEC 要求 | 状态 |
|-------|-------------|------|
| 3个数据源节点 | GitHub / 论文 / 竞赛 | ❌ 完全缺失 |
| SVG 连线动画 | 悬停时连线变蓝并流动 | ❌ 完全缺失 |
| 候选人卡片演示 | 分数递增动画 | ❌ 完全缺失 |
| 交互悬停效果 | hover 节点触发解析 | ❌ 完全缺失 |

**核查命令:**
```bash
# 检查是否有证据引擎相关代码
grep -rn "evidence-line\|evidence-node\|证据引擎\|EvidenceEngine" apps/web/src/
```

### 1.3 搜索结果页

| 检查项 | UI-SPEC 要求 | 实际实现 | 状态 |
|-------|-------------|---------|------|
| 顶部搜索栏 | 显示当前查询，可编辑 | 未实现 | ❌ |
| 筛选器面板 | 左侧双栏布局 | 未实现 | ❌ |
| 分数环形图 | SVG circle 可视化 | 未实现 | ❌ |
| 验证标记 | "✓已验证" 徽章 | 未实现 | ❌ |
| Hover 查看证据图谱按钮 | 卡片悬停显示 | 未实现 | ❌ |

**核查命令:**
```bash
# 检查 CandidateCard 组件
cat apps/web/src/components/CandidateCard.tsx | grep -n "score\|验证\|evidence"

# 检查筛选器
find apps/web/src -name "*ilter*" -o -name "*Filter*"
```

---

## 二、测试文件核查

### 2.1 项目测试文件统计

```bash
# 查找项目自身的测试文件 (排除 node_modules)
find . -name "*.test.ts" -o -name "*.spec.ts" | grep -v node_modules
```

**预期结果:** 应该有 CLI 测试、API 测试、组件测试
**实际结果:** 应该是 0 个测试文件

### 2.2 应该存在的测试

| 测试类型 | 应有文件 | 状态 |
|---------|---------|------|
| CLI 搜索测试 | `apps/worker/src/search-cli.test.ts` | ❌ 不存在 |
| API 端点测试 | `apps/api/src/routes/search.test.ts` | ❌ 不存在 |
| 前端组件测试 | `apps/web/src/components/*.test.tsx` | ❌ 不存在 |
| Eval 包测试 | `packages/eval/src/*.test.ts` | ❌ 不存在 |

---

## 三、CLI 功能核查

### 3.1 CLI 文件存在性

```bash
# 检查 CLI 文件
ls -la apps/worker/src/cli.ts
ls -la apps/worker/src/search-cli.ts
```

### 3.2 CLI 测试运行

```bash
# 设置环境变量后测试 CLI
export DATABASE_URL="your_test_db_url"
pnpm --filter @seeku/worker cli search "Python" --json

# 测试 show 命令
pnpm --filter @seeku/worker cli show <personId> --json
```

**核查项:**
- [ ] `search` 命令返回 JSON 结果
- [ ] `search` 命令人类可读输出正常
- [ ] `--limit` 参数生效
- [ ] `show` 命令返回候选人详情

---

## 四、API 端点核查

### 4.1 端点存在性

```bash
# 启动 API 后检查
curl http://localhost:3000/health
curl http://localhost:3000/admin/sync-status
curl -X POST http://localhost:3000/search -H "Content-Type: application/json" -d '{"query":"test"}'
curl http://localhost:3000/profiles/<some-uuid>
```

### 4.2 CORS 验证

```bash
# 测试 CORS 预检请求
curl -X OPTIONS http://localhost:3000/search \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

**预期:** 响应包含 `Access-Control-Allow-Origin: http://localhost:3001`

---

## 五、Eval 包核查

### 5.1 文件完整性

```bash
# 检查 eval 包结构
ls -la packages/eval/src/
ls -la packages/eval/datasets/

# 验证查询数量
cat packages/eval/datasets/queries.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"
# 应该是 50

# 验证 golden set 数量
cat packages/eval/datasets/golden-set.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"
# 应该 >= 80
```

### 5.2 构建验证

```bash
pnpm --filter @seeku/eval build
pnpm --filter @seeku/eval typecheck
```

---

## 六、前端构建核查

### 6.1 构建命令

```bash
pnpm --filter @seeku/web build
```

### 6.2 预期路由

| 路由 | 文件 | 状态 |
|-----|------|------|
| `/` | `apps/web/src/app/page.tsx` | 存在但实现不完整 |
| `/admin` | `apps/web/src/app/admin/page.tsx` | 存在 |

---

## 七、SUMMARY 报告真实性核查

### 7.1 需要核查的 SUMMARY

| 文件 | 关键声明 | 核查结果 |
|-----|---------|---------|
| `04-07-SUMMARY.md` | "端到端数据联调测试通过" | ❓ 是否真的跑过? |
| `04-06b-SUMMARY.md` | "CSS animations (fadeIn, scaleIn) work for modal" | ❓ 实际检查 globals.css |

### 7.2 核查命令

```bash
# 检查 CSS 动画是否存在
grep -n "fadeIn\|scaleIn" apps/web/src/styles/globals.css

# 检查 QueryClientProvider
grep -rn "QueryClientProvider" apps/web/src/
```

---

## 八、设计稿对比

### 8.1 设计稿位置

```
.claude-design/ui-previews/seeku-landing.html     # 首页设计
.claude-design/ui-previews/seeku-search-results.html  # 搜索结果页设计
.planning/phases/04-ui-evaluation/04-UI-SPEC.md   # 设计契约
```

### 8.2 关键差异清单

| 设计要素 | 设计稿 | 实际代码 | 差异程度 |
|---------|-------|---------|---------|
| Hero 标题 | 渐变大字 + 装饰线 | 简单文字 | 严重 |
| 搜索框 | 带图标 + 打字机 + 下拉 | 简单输入框 | 严重 |
| 证据引擎 | 3节点 + 动画 | 完全缺失 | 严重 |
| 首页副标题 | 两行文案 | 单行 | 中等 |
| 光晕效果 | 渐变背景 | 无 | 中等 |

---

## 九、核查结论模板

每个 Agent 完成核查后填写:

```
## Agent [Name] 核查结论

### 核查时间: [时间]

### 确认的问题:
1. [问题]
2. [问题]

### 未确认/需要澄清:
1. [说明]

### 建议修复优先级:
P0 (阻断性):
- [ ]

P1 (严重):
- [ ]

P2 (重要):
- [ ]

### 签名: [Agent Name]
```

---

## 十、快速核查脚本

一键运行所有检查:

```bash
#!/bin/bash
echo "=== Phase 4 质量核查 ==="

echo -e "\n[1] 测试文件数量:"
find . -name "*.test.ts" -o -name "*.spec.ts" | grep -v node_modules | wc -l

echo -e "\n[2] 首页标题:"
grep "发现AI人才\|寻找简历" apps/web/src/app/page.tsx | head -2

echo -e "\n[3] 打字机效果:"
grep -rn "typewriter\|cursor-blink" apps/web/src/ | wc -l

echo -e "\n[4] 证据引擎:"
grep -rn "evidence-line\|evidence-node" apps/web/src/ | wc -l

echo -e "\n[5] 查询数量:"
cat packages/eval/datasets/queries.json 2>/dev/null | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "文件不存在"

echo -e "\n[6] CSS 动画:"
grep -c "fadeIn\|scaleIn" apps/web/src/styles/globals.css 2>/dev/null || echo "0"

echo -e "\n[7] CLI 文件:"
ls apps/worker/src/cli.ts apps/worker/src/search-cli.ts 2>/dev/null || echo "缺失"

echo -e "\n=== 核查完成 ==="
```

---

*创建时间: 2026-03-29*
*创建者: Claude Code*
*用途: 多 Agent 交叉核查 Phase 4 质量*