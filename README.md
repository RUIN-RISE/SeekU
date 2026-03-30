# Seeku

**AI Talent Search Engine for AI Builders**

[English](#english) | [中文](#chinese)

---

<a name="english"></a>

## English

Seeku is an evidence-driven AI talent search engine for founders, engineering leads, and technical recruiters. Instead of matching only on profile text, it ranks candidates by what they have actually built, shipped, written, and maintained.

**Core Value:** Find the right AI talent through what they have done, not what they claim.

## Project Status

- The CLI is the primary product surface today.
- The main workflow is: search, shortlist, compare, refine, and export.
- The web app and admin API are secondary surfaces for operations and inspection.

## Key Features

### Search Agent

- **Natural language query**: Search with inputs like `Find ML engineers in Hangzhou with 3+ years experience`.
- **Interactive clarification**: The CLI helps narrow ambiguous requirements before search.
- **Query-aware matching**: Each result explains why it matches the current query.
- **Multi-dimensional scoring**: Results are judged across tech fit, project depth, location fit, and career stability.

### Decision Support

- **Compare workspace**: Compare shortlisted candidates side by side with recommendations and next-step suggestions.
- **Source visibility**: Show whether evidence comes from Bonjour, GitHub, or other indexed sources.
- **Freshness indicators**: Surface how recent synced profile data or evidence is.
- **Bonjour deep link**: Open a candidate's Bonjour page directly from the CLI.

### Export and Integration

- **Multiple formats**: Export shortlist or compare pool to Markdown, CSV, or JSON.
- **Script mode**: Use `search --json` for automation, workflows, and downstream pipelines.

### Deep Enrichment

- **Web crawling**: Crawl blogs, portfolios, and personal sites.
- **LLM summarization**: Generate structured profile summaries from unstructured content.
- **Social graph discovery**: Discover additional candidates through GitHub-linked networks.

## Architecture

```mermaid
flowchart TD
  A["CLI Search Agent<br/>apps/worker"] --> B["Search Engine<br/>packages/search"]
  G["Web Admin<br/>apps/web"] --> C["API / Data Access"]
  B --> C["PostgreSQL + pgvector<br/>persons / search_documents / evidence_items / search_embeddings"]
  D["Sync Workers<br/>Bonjour / GitHub / identity / evidence"] --> C
  E["Enrichment Hub<br/>crawler + summarizer"] --> C
  F["Social Discovery<br/>GitHub network mining"] --> C
```

## Quick Start

### 1. Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL 16 with `pgvector`
- Docker optional, but recommended for local database setup

### 2. Install Dependencies

```bash
git clone https://github.com/RUIN-RISE/SeekU.git
cd SeekU
pnpm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Required:

- `DATABASE_URL`
- `SILICONFLOW_API_KEY` or `OPENAI_API_KEY`

Optional:

- `GITHUB_TOKEN`
- `JINA_API_KEY`
- `API_PORT`

Example:

```bash
DATABASE_URL=postgres://seeku:seeku_dev_password@localhost:5432/seeku
SILICONFLOW_API_KEY=YOUR_API_KEY_HERE
GITHUB_TOKEN=YOUR_API_KEY_HERE
JINA_API_KEY=YOUR_API_KEY_HERE
```

### 4. Start the Database

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d
pnpm db:migrate
```

### 5. Sync and Prepare Search Data

```bash
npx tsx apps/worker/src/cli.ts sync-bonjour --limit 100
npx tsx apps/worker/src/cli.ts resolve-identities
npx tsx apps/worker/src/cli.ts store-evidence
npx tsx apps/worker/src/cli.ts rebuild-search
```

### 6. Start Searching

```bash
# Interactive mode
npx tsx apps/worker/src/cli.ts

# Interactive mode with an initial prompt
npx tsx apps/worker/src/cli.ts "Find ML engineers in Hangzhou"

# Script mode
npx tsx apps/worker/src/cli.ts search "杭州 AI" --json --limit 10
```

## CLI Commands

### Core Commands

```text
Command                                                Description
-----------------------------------------------------------------------------------------
npx tsx apps/worker/src/cli.ts                         Start interactive search
npx tsx apps/worker/src/cli.ts "query"                 Start interactive search with a prompt
npx tsx apps/worker/src/cli.ts search "query" --json   Script mode JSON output
npx tsx apps/worker/src/cli.ts show <person-id>        Show a candidate profile
npx tsx apps/worker/src/cli.ts help                    Show CLI help
npx tsx apps/worker/src/cli.ts version                 Show CLI version
```

### Data Pipeline Commands

```text
Command                                                                 Description
--------------------------------------------------------------------------------------------------------------
npx tsx apps/worker/src/cli.ts sync-bonjour --limit 100                 Sync profiles from Bonjour
npx tsx apps/worker/src/cli.ts sync-github --handles foo,bar            Sync GitHub profiles
npx tsx apps/worker/src/cli.ts resolve-identities                       Merge duplicate identities
npx tsx apps/worker/src/cli.ts store-evidence                           Extract and store evidence items
npx tsx apps/worker/src/cli.ts backfill-person-fields                   Fill missing person fields
npx tsx apps/worker/src/cli.ts repair-source-payloads --source bonjour  Repair source payload issues
npx tsx apps/worker/src/cli.ts search-index                             Rebuild search documents
npx tsx apps/worker/src/cli.ts search-embeddings                        Rebuild embeddings
npx tsx apps/worker/src/cli.ts rebuild-search                           Rebuild the search pipeline end to end
```

### Enrichment Commands

```text
Command                                                    Description
-----------------------------------------------------------------------------------------------
npx tsx apps/worker/src/cli.ts enrich-profiles --limit 50  Crawl external sites and summarize
npx tsx apps/worker/src/cli.ts mine-network --limit 10     Discover candidates through GitHub
```

## Interactive CLI Guide

### Keyboard Navigation

```text
Key       Action
-------------------------------
Up / Down Move selection
Enter     View candidate detail
o         Open Bonjour profile
Space     Add to compare pool
c         Compare pool candidates
: or /    Enter command mode
q         Quit
```

### Commands Inside a Session

```text
Command             Description
------------------------------------------------------------
sort fresh          Sort by freshness
sort source         Sort by source priority
sort evidence       Sort by evidence strength
export md           Export shortlist to Markdown
export csv          Export shortlist to CSV
export json         Export shortlist to JSON
export pool md      Export compare pool to Markdown
history             Show search history
undo                Restore previous search conditions
show                Show current filters
r 去掉销售          Refine by excluding sales roles
r 像 2 号但更偏后端 Refine relative to candidate #2
```

## Project Structure

```text
seeku/
├── apps/
│   ├── worker/        CLI and background job entrypoints
│   ├── api/           REST API
│   └── web/           Admin dashboard
├── packages/
│   ├── search/        Planner, retriever, reranker
│   ├── workers/       Sync, enrichment, and discovery workers
│   ├── db/            Schema and repositories
│   ├── llm/           LLM provider abstraction
│   ├── adapters/      External source clients
│   ├── identity/      Identity resolution and evidence extraction
│   └── shared/        Shared types and schemas
├── infra/
│   └── docker-compose.yml
└── docs/
    └── reviews/       Code audit reports
```

## Environment Variables

```text
Variable             Required  Description
---------------------------------------------------------------
DATABASE_URL         Yes       PostgreSQL connection string
SILICONFLOW_API_KEY  Yes*      SiliconFlow API key
OPENAI_API_KEY       Yes*      OpenAI-compatible fallback key
GITHUB_TOKEN         No        GitHub sync token
JINA_API_KEY         No        Jina Reader API key
API_PORT             No        API server port

* Provide either SILICONFLOW_API_KEY or OPENAI_API_KEY.
```

## Data Sources

```text
Source         Role       Description
-------------------------------------------------------------
Bonjour.bio    Primary    Chinese AI talent profiles
GitHub         Secondary  Repositories, commits, and signals
Personal Sites Enrich     Blogs, portfolios, and technical writing
```

## Known Limitations

- Search quality depends on what has already been synced and indexed.
- Bonjour is the primary data source; coverage outside that network can be uneven.
- Some upstream APIs are undocumented or unofficial, which creates stability risk.
- Freshness is bounded by the sync pipeline; real-time guarantees are not provided.
- The web app is not the primary product path yet; the CLI has the most complete workflow.

## Security

- Secrets are loaded from environment variables.
- Query parsing and retrieval paths include input hardening.
- External source access is rate-limited and isolated through adapters.
- Sensitive local outputs such as shortlist exports are ignored by Git.

## License

Internal use only. See repository documentation for compliance and self-hosting details.

---

<a name="chinese"></a>

## 中文

Seeku 是一款面向创始人、技术主管和技术招聘者的证据驱动型 AI 人才搜索引擎。它不只依赖简介文本，而是根据候选人真实做过的项目、代码、文章和公开痕迹来进行搜索、排序和判断。

**核心价值：** 根据做过什么找人，而不是根据说过什么找人。

## Project Status

- 当前主入口是 CLI，核心体验围绕搜索、shortlist、对比、refine 和导出展开。
- Web 和 API 目前更偏向管理和辅助视图，不是主要使用路径。

## 核心功能

### 搜索智能体

- **自然语言搜索**：输入 `找杭州 3 年以上 ML 工程师` 这类需求即可开始搜索。
- **交互式澄清**：在搜索前帮助用户收敛模糊条件。
- **查询感知匹配**：每个结果会解释为什么匹配当前查询。
- **多维评分**：综合技术契合、项目深度、地点契合和职业稳定性进行判断。

### 决策支持

- **对比工作台**：并排比较候选人，并给出建议和下一步动作。
- **来源可见性**：明确展示数据来源，如 Bonjour、GitHub。
- **新鲜度指标**：展示资料和证据的新近程度。
- **Bonjour 深链**：直接打开候选人的 Bonjour 页面。

### 导出与集成

- **多格式导出**：支持 Markdown、CSV、JSON。
- **脚本模式**：`search --json` 可接入自动化流程。

### 深度增强

- **网页抓取**：抓取博客、作品集和个人站点。
- **LLM 总结**：把非结构化内容提炼成结构化画像。
- **社交图谱发现**：通过 GitHub 相关网络扩展候选人池。

## 快速开始

### 1. 安装依赖

```bash
git clone https://github.com/RUIN-RISE/SeekU.git
cd SeekU
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

必填：

- `DATABASE_URL`
- `SILICONFLOW_API_KEY` 或 `OPENAI_API_KEY`

选填：

- `GITHUB_TOKEN`
- `JINA_API_KEY`
- `API_PORT`

### 3. 启动数据库并迁移

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d
pnpm db:migrate
```

### 4. 同步并准备搜索数据

```bash
npx tsx apps/worker/src/cli.ts sync-bonjour --limit 100
npx tsx apps/worker/src/cli.ts resolve-identities
npx tsx apps/worker/src/cli.ts store-evidence
npx tsx apps/worker/src/cli.ts rebuild-search
```

### 5. 开始搜索

```bash
# 交互模式
npx tsx apps/worker/src/cli.ts

# 带初始查询进入交互模式
npx tsx apps/worker/src/cli.ts "找杭州 AI 工程师"

# 脚本模式
npx tsx apps/worker/src/cli.ts search "杭州 AI" --json --limit 10
```

## CLI 命令速查

### 核心命令

```text
命令                                                     说明
----------------------------------------------------------------------------------------
npx tsx apps/worker/src/cli.ts                           启动交互式搜索
npx tsx apps/worker/src/cli.ts "query"                   带初始需求进入交互式搜索
npx tsx apps/worker/src/cli.ts search "query" --json     以 JSON 输出脚本搜索结果
npx tsx apps/worker/src/cli.ts show <person-id>          查看指定候选人的画像
npx tsx apps/worker/src/cli.ts help                      查看帮助
npx tsx apps/worker/src/cli.ts version                   查看版本
```

### 数据流水线命令

```text
命令                                                                  说明
----------------------------------------------------------------------------------------------------------------
npx tsx apps/worker/src/cli.ts sync-bonjour --limit 100               同步 Bonjour 数据
npx tsx apps/worker/src/cli.ts sync-github --handles foo,bar          同步 GitHub 数据
npx tsx apps/worker/src/cli.ts resolve-identities                     身份归并
npx tsx apps/worker/src/cli.ts store-evidence                         抽取并写入证据
npx tsx apps/worker/src/cli.ts backfill-person-fields                 回填人物字段
npx tsx apps/worker/src/cli.ts repair-source-payloads --source bonjour 修复源数据 payload
npx tsx apps/worker/src/cli.ts search-index                           重建搜索文档
npx tsx apps/worker/src/cli.ts search-embeddings                      重建向量嵌入
npx tsx apps/worker/src/cli.ts rebuild-search                         一次性重建搜索链路
```

### 深度增强命令

```text
命令                                                          说明
------------------------------------------------------------------------------------------------
npx tsx apps/worker/src/cli.ts enrich-profiles --limit 50     抓取外部站点并生成摘要
npx tsx apps/worker/src/cli.ts mine-network --limit 10        通过 GitHub 网络发现更多候选人
```

## 交互式 CLI 指南

### 键盘导航

```text
按键       动作
-----------------------------
Up / Down  移动选中项
Enter      查看候选人详情
o          打开 Bonjour 页面
Space      加入对比池
c          进入对比工作台
: 或 /     进入命令模式
q          退出
```

### 会话内命令

```text
命令                说明
-----------------------------------------------------------
sort fresh          按新鲜度排序
sort source         按来源优先级排序
sort evidence       按证据强度排序
export md           导出 shortlist 为 Markdown
export csv          导出 shortlist 为 CSV
export json         导出 shortlist 为 JSON
export pool md      导出对比池
history             查看搜索历史
undo                回到上一轮搜索条件
show                查看当前筛选条件
r 去掉销售          通过自然语言 refine
r 像 2 号但更偏后端 基于候选人锚点继续 refine
```

## 已知限制

- 搜索效果依赖已经同步和索引的数据质量。
- 当前以 Bonjour 为主数据源，其他来源覆盖可能不均衡。
- 部分上游 API 是非公开或不稳定接口，存在变动风险。
- 新鲜度取决于同步周期，不提供严格实时保证。
- 目前 CLI 是最完整的产品面，Web 不是主路径。

## 安全性

- 所有密钥通过环境变量注入。
- 查询解析和检索链路已做输入加固。
- 外部源访问通过 adapter 层隔离，并带有限流控制。
- 本地导出结果默认不进入 Git。

## License

仅供内部使用。合规和自托管细节请参考仓库内文档。
