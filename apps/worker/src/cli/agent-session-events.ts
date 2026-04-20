import type {
  AgentConfidenceStatus,
  AgentRecommendation,
  AgentSessionState,
  RecommendationGateFailureReason
} from "./agent-state.js";
import type {
  ScoredCandidate,
  SearchConditions,
  SearchHistoryEntry,
  SearchRecoveryState
} from "./types.js";

export type AgentSessionStatus =
  | "idle"
  | "clarifying"
  | "searching"
  | "recovering"
  | "shortlist"
  | "comparing"
  | "waiting-input"
  | "blocked"
  | "completed";

export type AgentInterventionType =
  | "add_to_compare"
  | "remove_from_shortlist"
  | "expand_evidence"
  | "apply_feedback";

export interface AgentInterventionCommand {
  type: AgentInterventionType;
  candidateId?: string;
  tag?: string;
}

export interface AgentSessionCandidateSnapshot extends Omit<ScoredCandidate, "lastSyncedAt" | "latestEvidenceAt"> {
  lastSyncedAt?: string;
  latestEvidenceAt?: string;
}

export interface AgentRecommendationSnapshot extends Omit<AgentRecommendation, "candidate" | "createdAt"> {
  candidate: AgentSessionCandidateSnapshot;
  createdAt: string;
}

export interface AgentConfidenceStatusSnapshot extends Omit<AgentConfidenceStatus, "updatedAt"> {
  updatedAt: string;
}

export interface AgentSearchHistoryEntrySnapshot extends Omit<SearchHistoryEntry, "timestamp"> {
  timestamp: string;
}

export interface AgentRecoveryStateSnapshot extends SearchRecoveryState {}

export type AgentTranscriptRole = "user" | "assistant" | "system";

export interface AgentTranscriptEntry {
  id: string;
  role: AgentTranscriptRole;
  content: string;
  timestamp: string;
}

export interface AgentSessionSnapshot {
  sessionId: string;
  status: AgentSessionStatus;
  statusSummary: string | null;
  userGoal: string | null;
  currentConditions: SearchConditions;
  currentShortlist: AgentSessionCandidateSnapshot[];
  activeCompareSet: AgentSessionCandidateSnapshot[];
  confidenceStatus: AgentConfidenceStatusSnapshot;
  recommendedCandidate: AgentRecommendationSnapshot | null;
  openUncertainties: string[];
  recoveryState: AgentRecoveryStateSnapshot;
  clarificationCount: number;
  searchHistory: AgentSearchHistoryEntrySnapshot[];
}

export type AgentSessionEventType =
  | "session_started"
  | "status_changed"
  | "goal_updated"
  | "conditions_updated"
  | "clarify_started"
  | "search_started"
  | "search_completed"
  | "shortlist_updated"
  | "compare_updated"
  | "evidence_expanded"
  | "confidence_updated"
  | "recommendation_updated"
  | "uncertainty_updated"
  | "recovery_updated"
  | "compare_started"
  | "intervention_received"
  | "intervention_applied"
  | "intervention_rejected";

export interface AgentSessionEvent<TData = Record<string, unknown>> {
  sessionId: string;
  sequence: number;
  timestamp: string;
  type: AgentSessionEventType;
  status: AgentSessionStatus;
  summary: string;
  data: TData;
}

export interface CreateAgentSessionEventOptions<TData> {
  sessionId: string;
  sequence: number;
  type: AgentSessionEventType;
  status: AgentSessionStatus;
  summary: string;
  data: TData;
  timestamp?: Date;
}

export interface InterventionRejectedEventData {
  command: AgentInterventionCommand;
  reason: RecommendationGateFailureReason | string;
  details?: Record<string, unknown>;
}

export interface AgentInterventionResult {
  ok: boolean;
  command: AgentInterventionCommand;
  summary: string;
  snapshot: AgentSessionSnapshot;
  reason?: string;
  details?: Record<string, unknown>;
}

function serializeDate(value?: Date | null): string | undefined {
  return value instanceof Date ? value.toISOString() : undefined;
}

function cloneSearchConditions(conditions: SearchConditions): SearchConditions {
  return {
    ...conditions,
    skills: [...conditions.skills],
    locations: [...conditions.locations],
    mustHave: [...conditions.mustHave],
    niceToHave: [...conditions.niceToHave],
    exclude: [...conditions.exclude],
    candidateAnchor: conditions.candidateAnchor
      ? { ...conditions.candidateAnchor }
      : undefined
  };
}

