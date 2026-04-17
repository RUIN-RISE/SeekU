"use client";

import { clsx } from "clsx";
import Link from "next/link";
import {
  AlertTriangle,
  Clock3,
  GitCompareArrows,
  Loader2,
  Network,
  RefreshCcw,
  Sparkles,
  Target
} from "lucide-react";
import { useAgentPanelSession } from "@/hooks/useAgentPanelSession";
import { useDealFlowSummary } from "@/hooks/useDealFlowSummary";
import type { DealFlowCard, DealFlowResponse } from "@/lib/api";
import { DealFlowReadout } from "@/components/DealFlowReadout";
import type {
  AgentPanelCandidateSnapshot,
  AgentPanelConnectionStatus,
  AgentPanelSessionEvent,
  AgentPanelSessionSnapshot
} from "@/lib/agent-panel";

interface ChatCopilotWorkboardProps {
  sessionId?: string;
}

interface ChatCopilotWorkboardViewProps {
  sessionId?: string;
  snapshot: AgentPanelSessionSnapshot | null;
  events: AgentPanelSessionEvent[];
  connectionStatus: AgentPanelConnectionStatus;
  errorMessage: string | null;
  retryConnection: () => void;
  dealFlowData: DealFlowResponse | null;
  dealFlowError: string | null;
  isDealFlowLoading: boolean;
}

