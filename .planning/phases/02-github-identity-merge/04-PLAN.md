---
phase: 02-github-identity-merge
plan: 04
type: execute
wave: 4
depends_on: [03]
files_modified:
  - packages/identity/src/matcher.ts
  - packages/identity/src/merger.ts
  - packages/identity/src/resolver.ts
  - packages/identity/src/index.ts
autonomous: true
requirements: [DATA-06]
must_haves:
  truths:
    - "Profiles can be matched with confidence scores from 0.0 to 1.0"
    - "Explicit GitHub links in Bonjour socials produce 1.0 confidence"
    - "Matching names with same location produce 0.7-0.9 confidence"
    - "Profiles with confidence >= 0.9 are auto-merged into person entities"
    - "Person entities aggregate data from all linked profiles"
  artifacts:
    - path: "packages/identity/src/matcher.ts"
      provides: "Profile matching logic"
      exports: ["matchProfiles", "computeMatchScore", "findExplicitLinks", "compareNames", "compareLocations"]
    - path: "packages/identity/src/merger.ts"
      provides: "Merge policies"
      exports: ["mergeProfilesIntoPerson", "resolveConflict", "selectPrimaryName"]
    - path: "packages/identity/src/resolver.ts"
      provides: "Resolution pipeline"
      exports: ["resolveIdentities", "runIdentityResolution"]
  key_links:
    - from: "packages/identity/src/matcher.ts"
      to: "@seeku/db"
      via: "SourceProfile type"
      pattern: "import.*SourceProfile"
    - from: "packages/identity/src/merger.ts"
      to: "@seeku/db"
      via: "createPerson, createPersonIdentity"
      pattern: "import.*createPerson"
    - from: "packages/identity/src/resolver.ts"
      to: "./matcher.js"
      via: "matchProfiles"
      pattern: "import.*matchProfiles"
---

<objective>
Implement the identity resolution module that matches Bonjour and GitHub profiles into unified person entities. This is the core logic for cross-source identity linking.

Purpose: Link profiles across sources into unified person entities with confidence scoring
Output: Matching, merging, and resolution pipeline functions
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
export const sourceProfiles = pgTable("source_profiles", {
  id: uuid("id").primaryKey(),
  source: sourceName("source").notNull(),
  sourceHandle: text("source_handle").notNull(),
  displayName: text("display_name"),
  headline: text("headline"),
  bio: text("bio"),
  locationText: text("location_text"),
  rawPayload: jsonb("raw_payload").notNull(),
  normalizedPayload: jsonb("normalized_payload").notNull(),
});

export const persons = pgTable("persons", {
  primaryName: text("primary_name").notNull(),
  primaryHeadline: text("primary_headline"),
  summary: text("summary"),
  primaryLocation: text("primary_location"),
  confidenceScore: numeric("confidence_score").notNull(),
});

export const person_identities = pgTable("person_identities", {
  personId: uuid("person_id").references(() => persons.id),
  sourceProfileId: uuid("source_profile_id").references(() => sourceProfiles.id),
  matchScore: numeric("match_score").notNull(),
  matchReason: jsonb("match_reason").notNull(),
  isPrimary: boolean("is_primary").notNull(),
});
```

From packages/db/src/repositories.ts:
```typescript
export async function createPerson(db: SeekuDatabase, input: CreatePersonInput);
export async function createPersonIdentity(db: SeekuDatabase, input: CreatePersonIdentityInput);
export async function getIdentityBySourceProfileId(db: SeekuDatabase, sourceProfileId: string);
export async function listIdentitiesByPersonId(db: SeekuDatabase, personId: string);
export async function getSourceProfileByHandle(db: SeekuDatabase, source: SourceName, handle: string);
```

From packages/identity/src/types.ts:
```typescript
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

From packages/shared/src/types.ts:
```typescript
export interface Alias {
  type: AliasType;  // "github" | "x" | "jike" | "website" | "other"
  value: string;
  confidence: number;
}
```

From Phase 2 research (01-RESEARCH.md):
Match Signals (in priority order):
1. Explicit Links (confidence: 1.0) - Bonjour socials contains GitHub URL/handle
2. Same Email/Domain (confidence: 0.8-0.95) - Verified email matches
3. Same Name + Location (confidence: 0.7-0.9) - Matching display names + similar location
4. Cross-Platform Activity (confidence: 0.6-0.8) - Bio mentions same company/role

