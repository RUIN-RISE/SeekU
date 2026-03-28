import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { NormalizedProfile, SourceName } from "@seeku/shared";

import type { SeekuDatabase } from "./index.js";
import {
  optOutRequests,
  sourceProfiles,
  sourceSyncRuns,
  type OptOutRequest,
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
  rawPayload: Record<string, unknown>;
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

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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
  const normalizedPayload = JSON.parse(JSON.stringify(input.profile)) as Record<string, unknown>;

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
      rawPayload: input.rawPayload,
      normalizedPayload,
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
        rawPayload: input.rawPayload,
        normalizedPayload,
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
    rawPayload: toRecord(rawPayload),
    profileHash,
    lastSyncRunId,
    isDeleted
  };
}
