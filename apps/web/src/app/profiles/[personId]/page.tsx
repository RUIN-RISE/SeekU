"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { clsx } from "clsx";
import { useProfile } from "@/lib/hooks";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { ClaimForm } from "@/components/ClaimForm";
import { EvidenceTabs } from "@/components/EvidenceTabs";

export default function ProfilePage() {
  const params = useParams();
  const personId = params.personId as string;
  const { data, isLoading, error } = useProfile(personId);
  const [showClaimForm, setShowClaimForm] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data?.person) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center text-red-500">
          <p>无法加载档案信息</p>
          <a href="/" className="text-blue-500 text-sm mt-2 block">返回首页</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回搜索
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          {/* Profile Header */}
          <div className="flex items-start gap-4 mb-6">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
              <span className="text-3xl font-bold text-white">
                {data.person.primaryName.charAt(0)}
              </span>
            </div>

            {/* Name and Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">
                  {data.person.primaryName}
                </h1>
                {data.person.searchStatus === "claimed" && (
                  <VerifiedBadge size="lg" showLabel verifiedAt={data.claim?.verifiedAt ?? undefined} />
                )}
              </div>
              {data.person.primaryHeadline && (
                <p className="text-lg text-slate-500 mt-1">{data.person.primaryHeadline}</p>
              )}
              {data.person.primaryLocation && (
                <p className="text-sm text-slate-400 mt-1">{data.person.primaryLocation}</p>
              )}
              {data.person.summary && (
                <p className="text-sm text-slate-600 mt-4 leading-relaxed">{data.person.summary}</p>
              )}
            </div>
          </div>

          {/* Claim Button */}
          {data.person.searchStatus !== "claimed" && (
            <button
              type="button"
              onClick={() => setShowClaimForm(true)}
              className={clsx(
                "flex items-center gap-2 px-5 py-3 rounded-lg",
                "text-sm font-medium",
                "bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors mb-6"
              )}
            >
              <ShieldCheck className="w-5 h-5" />
              认领此档案
            </button>
          )}

          {/* Verified Status Detail */}
          {data.person.searchStatus === "claimed" && data.claim?.verifiedAt && (
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-700">
                <span className="font-medium">验证状态：</span>
                此档案已于 {new Date(data.claim.verifiedAt).toLocaleDateString("zh-CN")} 完成所有权验证
              </p>
            </div>
          )}

          {/* Evidence Tabs */}
          <EvidenceTabs evidence={data.evidence} />
        </div>
      </main>

      {/* Claim Form Modal */}
      {showClaimForm && (
        <ClaimForm
          personId={personId}
          personName={data.person.primaryName}
          onClose={() => setShowClaimForm(false)}
        />
      )}
    </div>
  );
}