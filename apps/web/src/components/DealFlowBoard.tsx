"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  ArrowUpRight,
  CheckCheck,
  Clock3,
  Eye,
  Loader2,
  RefreshCcw,
  Sparkles
} from "lucide-react";

import {
  getDealFlowAPI,
  submitDealFlowFeedbackAPI,
  trackDealFlowInteractionAPI,
  type DealFlowCard,
  type DealFlowFeedbackKind,
  type DealFlowResponse
} from "@/lib/api";
import {
  DEFAULT_DEAL_FLOW_GOAL,
  getOrCreateDealFlowViewerId,
  readSavedDealFlowGoal,
  saveDealFlowGoal
} from "@/lib/deal-flow-viewer";
import { DealFlowReadout } from "@/components/DealFlowReadout";

function signalBadgeLabel(value: string): string {
  return value.replace(/_/g, " ");
}

const FEEDBACK_ACTIONS: Array<{
  kind: DealFlowFeedbackKind;
  label: string;
  tone: string;
}> = [
  {
    kind: "interested",
    label: "感兴趣",
    tone: "bg-emerald-500 text-white hover:bg-emerald-600"
  },
  {
    kind: "not_interested",
    label: "不感兴趣",
    tone: "bg-white text-slate-700 hover:bg-slate-100"
  },
  {
    kind: "contacted",
    label: "已联系",
    tone: "bg-slate-900 text-white hover:bg-slate-800"
  },
  {
    kind: "revisit",
    label: "稍后再看",
    tone: "bg-amber-100 text-amber-900 hover:bg-amber-200"
  }
];

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function formatGeneratedAt(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function bucketLabel(bucket: DealFlowCard["bucket"]): string {
  switch (bucket) {
    case "high-confidence":
      return "高把握";
    case "needs-validation":
      return "待验证";
    case "revisit":
      return "回访";
    default:
      return "新线索";
  }
}

function confidenceLabel(confidence: DealFlowCard["confidence"]): string {
  switch (confidence) {
    case "high":
      return "高信心";
    case "medium":
      return "中信心";
    default:
      return "低信心";
  }
}

interface DealFlowCandidateCardProps {
  candidate: DealFlowCard;
  pendingFeedbackKey: string | null;
  onFeedback: (candidate: DealFlowCard, kind: DealFlowFeedbackKind) => Promise<void>;
  onTrackInteraction: (candidate: DealFlowCard, kind: "detail_view" | "evidence_expand" | "dwell", note?: string) => void;
  autoFocus?: boolean;
}

function DealFlowCandidateCard({
  candidate,
  pendingFeedbackKey,
  onFeedback,
  onTrackInteraction,
  autoFocus = false
}: DealFlowCandidateCardProps) {
  const [detailOpen, setDetailOpen] = useState(autoFocus);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const dwellKeyRef = useRef<string | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    setDetailOpen(true);
    if (typeof cardRef.current?.scrollIntoView === "function") {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    onTrackInteraction(candidate, "detail_view", "autofocus");
  }, [autoFocus, candidate, onTrackInteraction]);

  useEffect(() => {
    if (!detailOpen && !evidenceOpen) {
      dwellKeyRef.current = null;
      return;
    }

    const timer = window.setTimeout(() => {
      const dwellKey = `${candidate.personId}:${detailOpen ? "detail" : "evidence"}`;
      if (dwellKeyRef.current === dwellKey) {
        return;
      }
      dwellKeyRef.current = dwellKey;
      onTrackInteraction(candidate, "dwell", dwellKey);
    }, 8000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [candidate, detailOpen, evidenceOpen, onTrackInteraction]);

  return (
    <article
      ref={cardRef}
      className={clsx(
        "rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur",
        autoFocus && "ring-2 ring-cyan-300 ring-offset-2 ring-offset-cyan-50"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-900">
              {bucketLabel(candidate.bucket)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {confidenceLabel(candidate.confidence)}
            </span>
            {candidate.state.lastFeedbackKind && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                上次操作: {candidate.state.lastFeedbackKind}
              </span>
            )}
          </div>

          <div>
            <h3 className="text-2xl font-bold text-slate-950">{candidate.name}</h3>
            {candidate.headline && (
              <p className="mt-1 text-sm text-slate-600">{candidate.headline}</p>
            )}
          </div>
        </div>

        <div className="rounded-[20px] bg-slate-950 px-4 py-3 text-right text-white">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Deal Fit</div>
          <div className="mt-1 text-2xl font-bold">{formatScore(candidate.totalScore)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {candidate.directionTags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className={clsx(
              "rounded-full px-3 py-1 text-xs font-medium",
              candidate.overlapTags.includes(tag)
                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                : "bg-slate-100 text-slate-600"
            )}
          >
            {signalBadgeLabel(tag)}
          </span>
        ))}
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-700 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Why This Person</div>
          <p className="mt-2 leading-6">{candidate.whyMatched}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Why Now</div>
          <p className="mt-2 leading-6">{candidate.whyNow}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Approach</div>
          <p className="mt-2 leading-6">{candidate.approachPath}</p>
        </div>
      </div>

      {candidate.whyUncertain && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {candidate.whyUncertain}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {FEEDBACK_ACTIONS.map((action) => {
          const buttonKey = `${candidate.personId}:${action.kind}`;
          return (
            <button
              key={action.kind}
              type="button"
              disabled={pendingFeedbackKey === buttonKey}
              onClick={() => onFeedback(candidate, action.kind)}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60",
                action.tone
              )}
            >
              {pendingFeedbackKey === buttonKey ? "提交中..." : action.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            const next = !detailOpen;
            setDetailOpen(next);
            if (next) {
              onTrackInteraction(candidate, "detail_view");
            }
          }}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          <Eye className="h-4 w-4" />
          {detailOpen ? "收起档案摘要" : "打开档案摘要"}
        </button>

        <button
          type="button"
          onClick={() => {
            const next = !evidenceOpen;
            setEvidenceOpen(next);
            if (next) {
              onTrackInteraction(candidate, "evidence_expand");
            }
          }}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          <Sparkles className="h-4 w-4" />
          {evidenceOpen ? "收起证据" : "展开证据"}
        </button>
      </div>

      {detailOpen && (
        <div className="mt-4 rounded-[24px] bg-slate-950 p-4 text-sm text-slate-100">
          <div className="flex flex-wrap items-center gap-3 text-slate-300">
            <span>方向摘要: {candidate.directionSummary}</span>
            <span>已出现 {candidate.state.seenCount} 次</span>
            <span>细看 {candidate.state.detailViewCount} 次</span>
            <span>复看 {candidate.state.repeatViewCount} 次</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {candidate.sourceBadges.map((source) => (
              <span key={source} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                {source}
              </span>
            ))}
          </div>
          <a
            href={`/profiles/${candidate.personId}`}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200"
          >
            打开完整档案
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      )}

      {evidenceOpen && (
        <div className="mt-4 space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          {candidate.evidencePreview.length === 0 && (
            <p className="text-sm text-slate-500">当前没有可展开的证据片段。</p>
          )}
          {candidate.evidencePreview.map((item) => (
            <div key={item.id} className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {item.type}
                </span>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-cyan-700 hover:text-cyan-900"
                  >
                    原链接
                  </a>
                )}
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{item.title ?? "Untitled evidence"}</div>
              {item.description && (
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function DealFlowBoard({ focusPersonId }: { focusPersonId?: string }) {
  const [viewerId, setViewerId] = useState("");
  const [goalInput, setGoalInput] = useState(DEFAULT_DEAL_FLOW_GOAL);
  const [data, setData] = useState<DealFlowResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingFeedbackKey, setPendingFeedbackKey] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  const allCandidates = data ? [...data.artifact.topToday, ...data.artifact.moreOpportunities] : [];

  async function loadDealFlow(nextViewerId: string, nextGoal: string) {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await getDealFlowAPI({
        viewerId: nextViewerId,
        goal: nextGoal
      });
      saveDealFlowGoal(nextGoal);
      startTransition(() => {
        setData(response);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }

    hydratedRef.current = true;
    const nextViewerId = getOrCreateDealFlowViewerId();
    const savedGoal = readSavedDealFlowGoal();
    setViewerId(nextViewerId);
    setGoalInput(savedGoal);
    void loadDealFlow(nextViewerId, savedGoal);
  }, []);

  const handleTrackInteraction = (candidate: DealFlowCard, kind: "detail_view" | "evidence_expand" | "dwell", note?: string) => {
    if (!viewerId) {
      return;
    }

    void trackDealFlowInteractionAPI({
      viewerId,
      personId: candidate.personId,
      kind,
      directionTags: candidate.directionTags,
      note
    });
  };

  const handleFeedback = async (candidate: DealFlowCard, kind: DealFlowFeedbackKind) => {
    if (!viewerId) {
      return;
    }

    const feedbackKey = `${candidate.personId}:${kind}`;
    setPendingFeedbackKey(feedbackKey);

    try {
      await submitDealFlowFeedbackAPI({
        viewerId,
        personId: candidate.personId,
        kind,
        directionTags: candidate.directionTags
      });
      await loadDealFlow(viewerId, goalInput);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingFeedbackKey(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.15),_transparent_35%),linear-gradient(180deg,#f8fafc_0%,#eef6ff_48%,#f8fafc_100%)]">
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="mb-6 rounded-[28px] border border-cyan-200 bg-cyan-50/80 px-5 py-4 text-sm text-cyan-950 shadow-[0_12px_40px_-24px_rgba(14,165,233,0.35)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">Chat-First Copilot</div>
              <p className="mt-1 leading-6">
                `Deal Flow` 现在是兼容保留的派生视图。新的主入口是 `/chat`，在那里你可以一边自然语言协作，一边在右栏看到当前 session 的推进状态和 top picks。
              </p>
            </div>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              打开 Chat Copilot
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="rounded-[36px] border border-slate-200 bg-white/80 p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
                <Sparkles className="h-4 w-4" />
                Daily Deal Flow
              </div>
              <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-950 md:text-5xl">
                每天给你一份该主动推进的 agent 方向人才清单。
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
                这不是被动搜索结果，而是基于你的方向偏好、历史反馈和最近浏览信号生成的今日推进列表。
              </p>
              <form
                className="mt-6 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!viewerId) {
                    return;
                  }
                  void loadDealFlow(viewerId, goalInput);
                }}
              >
                <label className="block text-sm font-semibold text-slate-700" htmlFor="deal-flow-goal">
                  当前真实目标
                </label>
                <textarea
                  id="deal-flow-goal"
                  value={goalInput}
                  onChange={(event) => setGoalInput(event.target.value)}
                  rows={3}
                  className="w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-cyan-400 focus:bg-white"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={isLoading || !viewerId}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    刷新今日名单
                  </button>
                  {data && (
                    <span className="text-sm text-slate-500">
                      更新于 {formatGeneratedAt(data.artifact.generatedAt)}
                    </span>
                  )}
                </div>
              </form>
            </div>

            {data ? (
              <DealFlowReadout
                data={data}
                generatedAtLabel={`更新于 ${formatGeneratedAt(data.artifact.generatedAt)}`}
              />
            ) : (
              <div className="rounded-[32px] bg-slate-950 p-5 text-white">
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">Model Readout</div>
                <p className="mt-4 text-sm leading-7 text-slate-200">
                  正在根据你的目标和历史动作生成今日名单。
                </p>
              </div>
            )}
          </div>
        </section>

        {errorMessage && (
          <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
            {errorMessage}
          </div>
        )}

        {isLoading && !data && (
          <div className="mt-8 flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在生成今日 deal flow...
          </div>
        )}

        {!isLoading && data && allCandidates.length === 0 && (
          <div className="mt-8 rounded-[32px] border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
            <h2 className="text-xl font-bold text-slate-900">今天的名单还比较稀疏</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              当前目标和已有证据还没有稳定收敛出足够的候选人。先补一版更具体的目标，或者先在搜索页跑几轮探索。
            </p>
          </div>
        )}

        {data && allCandidates.length > 0 && (
          <>
            <section className="mt-8">
              <div className="mb-4 flex items-center gap-3">
                <CheckCheck className="h-5 w-5 text-emerald-600" />
                <h2 className="text-2xl font-bold text-slate-950">今天先推进这 3 位</h2>
              </div>
              <div className="grid gap-5 xl:grid-cols-3">
                {data.artifact.topToday.map((candidate) => (
                  <DealFlowCandidateCard
                    key={candidate.personId}
                    candidate={candidate}
                    pendingFeedbackKey={pendingFeedbackKey}
                    onFeedback={handleFeedback}
                    onTrackInteraction={handleTrackInteraction}
                    autoFocus={focusPersonId === candidate.personId}
                  />
                ))}
              </div>
            </section>

            {data.artifact.moreOpportunities.length > 0 && (
              <section className="mt-10">
                <div className="mb-4 flex items-center gap-3">
                  <Clock3 className="h-5 w-5 text-amber-700" />
                  <h2 className="text-2xl font-bold text-slate-950">保持温度，但别分心</h2>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  {data.artifact.moreOpportunities.map((candidate) => (
                    <DealFlowCandidateCard
                      key={candidate.personId}
                      candidate={candidate}
                      pendingFeedbackKey={pendingFeedbackKey}
                      onFeedback={handleFeedback}
                      onTrackInteraction={handleTrackInteraction}
                      autoFocus={focusPersonId === candidate.personId}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
