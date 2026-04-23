import { describe, expect, it, vi } from "vitest";

import {
  deriveResumeItemKind,
  deriveResumability,
  sortResumePanelItems,
  toResumePanelItem,
  resolveTaskResumeItems
} from "../resume-resolver.js";
import { rankResumeItem, compareResumeItems } from "../resume-panel-types.js";
import type { TaskResumeItem } from "../resume-panel-types.js";
import type { PersistedCliSessionRecord, CliSessionLedger } from "../session-ledger.js";
import type { WorkItemRecord } from "../work-item-types.js";

function createRecord(overrides: Partial<PersistedCliSessionRecord> = {}): PersistedCliSessionRecord {
  return {
    sessionId: "11111111-1111-1111-1111-111111111111",
    origin: "cli",
    posture: "stopped",
    transcript: [],
    latestSnapshot: {
      sessionId: "11111111-1111-1111-1111-111111111111",
      runtime: {
        status: "waiting-input",
        statusSummary: "等待新的搜索需求。",
        primaryWhyCode: "awaiting_user_input",
        whyCodes: ["awaiting_user_input"],
        whySummary: "等待新的搜索需求。",
        terminationReason: "completed",
        lastStatusAt: "2026-04-22T01:00:00.000Z"
      },
      userGoal: "找杭州的 AI 工程师",
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
        updatedAt: "2026-04-22T01:00:00.000Z"
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
    },
    createdAt: "2026-04-22T01:00:00.000Z",
    updatedAt: "2026-04-22T01:00:00.000Z",
    ...overrides
  };
}

