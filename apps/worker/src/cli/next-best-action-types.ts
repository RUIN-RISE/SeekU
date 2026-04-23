/**
 * Next-best-action types for task-centric agent guidance.
 *
 * B3 produces a deterministic, rule-based top action recommendation.
 * V1 does not gate by confidence — all actions are shown with reason/source.
 *
 * Note: confirm_preference and memory_inferred_pattern are reserved for B4+.
 * Current rules never emit them — consumers must not assume all enum values
 * are reachable at this stage.
 */

export type NextBestActionType =
  | "clarify_requirement"
  | "relax_constraint"
  | "tighten_constraint"
  | "inspect_shortlist"
  | "compare_candidates"
  | "collect_missing_evidence"
  | "confirm_preference"
  | "refine_search"
  | "close_task";

export type NextBestActionReason =
  | "blocked_conditions_insufficient"
  | "blocked_retrieval_zero_hits"
  | "blocked_retrieval_all_weak"
  | "blocked_recovery_budget_exhausted"
  | "blocked_boundary_failure"
  | "stage_intake"
  | "stage_clarifying"
  | "stage_searching"
  | "stage_shortlist_ready"
  | "stage_comparing"
  | "stage_decision_ready"
  | "stage_completed"
  | "stage_abandoned"
  | "memory_explicit_preference"
  | "memory_inferred_pattern";

export type NextBestActionSource =
  | "task_progress"
  | "blocker_reason"
  | "session_snapshot"
  | "user_memory"
  | "default";

export interface NextBestAction {
  type: NextBestActionType;
  title: string;
  description: string;
  reason: NextBestActionReason;
  source: NextBestActionSource;
  priority: number;
  suggestedPrompt?: string;
  context?: Record<string, unknown>;
  derivedFrom: string;
}
