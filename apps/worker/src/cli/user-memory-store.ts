/**
 * CLI-side user memory store.
 *
 * Provides the application-level interface for user memory operations.
 * Wraps the database layer and maps between DB records and CLI types.
 */

import type { SeekuDatabase, UserMemory } from "@seeku/db";
import {
  columnsToScope,
  createUserMemory as dbCreateUserMemory,
  deleteUserMemory as dbDeleteUserMemory,
  deleteUserMemoriesByScope as dbDeleteUserMemoriesByScope,
  expireUserMemories as dbExpireUserMemories,
  getCandidateFeedbackHistory as dbGetCandidateFeedbackHistory,
  deleteCandidateFeedback as dbDeleteCandidateFeedback,
  getUserMemory as dbGetUserMemory,
  getUserPreference as dbGetUserPreference,
  hydrateUserMemoryContext as dbHydrateUserMemoryContext,
  isMemoryPaused as dbIsMemoryPaused,
  listUserMemories as dbListUserMemories,
  setMemoryPaused as dbSetMemoryPaused,
  updateUserMemory as dbUpdateUserMemory,
  type StructuredMemoryScope
} from "@seeku/db";

import type { UserIdentityProvider } from "./user-identity-provider.js";
import {
  getExplicitExpiryDate,
  getInferredExpiryDate,
  type CandidateFeedbackRecord,
  type CreateUserMemoryOptions,
  type ListUserMemoriesFilter,
  type MemoryScope,
  type UpdateUserMemoryOptions,
  type UserMemoryContext,
  type UserMemoryRecord
} from "./user-memory-types.js";

function isRecoverableMemoryDbError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    "connection refused",
    "connect econnrefused",
    "econnrefused",
    "timeout",
    "timed out",
    "failed to connect",
    "could not connect",
    "does not exist",
    "relation \"user_preferences\"",
    "relation \"user_memories\"",
    "relation \"candidate_feedback\"",
    "no such table"
  ].some((pattern) => message.includes(pattern));
}

function createEmptyMemoryContext(userId: string): UserMemoryContext {
  return {
    userId,
    memoryPaused: false,
    preferences: [],
    feedbacks: [],
    candidateFeedbacks: [],
    hiringContexts: [],
    allMemories: []
  };
}

// ============================================================================
// Record Mapping
// ============================================================================

function dbRecordToCliRecord(record: UserMemory): UserMemoryRecord {
  return {
    id: record.id,
    userId: record.userId,
    kind: record.kind,
    scope: columnsToScope(record.scopeKind, record.scopeValue),
    content: record.content,
    source: record.source,
    confidence: parseFloat(record.confidence),
    note: record.note ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt
  };
}

// ============================================================================
// Store
// ============================================================================

export class UserMemoryStore {
  constructor(
    public readonly db: SeekuDatabase,
    private readonly identityProvider: UserIdentityProvider
  ) {}

  getUserId(): string {
    return this.identityProvider.getUserId();
  }

  // ---- CRUD ----

  async create(options: CreateUserMemoryOptions): Promise<UserMemoryRecord> {
    const userId = this.getUserId();
    const scope: StructuredMemoryScope = options.scope;
    const expiresAt =
      options.source === "inferred"
        ? (options.expiresAt ?? getInferredExpiryDate())
        : (options.expiresAt ?? getExplicitExpiryDate());

    const record = await dbCreateUserMemory(this.db, {
      userId,
      kind: options.kind,
      scope,
      content: options.content,
      source: options.source,
      confidence: options.confidence,
      note: options.note,
      expiresAt
    });

    return dbRecordToCliRecord(record);
  }

  async get(memoryId: string): Promise<UserMemoryRecord | null> {
    const userId = this.getUserId();
    const record = await dbGetUserMemory(this.db, userId, memoryId);
    return record ? dbRecordToCliRecord(record) : null;
  }

  async list(filter?: ListUserMemoriesFilter): Promise<UserMemoryRecord[]> {
    const userId = this.getUserId();
    let records: UserMemory[];
    try {
      records = await dbListUserMemories(this.db, userId, {
        kind: filter?.kind,
        scope: filter?.scope as StructuredMemoryScope | undefined,
        source: filter?.source,
        includeExpired: filter?.includeExpired,
        limit: filter?.limit
      });
    } catch (error) {
      if (!isRecoverableMemoryDbError(error)) {
        throw error;
      }
      return [];
    }
    return records.map(dbRecordToCliRecord);
  }

