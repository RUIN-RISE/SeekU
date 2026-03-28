---
phase: 02-github-identity-merge
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - packages/identity/src/types.ts
  - packages/identity/src/evidence/bonjour.ts
  - packages/identity/src/evidence/github.ts
  - packages/identity/src/evidence/index.ts
  - packages/identity/src/index.ts
autonomous: true
requirements: [EVID-01, EVID-02, EVID-03, EVID-04]
must_haves:
  truths:
    - "Bonjour creations are extracted as project evidence items"
    - "GitHub repositories are extracted as repository evidence items"
    - "Bonjour socials are extracted as social evidence items"
    - "Bonjour community posts with job signals are extracted as job_signal evidence"
    - "Evidence items have proper type classification and hashes"
  artifacts:
    - path: "packages/identity/src/types.ts"
      provides: "Evidence extraction types"
      exports: ["EvidenceItemInput", "EvidenceExtractionResult"]
    - path: "packages/identity/src/evidence/bonjour.ts"
      provides: "Bonjour evidence extraction"
      exports: ["extractBonjourProjects", "extractBonjourSocials", "extractBonjourJobSignals"]
    - path: "packages/identity/src/evidence/github.ts"
      provides: "GitHub evidence extraction"
      exports: ["extractGithubRepositories", "extractGithubProfileEvidence"]
  key_links:
    - from: "packages/identity/src/evidence/bonjour.ts"
      to: "@seeku/db"
      via: "EvidenceType enum"
      pattern: "import.*EvidenceType"
    - from: "packages/identity/src/evidence/github.ts"
      to: "@seeku/adapters/github"
      via: "GithubRepository type"
      pattern: "GithubRepository"
---

<objective>
Implement evidence extraction modules that parse Bonjour and GitHub profiles to produce classified evidence items. This transforms raw profile data into structured evidence ready for storage.

Purpose: Extract structured evidence from profile data for identity matching and ranking
Output: Evidence extraction functions for projects, repositories, socials, and job signals
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

From packages/db/src/schema.ts:
```typescript
export const evidenceType = pgEnum("evidence_type", [
  "social", "project", "repository", "community_post",
  "job_signal", "education", "experience", "profile_field"
]);
export type EvidenceType = typeof evidenceType.enumValues[number];
```

From packages/adapters/src/github/client.ts:
```typescript
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

From packages/adapters/src/bonjour/client.ts:
```typescript
export interface BonjourCreation {
  url: string;
  title: string;
  description: string;
  image?: string;
}

export interface BonjourSocial {
  type: string;
  content: string;
}

export interface BonjourCommunityPost {
  _id: string;
  content?: string;
  create_time?: string;
  type?: string;
  category?: BonjourCategory[];
  linkDetail?: Record<string, unknown>;
}
```

From Phase 2 research (01-RESEARCH.md):
| Source Field | Evidence Type | Extraction Rule |
|--------------|---------------|-----------------|
| `creations[]` | `project` | URL, title, description |
| `socials[]` | `social` | type mapped, value as URL/handle |
| Community "Open to Work" | `job_signal` | job seeking signal |
| Community "We Are Hiring" | `job_signal` | hiring signal |
| `public_repos` list | `repository` | name, description, stars, language |
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create identity package structure and evidence types</name>
  <files>packages/identity/src/types.ts, packages/identity/package.json, packages/identity/tsconfig.json, packages/identity/src/index.ts</files>
  <read_first>
    - packages/db/src/schema.ts (EvidenceType, NewEvidenceItem)
    - packages/adapters/src/bonjour/client.ts (BonjourProfile types)
    - packages/adapters/src/github/client.ts (GithubProfile, GithubRepository)
    - package.json (workspace patterns for reference)
    - tsconfig.json (base config patterns)
  </read_first>
  <action>
Create the `@seeku/identity` package following the existing package patterns:

1. Create `packages/identity/package.json`:
```json
{
  "name": "@seeku/identity",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@seeku/db": "workspace:*",
    "@seeku/shared": "workspace:*",
    "@seeku/adapters": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.2"
  }
}
```

2. Create `packages/identity/tsconfig.json`:
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

3. Create `packages/identity/src/types.ts`:
```typescript
import type { EvidenceType, SourceName } from "@seeku/db";
import type { SourceProfile } from "@seeku/db";

export interface EvidenceItemInput {
  source: SourceName;
  sourceProfileId?: string;
  evidenceType: EvidenceType;
  title?: string;
  description?: string;
  url?: string;
  occurredAt?: Date;
  metadata: Record<string, unknown>;
  evidenceHash: string;
}

