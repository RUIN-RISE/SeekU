"use client";

import { clsx } from "clsx";
import Link from "next/link";
import {
  Clock3,
  GitCompareArrows,
  Sparkles,
  Target
} from "lucide-react";
import type { CopilotMission } from "@/hooks/useChatSession";
import { useDealFlowSummary } from "@/hooks/useDealFlowSummary";
import type { DealFlowCard, DealFlowResponse } from "@/lib/api";
import { DealFlowReadout } from "@/components/DealFlowReadout";
import type {
  AgentPanelCandidateSnapshot,
  AgentPanelSessionEvent,
  AgentPanelSessionSnapshot
} from "@/lib/agent-panel";

interface ChatCopilotWorkboardViewProps {
  snapshot: AgentPanelSessionSnapshot | null;
  events: AgentPanelSessionEvent[];
  mission: CopilotMission | null;
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

function formatTimestamp(value?: string): string | null {
  if (!value) return null;
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateTime(value?: string): string | null {
  if (!value) return null;
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

  if (conditions.role) chips.push(`角色: ${conditions.role}`);
  if (conditions.skills.length > 0) chips.push(...conditions.skills.map((skill) => `技能: ${skill}`));
  if (conditions.locations.length > 0) chips.push(...conditions.locations.map((location) => `地点: ${location}`));
  if (conditions.mustHave.length > 0) chips.push(...conditions.mustHave.map((item) => `必须: ${item}`));
  if (conditions.exclude.length > 0) chips.push(...conditions.exclude.map((item) => `排除: ${item}`));
  if (conditions.preferFresh) chips.push("偏近期执行");

  return chips.slice(0, 8);
}

function deriveNow(snapshot: AgentPanelSessionSnapshot | null): { title: string; detail: string } {
  if (!snapshot) {
    return {
      title: "等待启动 mission",
      detail: "发一句更大范围的搜索目标，agent 会在前台持续推进直到自动停下来。"
    };
  }

  switch (snapshot.status) {
    case "searching":
      return {
        title: "Searching candidates",
        detail: "当前 mission 正在扩大候选池。"
      };
    case "shortlist":
      return {
        title: "Narrowing shortlist",
        detail: "当前 mission 正在压缩候选池，提高 shortlist 质量。"
      };
    case "comparing":
      return {
        title: "Comparing finalists",
        detail: "已经进入 compare 阶段，正在判断是否足够停下来汇报。"
      };
    case "waiting-input":
      return {
        title: "Mission stopped",
        detail: "当前 mission 已经停在一个可汇报的结果点。"
      };
    default:
      return {
        title: "Mission standby",
        detail: snapshot.statusSummary ?? "等待新的前台 mission 启动。"
      };
  }
}

function deriveWhy(snapshot: AgentPanelSessionSnapshot | null): string {
  if (!snapshot) {
    return "Mission runner 是前台执行的：你留在 chat 里看它推进，并且可以随时插话纠偏。";
  }

  if (snapshot.openUncertainties.length > 0) {
    return snapshot.openUncertainties[0];
  }

  return snapshot.statusSummary ?? "当前 mission 正在沿着既定阶段推进。";
}

function deriveMovement(
  snapshot: AgentPanelSessionSnapshot | null,
  events: AgentPanelSessionEvent[]
): { label: string; summary: string; timestamp?: string } {
  const latest = [...events].reverse()[0];

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
      summary: "还没有收到 mission 事件。"
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
      title: "Goal summary",
      subtitle: "默认 `/chat` 也会显示 proactive top picks，但 mission 启动后这里会切到当前执行产物。",
      mode: "goal"
    };
  }

  if (snapshot.recommendedCandidate) {
    return {
      title: "Top picks right now",
      subtitle: "mission 已经形成建议，先看最值得推进的人。",
      mode: "recommendation"
    };
  }

  if (snapshot.activeCompareSet.length > 0 || snapshot.status === "comparing") {
    return {
      title: "Compare set",
      subtitle: "mission 已经进入 compare 判断阶段。",
      mode: "compare"
    };
  }

  if (snapshot.currentShortlist.length > 0) {
    return {
      title: "Top picks right now",
      subtitle: "当前 mission 的 shortlist 已经形成。"
      ,
      mode: "shortlist"
    };
  }

  return {
    title: "Goal summary",
    subtitle: "当前还没有稳定候选输出，先盯住 mission 定义。",
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
    </article>
  );
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
          <p className="mt-1 text-sm text-slate-500">{candidate.headline ?? "等待更多身份描述"}</p>
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
    </div>
  );
}

export function ChatCopilotWorkboard({
  snapshot,
  events,
  mission
}: {
  snapshot: AgentPanelSessionSnapshot | null;
  events: AgentPanelSessionEvent[];
  mission: CopilotMission | null;
}) {
  const dealFlow = useDealFlowSummary();

  return (
    <ChatCopilotWorkboardView
      snapshot={snapshot}
      events={events}
      mission={mission}
      dealFlowData={dealFlow.data}
      dealFlowError={dealFlow.errorMessage}
      isDealFlowLoading={dealFlow.isLoading}
    />
  );
}

export function ChatCopilotWorkboardView({
  snapshot,
  events,
  mission,
  dealFlowData,
  dealFlowError,
  isDealFlowLoading
}: ChatCopilotWorkboardViewProps) {
  const now = deriveNow(snapshot);
  const why = deriveWhy(snapshot);
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
        {mission && (
          <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700 ring-1 ring-cyan-200">
            {mission.status} · round {mission.roundCount}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Current Mission
              </div>
              <p className="mt-2 truncate font-mono text-xs text-slate-600">
                {mission?.missionId ?? "未启动"}
              </p>
            </div>
            {mission && (
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                {mission.phase}
              </span>
            )}
          </div>

          {mission && (
            <div className="mt-3 rounded-xl bg-white/80 px-3 py-3 text-xs leading-5 text-slate-700 ring-1 ring-slate-200">
              <div className="font-semibold text-slate-900">Mission Goal</div>
              <p className="mt-1">{mission.goal}</p>
              {mission.stopReason && (
                <p className="mt-2 text-slate-500">stop reason: {mission.stopReason}</p>
              )}
              {mission.corrections.length > 0 && (
                <p className="mt-2 text-slate-500">corrections: {mission.corrections.length}</p>
              )}
            </div>
          )}

          {snapshot?.userGoal && (
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Session Goal
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

        <section className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            <Sparkles className="h-3.5 w-3.5" />
            Mission Banner
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {mission
              ? mission.latestSummary
              : "发一句更大范围的搜索目标，系统会启动一个 bounded mission，在 chat 中前台持续执行并自动停下来。"}
          </p>
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
                  : "当前还没有 mission 结果，因此这里先展示 proactive top picks。"}
              </div>
            )}

            {focus.mode === "shortlist" && snapshot?.currentShortlist.slice(0, 5).map((candidate, index) => (
              <FocusCandidateCard
                key={candidate.personId}
                candidate={candidate}
                emphasis={index === 0 ? "当前 mission 最值得先看的候选人。" : undefined}
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
                  emphasis={snapshot.recommendedCandidate.rationale ?? "当前 mission 的建议候选人。"}
                />
                {snapshot.currentShortlist.slice(1, 3).map((candidate) => (
                  <FocusCandidateCard
                    key={candidate.personId}
                    candidate={candidate}
                  />
                ))}
              </>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
