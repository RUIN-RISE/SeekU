---
phase: 02-github-identity-merge
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - packages/db/src/schema.ts
  - packages/db/src/repositories.ts
  - packages/db/src/migrations/0002_identity_evidence.ts
  - packages/db/src/index.ts
autonomous: true
requirements: [EVID-05]
must_haves:
  truths:
    - "persons table exists with primary_name, confidence_score columns"
    - "person_identities table links persons to source_profiles"
    - "person_aliases table stores external handles"
    - "evidence_items table stores classified evidence with type enum"
    - "Repository functions exist for creating/querying persons and evidence"
  artifacts:
    - path: "packages/db/src/schema.ts"
      provides: "Schema definitions"
      contains: ["persons", "person_identities", "person_aliases", "evidence_items"]
      exports: ["evidenceType", "Person", "PersonIdentity", "PersonAlias", "EvidenceItem"]
    - path: "packages/db/src/repositories.ts"
      provides: "Database operations"
      exports: ["createPerson", "getPersonById", "createPersonIdentity", "createEvidenceItem", "listEvidenceByPersonId"]
  key_links:
    - from: "packages/db/src/repositories.ts"
      to: "packages/db/src/schema.ts"
      via: "table imports"
      pattern: "import.*from.*schema"
    - from: "person_identities"
      to: "source_profiles"
      via: "foreign key"
      pattern: "references.*source_profiles"
---

<objective>
Extend the database schema with persons, person_identities, person_aliases, and evidence_items tables. These tables enable unified person entities linked to source profiles and evidence classification.

Purpose: Store unified person entities and evidence items for identity resolution
Output: Complete schema with repository functions for CRUD operations
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

<interfaces>
<!-- Key types and contracts from existing codebase. -->

From packages/db/src/schema.ts (existing):
```typescript
export const sourceName = pgEnum("source_name", ["bonjour", "github"]);
export const sourceProfiles = pgTable("source_profiles", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  source: sourceName("source").notNull(),
  sourceHandle: text("source_handle").notNull(),
  // ... other fields
});
```

From packages/db/src/repositories.ts (pattern reference):
```typescript
export async function upsertSourceProfile(db: SeekuDatabase, input: UpsertSourceProfileInput) {
  const [profile] = await db
    .insert(sourceProfiles)
    .values(...)
    .onConflictDoUpdate({...})
    .returning();
  return profile;
}
```

From Phase 2 research (01-RESEARCH.md):
```sql
-- Evidence type enum values
'evidence_type' enum: 'social', 'project', 'repository', 'community_post', 'job_signal', 'education', 'experience', 'profile_field'

-- persons table schema
persons: id, primary_name, primary_headline, summary, primary_location, avatar_url, search_status, confidence_score, created_at, updated_at

-- person_identities table schema
person_identities: id, person_id (FK), source_profile_id (FK), match_score, match_reason, is_primary, created_at

-- person_aliases table schema
person_aliases: id, person_id (FK), alias_type, alias_value, source, confidence_score, created_at

-- evidence_items table schema
evidence_items: id, person_id (FK), source_profile_id (FK), source, evidence_type, title, description, url, occurred_at, metadata, evidence_hash, created_at
```
</interfaces>

Reference existing patterns:
@packages/db/src/schema.ts
@packages/db/src/repositories.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add persons, person_identities, person_aliases, evidence_items tables to schema</name>
  <files>packages/db/src/schema.ts</files>
  <read_first>
    - packages/db/src/schema.ts (existing schema patterns)
    - .planning/phases/02-github-identity-merge/01-RESEARCH.md (researched schema design)
  </read_first>
  <action>
Extend `packages/db/src/schema.ts` with new tables following existing patterns:

1. Add `evidenceType` enum:
```typescript
export const evidenceType = pgEnum("evidence_type", [
  "social",
  "project",
  "repository",
  "community_post",
  "job_signal",
  "education",
  "experience",
  "profile_field"
]);
```

2. Add `searchStatus` enum:
```typescript
export const searchStatus = pgEnum("search_status", ["active", "hidden", "claimed"]);
```

3. Add `persons` table:
```typescript
export const persons = pgTable("persons", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  primaryName: text("primary_name").notNull(),
  primaryHeadline: text("primary_headline"),
  summary: text("summary"),
  primaryLocation: text("primary_location"),
  avatarUrl: text("avatar_url"),
  searchStatus: searchStatus("search_status").default("active").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).default("0.0").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
```

