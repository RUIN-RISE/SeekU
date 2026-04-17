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
