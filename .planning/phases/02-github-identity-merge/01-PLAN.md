---
phase: 02-github-identity-merge
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/adapters/src/github/client.ts
  - packages/adapters/src/github/normalize.ts
  - packages/adapters/src/github/index.ts
  - packages/adapters/src/index.ts
autonomous: true
requirements: [DATA-03, DATA-05]
user_setup:
  - service: github
    why: "GitHub API authentication for higher rate limits"
    env_vars:
      - name: GITHUB_TOKEN
        source: "GitHub -> Settings -> Developer settings -> Personal access tokens -> Tokens (classic)"
        note: "Generate token with no special scopes needed for public profile/repo access"
must_haves:
  truths:
    - "GitHub profiles can be fetched by username"
    - "GitHub repositories can be fetched for a user"
    - "Raw GitHub JSON is normalized to NormalizedProfile schema"
    - "GitHub adapter implements SourceAdapter interface"
  artifacts:
    - path: "packages/adapters/src/github/client.ts"
      provides: "GitHub HTTP client"
      exports: ["GithubClient", "GithubProfile", "GithubRepository"]
    - path: "packages/adapters/src/github/normalize.ts"
      provides: "Profile normalization"
      exports: ["normalizeGithubProfile", "computeGithubProfileHash"]
    - path: "packages/adapters/src/github/index.ts"
      provides: "Adapter implementation"
      exports: ["GithubAdapter", "createGithubAdapter"]
  key_links:
    - from: "packages/adapters/src/github/index.ts"
      to: "../types.js"
      via: "SourceAdapter interface"
      pattern: "implements SourceAdapter"
    - from: "packages/adapters/src/github/normalize.ts"
      to: "@seeku/shared"
      via: "NormalizedProfile schema"
      pattern: "NormalizedProfileSchema.parse"
---

<objective>
Implement the GitHub adapter following the Bonjour adapter pattern established in Phase 1. This provides profile and repository fetching with normalization to the standard NormalizedProfile schema.

Purpose: Enable GitHub data ingestion for cross-source identity matching
Output: Functional GitHub adapter compatible with existing SourceAdapter contract
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
<!-- Key types and contracts from existing codebase. Executor should use these directly. -->

From packages/adapters/src/types.ts:
```typescript
export interface SourceAdapter<T = unknown> {
  readonly source: SourceName;
  discoverSeeds(input: { cursor?: Record<string, unknown>; limit: number }): Promise<DiscoverResult>;
  fetchProfileByHandle(input: { handle: string }): Promise<FetchResult<T>>;
  normalizeProfile(input: { rawProfile: T }): Promise<NormalizedProfile>;
}

export interface FetchResult<T = unknown> {
  profile: NormalizedProfile;
  rawPayload: T;
  sourceHandle: string;
}

export const DEFAULT_ADAPTER_CONFIG: Omit<AdapterConfig, "baseUrl"> = {
  timeout: 10_000,
  maxRetries: 3,
  requestDelay: 250
};
```

From packages/shared/src/types.ts:
```typescript
export interface NormalizedProfile {
  source: SourceName;
  sourceProfileId?: string;
  sourceHandle: string;
  canonicalUrl: string;
  displayName?: string;
  headline?: string;
  bio?: string;
  summary?: string;
  avatarUrl?: string;
  locationText?: string;
  aliases: Alias[];
  rawMetadata: Record<string, unknown>;
}

export type SourceName = "bonjour" | "github";
export type AliasType = "github" | "x" | "jike" | "website" | "other";
```

From packages/adapters/src/bonjour/client.ts (pattern reference):
- Retry logic with exponential backoff
- Rate limiting with requestDelay
- Timeout handling via AbortSignal
- Generic API response handling
</interfaces>