4. Add `person_identities` table linking persons to source_profiles:
```typescript
export const person_identities = pgTable("person_identities", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  sourceProfileId: uuid("source_profile_id").notNull().references(() => sourceProfiles.id, { onDelete: "cascade" }),
  matchScore: numeric("match_score", { precision: 5, scale: 4 }).notNull(),
  matchReason: jsonb("match_reason").$type<MatchReason[]>().default(sql`'[]'::jsonb`).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  sourceProfileUnique: unique().on(table.sourceProfileId),
  personSourceUnique: unique().on(table.personId, table.sourceProfileId)
}));
```

5. Add `person_aliases` table:
```typescript
export const person_aliases = pgTable("person_aliases", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  aliasType: text("alias_type").notNull(),
  aliasValue: text("alias_value").notNull(),
  source: text("source").notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }).default("0.0").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  aliasUnique: unique().on(table.aliasType, table.aliasValue, table.personId)
}));
```

6. Add `evidence_items` table:
```typescript
export const evidence_items = pgTable("evidence_items", {
  id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey(),
  personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
  sourceProfileId: uuid("source_profile_id").references(() => sourceProfiles.id, { onDelete: "set null" }),
  source: sourceName("source").notNull(),
  evidenceType: evidenceType("evidence_type").notNull(),
  title: text("title"),
  description: text("description"),
  url: text("url"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  evidenceHash: text("evidence_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  evidenceUnique: unique().on(table.personId, table.source, table.evidenceHash)
}));
```

7. Add MatchReason type:
```typescript
export interface MatchReason {
  signal: string;
  confidence: number;
}
```

8. Add type exports at bottom:
```typescript
export type EvidenceType = typeof evidenceType.enumValues[number];
export type SearchStatus = typeof searchStatus.enumValues[number];
export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;
export type PersonIdentity = typeof person_identities.$inferSelect;
export type NewPersonIdentity = typeof person_identities.$inferInsert;
export type PersonAlias = typeof person_aliases.$inferSelect;
export type NewPersonAlias = typeof person_aliases.$inferInsert;
export type EvidenceItem = typeof evidence_items.$inferSelect;
export type NewEvidenceItem = typeof evidence_items.$inferInsert;
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/db</automated>
  </verify>
  <done>
    - evidenceType enum exists with 8 values
    - persons table exists with all required columns
    - person_identities table has foreign keys to persons and source_profiles
    - person_aliases table has foreign key to persons with unique constraint
    - evidence_items table has foreign keys and unique constraint
    - Type exports added for all new tables
    - TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Task 2: Add repository functions for persons and evidence</name>
  <files>packages/db/src/repositories.ts</files>
  <read_first>
    - packages/db/src/schema.ts (new table definitions)
    - packages/db/src/repositories.ts (existing repository patterns)
  </read_first>
  <action>
Extend `packages/db/src/repositories.ts` with CRUD functions for persons and evidence:

1. Add imports for new tables:
```typescript
import {
  persons,
  person_identities,
  person_aliases,
  evidence_items,
  type Person,
  type NewPerson,
  type PersonIdentity,
  type NewPersonIdentity,
  type PersonAlias,
  type NewPersonAlias,
  type EvidenceItem,
  type NewEvidenceItem,
  type EvidenceType
} from "./schema.js";
```

2. Add person repository functions:
```typescript
export interface CreatePersonInput {
  primaryName: string;
  primaryHeadline?: string;
  summary?: string;
  primaryLocation?: string;
  avatarUrl?: string;
  confidenceScore?: number;
}

export async function createPerson(db: SeekuDatabase, input: CreatePersonInput) {
  const [person] = await db.insert(persons).values({
    primaryName: input.primaryName,
    primaryHeadline: input.primaryHeadline,
    summary: input.summary,
    primaryLocation: input.primaryLocation,
    avatarUrl: input.avatarUrl,
    confidenceScore: input.confidenceScore ?? 0
  }).returning();
  return person;
}

export async function getPersonById(db: SeekuDatabase, personId: string) {
  const [person] = await db.select().from(persons).where(eq(persons.id, personId)).limit(1);
  return person ?? null;
}

