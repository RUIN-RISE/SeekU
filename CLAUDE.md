<!-- GSD:project-start source:PROJECT.md -->
## Project

**Seeku**

Seeku is an evidence-driven AI talent search engine. The currently shipped primary surface is a CLI-first search agent that can clarify a hiring goal, search candidates, narrow a shortlist, compare 2-3 people, and only recommend when evidence and confidence are strong enough.

**Core Value:** **Find the right AI talent through what they've done, not what they claim.** Evidence-based matching over profile text matching.

### Current Status

- Latest shipped milestone: `v1.2 Agentic Search CLI`
- Repo state: between milestones
- Primary planning anchors:
  - `.planning/STATE.md`
  - `.planning/PROJECT.md`
  - `.planning/ROADMAP.md`
  - `.planning/REQUIREMENTS.md`
- Active product docs:
  - `docs/product/CLI_AGENT_EVAL_HARNESS_2026-04-16.md`
  - `docs/superpowers/specs/2026-04-16-cli-search-agent-design.md`

### Constraints

- **Data Source**: Bonjour.bio primary, GitHub secondary — Must design adapter abstraction for source switching
- **API Stability**: Bonjour API undocumented — Design for graceful degradation, cache aggressively, pursue official partnership
- **Compliance**: GDPR-style opt-out required from day one — Not optional feature, must-have infrastructure
- **Tech Stack**: TypeScript monorepo (pnpm + turbo), Postgres 16 + pgvector + pg_trgm — User preference
- **Architecture**: Worker-first (async jobs before API), Adapter-first (source logic isolated), Eval-first (benchmark before UI polish)

### Environment Requirements

- **PostgreSQL with pgvector**: Required for vector similarity search (search_embeddings table)
- **Default Docker**: `infra/docker-compose.yml` uses `pgvector/pgvector:pg16` image
- **Vector Dimensions**: 4096 (Qwen3-Embedding-8B) — No ANN index (HNSW limit is 2000), uses sequential scan for MVP
- **LLM Provider**: SiliconFlow API (OpenAI SDK compatible)
  - Chat: `stepfun-ai/Step-3.5-Flash`
  - Embedding: `Qwen/Qwen3-Embedding-8B`
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `$gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `$gsd-debug` for investigation and bug fixing
- `$gsd-execute-phase` for planned phase work
- `$gsd-new-milestone` when the repo is between milestones and new product work is about to start

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
