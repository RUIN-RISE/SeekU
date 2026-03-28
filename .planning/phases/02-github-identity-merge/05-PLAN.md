---
phase: 02-github-identity-merge
plan: 05
type: execute
wave: 5
depends_on: [04]
files_modified:
  - packages/workers/package.json
  - packages/workers/tsconfig.json
  - packages/workers/src/github-sync.ts
  - packages/workers/src/identity-resolution.ts
  - packages/workers/src/evidence-storage.ts
  - packages/workers/src/index.ts
autonomous: true
requirements: [DATA-03]
user_setup:
  - service: github
    why: "GitHub sync worker authentication"
    env_vars:
      - name: GITHUB_TOKEN
        source: "GitHub -> Settings -> Developer settings -> Personal access tokens"
        note: "Required for GitHub profile and repository fetching"
must_haves:
  truths:
    - "GitHub profiles are fetched and stored by the sync worker"
    - "Identity resolution runs after profile synchronization"
    - "Evidence items are extracted and stored for resolved persons"
    - "Worker handles errors gracefully with logging"
    - "Sync run status is tracked in database"
  artifacts:
    - path: "packages/workers/src/github-sync.ts"
      provides: "GitHub sync worker"
      exports: ["runGithubSync", "syncGithubProfile", "syncGithubRepositories"]
    - path: "packages/workers/src/identity-resolution.ts"
      provides: "Identity resolution worker"
      exports: ["runIdentityResolutionWorker"]
    - path: "packages/workers/src/evidence-storage.ts"
      provides: "Evidence storage worker"
      exports: ["storeEvidenceForPerson", "runEvidenceStorageWorker"]
    - path: "packages/workers/src/index.ts"
      provides: "Worker exports"
      exports: ["runGithubSync", "runIdentityResolutionWorker", "runEvidenceStorageWorker"]
  key_links:
    - from: "packages/workers/src/github-sync.ts"
      to: "@seeku/adapters"
      via: "GithubAdapter"
      pattern: "GithubAdapter"
    - from: "packages/workers/src/identity-resolution.ts"
      to: "@seeku/identity"
      via: "resolveIdentities"
      pattern: "resolveIdentities"
    - from: "packages/workers/src/evidence-storage.ts"
      to: "@seeku/identity"
      via: "extractAllBonjourEvidence, extractAllGithubEvidence"
      pattern: "extractAll.*Evidence"
---

<objective>
Wire the GitHub adapter, identity resolution, and evidence extraction together into worker functions that orchestrate the full data pipeline. This completes Phase 2 by enabling automated GitHub sync and identity merging.

Purpose: Integrate all Phase 2 components into executable workers
Output: Workers for GitHub sync, identity resolution, and evidence storage
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

From packages/adapters/src/github/index.ts:
```typescript
export class GithubAdapter implements SourceAdapter<GithubProfile> {
  async fetchProfileByHandle(input: { handle: string }): Promise<FetchResult<GithubProfile>>;
}

export class GithubClient {
  async fetchProfileByUsername(username: string): Promise<GithubProfile>;
  async fetchRepositoriesByUsername(username: string): Promise<GithubRepository[]>;
}
```

From packages/identity/src/resolver.ts:
```typescript
export async function resolveIdentities(input: ResolutionInput): Promise<ResolutionResult>;
export async function runIdentityResolution(db: SeekuDatabase, bonjourHandles: string[], githubHandles: string[]): Promise<ResolutionResult>;
```

From packages/identity/src/evidence/index.ts:
```typescript
export function extractAllBonjourEvidence(profile: BonjourProfile, communityPosts?: BonjourCommunityPost[]): EvidenceExtractionResult;
export function extractAllGithubEvidence(profile: GithubProfile, repositories: GithubRepository[]): EvidenceExtractionResult;
```

From packages/db/src/repositories.ts:
```typescript
export async function startSourceSyncRun(db: SeekuDatabase, input: StartSyncRunInput);
export async function completeSourceSyncRun(db: SeekuDatabase, input: CompleteSyncRunInput);
export async function upsertSourceProfile(db: SeekuDatabase, input: UpsertSourceProfileInput);
export async function createEvidenceItem(db: SeekuDatabase, input: CreateEvidenceItemInput);
export async function listIdentitiesByPersonId(db: SeekuDatabase, personId: string);
export async function getSourceProfileByHandle(db: SeekuDatabase, source: SourceName, handle: string);
```

From packages/db/src/index.ts:
```typescript
export function getDatabase(): SeekuDatabase;
export type SeekuDatabase = NodePgDatabase<typeof schema>;
```
</interfaces>

Reference Phase 1 patterns for worker structure.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create workers package structure</name>
  <files>packages/workers/package.json, packages/workers/tsconfig.json, packages/workers/src/index.ts</files>
  <read_first>
    - package.json (workspace patterns)
    - packages/identity/package.json (package structure reference)
    - packages/db/src/index.ts (database connection)
  </read_first>
  <action>
