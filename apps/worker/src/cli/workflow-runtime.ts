import type {
  AgentSessionEvent,
  AgentSessionSnapshot,
  AgentSessionStatus
} from "./agent-session-events.js";
import type { SearchAgentTools } from "./agent-tools.js";
import type { ChatInterface } from "./chat.js";
import type { TerminalUI } from "./tui.js";

export interface SpinnerLike {
  start(text?: string): void;
  stop(): void;
  fail(text?: string): void;
  succeed(text?: string): void;
  readonly isSpinning: boolean;
}

export interface WorkflowRuntime {
  getSessionState(): AgentSessionSnapshot;
  applySessionState(next: AgentSessionSnapshot): void;
  setSessionStatus(status: AgentSessionStatus, summary?: string | null): void;
  emitSessionEvent<TData extends Record<string, unknown>>(
    type: AgentSessionEvent["type"],
    summary: string,
    data: TData,
    timestamp?: Date
  ): AgentSessionEvent<TData>;
  readonly chat: ChatInterface;
  readonly tui: TerminalUI;
  readonly spinner: SpinnerLike;
  readonly tools: SearchAgentTools;
}
