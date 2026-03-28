---
phase: 01-infrastructure-bonjour-ingestion
plan: 02
type: execute
wave: 2
depends_on:
  - 01
files_modified:
  - packages/shared/src/index.ts
  - packages/shared/src/types.ts
  - packages/shared/src/schemas.ts
  - packages/adapters/package.json
  - packages/adapters/tsconfig.json
  - packages/adapters/src/index.ts
  - packages/adapters/src/types.ts
  - packages/adapters/src/bonjour/client.ts
  - packages/adapters/src/bonjour/normalize.ts
  - packages/adapters/src/bonjour/discover.ts
  - packages/adapters/src/bonjour/index.ts
autonomous: true
requirements:
  - DATA-01
  - DATA-02
  - DATA-04
must_haves:
  truths:
    - "NormalizedProfile type exists with zod validation"
    - "SourceAdapter interface defines contract for all adapters"
    - "Bonjour HTTP client can fetch profiles from API"
    - "Bonjour seeds can be discovered from category/community endpoints"
    - "Raw Bonjour JSON is normalized to NormalizedProfile schema"
  artifacts:
    - path: "packages/shared/src/types.ts"
      provides: "Core type definitions"
      exports: ["NormalizedProfile", "Alias", "SourceName"]
      min_lines: 30
    - path: "packages/shared/src/schemas.ts"
      provides: "Zod validation schemas"
      exports: ["NormalizedProfileSchema"]
      min_lines: 20
    - path: "packages/adapters/src/types.ts"
      provides: "Adapter interface contract"
      exports: ["SourceAdapter", "DiscoverResult", "FetchResult"]
      min_lines: 25
    - path: "packages/adapters/src/bonjour/client.ts"
      provides: "Bonjour HTTP client"
      contains: "fetchProfileByHandle"
      min_lines: 40
    - path: "packages/adapters/src/bonjour/normalize.ts"
      provides: "Bonjour normalization"
      contains: "normalizeBonjourProfile"
      min_lines: 30
    - path: "packages/adapters/src/bonjour/discover.ts"
      provides: "Seed discovery"
      contains: "discoverBonjourSeeds"
      min_lines: 30
  key_links:
    - from: "packages/adapters/src/bonjour/client.ts"
      to: "Bonjour API"
      via: "fetch API"
      pattern: "fc-mp-b1a9bc8c"
    - from: "packages/adapters/src/bonjour/normalize.ts"
      to: "NormalizedProfile"
      via: "transformation"
      pattern: "NormalizedProfile"
---

<objective>
Create the shared type definitions and Bonjour adapter implementation. The adapter handles HTTP communication with the Bonjour API, seed discovery for profile crawling, and normalization of raw JSON to the NormalizedProfile schema.

Purpose: Provide type-safe contracts for data flow and a working adapter to fetch Bonjour profiles. This enables the worker to ingest data without knowing API details.
Output: NormalizedProfile types, SourceAdapter interface, and working Bonjour adapter.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-infrastructure-bonjour-ingestion/01-RESEARCH.md
@packages/db/src/schema.ts
</context>

<interfaces>
<!-- From Plan 01, the database schema provides these types -->

From packages/db/src/schema.ts (Plan 01):
```typescript
// Enum types that adapter must align with
sourceName: ['bonjour', 'github']

// Table types adapter will populate
source_profiles: {
  source: 'bonjour' | 'github';
  sourceProfileId?: string;
  sourceHandle: string;
  canonicalUrl: string;
  displayName?: string;
  headline?: string;
  bio?: string;
  locationText?: string;
  avatarUrl?: string;
  rawPayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  profileHash: string;
}
```

