import { describe, expect, it } from "vitest";

import { deriveTaskProgress, deriveTaskStageFromSnapshot, deriveBlockerFromSnapshot, deriveTaskSummary } from "../task-progress-derivation.js";
import type { AgentSessionSnapshot } from "../agent-session-events.js";
import type { WorkItemRecord } from "../work-item-types.js";
import type { TaskStage, TaskBlockerReason } from "../task-progress-types.js";

// ============================================================================
// Helpers
// ============================================================================

function createMockSnapshot(
  overrides: Partial<AgentSessionSnapshot> = {}
): AgentSessionSnapshot {
  const base: AgentSessionSnapshot = {
    sessionId: "sess-1",
    runtime: {
      status: "idle",
      statusSummary: null,
      primaryWhyCode: "awaiting_user_input",
      whyCodes: ["awaiting_user_input"],
      whySummary: null,
      lastStatusAt: "2026-04-20T00:00:00.000Z"
    },
    userGoal: null,
    currentConditions: {
      skills: [],
      locations: [],
      mustHave: [],
      niceToHave: [],
      exclude: [],
      preferFresh: false,
      limit: 10
    },
    currentShortlist: [],
    activeCompareSet: [],
    confidenceStatus: {
      level: "low",
      updatedAt: "2026-04-20T00:00:00.000Z"
    },
    recommendedCandidate: null,
    openUncertainties: [],
    recoveryState: {
      phase: "idle",
      clarificationCount: 0,
      rewriteCount: 0,
      lowConfidenceEmitted: false
    },
    clarificationCount: 0,
    searchHistory: []
  };

  return { ...base, ...overrides, runtime: { ...base.runtime, ...overrides.runtime } } as AgentSessionSnapshot;
}

function createMockWorkItem(
  overrides: Partial<WorkItemRecord> = {}
): WorkItemRecord {
  return {
    id: "wi-1",
    userId: "user-1",
    title: "test task",
    goalSummary: null,
    status: "active",
    completedAt: null,
    createdAt: new Date("2026-04-20T00:00:00.000Z"),
    updatedAt: new Date("2026-04-20T00:00:00.000Z"),
    ...overrides
  };
}

function rt(overrides: Partial<AgentSessionSnapshot["runtime"]> = {}) {
  const base = createMockSnapshot().runtime;
  return { ...base, ...overrides };
}

// ============================================================================
// Stage Derivation Tests
// ============================================================================

describe("deriveTaskStageFromSnapshot", () => {
  it("returns intake when no snapshot and no work item status", () => {
    const result = deriveTaskStageFromSnapshot(null, undefined);
    expect(result.stage).toBe("intake");
    expect(result.source).toBe("default");
  });

  it("returns completed when work item status is completed", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ status: "searching" }) });
    const result = deriveTaskStageFromSnapshot(snapshot, "completed");
    expect(result.stage).toBe("completed");
    expect(result.source).toBe("work_item_status");
  });

  it("returns abandoned when work item status is abandoned", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ status: "searching" }) });
    const result = deriveTaskStageFromSnapshot(snapshot, "abandoned");
    expect(result.stage).toBe("abandoned");
    expect(result.source).toBe("work_item_status");
  });

  it("maps clarifying runtime to clarifying stage", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ status: "clarifying" }) });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("clarifying");
  });

  it("maps searching runtime to searching stage", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ status: "searching" }) });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("searching");
  });

  it("maps recovering runtime to searching stage (recovery is search sub-mode)", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ status: "recovering" }) });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("searching");
  });

  it("returns shortlist_ready when shortlist non-empty", () => {
    const snapshot = createMockSnapshot({
      currentShortlist: [{ personId: "p-1", name: "Test", matchScore: 0.8, sources: [] } as any]
    });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("shortlist_ready");
  });

  it("returns comparing when active compare set non-empty", () => {
    const snapshot = createMockSnapshot({
      activeCompareSet: [{ personId: "p-1", name: "Test", matchScore: 0.8, sources: [] } as any]
    });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("comparing");
  });

  it("returns decision_ready when recommendation present", () => {
    const snapshot = createMockSnapshot({
      recommendedCandidate: {
        candidate: { personId: "p-1", name: "Test", matchScore: 0.9, sources: [] } as any,
        createdAt: "2026-04-20T00:00:00.000Z",
        confidenceLevel: "high"
      }
    });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("decision_ready");
  });

  it("comparing runtime maps to comparing stage", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ status: "comparing" }) });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("comparing");
  });

  // waiting-input disambiguation — the core HIGH fix

  it("waiting-input without shortlist and no goal -> intake", () => {
    const snapshot = createMockSnapshot({
      runtime: rt({ status: "waiting-input", whyCodes: ["awaiting_user_input"] }),
      userGoal: null,
      currentShortlist: []
    });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("intake");
  });

  it("waiting-input without shortlist but has goal -> clarifying", () => {
    const snapshot = createMockSnapshot({
      runtime: rt({ status: "waiting-input", whyCodes: ["awaiting_user_input"] }),
      userGoal: "找 AI 工程师",
      currentShortlist: []
    });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("clarifying");
  });

  it("waiting-input with shortlist -> shortlist_ready", () => {
    const snapshot = createMockSnapshot({
      runtime: rt({ status: "waiting-input", whyCodes: ["awaiting_user_input"] }),
      currentShortlist: [{ personId: "p-1", name: "Test", matchScore: 0.8, sources: [] } as any]
    });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("shortlist_ready");
  });

  it("waiting-input with retrieval_zero_hits -> searching", () => {
    const snapshot = createMockSnapshot({
      runtime: rt({ status: "waiting-input", whyCodes: ["retrieval_zero_hits"] }),
      currentShortlist: []
    });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("searching");
  });

  it("waiting-input with conditions_insufficient -> clarifying", () => {
    const snapshot = createMockSnapshot({
      runtime: rt({ status: "waiting-input", whyCodes: ["conditions_insufficient"] }),
      currentShortlist: []
    });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("clarifying");
  });

  it("blocked runtime without structural data -> searching (boundary failure)", () => {
    const snapshot = createMockSnapshot({
      runtime: rt({ status: "blocked", whyCodes: [] }),
      userGoal: "找工程师",
      currentShortlist: []
    });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    // blocked without shortlist data -> why code disambiguation -> has goal -> clarifying
    expect(result.stage).toBe("clarifying");
  });

  it("blocked runtime with shortlist -> shortlist_ready", () => {
    const snapshot = createMockSnapshot({
      runtime: rt({ status: "blocked", whyCodes: [] }),
      currentShortlist: [{ personId: "p-1", name: "Test", matchScore: 0.8, sources: [] } as any]
    });
    const result = deriveTaskStageFromSnapshot(snapshot, "active");
    expect(result.stage).toBe("shortlist_ready");
  });
});

