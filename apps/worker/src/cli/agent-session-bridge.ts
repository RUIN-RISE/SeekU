import type {
  AgentInterventionCommand,
  AgentInterventionResult,
  AgentSessionEvent,
  AgentSessionSnapshot
} from "./agent-session-events.js";
import { SearchWorkflow } from "./workflow.js";

export interface AgentSessionBridge {
  hasSession(sessionId: string): boolean;
  getSnapshot(sessionId: string): AgentSessionSnapshot | null;
  subscribe(
    sessionId: string,
    listener: (event: AgentSessionEvent) => void
  ): (() => void) | null;
  applyIntervention(
    sessionId: string,
    command: AgentInterventionCommand
  ): Promise<AgentInterventionResult | null>;
}

export class InMemoryAgentSessionBridge implements AgentSessionBridge {
  private readonly sessions = new Map<string, SearchWorkflow>();

  registerWorkflow(workflow: SearchWorkflow): AgentSessionSnapshot {
    this.sessions.set(workflow.getSessionId(), workflow);
    return workflow.getSessionSnapshot();
  }

  unregisterSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  getSnapshot(sessionId: string): AgentSessionSnapshot | null {
    return this.sessions.get(sessionId)?.getSessionSnapshot() ?? null;
  }

  subscribe(
    sessionId: string,
    listener: (event: AgentSessionEvent) => void
  ): (() => void) | null {
    const workflow = this.sessions.get(sessionId);
    if (!workflow) {
      return null;
    }

    return workflow.subscribeToSessionEvents(listener);
  }

  async applyIntervention(
    sessionId: string,
    command: AgentInterventionCommand
  ): Promise<AgentInterventionResult | null> {
    const workflow = this.sessions.get(sessionId);
    if (!workflow) {
      return null;
    }

    return workflow.applyIntervention(command);
  }
}