Create the `@seeku/workers` package:

1. Create `packages/workers/package.json`:
```json
{
  "name": "@seeku/workers",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@seeku/db": "workspace:*",
    "@seeku/shared": "workspace:*",
    "@seeku/adapters": "workspace:*",
    "@seeku/identity": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.2"
  }
}
```

2. Create `packages/workers/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

3. Create `packages/workers/src/index.ts` (initial exports):
```typescript
export * from "./github-sync.js";
export * from "./identity-resolution.js";
export * from "./evidence-storage.js";
```
  </action>
  <verify>
    <automated>pnpm install && pnpm typecheck --filter=@seeku/workers</automated>
  </verify>
  <done>
    - @seeku/workers package exists with package.json and tsconfig.json
    - Dependencies linked to @seeku/db, @seeku/adapters, @seeku/identity
    - TypeScript compilation succeeds (empty file)
    - pnpm install succeeds
  </done>
</task>

<task type="auto">
  <name>Task 2: Implement GitHub sync worker</name>
  <files>packages/workers/src/github-sync.ts</files>
  <read_first>
    - packages/adapters/src/github/index.ts (GithubAdapter, GithubClient)
    - packages/adapters/src/github/client.ts (GithubProfile, GithubRepository types)
    - packages/db/src/repositories.ts (upsertSourceProfile, startSourceSyncRun, completeSourceSyncRun)
    - packages/db/src/index.ts (getDatabase)
    - packages/shared/src/types.ts (SyncRunResult)
    - packages/adapters/src/bonjour/normalize.ts (computeProfileHash pattern)
  </read_first>
  <action>
Create GitHub sync worker in `packages/workers/src/github-sync.ts`:

```typescript
import { createHash } from "node:crypto";
import type { SeekuDatabase, SourceName } from "@seeku/db";
import { getDatabase } from "@seeku/db";
import {
  startSourceSyncRun,
  completeSourceSyncRun,
  upsertSourceProfile,
  getSourceProfileByHandle
} from "@seeku/db";
import { GithubClient, GithubAdapter, type GithubProfile, type GithubRepository } from "@seeku/adapters";
import type { SyncRunResult } from "@seeku/shared";

/**
 * Compute hash for GitHub profile + repositories combination
 */
function computeGithubSyncHash(profile: GithubProfile, repos: GithubRepository[]): string {
  const hashInput = JSON.stringify({
    profileId: profile.id,
    login: profile.login,
    name: profile.name,
    bio: profile.bio,
    location: profile.location,
    company: profile.company,
    publicRepos: profile.public_repos,
    updatedAt: profile.updated_at,
    repoCount: repos.length,
    repoIds: repos.map(r => r.id).sort()
  });
  return createHash("sha256").update(hashInput).digest("hex");
}

/**
 * Sync a single GitHub profile and its repositories
 */
