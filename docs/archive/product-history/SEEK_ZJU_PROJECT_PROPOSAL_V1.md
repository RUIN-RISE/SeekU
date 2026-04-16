# Seek ZJU 项目方案

版本：v0.2

## 1. 项目定义

`Seek ZJU` 建议作为独立项目启动。

这个项目不再是传统的“人才搜索产品”，而是一个面向浙江大学 AI 高价值校友的证据驱动型情报与联络系统。

核心问题已经从：

- `seeku`：谁匹配这个岗位

转为：

- `Seek ZJU`：谁是浙大校友、目前在哪、是否值得联系、如何联系

因此，它应当拥有独立的 repo、独立的 schema、独立的评分逻辑与独立的交付工作流。

## 2. v0.2 正式口径

本轮讨论后，以下口径视为当前正式结论。

### 2.1 项目边界

- 新项目名称：`seek-zju`
- 一期主源：`Bonjour + 实验室页面`
- 公众号：证据增强源，不作为主发现源
- 联系方式：按 `A / B / C` 分层交付
- 首轮里程碑：先做 `30` 人高置信度样本
- 一期总目标：在方法验证后扩展到 `100` 人交付

### 2.2 技术路线

底层复用 `seeku` 的以下能力：

- identity merge / person merge 思路
- evidence-first 的人物建模方式
- source profile 归一化与入库能力
- 网页抓取与 LLM 摘要能力
- 导出链路

业务层在 `Seek ZJU` 中重建：

- 教育背景模型
- 联系方式模型
- 校友置信度
- AI 相关度
- review queue
- delivery batch

## 3. 为什么建议单独起项目

建议单独起项目的原因如下：

- 产品目标不同：从招聘搜索转为校友识别、关系沉淀与联络交付
- 数据一等公民不同：教育背景、实验室链路、联系方式将成为核心实体
- 评分体系不同：校友置信度、AI 相关度、联系方式有效性高于招聘匹配度
- 工作流不同：需要发现、验证、复核、交付，而不是只做搜索与 shortlist
- 合规边界更敏感：涉及联系方式采集、公开性、可见性和可追溯性

最合理的方案不是重写一切，而是：

- 独立建立 `Seek ZJU`
- 从 `seeku` 迁移可复用内核
- 在新项目里重建正确的业务层

## 4. 一期目标

### 4.1 一期总目标

一期聚焦中国国内，目标是交付一份浙江大学 AI 校友高质量名单。

### 4.2 分阶段目标

建议把一期拆成两个里程碑：

#### 里程碑 A：方法验证

- 产出 `30` 位高置信度样本
- 验证校友识别、联系方式分层、人工复核和导出链路是否成立

#### 里程碑 B：正式交付

- 将候选池扩展至 `300-500`
- 产出 `100` 位高质量交付名单

### 4.3 一期目标人群

一期候选人建议尽量同时满足：

- 必须是浙江大学校友
- 当前主要在中国国内
- 属于狭义 AI 人才
- 优先在中国头部 AI / 大模型 / AI Infra / AI 研究相关企业任职

优先覆盖人群包括：

- 大模型算法工程师
- 机器学习工程师
- AI 科学家 / 研究员
- 多模态 / 视觉 / 推荐 / Agent / ML Infra 核心成员
- AI 技术负责人
- AI 投资人或 AI 产业研究型人才

### 4.4 一期不优先范围

- Bay Area 与海外人群
- 泛互联网岗位
- 与 AI 相关度较低的运营、市场、销售岗位
- 无法确认校友身份的人选

## 5. 对外交付标准

### 5.1 建议交付字段

- 姓名
- 联系方式
- 性别
- 年龄
- 入学年份
- 专业
- 当前公司
- 当前岗位
- 所在城市
- AI 方向标签
- 校友证据链接
- 职业资料链接
- 备注

### 5.2 字段原则

