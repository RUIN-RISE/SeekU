"use client";

import { type DealFlowResponse } from "@/lib/api";

interface DealFlowReadoutProps {
  data: DealFlowResponse;
  compact?: boolean;
  generatedAtLabel?: string | null;
}

function signalBadgeLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export function DealFlowReadout({
  data,
  compact = false,
  generatedAtLabel
}: DealFlowReadoutProps) {
  const cardClassName = compact
    ? "rounded-2xl bg-cyan-950 p-4 text-white"
    : "rounded-[32px] bg-slate-950 p-5 text-white";

  return (
    <div className={cardClassName}>
      <div className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Model Readout</div>
      {generatedAtLabel && (
        <p className="mt-2 text-xs text-cyan-100/80">{generatedAtLabel}</p>
      )}
      <p className="mt-4 text-sm leading-7 text-slate-200">
        {data.goalModel.summary}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {data.goalModel.dominantDirectionTags.slice(0, 4).map((tag) => (
          <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
            {signalBadgeLabel(tag)}
          </span>
        ))}
      </div>
      {data.driftNote && (
        <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {data.driftNote}
        </div>
      )}
      <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-slate-400">今日候选</div>
          <div className="mt-1 text-2xl font-bold">{data.artifact.totalCandidates}</div>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-slate-400">已看候选</div>
          <div className="mt-1 text-2xl font-bold">{data.viewer.surfacedCandidates}</div>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-slate-400">感兴趣</div>
          <div className="mt-1 text-2xl font-bold">{data.viewer.feedbackCounts.interested}</div>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-slate-400">细看次数</div>
          <div className="mt-1 text-2xl font-bold">{data.viewer.interactionCounts.detail_view}</div>
        </div>
      </div>
    </div>
  );
}
