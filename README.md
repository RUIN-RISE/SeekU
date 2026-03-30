# Seeku - AI Talent Search Engine 🔍

[English](#english) | [中文](#chinese)

---

<a name="english"></a>

## English

**Seeku** is a high-precision AI talent search engine designed for founders, engineering leads, and technical recruiters. Unlike traditional keyword-based platforms, Seeku uses **evidence-driven matching** to find top-tier AI researchers and engineers based on what they've actually built.

### 🌟 Key Features
- **Deep Enrichment Hub**: Automatically crawls personal blogs, portfolios, and technical papers to synthesize multi-dimensional candidate profiles.
- **Social Graph Mining**: Recursively discovers top talent by spidering GitHub networks and academic blogrolls.
- **Hybrid Scoring Engine**: Combines rule-based heuristics with LLM-powered context analysis to rank candidates with explainable reasons.
- **Anti-Bot Resilience**: Intelligent crawler with headless fallback (Jina Reader) to bypass platform blocks.

### 🏗️ Architecture
- **Monorepo**: Powered by `pnpm` and `turbo`.
- **Backend**: Node.js / TypeScript.
- **Database**: PostgreSQL with `pgvector` for semantic search.
- **AI Engine**: SiliconFlow (Stepfun-ai / Qwen) for summarization and embeddings.

### 🚀 Quick Start
1. **Clone & Install**:
   ```bash
   git clone https://github.com/RUIN-RISE/SeekU.git
   cd SeekU
   pnpm install
   ```
2. **Environment Setup**:
   Copy `.env.example` to `.env` and fill in your API keys.
3. **Database**:
   ```bash
   pnpm --filter @seeku/db db:migrate
   ```
4. **Launch CLI**:
   ```bash
   npx tsx apps/worker/src/cli.ts
   ```

---

<a name="chinese"></a>

## 中文

**Seeku** 是一款专为创始人、技术主管和猎头打造的高精度 AI 人才搜索引擎。与传统的基于关键词的平台不同，Seeku 采用**证据驱动型匹配**，根据人才真实构建的项目、代码贡献和学术发表来发现顶尖 AI 研究员与工程师。

### 🌟 核心功能
- **深度挖掘中心 (Enrichment Hub)**：自动化抓取个人博客、作品集和技术论文，提炼多维度的候选人画像。
- **社交图谱挖掘 (Social Discovery)**：通过 GitHub 社交网络和学术链接列表，递归式发现隐藏的顶尖人才。
- **混合评分引擎 (Scoring Engine)**：结合启发式规则与 LLM 上下文分析，提供带解释性的候选人排名。
- **抗反扒弹性**：集成 Jina Reader 等无头抓取方案，智能绕过平台封锁。

### 🏗️ 技术架构
- **Monorepo**: 基于 `pnpm` 和 `turbo` 管理。
- **后端**: Node.js / TypeScript。
- **数据库**: PostgreSQL + `pgvector`（支持语义向量搜索）。
- **AI 引擎**: 基于 SiliconFlow (Stepfun-ai / Qwen) 实现总结与 Embedding。

### 🚀 快速开始
1. **安装依赖**:
   ```bash
   pnpm install
   ```
2. **环境配置**:
   复制 `.env.example` 并填入您的 API Key。
3. **数据库迁移**:
   ```bash
   pnpm --filter @seeku/db db:migrate
   ```
4. **启动 CLI**:
   ```bash
   npx tsx apps/worker/src/cli.ts
   ```

---

## 📄 License
This project is for internal use. Refer to the documentation for compliance and self-hosting details.
