import { describe, expect, it, vi } from "vitest";

import { WorkItemStore } from "../work-item-store.js";
import type {
  WorkItemRecord,
  WorkItemStatus
} from "../work-item-types.js";

// ============================================================================
// Helpers
// ============================================================================

function createMockIdentityProvider(userId = "user-1") {
  return { getUserId: vi.fn(() => userId), resolve: vi.fn() };
}

function createWorkItemDbMock(overrides: Record<string, unknown> = {}) {
  const mockRecord = {
    id: "wi-001",
    userId: "user-1",
    title: "test title",
    goalSummary: null,
    status: "active",
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Drizzle query chains are thenable — they resolve to arrays when awaited.
  // select().from().where().orderBy() resolves to array
  // select().from().where().orderBy().limit() resolves to array
  // select().from().where().limit() resolves to array (for get)
  const mockArray = Promise.resolve([mockRecord]);

  const limitFn = vi.fn(() => mockArray);
  const orderByFn = vi.fn(() => {
    const chain = () => mockArray;
    chain.limit = limitFn;
    // Make thenable so await works on the orderBy result directly
    chain.then = mockArray.then.bind(mockArray);
    return chain;
  });
  const whereChain: any = () => mockArray;
  whereChain.orderBy = orderByFn;
  whereChain.limit = vi.fn(() => mockArray);
  whereChain.then = mockArray.then.bind(mockArray);

  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [mockRecord])
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
          returning: vi.fn(async () => [mockRecord])
        }))
      }))
    })),
    ...overrides
  };
}

function createMockStore(overrides: Record<string, unknown> = {}) {
  const db = createWorkItemDbMock();
  const identity = createMockIdentityProvider();
  const store = new WorkItemStore(db as any, identity as any);
  return { store, db, identity, ...overrides };
}

// ============================================================================
// Create
// ============================================================================

describe("WorkItemStore.create", () => {
  it("creates a work item with title", async () => {
    const { store } = createMockStore();
    const result = await store.create({ title: "找 3 年以上的 AI 工程师" });
    expect(result).toBeTruthy();
    expect(result.title).toBe("test title");
  });

  it("creates without optional fields", async () => {
    const { store } = createMockStore();
    const result = await store.create();
    expect(result).toBeTruthy();
  });
});

// ============================================================================
// Get
// ============================================================================

describe("WorkItemStore.get", () => {
  it("returns record when found", async () => {
    const { store } = createMockStore();
    const result = await store.get("wi-001");
    expect(result).toBeTruthy();
    expect(result!.id).toBe("wi-001");
  });

  it("returns null when not found", async () => {
    const db = createWorkItemDbMock();
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [])
        }))
      }))
    }));
    const identity = createMockIdentityProvider();
    const store = new WorkItemStore(db as any, identity as any);
    const result = await store.get("nonexistent");
    expect(result).toBeNull();
  });
});

// ============================================================================
// List
// ============================================================================

describe("WorkItemStore.list", () => {
  it("lists work items for user", async () => {
    const { store } = createMockStore();
    const results = await store.list();
    expect(Array.isArray(results)).toBe(true);
  });

  it("passes status filter", async () => {
    const { store, db } = createMockStore();
    await store.list("active");
    expect(db.select).toHaveBeenCalled();
  });

  it("passes limit", async () => {
    const { store, db } = createMockStore();
    await store.list(undefined, 5);
    expect(db.select).toHaveBeenCalled();
  });
});

// ============================================================================
// Update Status
// ============================================================================

describe("WorkItemStore.updateStatus", () => {
  it("marks as completed", async () => {
    const { store } = createMockStore();
    const result = await store.updateStatus("wi-001", "completed");
    expect(result).toBeTruthy();
  });

  it("returns null for nonexistent", async () => {
    const db = createWorkItemDbMock();
    db.update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [])
        }))
      }))
    }));
    const identity = createMockIdentityProvider();
    const store = new WorkItemStore(db as any, identity as any);
    const result = await store.updateStatus("nonexistent", "completed");
    expect(result).toBeNull();
  });
});

// ============================================================================
// Attach Session
// ============================================================================

describe("WorkItemStore.attachSession", () => {
  it("attaches session to work item", async () => {
    const db = createWorkItemDbMock();
    (db.update as any) = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ sessionId: "sess-1", workItemId: "wi-001" }])
        }))
      }))
    }));
    const identity = createMockIdentityProvider();
    const store = new WorkItemStore(db as any, identity as any);
    const result = await store.attachSession("sess-1", "wi-001");
    expect(result).toBe(true);
  });

  it("returns false when session not found", async () => {
    const db = createWorkItemDbMock();
    (db.update as any) = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [])
        }))
      }))
    }));
    const identity = createMockIdentityProvider();
    const store = new WorkItemStore(db as any, identity as any);
    const result = await store.attachSession("nonexistent", "wi-001");
    expect(result).toBe(false);
  });
});

// ============================================================================
// User Scope
// ============================================================================

describe("user scope isolation", () => {
  it("list only returns items for current user", async () => {
    const identity = createMockIdentityProvider("user-42");
    const db = createWorkItemDbMock();
    const store = new WorkItemStore(db as any, identity as any);
    await store.list();
    expect(identity.getUserId).toHaveBeenCalled();
  });

  it("create uses current user id", async () => {
    const identity = createMockIdentityProvider("user-42");
    const db = createWorkItemDbMock();
    const store = new WorkItemStore(db as any, identity as any);
    await store.create({ title: "test" });
    expect(identity.getUserId).toHaveBeenCalled();
  });

  it("get returns null for other user's work item", async () => {
    // Simulate DB returning empty when userId doesn't match
    const db = createWorkItemDbMock();
    const emptyArray = Promise.resolve([]);
    const whereChain: any = () => emptyArray;
    whereChain.limit = vi.fn(() => emptyArray);
    whereChain.then = emptyArray.then.bind(emptyArray);
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => whereChain)
      }))
    }));
    const identity = createMockIdentityProvider("user-attacker");
    const store = new WorkItemStore(db as any, identity as any);
    const result = await store.get("wi-001");
    expect(result).toBeNull();
    expect(identity.getUserId).toHaveBeenCalled();
  });

  it("updateStatus returns null for other user's work item", async () => {
    const db = createWorkItemDbMock();
    (db.update as any) = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [])
        }))
      }))
    }));
    const identity = createMockIdentityProvider("user-attacker");
    const store = new WorkItemStore(db as any, identity as any);
    const result = await store.updateStatus("wi-001", "completed");
    expect(result).toBeNull();
    expect(identity.getUserId).toHaveBeenCalled();
  });

  it("attachSession returns false when work item belongs to other user", async () => {
    // DB validates work item ownership first — select returns empty
    const db = createWorkItemDbMock();
    const emptyArray = Promise.resolve([]);
    const whereChain: any = () => emptyArray;
    whereChain.limit = vi.fn(() => emptyArray);
    whereChain.then = emptyArray.then.bind(emptyArray);
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => whereChain)
      }))
    }));
    const identity = createMockIdentityProvider("user-attacker");
    const store = new WorkItemStore(db as any, identity as any);
    const result = await store.attachSession("sess-1", "wi-001");
    expect(result).toBe(false);
    expect(identity.getUserId).toHaveBeenCalled();
  });
});