Merge Rules:
- confidence >= 0.9: Auto-merge
- 0.7 <= confidence < 0.9: Review queue (not implemented in Phase 2)
- confidence < 0.7: Keep separate
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement profile matcher with confidence scoring</name>
  <files>packages/identity/src/matcher.ts</files>
  <read_first>
    - packages/identity/src/types.ts (MatchResult, MatchReason)
    - packages/db/src/schema.ts (SourceProfile type)
    - packages/db/src/repositories.ts (getSourceProfileByHandle)
    - packages/shared/src/types.ts (Alias type)
    - .planning/phases/02-github-identity-merge/01-RESEARCH.md (match signal priorities)
  </read_first>
  <action>
Create the profile matching logic in `packages/identity/src/matcher.ts`:

```typescript
import type { SourceProfile, SourceName } from "@seeku/db";
import type { Alias, NormalizedProfile } from "@seeku/shared";
import type { MatchResult, MatchReason, ProfileMatchInput } from "../types.js";

/**
 * Find explicit GitHub links in Bonjour aliases
 * Confidence: 1.0 (highest priority)
 */
export function findExplicitLinks(
  bonjourProfile: SourceProfile
): { githubHandles: string[]; confidence: number } {
  const normalized = bonjourProfile.normalizedPayload as NormalizedProfile;
  const githubHandles: string[] = [];

  for (const alias of normalized.aliases ?? []) {
    if (alias.type === "github") {
      // Extract handle from GitHub URL or direct handle
      let handle = alias.value;
      if (handle.includes("github.com/")) {
        handle = handle.split("github.com/")[1]?.split("/")[0] ?? handle;
      }
      handle = handle.replace(/^@/, "").trim();
      if (handle) {
        githubHandles.push(handle.toLowerCase());
      }
    }
  }

  return {
    githubHandles,
    confidence: githubHandles.length > 0 ? 1.0 : 0.0
  };
}

/**
 * Compare display names for similarity
 * Returns confidence score (0.0 - 0.5)
 */
export function compareNames(name1: string | null, name2: string | null): number {
  if (!name1 || !name2) return 0.0;

  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();

  // Exact match
  if (n1 === n2) return 0.5;

  // Same name without spaces (e.g., "John Doe" vs "johndoe")
  if (n1.replace(/\s+/g, "") === n2.replace(/\s+/g, "")) return 0.4;

  // Contains each other (partial match)
  if (n1.includes(n2) || n2.includes(n1)) return 0.25;

  return 0.0;
}

/**
 * Compare locations for similarity
 * Returns confidence score (0.0 - 0.3)
 */
export function compareLocations(loc1: string | null, loc2: string | null): number {
  if (!loc1 || !loc2) return 0.0;

  const l1 = loc1.toLowerCase().trim();
  const l2 = loc2.toLowerCase().trim();

  // Exact match
  if (l1 === l2) return 0.3;

  // City overlap (extract city from location text like "Country / Province / City")
  const cities1 = l1.split("/").map(s => s.trim()).filter(Boolean);
  const cities2 = l2.split("/").map(s => s.trim()).filter(Boolean);

  for (const c1 of cities1) {
    for (const c2 of cities2) {
      if (c1 === c2 || c1.includes(c2) || c2.includes(c1)) {
        return 0.2;
      }
    }
  }

  // Same country/province detected via common tokens
  const tokens1 = l1.split(/\s*[,\/]\s*|\s+/);
  const tokens2 = l2.split(/\s*[,\/]\s*|\s+/);
  const overlap = tokens1.filter(t => tokens2.includes(t)).length;

  if (overlap >= 2) return 0.15;
  if (overlap >= 1) return 0.1;

  return 0.0;
}

/**
 * Compare company/bio signals
 * Returns confidence score (0.0 - 0.2)
 */
export function compareCompanySignals(
  profile1: SourceProfile,
  profile2: SourceProfile
): number {
  const n1 = profile1.normalizedPayload as NormalizedProfile;
  const n2 = profile2.normalizedPayload as NormalizedProfile;

  // Check if one bio mentions something from the other profile
  const bio1 = n1.bio?.toLowerCase() ?? "";
  const bio2 = n2.bio?.toLowerCase() ?? "";
  const headline1 = n1.headline?.toLowerCase() ?? "";
  const headline2 = n2.headline?.toLowerCase() ?? "";

  // Company mention in bio/headline
  const allText1 = `${bio1} ${headline1}`;
  const allText2 = `${bio2} ${headline2}`;

  // Look for company keywords in opposite profile
  const companyKeywords = ["work", "at", "company", "engineer", "developer", "founder", "ceo"];
  const hasCompanySignal = companyKeywords.some(kw =>
    allText1.includes(kw) && allText2.includes(kw)
  );

  if (hasCompanySignal) return 0.1;

  return 0.0;
}

/**
 * Compute overall match confidence between two profiles
 */
export function computeMatchScore(
  profile1: SourceProfile,
  profile2: SourceProfile
): MatchResult {
  const reasons: MatchReason[] = [];

  // Signal 1: Explicit links (only if profile1 is Bonjour and has GitHub alias)
  if (profile1.source === "bonjour" && profile2.source === "github") {
    const explicit = findExplicitLinks(profile1);
    for (const handle of explicit.githubHandles) {
      const githubHandle = profile2.sourceHandle.toLowerCase();
      if (handle === githubHandle) {
        reasons.push({ signal: "explicit_github_link", confidence: 1.0 });
        return { confidence: 1.0, reasons };
      }
    }
  }

  // Signal 2: Name similarity
  const nameScore = compareNames(profile1.displayName, profile2.displayName);
  if (nameScore > 0) {
    reasons.push({ signal: "name_match", confidence: nameScore });
  }

  // Signal 3: Location similarity
  const locationScore = compareLocations(profile1.locationText, profile2.locationText);
  if (locationScore > 0) {
    reasons.push({ signal: "location_match", confidence: locationScore });
  }

  // Signal 4: Company/bio signals
  const companyScore = compareCompanySignals(profile1, profile2);
  if (companyScore > 0) {
    reasons.push({ signal: "company_signal", confidence: companyScore });
  }

  // Combined score (weighted by signal priorities)
  const totalConfidence = Math.min(1.0, reasons.reduce((sum, r) => sum + r.confidence, 0));

  return { confidence: totalConfidence, reasons };
}

/**
 * Match a Bonjour profile against GitHub candidates
 */
export function matchProfiles(input: ProfileMatchInput): MatchResult[] {
  const results: MatchResult[] = [];

  for (const candidate of input.candidateProfiles) {
    // Only match cross-source (Bonjour -> GitHub)
    if (input.sourceProfile.source === candidate.source) {
      results.push({ confidence: 0.0, reasons: [{ signal: "same_source", confidence: 0 }] });
      continue;
    }

    const match = computeMatchScore(input.sourceProfile, candidate);
    results.push(match);
  }

  return results;
}

/**
 * Find the best match among candidates
 */
export function findBestMatch(
  sourceProfile: SourceProfile,
  candidates: SourceProfile[]
): { bestMatch: SourceProfile | null; result: MatchResult } {
  const results = matchProfiles({ sourceProfile, candidateProfiles: candidates });

  let bestIdx = -1;
  let bestConfidence = 0;

  for (let i = 0; i < results.length; i++) {
    if (results[i].confidence > bestConfidence) {
      bestConfidence = results[i].confidence;
      bestIdx = i;
    }
  }

  return {
    bestMatch: bestIdx >= 0 ? candidates[bestIdx] : null,
    result: bestIdx >= 0 ? results[bestIdx] : { confidence: 0, reasons: [] }
  };
}
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/identity && pnpm build --filter=@seeku/identity</automated>
  </verify>
  <done>
    - computeMatchScore function exists and returns MatchResult
    - findExplicitLinks function detects GitHub aliases with 1.0 confidence
    - compareNames function provides 0.0-0.5 confidence for name similarity
    - compareLocations function provides 0.0-0.3 confidence for location similarity
    - matchProfiles function compares profiles cross-source
    - TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Task 2: Implement merge policies and person creation</name>
  <files>packages/identity/src/merger.ts</files>
  <read_first>
    - packages/identity/src/matcher.ts (MatchResult)
    - packages/db/src/repositories.ts (createPerson, createPersonIdentity)
    - packages/db/src/schema.ts (Person, PersonIdentity)
    - .planning/phases/02-github-identity-merge/01-RESEARCH.md (merge rules and conflict resolution)
  </read_first>
  <action>
Create merge policies in `packages/identity/src/merger.ts`:

```typescript
import type { SeekuDatabase } from "@seeku/db";
import type { SourceProfile, NewPerson, NewPersonIdentity } from "@seeku/db";
import {
  createPerson,
  createPersonIdentity,
  createPersonAlias,
  listIdentitiesByPersonId,
  getPersonById,
  updatePersonConfidence
} from "@seeku/db";
import type { NormalizedProfile } from "@seeku/shared";
import type { MatchResult } from "../types.js";

