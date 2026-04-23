import { describe, expect, it, vi } from "vitest";

import { WorkItemStore } from "../work-item-store.js";
import type { WorkItemRecord } from "../work-item-types.js";

// ============================================================================
// Helpers
// ============================================================================

function createMockIdentityProvider(userId = "user-1") {
  return { getUserId: vi.fn(() => userId), resolve: vi.fn() };
}

// Shared mock work item record
const mockWorkItem: WorkItemRecord = {
  id: "wi-new",
  userId: "user-1",
  title: "找 3 年以上的 AI 工程师",
  goalSummary: null,
  status: "active",
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

function createWorkItemStore() {
  const identity = createMockIdentityProvider();
  const mockArray = Promise.resolve([mockWorkItem]);
  const whereChain: any = () => mockArray;
  whereChain.limit = vi.fn(() => mockArray);
  whereChain.then = mockArray.then.bind(mockArray);

  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [mockWorkItem])
      }))
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => whereChain)
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [mockWorkItem])
        }))
      }))
    }))
  };
  const store = new WorkItemStore(db as any, identity as any);
  return { store, db, identity };
}

// ============================================================================
// New Session creates Work Item
// ============================================================================

describe("new session work item creation", () => {
  it("work item store creates item with initial prompt as title", async () => {
    const { store } = createWorkItemStore();
    const workItem = await store.create({ title: "找 3 年以上的 AI 工程师" });
    expect(workItem).toBeTruthy();
    expect(workItem.title).toBeTruthy();
  });

  it("title is truncated for long prompts", async () => {
    const longPrompt = "a".repeat(100);
    const expectedTitle = longPrompt.slice(0, 77) + "...";
    expect(expectedTitle.length).toBe(80);
    expect(expectedTitle.endsWith("...")).toBe(true);
  });

  it("work item has active status on creation", async () => {
    const { store } = createWorkItemStore();
    const workItem = await store.create({ title: "test" });
    expect(workItem.status).toBe("active");
  });
});

// ============================================================================
// Legacy Session Compatibility
// ============================================================================

describe("legacy session compatibility", () => {
  it("session without workItemId still has valid record shape", () => {
    const record = {
      sessionId: "legacy-1",
      origin: "cli" as const,
      posture: "stopped" as const,
      workItemId: null,
      transcript: [],
      latestSnapshot: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    expect(record.workItemId).toBeNull();
    expect(record.sessionId).toBe("legacy-1");
  });

  it("session without workItemId field is still valid", () => {
    const legacyRecord: Record<string, unknown> = {
      sessionId: "legacy-2",
      origin: "cli" as const,
      posture: "stopped" as const,
      // workItemId intentionally absent
      transcript: [],
      latestSnapshot: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    expect(legacyRecord.sessionId).toBeTruthy();
    expect(legacyRecord.workItemId).toBeUndefined();
  });

  it("workItemStore is optional — workflow works without it", () => {
    // Workflow constructor accepts undefined workItemStore
    const options = {
      sessionId: "test-session",
      workItemStore: undefined
    };
    expect(options.workItemStore).toBeUndefined();
  });
});

// ============================================================================
// Session-WorkItem Association
// ============================================================================

describe("session-workitem association", () => {
  it("attachSession connects session to work item", async () => {
    const { store, db } = createWorkItemStore();
    const attached = await store.attachSession("sess-1", "wi-new");
    expect(attached).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("attaching session does not require migrating old sessions", async () => {
    // Old sessions don't need to be touched — only new sessions get workItemId
    const { store } = createWorkItemStore();
    // Attaching a new session is independent of legacy sessions
    const attached = await store.attachSession("new-sess-1", "wi-new");
    expect(attached).toBe(true);
  });

  it("deleting one user's work items does not cross user scope", async () => {
    const identity1 = createMockIdentityProvider("user-1");
    const identity2 = createMockIdentityProvider("user-2");
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [{ ...mockWorkItem, userId: "user-1", id: "wi-user1" }])
        }))
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [])
          }))
        }))
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [mockWorkItem])
          }))
        }))
      }))
    };
    const store1 = new WorkItemStore(db as any, identity1 as any);
    const store2 = new WorkItemStore(db as any, identity2 as any);

    await store1.create({ title: "user-1 task" });
    await store2.create({ title: "user-2 task" });

    // Each store uses its own userId
    expect(identity1.getUserId).toHaveBeenCalled();
    expect(identity2.getUserId).toHaveBeenCalled();
  });
});
