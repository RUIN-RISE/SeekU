import type {
  ScoredCandidate,
  SearchConditions,
  SearchHistoryEntry,
  SearchRecoveryState
} from "./types.js";

export type AgentConfidenceLevel = "high" | "medium" | "low";
export type RecommendationGateFailureReason =
  | "candidate_not_in_compare_set"
  | "low_confidence";

export interface AgentClarificationEntry {
  prompt: string;
  conditions: SearchConditions;
  askedAt: Date;
}

export interface AgentConfidenceStatus {
  level: AgentConfidenceLevel;
  rationale?: string;
  updatedAt: Date;
}

export interface AgentRecommendation {
  candidate: ScoredCandidate;
  rationale?: string;
  createdAt: Date;
  confidenceLevel: Exclude<AgentConfidenceLevel, "low">;
}

export interface AgentSessionState {
  userGoal: string | null;
  currentConditions: SearchConditions;
  clarificationHistory: AgentClarificationEntry[];
  searchHistory: SearchHistoryEntry[];
  currentShortlist: ScoredCandidate[];
  activeCompareSet: ScoredCandidate[];
  confidenceStatus: AgentConfidenceStatus;
  recommendedCandidate: AgentRecommendation | null;
  openUncertainties: string[];
  recoveryState: SearchRecoveryState;
}

export type SearchSessionState<TCandidate extends ScoredCandidate = ScoredCandidate> =
  Omit<AgentSessionState, "currentShortlist" | "activeCompareSet" | "recommendedCandidate"> & {
    currentShortlist: TCandidate[];
    activeCompareSet: TCandidate[];
    recommendedCandidate:
      | (Omit<AgentRecommendation, "candidate"> & { candidate: TCandidate })
      | null;
  };

export interface CreateAgentSessionStateOptions {
  userGoal?: string | null;
  currentConditions?: Partial<SearchConditions>;
  clarificationHistory?: AgentClarificationEntry[];
  searchHistory?: SearchHistoryEntry[];
  currentShortlist?: ScoredCandidate[];
  activeCompareSet?: ScoredCandidate[];
  confidenceStatus?: Partial<Omit<AgentConfidenceStatus, "updatedAt">> & {
    updatedAt?: Date;
  };
  recommendedCandidate?: AgentRecommendation | null;
  openUncertainties?: string[];
  recoveryState?: Partial<SearchRecoveryState>;
}

export interface RecordSearchOptions {
  results: ScoredCandidate[];
  conditions?: SearchConditions;
  timestamp?: Date;
}

export interface SetCurrentShortlistOptions {
  resetCompareSet?: boolean;
  preserveCompareSet?: boolean;
}

export interface RecommendationGateStatus {
  allowed: boolean;
  reason?: RecommendationGateFailureReason;
}

export interface SetRecommendedCandidateOptions {
  rationale?: string;
  createdAt?: Date;
}

export interface SetRecommendedCandidateResult {
  ok: boolean;
  state: AgentSessionState;
  reason?: RecommendationGateFailureReason;
}

type ConfidenceStatusInput =
  | AgentConfidenceStatus
  | AgentConfidenceLevel
  | "unknown"
  | "high-confidence"
  | "medium-confidence"
  | "low-confidence";

function createDefaultSearchConditions(): SearchConditions {
  return {
    skills: [],
    locations: [],
    experience: undefined,
    role: undefined,
    sourceBias: undefined,
    mustHave: [],
    niceToHave: [],
    exclude: [],
    preferFresh: false,
    candidateAnchor: undefined,
    limit: 10
  };
}

function createDefaultRecoveryState(): SearchRecoveryState {
  return {
    phase: "idle",
    diagnosis: undefined,
    rationale: undefined,
    clarificationCount: 0,
    rewriteCount: 0,
    lowConfidenceEmitted: false,
    lastRewrittenQuery: undefined,
    compareSuggestedRefinement: undefined
  };
}

function dedupeCandidates(candidates: readonly ScoredCandidate[]): ScoredCandidate[] {
  const seen = new Set<string>();
  const deduped: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.personId)) {
      continue;
    }

    seen.add(candidate.personId);
    deduped.push(candidate);
  }

  return deduped;
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

function cloneSearchConditions(
  conditions: SearchConditions | Partial<SearchConditions> | undefined
): SearchConditions {
  return {
    ...createDefaultSearchConditions(),
    ...conditions,
    skills: [...(conditions?.skills ?? [])],
    locations: [...(conditions?.locations ?? [])],
    mustHave: [...(conditions?.mustHave ?? [])],
    niceToHave: [...(conditions?.niceToHave ?? [])],
    exclude: [...(conditions?.exclude ?? [])],
    candidateAnchor: conditions?.candidateAnchor
      ? { ...conditions.candidateAnchor }
      : undefined
  };
}

