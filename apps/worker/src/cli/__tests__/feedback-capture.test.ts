import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordCandidateFeedback,
  promptForFeedbackReason,
  checkInferenceConditions,
  applyInferredPreferences
} from "../feedback-capture.js";
import {
  FEEDBACK_REASON_LABELS,
  INFERENCE_MIN_COUNT,
  INFERRED_PREFERENCE_CONFIDENCE,
  type CandidateFeedbackRecord,
  type FeedbackReasonCode
} from "../user-memory-types.js";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a mock chain for listUserMemories which calls:
 * db.select().from(table).where(conditions).orderBy(desc)
 *
 * Returns the given rows.
 */
function mockListQuery(rows: any[] = []) {
  const orderBy = vi.fn(() => rows);
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, orderBy };
}

/**
 * Build a mock chain for findRepeatedNegativePatterns which calls:
 * db.select({fields}).from(table).where(conditions).groupBy(col).having(sql)
 *
 * Returns the given rows.
 */
function mockGroupByQuery(rows: any[] = []) {
  const having = vi.fn(() => rows);
  const groupBy = vi.fn(() => ({ having }));
  const where = vi.fn(() => ({ groupBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, groupBy, having };
}

function createMockMemoryStore(overrides: Record<string, unknown> = {}) {
  const listQ = mockListQuery([]);
  const groupQ = mockGroupByQuery([]);

  return {
    db: {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [{
            id: "fb-1",
            userId: "user-1",
            personId: "person-1",
            sentiment: "negative",
            reasonCode: "skill_mismatch",
            reasonDetail: null,
            contextSource: "shortlist",
            createdAt: new Date()
          }])
        }))
      })),
      select: vi.fn()
        .mockImplementation((...args: any[]) => {
          const fields = args[0];
          // Heuristic: if selecting specific fields (groupBy path), return groupQ
          // Otherwise return listQ
          if (fields && typeof fields === "object" && "count" in fields) {
            return groupQ.select();
          }
          return listQ.select();
        }),
      delete: vi.fn(async () => [{ id: "fb-1" }])
    },
    getUserId: vi.fn(() => "user-1"),
    create: vi.fn(async (options: any) => ({
      id: "mem-inferred-1",
      userId: "user-1",
      kind: "preference",
      scope: { kind: "global" },
      content: options.content,
      source: "inferred",
      confidence: options.confidence,
      createdAt: new Date(),
      updatedAt: new Date()
    })),
    listQ,
    groupQ,
    ...overrides
  };
}

// ============================================================================
// recordCandidateFeedback
// ============================================================================

describe("recordCandidateFeedback", () => {
  it("records negative feedback with reason", async () => {
    const store = createMockMemoryStore();
    const result = await recordCandidateFeedback({
      memoryStore: store as any,
      feedback: {
        personId: "person-1",
        sentiment: "negative",
        reasonCode: "skill_mismatch",
        reasonDetail: "不会 rust",
        contextSource: "shortlist_remove"
      }
    });

    expect(result.recorded).toBe(true);
    expect(result.feedback).toBeTruthy();
    expect(result.feedback!.sentiment).toBe("negative");
    expect(store.db.insert).toHaveBeenCalledTimes(1);
  });

  it("records positive feedback", async () => {
    const store = createMockMemoryStore();
    const result = await recordCandidateFeedback({
      memoryStore: store as any,
      feedback: {
        personId: "person-2",
        sentiment: "positive",
        contextSource: "compare"
      }
    });

    expect(result.recorded).toBe(true);
    // Verify insert was called
    expect(store.db.insert).toHaveBeenCalled();
    const insertCall = store.db.insert as any;
    const valuesCall = insertCall.mock.results[0].value.values;
    expect(valuesCall).toHaveBeenCalled();
  });

  it("records neutral feedback", async () => {
    const store = createMockMemoryStore();
    const result = await recordCandidateFeedback({
      memoryStore: store as any,
      feedback: {
        personId: "person-3",
        sentiment: "neutral",
        contextSource: "compare"
      }
    });

    expect(result.recorded).toBe(true);
  });

  it("records feedback without reason", async () => {
    const store = createMockMemoryStore();
    const result = await recordCandidateFeedback({
      memoryStore: store as any,
      feedback: {
        personId: "person-1",
        sentiment: "negative"
      }
    });

    expect(result.recorded).toBe(true);
    // Verify the values passed to insert had null reasonCode
    const insertCall = store.db.insert as any;
    const valuesCall = insertCall.mock.results[0].value.values;
    const valuesArg = valuesCall.mock.calls[0][0];
    expect(valuesArg.reasonCode).toBeNull();
  });
});