export interface EvidenceExtractionResult {
  items: EvidenceItemInput[];
  errors: { message: string; context?: unknown }[];
}

export interface MatchReason {
  signal: string;
  confidence: number;
}

export interface MatchResult {
  confidence: number;
  reasons: MatchReason[];
}

export interface ProfileMatchInput {
  sourceProfile: SourceProfile;
  candidateProfiles: SourceProfile[];
}
```

4. Create `packages/identity/src/index.ts` (initial exports):
```typescript
export * from "./types.js";
export * from "./evidence/index.js";
```

5. Update root `package.json` workspace patterns if needed (already includes packages/* pattern)
  </action>
  <verify>
    <automated>pnpm install && pnpm typecheck --filter=@seeku/identity</automated>
  </verify>
  <done>
    - @seeku/identity package exists with package.json and tsconfig.json
    - EvidenceItemInput, EvidenceExtractionResult types defined
    - TypeScript compilation succeeds
    - pnpm install succeeds with new workspace package
  </done>
</task>

<task type="auto">
  <name>Task 2: Implement Bonjour evidence extraction</name>
  <files>packages/identity/src/evidence/bonjour.ts, packages/identity/src/evidence/index.ts</files>
  <read_first>
    - packages/identity/src/types.ts (EvidenceItemInput, EvidenceExtractionResult)
    - packages/adapters/src/bonjour/client.ts (BonjourCreation, BonjourSocial, BonjourCommunityPost, BonjourProfile)
    - packages/db/src/schema.ts (EvidenceType)
    - packages/db/src/repositories.ts (pattern for profile handling)
  </read_first>
  <action>
Create Bonjour evidence extraction functions:

1. Create `packages/identity/src/evidence/bonjour.ts`:
```typescript
import { createHash } from "node:crypto";
import type { EvidenceItemInput, EvidenceExtractionResult } from "../types.js";
import type { EvidenceType } from "@seeku/db";
import type {
  BonjourProfile,
  BonjourCreation,
  BonjourSocial,
  BonjourCommunityPost
} from "@seeku/adapters";

/**
 * Extract projects from Bonjour creations field (EVID-01)
 */
export function extractBonjourProjects(
  profile: BonjourProfile
): EvidenceItemInput[] {
  const creations = profile.creations ?? [];
  const items: EvidenceItemInput[] = [];

  for (const creation of creations) {
    if (!creation.url && !creation.title) continue;

    const hash = createHash("sha256")
      .update(`bonjour:project:${profile._id}:${creation.url || creation.title}`)
      .digest("hex");

    items.push({
      source: "bonjour",
      sourceProfileId: profile._id,
      evidenceType: "project" as EvidenceType,
      title: creation.title?.trim() || undefined,
      description: creation.description?.trim() || undefined,
      url: creation.url?.trim() || undefined,
      metadata: {
        imageUrl: creation.image
      },
      evidenceHash: hash
    });
  }

  return items;
}

/**
 * Extract social links from Bonjour socials field (EVID-03)
 */
export function extractBonjourSocials(
  profile: BonjourProfile
): EvidenceItemInput[] {
  const socials = profile.socials ?? [];
  const items: EvidenceItemInput[] = [];

  for (const social of socials) {
    const value = social.content?.trim();
    if (!value) continue;

    const hash = createHash("sha256")
      .update(`bonjour:social:${profile._id}:${social.type}:${value}`)
      .digest("hex");

    items.push({
      source: "bonjour",
      sourceProfileId: profile._id,
      evidenceType: "social" as EvidenceType,
      title: social.type,
      description: value,
      url: value.startsWith("http") ? value : undefined,
      metadata: {
        socialType: social.type.toLowerCase()
      },
      evidenceHash: hash
    });
  }

  return items;
}

/**
 * Extract job signals from Bonjour community posts (EVID-04)
 */
