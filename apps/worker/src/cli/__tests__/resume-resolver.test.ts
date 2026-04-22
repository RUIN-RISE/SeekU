import { describe, expect, it } from "vitest";

import {
  deriveResumeItemKind,
  deriveResumability,
  sortResumePanelItems,
  toResumePanelItem
} from "../resume-resolver.js";
import type { PersistedCliSessionRecord } from "../session-ledger.js";

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