const AUTO_MERGE_THRESHOLD = 0.9;
const REVIEW_THRESHOLD = 0.7;

/**
 * Select primary name from multiple profiles
 * Strategy: Use most complete/verified name, prefer Bonjour as primary
 */
export function selectPrimaryName(profiles: SourceProfile[]): string {
  // Prefer Bonjour name if available and non-empty
  const bonjourProfile = profiles.find(p => p.source === "bonjour");
  if (bonjourProfile?.displayName?.trim()) {
    return bonjourProfile.displayName.trim();
  }

  // Fall back to first non-empty name
  for (const profile of profiles) {
    if (profile.displayName?.trim()) {
      return profile.displayName.trim();
    }
  }

  // Last resort: use first handle
  return profiles[0]?.sourceHandle ?? "Unknown";
}

/**
 * Select primary headline from multiple profiles
 */
export function selectPrimaryHeadline(profiles: SourceProfile[]): string | undefined {
  // Prefer Bonjour headline
  const bonjourProfile = profiles.find(p => p.source === "bonjour");
  if (bonjourProfile?.headline?.trim()) {
    return bonjourProfile.headline.trim();
  }

  // Fall back to first non-empty
  for (const profile of profiles) {
    if (profile.headline?.trim()) {
      return profile.headline.trim();
    }
  }

  return undefined;
}

