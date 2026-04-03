"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

interface UpdateProfileBody {
  headline?: string;
  contactVisible?: boolean;
}

interface UpdateProfileResponse {
  person: {
    id: string;
    primaryHeadline: string | null;
  };
}

interface AddEvidenceBody {
  personId: string;
  type: string;
  title?: string;
  url?: string;
}

interface AddEvidenceResponse {
  evidence: {
    id: string;
    title: string | null;
    url: string | null;
  };
}

interface DeleteEvidenceBody {
  personId: string;
}

interface DeleteEvidenceResponse {
  success: boolean;
}

interface ProfileEditError {
  error: string;
  message?: string;
}

/**
 * Hook for profile editing mutations (D-07, D-08).
 */
export function useProfileEdit() {
  const queryClient = useQueryClient();

  const updateProfile = useMutation({
    mutationFn: async (data: { personId: string; body: UpdateProfileBody }): Promise<UpdateProfileResponse> => {
      const response = await fetch(`${API_BASE_URL}/profiles/${data.personId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Profile update failed" }));
        throw new Error(errorData.message ?? `Update failed: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate profile query to refresh data
      queryClient.invalidateQueries({ queryKey: ["profile", variables.personId] });
    }
  });

  const addEvidence = useMutation({
    mutationFn: async (data: AddEvidenceBody): Promise<AddEvidenceResponse> => {
      const response = await fetch(`${API_BASE_URL}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Evidence addition failed" }));
        throw new Error(errorData.message ?? `Add evidence failed: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate profile query to refresh evidence list
      queryClient.invalidateQueries({ queryKey: ["profile", variables.personId] });
    }
  });

  const deleteEvidence = useMutation({
    mutationFn: async (data: { evidenceId: string; personId: string }): Promise<DeleteEvidenceResponse> => {
      const response = await fetch(`${API_BASE_URL}/evidence/${data.evidenceId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: data.personId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Evidence deletion failed" }));
        throw new Error(errorData.message ?? `Delete evidence failed: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate profile query to refresh evidence list
      queryClient.invalidateQueries({ queryKey: ["profile", variables.personId] });
    }
  });

  return {
    updateProfile: updateProfile.mutate,
    updateProfileAsync: updateProfile.mutateAsync,
    addEvidence: addEvidence.mutate,
    addEvidenceAsync: addEvidence.mutateAsync,
    deleteEvidence: deleteEvidence.mutate,
    deleteEvidenceAsync: deleteEvidence.mutateAsync,
    isUpdating: updateProfile.isPending,
    isAddingEvidence: addEvidence.isPending,
    isDeletingEvidence: deleteEvidence.isPending,
    isPending: updateProfile.isPending || addEvidence.isPending || deleteEvidence.isPending,
    updateError: updateProfile.error,
    addError: addEvidence.error,
    deleteError: deleteEvidence.error
  };
}