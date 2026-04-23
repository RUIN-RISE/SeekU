import { describe, expect, it, vi } from "vitest";

import {
  runMemoryBootstrap,
  shapeSummary,
  seedConditionsFromMemory,
  parseBootstrapChoice,
  displayMemorySummary,
  displayFullMemory,
  type BootstrapSummary
} from "../memory-bootstrap.js";
import type {
  UserMemoryContext,
  UserMemoryRecord
} from "../user-memory-types.js";

// ============================================================================
// Helpers
// ============================================================================

function createMockMemoryStore(overrides: Record<string, unknown> = {}) {
  return {
    isMemoryPaused: vi.fn(async () => false),
    hydrateContext: vi.fn(async () => createEmptyContext()),
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

function createPreferenceRecord(
  source: "explicit" | "inferred",
  content: Record<string, unknown>,
  overrides: Partial<UserMemoryRecord> = {}
): UserMemoryRecord {
  return {
    id: `pref-${Math.random().toString(36).slice(2, 8)}`,
    userId: "user-1",
    kind: "preference",
    scope: { kind: "global" },
    content,
    source,
    confidence: source === "explicit" ? 1.0 : 0.65,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function createContextWithPrefs(
  explicitPrefs: Record<string, unknown>[] = [],
  inferredPrefs: Record<string, unknown>[] = [],
  extraMemories: UserMemoryRecord[] = []
): UserMemoryContext {
  const explicit = explicitPrefs.map((c) =>
    createPreferenceRecord("explicit", c)
  );
  const inferred = inferredPrefs.map((c) =>
    createPreferenceRecord("inferred", c)
  );
  const allMemories = [...explicit, ...inferred, ...extraMemories];
  return {
    userId: "user-1",
    memoryPaused: false,
    preferences: [...explicit, ...inferred],
    feedbacks: [],
    candidateFeedbacks: [],
    hiringContexts: [],
    allMemories
  };
}

// ============================================================================
// parseBootstrapChoice
// ============================================================================

describe("parseBootstrapChoice", () => {
  it("recognizes adopt keywords", () => {
    expect(parseBootstrapChoice("沿用")).toBe("adopt");
    expect(parseBootstrapChoice("y")).toBe("adopt");
    expect(parseBootstrapChoice("yes")).toBe("adopt");
    expect(parseBootstrapChoice("1")).toBe("adopt");
    expect(parseBootstrapChoice("沿用这些")).toBe("adopt");
  });

  it("recognizes view keywords", () => {
    expect(parseBootstrapChoice("查看")).toBe("view");
    expect(parseBootstrapChoice("view")).toBe("view");
    expect(parseBootstrapChoice("v")).toBe("view");
    expect(parseBootstrapChoice("2")).toBe("view");
    expect(parseBootstrapChoice("查看记忆")).toBe("view");
  });

  it("recognizes ignore keywords", () => {
    expect(parseBootstrapChoice("忽略")).toBe("ignore");
    expect(parseBootstrapChoice("ignore")).toBe("ignore");
    expect(parseBootstrapChoice("skip")).toBe("ignore");
    expect(parseBootstrapChoice("n")).toBe("ignore");
    expect(parseBootstrapChoice("3")).toBe("ignore");
  });

  it("returns null for unrecognized input", () => {
    expect(parseBootstrapChoice("hello")).toBeNull();
    expect(parseBootstrapChoice("maybe")).toBeNull();
    expect(parseBootstrapChoice("")).toBeNull();
  });
});

// ============================================================================
// shapeSummary
// ============================================================================

describe("shapeSummary", () => {
  it("returns empty summary for empty context", () => {
    const summary = shapeSummary(createEmptyContext());
    expect(summary.explicitLines).toHaveLength(0);
    expect(summary.inferredLines).toHaveLength(0);
    expect(summary.totalMemoryCount).toBe(0);
  });

  it("shapes explicit preferences into lines", () => {
    const ctx = createContextWithPrefs([
      { techStack: ["python", "rust"], locations: ["杭州"], role: "backend" }
    ]);
    const summary = shapeSummary(ctx);

    expect(summary.explicitLines.length).toBeGreaterThanOrEqual(3);
    expect(summary.explicitLines.some((l) => l.includes("python"))).toBe(true);
    expect(summary.explicitLines.some((l) => l.includes("杭州"))).toBe(true);
    expect(summary.explicitLines.some((l) => l.includes("backend"))).toBe(true);
  });

  it("separates inferred preferences", () => {
    const ctx = createContextWithPrefs(
      [],
      [{ avoidInactive: true }]
    );
    const summary = shapeSummary(ctx);

    expect(summary.explicitLines).toHaveLength(0);
    expect(summary.inferredLines.length).toBeGreaterThan(0);
  });

  it("counts all memories", () => {
    const extraFeedback = {
      ...createPreferenceRecord("explicit", {}),
      id: "fb-1",
      kind: "feedback" as const
    };
    const ctx = createContextWithPrefs([{ role: "ai" }], [], [extraFeedback]);
    const summary = shapeSummary(ctx);

    expect(summary.totalMemoryCount).toBe(2);
  });
});

// ============================================================================
// seedConditionsFromMemory
// ============================================================================

describe("seedConditionsFromMemory", () => {
  it("returns empty conditions for empty context", () => {
    const conditions = seedConditionsFromMemory(createEmptyContext());
    expect(Object.keys(conditions)).toHaveLength(0);
  });

  it("seeds skills from explicit preference", () => {
    const ctx = createContextWithPrefs([
      { techStack: ["python", "rust"] }
    ]);
    const conditions = seedConditionsFromMemory(ctx);

    expect(conditions.skills).toEqual(expect.arrayContaining(["python", "rust"]));
  });

  it("seeds locations from explicit preference", () => {
    const ctx = createContextWithPrefs([
      { locations: ["杭州", "北京"] }
    ]);
    const conditions = seedConditionsFromMemory(ctx);

    expect(conditions.locations).toEqual(expect.arrayContaining(["杭州", "北京"]));
  });

  it("seeds role from explicit preference", () => {
    const ctx = createContextWithPrefs([{ role: "backend" }]);
    const conditions = seedConditionsFromMemory(ctx);

    expect(conditions.role).toBe("backend");
  });

  it("V1: does NOT seed inferred preferences (shown only, not defaulted)", () => {
    const ctx = createContextWithPrefs(
      [{ techStack: ["python"] }],
      [{ techStack: ["rust"], role: "frontend" }]
    );
    const conditions = seedConditionsFromMemory(ctx);

    // Only explicit techStack is seeded
    expect(conditions.skills).toEqual(["python"]);
    // Inferred role is NOT seeded
    expect(conditions.role).toBeUndefined();
  });

  it("seeds mustHave and exclude", () => {
    const ctx = createContextWithPrefs([
      { mustHave: ["cuda"], exclude: ["php"] }
    ]);
    const conditions = seedConditionsFromMemory(ctx);

    expect(conditions.mustHave).toEqual(["cuda"]);
    expect(conditions.exclude).toEqual(["php"]);
  });

  it("seeds preferFresh", () => {
    const ctx = createContextWithPrefs([{ preferFresh: true }]);
    const conditions = seedConditionsFromMemory(ctx);

    expect(conditions.preferFresh).toBe(true);
  });
});

// ============================================================================
// runMemoryBootstrap
// ============================================================================

describe("runMemoryBootstrap", () => {
  it("skips when memory is paused", async () => {
    const store = createMockMemoryStore({
      isMemoryPaused: vi.fn(async () => true)
    });

    const result = await runMemoryBootstrap(
      store as any,
      vi.fn()
    );

    expect(result.choice).toBe("ignore");
    expect(result.seededConditions).toEqual({});
    expect(store.hydrateContext).not.toHaveBeenCalled();
  });

  it("skips when no preferences exist", async () => {
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => createEmptyContext())
    });

    const result = await runMemoryBootstrap(
      store as any,
      vi.fn()
    );

    expect(result.choice).toBe("ignore");
    expect(result.seededConditions).toEqual({});
  });

  it("adopts when user says 沿用", async () => {
    const ctx = createContextWithPrefs([
      { techStack: ["python"], locations: ["杭州"] }
    ]);
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => ctx)
    });
    const askFreeform = vi.fn().mockResolvedValue("沿用");

    const result = await runMemoryBootstrap(
      store as any,
      askFreeform
    );

    expect(result.choice).toBe("adopt");
    expect(result.seededConditions.skills).toEqual(
      expect.arrayContaining(["python"])
    );
    expect(result.seededConditions.locations).toEqual(
      expect.arrayContaining(["杭州"])
    );
  });

  it("ignores when user says 忽略", async () => {
    const ctx = createContextWithPrefs([{ role: "backend" }]);
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => ctx)
    });
    const askFreeform = vi.fn().mockResolvedValue("忽略");

    const result = await runMemoryBootstrap(
      store as any,
      askFreeform
    );

    expect(result.choice).toBe("ignore");
    expect(result.seededConditions).toEqual({});
  });

  it("ignores on empty input", async () => {
    const ctx = createContextWithPrefs([{ role: "backend" }]);
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => ctx)
    });
    const askFreeform = vi.fn().mockResolvedValue("");

    const result = await runMemoryBootstrap(
      store as any,
      askFreeform
    );

    expect(result.choice).toBe("ignore");
  });

  it("shows full memory then adopts on 查看 → 沿用", async () => {
    const ctx = createContextWithPrefs([{ role: "ai" }]);
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => ctx)
    });
    const askFreeform = vi.fn()
      .mockResolvedValueOnce("查看")
      .mockResolvedValueOnce("沿用");

    const result = await runMemoryBootstrap(
      store as any,
      askFreeform
    );

    expect(result.choice).toBe("adopt");
    expect(result.seededConditions.role).toBe("ai");
    expect(askFreeform).toHaveBeenCalledTimes(2);
  });

  it("shows full memory then ignores on 查看 → 忽略", async () => {
    const ctx = createContextWithPrefs([{ role: "ai" }]);
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => ctx)
    });
    const askFreeform = vi.fn()
      .mockResolvedValueOnce("查看")
      .mockResolvedValueOnce("忽略");

    const result = await runMemoryBootstrap(
      store as any,
      askFreeform
    );

    expect(result.choice).toBe("ignore");
    expect(result.seededConditions).toEqual({});
  });

  it("shows full memory then ignores on 查看 → empty", async () => {
    const ctx = createContextWithPrefs([{ role: "ai" }]);
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => ctx)
    });
    const askFreeform = vi.fn()
      .mockResolvedValueOnce("查看")
      .mockResolvedValueOnce("");

    const result = await runMemoryBootstrap(
      store as any,
      askFreeform
    );

    expect(result.choice).toBe("ignore");
  });

  it("re-prompts on unrecognized input then adopts", async () => {
    const ctx = createContextWithPrefs([{ role: "ml" }]);
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => ctx)
    });
    const askFreeform = vi.fn()
      .mockResolvedValueOnce("huh?")
      .mockResolvedValueOnce("沿用");

    const result = await runMemoryBootstrap(
      store as any,
      askFreeform
    );

    expect(result.choice).toBe("adopt");
    expect(askFreeform).toHaveBeenCalledTimes(2);
  });

  it("includes context in result", async () => {
    const ctx = createContextWithPrefs([{ role: "backend" }]);
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => ctx)
    });
    const askFreeform = vi.fn().mockResolvedValue("沿用");

    const result = await runMemoryBootstrap(
      store as any,
      askFreeform
    );

    expect(result.context).toBeTruthy();
    expect(result.context!.userId).toBe("user-1");
  });

  it("does not write to memory store", async () => {
    const ctx = createContextWithPrefs([{ role: "backend" }]);
    const create = vi.fn();
    const update = vi.fn();
    const store = createMockMemoryStore({
      hydrateContext: vi.fn(async () => ctx),
      create,
      update
    });
    const askFreeform = vi.fn().mockResolvedValue("沿用");

    await runMemoryBootstrap(store as any, askFreeform);

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

// ============================================================================
// displayMemorySummary / displayFullMemory (smoke tests)
// ============================================================================

describe("displayMemorySummary", () => {
  it("does not throw with empty summary", () => {
    const summary: BootstrapSummary = {
      explicitLines: [],
      inferredLines: [],
      totalMemoryCount: 0
    };
    expect(() => displayMemorySummary(summary)).not.toThrow();
  });

  it("does not throw with populated summary", () => {
    const summary: BootstrapSummary = {
      explicitLines: ["技术栈 python, rust"],
      inferredLines: ["[推断] 避免不活跃"],
      totalMemoryCount: 3
    };
    expect(() => displayMemorySummary(summary)).not.toThrow();
  });
});

describe("displayFullMemory", () => {
  it("does not throw with empty context", () => {
    expect(() => displayFullMemory(createEmptyContext())).not.toThrow();
  });

  it("does not throw with populated context", () => {
    const ctx = createContextWithPrefs(
      [{ techStack: ["python"] }],
      [{ role: "frontend" }]
    );
    expect(() => displayFullMemory(ctx)).not.toThrow();
  });
});
