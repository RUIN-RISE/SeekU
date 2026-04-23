import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  AgentSessionSnapshot,
  AgentSessionEvent,
  AgentTranscriptEntry
} from "./agent-session-events.js";
import {
  cloneAgentSessionEvent,
  createTranscriptEventEntry,
  createTranscriptMessageEntry
} from "./agent-session-events.js";
import type {
  AgentSessionStatus,
  AgentResumability,
  AgentResumeItemKind,
  AgentSessionTerminationReason,
  AgentSessionWhyCode
} from "./session-runtime-types.js";
import type { SearchWorkflow } from "./workflow.js";
import type { SeekuDatabase } from "@seeku/db";
import {
  getAgentSession,
  listRecentAgentSessions,
  upsertAgentSession
} from "@seeku/db";

export type CliSessionPosture = "active" | "stopped";

export interface PersistedCliResumeMeta {
  kind: AgentResumeItemKind;
  resumability: AgentResumability;
  status: AgentSessionStatus;
  statusSummary: string | null;
  primaryWhyCode?: AgentSessionWhyCode;
  whySummary: string | null;
  terminationReason?: AgentSessionTerminationReason;
  lastStatusAt?: string;
}

export interface PersistedCliSessionRecord {
  sessionId: string;
  origin: "cli";
  posture: CliSessionPosture;
  workItemId?: string | null;
  transcript: AgentTranscriptEntry[];
  latestSnapshot: AgentSessionSnapshot | null;
  createdAt: string;
  updatedAt: string;
  resumeMeta?: PersistedCliResumeMeta;
  cacheOnly?: boolean;
}

export interface PersistedCliSessionSummary {
  sessionId: string;
  updatedAt: string;
  posture: CliSessionPosture;
  resumeMeta?: PersistedCliResumeMeta;
  cacheOnly?: boolean;
}

interface DbAgentSessionRecord {
  sessionId: string;
  origin: "cli";
  posture: CliSessionPosture;
  workItemId?: string | null;
  transcript: Record<string, unknown>[];
  latestSnapshot: Record<string, unknown> | null;
  resumeMeta?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const WHY_CODES = new Set<AgentSessionWhyCode>([
  "awaiting_user_input",
  "goal_missing",
  "conditions_insufficient",
  "retrieval_zero_hits",
  "retrieval_all_weak",
  "recovery_clarify_anchor",
  "recovery_clarify_role",
  "recovery_clarify_skill",
  "recovery_rewrite",
  "recovery_budget_exhausted",
  "low_confidence_shortlist",
  "compare_refine_requested"
]);

const SESSION_STATUSES = new Set<AgentSessionStatus>([
  "idle",
  "clarifying",
  "searching",
  "recovering",
  "shortlist",
  "comparing",
  "waiting-input",
  "blocked",
  "completed"
]);

const SESSION_EVENT_TYPES = new Set<AgentSessionEvent["type"]>([
  "session_started",
  "status_changed",
  "goal_updated",
  "conditions_updated",
  "clarify_started",
  "search_started",
  "search_completed",
  "shortlist_updated",
  "compare_updated",
  "evidence_expanded",
  "confidence_updated",
  "recommendation_updated",
  "uncertainty_updated",
  "recovery_updated",
  "compare_started",
  "intervention_received",
  "intervention_applied",
  "intervention_rejected"
]);

const TERMINATION_REASONS = new Set<AgentSessionTerminationReason>([
  "completed",
  "user_exit",
  "interrupted",
  "crashed"
]);

function isRecoverableDbReadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return [
    "connection refused",
    "connect econnrefused",
    "econnrefused",
    "timeout",
    "timed out",
    "failed to connect",
    "could not connect",
    "does not exist",
    "relation \"agent_sessions\"",
    "column \"resume_meta\"",
    "no such table"
  ].some((pattern) => message.includes(pattern));
}

