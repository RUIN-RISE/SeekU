export type AgentSessionStatus =
  | "idle"
  | "clarifying"
  | "searching"
  | "recovering"
  | "shortlist"
  | "comparing"
  | "waiting-input"
  | "blocked"
  | "completed";

export type AgentSessionTerminationReason =
  | "completed"
  | "user_exit"
  | "interrupted"
  | "crashed";

export type AgentSessionWhyCode =
  | "awaiting_user_input"
  | "goal_missing"
  | "conditions_insufficient"
  | "retrieval_zero_hits"
  | "retrieval_all_weak"
  | "recovery_clarify_anchor"
  | "recovery_clarify_role"
  | "recovery_clarify_skill"
  | "recovery_rewrite"
  | "recovery_budget_exhausted"
  | "low_confidence_shortlist"
  | "compare_refine_requested";

export type AgentResumeItemKind =
  | "interrupted_work_item"
  | "stopped_session"
  | "recent_session"
  | "new_session";

export type AgentResumability =
  | "resumable"
  | "read_only"
  | "not_resumable";
