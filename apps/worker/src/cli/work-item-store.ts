/**
 * CLI-side work item store.
 *
 * Provides the application-level interface for work item operations.
 * Wraps the database layer and maps between DB records and CLI types.
 */

import type { SeekuDatabase } from "@seeku/db";
import {
  createWorkItem as dbCreateWorkItem,
  getWorkItem as dbGetWorkItem,
  listWorkItemsByUser as dbListWorkItemsByUser,
  updateWorkItemStatus as dbUpdateWorkItemStatus,
  attachSessionToWorkItem as dbAttachSessionToWorkItem
} from "@seeku/db";

import type { PersistedCliResumeMeta } from "./session-ledger.js";
import type { AgentSessionSnapshot } from "./agent-session-events.js";
import { deriveTaskProgress } from "./task-progress-derivation.js";
import type { TaskProgress } from "./task-progress-types.js";
import { deriveNextBestAction } from "./next-best-action.js";
import type { NextBestAction } from "./next-best-action-types.js";
import type { UserMemoryContext } from "./user-memory-types.js";
import { buildWorkboardViewModel, buildLegacyWorkboardViewModel, buildDegradedWorkboardViewModel, type WorkboardViewModel } from "./workboard-view-model.js";
import type { UserIdentityProvider } from "./user-identity-provider.js";
import type {
  WorkItemRecord,
  WorkItemStatus,
  CreateWorkItemOptions
} from "./work-item-types.js";

// ============================================================================
// Record Mapping
// ============================================================================

function dbRecordToCliRecord(record: any): WorkItemRecord {
  return {
    id: record.id,
    userId: record.userId,
    title: record.title ?? null,
    goalSummary: record.goalSummary ?? null,
    status: record.status as WorkItemStatus,
    completedAt: record.completedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

// ============================================================================
// Store
// ============================================================================

export class WorkItemStore {
  constructor(
    private readonly db: SeekuDatabase,
    private readonly identityProvider: UserIdentityProvider
  ) {}

  getUserId(): string {
    return this.identityProvider.getUserId();
  }

  async create(options?: CreateWorkItemOptions): Promise<WorkItemRecord> {
    const userId = this.getUserId();
    const record = await dbCreateWorkItem(this.db, {
      userId,
      title: options?.title,
      goalSummary: options?.goalSummary
    });
    return dbRecordToCliRecord(record);
  }

  async get(workItemId: string): Promise<WorkItemRecord | null> {
    const userId = this.getUserId();
    const record = await dbGetWorkItem(this.db, workItemId, userId);
    return record ? dbRecordToCliRecord(record) : null;
  }

  async list(status?: WorkItemStatus, limit?: number): Promise<WorkItemRecord[]> {
    const userId = this.getUserId();
    const records = await dbListWorkItemsByUser(this.db, userId, {
      status,
      limit
    });
    return records.map(dbRecordToCliRecord);
  }

  async updateStatus(workItemId: string, status: WorkItemStatus): Promise<WorkItemRecord | null> {
    const userId = this.getUserId();
    const record = await dbUpdateWorkItemStatus(this.db, workItemId, status, userId);
    return record ? dbRecordToCliRecord(record) : null;
  }

  async attachSession(sessionId: string, workItemId: string): Promise<boolean> {
    const userId = this.getUserId();
    const record = await dbAttachSessionToWorkItem(this.db, sessionId, workItemId, userId);
    return record !== null;
  }

  /**
   * Derive task progress from work item + session snapshot + optional resumeMeta.
   * Pure derivation — no DB writes, no model calls.
   */
  getProgress(
    workItem: WorkItemRecord,
    snapshot: AgentSessionSnapshot | null,
    resumeMeta?: PersistedCliResumeMeta | null
  ): TaskProgress {
    return deriveTaskProgress({ workItem, snapshot, resumeMeta });
  }

  /**
   * Derive next-best-action from task progress + optional user memory.
   * Composes getProgress → deriveNextBestAction.
   */
  getNextAction(
    workItem: WorkItemRecord,
    snapshot: AgentSessionSnapshot | null,
    resumeMeta?: PersistedCliResumeMeta | null,
    memoryContext?: UserMemoryContext | null
  ): NextBestAction {
    const progress = this.getProgress(workItem, snapshot, resumeMeta);
    return deriveNextBestAction({ taskProgress: progress, workItem, snapshot, resumeMeta, memoryContext });
  }

  /**
   * Build a flat, TUI-ready workboard view model.
   * Composes getProgress + getNextAction + view model builder.
   * No formatting logic — that lives in tui.ts.
   */
  getWorkboardModel(
    workItem: WorkItemRecord | null,
    snapshot: AgentSessionSnapshot | null,
    resumeMeta?: PersistedCliResumeMeta | null,
    memoryContext?: UserMemoryContext | null,
    /**
     * When the session record has a workItemId but the work item could not
     * be loaded (e.g. deleted, different user), pass it here so the view
     * model can signal a degraded state instead of silently falling back.
     */
    missingWorkItemId?: string | null
  ): WorkboardViewModel {
    const sessionId = snapshot?.sessionId ?? "unknown";

    // For work-item sessions, derive from the work item record.
    if (workItem) {
      const progress = deriveTaskProgress({ workItem, snapshot, resumeMeta });
      const action = deriveNextBestAction({ taskProgress: progress, workItem, snapshot, resumeMeta, memoryContext });
      return buildWorkboardViewModel({ workItem, snapshot, resumeMeta, progress, action });
    }

    // Degraded: session references a workItemId but it could not be loaded.
    if (missingWorkItemId) {
      const progress = deriveTaskProgress({ workItem: null, snapshot, resumeMeta });
      const action = deriveNextBestAction({ taskProgress: progress, workItem: null, snapshot, resumeMeta, memoryContext });
      return buildDegradedWorkboardViewModel({
        workItemId: missingWorkItemId,
        recordSessionId: sessionId,
        snapshot,
        resumeMeta,
        progress,
        action
      });
    }

    // Legacy session (no work item) — derive from snapshot/resumeMeta alone.
    const progress = deriveTaskProgress({ workItem: null, snapshot, resumeMeta });
    const action = deriveNextBestAction({ taskProgress: progress, workItem: null, snapshot, resumeMeta, memoryContext });
    return buildLegacyWorkboardViewModel({
      recordSessionId: sessionId,
      snapshot,
      resumeMeta,
      progress,
      action
    });
  }
}