function coerceTranscriptEntry(entry: unknown): AgentTranscriptEntry | null {
  if (!isRecord(entry)) {
    return null;
  }

  if (entry.type === "event") {
    const event = coerceSessionEvent(entry.event);
    return event ? createTranscriptEventEntry(event) : null;
  }

  const id = typeof entry.id === "string" ? entry.id : "";
  const role = entry.role;
  const content = typeof entry.content === "string" ? entry.content : "";
  const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : "";

  if (!id || !timestamp || !content) {
    return null;
  }

  if (role !== "user" && role !== "assistant" && role !== "system") {
    return null;
  }

  return createTranscriptMessageEntry({
    id,
    role,
    content,
    timestamp
  });
}

function coerceTranscript(entries: unknown): AgentTranscriptEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry) => {
    const normalized = coerceTranscriptEntry(entry);
    return normalized ? [normalized] : [];
  });
}

function coerceSessionEvent(payload: unknown): AgentSessionEvent<Record<string, unknown>> | null {
  if (!isRecord(payload)) {
    return null;
  }

  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const sequence = typeof payload.sequence === "number" ? payload.sequence : Number.NaN;
  const timestamp = typeof payload.timestamp === "string" ? payload.timestamp : "";
  const type = typeof payload.type === "string" ? payload.type : "";
  const status = typeof payload.status === "string" ? payload.status : "";
  const summary = typeof payload.summary === "string" ? payload.summary : "";
  const data = isRecord(payload.data) ? payload.data : null;

  if (!sessionId || !Number.isFinite(sequence) || !timestamp || !summary || !data) {
    return null;
  }

  if (!SESSION_EVENT_TYPES.has(type as AgentSessionEvent["type"])) {
    return null;
  }

  if (!SESSION_STATUSES.has(status as AgentSessionStatus)) {
    return null;
  }

  return cloneAgentSessionEvent({
    sessionId,
    sequence,
    timestamp,
    type: type as AgentSessionEvent["type"],
    status: status as AgentSessionStatus,
    summary,
    data
  });
}

function coerceSnapshot(snapshot: unknown): AgentSessionSnapshot | null {
  if (!isRecord(snapshot)) {
    return null;
  }

  const sessionId = typeof snapshot.sessionId === "string" ? snapshot.sessionId : "";
  const runtime = isRecord(snapshot.runtime)
    ? snapshot.runtime
    : {
        status: snapshot.status,
        statusSummary: snapshot.statusSummary,
        primaryWhyCode: undefined,
        whyCodes: [],
        whySummary: null,
        terminationReason: undefined,
        lastStatusAt: typeof snapshot.updatedAt === "string"
          ? snapshot.updatedAt
          : new Date(0).toISOString()
      };
  const status = typeof runtime.status === "string" ? runtime.status : "";
  if (!sessionId || !status) {
    return null;
  }

  if (!SESSION_STATUSES.has(status as AgentSessionStatus)) {
    return null;
  }

  const normalizedRuntime = {
    status: status as AgentSessionStatus,
    statusSummary: typeof runtime.statusSummary === "string" ? runtime.statusSummary : null,
    primaryWhyCode:
      typeof runtime.primaryWhyCode === "string" && WHY_CODES.has(runtime.primaryWhyCode as AgentSessionWhyCode)
        ? runtime.primaryWhyCode as AgentSessionWhyCode
        : undefined,
    whyCodes: Array.isArray(runtime.whyCodes)
      ? runtime.whyCodes.filter((value): value is AgentSessionWhyCode =>
          typeof value === "string" && WHY_CODES.has(value as AgentSessionWhyCode))
      : [],
    whySummary: typeof runtime.whySummary === "string" ? runtime.whySummary : null,
    terminationReason:
      typeof runtime.terminationReason === "string" && TERMINATION_REASONS.has(runtime.terminationReason as AgentSessionTerminationReason)
        ? runtime.terminationReason as AgentSessionTerminationReason
        : undefined,
    lastStatusAt: typeof runtime.lastStatusAt === "string" ? runtime.lastStatusAt : new Date(0).toISOString()
  };

  return {
    ...(snapshot as unknown as AgentSessionSnapshot),
    runtime: normalizedRuntime
  };
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
    workItemId: typeof payload.workItemId === "string" ? payload.workItemId : null,
    transcript: coerceTranscript(payload.transcript),
    latestSnapshot: coerceSnapshot(payload.latestSnapshot),
    createdAt,
    updatedAt,
    resumeMeta: coerceResumeMeta(payload.resumeMeta),
    cacheOnly: payload.cacheOnly === true
  };
}

