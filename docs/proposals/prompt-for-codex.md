请帮我评审以下技术方案，并给出你的建议：

---

## 背景

Seeku 是一个证据驱动的 AI 人才搜索引擎，数据源为 Bonjour.bio，已收录 22,497 位候选人。现有检索依赖全文搜索和向量相似度，但未利用 Bonjour 的社交关系图谱。

我发现两项技术可以增强 Seeku：

1. **GraphTranslator**（论文）：将图模型嵌入对齐到 LLM 语言空间，实现图数据的开放式查询
2. **memU**（开源项目）：面向 AI 智能体的主动记忆系统，持续学习用户偏好

---

## 核心问题

1. 社交图信号未被利用（friend/friended 关系）
2. 推荐缺乏可解释性（为什么推荐这个人？）
3. 用户偏好未被记忆（每次搜索独立）

---

## 提议方案

```
用户查询 → Graph RAG + Vector RAG → 图增强的候选人列表 + 关系解释
                    ↓
              memU 记忆系统（偏好学习）
```

**Graph RAG 流程：**
1. 用 GraphSAGE 学习节点嵌入（以现有文本嵌入为节点特征）
2. 用 GraphTranslator 将节点嵌入"翻译"成自然语言描述
3. 检索时结合向量相似度 + 图距离
4. 返回候选人 + 关系路径解释

**memU 流程：**
1. 记录用户筛选行为（memorize）
2. 检索时注入偏好记忆（retrieve）
3. 主动推送符合条件的新候选人

---

## 需要你回答的问题

1. **技术可行性**：GraphTranslator 方案是否合理？有没有更简单的替代方案？

2. **优先级**：
   - 先做图嵌入 + GraphTranslator？
   - 还是先做 memU 用户偏好记忆？
   - 还是两者并行？

3. **图嵌入训练**：
   - 从零训练 GraphSAGE？
   - 用预训练模型微调？
   - 用无监督方法（Node2Vec）？

4. **Translator 对齐数据**：
   - 如何高效生成（节点嵌入，文本描述）对？
   - 用哪个 LLM？描述格式？

5. **技术栈**：
   - Python 训练 + Python 推理（服务化）？
   - Python 训练 + TypeScript 推理（ONNX）？
   - 全 TypeScript？

6. **风险点**：我遗漏了什么风险？有什么坑需要避免？

---

## 相关资料

- GraphTranslator 论文：https://arxiv.org/abs/2401.05556
- memU GitHub：https://github.com/NevaMind-AI/memU
- 详细方案：见 `docs/proposals/graph-rag-integration.md`

请给出你的分析和建议。