Reference implementation patterns from:
@packages/adapters/src/bonjour/client.ts
@packages/adapters/src/bonjour/normalize.ts
@packages/adapters/src/bonjour/index.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create GitHub client with profile and repository fetching</name>
  <files>packages/adapters/src/github/client.ts</files>
  <read_first>
    - packages/adapters/src/bonjour/client.ts (pattern reference for HTTP client)
    - packages/adapters/src/types.ts (AdapterConfig, DEFAULT_ADAPTER_CONFIG)
  </read_first>
  <behavior>
    - Test 1: fetchProfileByUsername("torvalds") returns valid GithubProfile with login, name, avatar_url
    - Test 2: fetchRepositoriesByUsername("torvalds") returns array of GithubRepository with name, stargazers_count
    - Test 3: Client handles 404 with descriptive error
    - Test 4: Client respects rate limiting between requests
  </behavior>
  <action>
Create `packages/adapters/src/github/client.ts` following the BonjourClient pattern:

1. Define GitHub API types:
```typescript
export interface GithubProfile {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  bio: string | null;
  twitter_username: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export interface GithubRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  owner: { login: string };
}
```

2. Implement `GithubClient` class with:
   - Constructor accepting optional config and GITHUB_TOKEN env var
   - Base URL: `https://api.github.com`
   - `fetchProfileByUsername(username: string): Promise<GithubProfile>`
   - `fetchRepositoriesByUsername(username: string): Promise<GithubRepository[]>`
   - Retry logic (maxRetries: 3, exponential backoff 500 * 2^attempt)
   - Rate limiting (requestDelay: 250ms between requests)
   - Timeout handling (10 seconds via AbortSignal)
   - Authorization header if GITHUB_TOKEN present

3. Use same rate limiting queue pattern as BonjourClient (withRateLimit method)
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/adapters && pnpm build --filter=@seeku/adapters</automated>
  </verify>
  <done>
    - GithubClient class exists with fetchProfileByUsername and fetchRepositoriesByUsername methods
    - Client includes retry, rate limiting, and timeout handling
    - TypeScript compilation succeeds
    - pnpm build succeeds
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement GitHub profile normalization</name>
  <files>packages/adapters/src/github/normalize.ts</files>
  <read_first>
    - packages/adapters/src/bonjour/normalize.ts (pattern reference)
    - packages/shared/src/types.ts (NormalizedProfile, Alias)
    - packages/shared/src/schemas.ts (NormalizedProfileSchema)
    - packages/adapters/src/github/client.ts (GithubProfile type)
  </read_first>
  <behavior>
    - Test 1: normalizeGithubProfile with login="testuser" produces NormalizedProfile with sourceHandle="testuser"
    - Test 2: Profile with twitter_username="test" produces alias with type="x"
    - Test 3: Profile with blog="https://example.com" produces alias with type="website"
    - Test 4: computeGithubProfileHash produces consistent SHA256 hash for same profile
    - Test 5: Normalized output passes NormalizedProfileSchema.parse
  </behavior>
  <action>
Create `packages/adapters/src/github/normalize.ts` following the Bonjour normalization pattern:

1. Implement `normalizeGithubProfile(profile: GithubProfile): NormalizedProfile`:
   - source: "github"
   - sourceProfileId: String(profile.id)
   - sourceHandle: profile.login
   - canonicalUrl: profile.html_url
   - displayName: profile.name (trimmed, undefined if empty)
   - headline: profile.bio (trimmed, undefined if empty)
   - bio: profile.bio (trimmed, undefined if empty)
   - avatarUrl: profile.avatar_url
   - locationText: profile.location (trimmed, undefined if empty)
   - aliases: Extract from twitter_username (type="x"), blog (type="website"), company (type="other")
   - rawMetadata: Include public_repos, followers, following, company, blog, twitter_username, created_at, updated_at

2. Implement `computeGithubProfileHash(profile: GithubProfile): string`:
   - Hash: login, name, bio, location, company, blog, twitter_username, public_repos, updated_at
   - Use SHA256 like Bonjour pattern

3. Use NormalizedProfileSchema.parse for validation at end

