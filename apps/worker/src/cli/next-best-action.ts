/**
 * Next-best-action engine — pure, deterministic, rule-based.
 *
 * Derives a single top action recommendation from TaskProgress + optional
 * session snapshot + optional user memory. Does not call models, write DB,
 * or execute actions.
 *
 * Rules:
 * - Blocked scenarios produce unblock actions first.
 * - Non-blocked stages produce stage-appropriate actions.
 * - Memory only enriches explanation; never overrides task truth.
 */

import type { AgentSessionSnapshot } from "./agent-session-events.js";
import type { PersistedCliResumeMeta } from "./session-ledger.js";
import type { TaskBlockerReason, TaskProgress, TaskStage } from "./task-progress-types.js";
import type { UserMemoryContext } from "./user-memory-types.js";
import type {
  NextBestAction,
  NextBestActionReason,
  NextBestActionSource,
  NextBestActionType
} from "./next-best-action-types.js";
import type { WorkItemRecord } from "./work-item-types.js";

// ============================================================================
// Derivation Input
// ============================================================================

export interface DeriveNextBestActionInput {
  taskProgress: TaskProgress;
  workItem: WorkItemRecord | null;
  snapshot?: AgentSessionSnapshot | null;
  resumeMeta?: PersistedCliResumeMeta | null;
  memoryContext?: UserMemoryContext | null;
}

// ============================================================================
// Blocked Action Rules
// ============================================================================
//
// Blocked scenarios take priority over stage-based actions.
// Each blocker maps to an unblock action.

const BLOCKER_ACTIONS: Record<TaskBlockerReason, {
  type: NextBestActionType;
  title: string;
  description: string;
  reason: NextBestActionReason;
  suggestedPrompt: string;
}> = {
  conditions_insufficient: {
    type: "clarify_requirement",
    title: "补充搜索条件",
    description: "当前条件不足以精确匹配，需要补充技能、角色或地点要求",
    reason: "blocked_conditions_insufficient",
    suggestedPrompt: "描述你理想候选人最关键的一两项技能或角色"
  },
  retrieval_zero_hits: {
    type: "relax_constraint",
    title: "放宽搜索条件",
    description: "当前条件下没有检索到候选人，建议放宽部分限制",
    reason: "blocked_retrieval_zero_hits",
    suggestedPrompt: "尝试放宽地点或经验年限要求"
  },
  retrieval_all_weak: {
    type: "tighten_constraint",
    title: "精确化搜索条件",
    description: "检索结果匹配度均较弱，建议收窄或明确核心需求",
    reason: "blocked_retrieval_all_weak",
    suggestedPrompt: "你希望候选人必须具备哪项核心能力？"
  },
  recovery_budget_exhausted: {
    type: "refine_search",
    title: "重新描述需求",
    description: "自动恢复已用尽，建议换个角度描述搜索需求",
    reason: "blocked_recovery_budget_exhausted",
    suggestedPrompt: "换个方式描述你想要的人才"
  },
  boundary_failure: {
    type: "collect_missing_evidence",
    title: "补充关键信息",
    description: "搜索遇到边界限制，需要补充信息才能继续",
    reason: "blocked_boundary_failure",
    suggestedPrompt: "提供更多关于目标角色或团队的背景"
  }
};

export function deriveBlockedAction(
  blockerReason: TaskBlockerReason,
  stage: TaskStage
): NextBestAction {
  const rule = BLOCKER_ACTIONS[blockerReason];
  return {
    type: rule.type,
    title: rule.title,
    description: rule.description,
    reason: rule.reason,
    source: "blocker_reason",
    priority: 10,
    suggestedPrompt: rule.suggestedPrompt,
    derivedFrom: `blocked:${blockerReason}@${stage}`
  };
}

// ============================================================================
// Stage Action Rules
// ============================================================================
//
// Each non-blocked stage maps to a default action.
// The action may be refined by snapshot data (e.g., recommendation present).

