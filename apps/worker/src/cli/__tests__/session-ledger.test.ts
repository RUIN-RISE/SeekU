import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CliSessionLedger, type PersistedCliSessionRecord } from "../session-ledger.js";

function createMockDb(overrides: {
  upsertResult?: Record<string, unknown>;
  upsertError?: Error;
  getResult?: Record<string, unknown> | null;
  getError?: Error;
  listResult?: Record<string, unknown>[];
  listError?: Error;
} = {}) {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() =>
            overrides.upsertError
              ? Promise.reject(overrides.upsertError)
              : Promise.resolve([overrides.upsertResult ?? { sessionId: "test" }])
          )
        })
      })
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() =>
            overrides.getError
              ? Promise.reject(overrides.getError)
              : overrides.getResult != null
                ? Promise.resolve([overrides.getResult])
                : Promise.resolve([])
          )
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() =>
            overrides.listError
              ? Promise.reject(overrides.listError)
              : Promise.resolve(overrides.listResult ?? [])
          )
        })
      })
    })
  } as any;
}

const BASE_RECORD: PersistedCliSessionRecord = {
  sessionId: "11111111-1111-1111-1111-111111111111",
  origin: "cli",
  posture: "stopped",
  transcript: [],
  latestSnapshot: {
    sessionId: "11111111-1111-1111-1111-111111111111",
    runtime: {
      status: "completed",
      statusSummary: "搜索完成。",
      primaryWhyCode: undefined,
      whyCodes: [],
      whySummary: null,
      terminationReason: "completed",
      lastStatusAt: "2026-04-18T00:05:00.000Z"
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
    confidenceStatus: { level: "low", updatedAt: "2026-04-18T00:05:00.000Z" },
    recommendedCandidate: null,
    openUncertainties: [],
    recoveryState: { phase: "idle", clarificationCount: 0, rewriteCount: 0, lowConfidenceEmitted: false },
    clarificationCount: 0,
    searchHistory: []
  },
  createdAt: "2026-04-18T00:00:00.000Z",
  updatedAt: "2026-04-18T00:05:00.000Z"
};

describe("CliSessionLedger cache-only", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), "seeku-session-ledger-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("persists and reloads a cache-backed session record", async () => {
    const ledger = new CliSessionLedger({ cacheDir });
    const record: PersistedCliSessionRecord = {
      sessionId: "11111111-1111-1111-1111-111111111111",
      origin: "cli",
      posture: "stopped",
      transcript: [
        {
          type: "message",
          id: "t-1",
          role: "user",
          content: "找杭州的 AI 工程师",
          timestamp: "2026-04-18T00:00:00.000Z"
        }
      ],
      latestSnapshot: {
        sessionId: "11111111-1111-1111-1111-111111111111",
        runtime: {
          status: "waiting-input",
          statusSummary: "等待新的搜索需求。",
          whyCodes: ["awaiting_user_input"],
          whySummary: "等待新的搜索需求。",
          lastStatusAt: "2026-04-18T00:00:00.000Z"
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
          updatedAt: "2026-04-18T00:00:00.000Z"
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
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:05:00.000Z"
    };

    await ledger.save(record);

    const loaded = await ledger.load(record.sessionId);
    expect(loaded).toMatchObject({
      sessionId: record.sessionId,
      posture: "stopped",
      cacheOnly: true
    });
    expect(loaded?.transcript).toHaveLength(1);
    expect(loaded?.latestSnapshot?.runtime.status).toBe("waiting-input");
    expect(loaded?.resumeMeta).toMatchObject({
      kind: "stopped_session",
      resumability: "read_only",
      status: "waiting-input",
      statusSummary: "等待新的搜索需求。",
      whySummary: "等待新的搜索需求。"
    });
  });

  it("lists recent cache sessions in descending updated order", async () => {
    const ledger = new CliSessionLedger({ cacheDir });

    await ledger.save({
      sessionId: "11111111-1111-1111-1111-111111111111",
      origin: "cli",
      posture: "stopped",
      transcript: [],
      latestSnapshot: null,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:01:00.000Z"
    });
    await ledger.save({
      sessionId: "22222222-2222-2222-2222-222222222222",
      origin: "cli",
      posture: "active",
      transcript: [],
      latestSnapshot: {
        sessionId: "22222222-2222-2222-2222-222222222222",
        runtime: {
          status: "searching",
          statusSummary: "正在执行搜索。",
          whyCodes: ["retrieval_all_weak"],
          whySummary: "当前结果偏弱，准备继续扩搜。",
          lastStatusAt: "2026-04-18T00:02:00.000Z"
        },
        userGoal: "找上海的搜索工程师",
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
          updatedAt: "2026-04-18T00:02:00.000Z"
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
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:02:00.000Z"
    });

    const recent = await ledger.listRecent(5);
    expect(recent.map((item) => item.sessionId)).toEqual([
      "22222222-2222-2222-2222-222222222222",
      "11111111-1111-1111-1111-111111111111"
    ]);
    expect(recent[0]?.resumeMeta).toMatchObject({
      kind: "interrupted_work_item",
      resumability: "resumable",
      status: "searching"
    });
    expect(recent[1]?.resumeMeta).toBeUndefined();
  });
});