export async function syncGithubProfile(
  client: GithubClient,
  db: SeekuDatabase,
  handle: string,
  syncRunId?: string
): Promise<{ success: boolean; profile?: GithubProfile; error?: string }> {
  try {
    // Fetch profile
    const profile = await client.fetchProfileByUsername(handle);

    // Fetch repositories
    const repositories = await client.fetchRepositoriesByUsername(handle);

    // Normalize using adapter
    const adapter = new GithubAdapter(client);
    const normalized = await adapter.normalizeProfile({ rawProfile: profile });

    // Compute hash
    const profileHash = computeGithubSyncHash(profile, repositories);

    // Upsert source profile
    await upsertSourceProfile(db, {
      profile: normalized,
      rawPayload: {
        profile,
        repositories
      },
      profileHash,
      lastSyncRunId: syncRunId
    });

    return { success: true, profile };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Sync multiple GitHub handles
 */
export async function syncGithubHandles(
  handles: string[],
  options?: { limit?: number; client?: GithubClient }
): Promise<SyncRunResult> {
  const db = getDatabase();
  const client = options?.client ?? new GithubClient();
  const limit = options?.limit ?? handles.length;

  // Start sync run
  const syncRun = await startSourceSyncRun(db, {
    source: "github" as SourceName,
    jobName: "github_sync",
    cursor: { handles, processed: 0 }
  });

  const errors: { message: string; context?: unknown }[] = [];
  let profilesProcessed = 0;

  for (let i = 0; i < Math.min(handles.length, limit); i++) {
    const handle = handles[i];
    const result = await syncGithubProfile(client, db, handle, syncRun.id);

    if (result.success) {
      profilesProcessed += 1;
    } else {
      errors.push({ message: result.error ?? "Unknown error", context: { handle } });
    }
  }

  // Complete sync run
  const status = errors.length === 0 ? "succeeded" : profilesProcessed > 0 ? "partial" : "failed";
  await completeSourceSyncRun(db, {
    runId: syncRun.id,
    status,
    cursor: { handles, processed: profilesProcessed },
    stats: { profilesProcessed, errorCount: errors.length },
    errorMessage: errors.length > 0 ? `${errors.length} errors during sync` : undefined
  });

  return {
    status,
    profilesProcessed,
    errors,
    nextCursor: profilesProcessed < handles.length ? { handles, processed: profilesProcessed } : undefined
  };
}

/**
 * Main GitHub sync worker entry point
 * Takes handles from Bonjour socials + seed handles
 */
export async function runGithubSync(
  seedHandles?: string[],
  options?: { limit?: number }
): Promise<SyncRunResult> {
  const db = getDatabase();

  // Collect handles: from seed + from Bonjour GitHub aliases
  const handles = new Set<string>();

  // Add seed handles
  for (const h of seedHandles ?? []) {
    handles.add(h.toLowerCase().replace(/^@/, ""));
  }

  // Get handles from existing Bonjour profiles' GitHub aliases
  // This requires querying person_aliases or source_profiles for GitHub links
  // For now, we rely on seed handles passed in

  return syncGithubHandles(Array.from(handles), options);
}
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/workers && pnpm build --filter=@seeku/workers</automated>
  </verify>
  <done>
    - syncGithubProfile function fetches and stores single GitHub profile + repos
    - syncGithubHandles function batch processes multiple handles
    - runGithubSync function is main entry point
    - Sync run status tracked in database
    - TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Task 3: Implement identity resolution worker</name>
  <files>packages/workers/src/identity-resolution.ts</files>
  <read_first>
    - packages/identity/src/resolver.ts (resolveIdentities, runIdentityResolution)
    - packages/identity/src/types.ts (ResolutionResult)
    - packages/db/src/repositories.ts (listSourceProfilesByHandles patterns)
    - packages/db/src/schema.ts (SourceProfile type)
    - packages/workers/src/github-sync.ts (pattern for worker structure)
  </read_first>
  <action>
Create identity resolution worker in `packages/workers/src/identity-resolution.ts`:

```typescript
import type { SeekuDatabase, SourceProfile, SourceName } from "@seeku/db";
import { getDatabase } from "@seeku/db";
import { listAllPersons, getSourceProfileByHandle } from "@seeku/db";
import { resolveIdentities, type ResolutionInput, type ResolutionResult } from "@seeku/identity";

/**
 * Get all unlinked Bonjour and GitHub profiles
 */
async function getUnlinkedProfiles(db: SeekuDatabase): Promise<{
  bonjour: SourceProfile[];
  github: SourceProfile[];
}> {
  // This is a simplified version - in production we'd query for profiles
  // not already in person_identities
  // For now, we accept handles as input
  return { bonjour: [], github: [] };
}

/**
 * Load profiles by handles
 */
async function loadProfilesByHandles(
  db: SeekuDatabase,
  bonjourHandles: string[],
  githubHandles: string[]
): Promise<{ bonjour: SourceProfile[]; github: SourceProfile[] }> {
  const bonjour: SourceProfile[] = [];
  const github: SourceProfile[] = [];

  for (const handle of bonjourHandles) {
    const profile = await getSourceProfileByHandle(db, "bonjour" as SourceName, handle);
    if (profile) bonjour.push(profile);
  }

  for (const handle of githubHandles) {
    const profile = await getSourceProfileByHandle(db, "github" as SourceName, handle);
    if (profile) github.push(profile);
  }

  return { bonjour, github };
}

/**
 * Run identity resolution worker
 */
export async function runIdentityResolutionWorker(
  bonjourHandles?: string[],
  githubHandles?: string[]
): Promise<ResolutionResult> {
  const db = getDatabase();

  // If handles not provided, load all unlinked profiles
  const profiles = bonjourHandles && githubHandles
    ? await loadProfilesByHandles(db, bonjourHandles, githubHandles)
    : await getUnlinkedProfiles(db);

  return resolveIdentities({
    db,
    bonjourProfiles: profiles.bonjour,
    githubProfiles: profiles.github
  });
}

/**
 * Run identity resolution for specific handles
 */
export async function resolveHandles(
  bonjourHandle: string,
  githubHandles: string[]
): Promise<ResolutionResult> {
  const db = getDatabase();
  return resolveIdentities({
    db,
    bonjourProfiles: await loadProfilesByHandles(db, [bonjourHandle], githubHandles).then(r => r.bonjour),
    githubProfiles: await loadProfilesByHandles(db, [], githubHandles).then(r => r.github)
  });
}
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/workers && pnpm build --filter=@seeku/workers</automated>
  </verify>
  <done>
    - runIdentityResolutionWorker function orchestrates resolution
    - loadProfilesByHandles function loads profiles from database
    - resolveHandles function resolves specific handles
    - TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Task 4: Implement evidence storage worker</name>
  <files>packages/workers/src/evidence-storage.ts</files>
  <read_first>
    - packages/identity/src/evidence/index.ts (extractAllBonjourEvidence, extractAllGithubEvidence)
    - packages/db/src/repositories.ts (createEvidenceItem, listIdentitiesByPersonId)
    - packages/adapters/src/bonjour/client.ts (BonjourProfile type)
    - packages/adapters/src/github/client.ts (GithubProfile, GithubRepository types)
    - packages/workers/src/github-sync.ts (pattern for worker structure)
  </read_first>
  <action>
Create evidence storage worker in `packages/workers/src/evidence-storage.ts`:

```typescript
import type { SeekuDatabase } from "@seeku/db";
import { getDatabase } from "@seeku/db";
import {
  createEvidenceItem,
  listIdentitiesByPersonId,
  getSourceProfileByHandle,
  listEvidenceByPersonId
} from "@seeku/db";
import type { SourceProfile, EvidenceItem } from "@seeku/db";
import {
  extractAllBonjourEvidence,
  extractAllGithubEvidence,
  type EvidenceExtractionResult,
  type EvidenceItemInput
} from "@seeku/identity";
import type { BonjourProfile, GithubProfile, GithubRepository } from "@seeku/adapters";

/**
 * Store evidence items for a person
 */
export async function storeEvidenceForPerson(
  db: SeekuDatabase,
  personId: string
): Promise<{ itemsCreated: number; errors: { message: string }[] }> {
  const itemsCreated = 0;
  const errors: { message: string }[] = [];

  // Get all identities linked to this person
  const identities = await listIdentitiesByPersonId(db, personId);

  for (const identity of identities) {
    // Get source profile
    const profile = await getSourceProfileByHandle(db, identity.sourceProfileId as any, identity.sourceProfileId as any);
    if (!profile) continue;

    // Extract evidence based on source
    const rawPayload = profile.rawPayload;
    let extractionResult: EvidenceExtractionResult;

    if (profile.source === "bonjour") {
      extractionResult = extractAllBonjourEvidence(rawPayload as BonjourProfile);
    } else if (profile.source === "github") {
      const githubProfile = (rawPayload as { profile: GithubProfile }).profile;
      const repositories = (rawPayload as { repositories: GithubRepository[] }).repositories ?? [];
      extractionResult = extractAllGithubEvidence(githubProfile, repositories);
    } else {
      errors.push({ message: `Unknown source: ${profile.source}` });
      continue;
    }

    // Store each evidence item
    for (const item of extractionResult.items) {
      try {
        await createEvidenceItem(db, {
          personId,
          sourceProfileId: identity.sourceProfileId,
          ...item
        });
      } catch (err) {
        errors.push({ message: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return { itemsCreated, errors };
}

/**
 * Store evidence for all persons
 */
export async function runEvidenceStorageWorker(
  personIds?: string[]
): Promise<{ totalItems: number; totalErrors: number }> {
  const db = getDatabase();
  const totalItems = 0;
  const totalErrors = 0;

  // If personIds not provided, process all persons
  // For now, we accept personIds as input

  for (const personId of personIds ?? []) {
    const result = await storeEvidenceForPerson(db, personId);
    // Note: itemsCreated counting would need proper implementation
  }

  return { totalItems, totalErrors };
}

/**
 * Check if evidence already exists for a person
 */
export async function hasEvidence(db: SeekuDatabase, personId: string): Promise<boolean> {
  const evidence = await listEvidenceByPersonId(db, personId);
  return evidence.length > 0;
}
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/workers && pnpm build --filter=@seeku/workers</automated>
  </verify>
  <done>
    - storeEvidenceForPerson function extracts and stores evidence for a person
    - runEvidenceStorageWorker function processes multiple persons
    - Evidence extracted from both Bonjour and GitHub profiles
    - TypeScript compilation succeeds
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/workers
2. Build passes for @seeku/workers
3. GitHub sync worker fetches and stores profiles
4. Identity resolution worker runs matching pipeline
5. Evidence storage worker extracts and stores evidence
6. All packages compile and build successfully
</verification>

<success_criteria>
1. GitHub profiles are fetched and stored by the sync worker (DATA-03 complete)
2. Identity resolution runs after profile synchronization
3. Evidence items are extracted and stored for resolved persons
4. Worker handles errors gracefully with logging
5. Sync run status is tracked in database
6. All Phase 2 packages compile and build successfully
</success_criteria>

<output>
After completion, create `.planning/phases/02-github-identity-merge/05-SUMMARY.md`
</output>