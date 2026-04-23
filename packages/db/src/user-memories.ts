import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import type { SeekuDatabase } from "./index.js";
import {
  candidateFeedbackMemories,
  userMemories,
  userPreferences,
  type CandidateFeedbackMemory,
  type FeedbackSentiment,
  type NewCandidateFeedbackMemory,
  type NewUserMemory,
  type NewUserPreference,
  type UserMemory,
  type UserMemoryKind,
  type UserMemoryScopeKind,
  type UserMemorySource,
  type UserPreference
} from "./schema.js";

// ============================================================================
// Types
// ============================================================================

export type StructuredMemoryScope =
  | { kind: "global" }
  | { kind: "role"; role: string }
  | { kind: "location"; location: string }
  | { kind: "work_item"; workItemId: string };

export interface CreateUserMemoryInput {
  userId: string;
  kind: UserMemoryKind;
  scope: StructuredMemoryScope;
  content: Record<string, unknown>;
  source: UserMemorySource;
  confidence?: number;
  note?: string;
  expiresAt?: Date | null;
}

export interface ListUserMemoriesOptions {
  kind?: UserMemoryKind;
  scope?: StructuredMemoryScope;
  source?: UserMemorySource;
  includeExpired?: boolean;
  limit?: number;
}

export interface UpdateUserMemoryInput {
  content?: Record<string, unknown>;
  confidence?: number;
  note?: string;
  expiresAt?: Date | null;
}

// ============================================================================
// Scope Helpers
// ============================================================================

function scopeToColumns(scope: StructuredMemoryScope): {
  scopeKind: UserMemoryScopeKind;
  scopeValue: string | null;
} {
  switch (scope.kind) {
    case "global":
      return { scopeKind: "global", scopeValue: null };
    case "role":
      return { scopeKind: "role", scopeValue: scope.role };
    case "location":
      return { scopeKind: "location", scopeValue: scope.location };
    case "work_item":
      return { scopeKind: "work_item", scopeValue: scope.workItemId };
  }
}

export function columnsToScope(
  scopeKind: UserMemoryScopeKind,
  scopeValue: string | null
): StructuredMemoryScope {
  switch (scopeKind) {
    case "global":
      return { kind: "global" };
    case "role":
      return { kind: "role", role: scopeValue! };
    case "location":
      return { kind: "location", location: scopeValue! };
    case "work_item":
      return { kind: "work_item", workItemId: scopeValue! };
  }
}

// ============================================================================
// User Memory CRUD
// ============================================================================

export async function createUserMemory(
  db: SeekuDatabase,
  input: CreateUserMemoryInput
): Promise<UserMemory> {
  const { scopeKind, scopeValue } = scopeToColumns(input.scope);
  const now = new Date();

  const values: NewUserMemory = {
    userId: input.userId,
    kind: input.kind,
    scopeKind,
    scopeValue,
    content: input.content,
    source: input.source,
    confidence: input.confidence?.toString() ?? "1.0",
    note: input.note,
    expiresAt: input.expiresAt ?? null,
    createdAt: now,
    updatedAt: now
  };

  const [record] = await db.insert(userMemories).values(values).returning();
  return record;
}

export async function getUserMemory(
  db: SeekuDatabase,
  userId: string,
  memoryId: string
): Promise<UserMemory | null> {
  const [record] = await db
    .select()
    .from(userMemories)
    .where(and(eq(userMemories.id, memoryId), eq(userMemories.userId, userId)))
    .limit(1);

  return record ?? null;
}

