"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { useAdminClaims, useRevokeClaim } from "@/hooks/useAdminClaims";
import { Loader2, AlertTriangle, X } from "lucide-react";
import { clsx } from "clsx";

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
  { value: "revoked", label: "已撤销" }
];

const METHOD_OPTIONS = [
  { value: "", label: "全部方式" },
  { value: "email", label: "邮箱验证" },
  { value: "github", label: "GitHub OAuth" }
];

/**
 * Admin claims audit page (D-04).
 * Shows all claims with status, allows filtering and revocation.
 */
export default function AdminClaimsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Revoke dialog state
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const { data, isLoading, error } = useAdminClaims({
    status: statusFilter || undefined,
    method: methodFilter || undefined,
    limit,
    offset
  });

  const { mutate: revokeClaim, isPending: isRevoking } = useRevokeClaim();

  const handleRevokeClick = (claimId: string) => {
    setSelectedClaimId(claimId);
    setRevokeReason("");
    setShowRevokeDialog(true);
  };

  const handleRevokeConfirm = () => {
    if (!selectedClaimId || !revokeReason.trim()) {
      return;
    }

    revokeClaim(
      { claimId: selectedClaimId, reason: revokeReason.trim() },
      {
        onSuccess: () => {
          setShowRevokeDialog(false);
          setSelectedClaimId(null);
          setRevokeReason("");
        }
      }
    );
  };

  const claims = data?.claims ?? [];
  const total = data?.total ?? 0;

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-700";
      case "pending":
        return "bg-yellow-100 text-yellow-700";
      case "rejected":
        return "bg-gray-100 text-gray-700";
      case "revoked":
        return "bg-red-100 text-red-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "approved":
        return "已通过";
      case "pending":
        return "待审核";
      case "rejected":
        return "已拒绝";
      case "revoked":
        return "已撤销";
      default:
        return status;
    }
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case "email":
        return "邮箱";
      case "github":
        return "GitHub";
      default:
        return method;
    }
  };

  return (
    <div className="min-h-screen bg-bg-light">
      <Header />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <h1 className="font-chinese-display font-bold text-2xl text-text-dark mb-6">
          档案认领审核
        </h1>

        {/* Filters */}
        <div className="bg-bg-white rounded-card shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-muted">状态：</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 text-sm"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-muted">方式：</label>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 text-sm"
              >
                {METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-4 text-sm text-text-muted">
          共 {total} 条认领记录
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent-blue" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 mb-6">
            加载认领记录失败: {error.message}
          </div>
        )}

        {/* Claims Table */}
        {!isLoading && !error && (
          <div className="bg-bg-white rounded-card shadow-[0_4px_20px_rgba(0,0,0,0.08)] overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">姓名</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">验证方式</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">状态</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">提交时间</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">验证时间</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">验证信息</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                      暂无认领记录
                    </td>
                  </tr>
                ) : (
                  claims.map((claim) => (
                    <tr key={claim.claimId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-text-dark">
                        {claim.personName}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted">
                        {getMethodLabel(claim.method)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx("px-2 py-0.5 rounded text-xs font-medium", getStatusBadgeColor(claim.status))}>
                          {getStatusLabel(claim.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted">
                        {new Date(claim.submittedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted">
                        {claim.verifiedAt ? new Date(claim.verifiedAt).toLocaleString() : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted">
                        {claim.method === "email" && claim.verifiedEmail && (
                          <span>{claim.verifiedEmail}</span>
                        )}
                        {claim.method === "github" && claim.verifiedGitHubLogin && (
                          <span>{claim.verifiedGitHubLogin}</span>
                        )}
                        {!claim.verifiedEmail && !claim.verifiedGitHubLogin && "-"}
                      </td>
                      <td className="px-4 py-3">
                        {claim.status === "approved" && (
                          <button
                            onClick={() => handleRevokeClick(claim.claimId)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-sm text-red-600 hover:bg-red-50"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            撤销
                          </button>
                        )}
                        {claim.status !== "approved" && (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {total > limit && (
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                <div className="text-sm text-text-muted">
                  显示 {offset + 1}-{Math.min(offset + limit, total)} 条，共 {total} 条
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="px-3 py-1 rounded text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total}
                    className="px-3 py-1 rounded text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Revoke Dialog */}
        {showRevokeDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">撤销认领</h3>
                <button
                  onClick={() => setShowRevokeDialog(false)}
                  className="p-1 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <p className="text-sm text-slate-600 mb-4">
                撤销后，该用户的认领状态将变为 active，verified 状态将被取消。请提供撤销原因：
              </p>

              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="例如：验证发现造假、用户申请撤销等"
                className={clsx(
                  "w-full px-3 py-2 rounded-lg border border-slate-200",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500",
                  "text-sm resize-none",
                  "min-h-[80px]"
                )}
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleRevokeConfirm}
                  disabled={isRevoking || !revokeReason.trim()}
                  className={clsx(
                    "flex-1 py-2 rounded-lg font-medium",
                    "bg-red-600 text-white hover:bg-red-700",
                    "disabled:bg-slate-200 disabled:text-slate-400"
                  )}
                >
                  {isRevoking ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      撤销中...
                    </span>
                  ) : (
                    "确认撤销"
                  )}
                </button>
                <button
                  onClick={() => setShowRevokeDialog(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}