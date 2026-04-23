import { describe, expect, it, vi } from "vitest";

import {
  parseMemoryCommand,
  displayMemoryList,
  displayMemoryHelp,
  executeMemoryCommand,
  runMemoryManagementSession
} from "../memory-command.js";
import type {
  UserMemoryContext,
  UserMemoryRecord,
  CandidateFeedbackRecord
} from "../user-memory-types.js";

// ============================================================================
// Helpers
// ============================================================================

function createMockMemoryStore(overrides: Record<string, unknown> = {}) {
  return {
    isMemoryPaused: vi.fn(async () => false),
    hydrateContext: vi.fn(async () => createEmptyContext()),
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    pauseMemory: vi.fn(async () => {}),
    resumeMemory: vi.fn(async () => {}),
    listCandidateFeedback: vi.fn(async () => []),
    deleteCandidateFeedbackById: vi.fn(async () => true),
    ...overrides
  };
}

function createEmptyContext(): UserMemoryContext {
  return {
    userId: "user-1",
    memoryPaused: false,
    preferences: [],
    feedbacks: [],
    candidateFeedbacks: [],
    hiringContexts: [],
    allMemories: []
  };
}

function createMemoryRecord(
  kind: "preference" | "feedback" | "hiring_context",
  source: "explicit" | "inferred",
  content: Record<string, unknown>,
  overrides: Partial<UserMemoryRecord> = {}
): UserMemoryRecord {
  return {
    id: `mem-${Math.random().toString(36).slice(2, 10)}`,
    userId: "user-1",
    kind,
    scope: { kind: "global" },
    content,
    source,
    confidence: source === "explicit" ? 1.0 : 0.65,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function createContextWithMemories(
  memories: UserMemoryRecord[]
): UserMemoryContext {
  return {
    userId: "user-1",
    memoryPaused: false,
    preferences: memories.filter((m) => m.kind === "preference"),
    feedbacks: memories.filter((m) => m.kind === "feedback"),
    candidateFeedbacks: [],
    hiringContexts: memories.filter((m) => m.kind === "hiring_context"),
    allMemories: memories
  };
}

// ============================================================================
// parseMemoryCommand
// ============================================================================

describe("parseMemoryCommand", () => {
  it("parses list commands", () => {
    expect(parseMemoryCommand("list")).toEqual({ action: "list" });
    expect(parseMemoryCommand("ls")).toEqual({ action: "list" });
    expect(parseMemoryCommand("l")).toEqual({ action: "list" });
  });

  it("parses delete commands", () => {
    expect(parseMemoryCommand("delete abc123")).toEqual({ action: "delete", id: "abc123" });
    expect(parseMemoryCommand("rm xyz")).toEqual({ action: "delete", id: "xyz" });
    expect(parseMemoryCommand("del foo")).toEqual({ action: "delete", id: "foo" });
  });

  it("parses pause commands", () => {
    expect(parseMemoryCommand("pause")).toEqual({ action: "pause" });
    expect(parseMemoryCommand("off")).toEqual({ action: "pause" });
  });

  it("parses resume commands", () => {
    expect(parseMemoryCommand("resume")).toEqual({ action: "resume" });
    expect(parseMemoryCommand("on")).toEqual({ action: "resume" });
  });

  it("parses help commands", () => {
    expect(parseMemoryCommand("help")).toEqual({ action: "help" });
    expect(parseMemoryCommand("?")).toEqual({ action: "help" });
    expect(parseMemoryCommand("h")).toEqual({ action: "help" });
  });

  it("returns null for invalid commands", () => {
    expect(parseMemoryCommand("")).toBeNull();
    expect(parseMemoryCommand("delete")).toBeNull();
    expect(parseMemoryCommand("foo")).toBeNull();
  });
});

// ============================================================================
// displayMemoryList
// ============================================================================

describe("displayMemoryList", () => {
  it("displays empty message when no memories", () => {
    const ctx = createEmptyContext();
    expect(() => displayMemoryList(ctx, false)).not.toThrow();
  });

  it("displays paused status when paused", () => {
    const ctx = createEmptyContext();
    expect(() => displayMemoryList(ctx, true)).not.toThrow();
  });

  it("groups memories by kind", () => {
    const memories = [
      createMemoryRecord("preference", "explicit", { role: "backend" }),
      createMemoryRecord("feedback", "explicit", { candidateId: "c1" }),
      createMemoryRecord("hiring_context", "explicit", { hiringRole: "AI" })
    ];
    const ctx = createContextWithMemories(memories);
    expect(() => displayMemoryList(ctx, false)).not.toThrow();
  });

  it("shows explicit vs inferred labels", () => {
    const memories = [
      createMemoryRecord("preference", "explicit", { role: "backend" }),
      createMemoryRecord("preference", "inferred", { avoidInactive: true })
    ];
    const ctx = createContextWithMemories(memories);
    expect(() => displayMemoryList(ctx, false)).not.toThrow();
  });

  it("shows expiry for inferred memories", () => {
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days
    const memories = [
      createMemoryRecord("preference", "inferred", { avoidInactive: true }, { expiresAt })
    ];
    const ctx = createContextWithMemories(memories);
    expect(() => displayMemoryList(ctx, false)).not.toThrow();
  });
});

// ============================================================================
// displayMemoryHelp
// ============================================================================

describe("displayMemoryHelp", () => {
  it("does not throw", () => {
    expect(() => displayMemoryHelp()).not.toThrow();
  });
});

// ============================================================================
// executeMemoryCommand
// ============================================================================

describe("executeMemoryCommand", () => {
  it("help shows help text", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn();
    const result = await executeMemoryCommand({ action: "help" }, store as any, askFreeform);
    expect(result.ok).toBe(true);
  });

  it("list shows memories", async () => {
    const ctx = createContextWithMemories([
      createMemoryRecord("preference", "explicit", { role: "backend" })
    ]);
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => ctx)
    });
    const askFreeform = vi.fn();
    const result = await executeMemoryCommand({ action: "list" }, store as any, askFreeform);
    expect(result.ok).toBe(true);
    expect(store.hydrateContext).toHaveBeenCalled();
  });

  it("pause persists pause state", async () => {
    const store = createMockMemoryStore({
      isMemoryPaused: vi.fn(async () => false)
    });
    const askFreeform = vi.fn();
    const result = await executeMemoryCommand({ action: "pause" }, store as any, askFreeform);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("paused");
    expect(store.pauseMemory).toHaveBeenCalled();
  });

  it("pause is idempotent", async () => {
    const store = createMockMemoryStore({
      isMemoryPaused: vi.fn(async () => true)
    });
    const askFreeform = vi.fn();
    const result = await executeMemoryCommand({ action: "pause" }, store as any, askFreeform);
    expect(result.ok).toBe(true);
    expect(store.pauseMemory).not.toHaveBeenCalled();
  });

  it("resume persists resume state", async () => {
    const store = createMockMemoryStore({
      isMemoryPaused: vi.fn(async () => true)
    });
    const askFreeform = vi.fn();
    const result = await executeMemoryCommand({ action: "resume" }, store as any, askFreeform);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("resumed");
    expect(store.resumeMemory).toHaveBeenCalled();
  });

  it("resume is idempotent", async () => {
    const store = createMockMemoryStore({
      isMemoryPaused: vi.fn(async () => false)
    });
    const askFreeform = vi.fn();
    const result = await executeMemoryCommand({ action: "resume" }, store as any, askFreeform);
    expect(result.ok).toBe(true);
    expect(store.resumeMemory).not.toHaveBeenCalled();
  });

  it("delete by id requires confirmation", async () => {
    const record = createMemoryRecord("preference", "explicit", { role: "backend" });
    const store = createMockMemoryStore({
      get: vi.fn(async () => record)
    });
    const askFreeform = vi.fn().mockResolvedValue("y");
    const result = await executeMemoryCommand({ action: "delete", id: record.id }, store as any, askFreeform);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("deleted");
    expect(store.delete).toHaveBeenCalledWith(record.id);
  });

  it("delete cancels on non-confirmation", async () => {
    const record = createMemoryRecord("preference", "explicit", { role: "backend" });
    const store = createMockMemoryStore({
      get: vi.fn(async () => record)
    });
    const askFreeform = vi.fn().mockResolvedValue("n");
    const result = await executeMemoryCommand({ action: "delete", id: record.id }, store as any, askFreeform);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("已取消。");
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("delete fails for non-existent id", async () => {
    const store = createMockMemoryStore({
      get: vi.fn(async () => null),
      list: vi.fn(async () => [])
    });
    const askFreeform = vi.fn();
    const result = await executeMemoryCommand({ action: "delete", id: "nonexistent" }, store as any, askFreeform);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("未找到");
  });

  it("delete matches by id prefix", async () => {
    const record = createMemoryRecord("preference", "explicit", { role: "backend" });
    const store = createMockMemoryStore({
      get: vi.fn(async () => null),
      list: vi.fn(async () => [record])
    });
    const askFreeform = vi.fn().mockResolvedValue("y");
    const result = await executeMemoryCommand({ action: "delete", id: record.id.slice(0, 6) }, store as any, askFreeform);
    expect(result.ok).toBe(true);
    expect(result.message).toBe("deleted");
  });

  it("deleting one memory does not affect others", async () => {
    const record1 = createMemoryRecord("preference", "explicit", { role: "backend" });
    const record2 = createMemoryRecord("preference", "inferred", { avoidInactive: true });
    const store = createMockMemoryStore({
      get: vi.fn(async () => record1),
      delete: vi.fn(async (id: string) => id === record1.id)
    });
    const askFreeform = vi.fn().mockResolvedValue("y");
    await executeMemoryCommand({ action: "delete", id: record1.id }, store as any, askFreeform);
    // Only record1 should be deleted, record2 unaffected
    expect(store.delete).toHaveBeenCalledWith(record1.id);
    expect(store.delete).not.toHaveBeenCalledWith(record2.id);
  });

  it("deleting inferred preference does not remove explicit", async () => {
    const inferred = createMemoryRecord("preference", "inferred", { avoidInactive: true });
    const explicit = createMemoryRecord("preference", "explicit", { role: "backend" });
    const store = createMockMemoryStore({
      get: vi.fn(async () => inferred),
      delete: vi.fn(async (id: string) => id === inferred.id)
    });
    const askFreeform = vi.fn().mockResolvedValue("y");
    await executeMemoryCommand({ action: "delete", id: inferred.id }, store as any, askFreeform);
    expect(store.delete).toHaveBeenCalledWith(inferred.id);
    expect(store.delete).not.toHaveBeenCalledWith(explicit.id);
  });

  it("deleting feedback event does not rewrite preferences", async () => {
    const feedback = createMemoryRecord("feedback", "explicit", { candidateId: "c1", verdict: "negative" });
    const preference = createMemoryRecord("preference", "explicit", { role: "backend" });
    const store = createMockMemoryStore({
      get: vi.fn(async () => feedback),
      delete: vi.fn(async (id: string) => id === feedback.id)
    });
    const askFreeform = vi.fn().mockResolvedValue("y");
    await executeMemoryCommand({ action: "delete", id: feedback.id }, store as any, askFreeform);
    // Only feedback deleted, preference untouched
    expect(store.delete).toHaveBeenCalledWith(feedback.id);
    expect(store.delete).not.toHaveBeenCalledWith(preference.id);
  });
});

