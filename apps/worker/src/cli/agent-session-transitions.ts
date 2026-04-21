import type { AgentSessionStatus } from "./agent-session-events.js";
import type { RecoveryPhase } from "./types.js";

const SESSION_STATUS_TRANSITIONS: Record<AgentSessionStatus, readonly AgentSessionStatus[]> = {
  idle: ["waiting-input", "clarifying", "searching", "shortlist", "comparing", "blocked", "completed"],
  clarifying: ["clarifying", "searching", "waiting-input", "blocked", "completed"],
  searching: ["searching", "recovering", "shortlist", "waiting-input", "blocked", "completed"],
  recovering: ["recovering", "searching", "shortlist", "blocked", "waiting-input", "completed"],
  shortlist: ["shortlist", "comparing", "waiting-input", "blocked", "completed"],
  comparing: ["comparing", "shortlist", "waiting-input", "blocked", "completed"],
  "waiting-input": ["waiting-input", "clarifying", "searching", "shortlist", "comparing", "blocked", "completed"],
  blocked: ["blocked", "waiting-input", "clarifying", "searching", "completed"],
  completed: ["completed"],
};

const RECOVERY_PHASE_TRANSITIONS: Record<RecoveryPhase, readonly RecoveryPhase[]> = {
  idle: ["idle", "diagnosing", "clarifying", "rewriting"],
  diagnosing: ["diagnosing", "clarifying", "rewriting", "low_confidence_shortlist", "exhausted", "idle"],
  clarifying: ["clarifying", "idle", "low_confidence_shortlist", "exhausted"],
  rewriting: ["rewriting", "idle", "low_confidence_shortlist", "exhausted"],
  low_confidence_shortlist: ["low_confidence_shortlist", "idle"],
  exhausted: ["exhausted", "idle"],
};

const RECOVERY_PHASE_STATUS_MAP: Partial<Record<RecoveryPhase, AgentSessionStatus>> = {
  diagnosing: "recovering",
  clarifying: "recovering",
  rewriting: "recovering",
  "low_confidence_shortlist": "shortlist",
  exhausted: "blocked",
};

export function isAllowedSessionStatusTransition(
  from: AgentSessionStatus,
  to: AgentSessionStatus,
): boolean {
  return SESSION_STATUS_TRANSITIONS[from].includes(to);
}

export function assertAllowedSessionStatusTransition(
  from: AgentSessionStatus,
  to: AgentSessionStatus,
): void {
  if (!isAllowedSessionStatusTransition(from, to)) {
    throw new Error(`Invalid session status transition: ${from} -> ${to}`);
  }
}

export function isAllowedRecoveryPhaseTransition(
  from: RecoveryPhase,
  to: RecoveryPhase,
): boolean {
  return RECOVERY_PHASE_TRANSITIONS[from].includes(to);
}

export function assertAllowedRecoveryPhaseTransition(
  from: RecoveryPhase,
  to: RecoveryPhase,
): void {
  if (!isAllowedRecoveryPhaseTransition(from, to)) {
    throw new Error(`Invalid recovery phase transition: ${from} -> ${to}`);
  }
}

export function getSessionStatusForRecoveryPhase(
  phase: RecoveryPhase,
): AgentSessionStatus | undefined {
  return RECOVERY_PHASE_STATUS_MAP[phase];
}