- 联系方式必须有
- 年龄和性别前 100 个不能缺
- 任何关键字段都必须尽量保留证据来源

### 5.3 年龄字段的内部存储原则

对外交付可以显示年龄，但内部不建议长期存 `age`。

内部建议存：

- `birth_year`

或在证据不足时存：

- `age_range`

这样可以避免年龄随时间过期。

## 6. 联系方式口径

联系方式是一期交付成败的关键变量。

### 6.1 分层定义

建议按三层定义联系方式：

#### A 级：直接触达

- 公开微信
- 公开手机
- 公开个人邮箱
- 明确的个人主页联系入口

#### B 级：工作触达

- 公开工作邮箱
- 公开职业社交私信入口
- 可明确使用的公开联系页面

#### C 级：间接触达

- 只能通过校友引荐
- 只能通过组织、活动、实验室或共同关系间接联系

### 6.2 一期建议目标

前 100 人不建议要求全部拿到微信或手机。

更现实的交付目标是：

- A 级：尽量覆盖 `30`
- B 级：尽量覆盖 `50`
- C 级：允许约 `20`

交付表中应明确标注触达层级，避免客户对“联系方式”产生误判。

### 6.3 治理原则

`Seek ZJU` 中的联系方式必须附带治理信息，至少包括：

- `collection_basis`：采集依据
- `visibility_scope`：可见性范围

用于区分：

- 公开采集
- 手工录入
- 校友引荐
- 仅内部可见

## 7. 数据源优先级

### 7.1 第一优先级

- Bonjour 中显性写出 `浙江大学 / 浙大 / ZJU`
- 浙江大学知名实验室、课题组、导师主页中的毕业去向或成员信息

这是一期最值得优先打通的来源，因为：

- 校友置信度高
- 数据结构相对稳定
- 更适合做首轮 30 人样本

### 7.2 第二优先级

- 浙大官方新闻、学院新闻、活动页
- 微信公众号文章
- 个人主页、访谈页、演讲页

这类来源更适合：

- 补充履历
- 补充校友证据
- 补充 AI 相关度证据
- 补充职业信息

### 7.3 第三优先级

- GitHub
- LinkedIn
- 公司官网团队页
- 公开论文作者页

这类来源更适合作为交叉验证与补全来源，而非一期主发现引擎。

## 8. 与 Seeku 的关系

`Seek ZJU` 不是从零开始。

`seeku` 中以下能力可以迁移或复用：

- 多源 profile 入库思路
- person / identity merge 机制
- evidence-first 模型
- enrichment 抓取与摘要链路
- 导出框架

### 8.1 应直接复用的部分

- `person_identities` 这种 source profile 与 person 解耦的建模方式
- crawler / summarizer / enrichment 的通用能力
- evidence item 的证据驱动思路
- 简洁的导出能力

### 8.2 不建议直接迁移的部分

- 现有招聘搜索导向的 scorer
- 现有 search / embeddings 主链路
- 现有 web UI / API 形态

### 8.3 需要在 Seek ZJU 重建的部分

- 教育背景模型
- 联系方式模型
- 校友识别规则
- 联系方式治理
- review queue
- delivery batch

## 9. v0.2 核心建模修正

相较于上一版方案，本版明确采纳以下五个关键修正。

### 9.1 保留 `person_identities`

不建议让 `source_profiles.person_id` 直接承担人物归属。

原因：

- 支持先入库、后归并
- 支持人工改绑
- 支持同名冲突处理
- 支持一个人存在多来源画像

### 9.2 新增 `delivery_batch_members`

不建议把 `delivery_batch_id` 直接挂到 `persons`。

原因：

- 一个人可能出现在多个交付批次
- 需要支持多版本导出
- 需要保留批次内备注、状态和导出快照

### 9.3 内部存 `birth_year` 而不是 `age`

原因：

- 年龄会过期
- 出生年更稳定
- 导出时再计算年龄更合理

