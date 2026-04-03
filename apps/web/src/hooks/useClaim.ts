"use client";

import { useMutation } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export interface ClaimRequestBody {
  personId: string;
  email?: string;
  method: "email" | "github";
}

export interface ClaimResponseBody {
  status: "pending_verification" | "pending_oauth" | "approved" | "error";
  verificationUrl?: string;
  oauthUrl?: string;
  claimId?: string;
  message?: string;
}

export function useClaim() {
  return useMutation({
    mutationFn: async (data: ClaimRequestBody): Promise<ClaimResponseBody> => {
      const response = await fetch(`${API_BASE_URL}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Claim submission failed" }));
        throw new Error(errorData.message ?? `Claim failed: ${response.status}`);
      }

      return response.json();
    }
  });
}