/**
 * Work item types for the CLI agent product.
 *
 * Work items are the primary user-visible task object.
 * This module defines the CLI-side contract; DB types come from @seeku/db.
 */

export type WorkItemStatus = "active" | "completed" | "abandoned";

export interface WorkItemRecord {
  id: string;
  userId: string;
  title: string | null;
  goalSummary: string | null;
  status: WorkItemStatus;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkItemOptions {
  title?: string;
  goalSummary?: string;
}
