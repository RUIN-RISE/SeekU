"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, ShieldCheck, Pencil } from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";
import { useProfile } from "@/lib/hooks";
import { EvidenceTabs } from "./EvidenceTabs";
import { VerifiedBadge } from "./VerifiedBadge";
import { ClaimForm } from "./ClaimForm";
import { ProfileEditForm } from "./ProfileEditForm";

interface CandidateDetailModalProps {
  personId: string | null;
  onClose: () => void;
}

export function CandidateDetailModal({ personId, onClose }: CandidateDetailModalProps) {
  const resolvedPersonId = personId ?? "";
  const { data, isLoading, error } = useProfile(resolvedPersonId);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  if (!personId) {
    return null;
  }

  const person = data?.person;
  const evidence = data?.evidence ?? [];

  return (
    <>
      <Dialog.Root open={Boolean(personId)} onOpenChange={(open) => !open && onClose()}>
        <Dialog.Portal>
          {/* Backdrop */}
          <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-[fadeIn_0.3s_ease-out]" />

          {/* Modal Content */}
          <Dialog.Content
            className={clsx(
              "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "w-full max-w-[720px] max-h-[80vh]",
              "bg-bg-white rounded-card shadow-lg",
              "p-6 overflow-y-auto",
              "data-[state=open]:animate-[scaleIn_0.3s_ease-out]"
            )}
          >
            {/* Close Button */}
            <Dialog.Close asChild>
              <button
                className="absolute top-4 right-4 p-1 rounded-full hover:bg-bg-light transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-text-muted" />
              </button>
            </Dialog.Close>

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="text-center py-12 text-red-500">
                <p>Failed to load candidate details</p>
              </div>
            )}

            {/* Content */}
            {person && (
              <div>
                {/* Header */}
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-blue to-accent-indigo flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">
                      {person.primaryName.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <Dialog.Title className="font-chinese-display font-bold text-xl text-text-dark">
                      {person.primaryName}
                    </Dialog.Title>
                    {person.primaryHeadline && (
                      <Dialog.Description className="text-sm text-text-muted mt-1">
                        {person.primaryHeadline}
                      </Dialog.Description>
                    )}
                    {person.primaryLocation && (
                      <p className="text-xs text-text-muted mt-1">{person.primaryLocation}</p>
                    )}
                  </div>
                  {/* Verified Badge */}
                  {person.searchStatus === "claimed" && (
                    <VerifiedBadge size="md" showLabel verifiedAt={data?.claim?.verifiedAt ?? undefined} />
                  )}
                </div>

                {/* Claim Button */}
                {person.searchStatus !== "claimed" && (
                  <button
                    type="button"
                    onClick={() => setShowClaimForm(true)}
                    className={clsx(
                      "flex items-center gap-2 px-4 py-2 mb-4 rounded-lg",
                      "text-sm font-medium",
                      "bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                    )}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    认领此档案
                  </button>
                )}

                {/* Edit Profile Button (D-07) - only for claimed profiles */}
                {person.searchStatus === "claimed" && (
                  <button
                    type="button"
                    onClick={() => setShowEditForm(true)}
                    className={clsx(
                      "flex items-center gap-2 px-4 py-2 mb-4 rounded-lg",
                      "text-sm font-medium",
                      "bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    )}
                  >
                    <Pencil className="w-4 h-4" />
                    编辑档案
                  </button>
                )}

                {/* Evidence Tabs */}
                <EvidenceTabs evidence={evidence} />
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {showClaimForm && person && (
        <ClaimForm
          personId={resolvedPersonId}
          personName={person.primaryName}
          onClose={() => setShowClaimForm(false)}
        />
      )}

      {showEditForm && person && (
        <ProfileEditForm
          personId={resolvedPersonId}
          currentProfile={{
            id: person.id,
            primaryHeadline: person.primaryHeadline,
            evidence: evidence.map((e) => ({
              id: e.id,
              evidenceType: e.evidenceType,
              title: e.title,
              url: e.url
            }))
          }}
          onClose={() => setShowEditForm(false)}
        />
      )}
    </>
  );
}