export async function listUserMemories(
  db: SeekuDatabase,
  userId: string,
  options: ListUserMemoriesOptions = {}
): Promise<UserMemory[]> {
  const now = new Date();
  const conditions = [eq(userMemories.userId, userId)];

  // Filter by kind
  if (options.kind) {
    conditions.push(eq(userMemories.kind, options.kind));
  }

  // Filter by source
  if (options.source) {
    conditions.push(eq(userMemories.source, options.source));
  }

  // Filter by scope
  if (options.scope) {
    const { scopeKind, scopeValue } = scopeToColumns(options.scope);
    conditions.push(eq(userMemories.scopeKind, scopeKind));
    if (scopeValue === null) {
      conditions.push(isNull(userMemories.scopeValue));
    } else {
      conditions.push(eq(userMemories.scopeValue, scopeValue));
    }
  }

  // Filter out expired memories unless explicitly included
  if (!options.includeExpired) {
    conditions.push(
      or(
        isNull(userMemories.expiresAt),
        gt(userMemories.expiresAt, now)
      )!
    );
  }

  let query = db
    .select()
    .from(userMemories)
    .where(and(...conditions))
    .orderBy(desc(userMemories.updatedAt));

  if (options.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  return query;
}

export async function updateUserMemory(
  db: SeekuDatabase,
  userId: string,
  memoryId: string,
  input: UpdateUserMemoryInput
): Promise<UserMemory | null> {
  const updateData: Partial<NewUserMemory> = {
    updatedAt: new Date()
  };

  if (input.content !== undefined) {
    updateData.content = input.content;
  }
  if (input.confidence !== undefined) {
    updateData.confidence = input.confidence.toString();
  }
  if (input.note !== undefined) {
    updateData.note = input.note;
  }
  if (input.expiresAt !== undefined) {
    updateData.expiresAt = input.expiresAt;
  }

  const [record] = await db
    .update(userMemories)
    .set(updateData)
    .where(and(eq(userMemories.id, memoryId), eq(userMemories.userId, userId)))
    .returning();

  return record ?? null;
}

export async function deleteUserMemory(
  db: SeekuDatabase,
  userId: string,
  memoryId: string
): Promise<boolean> {
  const result = await db
    .delete(userMemories)
    .where(and(eq(userMemories.id, memoryId), eq(userMemories.userId, userId)))
    .returning({ id: userMemories.id });

  return result.length > 0;
}

export async function deleteUserMemoriesByScope(
  db: SeekuDatabase,
  userId: string,
  scope: StructuredMemoryScope
): Promise<number> {
  const { scopeKind, scopeValue } = scopeToColumns(scope);

  const conditions = [
    eq(userMemories.userId, userId),
    eq(userMemories.scopeKind, scopeKind)
  ];

  if (scopeValue === null) {
    conditions.push(isNull(userMemories.scopeValue));
  } else {
    conditions.push(eq(userMemories.scopeValue, scopeValue));
  }

  const result = await db
    .delete(userMemories)
    .where(and(...conditions))
    .returning({ id: userMemories.id });

  return result.length;
}

// ============================================================================
// Expiration
// ============================================================================

export async function expireUserMemories(
  db: SeekuDatabase,
  userId?: string
): Promise<number> {
  const now = new Date();
  const conditions = [
    lt(userMemories.expiresAt, now)
  ];

  if (userId) {
    conditions.push(eq(userMemories.userId, userId));
  }

  const result = await db
    .delete(userMemories)
    .where(and(...conditions))
    .returning({ id: userMemories.id });

  return result.length;
}

// ============================================================================
// User Preferences (Memory Pause)
// ============================================================================

export async function getUserPreference(
  db: SeekuDatabase,
  userId: string
): Promise<UserPreference> {
  const [record] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (record) {
    return record;
  }

  // Create default preference if not exists
  const [newRecord] = await db
    .insert(userPreferences)
    .values({ userId, memoryPaused: false })
    .returning();

  return newRecord;
}

export async function setMemoryPaused(
  db: SeekuDatabase,
  userId: string,
  paused: boolean
): Promise<UserPreference> {
  const now = new Date();

  const [record] = await db
    .insert(userPreferences)
    .values({ userId, memoryPaused: paused, updatedAt: now })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { memoryPaused: paused, updatedAt: now }
    })
    .returning();

  return record;
}

export async function isMemoryPaused(
  db: SeekuDatabase,
  userId: string
): Promise<boolean> {
  const preference = await getUserPreference(db, userId);
  return preference.memoryPaused;
}

// ============================================================================
// Hydration Context
// ============================================================================

export interface MemoryHydrationContext {
  userId: string;
  preferences: UserPreference;
  memories: UserMemory[];
  explicitPreferences: UserMemory[];
  inferredPreferences: UserMemory[];
  feedbackMemories: UserMemory[];
  hiringContexts: UserMemory[];
}

