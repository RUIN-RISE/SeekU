# Phase 4 修复计划

## P0 修复 (阻断性)

### FIX-01: 首页标题文案
- **文件:** `apps/web/src/app/page.tsx`
- **当前:** "发现AI人才" + "通过项目代码找到真正合适的人"
- **目标:** "寻找简历上写不出来的硬实力" + "不要再用来筛选..."

### FIX-02: 打字机搜索效果
- **文件:** `apps/web/src/components/SearchBar.tsx`
- **要求:** 自动循环4个示例查询，光标闪烁效果

## P1 修复 (严重)

### FIX-03: 证据引擎可视化
- **文件:** 新建 `apps/web/src/components/EvidenceEngine.tsx`
- **要求:** 3节点 + SVG连线动画 + 悬停交互

### FIX-04: 筛选器面板
- **文件:** 新建 `apps/web/src/components/FilterPanel.tsx`
- **要求:** 左侧双栏布局，地点/技能/经验筛选

### FIX-05: 分数环形图
- **文件:** `apps/web/src/components/CandidateCard.tsx`
- **要求:** SVG circle 可视化匹配度

### FIX-06: 验证标记
- **文件:** `apps/web/src/components/CandidateCard.tsx`
- **要求:** "✓已验证" 徽章

## P2 修复 (重要)

### FIX-07: CLI 测试
- **文件:** 新建 `apps/worker/src/search-cli.test.ts`

### FIX-08: API 测试
- **文件:** 新建 `apps/api/src/routes/search.test.ts`

### FIX-09: 组件测试
- **文件:** 新建 `apps/web/src/components/*.test.tsx`

---

*状态: 待执行*
*创建: 2026-03-29*