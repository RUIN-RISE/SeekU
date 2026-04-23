/**
 * Workboard view model — flat, TUI-ready rendering data.
 *
 * Compresses B2 TaskProgress + B3 NextBestAction into a single object
 * that tui.ts can render without any business logic.
 *
 * Two builders:
 * - buildWorkboardViewModel: for sessions with a workItemId
 * - buildLegacyWorkboardViewModel: for sessions without (legacy)
 */

import type { AgentSessionSnapshot } from "./agent-session-events.js";
import type { NextBestAction } from "./next-best-action-types.js";
import type { TaskBlockerReason, TaskProgress, TaskStage } from "./task-progress-types.js";
import type { PersistedCliResumeMeta } from "./session-ledger.js";
import type { WorkItemRecord } from "./work-item-types.js";

// ============================================================================
// View Model
// ============================================================================

export interface WorkboardViewModel {
  /** Task title (from work item or snapshot goal) */
  title: string;
  /** Machine-readable stage */
  stage: TaskStage;
  /** Human-readable stage label */
  stageLabel: string;
  /** Whether the task is blocked */
  blocked: boolean;
  /** Human-readable blocker label, only when blocked=true */
  blockerLabel?: string;
  /** One-line task summary */
  summary: string;
  /** Next-best-action title */
  nextActionTitle: string;
  /** Next-best-action description */
  nextActionDescription: string;
  /** Suggested user input prompt */
  nextActionPrompt?: string;
  /** Relative/absolute time label */
  updatedAtLabel: string;
  /** Where the data came from */
  sourceLabel?: string;
  /** True when this is a legacy session without workItemId */
  isLegacySession: boolean;
  /**
   * True when session has workItemId but work item could not be loaded.
   * Not the same as isLegacySession — this signals a data integrity issue.
   */
  isDegraded?: boolean;
  /** Session runtime status (for debug/display) */
  sessionStatus?: string;
}

// ============================================================================
// Label Formatters
// ============================================================================

const STAGE_LABELS: Record<TaskStage, string> = {
  intake: "需求录入",
  clarifying: "条件澄清",
  searching: "检索候选人",
  shortlist_ready: "短名单就绪",
  comparing: "对比决策",
  decision_ready: "推荐就绪",
  completed: "已完成",
  abandoned: "已放弃"
};

const BLOCKER_LABELS: Record<TaskBlockerReason, string> = {
  conditions_insufficient: "搜索条件不足",
  retrieval_zero_hits: "检索无结果",
  retrieval_all_weak: "匹配度弱",
  recovery_budget_exhausted: "恢复尝试已用尽",
  boundary_failure: "边界问题"
};

export function formatTaskStageLabel(stage: TaskStage): string {
  return STAGE_LABELS[stage];
}

export function formatBlockerLabel(reason: TaskBlockerReason): string {
  return BLOCKER_LABELS[reason];
}

export function formatNextActionLabel(action: NextBestAction): string {
  return `${action.title}：${action.description}`;
}

// ============================================================================
// Derive Title
// ============================================================================

function deriveTitle(
  workItem: WorkItemRecord | null,
  snapshot: AgentSessionSnapshot | null
): string {
  if (workItem?.title) return workItem.title;
  if (workItem?.goalSummary) return workItem.goalSummary;
  if (snapshot?.userGoal) return snapshot.userGoal;
  return "未命名任务";
}

// ============================================================================
// Derive Updated At Label
// ============================================================================

function formatUpdatedAtAgo(isoString: string): string {
  try {
    const then = new Date(isoString).getTime();
    const now = Date.now();
    const diffMs = now - then;
    if (diffMs < 0) return "刚刚";
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} 小时前`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay} 天前`;
    return new Date(isoString).toLocaleDateString("zh-CN");
  } catch {
    return isoString;
  }
}

// ============================================================================
// Source Label
// ============================================================================

function formatSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    work_item_status: "工作项状态",
    session_snapshot: "会话快照",
    resume_meta: "恢复元数据",
    default: "默认",
    task_progress: "任务进度",
    blocker_reason: "阻塞原因",
    session_snapshot_source: "会话快照",
    user_memory: "用户记忆"
  };
  return labels[source] ?? source;
}

// ============================================================================
// Builders
// ============================================================================

export interface BuildWorkboardViewModelInput {
  workItem: WorkItemRecord | null;
  snapshot: AgentSessionSnapshot | null;
  resumeMeta?: PersistedCliResumeMeta | null;
  progress: TaskProgress;
  action: NextBestAction;
}