  async update(
    memoryId: string,
    options: UpdateUserMemoryOptions
  ): Promise<UserMemoryRecord | null> {
    const userId = this.getUserId();
    const record = await dbUpdateUserMemory(this.db, userId, memoryId, {
      content: options.content,
      confidence: options.confidence,
      note: options.note,
      expiresAt: options.expiresAt
    });
    return record ? dbRecordToCliRecord(record) : null;
  }

  async delete(memoryId: string): Promise<boolean> {
    const userId = this.getUserId();
    return dbDeleteUserMemory(this.db, userId, memoryId);
  }

  async deleteByScope(scope: MemoryScope): Promise<number> {
    const userId = this.getUserId();
    return dbDeleteUserMemoriesByScope(this.db, userId, scope as StructuredMemoryScope);
  }

  // ---- Expiration ----

  async expireStale(): Promise<number> {
    const userId = this.getUserId();
    return dbExpireUserMemories(this.db, userId);
  }

  // ---- Pause / Resume ----

  async isMemoryPaused(): Promise<boolean> {
    const userId = this.getUserId();
    try {
      return await dbIsMemoryPaused(this.db, userId);
    } catch (error) {
      if (!isRecoverableMemoryDbError(error)) {
        throw error;
      }
      return false;
    }
  }

  async pauseMemory(): Promise<void> {
    const userId = this.getUserId();
    await dbSetMemoryPaused(this.db, userId, true);
  }

  async resumeMemory(): Promise<void> {
    const userId = this.getUserId();
    await dbSetMemoryPaused(this.db, userId, false);
  }

  // ---- Candidate Feedback ----

  async listCandidateFeedback(limit?: number): Promise<CandidateFeedbackRecord[]> {
    const userId = this.getUserId();
    const records = await dbGetCandidateFeedbackHistory(this.db, userId, { limit });
    return records.map((r) => ({
      id: r.id,
      userId: r.userId,
      personId: r.personId,
      sentiment: r.sentiment as CandidateFeedbackRecord["sentiment"],
      reasonCode: r.reasonCode,
      reasonDetail: r.reasonDetail,
      contextSource: r.contextSource ?? "shortlist",
      createdAt: r.createdAt
    }));
  }

  async deleteCandidateFeedbackById(feedbackId: string): Promise<boolean> {
    const userId = this.getUserId();
    return dbDeleteCandidateFeedback(this.db, userId, feedbackId);
  }

  // ---- Hydration ----

  async hydrateContext(): Promise<UserMemoryContext> {
    const userId = this.getUserId();
    let ctx: Awaited<ReturnType<typeof dbHydrateUserMemoryContext>>;
    let candidateFeedbacks: Awaited<ReturnType<typeof dbGetCandidateFeedbackHistory>>;
    try {
      [ctx, candidateFeedbacks] = await Promise.all([
        dbHydrateUserMemoryContext(this.db, userId),
        dbGetCandidateFeedbackHistory(this.db, userId)
      ]);
    } catch (error) {
      if (!isRecoverableMemoryDbError(error)) {
        throw error;
      }
      return createEmptyMemoryContext(userId);
    }

    const feedbackRecords: CandidateFeedbackRecord[] = candidateFeedbacks.map((r) => ({
      id: r.id,
      userId: r.userId,
      personId: r.personId,
      sentiment: r.sentiment as CandidateFeedbackRecord["sentiment"],
      reasonCode: r.reasonCode,
      reasonDetail: r.reasonDetail,
      contextSource: r.contextSource ?? "shortlist",
      createdAt: r.createdAt
    }));

    return {
      userId: ctx.userId,
      memoryPaused: ctx.preferences.memoryPaused,
      preferences: ctx.explicitPreferences
        .concat(ctx.inferredPreferences)
        .map(dbRecordToCliRecord),
      feedbacks: ctx.feedbackMemories.map(dbRecordToCliRecord),
      candidateFeedbacks: feedbackRecords,
      hiringContexts: ctx.hiringContexts.map(dbRecordToCliRecord),
      allMemories: ctx.memories.map(dbRecordToCliRecord)
    };
  }
}