interface FocusSection {
  title: string;
  subtitle: string;
  mode: "goal" | "shortlist" | "compare" | "recommendation";
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

function signalSourceLabel(signal: DealFlowResponse["goalModel"]["signalSources"][number]): string {
  switch (signal) {
    case "explicit_goal":
      return "explicit goal";
    case "current_conditions":
      return "current conditions";
    case "search_history":
      return "search history";
    case "feedback":
      return "feedback";
    case "interaction":
      return "interaction";
    default:
      return signal;
  }
}

const connectionLabelMap: Record<AgentPanelConnectionStatus, string> = {
  live: "实时连接中",
  connecting: "正在连接",
  reconnecting: "正在重连",
  disconnected: "事件流断开",
  missing: "会话不存在",
  error: "连接失败"
};

const connectionToneMap: Record<AgentPanelConnectionStatus, string> = {
  live: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  connecting: "bg-sky-50 text-sky-700 ring-sky-200",
  reconnecting: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  disconnected: "bg-amber-50 text-amber-700 ring-amber-200",
  missing: "bg-rose-50 text-rose-700 ring-rose-200",
  error: "bg-rose-50 text-rose-700 ring-rose-200"
};

function formatTimestamp(value?: string): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateTime(value?: string): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function buildConditionChips(snapshot: AgentPanelSessionSnapshot): string[] {
  const chips: string[] = [];
  const conditions = snapshot.currentConditions;

  if (conditions.role) {
    chips.push(`角色: ${conditions.role}`);
  }
  if (conditions.skills.length > 0) {
    chips.push(...conditions.skills.map((skill) => `技能: ${skill}`));
  }
  if (conditions.locations.length > 0) {
    chips.push(...conditions.locations.map((location) => `地点: ${location}`));
  }
  if (conditions.mustHave.length > 0) {
    chips.push(...conditions.mustHave.map((item) => `必须: ${item}`));
  }
  if (conditions.exclude.length > 0) {
    chips.push(...conditions.exclude.map((item) => `排除: ${item}`));
  }
  if (conditions.preferFresh) {
    chips.push("偏近期执行");
  }

  return chips.slice(0, 8);
}

function deriveNow(
  snapshot: AgentPanelSessionSnapshot | null,
  connectionStatus: AgentPanelConnectionStatus,
  hasSessionId: boolean
): { title: string; detail: string } {
  if (!hasSessionId) {
    return {
      title: "等待绑定可见 session",
      detail: "在 URL 里附带 `?sessionId=...` 后，这里会开始跟踪当前 CLI runtime。"
    };
  }

  if (!snapshot) {
    if (connectionStatus === "missing") {
      return {
        title: "当前没有活跃 session",
        detail: "先在 CLI 中启动一次可见 agent，会话建立后再回到这个页面。"
      };
    }

    return {
      title: "正在拉取第一份 snapshot",
      detail: "聊天区可以继续使用，右栏会在 runtime 可见后切到实时工作板。"
    };
  }

  switch (snapshot.status) {
    case "clarifying":
      return {
        title: "Clarifying goal",
        detail: "当前在补足这轮搜索还缺的一条关键约束。"
      };
    case "searching":
      return {
        title: "Searching candidates",
        detail: "当前约束已足够，runtime 正在扩出候选池。"
      };
    case "shortlist":
      return {
        title: "Narrowing shortlist",
        detail: "runtime 正在把宽候选池压成更可信的小集合。"
      };
    case "comparing":
      return {
        title: "Comparing finalists",
        detail: "已经进入 2 到 3 人的结构化对比阶段。"
      };
    case "waiting-input":
      return {
        title: snapshot.recommendedCandidate ? "Waiting on your steer" : "Waiting on your next message",
        detail: snapshot.recommendedCandidate
          ? "当前已经形成建议，下一步适合用自然语言纠偏或推进。"
          : "本轮 runtime 已经停在一个可继续推进的位置。"
      };
    case "completed":
      return {
        title: "Completed",
        detail: "本轮 session 已经收敛到一个结束态。"
      };
    case "blocked":
      return {
        title: "Blocked",
        detail: "当前状态不足以继续推进，需要你给新的方向。"
      };
    default:
      return {
        title: "Idle",
        detail: "runtime 已连接，但还没有进入明确推进阶段。"
      };
  }
}

function deriveWhy(
  snapshot: AgentPanelSessionSnapshot | null,
  connectionStatus: AgentPanelConnectionStatus,
  hasSessionId: boolean
): string {
  if (!hasSessionId) {
    return "这个版本仍然要求显式绑定 sessionId，避免浏览器自己猜测业务态。";
  }

  if (!snapshot) {
    if (connectionStatus === "missing") {
      return "当前没有可恢复的权威 session，所以右栏只显示空闲引导态。";
    }

    if (connectionStatus === "disconnected" || connectionStatus === "error") {
      return "事件流暂时不可用，因此右栏不会编造新的进展。";
    }

    return "workboard 需要先拿到第一份权威 snapshot，才能安全地解释这轮状态。";
  }

  switch (snapshot.status) {
    case "clarifying":
      return "当前条件还不足以支持一个可信 shortlist，先补关键信号比盲搜更稳。";
    case "searching":
      return "约束已经够用，先扩出候选池再收敛，比继续追问更高效。";
    case "shortlist":
      return "搜索结果已经出来了，现在更重要的是提升信噪比，而不是继续扩大范围。";
    case "comparing":
      return "候选人已经收敛到可比较规模，适合进入结构化判断。";
    case "waiting-input":
      if (snapshot.recommendedCandidate) {
        return "当前已经形成建议，所以 runtime 暂停在等待你确认或纠偏的位置。";
      }

      if (snapshot.openUncertainties.length > 0) {
        return snapshot.openUncertainties[0];
      }

      return "这轮已经推进到一个可继续由你自然语言接管的节点。";
    case "blocked":
      return "当前信息不足或方向矛盾，继续自动推进只会放大噪声。";
    case "completed":
      return "这轮会话已经完成，右栏现在主要承担结果回看。";
    default:
      return snapshot.statusSummary ?? "runtime 已连接，但还没有明确到能解释成更多工作叙事。";
  }
}

function deriveMovement(
  snapshot: AgentPanelSessionSnapshot | null,
  events: AgentPanelSessionEvent[]
): { label: string; summary: string; timestamp?: string } {
  const latest = [...events].reverse().find((event) => (
    [
      "goal_updated",
      "conditions_updated",
      "search_started",
      "search_completed",
      "shortlist_updated",
      "compare_updated",
      "recommendation_updated",
      "uncertainty_updated",
      "confidence_updated"
    ].includes(event.type)
  ));

  if (latest) {
    return {
      label: latest.type,
      summary: latest.summary,
      timestamp: latest.timestamp
    };
  }

  if (!snapshot) {
    return {
      label: "idle",
      summary: "还没有收到足够的结构化进展事件。"
    };
  }

  if (snapshot.currentShortlist.length > 0) {
    return {
      label: "shortlist",
      summary: `当前 shortlist 里有 ${snapshot.currentShortlist.length} 位候选人。`
    };
  }

  return {
    label: snapshot.status,
    summary: snapshot.statusSummary ?? "当前没有新的结构化变动。"
  };
}

function deriveFocus(snapshot: AgentPanelSessionSnapshot | null): FocusSection {
  if (!snapshot) {
    return {
      title: "Session not attached",
      subtitle: "先绑定 sessionId，右栏才会出现当前会话的产物。",
      mode: "goal"
    };
  }

  if (snapshot.recommendedCandidate) {
    return {
      title: "Top picks right now",
      subtitle: "当前 session 已经形成建议，先看最值得推进的人。",
      mode: "recommendation"
    };
  }

  if (snapshot.activeCompareSet.length > 0 || snapshot.status === "comparing") {
    return {
      title: "Compare set",
      subtitle: "这轮已经进入候选人收敛阶段，右栏展示当前对比核心。",
      mode: "compare"
    };
  }

  if (snapshot.currentShortlist.length > 0) {
    return {
      title: "Top picks right now",
      subtitle: "deal flow 在这里先表现为 session 内最值得看的候选集合。",
      mode: "shortlist"
    };
  }

  return {
    title: "Goal summary",
    subtitle: "当前还没有稳定候选输出，先盯住这轮 session 的方向定义。",
    mode: "goal"
  };
}

function FocusCandidateCard({
  candidate,
  emphasis
}: {
  candidate: AgentPanelCandidateSnapshot;
  emphasis?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-slate-900">{candidate.name}</h4>
          <p className="mt-1 text-sm text-slate-500">
            {candidate.headline ?? "等待更多身份描述"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {[candidate.location, candidate.company].filter(Boolean).join(" · ") || "位置信息待补充"}
          </p>
        </div>
        <div className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
          {formatScore(candidate.matchScore)}
        </div>
      </div>

      {emphasis && (
        <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
          {emphasis}
        </p>
      )}

      {candidate.queryReasons && candidate.queryReasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidate.queryReasons.slice(0, 3).map((reason) => (
            <span
              key={`${candidate.personId}:${reason}`}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600"
            >
              {reason}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function dealFlowCardToCandidate(card: DealFlowCard): AgentPanelCandidateSnapshot {
  return {
    personId: card.personId,
    name: card.name,
    headline: card.headline,
    location: null,
    company: null,
    experienceYears: null,
    matchScore: card.totalScore,
    profile: {
      summary: card.directionSummary,
      highlights: [card.whyMatched, card.approachPath]
    },
    queryReasons: [card.whyMatched, card.whyNow],
    sources: card.sourceBadges
  };
}

function ProactiveCandidateCard({ candidate, index }: { candidate: DealFlowCard; index: number }) {
  return (
    <article className="rounded-2xl border border-cyan-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">
              {index === 0 ? "Today #1" : `Today #${index + 1}`}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              {bucketLabel(candidate.bucket)}
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              {confidenceLabel(candidate.confidence)}
            </span>
          </div>
          <h4 className="mt-3 truncate text-sm font-semibold text-slate-900">{candidate.name}</h4>
          <p className="mt-1 text-sm text-slate-500">
            {candidate.headline ?? "等待更多身份描述"}
          </p>
        </div>
        <div className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
          {formatScore(candidate.totalScore)}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-xl bg-cyan-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">Why Now</div>
          <p className="mt-1 text-xs leading-5 text-cyan-950">{candidate.whyNow}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Approach</div>
          <p className="mt-1 text-xs leading-5 text-slate-700">{candidate.approachPath}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {candidate.overlapTags.slice(0, 3).map((tag) => (
          <span
            key={`${candidate.personId}:${tag}`}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600"
          >
            {tag.replace(/_/g, " ")}
          </span>
        ))}
      </div>
      <div className="mt-4">
        <Link
          href={`/deal-flow?personId=${encodeURIComponent(candidate.personId)}`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-700 transition-colors hover:text-cyan-900"
        >
          在 Deal Flow 中查看并反馈
        </Link>
      </div>
    </article>
  );
}

function ProactiveFocusCard({ dealFlowData }: { dealFlowData: DealFlowResponse }) {
  const leadCandidate = dealFlowData.artifact.topToday[0] ?? null;

  return (
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Today Top Picks
          </div>
          <p className="mt-1 text-xs text-cyan-800">
            更新于 {formatDateTime(dealFlowData.artifact.generatedAt) ?? dealFlowData.artifact.generatedForDate}
          </p>
        </div>
        <div className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-cyan-900 ring-1 ring-cyan-200">
          {dealFlowData.artifact.totalCandidates} candidates
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-cyan-950">
        {dealFlowData.goalModel.summary}
      </p>
      {dealFlowData.driftNote && (
        <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-cyan-900 ring-1 ring-cyan-200">
          {dealFlowData.driftNote}
        </div>
      )}
      <div className="mt-4">
        <DealFlowReadout
          data={dealFlowData}
          compact
          generatedAtLabel={formatDateTime(dealFlowData.artifact.generatedAt) ?? dealFlowData.artifact.generatedForDate}
        />
      </div>
      <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-cyan-950 ring-1 ring-cyan-200/70">
        当前 goal: {dealFlowData.goalModel.explicitGoal ?? "暂时沿用最近行为和反馈信号"}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {dealFlowData.goalModel.signalSources.map((signal) => (
          <span
            key={signal}
            className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] text-cyan-900 ring-1 ring-cyan-200"
          >
            {signalSourceLabel(signal)}
          </span>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {dealFlowData.artifact.topToday.slice(0, 3).map((candidate, index) => (
          <ProactiveCandidateCard
            key={candidate.personId}
            candidate={candidate}
            index={index}
          />
        ))}
      </div>
      {leadCandidate && leadCandidate.evidencePreview.length > 0 && (
        <div className="mt-4 rounded-2xl border border-cyan-200 bg-white/80 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
            Lead Evidence
          </div>
          <div className="mt-3 space-y-2">
            {leadCandidate.evidencePreview.slice(0, 2).map((item) => (
              <div key={item.id} className="rounded-xl bg-cyan-50 px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                  {item.type}
                </div>
                <p className="mt-1 text-xs font-semibold text-cyan-950">
                  {item.title ?? "Untitled evidence"}
                </p>
                {item.description && (
                  <p className="mt-1 text-xs leading-5 text-cyan-900">{item.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {dealFlowData.artifact.moreOpportunities.length > 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-cyan-200 bg-white/70 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
            More Opportunities
          </div>
          <div className="mt-3 space-y-2">
            {dealFlowData.artifact.moreOpportunities.slice(0, 3).map((candidate) => (
              <div
                key={candidate.personId}
                className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-3 ring-1 ring-cyan-100"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">{candidate.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {candidate.headline ?? "等待更多身份描述"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{candidate.whyNow}</p>
                </div>
                <div className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                  {formatScore(candidate.totalScore)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Link
              href="/deal-flow"
              className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-700 transition-colors hover:text-cyan-900"
            >
              打开完整 Deal Flow 深入查看
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatCopilotWorkboard({ sessionId }: ChatCopilotWorkboardProps) {
  const normalizedSessionId = sessionId?.trim();
  const dealFlow = useDealFlowSummary();
  const session = useAgentPanelSession(normalizedSessionId ?? "");

  return (
    <ChatCopilotWorkboardView
      sessionId={normalizedSessionId}
      snapshot={normalizedSessionId ? session.snapshot : null}
      events={normalizedSessionId ? session.events : []}
      connectionStatus={normalizedSessionId ? session.connectionStatus : "connecting"}
      errorMessage={normalizedSessionId ? session.errorMessage : null}
      retryConnection={normalizedSessionId ? session.retryConnection : (() => undefined)}
      dealFlowData={dealFlow.data}
      dealFlowError={dealFlow.errorMessage}
      isDealFlowLoading={dealFlow.isLoading}
    />
  );
}

export function ChatCopilotWorkboardView({
  sessionId,
  snapshot,
  events,
  connectionStatus,
  errorMessage,
  retryConnection,
  dealFlowData,
  dealFlowError,
  isDealFlowLoading
}: ChatCopilotWorkboardViewProps) {
  const hasSessionId = Boolean(sessionId?.trim());
  const now = deriveNow(snapshot, connectionStatus, hasSessionId);
  const why = deriveWhy(snapshot, connectionStatus, hasSessionId);
  const movement = deriveMovement(snapshot, events);
  const focus = deriveFocus(snapshot);
  const chips = snapshot ? buildConditionChips(snapshot) : [];

  return (
    <aside className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Session Copilot
          </div>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">Narrated Workboard</h2>
        </div>
        <div
          className={clsx(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1",
            connectionToneMap[connectionStatus]
          )}
        >
          {(connectionStatus === "connecting" || connectionStatus === "reconnecting") ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Network className="h-3.5 w-3.5" />
          )}
          {connectionLabelMap[connectionStatus]}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Current Session
              </div>
              <p className="mt-2 truncate font-mono text-xs text-slate-600">
                {hasSessionId ? sessionId : "未绑定"}
              </p>
            </div>
            {hasSessionId && (
              <button
                type="button"
                onClick={retryConnection}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                重连
              </button>
            )}
          </div>

          {errorMessage && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {snapshot?.userGoal && (
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Goal
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-700">{snapshot.userGoal}</p>
            </div>
          )}

          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            <Sparkles className="h-3.5 w-3.5" />
            Now
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-900">{now.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{now.detail}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            <Target className="h-3.5 w-3.5" />
            Why
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{why}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <Clock3 className="h-3.5 w-3.5" />
              Movement
            </div>
            {movement.timestamp && (
              <span className="text-xs text-slate-400">{formatTimestamp(movement.timestamp)}</span>
            )}
          </div>
          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">{movement.label}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{movement.summary}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            <GitCompareArrows className="h-3.5 w-3.5" />
            Focus
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-900">{focus.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{focus.subtitle}</p>

          <div className="mt-4 space-y-3">
            {isDealFlowLoading && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                正在拉取今日 top picks...
              </div>
            )}

            {dealFlowError && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                今日 deal flow 暂时不可用：{dealFlowError}
              </div>
            )}

            {dealFlowData && <ProactiveFocusCard dealFlowData={dealFlowData} />}

            {focus.mode === "goal" && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                {snapshot?.userGoal
                  ? snapshot.userGoal
                  : "当前还没有绑定到一个活跃 session，因此这里只有 chat-first 的空闲态。"}
              </div>
            )}

            {focus.mode === "shortlist" && snapshot?.currentShortlist.slice(0, 3).map((candidate, index) => (
              <FocusCandidateCard
                key={candidate.personId}
                candidate={candidate}
                emphasis={index === 0 ? "当前最值得先看的候选人。" : undefined}
              />
            ))}

            {focus.mode === "compare" && snapshot?.activeCompareSet.map((candidate) => (
              <FocusCandidateCard
                key={candidate.personId}
                candidate={candidate}
                emphasis="已进入 compare 集合。"
              />
            ))}

            {focus.mode === "recommendation" && snapshot?.recommendedCandidate && (
              <>
                <FocusCandidateCard
                  candidate={snapshot.recommendedCandidate.candidate}
                  emphasis={snapshot.recommendedCandidate.rationale ?? "当前 session 的建议候选人。"}
                />
                {snapshot.currentShortlist.slice(1, 3).map((candidate) => (
                  <FocusCandidateCard
                    key={candidate.personId}
                    candidate={candidate}
                  />
                ))}
              </>
            )}

            {snapshot && focus.mode !== "goal" && focus.mode !== "compare" && focus.mode !== "recommendation" && snapshot.currentShortlist.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                当前还没有稳定候选输出。
              </div>
            )}

            {snapshot && focus.mode === "compare" && snapshot.activeCompareSet.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                compare 集合还没准备好。
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