export function buildWorkboardViewModel(input: BuildWorkboardViewModelInput): WorkboardViewModel {
  const { workItem, snapshot, progress, action } = input;

  return {
    title: deriveTitle(workItem, snapshot),
    stage: progress.stage,
    stageLabel: formatTaskStageLabel(progress.stage),
    blocked: progress.blocked,
    blockerLabel: progress.blocked && progress.blockerReason
      ? formatBlockerLabel(progress.blockerReason)
      : undefined,
    summary: progress.summary,
    nextActionTitle: action.title,
    nextActionDescription: action.description,
    nextActionPrompt: action.suggestedPrompt || undefined,
    updatedAtLabel: formatUpdatedAtAgo(progress.lastUpdatedAt),
    sourceLabel: formatSourceLabel(progress.derivedFrom),
    isLegacySession: workItem === null,
    sessionStatus: progress.sessionStatus
  };
}

export function buildLegacyWorkboardViewModel(input: {
  recordSessionId: string;
  snapshot: AgentSessionSnapshot | null;
  resumeMeta?: PersistedCliResumeMeta | null;
  progress: TaskProgress;
  action: NextBestAction;
}): WorkboardViewModel {
  const { recordSessionId, snapshot, progress, action } = input;

  const title = snapshot?.userGoal
    ? `${snapshot.userGoal}`
    : `Session ${recordSessionId.slice(0, 8)}`;

  return {
    title,
    stage: progress.stage,
    stageLabel: formatTaskStageLabel(progress.stage),
    blocked: progress.blocked,
    blockerLabel: progress.blocked && progress.blockerReason
      ? formatBlockerLabel(progress.blockerReason)
      : undefined,
    summary: progress.summary,
    nextActionTitle: action.title,
    nextActionDescription: action.description,
    nextActionPrompt: action.suggestedPrompt || undefined,
    updatedAtLabel: formatUpdatedAtAgo(progress.lastUpdatedAt),
    sourceLabel: formatSourceLabel(progress.derivedFrom),
    isLegacySession: true,
    sessionStatus: progress.sessionStatus
  };
}

export interface BuildDegradedWorkboardViewModelInput {
  workItemId: string;
  recordSessionId: string;
  snapshot: AgentSessionSnapshot | null;
  resumeMeta?: PersistedCliResumeMeta | null;
  progress: TaskProgress;
  action: NextBestAction;
}

export function buildDegradedWorkboardViewModel(input: BuildDegradedWorkboardViewModelInput): WorkboardViewModel {
  const { workItemId, recordSessionId, snapshot, progress, action } = input;

  const title = snapshot?.userGoal
    ? `${snapshot.userGoal}`
    : `Session ${recordSessionId.slice(0, 8)}`;

  return {
    title,
    stage: progress.stage,
    stageLabel: formatTaskStageLabel(progress.stage),
    blocked: progress.blocked,
    blockerLabel: progress.blocked && progress.blockerReason
      ? formatBlockerLabel(progress.blockerReason)
      : undefined,
    summary: progress.summary,
    nextActionTitle: action.title,
    nextActionDescription: action.description,
    nextActionPrompt: action.suggestedPrompt || undefined,
    updatedAtLabel: formatUpdatedAtAgo(progress.lastUpdatedAt),
    sourceLabel: formatSourceLabel(progress.derivedFrom),
    isLegacySession: false,
    isDegraded: true,
    sessionStatus: progress.sessionStatus
  };
}

// ============================================================================
// Context Bar Data (Phase 2 CLI Upgrade)
// ============================================================================

/**
 * Compact context bar data for shell renderer.
 * Extracted from WorkboardViewModel for the unified 4-zone layout.
 */
export interface ContextBarData {
  stageLabel: string;
  summary: string;
  nextActionTitle: string;
  blocked: boolean;
  blockerLabel?: string;
}

/**
 * Extract context bar data from WorkboardViewModel.
 * Used by shell-renderer to render the context bar zone.
 */
export function toContextBar(viewModel: WorkboardViewModel): ContextBarData {
  return {
    stageLabel: viewModel.stageLabel,
    summary: viewModel.summary,
    nextActionTitle: viewModel.nextActionTitle,
    blocked: viewModel.blocked,
    blockerLabel: viewModel.blockerLabel
  };
}
