"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, Trash2, Plus } from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";
import { useProfileEdit } from "@/hooks/useProfileEdit";

interface EvidenceItem {
  id: string;
  evidenceType: string;
  title: string | null;
  url: string | null;
}

interface ProfileData {
  id: string;
  primaryHeadline: string | null;
  evidence: EvidenceItem[];
}

interface ProfileEditFormProps {
  personId: string;
  currentProfile: ProfileData;
  onClose: () => void;
}

const EVIDENCE_TYPES = [
  { value: "project", label: "项目" },
  { value: "repository", label: "代码仓库" },
  { value: "social", label: "社交媒体" },
  { value: "community_post", label: "社区文章" },
  { value: "education", label: "教育经历" },
  { value: "experience", label: "工作经历" }
];

/**
 * Profile edit form for claimed users (D-07, D-08).
 * Allows editing headline, contact visibility, and managing evidence links.
 */
export function ProfileEditForm({ personId, currentProfile, onClose }: ProfileEditFormProps) {
  const [headline, setHeadline] = useState(currentProfile.primaryHeadline ?? "");
  const [contactVisible, setContactVisible] = useState(true);
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>(currentProfile.evidence);

  // New evidence form state
  const [newEvidenceType, setNewEvidenceType] = useState("project");
  const [newEvidenceTitle, setNewEvidenceTitle] = useState("");
  const [newEvidenceUrl, setNewEvidenceUrl] = useState("");
  const [showAddEvidence, setShowAddEvidence] = useState(false);

  const {
    updateProfile,
    addEvidence,
    deleteEvidence,
    isPending,
    updateError
  } = useProfileEdit();

  const handleSave = () => {
    updateProfile(
      { personId, body: { headline, contactVisible } },
      {
        onSuccess: () => {
          onClose();
        }
      }
    );
  };

  const handleAddEvidence = () => {
    if (!newEvidenceTitle.trim() && !newEvidenceUrl.trim()) {
      return;
    }

    addEvidence(
      { personId, type: newEvidenceType, title: newEvidenceTitle, url: newEvidenceUrl },
      {
        onSuccess: (data) => {
          setEvidenceList([
            ...evidenceList,
            { id: data.evidence.id, evidenceType: newEvidenceType, title: data.evidence.title, url: data.evidence.url }
          ]);
          setNewEvidenceTitle("");
          setNewEvidenceUrl("");
          setShowAddEvidence(false);
        }
      }
    );
  };

  const handleDeleteEvidence = (evidenceId: string) => {
    deleteEvidence(
      { evidenceId, personId },
      {
        onSuccess: () => {
          setEvidenceList(evidenceList.filter((e) => e.id !== evidenceId));
        }
      }
    );
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-[fadeIn_0.3s_ease-out]" />

        {/* Modal Content */}
        <Dialog.Content
          className={clsx(
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-lg",
            "bg-white rounded-xl shadow-lg",
            "p-6",
            "data-[state=open]:animate-[scaleIn_0.3s_ease-out]"
          )}
        >
          {/* Close Button */}
          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </Dialog.Close>

          {/* Title */}
          <Dialog.Title className="text-lg font-bold text-slate-900 mb-4">
            编辑档案
          </Dialog.Title>

          {/* Form Content */}
          <div className="space-y-4">
            {/* Headline Input (D-07) */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                一句话介绍
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="例如：AI工程师 @ 字节跳动"
                className={clsx(
                  "w-full px-3 py-2 rounded-lg border border-slate-200",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                  "text-sm"
                )}
              />
            </div>

            {/* Contact Visibility Toggle (D-08) */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="contactVisible"
                checked={contactVisible}
                onChange={(e) => setContactVisible(e.target.checked)}
                className="w-4 h-4 rounded border-slate-200 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="contactVisible" className="text-sm text-slate-700">
                公开联系方式
              </label>
            </div>

            {/* Evidence Section (D-07) */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                证据链接
              </label>

              {/* Existing Evidence List */}
              <div className="space-y-2 mb-3">
                {evidenceList.map((evidence) => (
                  <div
                    key={evidence.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-slate-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 truncate">
                        {evidence.title ?? evidence.url ?? "未命名"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {EVIDENCE_TYPES.find((t) => t.value === evidence.evidenceType)?.label ?? evidence.evidenceType}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteEvidence(evidence.id)}
                      disabled={isPending}
                      className="p-1 rounded hover:bg-red-100 text-red-600 disabled:opacity-50"
                      aria-label="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Evidence Toggle */}
              {!showAddEvidence && (
                <button
                  type="button"
                  onClick={() => setShowAddEvidence(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="w-4 h-4" />
                  添加证据
                </button>
              )}

              {/* Add Evidence Form */}
              {showAddEvidence && (
                <div className="p-3 rounded-lg bg-slate-50 space-y-3">
                  {/* Type Select */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      类型
                    </label>
                    <select
                      value={newEvidenceType}
                      onChange={(e) => setNewEvidenceType(e.target.value)}
                      className={clsx(
                        "w-full px-2 py-1 rounded border border-slate-200",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500",
                        "text-sm"
                      )}
                    >
                      {EVIDENCE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Title Input */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      标题
                    </label>
                    <input
                      type="text"
                      value={newEvidenceTitle}
                      onChange={(e) => setNewEvidenceTitle(e.target.value)}
                      placeholder="例如：开源项目名称"
                      className={clsx(
                        "w-full px-2 py-1 rounded border border-slate-200",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500",
                        "text-sm"
                      )}
                    />
                  </div>

                  {/* URL Input */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      链接
                    </label>
                    <input
                      type="url"
                      value={newEvidenceUrl}
                      onChange={(e) => setNewEvidenceUrl(e.target.value)}
                      placeholder="https://..."
                      className={clsx(
                        "w-full px-2 py-1 rounded border border-slate-200",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500",
                        "text-sm"
                      )}
                    />
                  </div>

                  {/* Add/Cancel Buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddEvidence}
                      disabled={isPending || (!newEvidenceTitle.trim() && !newEvidenceUrl.trim())}
                      className={clsx(
                        "flex-1 py-1 rounded text-sm font-medium",
                        "bg-blue-600 text-white hover:bg-blue-700",
                        "disabled:bg-slate-200 disabled:text-slate-400"
                      )}
                    >
                      {isPending ? (
                        <span className="flex items-center justify-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          添加中...
                        </span>
                      ) : (
                        "添加"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddEvidence(false)}
                      className="px-3 py-1 rounded text-sm text-slate-600 hover:bg-slate-100"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Error Display */}
            {updateError && (
              <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">
                {updateError.message}
              </div>
            )}

            {/* Save/Cancel Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className={clsx(
                  "flex-1 py-2 rounded-lg font-medium transition-colors",
                  "bg-blue-600 text-white hover:bg-blue-700",
                  "disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                )}
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    保存中...
                  </span>
                ) : (
                  "保存"
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}