import type {
  AgentResumeItemKind,
  AgentResumability
} from "./session-runtime-types.js";
import type {
  CliSessionLedger,
  PersistedCliSessionRecord,
  PersistedCliResumeMeta
} from "./session-ledger.js";

export interface ResumePanelItem {
  sessionId: string;
  label: string;
  kind: AgentResumeItemKind;
  resumability: AgentResumability;
  priority: number;
  updatedAt: string;
  status: string;
  statusSummary: string | null;
  primaryWhyCode?: string;
  whySummary: string | null;
  terminationReason?: string;
  cacheOnly?: boolean;
  record: PersistedCliSessionRecord;
}

export interface ResumeResolution {
  items: ResumePanelItem[];
  defaultSelection?: string;
}

function getPriority(
  kind: AgentResumeItemKind,
  resumability: AgentResumability
): number {
  if (resumability === "resumable" && kind === "interrupted_work_item") {
    return 400;
  }

  if (resumability === "resumable" && kind === "stopped_session") {
    return 300;
  }

  if (resumability === "read_only" && kind === "stopped_session") {
    return 200;
  }

  if (kind === "recent_session") {
    return 100;
  }

  return 0;
}

function getResumeMeta(record: PersistedCliSessionRecord): PersistedCliResumeMeta | undefined {
  if (record.resumeMeta) {
    return record.resumeMeta;
  }

  const snapshot = record.latestSnapshot;
  const reason = snapshot?.runtime.terminationReason;
  const status = snapshot?.runtime.status;
  let resumability: AgentResumability;

  if (reason === "interrupted" || reason === "crashed") {
    resumability = "resumable";
  } else if (reason === "completed") {
    resumability = "read_only";
  } else if (reason === "user_exit") {
    resumability = snapshot && status !== "completed" ? "resumable" : "read_only";
  } else if (record.posture === "active" && snapshot && status !== "completed") {
    resumability = "resumable";
  } else {
    resumability = "read_only";
  }

  let kind: AgentResumeItemKind;
  if (resumability === "resumable" && (reason === "interrupted" || reason === "crashed" || record.posture === "active")) {
    kind = "interrupted_work_item";
  } else if (record.posture === "stopped") {
    kind = "stopped_session";
  } else {
    kind = "recent_session";
  }

  if (!snapshot) {
    return undefined;
  }

  return {
    kind,
    resumability,
    status: snapshot.runtime.status,
    statusSummary: snapshot.runtime.statusSummary,
    primaryWhyCode: snapshot.runtime.primaryWhyCode,
    whySummary: snapshot.runtime.whySummary,
    terminationReason: snapshot.runtime.terminationReason,
    lastStatusAt: snapshot.runtime.lastStatusAt
  };
}

export function deriveResumability(
  record: PersistedCliSessionRecord
): AgentResumability {
  return getResumeMeta(record)?.resumability ?? "read_only";
}

export function deriveResumeItemKind(
  record: PersistedCliSessionRecord
): AgentResumeItemKind {
  return getResumeMeta(record)?.kind ?? "recent_session";
}

function buildLabel(record: PersistedCliSessionRecord): string {
  const resumeMeta = getResumeMeta(record);
  if (!resumeMeta) {
    return "无运行时快照";
  }

  return resumeMeta.statusSummary || resumeMeta.whySummary || "无状态摘要";
}

export function toResumePanelItem(
  record: PersistedCliSessionRecord
): ResumePanelItem {
  const runtime = record.latestSnapshot?.runtime;
  const resumeMeta = getResumeMeta(record);
  const kind = resumeMeta?.kind ?? "recent_session";
  const resumability = resumeMeta?.resumability ?? "read_only";

  return {
    sessionId: record.sessionId,
    label: buildLabel(record),
    kind,
    resumability,
    priority: getPriority(kind, resumability),
    updatedAt: record.updatedAt,
    status: resumeMeta?.status ?? runtime?.status ?? "unknown",
    statusSummary: resumeMeta?.statusSummary ?? runtime?.statusSummary ?? null,
    primaryWhyCode: resumeMeta?.primaryWhyCode ?? runtime?.primaryWhyCode,
    whySummary: resumeMeta?.whySummary ?? runtime?.whySummary ?? null,
    terminationReason: resumeMeta?.terminationReason ?? runtime?.terminationReason,
    cacheOnly: record.cacheOnly,
    record
  };
}

export function sortResumePanelItems(items: ResumePanelItem[]): ResumePanelItem[] {
  return [...items].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export async function resolveResumeItems(
  ledger: CliSessionLedger,
  limit = 8
): Promise<ResumeResolution> {
  const summaries = await ledger.listRecent(limit);
  const records = await Promise.all(
    summaries.map((summary) => ledger.load(summary.sessionId))
  );
  const items = sortResumePanelItems(
    records
      .filter((record): record is PersistedCliSessionRecord => Boolean(record))
      .map(toResumePanelItem)
  );

  return {
    items,
    defaultSelection: items[0]?.sessionId
  };
}