export function serializeSessionCandidate(candidate: ScoredCandidate): AgentSessionCandidateSnapshot {
  return {
    personId: candidate.personId,
    name: candidate.name,
    headline: candidate.headline,
    location: candidate.location,
    company: candidate.company,
    experienceYears: candidate.experienceYears,
    matchScore: candidate.matchScore,
    profile: candidate.profile
      ? {
          ...candidate.profile,
          dimensions: { ...candidate.profile.dimensions },
          highlights: [...candidate.profile.highlights]
        }
      : undefined,
    queryReasons: candidate.queryReasons ? [...candidate.queryReasons] : undefined,
    conditionAudit: candidate.conditionAudit
      ? candidate.conditionAudit.map((item) => ({ ...item }))
      : undefined,
    sources: [...candidate.sources],
    primaryLinks: candidate.primaryLinks
      ? candidate.primaryLinks.map((item) => ({ ...item }))
      : undefined,
    lastSyncedAt: serializeDate(candidate.lastSyncedAt),
    latestEvidenceAt: serializeDate(candidate.latestEvidenceAt)
  };
}

export function serializeSearchHistoryEntry(
  entry: SearchHistoryEntry
): AgentSearchHistoryEntrySnapshot {
  return {
    conditions: cloneSearchConditions(entry.conditions),
    resultCount: entry.resultCount,
    timestamp: entry.timestamp.toISOString()
  };
}

export function serializeConfidenceStatus(
  confidenceStatus: AgentConfidenceStatus
): AgentConfidenceStatusSnapshot {
  return {
    level: confidenceStatus.level,
    rationale: confidenceStatus.rationale,
    updatedAt: confidenceStatus.updatedAt.toISOString()
  };
}

export function serializeRecoveryState(
  recoveryState: SearchRecoveryState
): AgentRecoveryStateSnapshot {
  return {
    phase: recoveryState.phase,
    diagnosis: recoveryState.diagnosis,
    rationale: recoveryState.rationale,
    clarificationCount: recoveryState.clarificationCount,
    rewriteCount: recoveryState.rewriteCount,
    lowConfidenceEmitted: recoveryState.lowConfidenceEmitted,
    lastRewrittenQuery: recoveryState.lastRewrittenQuery
  };
}

export function serializeRecommendation(
  recommendation: AgentRecommendation | null
): AgentRecommendationSnapshot | null {
  if (!recommendation) {
    return null;
  }

  return {
    candidate: serializeSessionCandidate(recommendation.candidate),
    rationale: recommendation.rationale,
    createdAt: recommendation.createdAt.toISOString(),
    confidenceLevel: recommendation.confidenceLevel
  };
}

export function buildAgentSessionSnapshot(options: {
  sessionId: string;
  state: AgentSessionState;
  status: AgentSessionStatus;
  statusSummary?: string | null;
}): AgentSessionSnapshot {
  const { sessionId, state, status, statusSummary } = options;

  return {
    sessionId,
    status,
    statusSummary: statusSummary?.trim() || null,
    userGoal: state.userGoal,
    currentConditions: cloneSearchConditions(state.currentConditions),
    currentShortlist: state.currentShortlist.map(serializeSessionCandidate),
    activeCompareSet: state.activeCompareSet.map(serializeSessionCandidate),
    confidenceStatus: serializeConfidenceStatus(state.confidenceStatus),
    recommendedCandidate: serializeRecommendation(state.recommendedCandidate),
    openUncertainties: [...state.openUncertainties],
    recoveryState: serializeRecoveryState(state.recoveryState),
    clarificationCount: state.clarificationHistory.length,
    searchHistory: state.searchHistory.map(serializeSearchHistoryEntry)
  };
}

export function createAgentSessionEvent<TData>(
  options: CreateAgentSessionEventOptions<TData>
): AgentSessionEvent<TData> {
  return {
    sessionId: options.sessionId,
    sequence: options.sequence,
    timestamp: (options.timestamp ?? new Date()).toISOString(),
    type: options.type,
    status: options.status,
    summary: options.summary,
    data: options.data
  };
}

export function summarizeInterventionCommand(command: AgentInterventionCommand): string {
  if (command.type === "apply_feedback") {
    return command.tag ? `应用反馈：${command.tag}` : "应用反馈";
  }

  if (command.type === "expand_evidence") {
    return command.candidateId ? `展开候选人证据：${command.candidateId}` : "展开候选人证据";
  }

  if (command.type === "add_to_compare") {
    return command.candidateId ? `加入 compare：${command.candidateId}` : "加入 compare";
  }

  if (command.type === "remove_from_shortlist") {
    return command.candidateId ? `移出 shortlist：${command.candidateId}` : "移出 shortlist";
  }

  return command.type;
}