function clearRecommendationIfInvalid(state: AgentSessionState): AgentSessionState {
  const recommendation = state.recommendedCandidate;
  if (!recommendation) {
    return state;
  }

  if (state.confidenceStatus.level === "low") {
    return {
      ...state,
      recommendedCandidate: null
    };
  }

  const stillInCompareSet = state.activeCompareSet.some(
    (candidate) => candidate.personId === recommendation.candidate.personId
  );

  if (stillInCompareSet) {
    return state;
  }

  return {
    ...state,
    recommendedCandidate: null
  };
}

export function createAgentSessionState(
  options: CreateAgentSessionStateOptions = {}
): AgentSessionState {
  const currentShortlist = dedupeCandidates(options.currentShortlist ?? []);
  const shortlistIds = new Set(currentShortlist.map((candidate) => candidate.personId));
  const activeCompareSet = dedupeCandidates(
    (options.activeCompareSet ?? []).filter((candidate) =>
      currentShortlist.length === 0 || shortlistIds.has(candidate.personId)
    )
  );
  const state: AgentSessionState = {
    userGoal: options.userGoal ?? null,
    currentConditions: cloneSearchConditions(options.currentConditions),
    clarificationHistory: [...(options.clarificationHistory ?? [])],
    searchHistory: [...(options.searchHistory ?? [])],
    currentShortlist,
    activeCompareSet,
    confidenceStatus: {
      level: options.confidenceStatus?.level ?? "low",
      rationale: options.confidenceStatus?.rationale,
      updatedAt: options.confidenceStatus?.updatedAt ?? new Date(0)
    },
    recommendedCandidate: options.recommendedCandidate ?? null,
    openUncertainties: dedupeStrings(options.openUncertainties ?? []),
    recoveryState: {
      ...createDefaultRecoveryState(),
      ...options.recoveryState
    }
  };

  return clearRecommendationIfInvalid(state);
}

export const createSearchSessionState = createAgentSessionState;

export function setUserGoal(
  state: AgentSessionState,
  userGoal: string | null
): AgentSessionState {
  return {
    ...state,
    userGoal: userGoal?.trim() || null
  };
}

export const setSessionUserGoal = setUserGoal;

export function setRecoveryState(
  state: AgentSessionState,
  recoveryState: SearchRecoveryState
): AgentSessionState {
  return {
    ...state,
    recoveryState: { ...recoveryState }
  };
}

export function resetRecoveryState(state: AgentSessionState): AgentSessionState {
  return setRecoveryState(state, createDefaultRecoveryState());
}

export function setCurrentConditions(
  state: AgentSessionState,
  currentConditions: SearchConditions
): AgentSessionState {
  return {
    ...state,
    currentConditions: cloneSearchConditions(currentConditions)
  };
}

export const setSessionConditions = setCurrentConditions;

export function appendClarification(
  state: AgentSessionState,
  entry: AgentClarificationEntry
): AgentSessionState {
  return {
    ...state,
    clarificationHistory: [...state.clarificationHistory, entry]
  };
}

export function recordClarification(
  state: AgentSessionState,
  prompt: string,
  conditions: SearchConditions,
  timestamp = new Date()
): AgentSessionState {
  return appendClarification(setCurrentConditions(state, conditions), {
    prompt,
    conditions: cloneSearchConditions(conditions),
    askedAt: timestamp
  });
}

export function setOpenUncertainties(
  state: AgentSessionState,
  openUncertainties: string[]
): AgentSessionState {
  return {
    ...state,
    openUncertainties: dedupeStrings(openUncertainties)
  };
}

export function addOpenUncertainty(
  state: AgentSessionState,
  uncertainty: string
): AgentSessionState {
  return setOpenUncertainties(state, [...state.openUncertainties, uncertainty]);
}

export function removeOpenUncertainty(
  state: AgentSessionState,
  uncertainty: string
): AgentSessionState {
  const target = uncertainty.trim().toLowerCase();

  return {
    ...state,
    openUncertainties: state.openUncertainties.filter(
      (value) => value.trim().toLowerCase() !== target
    )
  };
}

export function setCurrentShortlist(
  state: AgentSessionState,
  shortlist: ScoredCandidate[],
  options: SetCurrentShortlistOptions = {}
): AgentSessionState {
  const currentShortlist = dedupeCandidates(shortlist);

  if (options.resetCompareSet !== false) {
    return {
      ...state,
      currentShortlist,
      activeCompareSet: [],
      recommendedCandidate: null
    };
  }

  if (options.preserveCompareSet) {
    return {
      ...state,
      currentShortlist
    };
  }

  const shortlistIds = new Set(currentShortlist.map((candidate) => candidate.personId));
  const nextState = {
    ...state,
    currentShortlist,
    activeCompareSet: state.activeCompareSet.filter((candidate) =>
      shortlistIds.has(candidate.personId)
    )
  };

  return clearRecommendationIfInvalid(nextState);
}

export function setSessionShortlist(
  state: AgentSessionState,
  shortlist: ScoredCandidate[]
): AgentSessionState {
  return setCurrentShortlist(state, shortlist, {
    resetCompareSet: false,
    preserveCompareSet: true
  });
}