// ============================================================================
// Blocker Derivation Tests
// ============================================================================

describe("deriveBlockerFromSnapshot", () => {
  it("returns not blocked when no snapshot", () => {
    const result = deriveBlockerFromSnapshot(null);
    expect(result.blocked).toBe(false);
    expect(result.blockerReason).toBeUndefined();
  });

  it("returns not blocked when why codes empty", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ whyCodes: [] }) });
    const result = deriveBlockerFromSnapshot(snapshot);
    expect(result.blocked).toBe(false);
  });

  it("returns blocked for retrieval_zero_hits", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ whyCodes: ["retrieval_zero_hits"] }) });
    const result = deriveBlockerFromSnapshot(snapshot);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe("retrieval_zero_hits");
  });

  it("returns blocked for retrieval_all_weak", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ whyCodes: ["retrieval_all_weak"] }) });
    const result = deriveBlockerFromSnapshot(snapshot);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe("retrieval_all_weak");
  });

  it("returns blocked for conditions_insufficient", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ whyCodes: ["conditions_insufficient"] }) });
    const result = deriveBlockerFromSnapshot(snapshot);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe("conditions_insufficient");
  });

  it("returns blocked for recovery_budget_exhausted", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ whyCodes: ["recovery_budget_exhausted"] }) });
    const result = deriveBlockerFromSnapshot(snapshot);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe("recovery_budget_exhausted");
  });

  it("returns NOT blocked for awaiting_user_input (that's clarifying, not blocked)", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ whyCodes: ["awaiting_user_input"] }) });
    const result = deriveBlockerFromSnapshot(snapshot);
    expect(result.blocked).toBe(false);
  });

  it("returns NOT blocked for recovery_clarify_* codes (those are clarifying)", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ whyCodes: ["recovery_clarify_anchor", "recovery_clarify_role"] }) });
    const result = deriveBlockerFromSnapshot(snapshot);
    expect(result.blocked).toBe(false);
  });

  it("returns blocked with boundary_failure when runtime status is blocked but no structural why code", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ status: "blocked", whyCodes: [] }) });
    const result = deriveBlockerFromSnapshot(snapshot);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe("boundary_failure");
  });

  it("returns blocked with boundary_failure when recoveryState has boundaryDiagnosticCode", () => {
    const snapshot = createMockSnapshot({
      recoveryState: { ...createMockSnapshot().recoveryState, boundaryDiagnosticCode: "source_coverage_gap" }
    });
    const result = deriveBlockerFromSnapshot(snapshot);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe("boundary_failure");
  });
});

