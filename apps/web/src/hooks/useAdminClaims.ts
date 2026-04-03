"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

interface ClaimItem {
  claimId: string;
  personId: string;
  personName: string;
  method: string;
  status: string;
  submittedAt: string;
  verifiedAt: string | null;
  verifiedEmail: string | null;
  verifiedGitHubLogin: string | null;
}

interface ClaimsListResponse {
  claims: ClaimItem[];
  total: number;
}

interface ClaimsListParams {
  status?: string;
  method?: string;
  limit?: number;
  offset?: number;
}

interface RevokeClaimResponse {
  success: boolean;
  claim: {
    id: string;
    status: string;
    revokedAt: string;
    revokeReason: string;
  };
}

/**
 * Hook for admin claims audit functionality (D-04).
 */
export function useAdminClaims(params: ClaimsListParams = {}) {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.set("status", params.status);
  if (params.method) queryParams.set("method", params.method);
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.offset) queryParams.set("offset", String(params.offset));

  const queryString = queryParams.toString();
  const url = `${API_BASE_URL}/admin/claims${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: ["admin-claims", params],
    queryFn: async (): Promise<ClaimsListResponse> => {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch claims: ${response.status}`);
      }

      return response.json();
    },
    staleTime: 30_000
  });
}

/**
 * Hook for revoking a claim (D-04).
 */
export function useRevokeClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { claimId: string; reason: string }): Promise<RevokeClaimResponse> => {
      const response = await fetch(`${API_BASE_URL}/admin/claims/${data.claimId}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: data.reason })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Revoke failed" }));
        throw new Error(errorData.message ?? `Revoke failed: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate claims list to refresh
      queryClient.invalidateQueries({ queryKey: ["admin-claims"] });
    }
  });
}