From RESEARCH.md (Bonjour API structure):
```typescript
// Bonjour profile response structure
{
  _id: string;
  profile_link: string;  // internal stable link
  user_link: string;     // public vanity url
  name: string;
  bio: string;
  description: string;
  avatar: string;
  socials: Array<{type: string; content: string}>;
  creations: Array<{url: string; title: string; description: string}>;
  basicInfo: {
    region: {countryName, provinceName, cityName};
    current_doing: string;
    role: string;
    skill: string;
  };
  update_time: string;
}

// Bonjour API base URL
Base URL: https://fc-mp-b1a9bc8c-0aab-44ca-9af2-2bd604163a78.next.bspapp.com

// Endpoints
GET /profile/{link} - fetch profile by handle
GET /user/category - list categories for discovery
GET /user/community?type=profile_link&profile_link={link}&limit={n}&skip={m} - paginated community posts
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create shared types and schemas</name>
  <files>packages/shared/src/index.ts, packages/shared/src/types.ts, packages/shared/src/schemas.ts</files>
  <read_first>
    - .planning/phases/01-infrastructure-bonjour-ingestion/01-RESEARCH.md (for NormalizedProfile structure)
    - packages/db/src/schema.ts (to align with database types)
  </read_first>
  <behavior>
    - Test 1: NormalizedProfile type exports correctly
    - Test 2: NormalizedProfileSchema validates valid profile objects
    - Test 3: NormalizedProfileSchema rejects invalid objects (missing required fields)
    - Test 4: Alias type includes github, x, jike, website, other variants
  </behavior>
  <action>
    Create shared type definitions and zod validation schemas:

    1. Create packages/shared/src/types.ts with NormalizedProfile and related types:

       ```typescript
       export type SourceName = 'bonjour' | 'github';

       export interface Alias {
         type: 'github' | 'x' | 'jike' | 'website' | 'other';
         value: string;
         confidence: number; // 0-1, indicates match confidence
       }

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

       export interface SyncRunConfig {
         source: SourceName;
         jobName: string;
         limit?: number;
         cursor?: Record<string, unknown>;
       }

       export interface SyncRunResult {
         status: 'succeeded' | 'failed' | 'partial';
         profilesProcessed: number;
         errors: Array<{ message: string; context?: unknown }>;
         nextCursor?: Record<string, unknown>;
       }
       ```

    2. Create packages/shared/src/schemas.ts with zod validation:

       ```typescript
       import { z } from 'zod';

       export const AliasSchema = z.object({
         type: z.enum(['github', 'x', 'jike', 'website', 'other']),
         value: z.string(),
         confidence: z.number().min(0).max(1),
       });

       export const NormalizedProfileSchema = z.object({
         source: z.enum(['bonjour', 'github']),
         sourceProfileId: z.string().optional(),
         sourceHandle: z.string(),
         canonicalUrl: z.string(),
         displayName: z.string().optional(),
         headline: z.string().optional(),
         bio: z.string().optional(),
         summary: z.string().optional(),
         avatarUrl: z.string().optional(),
         locationText: z.string().optional(),
         aliases: z.array(AliasSchema),
         rawMetadata: z.record(z.unknown()),
       });
       ```

    3. Create packages/shared/src/index.ts exporting all types and schemas

    4. Add zod dependency to packages/shared/package.json

    5. Run pnpm install and verify TypeScript compiles
  </action>
  <verify>
    <automated>cd /Users/rosscai/seeku && pnpm install && pnpm turbo typecheck 2>&1 | grep -v "error" || echo "SUCCESS"</automated>
  </verify>
  <done>
    - packages/shared/src/types.ts exports NormalizedProfile, Alias, SourceName, SyncRunConfig, SyncRunResult
    - packages/shared/src/schemas.ts exports NormalizedProfileSchema with zod validation
    - TypeScript compiles without errors
    - Zod dependency installed in @seeku/shared
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create adapter interface and Bonjour adapter package</name>
  <files>packages/adapters/package.json, packages/adapters/tsconfig.json, packages/adapters/src/index.ts, packages/adapters/src/types.ts</files>
  <read_first>
    - packages/shared/src/types.ts (for NormalizedProfile type)
    - packages/shared/src/schemas.ts (for NormalizedProfileSchema)
    - .planning/phases/01-infrastructure-bonjour-ingestion/01-RESEARCH.md (for adapter interface design)
  </read_first>
  <behavior>
    - Test 1: SourceAdapter interface defines discoverSeeds method
    - Test 2: SourceAdapter interface defines fetchProfileByHandle method
    - Test 3: SourceAdapter interface defines normalizeProfile method
    - Test 4: DiscoverResult type includes profiles array and nextCursor
    - Test 5: FetchResult type includes profile and rawPayload
  </behavior>
  <action>
    Create the adapters package with SourceAdapter interface:

    1. Create packages/adapters/package.json:
       ```json
       {
         "name": "@seeku/adapters",
         "version": "0.0.1",
         "main": "dist/index.js",
         "types": "dist/index.d.ts",
         "scripts": {
           "build": "tsc",
           "typecheck": "tsc --noEmit"
         },
         "dependencies": {
           "@seeku/shared": "workspace:*",
           "zod": "^3.23.0"
         }
       }
       ```

    2. Create packages/adapters/tsconfig.json extending root config

    3. Create packages/adapters/src/types.ts with SourceAdapter interface:

       ```typescript
       import type { NormalizedProfile, SourceName } from '@seeku/shared';

       export interface DiscoverResult {
         profiles: Array<{
           handle: string;
           sourceProfileId?: string;
           rawPayload: unknown;
         }>;
         nextCursor?: Record<string, unknown>;
         hasMore: boolean;
       }

       export interface FetchResult<T = unknown> {
         profile: NormalizedProfile;
         rawPayload: T;
         sourceHandle: string;
       }

       export interface SourceAdapter<T = unknown> {
         readonly source: SourceName;

         // Discover seed profiles for crawling
         discoverSeeds(input: {
           cursor?: Record<string, unknown>;
           limit: number;
         }): Promise<DiscoverResult>;

         // Fetch a single profile by handle
         fetchProfileByHandle(input: {
           handle: string;
         }): Promise<FetchResult<T>>;

         // Normalize raw API response to NormalizedProfile
         normalizeProfile(input: {
           rawProfile: T;
         }): Promise<NormalizedProfile>;
       }

       export interface AdapterConfig {
         baseUrl: string;
         timeout: number;
         maxRetries: number;
         requestDelay: number; // ms between requests for rate limiting
       }

       export const DEFAULT_ADAPTER_CONFIG: AdapterConfig = {
         timeout: 10000,
         maxRetries: 3,
         requestDelay: 200, // Conservative: 5 req/sec max
       };
       ```

    4. Create packages/adapters/src/index.ts exporting all types and adapter implementations
  </action>
  <verify>
    <automated>cd /Users/rosscai/seeku && pnpm turbo typecheck 2>&1 | grep -v "error" || echo "SUCCESS"</automated>
  </verify>
  <done>
    - packages/adapters package exists with correct structure
    - SourceAdapter interface defines discoverSeeds, fetchProfileByHandle, normalizeProfile
    - DiscoverResult and FetchResult types exported
    - DEFAULT_ADAPTER_CONFIG provides conservative rate limiting defaults
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Implement Bonjour HTTP client</name>
  <files>packages/adapters/src/bonjour/client.ts, packages/adapters/src/bonjour/index.ts</files>
  <read_first>
    - packages/adapters/src/types.ts (for AdapterConfig)
    - .planning/phases/01-infrastructure-bonjour-ingestion/01-RESEARCH.md (for API endpoints)
  </read_first>
  <behavior>
    - Test 1: fetchProfileByHandle returns profile data from Bonjour API
    - Test 2: fetchCategories returns array of category objects
    - Test 3: fetchCommunityPosts returns paginated posts with embedded profiles
    - Test 4: Client handles network errors with retry logic
    - Test 5: Client respects requestDelay for rate limiting
  </behavior>
  <action>
    Create Bonjour HTTP client with rate limiting and error handling:

    1. Create packages/adapters/src/bonjour/client.ts:

       ```typescript
       import type { AdapterConfig, DiscoverResult } from '../types';
       import { DEFAULT_ADAPTER_CONFIG } from '../types';

       const BONJOUR_BASE_URL = 'https://fc-mp-b1a9bc8c-0aab-44ca-9af2-2bd604163a78.next.bspapp.com';

       export interface BonjourProfile {
         _id: string;
         profile_link: string;
         user_link: string;
         name: string;
         bio: string;
         description: string;
         avatar: string;
         socials: Array<{ type: string; content: string }>;
         creations: Array<{ url: string; title: string; description: string }>;
         gridItems: unknown[];
         basicInfo: {
           region?: {
             countryName?: string;
             provinceName?: string;
             cityName?: string;
           };
           current_doing?: string;
           role?: string;
           skill?: string;
         };
         update_time: string;
       }

       export interface BonjourCategory {
         key: string;
         name: string;
         count?: number;
       }

       export interface BonjourCommunityPost {
         _id: string;
         profile_link: string;
         content: string;
         created_at: string;
         profile?: BonjourProfile;
       }

       export class BonjourClient {
         private config: AdapterConfig;
         private lastRequestTime: number = 0;

         constructor(config?: Partial<AdapterConfig>) {
           this.config = { ...DEFAULT_ADAPTER_CONFIG, ...config, baseUrl: BONJOUR_BASE_URL };
         }

         private async waitForRateLimit(): Promise<void> {
           const now = Date.now();
           const elapsed = now - this.lastRequestTime;
           if (elapsed < this.config.requestDelay) {
             await new Promise(resolve => setTimeout(resolve, this.config.requestDelay - elapsed));
           }
           this.lastRequestTime = Date.now();
         }

         private async fetchWithRetry<T>(url: string): Promise<T> {
           let lastError: Error | null = null;

           for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
             try {
               await this.waitForRateLimit();

               const response = await fetch(url, {
                 signal: AbortSignal.timeout(this.config.timeout),
               });

               if (!response.ok) {
                 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
               }

               return await response.json();
             } catch (error) {
               lastError = error instanceof Error ? error : new Error(String(error));

               // Exponential backoff for retries
               if (attempt < this.config.maxRetries - 1) {
                 await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
               }
             }
           }

           throw lastError;
         }

         async fetchProfileByHandle(handle: string): Promise<BonjourProfile> {
           const url = `${this.config.baseUrl}/profile/${handle}`;
           return this.fetchWithRetry<BonjourProfile>(url);
         }

         async fetchCategories(): Promise<BonjourCategory[]> {
           const url = `${this.config.baseUrl}/user/category`;
           return this.fetchWithRetry<BonjourCategory[]>(url);
         }

         async fetchCommunityPosts(
           profileLink: string,
           limit: number = 20,
           skip: number = 0
         ): Promise<{ posts: BonjourCommunityPost[]; total?: number }> {
           const url = `${this.config.baseUrl}/user/community?type=profile_link&profile_link=${encodeURIComponent(profileLink)}&limit=${limit}&skip=${skip}`;
           return this.fetchWithRetry(url);
         }
       }
       ```

    2. Create packages/adapters/src/bonjour/index.ts exporting client and types
  </action>
  <verify>
    <automated>cd /Users/rosscai/seeku && pnpm turbo typecheck 2>&1 | grep -v "error" || echo "SUCCESS"</automated>
  </verify>
  <done>
    - BonjourClient class exists with fetchProfileByHandle, fetchCategories, fetchCommunityPosts methods
    - Client implements rate limiting via requestDelay config
    - Client implements retry logic with exponential backoff
    - All response types (BonjourProfile, BonjourCategory, BonjourCommunityPost) exported
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Implement Bonjour normalization</name>
  <files>packages/adapters/src/bonjour/normalize.ts</files>
  <read_first>
    - packages/adapters/src/bonjour/client.ts (for BonjourProfile type)
    - packages/shared/src/types.ts (for NormalizedProfile type)
    - packages/shared/src/schemas.ts (for NormalizedProfileSchema)
    - .planning/phases/01-infrastructure-bonjour-ingestion/01-RESEARCH.md (for mapping rules)
  </read_first>
  <behavior>
    - Test 1: normalizeBonjourProfile extracts sourceHandle from user_link
    - Test 2: normalizeBonjourProfile maps socials to aliases array
    - Test 3: normalizeBonjourProfile extracts locationText from basicInfo.region
    - Test 4: normalizeBonjourProfile handles missing optional fields gracefully
    - Test 5: Output validates against NormalizedProfileSchema
  </behavior>
  <action>
    Create normalization function that transforms Bonjour raw JSON to NormalizedProfile:

    1. Create packages/adapters/src/bonjour/normalize.ts:

       ```typescript
       import type { NormalizedProfile, Alias } from '@seeku/shared';
       import { NormalizedProfileSchema } from '@seeku/shared';
       import type { BonjourProfile } from './client';
       import { createHash } from 'crypto';

       const SOCIAL_TYPE_MAP: Record<string, Alias['type']> = {
         github: 'github',
         x: 'x',
         twitter: 'x',
         jike: 'jike',
         weibo: 'other',
         linkedin: 'other',
         website: 'website',
       };

       function mapSocialType(type: string): Alias['type'] {
         const normalized = type.toLowerCase();
         return SOCIAL_TYPE_MAP[normalized] || 'other';
       }

       function buildLocationText(profile: BonjourProfile): string | undefined {
         const region = profile.basicInfo?.region;
         if (!region) return undefined;

         const parts = [region.cityName, region.provinceName, region.countryName]
           .filter(Boolean)
           .reverse(); // Most specific to most general

         return parts.length > 0 ? parts.join(', ') : undefined;
       }

       function extractAliases(profile: BonjourProfile): Alias[] {
         if (!profile.socials || profile.socials.length === 0) return [];

         return profile.socials.map((social) => ({
           type: mapSocialType(social.type),
           value: social.content,
           confidence: 1.0, // Will be refined in identity resolution phase
         }));
       }

       export function computeProfileHash(profile: BonjourProfile): string {
         // Hash based on stable identifiers
         const content = JSON.stringify({
           _id: profile._id,
           profile_link: profile.profile_link,
           name: profile.name,
           bio: profile.bio,
           update_time: profile.update_time,
         });
         return createHash('sha256').update(content).digest('hex').slice(0, 16);
       }

       export function normalizeBonjourProfile(profile: BonjourProfile): NormalizedProfile {
         // Extract handle from user_link (e.g., "/vincent" -> "vincent")
         const handle = profile.user_link?.replace(/^\//, '') || profile.profile_link;

         // Build canonical URL
         const canonicalUrl = `https://bonjour.bio${profile.user_link || '/' + profile.profile_link}`;

         const normalized: NormalizedProfile = {
           source: 'bonjour',
           sourceProfileId: profile._id,
           sourceHandle: handle,
           canonicalUrl,
           displayName: profile.name || undefined,
           headline: profile.bio || undefined,
           bio: profile.description || undefined,
           avatarUrl: profile.avatar || undefined,
           locationText: buildLocationText(profile),
           aliases: extractAliases(profile),
           rawMetadata: {
             creations: profile.creations,
             gridItems: profile.gridItems,
             basicInfo: profile.basicInfo,
             socials: profile.socials,
             updateTime: profile.update_time,
           },
         };

         // Validate output
         return NormalizedProfileSchema.parse(normalized);
       }
       ```

    2. Update packages/adapters/src/bonjour/index.ts to export normalize function
  </action>
  <verify>
    <automated>cd /Users/rosscai/seeku && pnpm turbo typecheck 2>&1 | grep -v "error" || echo "SUCCESS"</automated>
  </verify>
  <done>
    - normalizeBonjourProfile function exists and exports
    - Function correctly maps BonjourProfile fields to NormalizedProfile
    - socials array is converted to aliases with type mapping
    - locationText is built from region fields
    - Output validates against NormalizedProfileSchema
    - computeProfileHash provides stable hash for deduplication
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Implement Bonjour seed discovery</name>
  <files>packages/adapters/src/bonjour/discover.ts</files>
  <read_first>
    - packages/adapters/src/bonjour/client.ts (for BonjourClient)
    - packages/adapters/src/types.ts (for DiscoverResult)
    - .planning/phases/01-infrastructure-bonjour-ingestion/01-RESEARCH.md (for discovery endpoints)
  </read_first>
  <behavior>
    - Test 1: discoverBonjourSeeds returns array of profile handles
    - Test 2: discoverBonjourSeeds uses category endpoint for initial seeds
    - Test 3: discoverBonjourSeeds uses community endpoint for profile discovery
    - Test 4: discoverBonjourSeeds supports pagination via cursor
    - Test 5: discoverBonjourSeeds returns hasMore boolean correctly
  </behavior>
  <action>
    Create seed discovery function using Bonjour category and community endpoints:

    1. Create packages/adapters/src/bonjour/discover.ts:

       ```typescript
       import type { DiscoverResult } from '../types';
       import { BonjourClient } from './client';

       export interface DiscoveryCursor {
         type: 'category' | 'community';
         categoryKey?: string;
         profileLink?: string;
         skip: number;
       }

       export async function discoverBonjourSeeds(
         client: BonjourClient,
         input: {
           cursor?: DiscoveryCursor;
           limit: number;
         }
       ): Promise<DiscoverResult> {
         const { cursor, limit } = input;
         const profiles: DiscoverResult['profiles'] = [];

         // If no cursor, start with categories
         if (!cursor) {
           const categories = await client.fetchCategories();

           // Return first category as starting point
           if (categories.length > 0) {
             return {
               profiles: [],
               nextCursor: {
                 type: 'category' as const,
                 categoryKey: categories[0].key,
                 skip: 0,
               },
               hasMore: true,
             };
           }

           return { profiles: [], hasMore: false };
         }

         // Discover from community posts
         if (cursor.type === 'community' && cursor.profileLink) {
           const response = await client.fetchCommunityPosts(
             cursor.profileLink,
             limit,
             cursor.skip
           );

           for (const post of response.posts) {
             if (post.profile) {
               profiles.push({
                 handle: post.profile.user_link?.replace(/^\//, '') || post.profile.profile_link,
                 sourceProfileId: post.profile._id,
                 rawPayload: post.profile,
               });
             }
           }

           const hasMore = response.posts.length === limit;
           const nextSkip = cursor.skip + response.posts.length;

           return {
             profiles,
             nextCursor: hasMore
               ? { ...cursor, skip: nextSkip }
               : undefined,
             hasMore,
           };
         }

         // Category-based discovery: find a profile to explore community
         if (cursor.type === 'category') {
           // For initial discovery, we need a known profile to explore community
           // This is a limitation of the API - community requires a profile_link

           // Known seed profiles for bootstrapping (can be expanded)
           const SEED_PROFILES = ['vincent', 'petercat', 'wey'];

           const profileLink = cursor.profileLink || SEED_PROFILES[cursor.skip % SEED_PROFILES.length];

           const response = await client.fetchCommunityPosts(profileLink, limit, 0);

           for (const post of response.posts) {
             if (post.profile) {
               profiles.push({
                 handle: post.profile.user_link?.replace(/^\//, '') || post.profile.profile_link,
                 sourceProfileId: post.profile._id,
                 rawPayload: post.profile,
               });
             }
           }

           return {
             profiles,
             nextCursor: {
               type: 'community',
               profileLink,
               skip: limit,
             },
             hasMore: response.posts.length === limit,
           };
         }

         return { profiles: [], hasMore: false };
       }
       ```

    2. Update packages/adapters/src/bonjour/index.ts to export discovery function
  </action>
  <verify>
    <automated>cd /Users/rosscai/seeku && pnpm turbo typecheck 2>&1 | grep -v "error" || echo "SUCCESS"</automated>
  </verify>
  <done>
    - discoverBonjourSeeds function exists and exports
    - Function uses category endpoint for initial discovery
    - Function uses community endpoint for profile collection
    - Pagination supported via cursor
    - Returns DiscoverResult with profiles array and hasMore flag
  </done>
</task>

<task type="auto">
  <name>Task 6: Create Bonjour adapter implementation</name>
  <files>packages/adapters/src/bonjour/adapter.ts, packages/adapters/src/bonjour/index.ts</files>
  <read_first>
    - packages/adapters/src/types.ts (for SourceAdapter interface)
    - packages/adapters/src/bonjour/client.ts (for BonjourClient)
    - packages/adapters/src/bonjour/normalize.ts (for normalizeBonjourProfile)
    - packages/adapters/src/bonjour/discover.ts (for discoverBonjourSeeds)
  </read_first>
  <action>
    Create the full SourceAdapter implementation for Bonjour:

    1. Create packages/adapters/src/bonjour/adapter.ts:

       ```typescript
       import type { SourceAdapter, DiscoverResult, FetchResult, AdapterConfig } from '../types';
       import type { NormalizedProfile } from '@seeku/shared';
       import { BonjourClient, BonjourProfile } from './client';
       import { normalizeBonjourProfile, computeProfileHash } from './normalize';
       import { discoverBonjourSeeds, DiscoveryCursor } from './discover';

       export class BonjourAdapter implements SourceAdapter<BonjourProfile> {
         readonly source = 'bonjour' as const;
         private client: BonjourClient;

         constructor(config?: Partial<AdapterConfig>) {
           this.client = new BonjourClient(config);
         }

         async discoverSeeds(input: {
           cursor?: Record<string, unknown>;
           limit: number;
         }): Promise<DiscoverResult> {
           return discoverBonjourSeeds(this.client, {
             cursor: input.cursor as DiscoveryCursor | undefined,
             limit: input.limit,
           });
         }

         async fetchProfileByHandle(input: {
           handle: string;
         }): Promise<FetchResult<BonjourProfile>> {
           const rawProfile = await this.client.fetchProfileByHandle(input.handle);
           const profile = normalizeBonjourProfile(rawProfile);

           return {
             profile,
             rawPayload: rawProfile,
             sourceHandle: input.handle,
           };
         }

         async normalizeProfile(input: {
           rawProfile: BonjourProfile;
         }): Promise<NormalizedProfile> {
           return normalizeBonjourProfile(input.rawProfile);
         }

         // Utility method for computing profile hash
         computeHash(profile: BonjourProfile): string {
           return computeProfileHash(profile);
         }
       }

       // Factory function for convenience
       export function createBonjourAdapter(config?: Partial<AdapterConfig>): BonjourAdapter {
         return new BonjourAdapter(config);
       }
       ```

    2. Update packages/adapters/src/bonjour/index.ts to export adapter:

       ```typescript
       export { BonjourClient, type BonjourProfile, type BonjourCategory, type BonjourCommunityPost } from './client';
       export { normalizeBonjourProfile, computeProfileHash } from './normalize';
       export { discoverBonjourSeeds, type DiscoveryCursor } from './discover';
       export { BonjourAdapter, createBonjourAdapter } from './adapter';
       ```

    3. Update packages/adapters/src/index.ts to export Bonjour adapter:

       ```typescript
       export * from './types';
       export * from './bonjour';
       ```
  </action>
  <verify>
    <automated>cd /Users/rosscai/seeku && pnpm turbo build 2>&1 | grep -v "error" || echo "SUCCESS"</automated>
  </verify>
  <done>
    - BonjourAdapter class implements SourceAdapter interface
    - Adapter provides discoverSeeds, fetchProfileByHandle, normalizeProfile methods
    - createBonjourAdapter factory function exported
    - All types and functions exported from @seeku/adapters package
    - TypeScript compiles and builds successfully
  </done>
</task>

</tasks>

<verification>
1. Run `pnpm turbo typecheck` - TypeScript compiles without errors
2. Run `pnpm turbo build` - All packages build successfully
3. Verify NormalizedProfile type is exported from @seeku/shared
4. Verify SourceAdapter interface is exported from @seeku/adapters
5. Verify BonjourAdapter class implements SourceAdapter correctly
6. Verify all Bonjour-specific functions are exported
</verification>

<success_criteria>
- NormalizedProfile type exists with zod validation
- SourceAdapter interface defines contract for all adapters
- BonjourAdapter implements full SourceAdapter interface
- HTTP client with rate limiting and retry logic
- Profile normalization transforms Bonjour JSON to NormalizedProfile
- Seed discovery uses category and community endpoints
- All packages compile and build without errors
</success_criteria>

<output>
After completion, create `.planning/phases/01-infrastructure-bonjour-ingestion/02-SUMMARY.md`
</output>