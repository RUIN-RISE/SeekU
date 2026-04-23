import { describe, expect, it } from "vitest";

import {
  buildWorkboardViewModel,
  buildLegacyWorkboardViewModel,
  buildDegradedWorkboardViewModel,
  formatTaskStageLabel,
  formatBlockerLabel,
  formatNextActionLabel
} from "../workboard-view-model.js";
import type { TaskProgress, TaskStage, TaskBlockerReason } from "../task-progress-types.js";
import type { NextBestAction } from "../next-best-action-types.js";
import type { WorkItemRecord } from "../work-item-types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeProgress(overrides: Partial<TaskProgress> = {}): TaskProgress {
  return {
    stage: "shortlist_ready",
    blocked: false,
    summary: "候选短名单已就绪",
    lastUpdatedAt: new Date().toISOString(),
    workItemStatus: "active",
    derivedFrom: "session_snapshot",
    ...overrides
  };
}

function makeWorkItem(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: "wi-1",
    userId: "user-1",
    title: "找 AI 工程师",
    goalSummary: null,
    status: "active",
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function makeAction(overrides: Partial<NextBestAction> = {}): NextBestAction {
  return {
    type: "compare_candidates",
    title: "对比候选人",
    description: "短名单已就绪，可以选择候选人进行对比",
    reason: "stage_shortlist_ready",
    source: "task_progress",
    priority: 50,
    suggestedPrompt: "我想对比前两位候选人",
    derivedFrom: "stage:shortlist_ready",
    ...overrides
  };
}

// ============================================================================
// Label Formatters
// ============================================================================

describe("formatTaskStageLabel", () => {
  it("maps every stage to a non-empty Chinese label", () => {
    const stages: TaskStage[] = [
      "intake", "clarifying", "searching", "shortlist_ready",
      "comparing", "decision_ready", "completed", "abandoned"
    ];
    for (const stage of stages) {
      expect(formatTaskStageLabel(stage)).toBeTruthy();
      expect(formatTaskStageLabel(stage)).not.toBe(stage);
    }
  });
});

describe("formatBlockerLabel", () => {
  it("maps every blocker reason to a non-empty label", () => {
    const reasons: TaskBlockerReason[] = [
      "conditions_insufficient", "retrieval_zero_hits",
      "retrieval_all_weak", "recovery_budget_exhausted", "boundary_failure"
    ];
    for (const reason of reasons) {
      expect(formatBlockerLabel(reason)).toBeTruthy();
      expect(formatBlockerLabel(reason)).not.toBe(reason);
    }
  });
});

describe("formatNextActionLabel", () => {
  it("combines title and description", () => {
    const action = makeAction();
    const label = formatNextActionLabel(action);
    expect(label).toContain("对比候选人");
    expect(label).toContain("短名单已就绪");
  });
});

// ============================================================================
// buildWorkboardViewModel
// ============================================================================

describe("buildWorkboardViewModel", () => {
  it("work item + snapshot -> task-centric view model", () => {
    const workItem = makeWorkItem();
    const progress = makeProgress();
    const action = makeAction();

    const vm = buildWorkboardViewModel({ workItem, snapshot: null, progress, action });

    expect(vm.title).toBe("找 AI 工程师");
    expect(vm.stage).toBe("shortlist_ready");
    expect(vm.stageLabel).toBe("短名单就绪");
    expect(vm.blocked).toBe(false);
    expect(vm.blockerLabel).toBeUndefined();
    expect(vm.summary).toBe("候选短名单已就绪");
    expect(vm.nextActionTitle).toBe("对比候选人");
    expect(vm.nextActionDescription).toContain("短名单已就绪");
    expect(vm.nextActionPrompt).toBe("我想对比前两位候选人");
    expect(vm.isLegacySession).toBe(false);
  });

  it("blocked task -> blocker label shown", () => {
    const progress = makeProgress({
      blocked: true,
      blockerReason: "retrieval_zero_hits",
      summary: "正在检索候选人（检索无结果）"
    });
    const action = makeAction({
      type: "relax_constraint",
      title: "放宽搜索条件",
      description: "当前条件下没有检索到候选人",
      reason: "blocked_retrieval_zero_hits",
      source: "blocker_reason",
      priority: 10,
      suggestedPrompt: "尝试放宽地点或经验年限要求",
      derivedFrom: "blocked:retrieval_zero_hits@searching"
    });

    const vm = buildWorkboardViewModel({
      workItem: makeWorkItem(),
      snapshot: null,
      progress,
      action
    });

    expect(vm.blocked).toBe(true);
    expect(vm.blockerLabel).toBe("检索无结果");
    expect(vm.nextActionTitle).toBe("放宽搜索条件");
    expect(vm.sourceLabel).toBeTruthy();
  });

  it("blocked=false -> no blocker label", () => {
    const progress = makeProgress({ blocked: false });
    const action = makeAction();

    const vm = buildWorkboardViewModel({
      workItem: makeWorkItem(),
      snapshot: null,
      progress,
      action
    });

    expect(vm.blocked).toBe(false);
    expect(vm.blockerLabel).toBeUndefined();
  });

  it("falls back to goalSummary when title is null", () => {
    const workItem = makeWorkItem({ title: null, goalSummary: "找后端工程师" });
    const progress = makeProgress();
    const action = makeAction();

    const vm = buildWorkboardViewModel({ workItem, snapshot: null, progress, action });
    expect(vm.title).toBe("找后端工程师");
  });

  it("falls back to snapshot userGoal when work item has no title/goalSummary", () => {
    const workItem = makeWorkItem({ title: null, goalSummary: null });
    const snapshot = { userGoal: "找全栈工程师" } as any;
    const progress = makeProgress();
    const action = makeAction();

    const vm = buildWorkboardViewModel({ workItem, snapshot, progress, action });
    expect(vm.title).toBe("找全栈工程师");
  });

  it("falls back to default title when nothing available", () => {
    const workItem = makeWorkItem({ title: null, goalSummary: null });
    const progress = makeProgress();
    const action = makeAction();

    const vm = buildWorkboardViewModel({ workItem, snapshot: null, progress, action });
    expect(vm.title).toBe("未命名任务");
  });

  it("completed task shows correct stage label", () => {
    const workItem = makeWorkItem({ status: "completed" });
    const progress = makeProgress({ stage: "completed", summary: "任务已完成" });
    const action = makeAction({
      type: "close_task",
      title: "任务已完成",
      description: "此任务已完成",
      reason: "stage_completed",
      derivedFrom: "stage:completed"
    });

    const vm = buildWorkboardViewModel({ workItem, snapshot: null, progress, action });
    expect(vm.stage).toBe("completed");
    expect(vm.stageLabel).toBe("已完成");
    expect(vm.nextActionTitle).toBe("任务已完成");
  });

  it("abandoned task shows correct stage label", () => {
    const workItem = makeWorkItem({ status: "abandoned" });
    const progress = makeProgress({ stage: "abandoned", summary: "任务已放弃" });
    const action = makeAction({
      type: "refine_search",
      title: "重新搜索",
      description: "此任务已放弃，可以重新开始搜索",
      reason: "stage_abandoned",
      derivedFrom: "stage:abandoned"
    });

    const vm = buildWorkboardViewModel({ workItem, snapshot: null, progress, action });
    expect(vm.stage).toBe("abandoned");
    expect(vm.stageLabel).toBe("已放弃");
  });

  it("isLegacySession is true when workItem is null", () => {
    const progress = makeProgress();
    const action = makeAction();

    const vm = buildWorkboardViewModel({ workItem: null, snapshot: null, progress, action });
    expect(vm.isLegacySession).toBe(true);
  });

  it("updatedAtLabel is a relative time string", () => {
    const progress = makeProgress({ lastUpdatedAt: new Date().toISOString() });
    const action = makeAction();

    const vm = buildWorkboardViewModel({ workItem: makeWorkItem(), snapshot: null, progress, action });
    expect(vm.updatedAtLabel).toBeTruthy();
    expect(vm.updatedAtLabel).toContain("刚刚");
  });

  it("sourceLabel maps derivedFrom to Chinese", () => {
    const progress = makeProgress({ derivedFrom: "session_snapshot" });
    const action = makeAction();

    const vm = buildWorkboardViewModel({ workItem: makeWorkItem(), snapshot: null, progress, action });
    expect(vm.sourceLabel).toBe("会话快照");
  });

  it("sessionStatus is propagated from progress", () => {
    const progress = makeProgress({ sessionStatus: "shortlist" });
    const action = makeAction();

    const vm = buildWorkboardViewModel({ workItem: makeWorkItem(), snapshot: null, progress, action });
    expect(vm.sessionStatus).toBe("shortlist");
  });
});

// ============================================================================
// buildLegacyWorkboardViewModel
// ============================================================================

describe("buildLegacyWorkboardViewModel", () => {
  it("uses snapshot userGoal as title", () => {
    const progress = makeProgress();
    const action = makeAction();
    const snapshot = { userGoal: "找一个资深后端", sessionId: "abc-123" } as any;

    const vm = buildLegacyWorkboardViewModel({
      recordSessionId: "abc-123",
      snapshot,
      progress,
      action
    });

    expect(vm.title).toBe("找一个资深后端");
    expect(vm.isLegacySession).toBe(true);
  });

  it("falls back to session ID prefix when no userGoal", () => {
    const progress = makeProgress();
    const action = makeAction();

    const vm = buildLegacyWorkboardViewModel({
      recordSessionId: "abc-123-def-456",
      snapshot: null,
      progress,
      action
    });

    expect(vm.title).toContain("abc-123-");
    expect(vm.isLegacySession).toBe(true);
  });

  it("handles no snapshot, no resumeMeta", () => {
    const progress = makeProgress({ stage: "intake" });
    const action = makeAction({
      type: "clarify_requirement",
      title: "描述搜索需求",
      description: "描述你想要找什么样的人才",
      reason: "stage_intake",
      derivedFrom: "stage:intake"
    });

    const vm = buildLegacyWorkboardViewModel({
      recordSessionId: "legacy-session-1",
      snapshot: null,
      resumeMeta: null,
      progress,
      action
    });

    expect(vm.stage).toBe("intake");
    expect(vm.stageLabel).toBe("需求录入");
    expect(vm.isLegacySession).toBe(true);
    expect(vm.nextActionTitle).toBe("描述搜索需求");
  });

  it("handles resumeMeta-only path (no snapshot)", () => {
    const progress = makeProgress({
      stage: "searching",
      derivedFrom: "resume_meta"
    });
    const action = makeAction({
      type: "refine_search",
      title: "调整搜索条件",
      description: "检索进行中，可以随时补充或调整条件",
      reason: "stage_searching",
      derivedFrom: "stage:searching"
    });

    const vm = buildLegacyWorkboardViewModel({
      recordSessionId: "stopped-session",
      snapshot: null,
      resumeMeta: {
        kind: "stopped_session",
        resumability: "read_only",
        status: "searching",
        statusSummary: null,
        whySummary: null,
        lastStatusAt: new Date().toISOString()
      },
      progress,
      action
    });

    expect(vm.stage).toBe("searching");
    expect(vm.sourceLabel).toBe("恢复元数据");
    expect(vm.isLegacySession).toBe(true);
  });
});

// ============================================================================
// Integration: view model reflects B2/B3 truth, not memory overrides
// ============================================================================

describe("view model respects task truth", () => {
  it("memory enrichment only affects next action description, not stage/blocker", () => {
    const progress = makeProgress({
      stage: "intake",
      blocked: false,
      summary: "等待输入搜索需求"
    });
    const action = makeAction({
      type: "clarify_requirement",
      title: "描述搜索需求",
      description: "描述你想要找什么样的人才（根据你的偏好：偏好 AI 工程师 方向）",
      reason: "stage_intake",
      source: "task_progress",
      priority: 50,
      suggestedPrompt: "我想找一个…",
      derivedFrom: "stage:intake+memory"
    });

    const vm = buildWorkboardViewModel({
      workItem: makeWorkItem(),
      snapshot: null,
      progress,
      action
    });

    // Stage/blocker truth comes from progress, unaffected by memory.
    expect(vm.stage).toBe("intake");
    expect(vm.stageLabel).toBe("需求录入");
    expect(vm.blocked).toBe(false);
    expect(vm.blockerLabel).toBeUndefined();

    // Next action description reflects memory enrichment.
    expect(vm.nextActionDescription).toContain("AI 工程师");
  });
});

// ============================================================================
// buildDegradedWorkboardViewModel
// ============================================================================

describe("buildDegradedWorkboardViewModel", () => {
  it("signals degraded state when workItemId exists but work item not found", () => {
    const progress = makeProgress({ stage: "searching" });
    const action = makeAction();

    const vm = buildDegradedWorkboardViewModel({
      workItemId: "wi-missing",
      recordSessionId: "session-123",
      snapshot: null,
      resumeMeta: null,
      progress,
      action
    });

    expect(vm.isLegacySession).toBe(false);
    expect(vm.isDegraded).toBe(true);
    expect(vm.title).toContain("session-");
  });

  it("uses snapshot userGoal as title when available", () => {
    const progress = makeProgress();
    const action = makeAction();
    const snapshot = { userGoal: "找一个资深后端", sessionId: "abc" } as any;

    const vm = buildDegradedWorkboardViewModel({
      workItemId: "wi-missing",
      recordSessionId: "abc",
      snapshot,
      resumeMeta: null,
      progress,
      action
    });

    expect(vm.title).toBe("找一个资深后端");
    expect(vm.isDegraded).toBe(true);
  });

  it("isDegraded is distinct from isLegacySession", () => {
    const progress = makeProgress();
    const action = makeAction();

    // Legacy: no workItemId at all
    const legacyVm = buildLegacyWorkboardViewModel({
      recordSessionId: "legacy-1",
      snapshot: null,
      resumeMeta: null,
      progress,
      action
    });
    expect(legacyVm.isLegacySession).toBe(true);
    expect(legacyVm.isDegraded).toBeUndefined();

    // Degraded: workItemId exists but work item missing
    const degradedVm = buildDegradedWorkboardViewModel({
      workItemId: "wi-missing",
      recordSessionId: "session-2",
      snapshot: null,
      resumeMeta: null,
      progress,
      action
    });
    expect(degradedVm.isLegacySession).toBe(false);
    expect(degradedVm.isDegraded).toBe(true);
  });
});