describe("resume-resolver", () => {
  it("treats interrupted work as resumable and ranks it as interrupted work item", () => {
    const record = createRecord({
      posture: "active",
      latestSnapshot: {
        ...createRecord().latestSnapshot!,
        runtime: {
          ...createRecord().latestSnapshot!.runtime,
          status: "searching",
          terminationReason: "interrupted"
        }
      }
    });

    expect(deriveResumability(record)).toBe("resumable");
    expect(deriveResumeItemKind(record)).toBe("interrupted_work_item");
  });

  it("treats completed sessions as read-only", () => {
    const record = createRecord({
      latestSnapshot: {
        ...createRecord().latestSnapshot!,
        runtime: {
          ...createRecord().latestSnapshot!.runtime,
          status: "completed",
          terminationReason: "completed"
        }
      }
    });

    expect(deriveResumability(record)).toBe("read_only");
    const item = toResumePanelItem(record);
    expect(item.resumability).toBe("read_only");
  });

  it("sorts resumable interrupted work ahead of read-only stopped sessions", () => {
    const interrupted = toResumePanelItem(createRecord({
      sessionId: "22222222-2222-2222-2222-222222222222",
      posture: "active",
      updatedAt: "2026-04-22T02:00:00.000Z",
      latestSnapshot: {
        ...createRecord().latestSnapshot!,
        sessionId: "22222222-2222-2222-2222-222222222222",
        runtime: {
          ...createRecord().latestSnapshot!.runtime,
          status: "searching",
          terminationReason: "interrupted"
        }
      }
    }));
    const readOnly = toResumePanelItem(createRecord({
      updatedAt: "2026-04-22T03:00:00.000Z",
      latestSnapshot: {
        ...createRecord().latestSnapshot!,
        runtime: {
          ...createRecord().latestSnapshot!.runtime,
          status: "completed",
          terminationReason: "completed"
        }
      }
    }));

    const sorted = sortResumePanelItems([readOnly, interrupted]);
    expect(sorted[0]?.sessionId).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("prefers persisted resume metadata over recomputing from snapshot", () => {
    const item = toResumePanelItem(createRecord({
      posture: "stopped",
      resumeMeta: {
        kind: "interrupted_work_item",
        resumability: "resumable",
        status: "searching",
        statusSummary: "恢复搜索中。",
        primaryWhyCode: "retrieval_all_weak",
        whySummary: "上次搜索结果过弱，需要继续 refine。",
        terminationReason: "interrupted",
        lastStatusAt: "2026-04-22T02:30:00.000Z"
      },
      latestSnapshot: {
        ...createRecord().latestSnapshot!,
        runtime: {
          ...createRecord().latestSnapshot!.runtime,
          status: "completed",
          statusSummary: "会话已结束。",
          terminationReason: "completed"
        }
      }
    }));

    expect(item.kind).toBe("interrupted_work_item");
    expect(item.resumability).toBe("resumable");
    expect(item.status).toBe("searching");
    expect(item.terminationReason).toBe("interrupted");
  });
});

// ============================================================================
// B5: Task-Centric Ranking Tests
// ============================================================================

function makeTaskResumeItem(overrides: Partial<TaskResumeItem> = {}): TaskResumeItem {
  return {
    kind: "work_item",
    sessionId: "s-1",
    workItemId: "wi-1",
    title: "找 AI 工程师",
    subtitle: "短名单就绪",
    stage: "shortlist_ready",
    blocked: false,
    updatedAt: "2026-04-22T10:00:00.000Z",
    resumability: "resumable",
    record: createRecord(),
    ...overrides
  };
}

describe("B5: rankResumeItem", () => {
  it("work_item ranks higher than degraded_work_item", () => {
    const work = makeTaskResumeItem({ kind: "work_item" });
    const degraded = makeTaskResumeItem({ kind: "degraded_work_item", sessionId: "s-2" });
    expect(rankResumeItem(work)).toBeGreaterThan(rankResumeItem(degraded));
  });

  it("degraded_work_item ranks higher than legacy_session", () => {
    const degraded = makeTaskResumeItem({ kind: "degraded_work_item" });
    const legacy = makeTaskResumeItem({ kind: "legacy_session", sessionId: "s-3" });
    expect(rankResumeItem(degraded)).toBeGreaterThan(rankResumeItem(legacy));
  });

  it("resumable ranks higher than read_only within same kind", () => {
    const resumable = makeTaskResumeItem({ resumability: "resumable" });
    const readOnly = makeTaskResumeItem({ resumability: "read_only", sessionId: "s-4" });
    expect(rankResumeItem(resumable)).toBeGreaterThan(rankResumeItem(readOnly));
  });

  it("decision_ready ranks higher than comparing", () => {
    const decision = makeTaskResumeItem({ stage: "decision_ready" });
    const comparing = makeTaskResumeItem({ stage: "comparing", sessionId: "s-5" });
    expect(rankResumeItem(decision)).toBeGreaterThan(rankResumeItem(comparing));
  });

  it("comparing ranks higher than shortlist_ready", () => {
    const comparing = makeTaskResumeItem({ stage: "comparing" });
    const shortlist = makeTaskResumeItem({ stage: "shortlist_ready", sessionId: "s-6" });
    expect(rankResumeItem(comparing)).toBeGreaterThan(rankResumeItem(shortlist));
  });

  it("shortlist_ready ranks higher than searching", () => {
    const shortlist = makeTaskResumeItem({ stage: "shortlist_ready" });
    const searching = makeTaskResumeItem({ stage: "searching", sessionId: "s-7" });
    expect(rankResumeItem(shortlist)).toBeGreaterThan(rankResumeItem(searching));
  });

  it("searching ranks higher than clarifying", () => {
    const searching = makeTaskResumeItem({ stage: "searching" });
    const clarifying = makeTaskResumeItem({ stage: "clarifying", sessionId: "s-8" });
    expect(rankResumeItem(searching)).toBeGreaterThan(rankResumeItem(clarifying));
  });

  it("clarifying ranks higher than completed", () => {
    const clarifying = makeTaskResumeItem({ stage: "clarifying" });
    const completed = makeTaskResumeItem({ stage: "completed", sessionId: "s-9" });
    expect(rankResumeItem(clarifying)).toBeGreaterThan(rankResumeItem(completed));
  });

  it("blocked actionable gets a small boost over non-blocked same stage (resumable only)", () => {
    const blocked = makeTaskResumeItem({ stage: "searching", blocked: true, resumability: "resumable" });
    const notBlocked = makeTaskResumeItem({ stage: "searching", blocked: false, resumability: "resumable", sessionId: "s-10" });
    expect(rankResumeItem(blocked)).toBeGreaterThan(rankResumeItem(notBlocked));
  });

  it("blocked completed does not get boost", () => {
    const blockedCompleted = makeTaskResumeItem({ stage: "completed", blocked: true, resumability: "resumable" });
    const notBlockedCompleted = makeTaskResumeItem({ stage: "completed", blocked: false, resumability: "resumable", sessionId: "s-11" });
    // No boost for completed/abandoned
    expect(rankResumeItem(blockedCompleted)).toBe(rankResumeItem(notBlockedCompleted));
  });

  it("blocked read_only does not get actionable boost", () => {
    const blockedReadonly = makeTaskResumeItem({ stage: "searching", blocked: true, resumability: "read_only" });
    const notBlockedReadonly = makeTaskResumeItem({ stage: "searching", blocked: false, resumability: "read_only", sessionId: "s-12" });
    // read_only blocked items are not actionable — no boost
    expect(rankResumeItem(blockedReadonly)).toBe(rankResumeItem(notBlockedReadonly));
  });

  it("blocked not_resumable does not get actionable boost", () => {
    const blockedNotResumable = makeTaskResumeItem({ stage: "searching", blocked: true, resumability: "not_resumable" });
    const notBlockedNotResumable = makeTaskResumeItem({ stage: "searching", blocked: false, resumability: "not_resumable", sessionId: "s-13" });
    expect(rankResumeItem(blockedNotResumable)).toBe(rankResumeItem(notBlockedNotResumable));
  });
});

describe("B5: compareResumeItems", () => {
  it("work-item item sorts before legacy item", () => {
    const work = makeTaskResumeItem({ kind: "work_item" });
    const legacy = makeTaskResumeItem({ kind: "legacy_session", sessionId: "s-l" });
    const sorted = [legacy, work].sort(compareResumeItems);
    expect(sorted[0].sessionId).toBe("s-1");
    expect(sorted[1].sessionId).toBe("s-l");
  });

  it("degraded sorts between work-item and legacy", () => {
    const work = makeTaskResumeItem({ kind: "work_item" });
    const degraded = makeTaskResumeItem({ kind: "degraded_work_item", sessionId: "s-d" });
    const legacy = makeTaskResumeItem({ kind: "legacy_session", sessionId: "s-l" });
    const sorted = [legacy, degraded, work].sort(compareResumeItems);
    expect(sorted.map((i) => i.sessionId)).toEqual(["s-1", "s-d", "s-l"]);
  });

  it("higher stage priority sorts first within same kind", () => {
    const decision = makeTaskResumeItem({ stage: "decision_ready", sessionId: "s-d" });
    const searching = makeTaskResumeItem({ stage: "searching", sessionId: "s-s" });
    const sorted = [searching, decision].sort(compareResumeItems);
    expect(sorted[0].sessionId).toBe("s-d");
  });

  it("same rank: more recent sorts first", () => {
    const older = makeTaskResumeItem({ updatedAt: "2026-04-22T08:00:00.000Z", sessionId: "s-old" });
    const newer = makeTaskResumeItem({ updatedAt: "2026-04-22T12:00:00.000Z", sessionId: "s-new" });
    const sorted = [older, newer].sort(compareResumeItems);
    expect(sorted[0].sessionId).toBe("s-new");
  });

  it("sorting is deterministic regardless of input order", () => {
    const items = [
      makeTaskResumeItem({ kind: "legacy_session", stage: "completed", sessionId: "s-1", updatedAt: "2026-04-22T05:00:00.000Z" }),
      makeTaskResumeItem({ kind: "work_item", stage: "decision_ready", sessionId: "s-2", updatedAt: "2026-04-22T04:00:00.000Z" }),
      makeTaskResumeItem({ kind: "degraded_work_item", stage: "searching", sessionId: "s-3", updatedAt: "2026-04-22T06:00:00.000Z" }),
      makeTaskResumeItem({ kind: "work_item", stage: "searching", sessionId: "s-4", updatedAt: "2026-04-22T07:00:00.000Z" })
    ];
    const sorted1 = [...items].sort(compareResumeItems);
    const sorted2 = [...items].reverse().sort(compareResumeItems);
    expect(sorted1.map((i) => i.sessionId)).toEqual(sorted2.map((i) => i.sessionId));
    // decision_ready work item should be first
    expect(sorted1[0].sessionId).toBe("s-2");
  });
});

// ============================================================================
// B6: Async Integration Tests for resolveTaskResumeItems
// ============================================================================

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

function makeMockLedger(records: PersistedCliSessionRecord[]) {
  const recordMap = new Map(records.map((r) => [r.sessionId, r]));
  return {
    listRecent: vi.fn().mockResolvedValue(
      records.map((r) => ({
        sessionId: r.sessionId,
        updatedAt: r.updatedAt,
        posture: r.posture,
        cacheOnly: r.cacheOnly
      }))
    ),
    load: vi.fn().mockImplementation((id: string) => Promise.resolve(recordMap.get(id) ?? null))
  } as unknown as CliSessionLedger;
}

function makeMockWorkItemStore(getMap: Map<string, WorkItemRecord | null>) {
  return {
    get: vi.fn().mockImplementation((id: string) => {
      if (getMap.has(id)) return Promise.resolve(getMap.get(id)!);
      return Promise.resolve(null);
    })
  } as any;
}

describe("B6: resolveTaskResumeItems async integration", () => {
  const baseSnapshot = createRecord().latestSnapshot!;

  it("workItemStore.get hit -> produces work_item kind", async () => {
    const record = createRecord({ workItemId: "wi-1" });
    const ledger = makeMockLedger([record]);
    const store = makeMockWorkItemStore(new Map([["wi-1", makeWorkItem()]]));

    const result = await resolveTaskResumeItems(ledger, store, 8);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("work_item");
    expect(result.items[0].title).toBe("找 AI 工程师");
    expect(result.items[0].workItemId).toBe("wi-1");
  });

  it("workItemStore.get returns null -> produces degraded_work_item", async () => {
    const record = createRecord({ workItemId: "wi-missing" });
    const ledger = makeMockLedger([record]);
    const store = makeMockWorkItemStore(new Map([["wi-missing", null]]));

    const result = await resolveTaskResumeItems(ledger, store, 8);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("degraded_work_item");
    expect(result.items[0].subtitle).toContain("工作项关联丢失");
  });

  it("workItemStore.get throws -> produces degraded_work_item", async () => {
    const record = createRecord({ workItemId: "wi-error" });
    const ledger = makeMockLedger([record]);
    const store = {
      get: vi.fn().mockRejectedValue(new Error("DB connection lost"))
    } as any;

    const result = await resolveTaskResumeItems(ledger, store, 8);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("degraded_work_item");
  });

  it("no workItemId -> produces legacy_session", async () => {
    const record = createRecord({ workItemId: null });
    const ledger = makeMockLedger([record]);
    const store = makeMockWorkItemStore(new Map());

    const result = await resolveTaskResumeItems(ledger, store, 8);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("legacy_session");
    expect(result.items[0].subtitle).toContain("legacy");
  });

  it("null workItemStore + workItemId -> produces degraded_work_item", async () => {
    const record = createRecord({ workItemId: "wi-1" });
    const ledger = makeMockLedger([record]);

    const result = await resolveTaskResumeItems(ledger, null, 8);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("degraded_work_item");
  });

  it("displayLimit trims after ranking", async () => {
    // 3 records, displayLimit=2
    const r1 = createRecord({ sessionId: "s-1", workItemId: null, updatedAt: "2026-04-22T01:00:00.000Z" });
    const r2 = createRecord({ sessionId: "s-2", workItemId: "wi-2", updatedAt: "2026-04-22T02:00:00.000Z",
      latestSnapshot: { ...baseSnapshot, sessionId: "s-2", runtime: { ...baseSnapshot.runtime, status: "comparing" } }
    });
    const r3 = createRecord({ sessionId: "s-3", workItemId: "wi-3", updatedAt: "2026-04-22T03:00:00.000Z" });

    const ledger = makeMockLedger([r1, r2, r3]);
    const store = makeMockWorkItemStore(new Map([
      ["wi-2", makeWorkItem({ id: "wi-2", title: "找后端" })],
      ["wi-3", makeWorkItem({ id: "wi-3", title: "找前端" })]
    ]));

    const result = await resolveTaskResumeItems(ledger, store, 2);

    expect(result.items).toHaveLength(2);
    // Both should be work_item kind (ranked higher than legacy)
    expect(result.items.every((i) => i.kind === "work_item")).toBe(true);
  });

  it("older but higher-priority work item surfaces above newer legacy", async () => {
    const oldWorkItem = createRecord({
      sessionId: "s-old",
      workItemId: "wi-old",
      updatedAt: "2026-04-20T01:00:00.000Z",
      latestSnapshot: {
        ...baseSnapshot,
        sessionId: "s-old",
        runtime: { ...baseSnapshot.runtime, status: "comparing" },
        recommendedCandidate: {
          candidate: { personId: "p-1", name: "Ada", headline: "Engineer", location: "杭州", company: null, experienceYears: null, matchScore: 80, matchStrength: "strong", matchReason: "match", queryReasons: [], sources: [] },
          confidenceLevel: "high",
          createdAt: "2026-04-20T01:00:00.000Z"
        }
      }
    });
    const newLegacy = createRecord({
      sessionId: "s-new",
      workItemId: null,
      updatedAt: "2026-04-22T10:00:00.000Z"
    });

    const ledger = makeMockLedger([newLegacy, oldWorkItem]);
    const store = makeMockWorkItemStore(new Map([
      ["wi-old", makeWorkItem({ id: "wi-old", title: "找全栈" })]
    ]));

    const result = await resolveTaskResumeItems(ledger, store, 8);

    expect(result.items).toHaveLength(2);
    // work_item (decision_ready) should rank above legacy_session regardless of recency
    expect(result.items[0].kind).toBe("work_item");
    expect(result.items[0].sessionId).toBe("s-old");
    expect(result.items[1].kind).toBe("legacy_session");
    expect(result.items[1].sessionId).toBe("s-new");
  });

  it("defaultSelection points to top-ranked item", async () => {
    const r1 = createRecord({ sessionId: "s-legacy", workItemId: null });
    const r2 = createRecord({ sessionId: "s-work", workItemId: "wi-1" });

    const ledger = makeMockLedger([r1, r2]);
    const store = makeMockWorkItemStore(new Map([["wi-1", makeWorkItem()]]));

    const result = await resolveTaskResumeItems(ledger, store, 8);

    expect(result.defaultSelection).toBe(result.items[0]?.sessionId);
    expect(result.defaultSelection).toBe("s-work");
  });

  it("fetches wider window than displayLimit", async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      createRecord({ sessionId: `s-${i}`, workItemId: null, updatedAt: `2026-04-22T${String(i).padStart(2, "0")}:00:00.000Z` })
    );
    const ledger = makeMockLedger(records);

    await resolveTaskResumeItems(ledger, null, 8);

    // listRecent should be called with a larger limit, not 8
    expect(ledger.listRecent).toHaveBeenCalledWith(32);
  });

  it("proceeds without memory context dependency", async () => {
    const record = createRecord({ workItemId: null });
    const ledger = makeMockLedger([record]);

    const result = await resolveTaskResumeItems(ledger, null, 8);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("legacy_session");
  });
});
