/**
 * Task progress derivation — pure, deterministic, no DB writes, no model calls.
 *
 * Derives work-item-centric task progress from session snapshot,
 * work item status, and optional resume metadata.
 *
 * Derivation priority:
 * 1. Work item terminal status (completed/abandoned) overrides everything.
 * 2. Structural facts in snapshot (recommendation, compare set, shortlist).
 * 3. Runtime status + why codes for disambiguation.
 * 4. Resume metadata when snapshot absent.
 * 5. Default intake.
 */

import type { AgentSessionSnapshot } from "./agent-session-events.js";
import type {
  AgentSessionStatus,
  AgentSessionWhyCode
} from "./session-runtime-types.js";
import type {
  WorkItemRecord,
  WorkItemStatus
} from "./work-item-types.js";
import type {
  PersistedCliResumeMeta
} from "./session-ledger.js";
import type {
  TaskBlockerReason,
  TaskProgress,
  TaskProgressSource,
  TaskStage
} from "./task-progress-types.js";

// ============================================================================
// Derivation Input
// ============================================================================

export interface DeriveTaskProgressInput {
  workItem: WorkItemRecord | null;
  snapshot: AgentSessionSnapshot | null;
  resumeMeta?: PersistedCliResumeMeta | null;
  posture?: "active" | "stopped" | null;
}

// ============================================================================
// Stage Derivation Rules
// ============================================================================
//
// Stage is derived from structural facts first, then runtime status.
// waiting-input and blocked are NOT stages — they are resolved by looking
// at what the task has actually produced (shortlist, compare, recommendation).

// Runtime statuses that unambiguously map to a stage regardless of snapshot data.
const UNAMBIGUOUS_STAGE_MAP: Partial<Record<AgentSessionStatus, TaskStage>> = {
  idle: "intake",
  clarifying: "clarifying",
  searching: "searching",
  recovering: "searching",
  comparing: "comparing"
};

export function deriveTaskStageFromSnapshot(
  snapshot: AgentSessionSnapshot | null,
  workItemStatus: WorkItemStatus | undefined
): { stage: TaskStage; source: TaskProgressSource } {
  // Terminal work item status overrides everything.
  if (workItemStatus === "completed") {
    return { stage: "completed", source: "work_item_status" };
  }
  if (workItemStatus === "abandoned") {
    return { stage: "abandoned", source: "work_item_status" };
  }

  if (!snapshot) {
    return { stage: "intake", source: "default" };
  }

  // Structural facts take priority over runtime status.
  if (snapshot.recommendedCandidate) {
    return { stage: "decision_ready", source: "session_snapshot" };
  }
  if (snapshot.activeCompareSet.length > 0) {
    return { stage: "comparing", source: "session_snapshot" };
  }
  if (snapshot.currentShortlist.length > 0) {
    return { stage: "shortlist_ready", source: "session_snapshot" };
  }

  // No structural evidence — derive from runtime status.
  const status = snapshot.runtime.status;
  const mapped = UNAMBIGUOUS_STAGE_MAP[status];
  if (mapped) {
    return { stage: mapped, source: "session_snapshot" };
  }

  // waiting-input / blocked / shortlist / completed without structural data:
  // disambiguate using why codes and goal presence.
  if (status === "completed") {
    return { stage: "decision_ready", source: "session_snapshot" };
  }

  if (status === "shortlist") {
    return { stage: "shortlist_ready", source: "session_snapshot" };
  }

  // waiting-input and blocked: use why codes to determine actual stage.
  const whyCodes = snapshot.runtime.whyCodes;

  // Retrieval blockers -> still in searching phase.
  if (whyCodes.includes("retrieval_zero_hits") || whyCodes.includes("retrieval_all_weak")) {
    return { stage: "searching", source: "session_snapshot" };
  }

  // Conditions insufficient -> still clarifying.
  if (whyCodes.includes("conditions_insufficient") || whyCodes.includes("goal_missing")) {
    return { stage: "clarifying", source: "session_snapshot" };
  }

  // Recovery clarify actions -> still clarifying.
  if (whyCodes.some((c) => c.startsWith("recovery_budget_exhausted"))) {
    return { stage: "searching", source: "session_snapshot" };
  }

  // Clarifying states -> clarifying if we have a goal, intake otherwise.
  if (whyCodes.some((c) => c.startsWith("recovery_clarify_") || c === "compare_refine_requested")) {
    return { stage: snapshot.userGoal ? "clarifying" : "intake", source: "session_snapshot" };
  }

  // Has a goal but no results yet -> clarifying (gathering conditions).
  if (snapshot.userGoal) {
    return { stage: "clarifying", source: "session_snapshot" };
  }

  return { stage: "intake", source: "default" };
}