export async function updatePersonConfidence(db: SeekuDatabase, personId: string, score: number) {
  const [person] = await db.update(persons)
    .set({ confidenceScore: score, updatedAt: sql`now()` })
    .where(eq(persons.id, personId))
    .returning();
  return person;
}

export async function listAllPersons(db: SeekuDatabase, limit = 100) {
  return db.select().from(persons).limit(limit);
}
```

3. Add person_identity repository functions:
```typescript
export interface CreatePersonIdentityInput {
  personId: string;
  sourceProfileId: string;
  matchScore: number;
  matchReason: MatchReason[];
  isPrimary?: boolean;
}

export async function createPersonIdentity(db: SeekuDatabase, input: CreatePersonIdentityInput) {
  const [identity] = await db.insert(person_identities).values({
    personId: input.personId,
    sourceProfileId: input.sourceProfileId,
    matchScore: input.matchScore,
    matchReason: input.matchReason,
    isPrimary: input.isPrimary ?? false
  }).onConflictDoUpdate({
    target: [person_identities.sourceProfileId],
    set: {
      personId: input.personId,
      matchScore: input.matchScore,
      matchReason: input.matchReason,
      isPrimary: input.isPrimary ?? false
    }
  }).returning();
  return identity;
}

export async function listIdentitiesByPersonId(db: SeekuDatabase, personId: string) {
  return db.select().from(person_identities).where(eq(person_identities.personId, personId));
}

export async function getIdentityBySourceProfileId(db: SeekuDatabase, sourceProfileId: string) {
  const [identity] = await db.select().from(person_identities)
    .where(eq(person_identities.sourceProfileId, sourceProfileId)).limit(1);
  return identity ?? null;
}
```

4. Add person_alias repository functions:
```typescript
export interface CreatePersonAliasInput {
  personId: string;
  aliasType: string;
  aliasValue: string;
  source: string;
  confidenceScore?: number;
}

export async function createPersonAlias(db: SeekuDatabase, input: CreatePersonAliasInput) {
  const [alias] = await db.insert(person_aliases).values({
    personId: input.personId,
    aliasType: input.aliasType,
    aliasValue: input.aliasValue,
    source: input.source,
    confidenceScore: input.confidenceScore ?? 0
  }).onConflictDoNothing().returning();
  return alias ?? null;
}

export async function listAliasesByPersonId(db: SeekuDatabase, personId: string) {
  return db.select().from(person_aliases).where(eq(person_aliases.personId, personId));
}

export async function findPersonByAlias(db: SeekuDatabase, aliasType: string, aliasValue: string) {
  const [alias] = await db.select().from(person_aliases)
    .where(and(eq(person_aliases.aliasType, aliasType), eq(person_aliases.aliasValue, aliasValue)))
    .limit(1);
  if (!alias) return null;
  return getPersonById(db, alias.personId);
}
```

5. Add evidence repository functions:
```typescript
export interface CreateEvidenceItemInput {
  personId: string;
  sourceProfileId?: string;
  source: SourceName;
  evidenceType: EvidenceType;
  title?: string;
  description?: string;
  url?: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
  evidenceHash: string;
}

export async function createEvidenceItem(db: SeekuDatabase, input: CreateEvidenceItemInput) {
  const [item] = await db.insert(evidence_items).values({
    personId: input.personId,
    sourceProfileId: input.sourceProfileId ?? null,
    source: input.source,
    evidenceType: input.evidenceType,
    title: input.title,
    description: input.description,
    url: input.url,
    occurredAt: input.occurredAt,
    metadata: input.metadata ?? {},
    evidenceHash: input.evidenceHash
  }).onConflictDoNothing().returning();
  return item ?? null;
}

export async function listEvidenceByPersonId(db: SeekuDatabase, personId: string) {
  return db.select().from(evidence_items).where(eq(evidence_items.personId, personId));
}

export async function listEvidenceByType(db: SeekuDatabase, personId: string, evidenceType: EvidenceType) {
  return db.select().from(evidence_items)
    .where(and(eq(evidence_items.personId, personId), eq(evidence_items.evidenceType, evidenceType)));
}

export async function countEvidenceByPersonId(db: SeekuDatabase, personId: string) {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(evidence_items).where(eq(evidence_items.personId, personId));
  return result[0]?.count ?? 0;
}
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/db && pnpm build --filter=@seeku/db</automated>
  </verify>
  <done>
    - createPerson, getPersonById, updatePersonConfidence, listAllPersons functions exist
    - createPersonIdentity, listIdentitiesByPersonId, getIdentityBySourceProfileId functions exist
    - createPersonAlias, listAliasesByPersonId, findPersonByAlias functions exist
    - createEvidenceItem, listEvidenceByPersonId, listEvidenceByType, countEvidenceByPersonId functions exist
    - TypeScript compilation succeeds
    - Build succeeds
  </done>