const STAGE_ACTIONS: Record<TaskStage, {
  type: NextBestActionType;
  title: string;
  description: string;
  reason: NextBestActionReason;
  suggestedPrompt: string;
}> = {
  intake: {
    type: "clarify_requirement",
    title: "描述搜索需求",
    description: "描述你想要找什么样的人才",
    reason: "stage_intake",
    suggestedPrompt: "我想找一个…"
  },
  clarifying: {
    type: "clarify_requirement",
    title: "继续明确条件",
    description: "补充或调整搜索条件以获得更精确的结果",
    reason: "stage_clarifying",
    suggestedPrompt: "补充你最看重的一个条件"
  },
  searching: {
    type: "refine_search",
    title: "调整搜索条件",
    description: "检索进行中，可以随时补充或调整条件以获得更精确的结果",
    reason: "stage_searching",
    suggestedPrompt: "补充或调整搜索条件"
  },
  shortlist_ready: {
    type: "compare_candidates",
    title: "对比候选人",
    description: "短名单已就绪，可以选择候选人进行对比",
    reason: "stage_shortlist_ready",
    suggestedPrompt: "我想对比前两位候选人"
  },
  comparing: {
    type: "compare_candidates",
    title: "继续对比",
    description: "正在对比候选人，可以继续深入比较",
    reason: "stage_comparing",
    suggestedPrompt: "展开更多证据细节"
  },
  decision_ready: {
    type: "close_task",
    title: "确认推荐",
    description: "已有推荐候选人，可以确认或继续调整",
    reason: "stage_decision_ready",
    suggestedPrompt: "确认推荐这位候选人"
  },
  completed: {
    type: "close_task",
    title: "任务已完成",
    description: "此任务已完成",
    reason: "stage_completed",
    suggestedPrompt: ""
  },
  abandoned: {
    type: "refine_search",
    title: "重新搜索",
    description: "此任务已放弃，可以重新开始搜索",
    reason: "stage_abandoned",
    suggestedPrompt: "我想重新开始搜索"
  }
};

export function deriveStageAction(
  stage: TaskStage,
  snapshot: AgentSessionSnapshot | null
): NextBestAction {
  const base = STAGE_ACTIONS[stage];

  // Refine comparing stage based on recommendation presence.
  if (stage === "comparing" && snapshot?.recommendedCandidate) {
    return {
      type: "close_task",
      title: "确认推荐",
      description: "对比已有推荐结果，可以确认选择",
      reason: "stage_decision_ready",
      source: "session_snapshot",
      priority: 50,
      suggestedPrompt: "确认推荐这位候选人",
      derivedFrom: `stage:${stage}+recommendation`
    };
  }

  return {
    type: base.type,
    title: base.title,
    description: base.description,
    reason: base.reason,
    source: "task_progress",
    priority: 50,
    suggestedPrompt: base.suggestedPrompt || undefined,
    derivedFrom: `stage:${stage}`
  };
}

// ============================================================================
// Memory Enrichment
// ============================================================================
//
// Memory can only enrich description/suggestedPrompt, never change action type
// or override task truth. V1 keeps this conservative.

export function enrichWithMemory(
  action: NextBestAction,
  memoryContext: UserMemoryContext | null | undefined
): NextBestAction {
  if (!memoryContext || memoryContext.memoryPaused) {
    return action;
  }

  const explicitPrefs = memoryContext.preferences.filter(
    (p) => p.source === "explicit" && p.kind === "preference"
  );

  if (explicitPrefs.length === 0) {
    return action;
  }

  // Only enrich actions that benefit from preference context.
  if (
    action.type !== "clarify_requirement" &&
    action.type !== "relax_constraint" &&
    action.type !== "refine_search"
  ) {
    return action;
  }

  const topPref = explicitPrefs[0];
  const prefHint = buildMemoryHint(topPref.content);
  if (!prefHint) {
    return action;
  }

  return {
    ...action,
    description: `${action.description}（根据你的偏好：${prefHint}）`,
    context: { ...action.context, enrichedByMemory: true },
    derivedFrom: `${action.derivedFrom}+memory`
  };
}

function buildMemoryHint(content: Record<string, unknown>): string | null {
  const role = content.role as string | undefined;
  const locations = content.locations as string[] | undefined;
  const techStack = content.techStack as string[] | undefined;

  if (role) return `偏好 ${role} 方向`;
  if (locations?.length) return `偏好 ${locations[0]} 地区`;
  if (techStack?.length) return `偏好 ${techStack.slice(0, 2).join("、")} 技术栈`;
  return null;
}

// ============================================================================
// Main Entry Point
// ============================================================================

export function deriveNextBestAction(input: DeriveNextBestActionInput): NextBestAction {
  const { taskProgress, workItem, snapshot, resumeMeta, memoryContext } = input;

  // Blocked scenarios take priority.
  if (taskProgress.blocked && taskProgress.blockerReason) {
    const action = deriveBlockedAction(taskProgress.blockerReason, taskProgress.stage);
    return enrichWithMemory(action, memoryContext);
  }

  // Stage-based action.
  const action = deriveStageAction(taskProgress.stage, snapshot ?? null);
  return enrichWithMemory(action, memoryContext);
}
