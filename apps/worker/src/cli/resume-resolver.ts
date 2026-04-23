/**
 * Resume resolver — builds task-centric resume panel items.
 *
 * B5 re-architecture: consumes B2 TaskProgress + B3 NextBestAction to
 * produce TaskResumeItems sorted by work-item-centric ranking.
 *
 * Three item kinds:
 * - work_item: session has workItemId and work item loaded successfully
 * - degraded_work_item: session has workItemId but work item not found
 * - legacy_session: session has no workItemId (pre-B1 data)
 */

import type { AgentResumability } from "./session-runtime-types.js";
import type {
  CliSessionLedger,
  PersistedCliSessionRecord,
  PersistedCliResumeMeta
} from "./session-ledger.js";
import type { TaskResumeItem, TaskResumeItemKind } from "./resume-panel-types.js";
import { compareResumeItems, rankResumeItem } from "./resume-panel-types.js";
import type { TaskStage, TaskBlockerReason } from "./task-progress-types.js";
import { deriveTaskProgress } from "./task-progress-derivation.js";
import { deriveNextBestAction } from "./next-best-action.js";
import { formatTaskStageLabel, formatBlockerLabel } from "./workboard-view-model.js";
import type { WorkItemStore } from "./work-item-store.js";
import type { WorkItemRecord } from "./work-item-types.js";

// ============================================================================
// Legacy Types (preserved for backward compatibility — B5 replaced these)
// ============================================================================

import type {
  AgentResumeItemKind,
} from "./session-runtime-types.js";

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

// ============================================================================
// Legacy Helpers (still needed for preview/resume flow)
// ============================================================================

const LEGACY_PRIORITY: Record<AgentResumeItemKind, Record<AgentResumability, number>> = {
  interrupted_work_item: { resumable: 400, read_only: 0, not_resumable: 0 },
  stopped_session: { resumable: 300, read_only: 200, not_resumable: 0 },
  recent_session: { resumable: 100, read_only: 100, not_resumable: 0 },
  new_session: { resumable: 0, read_only: 0, not_resumable: 0 }
};

