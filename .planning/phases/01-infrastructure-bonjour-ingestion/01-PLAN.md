---
phase: 01-infrastructure-bonjour-ingestion
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - pnpm-workspace.yaml
  - turbo.json
  - tsconfig.json
  - tsconfig.base.json
  - packages/shared/package.json
  - packages/shared/tsconfig.json
  - packages/db/package.json
  - packages/db/tsconfig.json
  - infra/docker-compose.yml
  - packages/db/src/schema.ts
  - packages/db/src/index.ts
  - packages/db/src/migrations/0001_initial_schema.ts
  - drizzle.config.ts
autonomous: true
requirements:
  - DATA-01
  - DATA-02
  - DATA-04
  - COMP-01
  - COMP-02
must_haves:
  truths:
    - "Monorepo structure exists with pnpm workspace configuration"
    - "Docker Compose runs Postgres 16 with pgvector and pg_trgm extensions"
    - "Database schema migrations apply successfully"
    - "TypeScript compiles without errors across all packages"
  artifacts:
    - path: "pnpm-workspace.yaml"
      provides: "Monorepo package discovery"
      contains: "packages:"
    - path: "turbo.json"
      provides: "Build orchestration"
      contains: "pipeline"
    - path: "infra/docker-compose.yml"
      provides: "Database container configuration"
      contains: "postgres"
    - path: "packages/db/src/schema.ts"
      provides: "Database table definitions"
      contains: "source_profiles"
      min_lines: 50
  key_links:
    - from: "packages/db/src/schema.ts"
      to: "Postgres database"
      via: "Drizzle ORM"
      pattern: "pgTable"
---

<objective>
Establish the monorepo foundation with pnpm workspace, Turbo build orchestration, TypeScript configuration, and database infrastructure with schema migrations for Phase 1 data structures.

Purpose: Create the structural foundation that all subsequent packages and apps depend on. Without this, no adapter, worker, or API can function.
Output: A runnable monorepo with database container and migrated schema.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-infrastructure-bonjour-ingestion/01-RESEARCH.md
</context>

<interfaces>
<!-- Database schema contracts that downstream plans will implement against -->

From RESEARCH.md, the following schema must be created:

