# Seeku Graph RAG 方案评审报告

**评审日期**：2026-05-03
**评审人**：Staff+ AI/搜索系统架构师
**评审对象**：`docs/proposals/graph-rag-integration.md`

---

## Executive Recommendation

**先做数据审计和 eval baseline，再决定是否训练图模型。GraphTranslator 过度设计，第一版解释性不需要 LLM。增强现有 memory 系统比引入 memU 更务实。**

---

## Critical Findings

### Finding 1: 方案中的数据规模与实际不符

**问题**：方案声称 22,497 人有 Bonjour 覆盖，但实际数据库状态不同。

**实际数据**（`psql` 查询结果）：
- `source_profiles` 总数：26,061
- Bonjour profiles：23,281
- `persons` 总数：25,191
- `search_embeddings`：8,074（仅 32% 有向量）

**影响**：方案低估了数据覆盖率问题。只有 32% 的 persons 有 embedding，这意味着图模型训练时 68% 的节点没有特征。

**建议动作**：先补齐 embedding 覆盖率到 80%+，再考虑图模型。

---

### Finding 2: 社交图数据未导入，方案假设错误

**问题**：方案假设已有 ~50,000+ social edges，但实际检查发现：

```sql
-- 实际查询结果
SELECT COUNT(*) FROM source_profiles
WHERE raw_payload::text LIKE '%authFriendLinkPreview%';
-- 结果：2,430（仅 10% 的 Bonjour profiles 有 friend link 数据）
```

**影响**：
1. 社交图数据并未系统化导入
2. `import-bonjour-friend-links.ts` 存在但未执行或执行不完整
3. 方案的 Phase 1（图数据导入）工作量被严重低估

**建议动作**：先完成 friend links 的完整导入和 ETL，统计真实的边数量和覆盖率。

---

### Finding 3: Memory 系统已存在，memU 是重复建设

**问题**：方案建议引入 memU，但仓库已有 memory 相关迁移：

- `packages/db/src/migrations/0005_user_memories.sql`
- `packages/db/src/migrations/0006_candidate_feedback_memories.sql`

**已有设计**：
```sql
-- user_memories 表设计
CREATE TABLE user_memories (
  user_id TEXT NOT NULL,
  kind user_memory_kind NOT NULL,  -- preference, feedback, hiring_context
  scope_kind user_memory_scope_kind NOT NULL,  -- global, role, location, work_item
  content JSONB NOT NULL,
  source user_memory_source NOT NULL,  -- explicit, inferred
  confidence numeric(3,2) DEFAULT 1.0,
  ...
);

-- candidate_feedback_memories 表设计
CREATE TABLE candidate_feedback_memories (
  user_id TEXT NOT NULL,
  person_id UUID NOT NULL,
  sentiment feedback_sentiment NOT NULL,  -- positive, negative, neutral
  reason_code TEXT,
  reason_detail TEXT,
  ...
);
```

**影响**：
1. Memory 表结构已设计，只是未执行迁移
2. 引入 memU 会与现有设计冲突
3. memU 的"记忆即文件系统"理念与 Seeku 的 SQL-based 设计不兼容

**建议动作**：执行现有迁移，增强现有 memory 系统，不引入 memU。

---

### Finding 4: GraphTranslator 论文引用错误

**问题**：方案引用 `https://arxiv.org/abs/2401.05556`，但该编号不是 GraphTranslator 论文。

**实际论文**：
- GraphTranslator 正确论文编号：`arXiv:2402.07197`
- 论文标题：*"GraphTranslator: Aligning Graph Model to Large Language Model for Open-ended Tasks"*

**影响**：评审者无法验证技术细节，方案可信度下降。

**建议动作**：更正引用，重新阅读论文确认技术可行性。

---

### Finding 5: 检索系统已有完善的 hybrid 设计

**问题**：方案声称"当前检索主要依赖全文搜索 + 向量相似度"，忽略了现有实现的复杂性。

**实际实现**（`packages/search/src/retriever.ts`）：
- `HybridRetriever` 类，支持 keyword + vector 混合检索
- 完善的评分机制：`roleMatch`, `skillMatch`, `skillTextMatch`, `leadershipTextMatch`, `openSourceTextMatch`, `githubSourceMatch`, `exactNameMatch`, `prefixNameMatch`
- 动态权重调整：`resolveBlendWeights()` 根据 query 类型调整
- 中英文同义词扩展：`ROLE_EQUIVALENTS`, `SKILL_EQUIVALENTS`, `LOCATION_VARIANTS`

**影响**：方案低估了现有检索系统的成熟度，高估了"图增强"的边际收益。

**建议动作**：先评估现有检索系统的 baseline 指标，再决定是否需要图增强。

---

### Finding 6: 向量维度限制导致无法使用 ANN 索引

**问题**：方案未提及现有向量检索的性能限制。