// ============================================================================
// promptForFeedbackReason
// ============================================================================

describe("promptForFeedbackReason", () => {
  it("parses reason code from user input", async () => {
    const askFreeform = vi.fn().mockResolvedValue("skill_mismatch");
    const result = await promptForFeedbackReason("张三", askFreeform);

    expect(result).not.toBeNull();
    expect(result!.reasonCode).toBe("skill_mismatch");
  });

  it("parses reason code with extra detail", async () => {
    const askFreeform = vi.fn().mockResolvedValue("skill_mismatch 不会rust");
    const result = await promptForFeedbackReason("张三", askFreeform);

    expect(result).not.toBeNull();
    expect(result!.reasonCode).toBe("skill_mismatch");
    expect(result!.reasonDetail).toBe("不会rust");
  });

  it("returns other with freeform text for unrecognized input", async () => {
    const askFreeform = vi.fn().mockResolvedValue("就是不喜欢");
    const result = await promptForFeedbackReason("张三", askFreeform);

    expect(result).not.toBeNull();
    expect(result!.reasonCode).toBe("other");
    expect(result!.reasonDetail).toBe("就是不喜欢");
  });

  it("returns null when user skips", async () => {
    const askFreeform = vi.fn().mockResolvedValue("");
    const result = await promptForFeedbackReason("张三", askFreeform);

    expect(result).toBeNull();
  });

  it("returns null when user enters whitespace", async () => {
    const askFreeform = vi.fn().mockResolvedValue("   ");
    const result = await promptForFeedbackReason("张三", askFreeform);

    expect(result).toBeNull();
  });
});

// ============================================================================
// Inference Rules
// ============================================================================

describe("inference rules", () => {
  it("does not infer when no repeated patterns exist", async () => {
    const store = createMockMemoryStore();
    store.groupQ.having.mockReturnValue([]);

    const result = await checkInferenceConditions(store as any);
    expect(result.shouldInfer).toBe(false);
    expect(result.patterns).toHaveLength(0);
  });

  it("infers when threshold is met", async () => {
    const store = createMockMemoryStore();
    store.groupQ.having.mockReturnValue([
      { reasonCode: "not_active", count: 3, earliestAt: new Date(), latestAt: new Date() }
    ]);

    const result = await checkInferenceConditions(store as any);
    expect(result.shouldInfer).toBe(true);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0].reasonCode).toBe("not_active");
    expect(result.patterns[0].count).toBe(3);
  });

  it("INFERENCE_MIN_COUNT is 3", () => {
    expect(INFERENCE_MIN_COUNT).toBe(3);
  });

  it("inferred confidence is lower than explicit", () => {
    expect(INFERRED_PREFERENCE_CONFIDENCE).toBeLessThan(1.0);
    expect(INFERRED_PREFERENCE_CONFIDENCE).toBeGreaterThanOrEqual(0.6);
  });
});

// ============================================================================
// applyInferredPreferences
// ============================================================================

