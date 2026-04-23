import { describe, expect, it } from "vitest";

import { deriveNextBestAction, deriveBlockedAction, deriveStageAction, enrichWithMemory } from "../next-best-action.js";
import type { TaskProgress, TaskStage, TaskBlockerReason } from "../task-progress-types.js";
import type { NextBestAction, NextBestActionType } from "../next-best-action-types.js";
import type { UserMemoryContext, UserMemoryRecord } from "../user-memory-types.js";

// ============================================================================
// Helpers
// ============================================================================

function makeProgress(
  overrides: Partial<TaskProgress> = {}
): TaskProgress {
  return {
    stage: "intake",
    blocked: false,
    summary: "",
    lastUpdatedAt: "2026-04-20T00:00:00.000Z",
    workItemStatus: "active",
    derivedFrom: "default",
    ...overrides
  };
}

function makeWorkItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "wi-1",
    userId: "user-1",
    title: "test",
    goalSummary: null,
    status: "active" as const,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function makeMemoryContext(
  overrides: Partial<UserMemoryContext> = {}
): UserMemoryContext {
  return {
    userId: "user-1",
    memoryPaused: false,
    preferences: [],
    feedbacks: [],
    candidateFeedbacks: [],
    hiringContexts: [],
    allMemories: [],
    ...overrides
  };
}