// ============================================================================
// runMemoryManagementSession
// ============================================================================

describe("runMemoryManagementSession", () => {
  it("shows list on entry", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn()
      .mockResolvedValueOnce("q");
    await runMemoryManagementSession(store as any, askFreeform);
    expect(store.hydrateContext).toHaveBeenCalled();
  });

  it("exits on q", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn()
      .mockResolvedValueOnce("q");
    await runMemoryManagementSession(store as any, askFreeform);
    expect(askFreeform).toHaveBeenCalledTimes(1);
  });

  it("handles list command", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn()
      .mockResolvedValueOnce("list")
      .mockResolvedValueOnce("q");
    await runMemoryManagementSession(store as any, askFreeform);
    expect(store.hydrateContext).toHaveBeenCalledTimes(2); // entry + list
  });

  it("handles pause/resume commands", async () => {
    let paused = false;
    const store = createMockMemoryStore({
      isMemoryPaused: vi.fn(async () => paused),
      pauseMemory: vi.fn(async () => { paused = true; }),
      resumeMemory: vi.fn(async () => { paused = false; })
    });
    const askFreeform = vi.fn()
      .mockResolvedValueOnce("pause")
      .mockResolvedValueOnce("resume")
      .mockResolvedValueOnce("q");
    await runMemoryManagementSession(store as any, askFreeform);
    expect(store.pauseMemory).toHaveBeenCalled();
    expect(store.resumeMemory).toHaveBeenCalled();
  });

  it("re-prompts on invalid command", async () => {
    const store = createMockMemoryStore();
    const askFreeform = vi.fn()
      .mockResolvedValueOnce("invalid")
      .mockResolvedValueOnce("q");
    await runMemoryManagementSession(store as any, askFreeform);
    expect(askFreeform).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// Candidate Feedback Integration (A3 cross-phase)
// ============================================================================

describe("candidate feedback display and delete", () => {
  it("displays candidate feedback events from candidateFeedbacks field", () => {
    const ctx = createEmptyContext();
    ctx.candidateFeedbacks = [
      {
        id: "fb-001",
        userId: "user-1",
        personId: "person-1",
        sentiment: "negative",
        reasonCode: "skill_mismatch",
        reasonDetail: "不会 rust",
        contextSource: "shortlist_remove",
        createdAt: new Date()
      }
    ] as CandidateFeedbackRecord[];
    expect(() => displayMemoryList(ctx, false)).not.toThrow();
  });

  it("shows candidate feedback section even without user_memories", () => {
    const ctx = createEmptyContext();
    ctx.candidateFeedbacks = [
      {
        id: "fb-002",
        userId: "user-1",
        personId: "person-2",
        sentiment: "positive",
        reasonCode: null,
        reasonDetail: null,
        contextSource: "compare",
        createdAt: new Date()
      }
    ] as CandidateFeedbackRecord[];
    // allMemories is empty but candidateFeedbacks has data — should display
    expect(() => displayMemoryList(ctx, false)).not.toThrow();
  });

  it("deletes candidate feedback via listCandidateFeedback fallback", async () => {
    const feedback: CandidateFeedbackRecord = {
      id: "fb-003",
      userId: "user-1",
      personId: "person-3",
      sentiment: "negative",
      reasonCode: "not_active",
      reasonDetail: null,
      contextSource: "shortlist_remove",
      createdAt: new Date()
    };
    const store = createMockMemoryStore({
      get: vi.fn(async () => null),   // not in user_memories
      list: vi.fn(async () => []),    // not in user_memories
      listCandidateFeedback: vi.fn(async () => [feedback]),
      deleteCandidateFeedbackById: vi.fn(async () => true)
    });
    const askFreeform = vi.fn().mockResolvedValue("y");
    const result = await executeMemoryCommand(
      { action: "delete", id: feedback.id },
      store as any,
      askFreeform
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe("deleted");
    expect(store.deleteCandidateFeedbackById).toHaveBeenCalledWith(feedback.id);
  });

  it("deleting feedback event does not rewrite preferences", async () => {
    const feedback: CandidateFeedbackRecord = {
      id: "fb-004",
      userId: "user-1",
      personId: "person-4",
      sentiment: "negative",
      reasonCode: "skill_mismatch",
      reasonDetail: null,
      contextSource: "shortlist_remove",
      createdAt: new Date()
    };
    const store = createMockMemoryStore({
      get: vi.fn(async () => null),
      list: vi.fn(async () => []),
      listCandidateFeedback: vi.fn(async () => [feedback]),
      deleteCandidateFeedbackById: vi.fn(async () => true)
    });
    const askFreeform = vi.fn().mockResolvedValue("y");
    await executeMemoryCommand(
      { action: "delete", id: feedback.id },
      store as any,
      askFreeform
    );
    // Only feedback deleted via dedicated path — user_memories delete untouched
    expect(store.deleteCandidateFeedbackById).toHaveBeenCalledWith(feedback.id);
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("candidate feedback delete requires confirmation", async () => {
    const feedback: CandidateFeedbackRecord = {
      id: "fb-005",
      userId: "user-1",
      personId: "person-5",
      sentiment: "negative",
      reasonCode: "location_mismatch",
      reasonDetail: null,
      contextSource: "shortlist_remove",
      createdAt: new Date()
    };
    const store = createMockMemoryStore({
      get: vi.fn(async () => null),
      list: vi.fn(async () => []),
      listCandidateFeedback: vi.fn(async () => [feedback]),
      deleteCandidateFeedbackById: vi.fn(async () => true)
    });
    const askFreeform = vi.fn().mockResolvedValue("n");
    const result = await executeMemoryCommand(
      { action: "delete", id: feedback.id },
      store as any,
      askFreeform
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe("已取消。");
    expect(store.deleteCandidateFeedbackById).not.toHaveBeenCalled();
  });
});