</task>

<task type="auto">
  <name>Task 3: Create migration metadata for identity and evidence tables</name>
  <files>packages/db/src/migrations/0002_identity_evidence.ts, packages/db/src/index.ts</files>
  <read_first>
    - packages/db/src/migrations/0001_initial_schema.ts (migration pattern)
    - packages/db/src/index.ts (migration registry)
    - packages/db/src/schema.ts (new table definitions)
  </read_first>
  <action>
Create migration metadata following Phase 1 pattern:

1. Create `packages/db/src/migrations/0002_identity_evidence.ts`:
```typescript
import type { Migration } from "../index.js";

export const migration: Migration = {
  id: "0002_identity_evidence",
  name: "identity_evidence",
  description: "Add persons, person_identities, person_aliases, and evidence_items tables for identity resolution and evidence storage",
  createdAt: new Date().toISOString(),
  sql: `
    -- Evidence type enum
    CREATE TYPE evidence_type AS ENUM (
      'social', 'project', 'repository', 'community_post',
      'job_signal', 'education', 'experience', 'profile_field'
    );

    -- Search status enum
    CREATE TYPE search_status AS ENUM ('active', 'hidden', 'claimed');

    -- Persons table
    CREATE TABLE persons (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      primary_name TEXT NOT NULL,
      primary_headline TEXT,
      summary TEXT,
      primary_location TEXT,
      avatar_url TEXT,
      search_status search_status NOT NULL DEFAULT 'active',
      confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0.0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Person identities table
    CREATE TABLE person_identities (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      source_profile_id UUID NOT NULL REFERENCES source_profiles(id) ON DELETE CASCADE,
      match_score NUMERIC(5,4) NOT NULL,
      match_reason JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source_profile_id),
      UNIQUE (person_id, source_profile_id)
    );

    -- Person aliases table
    CREATE TABLE person_aliases (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      alias_type TEXT NOT NULL,
      alias_value TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0.0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (alias_type, alias_value, person_id)
    );

    -- Evidence items table
    CREATE TABLE evidence_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      source_profile_id UUID REFERENCES source_profiles(id) ON DELETE SET NULL,
      source source_name NOT NULL,
      evidence_type evidence_type NOT NULL,
      title TEXT,
      description TEXT,
      url TEXT,
      occurred_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      evidence_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (person_id, source, evidence_hash)
    );

    -- Indexes for common queries
    CREATE INDEX idx_person_identities_person ON person_identities(person_id);
    CREATE INDEX idx_person_aliases_lookup ON person_aliases(alias_type, alias_value);
    CREATE INDEX idx_evidence_items_person ON evidence_items(person_id);
    CREATE INDEX idx_evidence_items_type ON evidence_items(person_id, evidence_type);
  `
};
```

2. Update `packages/db/src/index.ts` to register the migration:
```typescript
// Add to migrations array
import { migration as migration0002 } from "./migrations/0002_identity_evidence.js";

export const migrations = [migration0001, migration0002];
```

3. Ensure exports include new types:
```typescript
export * from "./schema.js";
export * from "./repositories.js";
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/db && pnpm build --filter=@seeku/db</automated>
  </verify>
  <done>
    - Migration file exists with SQL for all new tables
    - Migration registered in index.ts
    - Indexes created for common queries
    - TypeScript compilation succeeds
    - Build succeeds
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/db
2. Build passes for @seeku/db
3. Schema contains all required tables and enums
4. Repository functions exist for CRUD operations
5. Migration metadata created
</verification>

<success_criteria>
1. persons table exists with primary_name, confidence_score, search_status columns
2. person_identities table links persons to source_profiles via foreign keys
3. person_aliases table stores external handles with unique constraint
4. evidence_items table stores classified evidence with evidence_type enum
5. Repository functions exist for creating/querying persons and evidence (EVID-05 complete)
6. All packages compile and build successfully
</success_criteria>

<output>
After completion, create `.planning/phases/02-github-identity-merge/02-SUMMARY.md`
</output>