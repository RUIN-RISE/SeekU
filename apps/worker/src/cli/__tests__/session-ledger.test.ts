import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CliSessionLedger, type PersistedCliSessionRecord } from "../session-ledger.js";

describe("CliSessionLedger", () => {
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
          id: "t-1",
          role: "user",
          content: "找杭州的 AI 工程师",
          timestamp: "2026-04-18T00:00:00.000Z"
        }
      ],
      latestSnapshot: {
        sessionId: "11111111-1111-1111-1111-111111111111",
        status: "waiting-input",
        statusSummary: "等待新的搜索需求。",
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
    expect(loaded?.latestSnapshot?.status).toBe("waiting-input");
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
      latestSnapshot: null,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:02:00.000Z"
    });

    const recent = await ledger.listRecent(5);
    expect(recent.map((item) => item.sessionId)).toEqual([
      "22222222-2222-2222-2222-222222222222",
      "11111111-1111-1111-1111-111111111111"
    ]);
  });
});
