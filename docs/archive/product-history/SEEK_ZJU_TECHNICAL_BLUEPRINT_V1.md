# Seek ZJU 首版技术蓝图

版本：v0.1

## 1. 蓝图目标

本蓝图面向 `seek-zju` 首版实现，目标不是提供最终生产架构，而是为 MVP 提供一份可以直接开工的技术骨架。

设计原则：

- 优先复用 `seeku` 的稳定底层能力
- 在新 repo 中重建正确的业务模型
- 先支持 `30` 人高置信度样本验证
- 所有关键结论尽量可追溯、可复核、可导出

## 2. MVP 总体架构

```text
seek-zju/
├── apps/
│   └── ops-cli/
│       └── src/
│           ├── cli.ts
│           └── commands/
│               ├── scan-bonjour.ts
│               ├── scan-labs.ts
│               ├── scan-wechat.ts
│               ├── normalize.ts
│               ├── merge-identities.ts
│               ├── extract-evidence.ts
│               ├── score-candidates.ts
│               ├── build-review-queue.ts
│               └── export-batch.ts
├── packages/
│   ├── db/
│   │   └── src/
│   │       ├── schema.ts
│   │       ├── repositories.ts
│   │       └── migrations/
│   ├── shared/
│   │   └── src/
│   │       ├── types.ts
│   │       ├── constants.ts
│   │       └── schemas.ts
│   ├── connectors/
│   │   └── src/
│   │       ├── types.ts
│   │       ├── bonjour/
│   │       ├── labs/
│   │       ├── wechat/
│   │       └── web/
│   ├── identity/
│   │   └── src/
│   │       ├── matcher.ts
│   │       ├── merger.ts
│   │       └── resolver.ts
│   ├── enrichment/
│   │   └── src/
│   │       ├── crawler.ts
│   │       ├── summarizer.ts
│   │       └── extraction/
│   │           ├── education.ts
│   │           ├── employment.ts
│   │           ├── ai-signal.ts
│   │           └── contact.ts
│   ├── core/
│   │   └── src/
│   │       ├── rules/
│   │       │   ├── zju-identifier.ts
│   │       │   ├── company-pool.ts
│   │       │   └── contact-policy.ts
│   │       ├── scoring/
│   │       │   ├── alumni-confidence.ts
│   │       │   ├── ai-relevance.ts
│   │       │   ├── contact-confidence.ts
│   │       │   └── priority-score.ts
│   │       └── review/
│   │           └── checklist.ts
│   └── export/
│       └── src/
│           ├── csv.ts
│           ├── excel.ts
│           └── snapshot.ts
└── docs/
    └── product/
```

## 3. 模块边界

### 3.1 `apps/ops-cli`

负责一期所有运营命令。

它是首版产品主入口，承担：

- 来源扫描
- 数据归一化
- 人物归并
- 打分
- 复核队列生成
- 批次导出

### 3.2 `packages/db`

负责：

- schema
- migration
- repository
- 交付批次与审核任务的数据操作

### 3.3 `packages/connectors`

负责：

- 不同来源的抓取和解析
- 统一输出 source profile

一期至少要有：

- `bonjour`
- `labs`
- `wechat`
- `web`

### 3.4 `packages/identity`

负责：

- source profile 去重与归并
- 维护 `person_identities`

建议从 `seeku` 迁移其 matcher / merger / resolver 思路，但规则需要按教育与校友线索重写。

### 3.5 `packages/enrichment`

负责：

- 网页抓取
- LLM 摘要
- 非结构化资料转结构化证据

这部分适合直接借鉴 `seeku` 的 crawler / summarizer / enrichment hub 思路。

### 3.6 `packages/core`

负责业务规则，是 `Seek ZJU` 最核心的新层。

它承担：

- 校友识别规则
- 目标公司池
- AI 相关度规则
- 联系方式治理策略
- 综合优先级计算
- review checklist

### 3.7 `packages/export`

负责：

- CSV / Excel 导出
- 保存批次成员快照

## 4. 与 Seeku 的迁移映射

### 4.1 建议迁移的内容

- `identity` 核心模式
- `evidence-first` 数据思想
- `crawler / summarizer`
- 基础导出逻辑

### 4.2 建议借鉴但不直接照搬的内容

- `source_profiles / persons / person_identities / evidence_items` 的结构理念
- enrichment hub 的编排方式

### 4.3 不建议迁移的内容

- 现有 search planner / retriever / reranker
- embeddings 主链路
- 现有 web UI / API
- 现有招聘导向 scorer

## 5. 数据流蓝图

```text
Bonjour / Labs / WeChat / Web
        │
        ▼
source_profiles
        │
        ▼
identity resolver
        │
        ▼
persons + person_identities
        │
        ▼
education / employment / ai / contact extraction
        │
        ▼
person_educations + contact_methods + evidence_items
        │
        ▼
alumni / ai / contact scoring
        │
        ▼
review_tasks
        │
        ▼
delivery_batches + delivery_batch_members
        │
        ▼
CSV / Excel export
```

## 6. MVP Schema 草案

下面的 schema 草案只覆盖一期关键对象，重点体现已经确认的 5 个建模修正。