**实际限制**（`packages/db/migrations/0004_search_tables.sql:5-11`）：
```sql
-- IMPORTANT: HNSW index is NOT created because pgvector's HNSW
-- implementation has a maximum dimension limit of 2000. With 4096
-- dimensions, we use sequential scan for MVP.
```

**影响**：
1. 当前向量检索使用全表扫描，O(n) 复杂度
2. 8,074 条记录尚可接受，但扩展到 25,000+ 会变慢
3. 图嵌入（256 维）可以使用 HNSW，但需要额外存储

**建议动作**：评估是否需要降维或迁移到支持高维 ANN 的系统。

---

### Finding 7: 预期收益不可信

**问题**：方案声称"检索准确率 +15-25%"，但没有 baseline 数据支持。

**缺失**：
1. 当前检索准确率是多少？
2. 如何定义"准确率"？（Precision@K? NDCG? MRR?）
3. 有没有评估数据集？

**建议动作**：先建立 eval baseline，再谈收益。

---

## Answers to the 6 Questions

### 1. 技术可行性

**GraphTranslator 方案是否合理？**

部分合理，但被过度设计。

**为什么过度设计？**

1. GraphTranslator 的核心价值是"开放式图查询"，但 Seeku 的核心场景是"候选人检索"，不需要开放式查询。
2. 第一版解释性不需要 LLM 生成描述，直接展示"与 X、Y、Z 有共同好友"即可。
3. Translator 训练需要大量对齐数据，成本高，收益不确定。

**更便宜的替代方案**：

| 方案 | 成本 | 收益 | 推荐度 |
|------|------|------|--------|
| 图特征 rerank | 低 | 中 | ⭐⭐⭐⭐⭐ |
| PPR/Random Walk | 低 | 中 | ⭐⭐⭐⭐ |
| Node2Vec + 余弦相似度 | 中 | 中 | ⭐⭐⭐ |
| GraphSAGE + 分类头 | 中 | 高 | ⭐⭐ |
| GraphTranslator | 高 | 不确定 | ⭐ |

**推荐**：先用图特征（度数、共同邻居、PPR 分数）做 rerank，验证收益后再考虑训练图模型。

---

### 2. 优先级

**应该先做什么？**

**推荐顺序**：

1. **数据审计**（1-2 天）
   - 完成.friend links 导入
   - 统计边的覆盖率、连通性
   - 补齐 embedding 到 80%+

2. **Eval baseline**（2-3 天）
   - 建立评估数据集（至少 50 个 query + 标注结果）
   - 测量当前检索的 Precision@5, @10, NDCG

3. **图特征 rerank**（3-5 天）
   - 添加 `neighbor_count`, `pagerank`, `common_neighbors` 等特征
   - 在 reranker 中使用

4. **增强现有 memory 系统**（3-5 天）
   - 执行现有迁移
   - 实现 preference 记录和查询

**不应该先做**：
- GraphTranslator
- memU 集成
- GraphSAGE 训练

---

### 3. 图嵌入训练

**GraphSAGE 是否合理？**

对这个规模（25K 节点，50K 边），GraphSAGE 可以工作，但不是最优选择。

**问题**：
1. 只有 32% 节点有 embedding 特征
2. 训练需要定义任务（节点分类？链路预测？）
3. 需要标注数据

**推荐**：

| 阶段 | 方法 | 理由 |
|------|------|------|
| 第一版 | PPR / Common Neighbors | 无需训练，可解释 |
| 第二版 | Node2Vec | 无监督，快速验证 |
| 第三版 | GraphSAGE | 有监督，需要标注数据 |

**现有 embedding 覆盖率低的影响**：
- GraphSAGE 需要节点特征，68% 节点没有特征
- 可以用零向量填充，但会降低质量
- 或者只用有 embedding 的子图训练

---

### 4. Translator 对齐数据

**如何生成 (node embedding, text description) 对？**

如果真的要做 GraphTranslator：

**应该用结构化模板，不要让 LLM 自由生成**：

```typescript
// 推荐模板
const description = `
${person.primaryName} 是 ${person.headline}。
在 Bonjour 上有 ${neighborCount} 个好友。
与 ${topNeighbors.map(n => n.name).join('、')} 有共同联系。
主要活跃领域：${tags.join('、')}。
`;
```

**不应该让 LLM "脑补"的信息**：
- 具体的合作项目名称（除非有证据）
- 技能熟练程度（除非有 GitHub 数据）
- 职业发展预测

**应该来自显式图证据的信息**：
- 好友数量
- 共同好友名单
- 所属社区（通过聚类发现）

---

### 5. 技术栈

**推荐：Python 训练 + TypeScript 推理**

**理由**：

1. **训练**：Python 生态成熟（PyG, DGL, NetworkX），现有脚本也是 Python
2. **推理**：TypeScript 与现有代码库一致，ONNX 导出可选
3. **部署**：图嵌入可以预计算，推理时只做查表

**不推荐全 TypeScript**：
- 图模型训练库不成熟
- 会重复造轮子

