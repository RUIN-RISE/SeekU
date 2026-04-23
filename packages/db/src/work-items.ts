/**
 * Database operations for work items.
 *
 * Work items are the primary user-visible task object.
 * A session is an execution container; a work item is the task.
 */

import { and, desc, eq } from "drizzle-orm";

import type { SeekuDatabase } from "./index.js";
import { workItems, type WorkItemStatus } from "./schema.js";

// ============================================================================
// Types
// ============================================================================

export interface CreateWorkItemInput {
  userId: string;
  title?: string;
  goalSummary?: string;
}

export interface ListWorkItemsFilter {
  status?: WorkItemStatus;
  limit?: number;
}

// ============================================================================
// CRUD
// ============================================================================

export async function createWorkItem(
  db: SeekuDatabase,
  input: CreateWorkItemInput
) {
  const [record] = await db
    .insert(workItems)
    .values({
      userId: input.userId,
      title: input.title ?? null,
      goalSummary: input.goalSummary ?? null
    })
    .returning();

  return record;
}

export async function getWorkItem(
  db: SeekuDatabase,
  workItemId: string,
  userId: string
) {
  const [record] = await db
    .select()
    .from(workItems)
    .where(and(eq(workItems.id, workItemId), eq(workItems.userId, userId)))
    .limit(1);

  return record ?? null;
}

export async function listWorkItemsByUser(
  db: SeekuDatabase,
  userId: string,
  filter?: ListWorkItemsFilter
) {
  const conditions = [eq(workItems.userId, userId)];

  if (filter?.status) {
    conditions.push(eq(workItems.status, filter.status));
  }

  let query = db
    .select()
    .from(workItems)
    .where(and(...conditions))
    .orderBy(desc(workItems.updatedAt));

  if (filter?.limit) {
    query = query.limit(filter.limit) as typeof query;
  }

  return query;
}

export async function updateWorkItemStatus(
  db: SeekuDatabase,
  workItemId: string,
  status: WorkItemStatus,
  userId: string
) {
  const updates: Partial<Record<string, unknown>> = {
    status,
    updatedAt: new Date()
  };

  if (status === "completed") {
    updates.completedAt = new Date();
  } else {
    updates.completedAt = null;
  }

  const [record] = await db
    .update(workItems)
    .set(updates)
    .where(and(eq(workItems.id, workItemId), eq(workItems.userId, userId)))
    .returning();

  return record ?? null;
}

/**
 * Attach a session to a work item.
 *
 * Ownership boundary: validates that the target work item belongs to `userId`,
 * but cannot prove the session itself belongs to that same user because
 * `agent_sessions` currently has no `user_id` column. This is acceptable for
 * the CLI flow where session IDs are internal, but if attach/rebind is ever
 * exposed as a broader product action, `agent_sessions` will need a user
 * ownership constraint.
 */
export async function attachSessionToWorkItem(
  db: SeekuDatabase,
  sessionId: string,
  workItemId: string,
  userId: string
) {
  // First verify the work item belongs to this user
  const [workItem] = await db
    .select()
    .from(workItems)
    .where(and(eq(workItems.id, workItemId), eq(workItems.userId, userId)))
    .limit(1);

  if (!workItem) {
    return null;
  }

  // Import here to avoid circular dependency
  const { agentSessions } = await import("./schema.js");
  const [record] = await db
    .update(agentSessions)
    .set({ workItemId, updatedAt: new Date() })
    .where(eq(agentSessions.sessionId, sessionId))
    .returning();

  return record ?? null;
}