describe("CliSessionLedger DB-first save", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), "seeku-session-ledger-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("throws when DB write fails", async () => {
    const db = createMockDb({ upsertError: new Error("connection refused") });
    const ledger = new CliSessionLedger({ db, cacheDir });

    await expect(ledger.save(BASE_RECORD)).rejects.toThrow("connection refused");
  });

  it("returns enriched record with resumeMeta after DB save succeeds", async () => {
    const db = createMockDb({
      upsertResult: { sessionId: BASE_RECORD.sessionId }
    });
    const ledger = new CliSessionLedger({ db, cacheDir });

    const result = await ledger.save(BASE_RECORD);
    expect(result.resumeMeta).toMatchObject({
      kind: "stopped_session",
      resumability: "read_only",
      status: "completed",
      terminationReason: "completed"
    });
    expect(result.cacheOnly).toBeUndefined();
  });

  it("does not treat cache-only write as formal success when DB is present", async () => {
    const db = createMockDb({ upsertError: new Error("DB down") });
    const ledger = new CliSessionLedger({ db, cacheDir });

    await expect(ledger.save(BASE_RECORD)).rejects.toThrow("DB down");
  });

  it("succeeds with cacheOnly when no DB is configured", async () => {
    const ledger = new CliSessionLedger({ cacheDir });
    const result = await ledger.save(BASE_RECORD);
    expect(result.cacheOnly).toBe(true);
  });
});

describe("CliSessionLedger DB-first load", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), "seeku-session-ledger-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("loads from DB when available, ignoring cache", async () => {
    const dbRecord = {
      sessionId: "11111111-1111-1111-1111-111111111111",
      origin: "cli",
      posture: "stopped",
      transcript: [{ id: "t-1", role: "user", content: "from DB", timestamp: "2026-04-18T00:00:00.000Z" }],
      latestSnapshot: {
        sessionId: "11111111-1111-1111-1111-111111111111",
        runtime: {
          status: "completed",
          statusSummary: "完成。",
          whyCodes: [],
          whySummary: null,
          terminationReason: "completed",
          lastStatusAt: "2026-04-18T00:05:00.000Z"
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
        confidenceStatus: { level: "low", updatedAt: "2026-04-18T00:05:00.000Z" },
        recommendedCandidate: null,
        openUncertainties: [],
        recoveryState: { phase: "idle", clarificationCount: 0, rewriteCount: 0, lowConfidenceEmitted: false },
        clarificationCount: 0,
        searchHistory: []
      },
      resumeMeta: {
        kind: "stopped_session",
        resumability: "read_only",
        status: "completed",
        statusSummary: "完成。",
        whySummary: null,
        terminationReason: "completed",
        lastStatusAt: "2026-04-18T00:05:00.000Z"
      },
      createdAt: new Date("2026-04-18T00:00:00.000Z"),
      updatedAt: new Date("2026-04-18T00:05:00.000Z")
    };

    const db = createMockDb({ getResult: dbRecord });

    // Also write a different record to cache to verify DB takes precedence
    const ledger = new CliSessionLedger({ db, cacheDir });
    await ledger.saveToCache({
      ...BASE_RECORD,
      transcript: [
        {
          type: "message",
          id: "t-cache",
          role: "user",
          content: "from cache",
          timestamp: "2026-04-18T00:00:00.000Z"
        }
      ]
    });

    const loaded = await ledger.load("11111111-1111-1111-1111-111111111111");
    expect(loaded?.transcript[0]).toMatchObject({
      type: "message",
      content: "from DB"
    });
    expect(loaded?.cacheOnly).toBeUndefined();
  });

  it("loads legacy cache transcripts that only stored message fields", async () => {
    const legacyRecord = {
      ...BASE_RECORD,
      transcript: [
        {
          id: "legacy-1",
          role: "assistant",
          content: "旧缓存消息",
          timestamp: "2026-04-18T00:04:00.000Z"
        }
      ]
    };
    await writeFile(
      path.join(cacheDir, `${BASE_RECORD.sessionId}.json`),
      `${JSON.stringify(legacyRecord, null, 2)}\n`,
      "utf8"
    );

    const ledger = new CliSessionLedger({ cacheDir });
    const loaded = await ledger.load(BASE_RECORD.sessionId);

    expect(loaded?.transcript).toEqual([
      {
        type: "message",
        id: "legacy-1",
        role: "assistant",
        content: "旧缓存消息",
        timestamp: "2026-04-18T00:04:00.000Z"
      }
    ]);
    expect(loaded?.cacheOnly).toBe(true);
  });

  it("loads event transcript entries from DB records", async () => {
    const db = createMockDb({
      getResult: {
        sessionId: BASE_RECORD.sessionId,
        origin: "cli",
        posture: "active",
        transcript: [
          {
            type: "event",
            event: {
              sessionId: BASE_RECORD.sessionId,
              sequence: 2,
              timestamp: "2026-04-18T00:03:00.000Z",
              type: "status_changed",
              status: "searching",
              summary: "继续搜索。",
              data: { source: "db" }
            }
          }
        ],
        latestSnapshot: {
          ...BASE_RECORD.latestSnapshot,
          runtime: {
            ...BASE_RECORD.latestSnapshot!.runtime,
            status: "searching",
            statusSummary: "继续搜索。",
            terminationReason: undefined
          }
        },
        createdAt: new Date(BASE_RECORD.createdAt),
        updatedAt: new Date(BASE_RECORD.updatedAt)
      }
    });
    const ledger = new CliSessionLedger({ db, cacheDir });

    const loaded = await ledger.load(BASE_RECORD.sessionId);

    expect(loaded?.transcript).toEqual([
      {
        type: "event",
        event: {
          sessionId: BASE_RECORD.sessionId,
          sequence: 2,
          timestamp: "2026-04-18T00:03:00.000Z",
          type: "status_changed",
          status: "searching",
          summary: "继续搜索。",
          data: { source: "db" }
        }
      }
    ]);
    expect(loaded?.resumeMeta).toMatchObject({
      kind: "interrupted_work_item",
      resumability: "resumable",
      status: "searching"
    });
  });

  it("falls back to cache when DB is unavailable", async () => {
    const db = createMockDb({ getError: new Error("connection refused") });
    const ledger = new CliSessionLedger({ db, cacheDir });

    // Write to cache directly
    await ledger.saveToCache(BASE_RECORD);

    const loaded = await ledger.load(BASE_RECORD.sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded?.cacheOnly).toBe(true);
  });

  it("rethrows non-recoverable DB read errors", async () => {
    const db = createMockDb({ getError: new Error("invalid input syntax for type json") });
    const ledger = new CliSessionLedger({ db, cacheDir });

    await expect(ledger.load(BASE_RECORD.sessionId)).rejects.toThrow("invalid input syntax for type json");
  });

  it("returns null for non-CLI DB session", async () => {
    const db = createMockDb({
      getResult: {
        sessionId: "11111111-1111-1111-1111-111111111111",
        origin: "web",
        posture: "stopped",
        createdAt: new Date("2026-04-18T00:00:00.000Z"),
        updatedAt: new Date("2026-04-18T00:05:00.000Z")
      }
    });
    const ledger = new CliSessionLedger({ db, cacheDir });

    const loaded = await ledger.load("11111111-1111-1111-1111-111111111111");
    expect(loaded).toBeNull();
  });

  it("returns cacheOnly record when DB has no matching session", async () => {
    const db = createMockDb({ getResult: null });
    const ledger = new CliSessionLedger({ db, cacheDir });

    await ledger.saveToCache(BASE_RECORD);

    const loaded = await ledger.load(BASE_RECORD.sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded?.cacheOnly).toBe(true);
  });
});

