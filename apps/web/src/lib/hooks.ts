import { useQuery } from "@tanstack/react-query";
import { searchAPI, getProfileAPI, getSyncStatusAPI, type SearchResponse, type ProfileResponse, type SearchFilters } from "./api";

export { type SearchResponse };

export function useSearch(query: string, filters?: SearchFilters, limit?: number) {
  return useQuery({
    queryKey: ["search", query, filters, limit],
    queryFn: () => searchAPI({ query, filters, limit }),
    enabled: query.trim().length > 2,
    staleTime: 30_000
  });
}

export function useProfile(personId: string) {
  return useQuery({
    queryKey: ["profile", personId],
    queryFn: () => getProfileAPI(personId),
    enabled: personId.length > 0,
    staleTime: 60_000
  });
}

export function useSyncStatus() {
  return useQuery({
    queryKey: ["sync-status"],
    queryFn: getSyncStatusAPI,
    staleTime: 60_000,
    refetchInterval: 120_000
  });
}