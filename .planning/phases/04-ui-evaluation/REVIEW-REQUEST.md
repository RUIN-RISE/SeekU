# Phase 4 UI 修复审查请求

**提交:** `e3160d3` - fix(web): React lifecycle issues
**日期:** 2026-03-29
**状态:** 待审查

---

## 修复内容摘要

### 第一轮修复 (efa22f6)
| 项目 | 文件 | 内容 |
|------|------|------|
| 首页标题 | `apps/web/src/app/page.tsx` | "寻找简历上写不出来的硬实力" |
| 打字机效果 | `apps/web/src/app/page.tsx` | 4个示例查询循环 |
| 证据引擎 | `apps/web/src/components/EvidenceEngine.tsx` | 3节点+SVG连线+悬停交互 |
| 分数环形图 | `apps/web/src/components/CandidateCard.tsx` | SVG circle 可视化 |
| 验证标记 | `apps/web/src/components/CandidateCard.tsx` | BadgeCheck + "已验证" |
| 筛选器 | `apps/web/src/components/FilterPanel.tsx` | 地点/技能/经验三栏 |

### 第二轮修复 (e3160d3)
| 问题 | 严重性 | 修复方案 |
|------|--------|----------|
| 打字机内存泄漏 | 🔴 Blocking | `setInterval` + 清理函数 |
| 分数叠加漏洞 | 🔴 Blocking | `visitedNodesRef` Set 跟踪 |
| UI状态截断 | 🟡 Important | 空结果时恢复证据引擎 |

---

## 测试要点

### 1. 打字机效果内存泄漏测试
**文件:** `apps/web/src/app/page.tsx:30-55`
**测试方法:**
```
1. 启动开发服务器: pnpm --filter @seeku/web dev
2. 打开首页，观察打字机效果运行
3. 切换到其他页面/路由
4. 返回首页
5. 检查控制台是否有 "Can't perform a React state update on an unmounted component" 错误
```
**预期结果:** 无内存泄漏警告，打字机效果正常重启

### 2. 证据引擎分数叠加测试
**文件:** `apps/web/src/components/EvidenceEngine.tsx:44-55`
**测试方法:**
```
1. 打开首页，滚动到证据引擎区域
2. 反复快速悬停 "代码贡献度" 节点 5 次
3. 观察右侧分数是否保持在 45（而非 225）
4. 依次悬停三个节点，分数应逐步累加到 98
```
**预期结果:** 每个节点只贡献一次分数，最大98分

### 3. 搜索状态恢复测试
**文件:** `apps/web/src/app/page.tsx:57-63`
**测试方法:**
```
1. 在首页输入搜索词触发搜索
2. 等待结果列表显示（证据引擎隐藏）
3. 清空搜索输入框
4. 观察证据引擎是否重新显示
```
**预期结果:** 清空搜索后证据引擎恢复显示

### 4. 构建验证
```bash
pnpm --filter @seeku/web build
```
**预期结果:** 编译成功，无 TypeScript 错误

---

## 设计契约对比

**参考文件:**
- `.planning/phases/04-ui-evaluation/04-UI-SPEC.md` - 设计契约
- `.claude-design/ui-previews/seeku-landing.html` - 首页设计稿

**检查项:**
| 项目 | UI-SPEC 要求 | 实现状态 |
|------|-------------|----------|
| 主标题 | "寻找简历上写不出来的硬实力" | ✅ |
| 副标题 | "不要再用来筛选..." | ✅ |
| 打字机查询 | 4个示例循环 | ✅ |
| 证据节点 | 3个 + 悬停交互 | ✅ |
| 分数环形图 | SVG circle + 颜色分级 | ✅ |
| 验证徽章 | BadgeCheck + 文字 | ✅ |

---

## 请求审查内容

请按以下维度进行审查：

1. **React 生命周期:** 确认 useEffect 清理函数完整
2. **状态管理:** 确认 visitedNodesRef 正确跟踪
3. **UI 流程:** 确认搜索→清空→证据引擎恢复流程
4. **TypeScript:** 确认类型定义正确
5. **设计还原:** 对比 UI-SPEC 检查视觉一致性

---

## 关键文件路径

```
apps/web/src/app/page.tsx              # 首页 + 打字机
apps/web/src/components/EvidenceEngine.tsx  # 证据引擎
apps/web/src/components/CandidateCard.tsx   # 候选人卡片
apps/web/src/components/FilterPanel.tsx     # 筛选器
apps/web/src/components/SearchBar.tsx       # 搜索框
.planning/phases/04-ui-evaluation/04-UI-SPEC.md  # 设计契约
```

---

## 审查报告格式

请按以下格式输出审查结果：

```
## 审查结果

### 通过项 ✅
- [列出通过的项目]

### 问题项 ❌
- [列出发现的问题，附文件路径和行号]

### 建议 💡
- [可选的改进建议]

### 结论
[BLOCK / PASS / FLAG]
```

---

*生成: 2026-03-29*
*请求方: Claude Code*