export async function hydrateUserMemoryContext(
  db: SeekuDatabase,
  userId: string
): Promise<MemoryHydrationContext> {
  const [preferences, memories] = await Promise.all([
    getUserPreference(db, userId),
    listUserMemories(db, userId)
  ]);

  const explicitPreferences = memories.filter(
    (m) => m.kind === "preference" && m.source === "explicit"
  );
  const inferredPreferences = memories.filter(
    (m) => m.kind === "preference" && m.source === "inferred"
  );
  const feedbackMemories = memories.filter((m) => m.kind === "feedback");
  const hiringContexts = memories.filter((m) => m.kind === "hiring_context");

  return {
    userId,
    preferences,
    memories,
    explicitPreferences,
    inferredPreferences,
    feedbackMemories,
    hiringContexts
  };
}

// ============================================================================
// Candidate Feedback Memories
// ============================================================================

export interface CreateCandidateFeedbackInput {
  userId: string;
  personId: string;
  sentiment: FeedbackSentiment;
  reasonCode?: string;
  reasonDetail?: string;
  contextSource?: string;
}

export async function recordCandidateFeedback(
  db: SeekuDatabase,
  input: CreateCandidateFeedbackInput
): Promise<CandidateFeedbackMemory> {
  const values: NewCandidateFeedbackMemory = {
    userId: input.userId,
    personId: input.personId,
    sentiment: input.sentiment,
    reasonCode: input.reasonCode ?? null,
    reasonDetail: input.reasonDetail ?? null,
    contextSource: input.contextSource ?? "shortlist",
    createdAt: new Date()
  };

  const [record] = await db.insert(candidateFeedbackMemories).values(values).returning();
  return record;
}

export async function getCandidateFeedbackHistory(
  db: SeekuDatabase,
  userId: string,
  options?: {
    personId?: string;
    sentiment?: FeedbackSentiment;
    since?: Date;
    limit?: number;
  }
): Promise<CandidateFeedbackMemory[]> {
  const conditions = [eq(candidateFeedbackMemories.userId, userId)];

  if (options?.personId) {
    conditions.push(eq(candidateFeedbackMemories.personId, options.personId));
  }
  if (options?.sentiment) {
    conditions.push(eq(candidateFeedbackMemories.sentiment, options.sentiment));
  }
  if (options?.since) {
    conditions.push(gt(candidateFeedbackMemories.createdAt, options.since));
  }

  let query = db
    .select()
    .from(candidateFeedbackMemories)
    .where(and(...conditions))
    .orderBy(desc(candidateFeedbackMemories.createdAt));

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  return query;
}

export interface RepeatedNegativePattern {
  reasonCode: string;
  count: number;
  earliestAt: Date;
  latestAt: Date;
}

/**
 * Find reason codes that have been repeated enough times within a time window
 * to potentially trigger inferred preference generation.
 */
export async function findRepeatedNegativePatterns(
  db: SeekuDatabase,
  userId: string,
  options: {
    minCount: number;
    since: Date;
  }
): Promise<RepeatedNegativePattern[]> {
  const rows = await db
    .select({
      reasonCode: candidateFeedbackMemories.reasonCode,
      count: sql<number>`count(*)::int`,
      earliestAt: sql<Date>`min(${candidateFeedbackMemories.createdAt})`,
      latestAt: sql<Date>`max(${candidateFeedbackMemories.createdAt})`
    })
    .from(candidateFeedbackMemories)
    .where(
      and(
        eq(candidateFeedbackMemories.userId, userId),
        eq(candidateFeedbackMemories.sentiment, "negative"),
        gt(candidateFeedbackMemories.createdAt, options.since),
        sql`${candidateFeedbackMemories.reasonCode} IS NOT NULL`
      )
    )
    .groupBy(candidateFeedbackMemories.reasonCode)
    .having(sql`count(*) >= ${options.minCount}`);

  return rows.map((row) => ({
    reasonCode: row.reasonCode!,
    count: row.count,
    earliestAt: row.earliestAt,
    latestAt: row.latestAt
  }));
}

export async function deleteCandidateFeedback(
  db: SeekuDatabase,
  userId: string,
  feedbackId: string
): Promise<boolean> {
  const result = await db
    .delete(candidateFeedbackMemories)
    .where(
      and(
        eq(candidateFeedbackMemories.id, feedbackId),
        eq(candidateFeedbackMemories.userId, userId)
      )
    )
    .returning({ id: candidateFeedbackMemories.id });

  return result.length > 0;
}