function getLegacyPriority(kind: AgentResumeItemKind, resumability: AgentResumability): number {
  return LEGACY_PRIORITY[kind]?.[resumability] ?? 0;
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

function buildLegacyLabel(record: PersistedCliSessionRecord): string {
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
    label: buildLegacyLabel(record),
    kind,
    resumability,
    priority: getLegacyPriority(kind, resumability),
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

// ============================================================================
// Task-Centric Item Builder
// ============================================================================

function deriveResumabilityFromRecord(record: PersistedCliSessionRecord): AgentResumability {
  return getResumeMeta(record)?.resumability ?? "read_only";
}

function deriveTitleFromSnapshot(record: PersistedCliSessionRecord): string {
  const goal = record.latestSnapshot?.userGoal;
  if (goal) return goal;
  return `Session ${record.sessionId.slice(0, 8)}`;
}

function buildTaskResumeItem(args: {
  record: PersistedCliSessionRecord;
  workItem: WorkItemRecord | null;
}): TaskResumeItem {
  const { record, workItem } = args;
  const snapshot = record.latestSnapshot;
  const resumeMeta = record.resumeMeta;
  const resumability = deriveResumabilityFromRecord(record);

  const progress = deriveTaskProgress({ workItem, snapshot, resumeMeta });
  const action = deriveNextBestAction({ taskProgress: progress, workItem, snapshot, resumeMeta });

  const title = workItem?.title || workItem?.goalSummary || deriveTitleFromSnapshot(record);

  return {
    kind: "work_item",
    sessionId: record.sessionId,
    workItemId: workItem?.id ?? record.workItemId ?? undefined,
    title,
    subtitle: formatTaskStageLabel(progress.stage),
    stage: progress.stage,
    blocked: progress.blocked,
    blockerLabel: progress.blocked && progress.blockerReason
      ? formatBlockerLabel(progress.blockerReason)
      : undefined,
    nextActionTitle: action.title,
    updatedAt: record.updatedAt,
    resumability,
    sourceLabel: progress.derivedFrom,
    record,
    cacheOnly: record.cacheOnly
  };
}

function buildDegradedTaskResumeItem(record: PersistedCliSessionRecord): TaskResumeItem {
  const snapshot = record.latestSnapshot;
  const resumeMeta = record.resumeMeta;
  const resumability = deriveResumabilityFromRecord(record);

  const progress = deriveTaskProgress({ workItem: null, snapshot, resumeMeta });
  const action = deriveNextBestAction({ taskProgress: progress, workItem: null, snapshot, resumeMeta });

  return {
    kind: "degraded_work_item",
    sessionId: record.sessionId,
    workItemId: record.workItemId ?? undefined,
    title: deriveTitleFromSnapshot(record),
    subtitle: `${formatTaskStageLabel(progress.stage)} · 工作项关联丢失`,
    stage: progress.stage,
    blocked: progress.blocked,
    blockerLabel: progress.blocked && progress.blockerReason
      ? formatBlockerLabel(progress.blockerReason)
      : undefined,
    nextActionTitle: action.title,
    updatedAt: record.updatedAt,
    resumability,
    sourceLabel: progress.derivedFrom,
    record,
    cacheOnly: record.cacheOnly
  };
}

function buildLegacyTaskResumeItem(record: PersistedCliSessionRecord): TaskResumeItem {
  const snapshot = record.latestSnapshot;
  const resumeMeta = record.resumeMeta;
  const resumability = deriveResumabilityFromRecord(record);

  const progress = deriveTaskProgress({ workItem: null, snapshot, resumeMeta });
  const action = deriveNextBestAction({ taskProgress: progress, workItem: null, snapshot, resumeMeta });

  return {
    kind: "legacy_session",
    sessionId: record.sessionId,
    title: deriveTitleFromSnapshot(record),
    subtitle: `${formatTaskStageLabel(progress.stage)} · legacy session`,
    stage: progress.stage,
    blocked: progress.blocked,
    blockerLabel: progress.blocked && progress.blockerReason
      ? formatBlockerLabel(progress.blockerReason)
      : undefined,
    nextActionTitle: action.title,
    updatedAt: record.updatedAt,
    resumability,
    sourceLabel: progress.derivedFrom,
    record,
    cacheOnly: record.cacheOnly
  };
}

// ============================================================================
// Task-Centric Resolution
// ============================================================================

export interface TaskResumeResolution {
  items: TaskResumeItem[];
  defaultSelection?: string;
}

export async function resolveTaskResumeItems(
  ledger: CliSessionLedger,
  workItemStore: WorkItemStore | null,
  displayLimit = 8
): Promise<TaskResumeResolution> {
  // Fetch a wider window so B5 ranking can surface older-but-important items
  // that would be pre-trimmed by a recency-only DB query.
  const fetchLimit = Math.max(displayLimit * 4, 32);
  const summaries = await ledger.listRecent(fetchLimit);
  const records = await Promise.all(
    summaries.map((summary) => ledger.load(summary.sessionId))
  );

  const items: TaskResumeItem[] = await Promise.all(
    records
      .filter((record): record is PersistedCliSessionRecord => Boolean(record))
      .map(async (record) => {
        // Work-item-backed session.
        if (record.workItemId && workItemStore) {
          try {
            const workItem = await workItemStore.get(record.workItemId);
            if (workItem) {
              return buildTaskResumeItem({ record, workItem });
            }
          } catch {
            // DB error — fall through to degraded.
          }
          return buildDegradedTaskResumeItem(record);
        }

        // Session has workItemId but no store available — degraded.
        if (record.workItemId) {
          return buildDegradedTaskResumeItem(record);
        }

        // Legacy session.
        return buildLegacyTaskResumeItem(record);
      })
  );

  const sorted = [...items].sort(compareResumeItems).slice(0, displayLimit);

  return {
    items: sorted,
    defaultSelection: sorted[0]?.sessionId
  };
}

// ============================================================================
// Legacy Sorting (preserved for backward compatibility — B5 replaced these)
// ============================================================================

export function sortResumePanelItems(items: ResumePanelItem[]): ResumePanelItem[] {
  return [...items].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

// ============================================================================
// Legacy Resolution (preserved for backward compatibility — B5 replaced these)
// ============================================================================

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