describe("CliSessionLedger DB-first listRecent", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), "seeku-session-ledger-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns DB records with resumeMeta when DB is available", async () => {
    const db = createMockDb({
      listResult: [
        {
          sessionId: "22222222-2222-2222-2222-222222222222",
          origin: "cli",
          posture: "stopped",
          updatedAt: new Date("2026-04-18T00:02:00.000Z"),
          resumeMeta: {
            kind: "stopped_session",
            resumability: "read_only",
            status: "completed",
            statusSummary: "完成。",
            whySummary: null
          }
        },
        {
          sessionId: "11111111-1111-1111-1111-111111111111",
          origin: "cli",
          posture: "stopped",
          updatedAt: new Date("2026-04-18T00:01:00.000Z"),
          resumeMeta: null
        }
      ]
    });
    const ledger = new CliSessionLedger({ db, cacheDir });

    const recent = await ledger.listRecent(5);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.resumeMeta).toMatchObject({
      kind: "stopped_session",
      resumability: "read_only"
    });
    expect(recent[0]?.cacheOnly).toBeUndefined();
  });

  it("falls back to cache when DB is unavailable", async () => {
    const db = createMockDb({ listError: new Error("connection refused") });
    const ledger = new CliSessionLedger({ db, cacheDir });

    await ledger.saveToCache(BASE_RECORD);

    const recent = await ledger.listRecent(5);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.cacheOnly).toBe(true);
  });

  it("rethrows non-recoverable DB list errors", async () => {
    const db = createMockDb({ listError: new Error("invalid input syntax for type json") });
    const ledger = new CliSessionLedger({ db, cacheDir });

    await expect(ledger.listRecent(5)).rejects.toThrow("invalid input syntax for type json");
  });

  it("ignores invalid persisted resumeMeta and derives from snapshot", async () => {
    const db = createMockDb({
      listResult: [
        {
          sessionId: "33333333-3333-3333-3333-333333333333",
          origin: "cli",
          posture: "stopped",
          updatedAt: new Date("2026-04-18T00:03:00.000Z"),
          resumeMeta: {
            kind: "stopped_session",
            resumability: "read_only",
            status: "unknown",
            statusSummary: "bad"
          }
        }
      ]
    });
    const ledger = new CliSessionLedger({ db, cacheDir });

    const recent = await ledger.listRecent(5);
    expect(recent[0]?.resumeMeta).toBeUndefined();
  });
});
