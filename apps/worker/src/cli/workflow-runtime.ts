import type { AgentSessionSnapshot, AgentSessionStatus } from "./agent-session-events.js";
import type { SearchAgentTools } from "./agent-tools.js";
import type { ChatInterface } from "./chat.js";
import type { SpinnerLike, TerminalRenderer } from "./renderer.js";
import type { TerminalUI } from "./tui.js";

export interface WorkflowRuntime {
  getSessionState(): AgentSessionSnapshot;
  applySessionState(next: AgentSessionSnapshot): void;
  setSessionStatus(status: AgentSessionStatus, summary?: string | null): void;
  emitSessionEvent(...args: Parameters<typeof import("./agent-session-events.js").createAgentSessionEvent>): void;
  readonly chat: ChatInterface;
  readonly tui: TerminalUI;
  readonly spinner: SpinnerLike;
  readonly tools: SearchAgentTools;
}