function makeExplicitPref(content: Record<string, unknown>): UserMemoryRecord {
  return {
    id: "mem-1",
    userId: "user-1",
    kind: "preference",
    scope: { kind: "global" },
    content,
    source: "explicit",
    confidence: 1.0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// ============================================================================
// Blocked Action Tests
// ============================================================================

describe("deriveBlockedAction", () => {
  it("conditions_insufficient -> clarify_requirement", () => {
    const action = deriveBlockedAction("conditions_insufficient", "searching");
    expect(action.type).toBe("clarify_requirement");
    expect(action.source).toBe("blocker_reason");
    expect(action.priority).toBe(10);
    expect(action.suggestedPrompt).toBeTruthy();
  });

  it("retrieval_zero_hits -> relax_constraint", () => {
    const action = deriveBlockedAction("retrieval_zero_hits", "searching");
    expect(action.type).toBe("relax_constraint");
    expect(action.reason).toBe("blocked_retrieval_zero_hits");
  });

  it("retrieval_all_weak -> tighten_constraint", () => {
    const action = deriveBlockedAction("retrieval_all_weak", "searching");
    expect(action.type).toBe("tighten_constraint");
    expect(action.reason).toBe("blocked_retrieval_all_weak");
  });

  it("recovery_budget_exhausted -> refine_search", () => {
    const action = deriveBlockedAction("recovery_budget_exhausted", "searching");
    expect(action.type).toBe("refine_search");
    expect(action.reason).toBe("blocked_recovery_budget_exhausted");
  });

  it("boundary_failure -> collect_missing_evidence", () => {
    const action = deriveBlockedAction("boundary_failure", "searching");
    expect(action.type).toBe("collect_missing_evidence");
    expect(action.reason).toBe("blocked_boundary_failure");
  });
});

// ============================================================================
// Stage Action Tests
// ============================================================================

describe("deriveStageAction", () => {
  it("intake -> clarify_requirement", () => {
    const action = deriveStageAction("intake", null);
    expect(action.type).toBe("clarify_requirement");
    expect(action.reason).toBe("stage_intake");
  });

  it("clarifying -> clarify_requirement", () => {
    const action = deriveStageAction("clarifying", null);
    expect(action.type).toBe("clarify_requirement");
  });

  it("searching -> refine_search", () => {
    const action = deriveStageAction("searching", null);
    expect(action.type).toBe("refine_search");
  });

  it("shortlist_ready -> compare_candidates", () => {
    const action = deriveStageAction("shortlist_ready", null);
    expect(action.type).toBe("compare_candidates");
  });

  it("comparing without recommendation -> compare_candidates", () => {
    const action = deriveStageAction("comparing", null);
    expect(action.type).toBe("compare_candidates");
  });

  it("comparing with recommendation -> close_task", () => {
    const snapshot = {
      recommendedCandidate: {
        candidate: { personId: "p-1" },
        createdAt: "2026-04-20T00:00:00.000Z"
      }
    } as any;
    const action = deriveStageAction("comparing", snapshot);
    expect(action.type).toBe("close_task");
    expect(action.source).toBe("session_snapshot");
  });

  it("decision_ready -> close_task", () => {
    const action = deriveStageAction("decision_ready", null);
    expect(action.type).toBe("close_task");
  });

  it("completed -> close_task", () => {
    const action = deriveStageAction("completed", null);
    expect(action.type).toBe("close_task");
  });

  it("abandoned -> refine_search", () => {
    const action = deriveStageAction("abandoned", null);
    expect(action.type).toBe("refine_search");
    expect(action.reason).toBe("stage_abandoned");
  });
});

// ============================================================================
// Memory Enrichment Tests
// ============================================================================

describe("enrichWithMemory", () => {
  it("does not change action type", () => {
    const action: NextBestAction = {
      type: "clarify_requirement",
      title: "test",
      description: "desc",
      reason: "stage_intake",
      source: "task_progress",
      priority: 50,
      derivedFrom: "stage:intake"
    };
    const ctx = makeMemoryContext({
      preferences: [makeExplicitPref({ role: "AI 工程师" })]
    });
    const result = enrichWithMemory(action, ctx);
    expect(result.type).toBe("clarify_requirement");
  });

  it("enriches description with explicit preference", () => {
    const action: NextBestAction = {
      type: "clarify_requirement",
      title: "test",
      description: "desc",
      reason: "stage_intake",
      source: "task_progress",
      priority: 50,
      derivedFrom: "stage:intake"
    };
    const ctx = makeMemoryContext({
      preferences: [makeExplicitPref({ role: "AI 工程师" })]
    });
    const result = enrichWithMemory(action, ctx);
    expect(result.description).toContain("AI 工程师");
    expect(result.context?.enrichedByMemory).toBe(true);
  });

  it("does not enrich when memory is paused", () => {
    const action: NextBestAction = {
      type: "clarify_requirement",
      title: "test",
      description: "desc",
      reason: "stage_intake",
      source: "task_progress",
      priority: 50,
      derivedFrom: "stage:intake"
    };
    const ctx = makeMemoryContext({
      memoryPaused: true,
      preferences: [makeExplicitPref({ role: "AI 工程师" })]
    });
    const result = enrichWithMemory(action, ctx);
    expect(result.description).toBe("desc");
  });

  it("does not enrich non-relevant action types", () => {
    const action: NextBestAction = {
      type: "close_task",
      title: "test",
      description: "desc",
      reason: "stage_decision_ready",
      source: "task_progress",
      priority: 50,
      derivedFrom: "stage:decision_ready"
    };
    const ctx = makeMemoryContext({
      preferences: [makeExplicitPref({ role: "AI 工程师" })]
    });
    const result = enrichWithMemory(action, ctx);
    expect(result.description).toBe("desc");
  });

  it("memory does not override task truth", () => {
    // Even with memory, a blocked action stays blocked.
    const progress = makeProgress({ blocked: true, blockerReason: "retrieval_zero_hits", stage: "searching" });
    const action = deriveNextBestAction({
      taskProgress: progress,
      workItem: makeWorkItem(),
      memoryContext: makeMemoryContext({
        preferences: [makeExplicitPref({ role: "AI 工程师" })]
      })
    });
    expect(action.type).toBe("relax_constraint");
    // Memory enriches description but doesn't change the action type.
    expect(action.reason).toBe("blocked_retrieval_zero_hits");
  });
});

// ============================================================================
// Full Derivation Tests
// ============================================================================

describe("deriveNextBestAction", () => {
  it("blocked takes priority over stage", () => {
    const progress = makeProgress({ stage: "searching", blocked: true, blockerReason: "retrieval_zero_hits" });
    const action = deriveNextBestAction({ taskProgress: progress, workItem: makeWorkItem() });
    expect(action.type).toBe("relax_constraint");
    expect(action.source).toBe("blocker_reason");
    expect(action.priority).toBe(10);
  });

  it("non-blocked uses stage action", () => {
    const progress = makeProgress({ stage: "shortlist_ready", blocked: false });
    const action = deriveNextBestAction({ taskProgress: progress, workItem: makeWorkItem() });
    expect(action.type).toBe("compare_candidates");
    expect(action.source).toBe("task_progress");
  });

  it("works with null workItem (legacy session)", () => {
    const progress = makeProgress({ stage: "intake", blocked: false });
    const action = deriveNextBestAction({ taskProgress: progress, workItem: null });
    expect(action.type).toBe("clarify_requirement");
  });

  it("works with null snapshot", () => {
    const progress = makeProgress({ stage: "comparing", blocked: false });
    const action = deriveNextBestAction({ taskProgress: progress, workItem: makeWorkItem(), snapshot: null });
    expect(action.type).toBe("compare_candidates");
  });

  it("works with null resumeMeta", () => {
    const progress = makeProgress({ stage: "decision_ready", blocked: false });
    const action = deriveNextBestAction({ taskProgress: progress, workItem: makeWorkItem(), resumeMeta: null });
    expect(action.type).toBe("close_task");
  });

  it("every stage produces a valid action with reason/source", () => {
    const stages: TaskStage[] = [
      "intake", "clarifying", "searching", "shortlist_ready",
      "comparing", "decision_ready", "completed", "abandoned"
    ];
    for (const stage of stages) {
      const progress = makeProgress({ stage, blocked: false });
      const action = deriveNextBestAction({ taskProgress: progress, workItem: makeWorkItem() });
      expect(action.type).toBeTruthy();
      expect(action.reason).toBeTruthy();
      expect(action.source).toBeTruthy();
      expect(action.title).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.derivedFrom).toBeTruthy();
      // Title/description must describe a user action, not a passive state.
      // Passive phrasing like "等待" or "正在…中" (without actionable guidance) is a smell.
      expect(action.title).not.toContain("等待");
      expect(action.description).not.toMatch(/^正在[^，]+$/);
    }
  });

  it("every blocker reason produces a valid action", () => {
    const reasons: TaskBlockerReason[] = [
      "conditions_insufficient", "retrieval_zero_hits",
      "retrieval_all_weak", "recovery_budget_exhausted", "boundary_failure"
    ];
    for (const reason of reasons) {
      const progress = makeProgress({ stage: "searching", blocked: true, blockerReason: reason });
      const action = deriveNextBestAction({ taskProgress: progress, workItem: makeWorkItem() });
      expect(action.type).toBeTruthy();
      expect(action.reason).toBeTruthy();
      expect(action.suggestedPrompt).toBeTruthy();
      expect(action.priority).toBe(10);
    }
  });

  it("resumeMeta-only path produces action", () => {
    const progress = makeProgress({ stage: "shortlist_ready", blocked: false, derivedFrom: "resume_meta" });
    const action = deriveNextBestAction({
      taskProgress: progress,
      workItem: makeWorkItem(),
      snapshot: null,
      resumeMeta: {
        kind: "stopped_session",
        resumability: "read_only",
        status: "shortlist",
        statusSummary: null,
        whySummary: null,
        lastStatusAt: "2026-04-20T00:00:00.000Z"
      }
    });
    expect(action.type).toBe("compare_candidates");
  });
});
