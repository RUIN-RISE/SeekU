import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Alias, NormalizedProfile, SourceName } from "@seeku/shared";

import type { SeekuDatabase } from "./index.js";
import {
  evidenceItems,
  optOutRequests,
  personAliases,
  personIdentities,
  persons,
  sourceProfiles,
  sourceSyncRuns,
  type EvidenceType,
  type OptOutRequest,
  type Person,
  type PersonAlias,
  type PersonIdentity,
  type SourceProfile,
  type SyncStatus
} from "./schema.js";

export interface StartSyncRunInput {
  source: SourceName;
  jobName: string;
  cursor?: Record<string, unknown>;
}

export interface CompleteSyncRunInput {
  runId: string;
  status: SyncStatus;
  cursor?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  errorMessage?: string;
}

export interface UpsertSourceProfileInput {
  profile: NormalizedProfile;
  rawPayload: unknown;
  profileHash: string;
  lastSyncRunId?: string;
  isDeleted?: boolean;
}

export interface CreateOptOutRequestInput {
  source?: SourceName;
  sourceHandle?: string;
  requesterContact: string;
  reason?: string;
  status?: string;
}

export interface CreatePersonInput {
  primaryName: string;
  primaryHeadline?: string;
  summary?: string;
  primaryLocation?: string;
  avatarUrl?: string;
  searchStatus?: "active" | "hidden" | "claimed";
  confidenceScore?: number;
}

export interface CreatePersonIdentityInput {
  personId: string;
  sourceProfileId: string;
  matchScore: number;
  matchReason: Array<{ signal: string; confidence: number }>;
  isPrimary?: boolean;
}

export interface CreatePersonAliasInput {
  personId: string;
  aliasType: string;
  aliasValue: string;
  source: string;
  confidenceScore?: number;
}

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

const JSON_PARSE_MAX_DEPTH = 3;

function unwrapJsonString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof String) {
    return value.valueOf();
  }

  return null;
}

export function coerceJsonObject(value: unknown): Record<string, unknown> {
  let current = value;

  for (let depth = 0; depth < JSON_PARSE_MAX_DEPTH; depth += 1) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return current as Record<string, unknown>;
    }

    const stringValue = unwrapJsonString(current);
    if (stringValue === null) {
      return {};
    }

    const trimmed = stringValue.trim();
    if (!trimmed) {
      return {};
    }

    try {
      current = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }

  return {};
}

