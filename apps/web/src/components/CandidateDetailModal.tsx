"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { useProfile } from "@/lib/hooks";
import { EvidenceTabs } from "./EvidenceTabs";

interface CandidateDetailModalProps {
  personId: string | null;
  onClose: () => void;
}

export function CandidateDetailModal({ personId, onClose }: CandidateDetailModalProps) {
  const { data, isLoading, error } = useProfile(personId ?? "");

  if (!personId) {
    return null;
  }

  return (
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
          {data?.person && (
            <div>
              {/* Header */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-blue to-accent-indigo flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {data.person.primaryName.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <Dialog.Title className="font-chinese-display font-bold text-xl text-text-dark">
                    {data.person.primaryName}
                  </Dialog.Title>
                  {data.person.primaryHeadline && (
                    <Dialog.Description className="text-sm text-text-muted mt-1">
                      {data.person.primaryHeadline}
                    </Dialog.Description>
                  )}
                  {data.person.primaryLocation && (
                    <p className="text-xs text-text-muted mt-1">{data.person.primaryLocation}</p>
                  )}
                </div>
              </div>

              {/* Evidence Tabs */}
              <EvidenceTabs evidence={data.evidence} />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}