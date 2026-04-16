"use client";

import { clsx } from "clsx";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CircleAlert,
  Clock3,
  Eye,
  Loader2,
  Network,
  RefreshCcw,
  Sparkles,
  Target,
  Waves
} from "lucide-react";
import { useAgentPanelSession, type UseAgentPanelSessionResult } from "@/hooks/useAgentPanelSession";
import {
  FEEDBACK_TAG_OPTIONS,
  type AgentPanelCandidateSnapshot,
  type AgentPanelConnectionStatus,
  type AgentPanelInterventionCommand,
  type AgentPanelSessionEvent,
  type AgentPanelSessionSnapshot
} from "@/lib/agent-panel";

interface AgentPanelProps {
  sessionId: string;
}

interface AgentPanelViewProps extends UseAgentPanelSessionResult {
  sessionId: string;
}

interface TimelineItem {
  id: string;
  role: "user" | "assistant" | "operator";
  label: string;
  summary: string;
  timestamp?: string;
}

const statusLabelMap: Record<string, string> = {
  idle: "Idle",
  clarifying: "澄清中",
  searching: "搜索中",
  shortlist: "Shortlist",
  comparing: "Compare 中",
  "waiting-input": "等待输入",
  blocked: "阻塞",
  completed: "已完成"
};

const connectionToneMap: Record<AgentPanelConnectionStatus, string> = {
  live: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
  connecting: "bg-sky-500/15 text-sky-100 ring-sky-400/30",
  disconnected: "bg-amber-500/15 text-amber-100 ring-amber-400/30",
  missing: "bg-rose-500/15 text-rose-100 ring-rose-400/30",
  error: "bg-rose-500/15 text-rose-100 ring-rose-400/30"
};

const connectionLabelMap: Record<AgentPanelConnectionStatus, string> = {
  live: "实时连接中",
  connecting: "正在连接",
  disconnected: "事件流断开",
  missing: "会话不存在",
  error: "连接失败"
};

