"use client";

import { useCallback, useEffect, useState } from "react";
import { getDealFlowAPI, type DealFlowResponse } from "@/lib/api";
import { getOrCreateDealFlowViewerId, readSavedDealFlowGoal } from "@/lib/deal-flow-viewer";

export interface UseDealFlowSummaryResult {
  data: DealFlowResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  refresh: () => Promise<void>;
}

export function useDealFlowSummary(): UseDealFlowSummaryResult {
  const [data, setData] = useState<DealFlowResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const viewerId = getOrCreateDealFlowViewerId();
      const goal = readSavedDealFlowGoal();
      const response = await getDealFlowAPI({ viewerId, goal });
      setData(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    isLoading,
    errorMessage,
    refresh: load
  };
}
