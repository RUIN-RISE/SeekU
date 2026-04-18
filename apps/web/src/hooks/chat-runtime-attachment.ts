import type { AgentPanelSessionEvent, AgentPanelSessionSnapshot } from "@/lib/agent-panel";
import type { CopilotMission, CopilotMissionCorrection } from "./useChatSession";

function deriveCorrections(
  events: AgentPanelSessionEvent[],
  current: CopilotMission | null
): CopilotMissionCorrection[] {
  const existing = current?.corrections ?? [];
  const byId = new Map(existing.map((correction) => [correction.id, correction]));

  for (const event of events) {
    if (event.type !== "intervention_applied" && event.type !== "intervention_rejected") {
      continue;
    }

    const command = (event.data?.command ?? null) as { type?: string; tag?: string } | null;
    if (command?.type !== "apply_feedback" || !command.tag) {
      continue;
    }

    const correctionId = `runtime-${event.sequence}`;
    if (byId.has(correctionId)) {
      continue;
    }

    byId.set(correctionId, {
      id: correctionId,
      type: "tighten",
      message: command.tag,
      appliedAt: event.timestamp
    });
  }

  return [...byId.values()].sort((left, right) => left.appliedAt.localeCompare(right.appliedAt));
}

export function buildAttachedMission(
  sessionId: string,
  snapshot: AgentPanelSessionSnapshot,
  events: AgentPanelSessionEvent[],
  current: CopilotMission | null
): CopilotMission {
  const roundCount = events.filter((event) => event.type === "search_started").length;
  const isStopped = snapshot.status === "waiting-input";

  return {
    missionId: sessionId,
    goal: snapshot.userGoal ?? current?.goal ?? "Attached runtime session",
    status: isStopped ? "stopped" : "running",
    phase: isStopped ? "stopped" : "running_search",
    roundCount,
    startedAt: current?.startedAt ?? new Date().toISOString(),
    stoppedAt: isStopped ? new Date().toISOString() : current?.stoppedAt,
    latestSummary: snapshot.statusSummary ?? current?.latestSummary ?? "已附着到 runtime session。",
    stopReason: current?.stopReason,
    corrections: deriveCorrections(events, current)
  };
}