// ============================================================================
// Summary Derivation Tests
// ============================================================================

describe("deriveTaskSummary", () => {
  it("returns stage summary when not blocked", () => {
    const summary = deriveTaskSummary("shortlist_ready", false);
    expect(summary).toBe("候选短名单已就绪");
  });

  it("includes blocker reason in summary when blocked", () => {
    const summary = deriveTaskSummary("searching", true, "retrieval_zero_hits");
    expect(summary).toContain("检索无结果");
  });

  it("completed stage has correct summary", () => {
    const summary = deriveTaskSummary("completed", false);
    expect(summary).toBe("任务已完成");
  });

  it("abandoned stage has correct summary", () => {
    const summary = deriveTaskSummary("abandoned", false);
    expect(summary).toBe("任务已放弃");
  });
});

// ============================================================================
// Full Derivation Tests
// ============================================================================

describe("deriveTaskProgress", () => {
  it("derives intake for new work item with no snapshot", () => {
    const workItem = createMockWorkItem();
    const progress = deriveTaskProgress({ workItem, snapshot: null });
    expect(progress.stage).toBe("intake");
    expect(progress.blocked).toBe(false);
    expect(progress.workItemStatus).toBe("active");
  });

  it("derives clarifying from clarifying snapshot", () => {
    const workItem = createMockWorkItem();
    const snapshot = createMockSnapshot({ runtime: rt({ status: "clarifying" }) });
    const progress = deriveTaskProgress({ workItem, snapshot });
    expect(progress.stage).toBe("clarifying");
  });

  it("derives searching from searching snapshot", () => {
    const workItem = createMockWorkItem();
    const snapshot = createMockSnapshot({ runtime: rt({ status: "searching" }) });
    const progress = deriveTaskProgress({ workItem, snapshot });
    expect(progress.stage).toBe("searching");
  });

  it("derives shortlist_ready when shortlist exists", () => {
    const workItem = createMockWorkItem();
    const snapshot = createMockSnapshot({
      currentShortlist: [{ personId: "p-1", name: "Test", matchScore: 0.8, sources: [] } as any]
    });
    const progress = deriveTaskProgress({ workItem, snapshot });
    expect(progress.stage).toBe("shortlist_ready");
  });

  it("derives comparing when compare set active", () => {
    const workItem = createMockWorkItem();
    const snapshot = createMockSnapshot({
      activeCompareSet: [{ personId: "p-1", name: "Test", matchScore: 0.8, sources: [] } as any]
    });
    const progress = deriveTaskProgress({ workItem, snapshot });
    expect(progress.stage).toBe("comparing");
  });

  it("derives decision_ready when recommendation present", () => {
    const workItem = createMockWorkItem();
    const snapshot = createMockSnapshot({
      recommendedCandidate: {
        candidate: { personId: "p-1", name: "Test", matchScore: 0.9, sources: [] } as any,
        createdAt: "2026-04-20T00:00:00.000Z",
        confidenceLevel: "high"
      }
    });
    const progress = deriveTaskProgress({ workItem, snapshot });
    expect(progress.stage).toBe("decision_ready");
  });

  it("completed work item status overrides runtime", () => {
    const workItem = createMockWorkItem({ status: "completed", completedAt: new Date() });
    const snapshot = createMockSnapshot({ runtime: rt({ status: "searching" }) });
    const progress = deriveTaskProgress({ workItem, snapshot });
    expect(progress.stage).toBe("completed");
    expect(progress.workItemStatus).toBe("completed");
  });

  it("abandoned work item status overrides runtime", () => {
    const workItem = createMockWorkItem({ status: "abandoned" });
    const snapshot = createMockSnapshot({ runtime: rt({ status: "searching" }) });
    const progress = deriveTaskProgress({ workItem, snapshot });
    expect(progress.stage).toBe("abandoned");
  });

  it("blocked is modifier on the correct stage, not a separate stage", () => {
    const workItem = createMockWorkItem();
    // blocked with retrieval_zero_hits + no shortlist -> stage=searching, blocked=true
    const snapshot = createMockSnapshot({
      runtime: rt({ status: "waiting-input", whyCodes: ["retrieval_zero_hits"] }),
      currentShortlist: []
    });
    const progress = deriveTaskProgress({ workItem, snapshot });
    expect(progress.stage).toBe("searching");
    expect(progress.blocked).toBe(true);
    expect(progress.blockerReason).toBe("retrieval_zero_hits");
  });

  it("blocked with shortlist -> shortlist_ready + blocked modifier", () => {
    const workItem = createMockWorkItem();
    const snapshot = createMockSnapshot({
      runtime: rt({ status: "blocked", whyCodes: ["low_confidence_shortlist"] }),
      currentShortlist: [{ personId: "p-1", name: "Test", matchScore: 0.8, sources: [] } as any]
    });
    const progress = deriveTaskProgress({ workItem, snapshot });
    expect(progress.stage).toBe("shortlist_ready");
    expect(progress.blocked).toBe(true);
  });

  it("legacy session without workItemId does not crash derivation", () => {
    const snapshot = createMockSnapshot({ runtime: rt({ status: "searching" }) });
    const progress = deriveTaskProgress({ workItem: null, snapshot });
    expect(progress.stage).toBe("searching");
    expect(progress.workItemStatus).toBe("active");
  });

  it("derives stage from resumeMeta when snapshot absent", () => {
    const workItem = createMockWorkItem();
    const progress = deriveTaskProgress({
      workItem,
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
    expect(progress.stage).toBe("shortlist_ready");
    expect(progress.lastUpdatedAt).toBe("2026-04-20T00:00:00.000Z");
    expect(progress.sessionStatus).toBe("shortlist");
  });

  it("derives blocked from resumeMeta primaryWhyCode", () => {
    const workItem = createMockWorkItem();
    const progress = deriveTaskProgress({
      workItem,
      snapshot: null,
      resumeMeta: {
        kind: "interrupted_work_item",
        resumability: "resumable",
        status: "blocked",
        statusSummary: null,
        primaryWhyCode: "retrieval_zero_hits",
        whySummary: "无结果",
        lastStatusAt: "2026-04-20T00:00:00.000Z"
      }
    });
    expect(progress.blocked).toBe(true);
    expect(progress.blockerReason).toBe("retrieval_zero_hits");
  });

  it("resumeMeta completed work item overrides resumeMeta status", () => {
    const workItem = createMockWorkItem({ status: "completed", completedAt: new Date() });
    const progress = deriveTaskProgress({
      workItem,
      snapshot: null,
      resumeMeta: {
        kind: "stopped_session",
        resumability: "read_only",
        status: "searching",
        statusSummary: null,
        whySummary: null,
        lastStatusAt: "2026-04-20T00:00:00.000Z"
      }
    });
    expect(progress.stage).toBe("completed");
  });

  // resumeMeta waiting-input/blocked disambiguation — aligns with snapshot path

  it("resumeMeta waiting-input with retrieval_zero_hits -> searching", () => {
    const workItem = createMockWorkItem();
    const progress = deriveTaskProgress({
      workItem,
      snapshot: null,
      resumeMeta: {
        kind: "stopped_session",
        resumability: "read_only",
        status: "waiting-input",
        statusSummary: null,
        primaryWhyCode: "retrieval_zero_hits",
        whySummary: "无结果",
        lastStatusAt: "2026-04-20T00:00:00.000Z"
      }
    });
    expect(progress.stage).toBe("searching");
  });

  it("resumeMeta waiting-input with conditions_insufficient -> clarifying", () => {
    const workItem = createMockWorkItem();
    const progress = deriveTaskProgress({
      workItem,
      snapshot: null,
      resumeMeta: {
        kind: "stopped_session",
        resumability: "read_only",
        status: "waiting-input",
        statusSummary: null,
        primaryWhyCode: "conditions_insufficient",
        whySummary: "条件不足",
        lastStatusAt: "2026-04-20T00:00:00.000Z"
      }
    });
    expect(progress.stage).toBe("clarifying");
  });

  it("resumeMeta blocked with retrieval_all_weak -> searching", () => {
    const workItem = createMockWorkItem();
    const progress = deriveTaskProgress({
      workItem,
      snapshot: null,
      resumeMeta: {
        kind: "interrupted_work_item",
        resumability: "resumable",
        status: "blocked",
        statusSummary: null,
        primaryWhyCode: "retrieval_all_weak",
        whySummary: "结果均弱",
        lastStatusAt: "2026-04-20T00:00:00.000Z"
      }
    });
    expect(progress.stage).toBe("searching");
  });

  it("resumeMeta waiting-input without why code -> intake fallback", () => {
    const workItem = createMockWorkItem();
    const progress = deriveTaskProgress({
      workItem,
      snapshot: null,
      resumeMeta: {
        kind: "stopped_session",
        resumability: "read_only",
        status: "waiting-input",
        statusSummary: null,
        whySummary: null,
        lastStatusAt: "2026-04-20T00:00:00.000Z"
      }
    });
    expect(progress.stage).toBe("intake");
  });

  it("includes sessionStatus for debugging transparency", () => {
    const workItem = createMockWorkItem();
    const snapshot = createMockSnapshot({ runtime: rt({ status: "comparing" }) });
    const progress = deriveTaskProgress({ workItem, snapshot });
    expect(progress.sessionStatus).toBe("comparing");
  });
});