// Derive stage from resume meta when no snapshot is available.
// Uses the same why-code disambiguation logic as snapshot path.
function deriveStageFromResumeMeta(
  resumeMeta: PersistedCliResumeMeta | null | undefined
): { stage: TaskStage; source: TaskProgressSource } {
  if (!resumeMeta) {
    return { stage: "intake", source: "default" };
  }

  const status = resumeMeta.status;

  // Unambiguous mappings.
  const unambiguous: Partial<Record<string, TaskStage>> = {
    idle: "intake",
    clarifying: "clarifying",
    searching: "searching",
    recovering: "searching",
    shortlist: "shortlist_ready",
    comparing: "comparing",
    completed: "decision_ready"
  };

  if (unambiguous[status]) {
    return { stage: unambiguous[status]!, source: "resume_meta" };
  }

  // waiting-input / blocked: disambiguate using primaryWhyCode.
  const whyCode = resumeMeta.primaryWhyCode;

  if (whyCode === "retrieval_zero_hits" || whyCode === "retrieval_all_weak") {
    return { stage: "searching", source: "resume_meta" };
  }

  if (whyCode === "conditions_insufficient" || whyCode === "goal_missing") {
    return { stage: "clarifying", source: "resume_meta" };
  }

  if (whyCode?.startsWith("recovery_budget_exhausted")) {
    return { stage: "searching", source: "resume_meta" };
  }

  if (whyCode?.startsWith("recovery_clarify_") || whyCode === "compare_refine_requested") {
    return { stage: "clarifying", source: "resume_meta" };
  }

  // Default fallback for waiting-input/blocked without specific why code.
  return { stage: "intake", source: "resume_meta" };
}

// ============================================================================
// Blocker Derivation Rules
// ============================================================================
//
// Blocked is a modifier, not a stage. We derive it from why codes.
// User-input-awaiting (awaiting_user_input, recovery_clarify_*) is NOT blocked —
// that's clarifying/intake. Only structural blockers count.

const STRUCTURAL_BLOCKER_CODES: Record<AgentSessionWhyCode, TaskBlockerReason | undefined> = {
  conditions_insufficient: "conditions_insufficient",
  retrieval_zero_hits: "retrieval_zero_hits",
  retrieval_all_weak: "retrieval_all_weak",
  recovery_budget_exhausted: "recovery_budget_exhausted",

  // NOT blockers — these are clarifying/user-interaction states.
  awaiting_user_input: undefined,
  goal_missing: undefined,
  recovery_clarify_anchor: undefined,
  recovery_clarify_role: undefined,
  recovery_clarify_skill: undefined,
  recovery_rewrite: undefined,
  low_confidence_shortlist: undefined,
  compare_refine_requested: undefined
};

const BLOCKER_CODES_SET = new Set<TaskBlockerReason>([
  "conditions_insufficient",
  "retrieval_zero_hits",
  "retrieval_all_weak",
  "recovery_budget_exhausted",
  "boundary_failure"
]);

export function deriveBlockerFromSnapshot(
  snapshot: AgentSessionSnapshot | null
): { blocked: boolean; blockerReason?: TaskBlockerReason } {
  if (!snapshot) {
    return { blocked: false };
  }

  // Check structural blocker why codes first.
  for (const code of snapshot.runtime.whyCodes) {
    const reason = STRUCTURAL_BLOCKER_CODES[code];
    if (reason && BLOCKER_CODES_SET.has(reason)) {
      return { blocked: true, blockerReason: reason };
    }
  }

  // Runtime status "blocked" + no structural why code -> boundary failure.
  if (snapshot.runtime.status === "blocked") {
    return { blocked: true, blockerReason: "boundary_failure" };
  }

  // Recovery boundary diagnostic code present.
  if (snapshot.recoveryState.boundaryDiagnosticCode) {
    return { blocked: true, blockerReason: "boundary_failure" };
  }

  return { blocked: false };
}