**不推荐 Python 推理服务化**：
- 增加运维复杂度
- 图嵌入可以预计算，不需要在线推理

---

### 6. 风险点

**遗漏的高风险问题**：

| 风险 | 严重程度 | 说明 |
|------|----------|------|
| **BFS 抓取偏差** | 高 | Bonjour 数据通过 BFS 抓取，头部节点被过度采样，图结构有偏差 |
| **边语义不可靠** | 高 | friend/friended 不代表真实社交关系，可能只是"互关" |
| **identity resolution 错边** | 高 | 同一人可能有多个 Bonjour 账号，导致错误边 |
| **图排序放大头部偏置** | 中 | 高度节点会被过度推荐，加剧马太效应 |
| **可解释性幻觉风险** | 中 | LLM 生成的描述可能包含虚假信息 |
| **评估指标缺失** | 高 | 没有 eval baseline，无法量化收益 |
| **embedding 覆盖率不足** | 高 | 68% 节点没有特征，图模型质量受限 |

---

## Recommended Roadmap

### Phase 0: 数据审计与 Baseline（1 周）

**目标**：建立数据真相和评估基准

**产出**：
1. Friend links 完整导入（目标覆盖率 80%+）
2. Embedding 覆盖率提升到 80%+
3. Eval 数据集（50+ queries + 标注）
4. Baseline 指标：Precision@5, @10, NDCG

**依赖**：无

**风险**：数据质量可能比预期差

**是否继续判断**：如果 friend links 覆盖率 < 50%，停止图相关开发

---

### Phase 1: 图特征 Rerank（1 周）

**目标**：验证图特征的边际收益

**产出**：
1. 图特征计算：`neighbor_count`, `pagerank`, `common_neighbors_with_query`
2. Reranker 集成
3. A/B 测试结果

**依赖**：Phase 0 完成

**风险**：图特征可能对检索质量无显著提升

**是否继续判断**：如果 NDCG 提升 < 3%，停止图模型训练

---

### Phase 2: Memory 系统增强（1 周）

**目标**：实现用户偏好记忆

**产出**：
1. 执行现有 memory 迁移
2. 实现 preference 记录 API
3. 检索时注入偏好

**依赖**：无

**风险**：用户可能不愿意被记录偏好

**是否继续判断**：如果用户反馈积极，继续增强

---

### Phase 3: 图嵌入训练（可选，2 周）

**目标**：训练 Node2Vec / GraphSAGE

**产出**：
1. 图嵌入向量
2. 相似度检索接口
3. 离线评估报告

**依赖**：Phase 1 证明图特征有效

**风险**：训练成本高，收益不确定

**是否继续判断**：如果 Phase 1 NDCG 提升 > 5%，继续

---

## Evaluation Plan

### 离线评估

| 指标 | 说明 | 目标 |
|------|------|------|
| Precision@5 | 前 5 结果中相关比例 | > 0.7 |
| Precision@10 | 前 10 结果中相关比例 | > 0.6 |
| NDCG@10 | 排序质量 | > 0.65 |
| 覆盖率 | 有结果的 query 比例 | > 0.9 |

### 在线评估

| 指标 | 说明 | 目标 |
|------|------|------|
| 点击率 | 用户点击结果的比例 | > 0.3 |
| 停留时间 | 用户查看详情的时间 | > 30s |
| 负反馈率 | 用户标记"不相关"的比例 | < 0.1 |

### A/B 测试

- 对照组：现有 hybrid retriever
- 实验组：hybrid retriever + 图特征 rerank
- 周期：1 周
- 流量：10%

---

## Kill Criteria

**出现以下情况时，停止 GraphTranslator 开发**：

1. **Eval baseline 显示现有检索已经很好**（NDCG > 0.75）
2. **图特征 rerank 无显著收益**（NDCG 提升 < 3%）
3. **Friend links 覆盖率过低**（< 50%）
4. **Embedding 覆盖率无法提升**（卡在 < 60%）
5. **用户反馈图解释无用或困惑**

**出现以下情况时，停止 memU 集成**：

1. **现有 memory 系统足够用**
2. **memU 与现有架构冲突严重**
3. **用户不使用 preference 功能**

---

## 附录：文件引用

| 文件 | 行号 | 说明 |
|------|------|------|
| `docs/proposals/graph-rag-integration.md` | 13-17 | 数据规模声明（与实际不符） |
| `packages/search/src/retriever.ts` | 419-739 | HybridRetriever 实现 |
| `packages/db/migrations/0004_search_tables.sql` | 5-11 | 向量维度限制说明 |
| `packages/db/src/migrations/0005_user_memories.sql` | 28-48 | user_memories 表设计 |
| `packages/db/src/migrations/0006_candidate_feedback_memories.sql` | 15-24 | candidate_feedback_memories 表设计 |
| `apps/worker/src/cli/import-bonjour-friend-links.ts` | 44-66 | FriendLinkEntry 接口定义 |