describe("applyInferredPreferences", () => {
  it("creates inferred preference for actionable reason code", async () => {
    const store = createMockMemoryStore();
    // First call: no explicit conflict; second call: no existing inferred
    store.listQ.orderBy
      .mockReturnValueOnce([])  // explicit prefs - no conflict
      .mockReturnValueOnce([]); // inferred prefs - no duplicate

    const patterns = [
      { reasonCode: "not_active", count: 4, earliestAt: new Date(), latestAt: new Date() }
    ];

    const applied = await applyInferredPreferences(store as any, patterns);
    expect(applied).toBe(1);
    expect(store.create).toHaveBeenCalledTimes(1);

    const createArgs = store.create.mock.calls[0][0];
    expect(createArgs.source).toBe("inferred");
    expect(createArgs.confidence).toBe(INFERRED_PREFERENCE_CONFIDENCE);
    expect(createArgs.content).toEqual({ avoidInactive: true });
  });

  it("does not create preference when explicit conflict exists", async () => {
    const store = createMockMemoryStore();
    store.listQ.orderBy.mockReturnValueOnce([{ content: { avoidInactive: true } }]);

    const patterns = [
      { reasonCode: "not_active", count: 4, earliestAt: new Date(), latestAt: new Date() }
    ];

    const applied = await applyInferredPreferences(store as any, patterns);
    expect(applied).toBe(0);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("does not create duplicate inferred preferences", async () => {
    const store = createMockMemoryStore();
    store.listQ.orderBy
      .mockReturnValueOnce([])  // no explicit conflict
      .mockReturnValueOnce([{ content: { avoidInactive: true } }]); // already inferred

    const patterns = [
      { reasonCode: "not_active", count: 4, earliestAt: new Date(), latestAt: new Date() }
    ];

    const applied = await applyInferredPreferences(store as any, patterns);
    expect(applied).toBe(0);
  });

  it("skips reason codes that don't map to preferences", async () => {
    const store = createMockMemoryStore();
    const patterns = [
      { reasonCode: "skill_mismatch", count: 5, earliestAt: new Date(), latestAt: new Date() }
    ];

    const applied = await applyInferredPreferences(store as any, patterns);
    expect(applied).toBe(0);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("inferred preference has expiresAt", async () => {
    const store = createMockMemoryStore();
    store.listQ.orderBy
      .mockReturnValueOnce([])  // no explicit conflict
      .mockReturnValueOnce([]); // no existing inferred

    const patterns = [
      { reasonCode: "not_active", count: 3, earliestAt: new Date(), latestAt: new Date() }
    ];

    await applyInferredPreferences(store as any, patterns);
    const createArgs = store.create.mock.calls[0][0];
    expect(createArgs.expiresAt).toBeTruthy();
    expect(createArgs.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// ============================================================================
// Feedback Reason Labels
// ============================================================================

describe("FEEDBACK_REASON_LABELS", () => {
  it("has labels for all reason codes", () => {
    const codes: FeedbackReasonCode[] = [
      "skill_mismatch",
      "location_mismatch",
      "experience_mismatch",
      "not_active",
      "culture_fit",
      "other"
    ];

    for (const code of codes) {
      expect(FEEDBACK_REASON_LABELS[code]).toBeTruthy();
    }
  });
});

// ============================================================================
// Shortlist removal feedback integration
// ============================================================================

describe("shortlist removal feedback integration", () => {
  it("records negative feedback even when user skips reason", async () => {
    const store = createMockMemoryStore();

    // Simulate: user removes candidate, skips reason prompt
    const { recordCandidateFeedback, promptForFeedbackReason } = await import("../feedback-capture.js");

    const reason = await promptForFeedbackReason(
      "张三",
      async () => "" // user skips
    );
    expect(reason).toBeNull();

    // Controller should still record the feedback event (sentiment is the signal, reason is enrichment)
    const result = await recordCandidateFeedback({
      memoryStore: store as any,
      feedback: {
        personId: "person-1",
        sentiment: "negative",
        reasonCode: reason?.reasonCode,
        reasonDetail: reason?.reasonDetail,
        contextSource: "shortlist_remove"
      }
    });

    expect(result.recorded).toBe(true);
    expect(store.db.insert).toHaveBeenCalledTimes(1);
  });
});