### 9.4 `priority_score` 使用 decimal 或实时计算

不建议一开始就把它固化成整数。

原因：

- 评分策略会不断调整
- decimal 更适合渐进调参
- 某些场景可以按实时公式计算

### 9.5 `contact_methods` 增加治理字段

除基本字段外，建议增加：

- `collection_basis`
- `visibility_scope`

用于回答以下问题：

- 联系方式从哪里来
- 是否公开
- 是否只能内部使用
- 是否由校友引荐而来

## 10. 建议的数据模型

一期 MVP 建议至少落以下 9 张表：

- `persons`
- `source_profiles`
- `person_identities`
- `person_educations`
- `contact_methods`
- `evidence_items`
- `review_tasks`
- `delivery_batches`
- `delivery_batch_members`

### 10.1 人物主表

`persons`

建议字段包括：

- `id`
- `canonical_name`
- `gender`
- `birth_year`
- `current_city`
- `current_company`
- `current_title`
- `alumni_confidence`
- `ai_relevance`
- `contact_confidence`
- `priority_score`
- `review_status`
- `created_at`
- `updated_at`

### 10.2 来源画像

`source_profiles`

建议字段包括：

- `id`
- `source`
- `source_handle`
- `canonical_url`
- `source_profile_id`
- `raw_payload`
- `normalized_payload`
- `metadata`
- `fetched_at`

一期建议：

- `labs`
- `wechat_article`

先作为 `web` 的 subtype 挂在 metadata 中，不必在一开始就拆成单独 source enum。

### 10.3 人物归并表

`person_identities`

建议字段包括：

- `id`
- `person_id`
- `source_profile_id`
- `match_score`
- `match_reason`
- `is_primary`
- `created_at`

### 10.4 教育背景

`person_educations`

建议字段包括：

- `id`
- `person_id`
- `school_name`
- `school_normalized`
- `degree_level`
- `major`
- `college`
- `lab_name`
- `advisor_name`
- `enrollment_year`
- `graduation_year`
- `evidence_url`
- `evidence_text`
- `confidence`

### 10.5 联系方式

`contact_methods`

建议字段包括：

- `id`
- `person_id`
- `channel`
- `value`
- `is_public`
- `source_url`
- `source_type`
- `verification_status`
- `collection_basis`
- `visibility_scope`
- `last_verified_at`
- `confidence`

### 10.6 证据表

`evidence_items`

建议支持的证据类型：

- `education`
- `employment`
- `ai_signal`
- `contact`
- `lab_affiliation`
- `media_mention`

### 10.7 审核任务

`review_tasks`

建议字段包括：

- `id`
- `person_id`
- `missing_fields`
- `assigned_to`
- `status`
- `notes`
- `created_at`
- `completed_at`

### 10.8 交付批次

`delivery_batches`

建议字段包括：

- `id`
- `batch_name`
- `target_size`
- `status`
- `exported_at`
- `exported_path`

### 10.9 批次成员

`delivery_batch_members`

建议字段包括：

- `id`
- `delivery_batch_id`
- `person_id`
- `batch_status`
- `rank_in_batch`
- `notes`
- `export_snapshot`
- `created_at`

## 11. 核心评分体系

建议先建立以下四个维度。

### 11.1 校友置信度

- `confirmed`
- `high`
- `medium`
- `low`

示例：

- `confirmed`：教育经历明确写出浙江大学及年份/院系
- `high`：实验室毕业去向、导师名单、校内官方报道明确指向本人
- `medium`：单源提及浙大，但缺少第二证据
- `low`：仅有间接推断

### 11.2 AI 相关度

- `high`
- `medium`
- `low`

判断依据包括：

- 公司是否位于目标公司池
- 岗位是否直接参与 AI 技术或 AI 投资
- 是否存在 AI 项目、论文、开源或公开技术表达

### 11.3 联系方式有效度

- `verified`
- `high`
- `medium`
- `low`

