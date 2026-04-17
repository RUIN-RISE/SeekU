const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export interface SearchFilters {
  locations?: string[];
  sources?: string[];
}

export interface SearchRequest {
  query: string;
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
}

export interface EvidencePreview {
  type: string;
  title: string | null;
  url: string | null;
  stars?: number;
}

export interface SearchResultCard {
  personId: string;
  name: string;
  headline: string | null;
  disambiguation?: string;
  matchScore: number;
  matchStrength: "strong" | "medium" | "weak";
  matchReasons: string[];
  evidencePreview: EvidencePreview[];
  searchStatus?: "active" | "hidden" | "claimed";
}

export interface QueryIntent {
  rawQuery: string;
  roles: string[];
  skills: string[];
  locations: string[];
  mustHaves: string[];
  niceToHaves: string[];
}

export interface SearchResponse {
  results: SearchResultCard[];
  total: number;
  intent: QueryIntent;
  resultWarning?: string;
}

export interface ProfileResponse {
  person: {
    id: string;
    primaryName: string;
    primaryHeadline: string | null;
    summary: string | null;
    primaryLocation: string | null;
    avatarUrl: string | null;
    searchStatus?: "active" | "hidden" | "claimed";
  };
  evidence: Array<{
    id: string;
    evidenceType: string;
    title: string | null;
    description: string | null;
    url: string | null;
    metadata: Record<string, unknown>;
  }>;
  total: number;
  claim?: {
    status: string;
    verifiedAt: string | null;
  };
}

export type DealFlowFeedbackKind = "interested" | "not_interested" | "contacted" | "revisit";
export type DealFlowInteractionKind = "detail_view" | "repeat_view" | "evidence_expand" | "dwell";
export type DealFlowDirectionTag =
  | "ai_agents"
  | "ai_infra"
  | "developer_tools"
  | "education"
  | "enterprise_ai"
  | "open_source"
  | "robotics"
  | "healthcare"
  | "fintech"
  | "creator_media";

export interface DealFlowCard {
  personId: string;
  name: string;
  headline: string | null;
  bucket: "new" | "high-confidence" | "needs-validation" | "revisit";
  confidence: "high" | "medium" | "low";
  totalScore: number;
  whyMatched: string;
  whyNow: string;
  approachPath: string;
  whyUncertain?: string;
  directionSummary: string;
  directionTags: DealFlowDirectionTag[];
  overlapTags: DealFlowDirectionTag[];
  sourceBadges: string[];
  evidencePreview: Array<{
    id: string;
    type: string;
    title: string | null;
    description: string | null;
    url: string | null;
  }>;
  state: {
    seenCount: number;
    detailViewCount: number;
    repeatViewCount: number;
    lastFeedbackKind: DealFlowFeedbackKind | null;
  };
}

export interface DealFlowResponse {
  artifact: {
    generatedForDate: string;
    generatedAt: string;
    topToday: DealFlowCard[];
    moreOpportunities: DealFlowCard[];
    totalCandidates: number;
    bucketCounts: Record<"new" | "high-confidence" | "needs-validation" | "revisit", number>;
  };
  goalModel: {
    explicitGoal: string | null;
    summary: string;
    driftStatus: "unknown" | "aligned" | "shifting";
    dominantDirectionTags: DealFlowDirectionTag[];
    signalSources: Array<
      "explicit_goal" | "current_conditions" | "search_history" | "feedback" | "interaction"
    >;
  };
  viewer: {
    viewerId: string;
    feedbackCounts: Record<DealFlowFeedbackKind, number>;
    interactionCounts: Record<DealFlowInteractionKind, number>;
    surfacedCandidates: number;
  };
  driftNote?: string;
}

export async function searchAPI(request: SearchRequest): Promise<SearchResponse> {
  const response = await fetch(`${API_BASE_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  return response.json();
}

export async function getProfileAPI(personId: string): Promise<ProfileResponse> {
  const response = await fetch(`${API_BASE_URL}/profiles/${personId}`);
  if (!response.ok) {
    throw new Error(`Profile fetch failed: ${response.status}`);
  }
  return response.json();
}

export async function getSyncStatusAPI(): Promise<{ runs: Array<{ id: string; source: string; status: string; startedAt: string; finishedAt?: string; stats: Record<string, unknown>; errorMessage?: string }> }> {
  const response = await fetch(`${API_BASE_URL}/admin/sync-status`);
  if (!response.ok) {
    throw new Error(`Sync status fetch failed: ${response.status}`);
  }
  return response.json();
}

export async function getDealFlowAPI(request: {
  viewerId: string;
  goal?: string;
}): Promise<DealFlowResponse> {
  const params = new URLSearchParams({
    viewerId: request.viewerId
  });

  if (request.goal?.trim()) {
    params.set("goal", request.goal.trim());
  }

  const response = await fetch(`${API_BASE_URL}/deal-flow?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Deal flow fetch failed: ${response.status}`);
  }
  return response.json();
}

export async function submitDealFlowFeedbackAPI(request: {
  viewerId: string;
  personId: string;
  kind: DealFlowFeedbackKind;
  directionTags: DealFlowDirectionTag[];
  note?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/deal-flow/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(`Deal flow feedback failed: ${response.status}`);
  }
  return response.json();
}

export async function trackDealFlowInteractionAPI(request: {
  viewerId: string;
  personId: string;
  kind: DealFlowInteractionKind;
  directionTags: DealFlowDirectionTag[];
  note?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/deal-flow/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(`Deal flow interaction failed: ${response.status}`);
  }
  return response.json();
}