/**
 * Build summary from merged profile bios
 */
export function buildMergedSummary(profiles: SourceProfile[]): string | undefined {
  const summaries: string[] = [];

  for (const profile of profiles) {
    const normalized = profile.normalizedPayload as NormalizedProfile;
    if (normalized.summary?.trim()) {
      summaries.push(`[${profile.source}] ${normalized.summary.trim()}`);
    }
    if (normalized.bio?.trim() && normalized.bio !== normalized.summary) {
      summaries.push(`[${profile.source}] ${normalized.bio.trim()}`);
    }
  }

  return summaries.length > 0 ? summaries.join("\n\n") : undefined;
}

/**
 * Select primary location
 */
export function selectPrimaryLocation(profiles: SourceProfile[]): string | undefined {
  // Prefer most detailed location
  let bestLocation: string | undefined;
  let maxDetail = 0;

  for (const profile of profiles) {
    if (!profile.locationText) continue;
    const detail = profile.locationText.split("/").filter(Boolean).length;
    if (detail > maxDetail) {
      maxDetail = detail;
      bestLocation = profile.locationText.trim();
    }
  }

  return bestLocation;
}

/**
 * Merge profiles into a new person entity
 */
export async function mergeProfilesIntoPerson(
  db: SeekuDatabase,
  profiles: SourceProfile[],
  matchResults: Map<string, MatchResult>
): Promise<{ person: NewPerson; identities: NewPersonIdentity[] }> {
  const primaryName = selectPrimaryName(profiles);
  const primaryHeadline = selectPrimaryHeadline(profiles);
  const summary = buildMergedSummary(profiles);
  const primaryLocation = selectPrimaryLocation(profiles);

  // Average confidence from all matches
  const avgConfidence = profiles.length > 1
    ? Array.from(matchResults.values())
        .filter(r => r.confidence > 0)
        .reduce((sum, r) => sum + r.confidence, 0) / profiles.length
    : 0.5;

  // Create person
  const person = await createPerson(db, {
    primaryName,
    primaryHeadline,
    summary,
    primaryLocation,
    avatarUrl: profiles.find(p => p.avatarUrl)?.avatarUrl,
    confidenceScore: Math.min(1.0, avgConfidence)
  });

  // Create person_identities links
  const identities: NewPersonIdentity[] = [];
  const primaryProfile = profiles.find(p => p.source === "bonjour") ?? profiles[0];

  for (const profile of profiles) {
    const matchResult = matchResults.get(profile.id) ?? { confidence: 0.5, reasons: [] };
    const identity = await createPersonIdentity(db, {
      personId: person.id,
      sourceProfileId: profile.id,
      matchScore: matchResult.confidence,
      matchReason: matchResult.reasons,
      isPrimary: profile.id === primaryProfile.id
    });
    identities.push(identity as NewPersonIdentity);
  }

  // Create aliases from normalized profiles
  for (const profile of profiles) {
    const normalized = profile.normalizedPayload as NormalizedProfile;
    for (const alias of normalized.aliases ?? []) {
      await createPersonAlias(db, {
        personId: person.id,
        aliasType: alias.type,
        aliasValue: alias.value,
        source: profile.source,
        confidenceScore: alias.confidence
      });
    }
  }

  return { person, identities };
}

