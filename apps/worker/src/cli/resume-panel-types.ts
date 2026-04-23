/**
 * Task-centric resume panel types.
 *
 * Replaces the session-centric ResumePanelItem with a work-item-aware model.
 * B5: re-ranking, grouping, labeling — not new task execution.
 */

import type { AgentResumability } from "./session-runtime-types.js";
import type { TaskStage } from "./task-progress-types.js";
import type { PersistedCliSessionRecord } from "./session-ledger.js";

// ============================================================================
// Item Kind
// ============================================================================

export type TaskResumeItemKind =
  | "work_item"
  | "degraded_work_item"
  | "legacy_session";

// ============================================================================
// Task-Centric Resume Panel Item
// ============================================================================

export interface TaskResumeItem {
  /** Item classification */
  kind: TaskResumeItemKind;

  /** Session ID (always available) */
  sessionId: string;

  /** Work item ID, only for work_item / degraded_work_item kinds */
  workItemId?: string;

  /** Primary display title — task title for work items, goal for legacy */
  title: string;

  /** Secondary info — stage label or legacy hint */
  subtitle: string;

  /** Current task stage */
  stage: TaskStage;

  /** Whether the task is blocked */
  blocked: boolean;

  /** Blocker reason label, only when blocked=true */
  blockerLabel?: string;

  /** Next-best-action title */
  nextActionTitle?: string;

  /** ISO timestamp of last update */
  updatedAt: string;

  /** Whether the session can be resumed */
  resumability: AgentResumability;

  /** Where the data came from (debug) */
  sourceLabel?: string;

  /** Original session record, preserved for preview/resume flow */
  record: PersistedCliSessionRecord;

  /** Cache-only hint from original record */
  cacheOnly?: boolean;
}

// ============================================================================
// Ranking
// ============================================================================
//
// Deterministic ranking by work-item status, stage priority, and kind.
// Higher rank = shown first.

// Stage priority: later/more actionable stages rank higher.
const STAGE_RANK: Record<TaskStage, number> = {
  decision_ready: 70,
  comparing: 65,
  shortlist_ready: 60,
  searching: 40,
  clarifying: 30,
  intake: 20,
  abandoned: 10,
  completed: 5
};

// Kind priority: work_item > degraded > legacy.
const KIND_RANK: Record<TaskResumeItemKind, number> = {
  work_item: 300,
  degraded_work_item: 200,
  legacy_session: 100
};

// Resumability boost: resumable items rank higher within their tier.
const RESUMABILITY_BOOST: Record<AgentResumability, number> = {
  resumable: 50,
  read_only: 0,
  not_resumable: 0
};

// Blocked-but-actionable gets a small boost over non-blocked same-stage.
const BLOCKED_ACTIONABLE_BOOST = 5;

export function rankResumeItem(item: TaskResumeItem): number {
  let rank = 0;

  // Kind tier.
  rank += KIND_RANK[item.kind];

  // Resumability boost.
  rank += RESUMABILITY_BOOST[item.resumability];

  // Stage priority.
  rank += STAGE_RANK[item.stage] ?? 0;

  // Blocked-but-actionable: only boost items the user can actually continue.
  // read_only / not_resumable blocked items are not actionable.
  if (
    item.blocked
    && item.resumability === "resumable"
    && item.stage !== "completed"
    && item.stage !== "abandoned"
  ) {
    rank += BLOCKED_ACTIONABLE_BOOST;
  }

  return rank;
}

export function compareResumeItems(a: TaskResumeItem, b: TaskResumeItem): number {
  const rankA = rankResumeItem(a);
  const rankB = rankResumeItem(b);

  // Higher rank first.
  if (rankA !== rankB) {
    return rankB - rankA;
  }

  // Same rank: more recent first.
  return b.updatedAt.localeCompare(a.updatedAt);
}
