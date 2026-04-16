export const AGENT_PANEL_EVENT_TYPES = [
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
  "compare_started",
  "intervention_received",
  "intervention_applied",
  "intervention_rejected"
] as const;

export type AgentPanelEventType = typeof AGENT_PANEL_EVENT_TYPES[number];

export type AgentPanelConnectionStatus =
  | "connecting"
  | "live"
  | "disconnected"
  | "missing"
  | "error";

export type AgentPanelSessionStatus =
  | "idle"
  | "clarifying"
  | "searching"
  | "shortlist"
  | "comparing"
  | "waiting-input"
  | "blocked"
  | "completed";

export type AgentPanelInterventionType =
  | "add_to_compare"
  | "remove_from_shortlist"
  | "expand_evidence"
  | "apply_feedback";

export interface AgentPanelCandidateProfile {
  overallScore?: number;
  summary?: string;
  highlights?: string[];
  dimensions?: Record<string, number>;
}

export interface AgentPanelCandidateSnapshot {
  personId: string;
  name: string;
  headline?: string | null;
  location?: string | null;
  company?: string | null;
  experienceYears?: number | null;
  matchScore: number;
  profile?: AgentPanelCandidateProfile;
  queryReasons?: string[];
  sources: string[];
  primaryLinks?: Array<Record<string, unknown>>;
  lastSyncedAt?: string;
  latestEvidenceAt?: string;
}

export interface AgentPanelSearchConditions {
  skills: string[];
  locations: string[];
  experience?: string;
  role?: string;
  sourceBias?: string;
  mustHave: string[];
  niceToHave: string[];
  exclude: string[];
  preferFresh: boolean;
  candidateAnchor?: Record<string, unknown>;
  limit: number;
}

export interface AgentPanelConfidenceStatus {
  level: "high" | "medium" | "low";
  rationale?: string;
  updatedAt: string;
}

export interface AgentPanelSearchHistoryEntry {
  conditions: AgentPanelSearchConditions;
  resultCount: number;
  timestamp: string;
}

export interface AgentPanelRecommendation {
  candidate: AgentPanelCandidateSnapshot;
  rationale?: string;
  createdAt: string;
  confidenceLevel: "high" | "medium";
}

export interface AgentPanelSessionSnapshot {
  sessionId: string;
  status: AgentPanelSessionStatus;
  statusSummary: string | null;
  userGoal: string | null;
  currentConditions: AgentPanelSearchConditions;
  currentShortlist: AgentPanelCandidateSnapshot[];
  activeCompareSet: AgentPanelCandidateSnapshot[];
  confidenceStatus: AgentPanelConfidenceStatus;
  recommendedCandidate: AgentPanelRecommendation | null;
  openUncertainties: string[];
  clarificationCount: number;
  searchHistory: AgentPanelSearchHistoryEntry[];
}

export interface AgentPanelSessionEvent<TData = Record<string, unknown>> {
  sessionId: string;
  sequence: number;
  timestamp: string;
  type: AgentPanelEventType;
  status: AgentPanelSessionStatus;
  summary: string;
  data: TData;
}

export interface AgentPanelInterventionCommand {
  type: AgentPanelInterventionType;
  candidateId?: string;
  tag?: string;
}

export interface AgentPanelInterventionApiResponse {
  ok?: boolean;
  error?: string;
  reason?: string;
  summary?: string;
  snapshot?: AgentPanelSessionSnapshot;
}

export interface AgentPanelNotice {
  kind: "success" | "error" | "info";
  message: string;
}

export interface AgentPanelState {
  sessionId: string;
  snapshot: AgentPanelSessionSnapshot | null;
  events: AgentPanelSessionEvent[];
  connectionStatus: AgentPanelConnectionStatus;
  expandedCandidateId: string | null;
  latestNotice: AgentPanelNotice | null;
  errorMessage: string | null;
}

export const FEEDBACK_TAG_OPTIONS = [
  {
    tag: "more_engineering_manager",
    label: "更偏工程经理",
    description: "收敛到更强的工程管理画像。"
  },
  {
    tag: "less_academic",
    label: "减少学术导向",
    description: "降低偏学术背景候选人的权重。"
  },
  {
    tag: "more_hands_on_builder",
    label: "更偏亲手做事",
    description: "强调 builder 气质与一线执行。"
  },
  {
    tag: "prefer_recent_execution",
    label: "优先近期执行",
    description: "更看重最近一段时间的活跃证据。"
  }
] as const;

function candidateIds(candidates: AgentPanelCandidateSnapshot[]): Set<string> {
  return new Set(candidates.map((candidate) => candidate.personId));
}

function normalizeExpandedCandidateId(
  snapshot: AgentPanelSessionSnapshot | null,
  expandedCandidateId: string | null
): string | null {
  if (!snapshot || !expandedCandidateId) {
    return null;
  }

  const shortlistIds = candidateIds(snapshot.currentShortlist);
  const compareIds = candidateIds(snapshot.activeCompareSet);
  return shortlistIds.has(expandedCandidateId) || compareIds.has(expandedCandidateId)
    ? expandedCandidateId
    : null;
}