export function recordSearch(
  state: AgentSessionState,
  options: RecordSearchOptions
): AgentSessionState {
  const nextState = setCurrentShortlist(state, options.results, {
    resetCompareSet: false,
    preserveCompareSet: true
  });
  const conditions = cloneSearchConditions(options.conditions ?? nextState.currentConditions);

  return {
    ...nextState,
    currentConditions: conditions,
    confidenceStatus: {
      level: "low",
      rationale: undefined,
      updatedAt: options.timestamp ?? new Date()
    },
    recommendedCandidate: null,
    openUncertainties: [],
    searchHistory: [
      ...nextState.searchHistory,
      {
        conditions,
        resultCount: options.results.length,
        timestamp: options.timestamp ?? new Date()
      }
    ]
  };
}

export function recordSearchExecution(
  state: AgentSessionState,
  options: {
    conditions?: SearchConditions;
    resultCount?: number;
    shortlist: ScoredCandidate[];
    timestamp?: Date;
  }
): AgentSessionState {
  return recordSearch(state, {
    results: options.shortlist,
    conditions: options.conditions,
    timestamp: options.timestamp
  });
}

export function setActiveCompareSet(
  state: AgentSessionState,
  candidates: ScoredCandidate[]
): AgentSessionState {
  const nextState = {
    ...state,
    activeCompareSet: dedupeCandidates(candidates)
  };

  return clearRecommendationIfInvalid(nextState);
}

export function addCompareCandidates(
  state: AgentSessionState,
  candidates: ScoredCandidate[]
): AgentSessionState {
  return candidates.reduce(
    (currentState, candidate) => addCandidateToCompareSet(currentState, candidate),
    state
  );
}

export function removeCompareCandidates(
  state: AgentSessionState,
  candidateIds: string[]
): AgentSessionState {
  return candidateIds.reduce(
    (currentState, personId) => removeCandidateFromCompareSet(currentState, personId),
    state
  );
}

export function addCandidateToCompareSet(
  state: AgentSessionState,
  candidate: ScoredCandidate
): AgentSessionState {
  return setActiveCompareSet(state, [...state.activeCompareSet, candidate]);
}

export function removeCandidateFromCompareSet(
  state: AgentSessionState,
  personId: string
): AgentSessionState {
  const nextState = {
    ...state,
    activeCompareSet: state.activeCompareSet.filter((candidate) => candidate.personId !== personId)
  };

  return clearRecommendationIfInvalid(nextState);
}

export function clearActiveCompareSet(state: AgentSessionState): AgentSessionState {
  return {
    ...state,
    activeCompareSet: [],
    recommendedCandidate: null
  };
}

export const clearCompareSet = clearActiveCompareSet;

export function replaceSearchHistory(
  state: AgentSessionState,
  searchHistory: SearchHistoryEntry[]
): AgentSessionState {
  return {
    ...state,
    searchHistory: [...searchHistory]
  };
}

export function rewindSearchHistory(
  state: AgentSessionState,
  count: number
): AgentSessionState {
  return replaceSearchHistory(state, state.searchHistory.slice(0, Math.max(0, state.searchHistory.length - count)));
}

export function setConfidenceStatus(
  state: AgentSessionState,
  confidenceStatus: ConfidenceStatusInput
): AgentSessionState {
  const normalized: AgentConfidenceStatus = typeof confidenceStatus === "string"
    ? {
        level:
          confidenceStatus === "high" || confidenceStatus === "high-confidence"
            ? "high"
            : confidenceStatus === "medium" || confidenceStatus === "medium-confidence"
              ? "medium"
              : "low",
        rationale: undefined,
        updatedAt: new Date()
      }
    : confidenceStatus;

  return clearRecommendationIfInvalid({
    ...state,
    confidenceStatus: { ...normalized }
  });
}

export function clearRecommendedCandidate(state: AgentSessionState): AgentSessionState {
  return {
    ...state,
    recommendedCandidate: null
  };
}

export function canSetRecommendedCandidate(
  state: AgentSessionState,
  candidate: Pick<ScoredCandidate, "personId">
): RecommendationGateStatus {
  const inCompareSet = state.activeCompareSet.some(
    (entry) => entry.personId === candidate.personId
  );

  if (!inCompareSet) {
    return {
      allowed: false,
      reason: "candidate_not_in_compare_set"
    };
  }

  if (state.confidenceStatus.level === "low") {
    return {
      allowed: false,
      reason: "low_confidence"
    };
  }

  return { allowed: true };
}

export function setRecommendedCandidate(
  state: AgentSessionState,
  candidate: ScoredCandidate,
  options: SetRecommendedCandidateOptions = {}
): SetRecommendedCandidateResult {
  const gate = canSetRecommendedCandidate(state, candidate);

  if (!gate.allowed) {
    return {
      ok: false,
      reason: gate.reason,
      state
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      recommendedCandidate: {
        candidate,
        rationale: options.rationale,
        createdAt: options.createdAt ?? new Date(),
        confidenceLevel: state.confidenceStatus.level === "high" ? "high" : "medium"
      }
    }
  };
}
