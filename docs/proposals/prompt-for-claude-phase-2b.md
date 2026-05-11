请在 `/Users/rosscai/seeku` 继续推进 Seeku 的 Graph Signals / Memory 工作，但这次**只做 Phase 2b：memory wiring verification + gap fixing**，不要扩范围。

先读这些文档：

- `docs/proposals/graph-rag-phase-1-implementation-report.md`
- `docs/proposals/graph-rag-phase-2-implementation-report.md`
- `docs/proposals/graph-rag-phase-2b-execution-plan.md`

再重点检查这些代码：

- `apps/worker/src/cli/workflow.ts`
- `apps/worker/src/cli/memory-bootstrap.ts`
- `apps/worker/src/cli/preference-capture.ts`
- `apps/worker/src/cli/feedback-capture.ts`
- `apps/worker/src/cli/shortlist-controller.ts`
- `apps/worker/src/cli/index.ts`
- `apps/worker/src/cli/memory-command.ts`
- `apps/worker/src/cli/user-memory-store.ts`
- `apps/worker/src/cli/__tests__/`

非常重要：**不要假设 Phase 2b 还没做。先验证现状。**

我已经看到代码里很可能已经有这些接线痕迹：

1. `SearchWorkflow.execute()` 里已经调用 `runMemoryBootstrap()`
2. `runClarifyLoop()` 里已经把 seeded memory conditions 合并进默认条件
3. 搜索前已经可能调用 `maybeCapturePreference()`
4. shortlist remove 时已经可能记录 negative feedback
5. repeated negative feedback 后已经可能触发 inferred preference
6. launcher / shortlist / comparison 里已经可能有 memory overlay 入口

所以你的任务不是“从零实现 memory”，而是：

1. **先核实**
   - 哪些路径已经完整接好
   - 哪些只是半成品
   - 哪些只是文档没更新
   - 哪些测试缺失

2. **只修真实缺口**
   - 如果 wiring 已经完整，就不要重写
   - 如果只是测试缺失，就补测试
   - 如果只是文档落后，就补文档
   - 如果真有断点，再做最小修复

3. **产出最终报告**
   - 新建 `docs/proposals/graph-rag-phase-2b-implementation-report.md`
   - 报告必须明确区分：
     - 原本已经存在的能力
     - 这次新补的改动
     - 当前已验证完成的行为
     - 仍然刻意不做的范围

约束非常严格：

- 不要引入 `memU`
- 不要做 GraphTranslator
- 不要做 GraphSAGE / Node2Vec / 图嵌入训练
- 不要做 graph-aware reranking
- 不要改搜索排序逻辑
- 不要做大规模 UX 重构
- 不要把 inferred preferences 静默注入默认条件
- 不要让 memory 覆盖用户当前输入

你必须保持这些产品语义不变：

1. **explicit > inferred**
2. bootstrap 时只能默认注入 explicit preference
3. inferred preference 可以展示，但默认不自动沿用
4. 当前用户输入优先于历史 memory
5. pause/resume 要同时影响 memory 使用和 memory 采集

建议执行顺序：

1. 读文档和代码，先列一份“已实现 vs 未实现”清单
2. 运行相关测试，确认哪些已覆盖、哪些失败、哪些缺失
3. 只修真实问题
4. 补测试
5. 写 `graph-rag-phase-2b-implementation-report.md`

优先关注这些验证点：

1. session start bootstrap 是否真的生效
2. memory paused 时是否真的完全跳过
3. explicit preference 是否只从用户原话提取，而不是从累积 conditions 反推
4. shortlist negative feedback 是否真的落库
5. inference threshold 是否真的按规则工作
6. explicit preference 是否不会被 inferred preference 冲掉
7. 非 interactive 的 one-shot search path 是否本来就不在范围内，如果不在范围，报告里写清楚

完成后请给我一份结构化汇报，至少包含：

1. 改了哪些文件
2. 哪些 memory 能力原本就已经存在
3. 这次补了哪些真实缺口
4. 跑了哪些测试，结果如何
5. Phase 2b 现在是否可判定为完成
6. 还有哪些明确的非 blocker caveat

一句话原则：**验证优先，最小修复，严禁扩 scope。**