function toJsonbSql(value: unknown) {
  const json = JSON.stringify(coerceJsonObject(value)).replace(/'/g, "''");
  return sql.raw(`'${json}'::jsonb`);
}

function toNumericString(value: number | undefined, fallback = 0) {
  const target = value ?? fallback;
  return target.toFixed(4);
}

export async function startSourceSyncRun(db: SeekuDatabase, input: StartSyncRunInput) {
  const [run] = await db
    .insert(sourceSyncRuns)
    .values({
      source: input.source,
      jobName: input.jobName,
      cursor: input.cursor ?? null
    })
    .returning();

  return run;
}

export async function completeSourceSyncRun(db: SeekuDatabase, input: CompleteSyncRunInput) {
  const [run] = await db
    .update(sourceSyncRuns)
    .set({
      status: input.status,
      finishedAt: sql`now()`,
      cursor: input.cursor ?? null,
      stats: input.stats ?? {},
      errorMessage: input.errorMessage ?? null
    })
    .where(eq(sourceSyncRuns.id, input.runId))
    .returning();

  return run;
}

export async function getSourceSyncRun(db: SeekuDatabase, runId: string) {
  const [run] = await db
    .select()
    .from(sourceSyncRuns)
    .where(eq(sourceSyncRuns.id, runId))
    .limit(1);

  return run ?? null;
}

export async function upsertSourceProfile(db: SeekuDatabase, input: UpsertSourceProfileInput) {
  // Deep copy to ensure plain object for DB and omit undefined/complex types
  // Note: This will strip any 'undefined' values but keep 'null'
  const normalizedPayload = coerceJsonObject(JSON.parse(JSON.stringify(input.profile)));
  const rawPayload = coerceJsonObject(input.rawPayload);

  const [profile] = await db
    .insert(sourceProfiles)
    .values({
      source: input.profile.source,
      sourceProfileId: input.profile.sourceProfileId,
      sourceHandle: input.profile.sourceHandle,
      canonicalUrl: input.profile.canonicalUrl,
      displayName: input.profile.displayName,
      headline: input.profile.headline,
      bio: input.profile.bio,
      locationText: input.profile.locationText,
      avatarUrl: input.profile.avatarUrl,
      rawPayload: toJsonbSql(rawPayload),
      normalizedPayload: toJsonbSql(normalizedPayload),
      profileHash: input.profileHash,
      lastSyncRunId: input.lastSyncRunId,
      isDeleted: input.isDeleted ?? false
    })
    .onConflictDoUpdate({
      target: [sourceProfiles.source, sourceProfiles.sourceHandle],
      set: {
        sourceProfileId: input.profile.sourceProfileId,
        canonicalUrl: input.profile.canonicalUrl,
        displayName: input.profile.displayName,
        headline: input.profile.headline,
        bio: input.profile.bio,
        locationText: input.profile.locationText,
        avatarUrl: input.profile.avatarUrl,
        rawPayload: toJsonbSql(rawPayload),
        normalizedPayload: toJsonbSql(normalizedPayload),
        profileHash: input.profileHash,
        lastSeenAt: sql`now()`,
        lastSyncedAt: sql`now()`,
        lastSyncRunId: input.lastSyncRunId
      }
    })
    .returning();

  return profile;
}

export async function getSourceProfileByHandle(
  db: SeekuDatabase,
  source: SourceName,
  handle: string
) {
  const [profile] = await db
    .select()
    .from(sourceProfiles)
    .where(and(eq(sourceProfiles.source, source), eq(sourceProfiles.sourceHandle, handle)))
    .limit(1);

  return profile ?? null;
}

export async function getSourceProfileById(db: SeekuDatabase, profileId: string) {
  const [profile] = await db
    .select()
    .from(sourceProfiles)
    .where(eq(sourceProfiles.id, profileId))
    .limit(1);

  return profile ?? null;
}

export async function listSourceProfilesBySource(
  db: SeekuDatabase,
  source: SourceName,
  limit = 100
) {
  return db
    .select()
    .from(sourceProfiles)
    .where(eq(sourceProfiles.source, source))
    .orderBy(desc(sourceProfiles.lastSyncedAt))
    .limit(limit);
}

export async function listSourceProfilesByHandles(
  db: SeekuDatabase,
  source: SourceName,
  handles: string[]
) {
  if (handles.length === 0) {
    return [];
  }

  return db
    .select()
    .from(sourceProfiles)
    .where(and(eq(sourceProfiles.source, source), inArray(sourceProfiles.sourceHandle, handles)))
    .orderBy(desc(sourceProfiles.lastSyncedAt));
}

export async function listSourceProfilesWithoutIdentity(
  db: SeekuDatabase,
  source: SourceName,
  limit = 100
) {
  const rows = await db
    .select({
      profile: sourceProfiles
    })
    .from(sourceProfiles)
    .leftJoin(personIdentities, eq(sourceProfiles.id, personIdentities.sourceProfileId))
    .where(and(eq(sourceProfiles.source, source), isNull(personIdentities.id)))
    .orderBy(desc(sourceProfiles.lastSyncedAt))
    .limit(limit);

  return rows.map((row) => row.profile);
}

export async function createOptOutRequest(db: SeekuDatabase, input: CreateOptOutRequestInput) {
  const [request] = await db
    .insert(optOutRequests)
    .values({
      source: input.source,
      sourceHandle: input.sourceHandle,
      requesterContact: input.requesterContact,
      reason: input.reason,
      status: input.status ?? "pending"
    })
    .returning();

  return request;
}

export async function getOptOutRequest(db: SeekuDatabase, requestId: string) {
  const [request] = await db
    .select()
    .from(optOutRequests)
    .where(eq(optOutRequests.id, requestId))
    .limit(1);

  return request ?? null;
}

export async function processOptOutRequest(db: SeekuDatabase, requestId: string) {
  return db.transaction(async (tx) => {
    const request = await getOptOutRequest(tx, requestId);

    if (!request) {
      throw new Error(`Opt-out request ${requestId} not found.`);
    }

    const [updatedRequest] = await tx
      .update(optOutRequests)
      .set({
        status: "processed",
        resolvedAt: sql`now()`
      })
      .where(eq(optOutRequests.id, requestId))
      .returning();

    const hiddenProfiles =
      request.source && request.sourceHandle
        ? await tx
            .update(sourceProfiles)
            .set({
              isDeleted: true,
              lastSyncedAt: sql`now()`
            })
            .where(
              and(
                eq(sourceProfiles.source, request.source),
                eq(sourceProfiles.sourceHandle, request.sourceHandle)
              )
            )
            .returning({
              id: sourceProfiles.id,
              sourceHandle: sourceProfiles.sourceHandle
            })
        : [];

    return {
      request: updatedRequest,
      hiddenProfiles
    };
  });
}

export async function listProcessedOptOutsByHandles(
  db: SeekuDatabase,
  source: SourceName,
  handles: string[]
) {
  if (handles.length === 0) {
    return [];
  }

  return db
    .select({
      sourceHandle: optOutRequests.sourceHandle
    })
    .from(optOutRequests)
    .where(
      and(
        eq(optOutRequests.source, source),
        eq(optOutRequests.status, "processed"),
        inArray(optOutRequests.sourceHandle, handles)
      )
    );
}

export async function isHandleOptedOut(db: SeekuDatabase, source: SourceName, handle: string) {
  const rows = await listProcessedOptOutsByHandles(db, source, [handle]);
  return rows.length > 0;
}

export async function createPerson(db: SeekuDatabase, input: CreatePersonInput) {
  const [person] = await db
    .insert(persons)
    .values({
      primaryName: input.primaryName,
      primaryHeadline: input.primaryHeadline,
      summary: input.summary,
      primaryLocation: input.primaryLocation,
      avatarUrl: input.avatarUrl,
      searchStatus: input.searchStatus ?? "active",
      confidenceScore: toNumericString(input.confidenceScore)
    })
    .returning();

  return person;
}

export async function getPersonById(db: SeekuDatabase, personId: string) {
  const [person] = await db.select().from(persons).where(eq(persons.id, personId)).limit(1);
  return person ?? null;
}

export async function updatePerson(
  db: SeekuDatabase,
  personId: string,
  input: Partial<CreatePersonInput>
) {
  const [person] = await db
    .update(persons)
    .set({
      primaryName: input.primaryName,
      primaryHeadline: input.primaryHeadline,
      summary: input.summary,
      primaryLocation: input.primaryLocation,
      avatarUrl: input.avatarUrl,
      searchStatus: input.searchStatus,
      confidenceScore:
        input.confidenceScore === undefined ? undefined : toNumericString(input.confidenceScore),
      updatedAt: sql`now()`
    })
    .where(eq(persons.id, personId))
    .returning();

  return person ?? null;
}

export async function updatePersonConfidence(db: SeekuDatabase, personId: string, score: number) {
  const [person] = await db
    .update(persons)
    .set({
      confidenceScore: toNumericString(score),
      updatedAt: sql`now()`
    })
    .where(eq(persons.id, personId))
    .returning();

  return person ?? null;
}

export async function listAllPersons(db: SeekuDatabase, limit = 100) {
  return db.select().from(persons).orderBy(desc(persons.updatedAt)).limit(limit);
}

export async function createPersonIdentity(db: SeekuDatabase, input: CreatePersonIdentityInput) {
  const [identity] = await db
    .insert(personIdentities)
    .values({
      personId: input.personId,
      sourceProfileId: input.sourceProfileId,
      matchScore: toNumericString(input.matchScore),
      matchReason: input.matchReason,
      isPrimary: input.isPrimary ?? false
    })
    .onConflictDoUpdate({
      target: [personIdentities.sourceProfileId],
      set: {
        personId: input.personId,
        matchScore: toNumericString(input.matchScore),
        matchReason: input.matchReason,
        isPrimary: input.isPrimary ?? false
      }
    })
    .returning();

  return identity;
}

export async function listIdentitiesByPersonId(db: SeekuDatabase, personId: string) {
  return db
    .select()
    .from(personIdentities)
    .where(eq(personIdentities.personId, personId))
    .orderBy(desc(personIdentities.createdAt));
}

export async function getIdentityBySourceProfileId(db: SeekuDatabase, sourceProfileId: string) {
  const [identity] = await db
    .select()
    .from(personIdentities)
    .where(eq(personIdentities.sourceProfileId, sourceProfileId))
    .limit(1);

  return identity ?? null;
}

export async function createPersonAlias(db: SeekuDatabase, input: CreatePersonAliasInput) {
  const [alias] = await db
    .insert(personAliases)
    .values({
      personId: input.personId,
      aliasType: input.aliasType,
      aliasValue: input.aliasValue,
      source: input.source,
      confidenceScore: toNumericString(input.confidenceScore)
    })
    .onConflictDoNothing()
    .returning();

  return alias ?? null;
}

export async function listAliasesByPersonId(db: SeekuDatabase, personId: string) {
  return db
    .select()
    .from(personAliases)
    .where(eq(personAliases.personId, personId))
    .orderBy(desc(personAliases.createdAt));
}

export async function findPersonByAlias(db: SeekuDatabase, aliasType: string, aliasValue: string) {
  const [alias] = await db
    .select()
    .from(personAliases)
    .where(and(eq(personAliases.aliasType, aliasType), eq(personAliases.aliasValue, aliasValue)))
    .limit(1);

  if (!alias) {
    return null;
  }

  return getPersonById(db, alias.personId);
}

export async function createEvidenceItem(db: SeekuDatabase, input: CreateEvidenceItemInput) {
  const [item] = await db
    .insert(evidenceItems)
    .values({
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
    })
    .onConflictDoNothing()
    .returning();

  return item ?? null;
}

export async function listEvidenceByPersonId(db: SeekuDatabase, personId: string) {
  return db
    .select()
    .from(evidenceItems)
    .where(eq(evidenceItems.personId, personId))
    .orderBy(desc(evidenceItems.createdAt));
}

export async function listEvidenceByType(
  db: SeekuDatabase,
  personId: string,
  requestedEvidenceType: EvidenceType
) {
  return db
    .select()
    .from(evidenceItems)
    .where(
      and(eq(evidenceItems.personId, personId), eq(evidenceItems.evidenceType, requestedEvidenceType))
    )
    .orderBy(desc(evidenceItems.createdAt));
}

export async function countEvidenceByPersonId(db: SeekuDatabase, personId: string) {
  const [result] = await db
    .select({
      count: sql<number>`count(*)`
    })
    .from(evidenceItems)
    .where(eq(evidenceItems.personId, personId));

  return result?.count ?? 0;
}

export function serializeOptOutRequest(request: OptOutRequest | null) {
  if (!request) {
    return null;
  }

  return {
    ...request,
    createdAt: request.createdAt?.toISOString?.() ?? request.createdAt,
    resolvedAt: request.resolvedAt?.toISOString?.() ?? request.resolvedAt
  };
}

export function profileToUpsertPayload(
  profile: NormalizedProfile,
  rawPayload: unknown,
  profileHash: string,
  lastSyncRunId?: string,
  isDeleted?: boolean
): UpsertSourceProfileInput {
  return {
    profile,
    rawPayload: coerceJsonObject(rawPayload),
    profileHash,
    lastSyncRunId,
    isDeleted
  };
}

export function extractAliasesFromNormalizedProfile(profile: SourceProfile | NormalizedProfile): Alias[] {
  // Type guard to check if profile is already NormalizedProfile
  if ("source" in profile && "aliases" in profile) {
    return profile.aliases ?? [];
  }
  
  // Otherwise, coerce from normalizedPayload
  const coerced = coerceJsonObject(profile.normalizedPayload);
  
  // Validate that coerced result has expected structure
  if (!coerced || typeof coerced !== "object") {
    return [];
  }
  
  const aliases = coerced.aliases;
  if (!Array.isArray(aliases)) {
    return [];
  }
  
  // Filter and validate each alias
  return aliases.filter((alias): alias is Alias => {
    return (
      alias !== null &&
      typeof alias === "object" &&
      typeof alias.type === "string" &&
      typeof alias.value === "string"
    );
  });
}

export async function ensurePersonAliasesFromProfile(
  db: SeekuDatabase,
  personId: string,
  profile: SourceProfile
) {
  const aliases = extractAliasesFromNormalizedProfile(profile);

  for (const alias of aliases) {
    await createPersonAlias(db, {
      personId,
      aliasType: alias.type,
      aliasValue: alias.value,
      source: profile.source,
      confidenceScore: alias.confidence
    });
  }

  await createPersonAlias(db, {
    personId,
    aliasType: profile.source,
    aliasValue: profile.sourceHandle,
    source: profile.source,
    confidenceScore: 1
  });
}