```typescript
// Enum types
type SourceName = 'bonjour' | 'github';
type SyncStatus = 'running' | 'succeeded' | 'failed' | 'partial';

// Tables to define
source_sync_runs: id, source, job_name, status, started_at, finished_at, cursor, stats, error_message
source_profiles: id, source, source_profile_id, source_handle, canonical_url, display_name, headline, bio, location_text, avatar_url, raw_payload, normalized_payload, profile_hash, first_seen_at, last_seen_at, last_synced_at, last_sync_run_id, is_deleted
opt_out_requests: id, source, source_handle, requester_contact, reason, status, created_at, resolved_at
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Initialize monorepo structure</name>
  <files>package.json, pnpm-workspace.yaml, turbo.json, tsconfig.json, tsconfig.base.json, packages/shared/package.json, packages/shared/tsconfig.json, packages/db/package.json, packages/db/tsconfig.json</files>
  <read_first>
    - .planning/phases/01-infrastructure-bonjour-ingestion/01-RESEARCH.md (for package structure reference)
  </read_first>
  <behavior>
    - Test 1: `pnpm install` completes without errors
    - Test 2: `pnpm turbo build` runs (may be no-op) without errors
    - Test 3: TypeScript compiles with `pnpm tsc --noEmit` in each package
  </behavior>
  <action>
    Create the monorepo foundation with pnpm workspace and Turbo build orchestration:

    1. Create root package.json with name "seeku", private: true, and devDependencies for typescript@^5.4.0, turbo@^2.0.0, @types/node@^20.0.0

    2. Create pnpm-workspace.yaml with packages: ["packages/*", "apps/*"]

    3. Create turbo.json with pipeline:
       - build: depends on ^build for workspace deps
       - lint: depends on ^lint
       - typecheck: depends on ^typecheck
       - db:generate: cache for drizzle migrations
       - db:push: no cache for schema push

    4. Create tsconfig.base.json with:
       - compilerOptions: target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, esModuleInterop: true, skipLibCheck: true, declaration: true, declarationMap: true, sourceMap: true
       - Include paths for @seeku/shared and @seeku/db aliases

    5. Create root tsconfig.json that extends tsconfig.base.json with references to packages

    6. Create packages/shared/package.json with name "@seeku/shared", version "0.0.1", main: "dist/index.js", types: "dist/index.d.ts", scripts: build/lint/typecheck

    7. Create packages/shared/tsconfig.json extending root config

    8. Create packages/db/package.json with name "@seeku/db", version "0.0.1", main: "dist/index.js", types: "dist/index.d.ts", dependencies: drizzle-orm@^0.30.0, postgres.js (or pg), devDependencies: drizzle-kit@^0.21.0

    9. Create packages/db/tsconfig.json extending root config

    Initialize empty src/index.ts in each package as placeholder.

    Run `pnpm install` to verify workspace configuration.
  </action>
  <verify>
    <automated>pnpm install && pnpm turbo typecheck 2>&1 | grep -v "error" || echo "SUCCESS: No errors"</automated>
  </verify>
  <done>
    - pnpm install completes successfully
    - turbo.json has valid pipeline configuration
    - TypeScript compiles without errors in root and all packages
    - Workspace packages are resolvable (pnpm ls shows @seeku/shared, @seeku/db)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Setup Docker Compose with Postgres</name>
  <files>infra/docker-compose.yml, .env.example</files>
  <read_first>
    - .planning/phases/01-infrastructure-bonjour-ingestion/01-RESEARCH.md (for database requirements)
  </read_first>
  <behavior>
    - Test 1: docker compose up -d starts container without errors
    - Test 2: psql connection succeeds with credentials from .env
    - Test 3: Extensions pgvector and pg_trgm are installed
  </behavior>
  <action>
    Create Docker Compose configuration for Postgres 16 with required extensions:

    1. Create infra/docker-compose.yml with:
       - Service: postgres (image: postgres:16-alpine)
       - Port: 5432:5432
       - Environment: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB from .env
       - Volume: postgres_data for persistence
       - Healthcheck: pg_isready -U $POSTGRES_USER

    2. Create .env.example with:
       - DATABASE_URL=postgres://seeku:seeku_dev_password@localhost:5432/seeku
       - POSTGRES_USER=seeku
       - POSTGRES_PASSWORD=seeku_dev_password
       - POSTGRES_DB=seeku

    3. Create .env by copying .env.example (if not exists)

    4. Add Docker Compose commands to root package.json scripts:
       - db:up: docker compose -f infra/docker-compose.yml up -d
       - db:down: docker compose -f infra/docker-compose.yml down
       - db:logs: docker compose -f infra/docker-compose.yml logs -f

    The database will have pgvector and pg_trgm extensions enabled via migration (next task).
  </action>
  <verify>
    <automated>docker compose -f infra/docker-compose.yml up -d && sleep 3 && docker compose -f infra/docker-compose.yml ps | grep "healthy\|running" && docker compose -f infra/docker-compose.yml down</automated>
  </verify>
  <done>
    - Docker Compose file exists in infra/
    - Running `docker compose up -d` starts a healthy Postgres container
    - .env.example provides template for database configuration
    - Database is accessible at DATABASE_URL from .env
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create database schema and migrations</name>
  <files>packages/db/src/schema.ts, packages/db/src/index.ts, packages/db/src/migrations/0001_initial_schema.ts, drizzle.config.ts</files>
  <read_first>
    - .planning/phases/01-infrastructure-bonjour-ingestion/01-RESEARCH.md (for exact schema definitions)
    - packages/db/package.json (to verify drizzle dependencies)
  </read_first>
  <behavior>
    - Test 1: drizzle-kit push applies schema without errors
    - Test 2: Tables exist in database: source_sync_runs, source_profiles, opt_out_requests
    - Test 3: Extensions are installed: uuid-ossp, vector, pg_trgm
    - Test 4: Unique constraints exist on source_profiles: (source, source_handle), (source, source_profile_id)
  </behavior>
  <action>
    Create Drizzle schema and initial migration for Phase 1 tables:

    1. Create drizzle.config.ts at project root:
       - schema: "./packages/db/src/schema.ts"
       - out: "./packages/db/src/migrations"
       - driver: "pg"
       - dbCredentials from DATABASE_URL env var

    2. Create packages/db/src/schema.ts with:

       Import drizzle-orm/pg-core and define:

       ```typescript
       // Extensions (run as raw SQL in migration)
       // create extension if not exists "uuid-ossp";
       // create extension if not exists vector;
       // create extension if not exists pg_trgm;

       // Enums
       export const sourceName = pgEnum('source_name', ['bonjour', 'github']);
       export const syncStatus = pgEnum('sync_status', ['running', 'succeeded', 'failed', 'partial']);

       // source_sync_runs table
       export const sourceSyncRuns = pgTable('source_sync_runs', {
         id: uuid('id').defaultRandom().primaryKey(),
         source: sourceName('source').notNull(),
         jobName: text('job_name').notNull(),
         status: syncStatus('status').default('running').notNull(),
         startedAt: timestamp('started_at').defaultNow().notNull(),
         finishedAt: timestamp('finished_at'),
         cursor: jsonb('cursor'),
         stats: jsonb('stats').default({}).notNull(),
         errorMessage: text('error_message'),
       });

       // source_profiles table
       export const sourceProfiles = pgTable('source_profiles', {
         id: uuid('id').defaultRandom().primaryKey(),
         source: sourceName('source').notNull(),
         sourceProfileId: text('source_profile_id'),
         sourceHandle: text('source_handle').notNull(),
         canonicalUrl: text('canonical_url').notNull(),
         displayName: text('display_name'),
         headline: text('headline'),
         bio: text('bio'),
         locationText: text('location_text'),
         avatarUrl: text('avatar_url'),
         rawPayload: jsonb('raw_payload').notNull(),
         normalizedPayload: jsonb('normalized_payload').notNull(),
         profileHash: text('profile_hash').notNull(),
         firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
         lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
         lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
         lastSyncRunId: uuid('last_sync_run_id').references(() => sourceSyncRuns.id),
         isDeleted: boolean('is_deleted').default(false).notNull(),
       }, (table) => ({
         sourceHandleUnique: unique().on(table.source, table.sourceHandle),
         sourceProfileIdUnique: unique().on(table.source, table.sourceProfileId),
       }));

       // opt_out_requests table
       export const optOutRequests = pgTable('opt_out_requests', {
         id: uuid('id').defaultRandom().primaryKey(),
         source: sourceName('source'),
         sourceHandle: text('source_handle'),
         requesterContact: text('requester_contact').notNull(),
         reason: text('reason'),
         status: text('status').default('pending').notNull(),
         createdAt: timestamp('created_at').defaultNow().notNull(),
         resolvedAt: timestamp('resolved_at'),
       });
       ```

    3. Create packages/db/src/index.ts that exports all schema and provides db connection helper:
       - Export all table definitions
       - Export drizzle function for creating connections
       - Export type helpers

    4. Create packages/db/src/migrations/meta folder structure for Drizzle

    5. Add scripts to packages/db/package.json:
       - db:generate: drizzle-kit generate
       - db:push: drizzle-kit push
       - db:migrate: drizzle-kit migrate

    6. Run db:push to apply schema to database (requires docker compose up)
  </action>
  <verify>
    <automated>docker compose -f infra/docker-compose.yml up -d && sleep 5 && cd /Users/rosscai/seeku && pnpm --filter @seeku/db db:push && psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';" 2>&1 | grep -E "source_sync_runs|source_profiles|opt_out_requests" && psql "$DATABASE_URL" -c "SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'vector', 'pg_trgm');" 2>&1 | grep -E "uuid-ossp|vector|pg_trgm"</automated>
  </verify>
  <done>
    - Schema file exists with all three tables defined
    - drizzle-kit push succeeds without errors
    - Tables exist in database: source_sync_runs, source_profiles, opt_out_requests
    - Extensions installed: uuid-ossp, vector, pg_trgm
    - Unique constraints exist on source_profiles for (source, source_handle) and (source, source_profile_id)
    - packages/db exports all schema types
  </done>
</task>

</tasks>

<verification>
1. Run `pnpm install` - should complete without errors
2. Run `docker compose -f infra/docker-compose.yml up -d` - Postgres container starts healthy
3. Run `pnpm --filter @seeku/db db:push` - schema applies successfully
4. Connect to database and verify tables exist with correct columns
5. Run `pnpm turbo typecheck` - TypeScript compiles cleanly
</verification>

<success_criteria>
- Monorepo structure with pnpm workspace and Turbo orchestration
- Docker Compose runs Postgres 16 with pgvector and pg_trgm extensions
- Database schema applied: source_sync_runs, source_profiles, opt_out_requests tables
- TypeScript compiles without errors across all packages
- All tables have correct columns, types, and constraints per RESEARCH.md schema
</success_criteria>

<output>
After completion, create `.planning/phases/01-infrastructure-bonjour-ingestion/01-SUMMARY.md`
</output>