export function extractBonjourJobSignals(
  posts: BonjourCommunityPost[],
  profileId: string
): EvidenceItemInput[] {
  const JOB_SIGNAL_TYPES = ["Open to Work", "We Are Hiring", "open_to_work", "we_are_hiring"];
  const items: EvidenceItemInput[] = [];

  for (const post of posts) {
    // Check if post type or content indicates job signal
    const postType = post.type?.toLowerCase() ?? "";
    const content = post.content?.toLowerCase() ?? "";
    const categories = post.category?.map(c => c.key.toLowerCase()) ?? [];

    const isJobSignal =
      JOB_SIGNAL_TYPES.some(t => postType.includes(t.toLowerCase())) ||
      JOB_SIGNAL_TYPES.some(t => content.includes(t.toLowerCase())) ||
      categories.some(c => JOB_SIGNAL_TYPES.some(t => c.includes(t.toLowerCase())));

    if (!isJobSignal) continue;

    const hash = createHash("sha256")
      .update(`bonjour:job_signal:${profileId}:${post._id}`)
      .digest("hex");

    items.push({
      source: "bonjour",
      sourceProfileId: profileId,
      evidenceType: "job_signal" as EvidenceType,
      title: post.type ?? "Job Signal",
      description: post.content?.trim() || undefined,
      url: post.link,
      occurredAt: post.create_time ? new Date(post.create_time) : undefined,
      metadata: {
        postId: post._id,
        categories: post.category?.map(c => c.key) ?? [],
        signalType: postType.includes("hiring") ? "hiring" : "seeking"
      },
      evidenceHash: hash
    });
  }

  return items;
}

/**
 * Extract all evidence from a Bonjour profile
 */
export function extractAllBonjourEvidence(
  profile: BonjourProfile,
  communityPosts?: BonjourCommunityPost[]
): EvidenceExtractionResult {
  const items: EvidenceItemInput[] = [];
  const errors: { message: string; context?: unknown }[] = [];

  try {
    items.push(...extractBonjourProjects(profile));
  } catch (err) {
    errors.push({ message: "Failed to extract projects", context: err });
  }

  try {
    items.push(...extractBonjourSocials(profile));
  } catch (err) {
    errors.push({ message: "Failed to extract socials", context: err });
  }

  if (communityPosts) {
    try {
      items.push(...extractBonjourJobSignals(communityPosts, profile._id));
    } catch (err) {
      errors.push({ message: "Failed to extract job signals", context: err });
    }
  }

  return { items, errors };
}
```

2. Create `packages/identity/src/evidence/index.ts`:
```typescript
export * from "./bonjour.js";
export * from "./github.js";
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/identity && pnpm build --filter=@seeku/identity</automated>
  </verify>
  <done>
    - extractBonjourProjects function exists and returns EvidenceItemInput[]
    - extractBonjourSocials function exists and returns EvidenceItemInput[]
    - extractBonjourJobSignals function exists and returns EvidenceItemInput[]
    - extractAllBonjourEvidence function orchestrates all extraction
    - Evidence hashes are computed using SHA256
    - TypeScript compilation succeeds
    - Build succeeds
  </done>
</task>

<task type="auto">
  <name>Task 3: Implement GitHub evidence extraction</name>
  <files>packages/identity/src/evidence/github.ts</files>
  <read_first>
    - packages/identity/src/types.ts (EvidenceItemInput)
    - packages/adapters/src/github/client.ts (GithubProfile, GithubRepository)
    - packages/db/src/schema.ts (EvidenceType)
    - packages/identity/src/evidence/bonjour.ts (pattern reference)
  </read_first>
  <action>
Create GitHub evidence extraction functions:

1. Add to `packages/identity/src/evidence/github.ts`:
```typescript
import { createHash } from "node:crypto";
import type { EvidenceItemInput, EvidenceExtractionResult } from "../types.js";
import type { EvidenceType } from "@seeku/db";
import type { GithubProfile, GithubRepository } from "@seeku/adapters";

/**
 * Extract repositories from GitHub profile (EVID-02)
 */
export function extractGithubRepositories(
  profile: GithubProfile,
  repositories: GithubRepository[]
): EvidenceItemInput[] {
  const items: EvidenceItemInput[] = [];

  for (const repo of repositories) {
    // Only include repos owned by this user
    if (repo.owner.login !== profile.login) continue;

    const hash = createHash("sha256")
      .update(`github:repository:${profile.id}:${repo.id}`)
      .digest("hex");

    items.push({
      source: "github",
      sourceProfileId: String(profile.id),
      evidenceType: "repository" as EvidenceType,
      title: repo.name,
      description: repo.description?.trim() || undefined,
      url: repo.html_url,
      metadata: {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        fullName: repo.full_name,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at
      },
      evidenceHash: hash
    });
  }

  return items;
}

/**
 * Extract profile field evidence from GitHub profile
 */
export function extractGithubProfileEvidence(
  profile: GithubProfile
): EvidenceItemInput[] {
  const items: EvidenceItemInput[] = [];

  // Company as profile_field evidence
  if (profile.company) {
    const hash = createHash("sha256")
      .update(`github:profile_field:${profile.id}:company:${profile.company}`)
      .digest("hex");

    items.push({
      source: "github",
      sourceProfileId: String(profile.id),
      evidenceType: "profile_field" as EvidenceType,
      title: "Company",
      description: profile.company.trim(),
      metadata: { field: "company" },
      evidenceHash: hash
    });
  }

  // Location as profile_field evidence
  if (profile.location) {
    const hash = createHash("sha256")
      .update(`github:profile_field:${profile.id}:location:${profile.location}`)
      .digest("hex");

    items.push({
      source: "github",
      sourceProfileId: String(profile.id),
      evidenceType: "profile_field" as EvidenceType,
      title: "Location",
      description: profile.location.trim(),
      metadata: { field: "location" },
      evidenceHash: hash
    });
  }

  // Bio as profile_field evidence
  if (profile.bio) {
    const hash = createHash("sha256")
      .update(`github:profile_field:${profile.id}:bio`)
      .digest("hex");

    items.push({
      source: "github",
      sourceProfileId: String(profile.id),
      evidenceType: "profile_field" as EvidenceType,
      title: "Bio",
      description: profile.bio.trim(),
      metadata: { field: "bio" },
      evidenceHash: hash
    });
  }

  // Blog/Website as social evidence
  if (profile.blog) {
    const blogUrl = profile.blog.startsWith("http") ? profile.blog : `https://${profile.blog}`;
    const hash = createHash("sha256")
      .update(`github:social:${profile.id}:website:${profile.blog}`)
      .digest("hex");

    items.push({
      source: "github",
      sourceProfileId: String(profile.id),
      evidenceType: "social" as EvidenceType,
      title: "Website",
      url: blogUrl,
      metadata: { socialType: "website" },
      evidenceHash: hash
    });
  }

  // Twitter as social evidence
  if (profile.twitter_username) {
    const hash = createHash("sha256")
      .update(`github:social:${profile.id}:twitter:${profile.twitter_username}`)
      .digest("hex");

    items.push({
      source: "github",
      sourceProfileId: String(profile.id),
      evidenceType: "social" as EvidenceType,
      title: "Twitter/X",
      description: profile.twitter_username,
      url: `https://x.com/${profile.twitter_username}`,
      metadata: { socialType: "x" },
      evidenceHash: hash
    });
  }

  return items;
}

/**
 * Extract all evidence from a GitHub profile
 */
export function extractAllGithubEvidence(
  profile: GithubProfile,
  repositories: GithubRepository[]
): EvidenceExtractionResult {
  const items: EvidenceItemInput[] = [];
  const errors: { message: string; context?: unknown }[] = [];

  try {
    items.push(...extractGithubRepositories(profile, repositories));
  } catch (err) {
    errors.push({ message: "Failed to extract repositories", context: err });
  }

  try {
    items.push(...extractGithubProfileEvidence(profile));
  } catch (err) {
    errors.push({ message: "Failed to extract profile evidence", context: err });
  }

  return { items, errors };
}
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/identity && pnpm build --filter=@seeku/identity</automated>
  </verify>
  <done>
    - extractGithubRepositories function exists and returns EvidenceItemInput[]
    - extractGithubProfileEvidence function exists and returns EvidenceItemInput[]
    - extractAllGithubEvidence function orchestrates all extraction
    - Repository evidence includes stars, forks, language in metadata
    - Profile evidence includes company, location, bio, blog, twitter
    - TypeScript compilation succeeds
    - Build succeeds
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/identity
2. Build passes for @seeku/identity
3. Bonjour extraction produces correct evidence types (project, social, job_signal)
4. GitHub extraction produces correct evidence types (repository, social, profile_field)
5. All evidence hashes are computed
</verification>

<success_criteria>
1. Bonjour creations are extracted as project evidence items (EVID-01)
2. GitHub repositories are extracted as repository evidence items (EVID-02)
3. Bonjour socials are extracted as social evidence items (EVID-03)
4. Bonjour community posts with job signals are extracted as job_signal evidence (EVID-04)
5. Evidence items have proper type classification and SHA256 hashes
6. All packages compile and build successfully
</success_criteria>

<output>
After completion, create `.planning/phases/02-github-identity-merge/03-SUMMARY.md`
</output>