function mergeEventLog(
  events: AgentPanelSessionEvent[],
  nextEvent: AgentPanelSessionEvent
): AgentPanelSessionEvent[] {
  if (events.some((event) => event.sequence === nextEvent.sequence)) {
    return events;
  }

  return [...events, nextEvent]
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-80);
}

function applySnapshotPatch(
  snapshot: AgentPanelSessionSnapshot,
  event: AgentPanelSessionEvent
): AgentPanelSessionSnapshot {
  const data = (event.data ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case "status_changed":
      return {
        ...snapshot,
        status: event.status,
        statusSummary:
          typeof data.statusSummary === "string" || data.statusSummary === null
            ? (data.statusSummary as string | null)
            : snapshot.statusSummary
      };
    case "goal_updated":
      return {
        ...snapshot,
        userGoal:
          typeof data.userGoal === "string" || data.userGoal === null
            ? (data.userGoal as string | null)
            : snapshot.userGoal
      };
    case "conditions_updated":
      return {
        ...snapshot,
        currentConditions: (data.conditions as AgentPanelSearchConditions) ?? snapshot.currentConditions
      };
    case "shortlist_updated":
      return {
        ...snapshot,
        currentShortlist: (data.shortlist as AgentPanelCandidateSnapshot[]) ?? snapshot.currentShortlist
      };
    case "compare_updated":
      return {
        ...snapshot,
        activeCompareSet: (data.compareSet as AgentPanelCandidateSnapshot[]) ?? snapshot.activeCompareSet
      };
    case "confidence_updated":
      return {
        ...snapshot,
        confidenceStatus:
          (data.confidenceStatus as AgentPanelConfidenceStatus) ?? snapshot.confidenceStatus
      };
    case "recommendation_updated":
      return {
        ...snapshot,
        recommendedCandidate:
          (data.recommendedCandidate as AgentPanelRecommendation | null | undefined)
            ?? snapshot.recommendedCandidate
      };
    case "uncertainty_updated":
      return {
        ...snapshot,
        openUncertainties:
          (data.openUncertainties as string[] | undefined) ?? snapshot.openUncertainties
      };
    default:
      return snapshot;
  }
}

export function createInitialAgentPanelState(sessionId: string): AgentPanelState {
  return {
    sessionId,
    snapshot: null,
    events: [],
    connectionStatus: "connecting",
    expandedCandidateId: null,
    latestNotice: null,
    errorMessage: null
  };
}

export function applyAgentPanelSnapshot(
  state: AgentPanelState,
  snapshot: AgentPanelSessionSnapshot,
  options: {
    connectionStatus?: AgentPanelConnectionStatus;
    latestNotice?: AgentPanelNotice | null;
    errorMessage?: string | null;
  } = {}
): AgentPanelState {
  return {
    ...state,
    sessionId: snapshot.sessionId,
    snapshot,
    connectionStatus: options.connectionStatus ?? state.connectionStatus,
    latestNotice: options.latestNotice === undefined ? state.latestNotice : options.latestNotice,
    errorMessage: options.errorMessage === undefined ? state.errorMessage : options.errorMessage,
    expandedCandidateId: normalizeExpandedCandidateId(snapshot, state.expandedCandidateId)
  };
}

export function applyAgentPanelEvent(
  state: AgentPanelState,
  event: AgentPanelSessionEvent
): AgentPanelState {
  const nextSnapshot = state.snapshot
    ? applySnapshotPatch(state.snapshot, event)
    : state.snapshot;
  const eventData = (event.data ?? {}) as Record<string, unknown>;
  const expandedCandidateId =
    event.type === "evidence_expanded"
      ? ((eventData.candidate as AgentPanelCandidateSnapshot | undefined)?.personId
        ?? state.expandedCandidateId)
      : state.expandedCandidateId;

  return {
    ...state,
    snapshot: nextSnapshot,
    events: mergeEventLog(state.events, event),
    expandedCandidateId: normalizeExpandedCandidateId(nextSnapshot, expandedCandidateId)
  };
}

export function findExpandedCandidate(
  snapshot: AgentPanelSessionSnapshot | null,
  candidateId: string | null
): AgentPanelCandidateSnapshot | null {
  if (!snapshot || !candidateId) {
    return null;
  }

  return snapshot.currentShortlist.find((candidate) => candidate.personId === candidateId)
    ?? snapshot.activeCompareSet.find((candidate) => candidate.personId === candidateId)
    ?? null;
}

export function parseSnapshotEventBody(payload: string): AgentPanelSessionSnapshot {
  const data = payload
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data) {
    throw new Error("Missing snapshot payload.");
  }

  return JSON.parse(data) as AgentPanelSessionSnapshot;
}

export function formatAgentPanelError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "暂时无法连接到本地 agent panel bridge。";
}

export function getInterventionCommandKey(
  command: AgentPanelInterventionCommand
): string {
  return `${command.type}:${command.candidateId ?? command.tag ?? "global"}`;
}