它与 A/B/C 触达层级相关，但不完全等价。

### 11.4 综合优先级

建议采用以下思路：

`priority_score = alumni_confidence × ai_relevance × contact_confidence × company_priority × completeness`

实现上可选择：

- numeric 字段持久化
- 查询时实时计算

## 12. 一期数据工作流

推荐的一期流水线如下：

### 12.1 种子发现

- 扫 Bonjour 中显性 `浙大 / 浙江大学 / ZJU`
- 扫实验室毕业去向与成员页
- 扫公众号和校内新闻页

### 12.2 归一化

- 统一人名、公司名、学校名、实验室名
- 生成 source profile

### 12.3 人物归并

- 同名、链接、公司、教育信息交叉匹配
- 通过 `person_identities` 挂接到统一 `person`

### 12.4 证据抽取

- 抽教育证据
- 抽公司证据
- 抽 AI 证据
- 抽联系方式证据

### 12.5 打分

- 校友置信度
- AI 相关度
- 联系方式有效度
- 完整度

### 12.6 人工复核

- 先审 Top 30
- 再扩展到 Top 100
- 补齐年龄、性别、联系方式缺口

### 12.7 导出交付

- 导出 Excel / CSV
- 保存交付批次
- 保存批次成员快照

## 13. MVP 边界

### 13.1 一期必须做

- 教育背景模型
- 联系方式模型
- `person_identities`
- `delivery_batch_members`
- Bonjour 浙大关键词扫描
- 2 到 3 个实验室页面解析器
- 校友置信度规则
- AI 相关度规则
- review queue
- Excel / CSV 导出

### 13.2 一期不该做

- 完整 web 管理后台
- 复杂权限系统
- 自动化 CRM
- 全量 GitHub / LinkedIn 爬取
- 北美 / Bay Area 覆盖
- 太复杂的推荐算法

### 13.3 可先用人工兜底

- 性别判断
- 出生年份补齐
- AI 边界 case 判定
- 联系方式验证

## 14. 对一期现实性的判断

我的判断如下：

- 候选池做到 `300-500`，现实
- 高置信度样本做到 `30`，现实
- 扩展到 `100` 人交付，现实
- 要求 `100` 人全部有高可信微信/手机，不现实

因此一期必须调整“联系方式有效”的交付口径，而不是把所有联系方式混为一个字段。

## 15. 关键风险

### 15.1 校友识别风险

- 浙大关键词不一定等于本人是校友
- 实验室或计划名称可能带来误判

应对：

- 所有校友结论必须挂证据
- Top 100 仅收 `confirmed / high`

### 15.2 联系方式风险

- 微信、手机获取率低
- 猜测式邮箱存在明显风险

应对：

- 不把猜测邮箱视为正式联系方式
- 联系方式按 A/B/C 与治理字段分层

### 15.3 人物归并风险

- 同名不同人
- 一人多名
- 不同来源信息冲突

应对：

- 保留 `person_identities`
- 多字段交叉匹配
- review queue 允许人工改绑

### 15.4 时间风险

- 一开始做得过大，会拖慢一期交付

应对：

- 先做 30 人样本验证
- 再扩展到 100 人

## 16. 推荐的下一步动作

建议立刻做以下五件事：

1. 确认一期目标公司池
2. 确认“有效联系方式”的 A/B/C 口径
3. 在现有 `seeku` 数据里再跑一轮浙大信号扫描
4. 选择 2 到 3 个实验室页面做首批解析验证
5. 建立 `seek-zju` 首版 repo scaffold 与 9 张表 schema

## 17. 一句话结论

`Seek ZJU` 应作为独立项目启动，但底层技术上强烈建议复用 `seeku` 的 identity / evidence / enrichment 内核。

新项目最重要的不是继续做更强的“搜索”，而是尽快把“浙大校友识别 + 联系方式治理 + 30 人样本验证 + 100 人金名单交付”这条链路做出来。
