# Phase 1: Infrastructure & Bonjour Ingestion - Research

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Source:** Codex technical investigation

---

## Phase Boundary

This phase delivers:
- Project infrastructure (monorepo setup, database schema)
- Bonjour.bio profile ingestion via public JSON API
- Profile discovery via Bonjour category/community endpoints
- Raw profile normalization to `NormalizedProfile` schema
- Compliance opt-out mechanism foundation

---

## Technical Research

### Bonjour.bio API Endpoints

| Endpoint | Purpose | Returns |
|----------|---------|---------|
| `GET /profile/{link}` | Fetch profile by handle or profile_link | Full profile JSON |
| `GET /user/category` | List categories for discovery | Category list with keys |
| `GET /user/community?type=profile_link&profile_link={link}&limit={n}&skip={m}` | Paginated community posts | Posts with embedded profiles |
| `tools.bonjour.bio/link2json?url={url}` | Parse external links | Structured link data |

**Base URL:** `https://fc-mp-b1a9bc8c-0aab-44ca-9af2-2bd604163a78.next.bspapp.com`

**Sample Profile Response Structure:**
```json
{
  "_id": "string",
  "profile_link": "internal stable link",
  "user_link": "public vanity url (e.g., /vincent)",
  "name": "display name",
  "bio": "short headline",
  "description": "full bio",
  "avatar": "avatar URL",
  "socials": [{"type": "github|x|jike|...", "content": "handle or url"}],
  "creations": [{"url": "...", "title": "...", "description": "..."}],
  "gridItems": [],
  "basicInfo": {
    "region": {"countryName": "...", "provinceName": "...", "cityName": "..."},
    "current_doing": "...",
    "role": "...",
    "skill": "..."
  },
  "update_time": "timestamp"
}
```

### Database Schema (Core Tables for Phase 1)

```sql
-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists vector;
create extension if not exists pg_trgm;

-- Enums
create type source_name as enum ('bonjour', 'github');
create type sync_status as enum ('running', 'succeeded', 'failed', 'partial');

-- Sync runs (track ingestion jobs)
create table source_sync_runs (
  id uuid primary key default uuid_generate_v4(),
  source source_name not null,
  job_name text not null,
  status sync_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cursor jsonb,
  stats jsonb not null default '{}'::jsonb,
  error_message text
);

-- Raw source profiles
create table source_profiles (
  id uuid primary key default uuid_generate_v4(),
  source source_name not null,
  source_profile_id text,
  source_handle text not null,
  canonical_url text not null,
  display_name text,
  headline text,
  bio text,
  location_text text,
  avatar_url text,
  raw_payload jsonb not null,
  normalized_payload jsonb not null,
  profile_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  last_sync_run_id uuid references source_sync_runs(id),
  is_deleted boolean not null default false,
  unique (source, source_handle),
  unique (source, source_profile_id)
);

-- Opt-out requests
create table opt_out_requests (
  id uuid primary key default uuid_generate_v4(),
  source source_name,
  source_handle text,
  requester_contact text not null,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
```

### Adapter Interface Design

```typescript
// packages/adapters/src/types.ts
export interface NormalizedProfile {
  source: 'bonjour' | 'github';
  sourceProfileId?: string;
  sourceHandle: string;
  canonicalUrl: string;
  displayName?: string;
  headline?: string;
  bio?: string;
  summary?: string;
  avatarUrl?: string;
  locationText?: string;
  aliases: Array<{
    type: 'github' | 'x' | 'jike' | 'website' | 'other';
    value: string;
    confidence: number;
  }>;
  rawMetadata: Record<string, unknown>;
}

export interface SourceAdapter<T = unknown> {
  readonly source: string;
  discoverSeeds(input: { cursor?: Record<string, unknown>; limit: number }): Promise<...>;
  fetchProfileByHandle(input: { handle: string }): Promise<...>;
  normalizeProfile(input: { rawProfile: T }): Promise<NormalizedProfile>;
}
```

### Package Structure for Phase 1

```
seeku/
├─ packages/
│  ├─ shared/          # Types, zod schemas, utils
│  ├─ config/          # Env, logger, feature flags
│  ├─ db/              # Schema, migrations, queries
│  └─ adapters/
│     └─ bonjour/      # Bonjour adapter implementation
├─ apps/
│  └─ worker/          # Sync jobs
├─ infra/
│  └─ docker-compose.yml
└─ scripts/
   └─ sync-bonjour.ts
```

---

## Key Decisions

| Decision | Rationale | Phase |
|----------|-----------|-------|
| Bonjour API base URL via Next.js BSP app | Discovered working endpoint | Phase 1 |
| No public rate-limit docs | Treat as unstable dependency, cache aggressively | Phase 1 |
| Postgres + pgvector from day one | Future-proof for semantic search | Phase 1 |
| Adapter isolation pattern | Allow source switching without core logic changes | Phase 1 |
| Pre-built index over real-time crawl | Better UX, lower compliance risk | Phase 1 |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bonjour API changes without notice | Medium | High | Adapter isolation, aggressive caching, official partnership pursuit |
| No rate limiting documentation | High | Medium | Conservative request pacing, exponential backoff |
| Profile data quality inconsistent | Medium | Medium | Normalization layer, validation at ingest |

---

## Dependencies

- Node.js 20+
- pnpm 9+
- Docker (for Postgres with pgvector)
- No external API keys required for Bonjour (public API)

---

## Recommended Build Order

1. **Monorepo setup** — pnpm workspace, turbo config, TypeScript base
2. **Database setup** — Docker compose, schema migrations, Drizzle/Kysely
3. **Shared types** — NormalizedProfile, adapter interfaces
4. **Bonjour adapter** — HTTP client, normalize function, seed discovery
5. **Worker app** — Sync job orchestration, persistence
6. **Opt-out table** — Foundation for compliance

---

*Research completed 2026-03-28 via Codex technical investigation*