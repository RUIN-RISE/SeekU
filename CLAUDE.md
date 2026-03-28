<!-- GSD:project-start source:PROJECT.md -->
## Project

**Seeku**

Seeku is a Chinese AI talent search engine designed for AI Builders, Founders, and Engineers. It enables high-precision talent discovery through evidence-driven matching, replacing LinkedIn-style profile browsing with structured data from Bonjour.bio and GitHub. Users input natural language search queries and receive ranked candidate profiles with verifiable evidence (projects, contributions, publications).

**Core Value:** **Find the right AI talent through what they've done, not what they claim.** Evidence-based matching over profile text matching.

### Constraints

- **Data Source**: Bonjour.bio primary, GitHub secondary — Must design adapter abstraction for source switching
- **API Stability**: Bonjour API undocumented — Design for graceful degradation, cache aggressively, pursue official partnership
- **Compliance**: GDPR-style opt-out required from day one — Not optional feature, must-have infrastructure
- **Tech Stack**: TypeScript monorepo (pnpm + turbo), Postgres 16 + pgvector + pg_trgm — User preference
- **Architecture**: Worker-first (async jobs before API), Adapter-first (source logic isolated), Eval-first (benchmark before UI polish)
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
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