// Derive blocker from resume meta why codes.
function deriveBlockerFromResumeMeta(
  resumeMeta: PersistedCliResumeMeta | null | undefined
): { blocked: boolean; blockerReason?: TaskBlockerReason } {
  if (!resumeMeta?.primaryWhyCode) {
    return { blocked: false };
  }

  const reason = STRUCTURAL_BLOCKER_CODES[resumeMeta.primaryWhyCode];
  if (reason && BLOCKER_CODES_SET.has(reason)) {
    return { blocked: true, blockerReason: reason };
  }

  return { blocked: false };
}

// ============================================================================
// Summary Derivation
// ============================================================================

const STAGE_SUMMARIES: Record<TaskStage, string> = {
  intake: "等待输入搜索需求",
  clarifying: "正在澄清搜索条件",
  searching: "正在检索候选人",
  shortlist_ready: "候选短名单已就绪",
  comparing: "正在对比候选人",
  decision_ready: "推荐候选人已就绪",
  completed: "任务已完成",
  abandoned: "任务已放弃"
};

const BLOCKER_SUMMARIES: Record<TaskBlockerReason, string> = {
  conditions_insufficient: "搜索条件不足，需要更多信息",
  retrieval_zero_hits: "检索无结果",
  retrieval_all_weak: "检索结果匹配度均较弱",
  recovery_budget_exhausted: "恢复尝试已达上限",
  boundary_failure: "遇到边界问题"
};

export function deriveTaskSummary(
  stage: TaskStage,
  blocked: boolean,
  blockerReason?: TaskBlockerReason
): string {
  if (blocked && blockerReason) {
    return `${STAGE_SUMMARIES[stage]}（${BLOCKER_SUMMARIES[blockerReason]}）`;
  }
  return STAGE_SUMMARIES[stage];
}

// ============================================================================
// Main Derivation Entry Point
// ============================================================================

export function deriveTaskProgress(input: DeriveTaskProgressInput): TaskProgress {
  const { workItem, snapshot, resumeMeta, posture } = input;
  const workItemStatus = workItem?.status;

  // Derive stage: snapshot first, then resumeMeta, then default.
  let stageResult: { stage: TaskStage; source: TaskProgressSource };
  let blockerResult: { blocked: boolean; blockerReason?: TaskBlockerReason };

  if (snapshot) {
    stageResult = deriveTaskStageFromSnapshot(snapshot, workItemStatus);
    blockerResult = deriveBlockerFromSnapshot(snapshot);
  } else if (resumeMeta) {
    // No snapshot — derive from resumeMeta + work item status.
    if (workItemStatus === "completed") {
      stageResult = { stage: "completed", source: "work_item_status" };
    } else if (workItemStatus === "abandoned") {
      stageResult = { stage: "abandoned", source: "work_item_status" };
    } else {
      stageResult = deriveStageFromResumeMeta(resumeMeta);
    }
    blockerResult = deriveBlockerFromResumeMeta(resumeMeta);
  } else {
    stageResult = deriveTaskStageFromSnapshot(null, workItemStatus);
    blockerResult = { blocked: false };
  }

  const summary = deriveTaskSummary(stageResult.stage, blockerResult.blocked, blockerResult.blockerReason);

  const lastUpdatedAt =
    snapshot?.runtime.lastStatusAt
    ?? resumeMeta?.lastStatusAt
    ?? workItem?.updatedAt?.toISOString()
    ?? new Date(0).toISOString();

  const sessionStatus = snapshot?.runtime.status ?? resumeMeta?.status;

  return {
    stage: stageResult.stage,
    blocked: blockerResult.blocked,
    blockerReason: blockerResult.blockerReason,
    summary,
    lastUpdatedAt,
    workItemStatus: workItemStatus ?? "active",
    sessionStatus,
    derivedFrom: stageResult.source
  };
}