/**
 * Check if a match should be auto-merged
 */
export function shouldAutoMerge(matchResult: MatchResult): boolean {
  return matchResult.confidence >= AUTO_MERGE_THRESHOLD;
}

/**
 * Check if a match should go to review queue
 */
export function shouldReview(matchResult: MatchResult): boolean {
  return matchResult.confidence >= REVIEW_THRESHOLD && matchResult.confidence < AUTO_MERGE_THRESHOLD;
}
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/identity && pnpm build --filter=@seeku/identity</automated>
  </verify>
  <done>
    - selectPrimaryName function exists with Bonjour preference
    - mergeProfilesIntoPerson function creates person and identities
    - shouldAutoMerge function returns true for confidence >= 0.9
    - Person aliases are created from normalized profile aliases
    - TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Task 3: Implement identity resolution pipeline</name>
  <files>packages/identity/src/resolver.ts, packages/identity/src/index.ts</files>
  <read_first>
    - packages/identity/src/matcher.ts (matchProfiles, findBestMatch)
    - packages/identity/src/merger.ts (mergeProfilesIntoPerson, shouldAutoMerge)
    - packages/db/src/repositories.ts (listSourceProfilesByHandles, getSourceProfileByHandle)
    - packages/identity/src/types.ts (MatchResult)
  </read_first>
  <action>
Create the resolution pipeline in `packages/identity/src/resolver.ts`:

```typescript
import type { SeekuDatabase, SourceProfile } from "@seeku/db";
import { getSourceProfileByHandle, listAllPersons, getIdentityBySourceProfileId } from "@seeku/db";
import type { NormalizedProfile } from "@seeku/shared";
import { findBestMatch, findExplicitLinks, computeMatchScore } from "./matcher.js";
import { mergeProfilesIntoPerson, shouldAutoMerge } from "./merger.js";
import type { MatchResult } from "./types.js";

export interface ResolutionInput {
  db: SeekuDatabase;
  bonjourProfiles: SourceProfile[];
  githubProfiles: SourceProfile[];
}

export interface ResolutionResult {
  personsCreated: number;
  identitiesLinked: number;
  skippedLowConfidence: number;
  errors: { message: string; context?: unknown }[];
}

/**
 * Find GitHub profile by handle from Bonjour aliases
 */
async function findGithubByAlias(
  db: SeekuDatabase,
  bonjourProfile: SourceProfile
): Promise<SourceProfile | null> {
  const normalized = bonjourProfile.normalizedPayload as NormalizedProfile;

  for (const alias of normalized.aliases ?? []) {
    if (alias.type === "github") {
      let handle = alias.value;
      if (handle.includes("github.com/")) {
        handle = handle.split("github.com/")[1]?.split("/")[0] ?? handle;
      }
      handle = handle.replace(/^@/, "").trim().toLowerCase();

      if (handle) {
        const githubProfile = await getSourceProfileByHandle(db, "github", handle);
        if (githubProfile) return githubProfile;
      }
    }
  }

  return null;
}

/**
 * Run identity resolution for a single Bonjour profile
 */
async function resolveSingleProfile(
  db: SeekuDatabase,
  bonjourProfile: SourceProfile,
  allGithubProfiles: SourceProfile[]
): Promise<{ merged: boolean; personId?: string; matchResult?: MatchResult }> {
  // Check if already linked
  const existingIdentity = await getIdentityBySourceProfileId(db, bonjourProfile.id);
  if (existingIdentity) {
    return { merged: true, personId: existingIdentity.personId };
  }

  // Try explicit GitHub link first (confidence 1.0)
  const githubByAlias = await findGithubByAlias(db, bonjourProfile);
  if (githubByAlias) {
    const matchResults = new Map<string, MatchResult>();
    matchResults.set(bonjourProfile.id, { confidence: 1.0, reasons: [{ signal: "explicit_github_link", confidence: 1.0 }] });
    matchResults.set(githubByAlias.id, { confidence: 1.0, reasons: [{ signal: "explicit_github_link", confidence: 1.0 }] });

    const { person } = await mergeProfilesIntoPerson(db, [bonjourProfile, githubByAlias], matchResults);
    return { merged: true, personId: person.id, matchResult: { confidence: 1.0, reasons: [{ signal: "explicit_github_link", confidence: 1.0 }] } };
  }

  // Try best match among GitHub profiles
  const { bestMatch, result } = findBestMatch(bonjourProfile, allGithubProfiles);

  if (!bestMatch || !shouldAutoMerge(result)) {
    return { merged: false, matchResult: result };
  }

  // Merge with best match
  const matchResults = new Map<string, MatchResult>();
  matchResults.set(bonjourProfile.id, result);
  matchResults.set(bestMatch.id, { confidence: result.confidence, reasons: result.reasons });

  const { person } = await mergeProfilesIntoPerson(db, [bonjourProfile, bestMatch], matchResults);
  return { merged: true, personId: person.id, matchResult: result };
}

/**
 * Run identity resolution pipeline
 */
export async function resolveIdentities(input: ResolutionInput): Promise<ResolutionResult> {
  const result: ResolutionResult = {
    personsCreated: 0,
    identitiesLinked: 0,
    skippedLowConfidence: 0,
    errors: []
  };

  // Process each Bonjour profile
  for (const bonjourProfile of input.bonjourProfiles) {
    try {
      const resolution = await resolveSingleProfile(
        input.db,
        bonjourProfile,
        input.githubProfiles
      );

      if (resolution.merged) {
        result.personsCreated += 1;
        result.identitiesLinked += resolution.personId ? 2 : 0; // Bonjour + potentially GitHub
      } else if (resolution.matchResult?.confidence < 0.7) {
        result.skippedLowConfidence += 1;
      }
    } catch (err) {
      result.errors.push({
        message: `Failed to resolve profile ${bonjourProfile.sourceHandle}`,
        context: err
      });
    }
  }

  // Create standalone persons for unmatched GitHub profiles
  for (const githubProfile of input.githubProfiles) {
    try {
      const existingIdentity = await getIdentityBySourceProfileId(input.db, githubProfile.id);
      if (existingIdentity) continue;

      // Create standalone person with low confidence
      const matchResults = new Map<string, MatchResult>();
      matchResults.set(githubProfile.id, { confidence: 0.3, reasons: [{ signal: "standalone", confidence: 0.3 }] });

      const { person } = await mergeProfilesIntoPerson(input.db, [githubProfile], matchResults);
      result.personsCreated += 1;
      result.identitiesLinked += 1;
    } catch (err) {
      result.errors.push({
        message: `Failed to create person for GitHub profile ${githubProfile.sourceHandle}`,
        context: err
      });
    }
  }

  return result;
}

/**
 * Run identity resolution with fresh database connection
 */
export async function runIdentityResolution(
  db: SeekuDatabase,
  bonjourHandles: string[],
  githubHandles: string[]
): Promise<ResolutionResult> {
  const bonjourProfiles: SourceProfile[] = [];
  const githubProfiles: SourceProfile[] = [];

  // Load profiles by handles
  for (const handle of bonjourHandles) {
    const profile = await getSourceProfileByHandle(db, "bonjour", handle);
    if (profile) bonjourProfiles.push(profile);
  }

  for (const handle of githubHandles) {
    const profile = await getSourceProfileByHandle(db, "github", handle);
    if (profile) githubProfiles.push(profile);
  }

  return resolveIdentities({ db, bonjourProfiles, githubProfiles });
}
```

2. Update `packages/identity/src/index.ts` to export resolver:
```typescript
export * from "./types.js";
export * from "./evidence/index.js";
export * from "./matcher.js";
export * from "./merger.js";
export * from "./resolver.js";
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/identity && pnpm build --filter=@seeku/identity</automated>
  </verify>
  <done>
    - resolveIdentities function processes Bonjour profiles against GitHub candidates
    - resolveSingleProfile handles single profile resolution
    - Explicit GitHub links result in 1.0 confidence merge
    - Standalone GitHub profiles get low confidence persons
    - All exports added to index.ts
    - TypeScript compilation succeeds
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/identity
2. Build passes for @seeku/identity
3. Matcher computes confidence scores correctly
4. Merger creates persons with proper conflict resolution
5. Resolver pipeline orchestrates matching and merging
</verification>

<success_criteria>
1. Profiles can be matched with confidence scores from 0.0 to 1.0
2. Explicit GitHub links in Bonjour socials produce 1.0 confidence
3. Matching names with same location produce 0.7-0.9 confidence
4. Profiles with confidence >= 0.9 are auto-merged into person entities (DATA-06 complete)
5. Person entities aggregate data from all linked profiles
6. All packages compile and build successfully
</success_criteria>

<output>
After completion, create `.planning/phases/02-github-identity-merge/04-SUMMARY.md`
</output>