```ts
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const persons = pgTable("persons", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  gender: text("gender"),
  birthYear: integer("birth_year"),
  ageRange: text("age_range"),
  currentCity: text("current_city"),
  currentCompany: text("current_company"),
  currentTitle: text("current_title"),
  alumniConfidence: text("alumni_confidence"),
  aiRelevance: text("ai_relevance"),
  contactConfidence: text("contact_confidence"),
  priorityScore: numeric("priority_score", { precision: 8, scale: 4 }),
  reviewStatus: text("review_status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const sourceProfiles = pgTable("source_profiles", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  source: text("source").notNull(), // bonjour | web
  sourceSubtype: text("source_subtype"), // labs | wechat_article | official_news
  sourceProfileId: text("source_profile_id"),
  sourceHandle: text("source_handle").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
  normalizedPayload: jsonb("normalized_payload").notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  sourceHandleUnique: unique("zju_source_profiles_source_handle_unique").on(table.source, table.sourceHandle)
}));

export const personIdentities = pgTable("person_identities", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  sourceProfileId: uuid("source_profile_id").notNull().references(() => sourceProfiles.id, { onDelete: "cascade" }),
  matchScore: numeric("match_score", { precision: 6, scale: 4 }).notNull(),
  matchReason: jsonb("match_reason").default(sql`'[]'::jsonb`).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const personEducations = pgTable("person_educations", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  schoolName: text("school_name").notNull(),
  schoolNormalized: text("school_normalized").notNull(),
  degreeLevel: text("degree_level"),
  major: text("major"),
  college: text("college"),
  labName: text("lab_name"),
  advisorName: text("advisor_name"),
  enrollmentYear: integer("enrollment_year"),
  graduationYear: integer("graduation_year"),
  evidenceUrl: text("evidence_url"),
  evidenceText: text("evidence_text"),
  confidence: text("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const contactMethods = pgTable("contact_methods", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(), // wechat | email | phone | linkedin | form
  value: text("value").notNull(),
  isPublic: boolean("is_public").default(true).notNull(),
  sourceUrl: text("source_url"),
  sourceType: text("source_type"),
  verificationStatus: text("verification_status"),
  collectionBasis: text("collection_basis"), // public_profile | official_page | referred | manual
  visibilityScope: text("visibility_scope"), // public | internal | restricted
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  confidence: text("confidence"), // A | B | C
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const evidenceItems = pgTable("evidence_items", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  sourceProfileId: uuid("source_profile_id").references(() => sourceProfiles.id, { onDelete: "set null" }),
  evidenceType: text("evidence_type").notNull(), // education | employment | ai_signal | contact | lab_affiliation | media_mention
  title: text("title"),
  description: text("description"),
  sourceUrl: text("source_url"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  confidence: text("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const reviewTasks = pgTable("review_tasks", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  missingFields: jsonb("missing_fields").default(sql`'[]'::jsonb`).notNull(),
  assignedTo: text("assigned_to"),
  status: text("status").default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

export const deliveryBatches = pgTable("delivery_batches", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  batchName: text("batch_name").notNull(),
  targetSize: integer("target_size"),
  status: text("status").default("draft").notNull(),
  exportedAt: timestamp("exported_at", { withTimezone: true }),
  exportedPath: text("exported_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const deliveryBatchMembers = pgTable("delivery_batch_members", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  deliveryBatchId: uuid("delivery_batch_id").notNull().references(() => deliveryBatches.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  batchStatus: text("batch_status").default("candidate").notNull(),
  rankInBatch: integer("rank_in_batch"),
  notes: text("notes"),
  exportSnapshot: jsonb("export_snapshot").default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
```

## 7. 首批 CLI 命令建议

建议一期先有以下命令：

```text
seek-zju scan-bonjour --query "浙大"
seek-zju scan-bonjour --query "zju"
seek-zju scan-labs --source dcad --limit 100
seek-zju scan-labs --source vipa --limit 100
seek-zju normalize
seek-zju merge-identities
seek-zju extract-evidence
seek-zju score-candidates
seek-zju build-review-queue --top 150
seek-zju export-batch --batch "pilot-30" --format csv
```

## 8. 首轮实现顺序

### 阶段 1：建库与骨架

- 建 repo
- 建 9 张表
- 建基础 repository

### 阶段 2：主来源接入

- `scan-bonjour`
- `scan-labs`

### 阶段 3：归并与证据

- 归一化 source profile
- 建 person / identities
- 抽 education / ai / contact 证据

### 阶段 4：评分与复核

- 跑 alumni / ai / contact 评分
- 生成 review queue

### 阶段 5：样本交付

- 产出首批 30 人样本
- 验证交付口径
- 再扩展到 100 人

## 9. 需要先确认的配置文件

建议在 `packages/core` 中维护三份初始配置：

### 9.1 目标公司池

`company-pool.ts`

- Tier 1
- Tier 2
- 排除名单

### 9.2 校友识别关键词

`zju-identifier.ts`

- `浙江大学`
- `浙大`
- `ZJU`
- `Zhejiang University`
- 学院别名
- 实验室别名

### 9.3 联系方式治理规则

`contact-policy.ts`

- 哪些来源允许入库
- 哪些来源只能内部可见
- 哪些来源只能标为线索，不能标为正式联系方式

## 10. 首版成功标准

首版技术蓝图是否成功，不看系统做得多复杂，而看是否满足以下四点：

1. 能稳定发现一批浙大校友候选人
2. 能把多来源信息归并到统一 person
3. 能对每个人保留教育、AI、联系方式证据
4. 能导出首批 30 人高置信度样本

## 11. 一句话结论

`seek-zju` 的首版技术实现，应当以 `identity + evidence + education + contact + review + delivery` 为核心骨架。

只要这条链路打通，后续不管是扩来源、扩公司池、扩地区，还是升级成完整情报系统，都会顺很多。