function coerceResumeMeta(payload: unknown): PersistedCliResumeMeta | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const status = typeof payload.status === "string" ? payload.status : "";
  if (!status || !SESSION_STATUSES.has(status as AgentSessionStatus)) {
    return undefined;
  }

  return {
    kind: typeof payload.kind === "string" ? payload.kind as AgentResumeItemKind : "recent_session",
    resumability: typeof payload.resumability === "string" ? payload.resumability as AgentResumability : "read_only",
    status: status as AgentSessionStatus,
    statusSummary: typeof payload.statusSummary === "string" ? payload.statusSummary : null,
    primaryWhyCode:
      typeof payload.primaryWhyCode === "string" && WHY_CODES.has(payload.primaryWhyCode as AgentSessionWhyCode)
        ? payload.primaryWhyCode as AgentSessionWhyCode
        : undefined,
    whySummary: typeof payload.whySummary === "string" ? payload.whySummary : null,
    terminationReason:
      typeof payload.terminationReason === "string" && TERMINATION_REASONS.has(payload.terminationReason as AgentSessionTerminationReason)
        ? payload.terminationReason as AgentSessionTerminationReason
        : undefined,
    lastStatusAt: typeof payload.lastStatusAt === "string" ? payload.lastStatusAt : undefined
  };
}

function defaultCacheDir() {
  return path.join(os.homedir(), ".seeku", "sessions");
}

function serializeWorkflowRecord(
  workflow: SearchWorkflow,
  posture: CliSessionPosture,
  existing?: PersistedCliSessionRecord | null,
  options: {
    terminationReason?: AgentSessionTerminationReason;
  } = {}
): PersistedCliSessionRecord {
  const now = new Date().toISOString();
  const latestSnapshot = withTerminationReason(workflow.getSessionSnapshot(), options.terminationReason);
  return {
    sessionId: workflow.getSessionId(),
    origin: "cli",
    posture,
    workItemId: workflow.getWorkItemId() ?? existing?.workItemId ?? null,
    transcript: workflow.getTranscript(),
    latestSnapshot,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    resumeMeta: deriveResumeMeta(latestSnapshot, posture)
  };
}

function withTerminationReason(
  snapshot: AgentSessionSnapshot,
  terminationReason?: AgentSessionTerminationReason
): AgentSessionSnapshot {
  if (!terminationReason) {
    return snapshot;
  }

  return {
    ...snapshot,
    runtime: {
      ...snapshot.runtime,
      terminationReason
    }
  };
}

function deriveResumability(
  snapshot: AgentSessionSnapshot | null,
  posture: CliSessionPosture
): AgentResumability {
  const reason = snapshot?.runtime.terminationReason;
  const status = snapshot?.runtime.status;

  if (reason === "interrupted" || reason === "crashed") {
    return "resumable";
  }

  if (reason === "completed") {
    return "read_only";
  }

  if (reason === "user_exit") {
    return snapshot && status !== "completed" ? "resumable" : "read_only";
  }

  if (posture === "active" && snapshot && status !== "completed") {
    return "resumable";
  }

  return "read_only";
}

function deriveResumeItemKind(
  snapshot: AgentSessionSnapshot | null,
  posture: CliSessionPosture,
  resumability: AgentResumability
): AgentResumeItemKind {
  const reason = snapshot?.runtime.terminationReason;

  if (resumability === "resumable" && (reason === "interrupted" || reason === "crashed" || posture === "active")) {
    return "interrupted_work_item";
  }

  if (posture === "stopped") {
    return "stopped_session";
  }

  return "recent_session";
}