4. Add helper functions (compact, trimToUndefined) following Bonjour pattern
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/adapters && pnpm build --filter=@seeku-adapters</automated>
  </verify>
  <done>
    - normalizeGithubProfile function exists and returns NormalizedProfile
    - computeGithubProfileHash function exists
    - Aliases are extracted from twitter_username, blog, company
    - Output passes NormalizedProfileSchema validation
    - TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Task 3: Implement GithubAdapter class</name>
  <files>packages/adapters/src/github/index.ts, packages/adapters/src/index.ts</files>
  <read_first>
    - packages/adapters/src/bonjour/index.ts (pattern reference for adapter class)
    - packages/adapters/src/types.ts (SourceAdapter interface)
    - packages/adapters/src/github/client.ts (GithubClient)
    - packages/adapters/src/github/normalize.ts (normalizeGithubProfile)
    - packages/adapters/src/index.ts (current exports)
  </read_first>
  <behavior>
    - Test 1: new GithubAdapter() creates instance with source="github"
    - Test 2: adapter.fetchProfileByHandle({ handle: "testuser" }) calls client and returns FetchResult
    - Test 3: adapter.normalizeProfile({ rawProfile }) returns NormalizedProfile
  </behavior>
  <action>
Create `packages/adapters/src/github/index.ts`:

1. Export all from client.ts and normalize.ts

2. Implement `GithubAdapter` class implementing `SourceAdapter<GithubProfile>`:
```typescript
export class GithubAdapter implements SourceAdapter<GithubProfile> {
  readonly source = "github" as const;
  readonly client: GithubClient;

  constructor(client?: GithubClient) {
    this.client = client ?? new GithubClient();
  }

  async discoverSeeds(input: { cursor?: Record<string, unknown>; limit: number }): Promise<DiscoverResult> {
    // GitHub doesn't have a discovery mechanism like Bonjour
    // Return empty result - seeds will come from Bonjour socials or manual input
    return { profiles: [], nextCursor: undefined, hasMore: false };
  }

  async fetchProfileByHandle(input: { handle: string }): Promise<FetchResult<GithubProfile>> {
    const rawPayload = await this.client.fetchProfileByUsername(input.handle);
    const profile = await this.normalizeProfile({ rawProfile: rawPayload });
    return { profile, rawPayload, sourceHandle: profile.sourceHandle };
  }

  async normalizeProfile(input: { rawProfile: GithubProfile }): Promise<NormalizedProfile> {
    return normalizeGithubProfile(input.rawProfile);
  }
}
```

3. Add `createGithubAdapter(client?: GithubClient)` factory function

4. Update `packages/adapters/src/index.ts` to export github module:
```typescript
export * from "./types.js";
export * from "./bonjour/index.js";
export * from "./github/index.js";
```

Note: GitHub discovery returns empty because we don't have a seed discovery mechanism for GitHub. Seeds come from Bonjour socials linking to GitHub handles, or manual input.
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/adapters && pnpm build --filter=@seeku/adapters</automated>
  </verify>
  <done>
    - GithubAdapter class exists implementing SourceAdapter
    - createGithubAdapter factory function exists
    - Adapter exports added to packages/adapters/src/index.ts
    - TypeScript compilation succeeds for all packages
    - Build succeeds for all packages
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/adapters
2. Build passes for @seeku/adapters
3. GithubAdapter implements SourceAdapter interface correctly
4. GitHub profile normalization produces valid NormalizedProfile
</verification>

<success_criteria>
1. GitHub profiles can be fetched by username via GithubClient
2. GitHub repositories can be fetched for a user via GithubClient
3. Raw GitHub JSON is normalized to NormalizedProfile schema via normalizeGithubProfile
4. GithubAdapter implements SourceAdapter interface (DATA-05 complete)
5. All packages compile and build successfully
</success_criteria>

<output>
After completion, create `.planning/phases/02-github-identity-merge/01-SUMMARY.md`
</output>