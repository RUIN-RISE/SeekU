/**
 * Task progress types for work-item-centric progress model.
 *
 * B2 derives task progress from session snapshot + work item state.
 * Blocked is a modifier, not a separate stage.
 */

export type TaskStage =
  | "intake"
  | "clarifying"
  | "searching"
  | "shortlist_ready"
  | "comparing"
  | "decision_ready"
  | "completed"
  | "abandoned";

export type TaskBlockerReason =
  | "conditions_insufficient"
  | "retrieval_zero_hits"
  | "retrieval_all_weak"
  | "recovery_budget_exhausted"
  | "boundary_failure";

export interface TaskProgress {
  stage: TaskStage;
  blocked: boolean;
  blockerReason?: TaskBlockerReason;
  summary: string;
  lastUpdatedAt: string;
  workItemStatus: string;
  sessionStatus?: string;
  derivedFrom: TaskProgressSource;
}

export type TaskProgressSource =
  | "work_item_status"
  | "session_snapshot"
  | "resume_meta"
  | "default";