function deriveResumeMeta(
  snapshot: AgentSessionSnapshot | null,
  posture: CliSessionPosture
): PersistedCliResumeMeta | undefined {
  if (!snapshot) {
    return undefined;
  }

  const resumability = deriveResumability(snapshot, posture);
  return {
    kind: deriveResumeItemKind(snapshot, posture, resumability),
    resumability,
    status: snapshot.runtime.status,
    statusSummary: snapshot.runtime.statusSummary,
    primaryWhyCode: snapshot.runtime.primaryWhyCode,
    whySummary: snapshot.runtime.whySummary,
    terminationReason: snapshot.runtime.terminationReason,
    lastStatusAt: snapshot.runtime.lastStatusAt
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

  async saveToCache(record: PersistedCliSessionRecord) {
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
    const enrichedRecord: PersistedCliSessionRecord = {
      ...record,
      resumeMeta: record.resumeMeta ?? deriveResumeMeta(record.latestSnapshot, record.posture)
    };

    if (!this.options.db) {
      await this.saveToCache(enrichedRecord);
      return { ...enrichedRecord, cacheOnly: true };
    }

    await upsertAgentSession(this.options.db, {
      sessionId: enrichedRecord.sessionId,
      origin: "cli",
      posture: enrichedRecord.posture,
      workItemId: enrichedRecord.workItemId ?? null,
      transcript: enrichedRecord.transcript as unknown as Record<string, unknown>[],
      latestSnapshot: enrichedRecord.latestSnapshot as unknown as Record<string, unknown> | null,
      resumeMeta: enrichedRecord.resumeMeta as unknown as Record<string, unknown> | null | undefined
    } as any);

    try {
      await this.saveToCache(enrichedRecord);
    } catch {
      // Cache write failure does not invalidate a successful DB-backed save.
    }

    return enrichedRecord;
  }

  async saveWorkflow(
    workflow: SearchWorkflow,
    posture: CliSessionPosture,
    options: {
      terminationReason?: AgentSessionTerminationReason;
    } = {}
  ) {
    const existing = await this.load(workflow.getSessionId());
    const record = serializeWorkflowRecord(workflow, posture, existing, options);
    return this.save(record);
  }

  async load(sessionId: string): Promise<PersistedCliSessionRecord | null> {
    if (this.options.db) {
      try {
        const record = await getAgentSession(this.options.db, sessionId) as DbAgentSessionRecord | null;
        if (record && record.origin === "cli") {
          const snapshot = coerceSnapshot(record.latestSnapshot);
          return {
            sessionId: record.sessionId,
            origin: "cli",
            posture: record.posture,
            workItemId: record.workItemId ?? null,
            transcript: coerceTranscript(record.transcript),
            latestSnapshot: snapshot,
            createdAt: record.createdAt.toISOString(),
            updatedAt: record.updatedAt.toISOString(),
            resumeMeta: coerceResumeMeta(record.resumeMeta) ?? deriveResumeMeta(snapshot, record.posture)
          };
        }

        if (record) {
          return null;
        }
      } catch (error) {
        if (!isRecoverableDbReadError(error)) {
          throw error;
        }
      }
    }

    return this.loadFromCache(sessionId);
  }

  async listRecent(limit = 8): Promise<PersistedCliSessionSummary[]> {
    if (this.options.db) {
      try {
        const records = await listRecentAgentSessions(this.options.db, limit) as DbAgentSessionRecord[];
        const cliRecords = records.filter((record) => record.origin === "cli");
        if (cliRecords.length > 0) {
          return cliRecords.map((record) => ({
            sessionId: record.sessionId,
            updatedAt: record.updatedAt.toISOString(),
            posture: record.posture,
            resumeMeta: coerceResumeMeta(record.resumeMeta)
          }));
        }
      } catch (error) {
        if (!isRecoverableDbReadError(error)) {
          throw error;
        }
      }
    }

    const records = await this.listFromCache(limit);
    return records.map((record) => ({
      sessionId: record.sessionId,
      updatedAt: record.updatedAt,
      posture: record.posture,
      resumeMeta: record.resumeMeta,
      cacheOnly: true
    }));
  }
}
