import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  AgentSessionSnapshot,
  AgentTranscriptEntry
} from "./agent-session-events.js";
import type { SearchWorkflow } from "./workflow.js";
import type { SeekuDatabase } from "@seeku/db";
import {
  getAgentSession,
  listRecentAgentSessions,
  upsertAgentSession
} from "@seeku/db";

export type CliSessionPosture = "active" | "stopped";

export interface PersistedCliSessionRecord {
  sessionId: string;
  origin: "cli";
  posture: CliSessionPosture;
  transcript: AgentTranscriptEntry[];
  latestSnapshot: AgentSessionSnapshot | null;
  createdAt: string;
  updatedAt: string;
  cacheOnly?: boolean;
}

export interface PersistedCliSessionSummary {
  sessionId: string;
  updatedAt: string;
  posture: CliSessionPosture;
  cacheOnly?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceTranscript(entries: unknown): AgentTranscriptEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = typeof entry.id === "string" ? entry.id : "";
    const role = entry.role;
    const content = typeof entry.content === "string" ? entry.content : "";
    const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : "";

    if (!id || !timestamp || !content) {
      return [];
    }

    if (role !== "user" && role !== "assistant" && role !== "system") {
      return [];
    }

    return [{
      id,
      role,
      content,
      timestamp
    }];
  });
}

function coerceSnapshot(snapshot: unknown): AgentSessionSnapshot | null {
  if (!isRecord(snapshot)) {
    return null;
  }

  const sessionId = typeof snapshot.sessionId === "string" ? snapshot.sessionId : "";
  const status = typeof snapshot.status === "string" ? snapshot.status : "";
  if (!sessionId || !status) {
    return null;
  }

  return snapshot as unknown as AgentSessionSnapshot;
}

function coercePersistedRecord(payload: unknown): PersistedCliSessionRecord | null {
  if (!isRecord(payload)) {
    return null;
  }

  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const origin = payload.origin === "cli" ? "cli" : null;
  const posture = payload.posture === "active" || payload.posture === "stopped"
    ? payload.posture
    : null;
  const createdAt = typeof payload.createdAt === "string" ? payload.createdAt : "";
  const updatedAt = typeof payload.updatedAt === "string" ? payload.updatedAt : "";

  if (!sessionId || !origin || !posture || !createdAt || !updatedAt) {
    return null;
  }

  return {
    sessionId,
    origin,
    posture,
    transcript: coerceTranscript(payload.transcript),
    latestSnapshot: coerceSnapshot(payload.latestSnapshot),
    createdAt,
    updatedAt,
    cacheOnly: payload.cacheOnly === true
  };
}

function defaultCacheDir() {
  return path.join(os.homedir(), ".seeku", "sessions");
}

function serializeWorkflowRecord(
  workflow: SearchWorkflow,
  posture: CliSessionPosture,
  existing?: PersistedCliSessionRecord | null
): PersistedCliSessionRecord {
  const now = new Date().toISOString();
  return {
    sessionId: workflow.getSessionId(),
    origin: "cli",
    posture,
    transcript: workflow.getTranscript(),
    latestSnapshot: workflow.getSessionSnapshot(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

export class CliSessionLedger {
  constructor(
    private readonly options: {
      db?: SeekuDatabase;
      cacheDir?: string;
    } = {}
  ) {}

  private get cacheDir() {
    return this.options.cacheDir ?? defaultCacheDir();
  }

  private getCachePath(sessionId: string) {
    return path.join(this.cacheDir, `${sessionId}.json`);
  }

  private async ensureCacheDir() {
    await mkdir(this.cacheDir, { recursive: true });
  }

  private async saveToCache(record: PersistedCliSessionRecord) {
    await this.ensureCacheDir();
    await writeFile(this.getCachePath(record.sessionId), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  private async loadFromCache(sessionId: string): Promise<PersistedCliSessionRecord | null> {
    try {
      const content = await readFile(this.getCachePath(sessionId), "utf8");
      const parsed = JSON.parse(content) as unknown;
      const record = coercePersistedRecord(parsed);
      if (!record) {
        return null;
      }

      return {
        ...record,
        cacheOnly: true
      };
    } catch {
      return null;
    }
  }

  private async listFromCache(limit: number): Promise<PersistedCliSessionRecord[]> {
    try {
      await this.ensureCacheDir();
      const entries = await readdir(this.cacheDir, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name);

      const records = await Promise.all(
        files.map(async (fileName) => {
          try {
            const content = await readFile(path.join(this.cacheDir, fileName), "utf8");
            const parsed = JSON.parse(content) as unknown;
            return coercePersistedRecord(parsed);
          } catch {
            return null;
          }
        })
      );

      return records
        .filter((record): record is PersistedCliSessionRecord => Boolean(record))
        .map((record) => ({ ...record, cacheOnly: true }))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  async save(record: PersistedCliSessionRecord) {
    await this.saveToCache(record);

    if (!this.options.db) {
      return record;
    }

    try {
      await upsertAgentSession(this.options.db, {
        sessionId: record.sessionId,
        origin: "cli",
        posture: record.posture,
        transcript: record.transcript as unknown as Record<string, unknown>[],
        latestSnapshot: record.latestSnapshot as unknown as Record<string, unknown> | null
      });
    } catch {
      // Database persistence is best-effort in the first batch.
      // Local cache remains the safety net when migrations are not applied yet.
    }

    return record;
  }

  async saveWorkflow(workflow: SearchWorkflow, posture: CliSessionPosture) {
    const existing = await this.load(workflow.getSessionId());
    const record = serializeWorkflowRecord(workflow, posture, existing);
    return this.save(record);
  }

  async load(sessionId: string): Promise<PersistedCliSessionRecord | null> {
    if (this.options.db) {
      try {
        const record = await getAgentSession(this.options.db, sessionId);
        if (record && record.origin === "cli") {
          return {
            sessionId: record.sessionId,
            origin: "cli",
            posture: record.posture,
            transcript: coerceTranscript(record.transcript),
            latestSnapshot: coerceSnapshot(record.latestSnapshot),
            createdAt: record.createdAt.toISOString(),
            updatedAt: record.updatedAt.toISOString()
          };
        }
      } catch {
        // Fall through to cache if DB is unavailable or unmigrated.
      }
    }

    return this.loadFromCache(sessionId);
  }

  async listRecent(limit = 8): Promise<PersistedCliSessionSummary[]> {
    if (this.options.db) {
      try {
        const records = await listRecentAgentSessions(this.options.db, limit);
        return records
          .filter((record: { origin: string }) => record.origin === "cli")
          .map((record: { sessionId: string; updatedAt: Date; posture: CliSessionPosture }) => ({
            sessionId: record.sessionId,
            updatedAt: record.updatedAt.toISOString(),
            posture: record.posture
          }));
      } catch {
        // Fall through to cache.
      }
    }

    const records = await this.listFromCache(limit);
    return records.map((record) => ({
      sessionId: record.sessionId,
      updatedAt: record.updatedAt,
      posture: record.posture,
      cacheOnly: true
    }));
  }
}