function formatTimestamp(value?: string): string {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatRelativeDate(value?: string): string | null {
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
  const conditions = snapshot.currentConditions;
  const chips: string[] = [];

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
  if (conditions.niceToHave.length > 0) {
    chips.push(...conditions.niceToHave.map((item) => `加分: ${item}`));
  }
  if (conditions.exclude.length > 0) {
    chips.push(...conditions.exclude.map((item) => `排除: ${item}`));
  }
  if (conditions.sourceBias) {
    chips.push(`来源偏好: ${conditions.sourceBias}`);
  }
  if (conditions.preferFresh) {
    chips.push("偏近期执行");
  }

  return chips.slice(0, 10);
}

function buildConversationItems(
  snapshot: AgentPanelSessionSnapshot | null,
  events: AgentPanelSessionEvent[]
): TimelineItem[] {
  const items: TimelineItem[] = [];

  if (snapshot?.userGoal) {
    items.push({
      id: `goal:${snapshot.sessionId}`,
      role: "user",
      label: "Goal",
      summary: snapshot.userGoal
    });
  }

  for (const event of events) {
    if (![
      "goal_updated",
      "conditions_updated",
      "recommendation_updated",
      "uncertainty_updated",
      "intervention_received",
      "intervention_applied",
      "intervention_rejected"
    ].includes(event.type)) {
      continue;
    }

    const role =
      event.type === "goal_updated"
        ? "user"
        : event.type.startsWith("intervention_")
          ? "operator"
          : "assistant";

    const label =
      event.type === "conditions_updated"
        ? "Condition Shift"
        : event.type === "recommendation_updated"
          ? "Recommendation"
          : event.type === "uncertainty_updated"
            ? "Uncertainty"
            : event.type === "goal_updated"
              ? "Goal"
              : "Intervention";

    items.push({
      id: `event:${event.sequence}`,
      role,
      label,
      summary: event.summary,
      timestamp: event.timestamp
    });
  }

  return items.slice(-8);
}

function buildExecutionFeed(events: AgentPanelSessionEvent[]): AgentPanelSessionEvent[] {
  return events.filter((event) => !["goal_updated", "conditions_updated"].includes(event.type)).slice(-12);
}

function deriveNextStep(
  snapshot: AgentPanelSessionSnapshot | null,
  connectionStatus: AgentPanelConnectionStatus
): { title: string; detail: string; tone: string } {
  if (connectionStatus === "missing") {
    return {
      title: "先启动一个 CLI session",
      detail: "当前页面没有连到活跃 runtime。先在终端跑一次 agent 搜索，再刷新这个 sessionId。",
      tone: "from-rose-500/30 to-orange-500/20 border-rose-300/20"
    };
  }

  if (connectionStatus === "disconnected" || connectionStatus === "error") {
    return {
      title: "保持页面开启，等待 bridge 重连",
      detail: "面板保留最近一次快照，但新事件暂时进不来。",
      tone: "from-amber-500/30 to-yellow-500/20 border-amber-300/20"
    };
  }

  if (!snapshot) {
    return {
      title: "等待 snapshot",
      detail: "面板正在拉取当前 session 的第一份结构化快照。",
      tone: "from-sky-500/30 to-cyan-500/20 border-sky-300/20"
    };
  }

  if (snapshot.status === "clarifying") {
    return {
      title: "先把目标澄清完",
      detail: "现在最值钱的是补一条关键约束，而不是过早 compare。",
      tone: "from-sky-500/30 to-cyan-500/20 border-sky-300/20"
    };
  }

  if (snapshot.status === "searching") {
    return {
      title: "让 agent 继续检索",
      detail: "这轮还在搜证据，先观察 shortlist 是否开始收敛。",
      tone: "from-indigo-500/30 to-sky-500/20 border-indigo-300/20"
    };
  }

  if (snapshot.status === "shortlist" && snapshot.activeCompareSet.length < Math.min(snapshot.currentShortlist.length, 3)) {
    return {
      title: "挑 2 到 3 位候选人进入 compare",
      detail: "现在 shortlist 已经出来了，适合把最强几位推进对比。",
      tone: "from-blue-500/30 to-cyan-500/20 border-blue-300/20"
    };
  }

  if (snapshot.openUncertainties.length > 0) {
    return {
      title: "先压缩不确定性",
      detail: snapshot.openUncertainties[0],
      tone: "from-amber-500/30 to-orange-500/20 border-amber-300/20"
    };
  }

  if (snapshot.recommendedCandidate) {
    return {
      title: "检查推荐理由，再决定是否轻量纠偏",
      detail: snapshot.recommendedCandidate.rationale ?? "当前已经形成候选人推荐。",
      tone: "from-emerald-500/30 to-teal-500/20 border-emerald-300/20"
    };
  }

  return {
    title: "继续观察下一步 runtime 事件",
    detail: "当前 session 没有明显阻塞点，适合让 agent 再推进一轮。",
    tone: "from-slate-500/30 to-slate-400/20 border-slate-300/20"
  };
}

function recommendationPosture(snapshot: AgentPanelSessionSnapshot | null): {
  label: string;
  tone: string;
} {
  if (!snapshot?.recommendedCandidate) {
    return {
      label: "未形成推荐",
      tone: "bg-slate-100 text-slate-600"
    };
  }

  if (snapshot.confidenceStatus.level === "high") {
    return {
      label: "清晰推荐",
      tone: "bg-emerald-100 text-emerald-700"
    };
  }

  return {
    label: "条件式推荐",
    tone: "bg-amber-100 text-amber-700"
  };
}

function actionButtonClass(disabled: boolean): string {
  return clsx(
    "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
    disabled
      ? "cursor-not-allowed bg-slate-100 text-slate-400"
      : "bg-slate-900 text-white hover:bg-blue-700"
  );
}

function CandidateActionCard({
  candidate,
  compareFull,
  inCompareSet,
  expanded,
  isBusy,
  onCommand
}: {
  candidate: AgentPanelCandidateSnapshot;
  compareFull: boolean;
  inCompareSet: boolean;
  expanded: boolean;
  isBusy: (command: AgentPanelInterventionCommand) => boolean;
  onCommand: (command: AgentPanelInterventionCommand) => Promise<void>;
}) {
  const addCommand = {
    type: "add_to_compare" as const,
    candidateId: candidate.personId
  };
  const removeCommand = {
    type: "remove_from_shortlist" as const,
    candidateId: candidate.personId
  };
  const expandCommand = {
    type: "expand_evidence" as const,
    candidateId: candidate.personId
  };
  const addDisabled = compareFull && !inCompareSet;

  return (
    <article className="rounded-[20px] border border-slate-200 bg-white/95 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-bold text-slate-900">{candidate.name}</h4>
            {inCompareSet && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                Compare
              </span>
            )}
          </div>
          {candidate.headline && (
            <p className="mt-1 text-sm text-slate-500">{candidate.headline}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {[candidate.location, candidate.company].filter(Boolean).join(" · ") || "位置信息待补充"}
          </p>
        </div>
        <div className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
          {formatScore(candidate.matchScore)}
        </div>
      </div>

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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={addDisabled || isBusy(addCommand)}
          className={actionButtonClass(addDisabled || isBusy(addCommand))}
          aria-label={`加入 compare ${candidate.name}`}
          onClick={() => void onCommand(addCommand)}
        >
          {isBusy(addCommand) ? "处理中..." : inCompareSet ? "已在 Compare" : "加入 Compare"}
        </button>
        <button
          type="button"
          disabled={isBusy(removeCommand)}
          className={actionButtonClass(isBusy(removeCommand))}
          aria-label={`移出 shortlist ${candidate.name}`}
          onClick={() => void onCommand(removeCommand)}
        >
          {isBusy(removeCommand) ? "处理中..." : "移出 Shortlist"}
        </button>
        <button
          type="button"
          disabled={isBusy(expandCommand)}
          className={clsx(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            isBusy(expandCommand)
              ? "cursor-not-allowed bg-slate-100 text-slate-400"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100"
          )}
          aria-label={`展开证据 ${candidate.name}`}
          onClick={() => void onCommand(expandCommand)}
        >
          {isBusy(expandCommand) ? "处理中..." : expanded ? "证据已展开" : "展开证据"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-3 text-slate-100">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
            <Eye className="h-3.5 w-3.5" />
            Evidence Snapshot
          </div>
          {candidate.profile?.summary && (
            <p className="mt-2 text-sm leading-6 text-slate-200">{candidate.profile.summary}</p>
          )}
          {candidate.profile?.highlights && candidate.profile.highlights.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {candidate.profile.highlights.slice(0, 4).map((highlight) => (
                <span
                  key={`${candidate.personId}:${highlight}`}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-200"
                >
                  {highlight}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">
            来源: {candidate.sources.join(" · ") || "等待更多证据"}
          </p>
        </div>
      )}
    </article>
  );
}

function EmptyPanel({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function AgentPanel({ sessionId }: AgentPanelProps) {
  const session = useAgentPanelSession(sessionId);
  return <AgentPanelView sessionId={sessionId} {...session} />;
}

export function AgentPanelView({
  sessionId,
  snapshot,
  events,
  connectionStatus,
  expandedCandidate,
  latestNotice,
  errorMessage,
  pendingCommandKey,
  sendIntervention,
  retryConnection,
  isCommandPending
}: AgentPanelViewProps) {
  const nextStep = deriveNextStep(snapshot, connectionStatus);
  const conversation = buildConversationItems(snapshot, events);
  const executionFeed = buildExecutionFeed(events);
  const chips = snapshot ? buildConditionChips(snapshot) : [];
  const posture = recommendationPosture(snapshot);
  const compareSetIds = new Set(snapshot?.activeCompareSet.map((candidate) => candidate.personId) ?? []);
  const compareFull = (snapshot?.activeCompareSet.length ?? 0) >= 3;

  return (
    <div className="min-h-screen bg-bg-dark text-text-light antialiased">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.22),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.16),_transparent_32%)]" />
      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_20px_80px_rgba(2,6,23,0.4)] backdrop-blur-sm">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-sky-200/80">
                <Waves className="h-4 w-4" />
                Visible Agent Copilot
              </div>
              <h1 className="mt-2 font-english-display text-3xl font-extrabold tracking-tight text-white">
                Agent Panel
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                这个页面只渲染 CLI runtime 的结构化事件，不在前端维护独立 shortlist 或 compare 业务态。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300">
                <span className="mr-2 text-slate-500">session</span>
                <span className="font-mono text-xs text-white">{sessionId}</span>
              </div>
              <div
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ring-1",
                  connectionToneMap[connectionStatus]
                )}
              >
                {connectionStatus === "connecting" && <Loader2 className="h-4 w-4 animate-spin" />}
                {connectionStatus !== "connecting" && <Network className="h-4 w-4" />}
                {connectionLabelMap[connectionStatus]}
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/10"
                onClick={retryConnection}
              >
                <RefreshCcw className="h-4 w-4" />
                重连
              </button>
            </div>
          </div>

          {(errorMessage || latestNotice) && (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {errorMessage && (
                <div className="flex items-start gap-3 rounded-[20px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
              {latestNotice && (
                <div
                  className={clsx(
                    "flex items-start gap-3 rounded-[20px] px-4 py-3 text-sm",
                    latestNotice.kind === "success"
                      ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                      : latestNotice.kind === "error"
                        ? "border border-rose-400/20 bg-rose-500/10 text-rose-100"
                        : "border border-sky-400/20 bg-sky-500/10 text-sky-100"
                  )}
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{latestNotice.message}</span>
                </div>
              )}
            </div>
          )}

          {!snapshot && connectionStatus === "missing" && (
            <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/50 px-6 py-8">
              <h2 className="text-xl font-bold text-white">当前没有可展示的 session</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                这个版本还没有 session 发现页，所以需要直接打开一个活跃的 sessionId。先在 CLI 里启动 agent，
                再把该 sessionId 放到 `/agent-panel/[sessionId]` 路由里。
              </p>
            </div>
          )}

          {!snapshot && connectionStatus !== "missing" && (
            <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/50 px-6 py-8">
              <h2 className="text-xl font-bold text-white">等待第一份 session snapshot</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                面板已经就绪，正在从本地 bridge 拉取这条 CLI session 的结构化状态。
              </p>
            </div>
          )}

          {snapshot && (
            <div className="mt-6 grid gap-5 xl:grid-cols-[1.05fr_1.35fr]">
              <div className="space-y-5">
                <section className={clsx("rounded-[24px] border bg-gradient-to-br p-5", nextStep.tone)}>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/70">
                    <Sparkles className="h-4 w-4" />
                    Next Step
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-white">{nextStep.title}</h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-100/85">{nextStep.detail}</p>
                </section>

                <section className="rounded-[24px] border border-white/10 bg-slate-950/45 p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">对话线</h2>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Narrative</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {conversation.length === 0 && (
                      <EmptyPanel
                        title="还没有足够的对话线索"
                        description="等 runtime 继续发出目标更新、推荐变化或干预事件后，这里会补齐会话叙事。"
                      />
                    )}
                    {conversation.map((item) => (
                      <div
                        key={item.id}
                        className={clsx(
                          "rounded-[18px] px-4 py-3",
                          item.role === "user"
                            ? "bg-blue-500/15 text-blue-50"
                            : item.role === "operator"
                              ? "bg-amber-500/15 text-amber-50"
                              : "bg-white/5 text-slate-100"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] uppercase tracking-[0.18em] text-white/55">{item.label}</span>
                          {item.timestamp && (
                            <span className="text-xs text-white/45">{formatTimestamp(item.timestamp)}</span>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-6">{item.summary}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[24px] border border-white/10 bg-slate-950/45 p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">执行事件</h2>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Execution Feed</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {executionFeed.length === 0 && (
                      <EmptyPanel
                        title="还没有高价值事件"
                        description="等 agent 开始搜索、更新 shortlist 或 compare 后，这里会变成实时执行流。"
                      />
                    )}
                    {executionFeed.map((event) => (
                      <div key={event.sequence} className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Activity className="h-4 w-4 text-sky-300" />
                            {event.summary}
                          </div>
                          <span className="text-xs text-slate-500">{formatTimestamp(event.timestamp)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                          <span>{statusLabelMap[event.status] ?? event.status}</span>
                          <span>#{event.sequence}</span>
                          <span>{event.type}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="grid gap-5">
                <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                  <section className="rounded-[24px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_12px_50px_rgba(15,23,42,0.08)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold">Session Snapshot</h2>
                        <p className="mt-1 text-sm text-slate-500">当前目标、条件与运行姿态</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {snapshot.statusSummary ?? statusLabelMap[snapshot.status] ?? snapshot.status}
                      </span>
                    </div>

                    <div className="mt-5">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">User Goal</div>
                      <p className="mt-2 text-base font-semibold leading-7 text-slate-900">
                        {snapshot.userGoal ?? "等待用户给出明确目标"}
                      </p>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[18px] bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Confidence</div>
                        <p className="mt-2 text-2xl font-bold text-slate-900">{snapshot.confidenceStatus.level}</p>
                      </div>
                      <div className="rounded-[18px] bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Clarifications</div>
                        <p className="mt-2 text-2xl font-bold text-slate-900">{snapshot.clarificationCount}</p>
                      </div>
                      <div className="rounded-[18px] bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Search Turns</div>
                        <p className="mt-2 text-2xl font-bold text-slate-900">{snapshot.searchHistory.length}</p>
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Conditions</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {chips.length === 0 && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                            当前还没有稳定条件
                          </span>
                        )}
                        {chips.map((chip) => (
                          <span
                            key={chip}
                            className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_12px_50px_rgba(15,23,42,0.08)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold">Recommendation</h2>
                        <p className="mt-1 text-sm text-slate-500">推荐姿态与不确定性</p>
                      </div>
                      <span className={clsx("rounded-full px-3 py-1 text-xs font-semibold", posture.tone)}>
                        {posture.label}
                      </span>
                    </div>

                    {snapshot.recommendedCandidate ? (
                      <div className="mt-5 rounded-[20px] bg-slate-950 px-4 py-4 text-slate-50">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-lg font-bold">{snapshot.recommendedCandidate.candidate.name}</p>
                            <p className="mt-1 text-sm text-slate-300">
                              {snapshot.recommendedCandidate.candidate.headline ?? "等待更多身份描述"}
                            </p>
                          </div>
                          <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                            {snapshot.recommendedCandidate.confidenceLevel}
                          </div>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-slate-200">
                          {snapshot.recommendedCandidate.rationale ?? "当前推荐还没有附带更多理由。"}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-[20px] bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                        还没有形成推荐。更可能的原因是 compare 不足，或者不确定性还没压下去。
                      </div>
                    )}

                    <div className="mt-5">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Open Uncertainties</div>
                      <div className="mt-3 space-y-2">
                        {snapshot.openUncertainties.length === 0 && (
                          <p className="rounded-[18px] bg-slate-50 px-4 py-3 text-sm text-slate-500">
                            当前没有未决不确定性。
                          </p>
                        )}
                        {snapshot.openUncertainties.map((item) => (
                          <div key={item} className="rounded-[18px] bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Corrective Feedback</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {FEEDBACK_TAG_OPTIONS.map((option) => {
                          const command = {
                            type: "apply_feedback" as const,
                            tag: option.tag
                          };
                          const busy = isCommandPending(command);

                          return (
                            <button
                              key={option.tag}
                              type="button"
                              className={clsx(
                                "rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
                                busy
                                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                              )}
                              onClick={() => void sendIntervention(command)}
                              disabled={busy}
                              aria-label={`反馈 ${option.label}`}
                              title={option.description}
                            >
                              {busy ? "提交中..." : option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
                  <section className="rounded-[24px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_12px_50px_rgba(15,23,42,0.08)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold">Shortlist</h2>
                        <p className="mt-1 text-sm text-slate-500">轻量干预只允许 compare / remove / expand evidence</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {snapshot.currentShortlist.length} 人
                      </span>
                    </div>

                    <div className="mt-5 space-y-4">
                      {snapshot.currentShortlist.length === 0 && (
                        <EmptyPanel
                          title="Shortlist 还没形成"
                          description="等搜索完成后，这里会出现候选人卡片和轻量干预动作。"
                        />
                      )}
                      {snapshot.currentShortlist.map((candidate) => (
                        <CandidateActionCard
                          key={candidate.personId}
                          candidate={candidate}
                          compareFull={compareFull}
                          inCompareSet={compareSetIds.has(candidate.personId)}
                          expanded={expandedCandidate?.personId === candidate.personId}
                          isBusy={isCommandPending}
                          onCommand={sendIntervention}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_12px_50px_rgba(15,23,42,0.08)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold">Compare Set</h2>
                        <p className="mt-1 text-sm text-slate-500">上限 3 人，当前只做可视化与 readiness 判断</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {snapshot.activeCompareSet.length}/3
                      </span>
                    </div>

                    <div className="mt-5 space-y-3">
                      {snapshot.activeCompareSet.length === 0 && (
                        <EmptyPanel
                          title="Compare 还没开始"
                          description="从 shortlist 里挑 2 到 3 位后，这里会显示对比集合。"
                        />
                      )}
                      {snapshot.activeCompareSet.map((candidate) => (
                        <div key={candidate.personId} className="rounded-[18px] bg-slate-50 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">{candidate.name}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {candidate.headline ?? "等待更多简介"}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                              {formatScore(candidate.matchScore)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-[20px] bg-slate-950 px-4 py-4 text-slate-50">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                        <Target className="h-4 w-4" />
                        Compare Readiness
                      </div>
                      <p className="mt-3 text-lg font-bold">
                        {snapshot.activeCompareSet.length >= 2 ? "已满足 compare 观察条件" : "还需要至少 2 位候选人"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {snapshot.activeCompareSet.length >= 2
                          ? "现在可以继续观察 compare_started / recommendation_updated / uncertainty_updated 事件。"
                          : "当前更适合先从 shortlist 里补几位，再进入 compare。"}
                      </p>
                    </div>

                    {expandedCandidate && (
                      <div className="mt-5 rounded-[20px] border border-blue-200 bg-blue-50 px-4 py-4">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-blue-600">
                          <ArrowUpRight className="h-4 w-4" />
                          Expanded Evidence
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{expandedCandidate.name}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {expandedCandidate.profile?.summary ?? "这位候选人的结构化证据已经展开，继续看 shortlist 卡片详情。"}
                        </p>
                        {(expandedCandidate.latestEvidenceAt || expandedCandidate.lastSyncedAt) && (
                          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatRelativeDate(expandedCandidate.latestEvidenceAt ?? expandedCandidate.lastSyncedAt)}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
