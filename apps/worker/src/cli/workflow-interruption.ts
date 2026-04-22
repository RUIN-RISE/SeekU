import type { AgentSessionTerminationReason } from "./session-runtime-types.js";

export class WorkflowInterruptedError extends Error {
  readonly code = "WORKFLOW_INTERRUPTED";
  readonly terminationReason: AgentSessionTerminationReason = "interrupted";

  constructor(readonly signal: NodeJS.Signals) {
    super(`Workflow interrupted by ${signal}.`);
    this.name = "WorkflowInterruptedError";
  }
}

export interface InterruptionSignalSource {
  on(event: NodeJS.Signals, listener: () => void): unknown;
  off(event: NodeJS.Signals, listener: () => void): unknown;
}

export interface WorkflowInterruptionMonitor {
  interruption: Promise<never>;
  dispose(): void;
}

export function isWorkflowInterruptedError(error: unknown): error is WorkflowInterruptedError {
  return error instanceof WorkflowInterruptedError
    || (error !== null
      && typeof error === "object"
      && "code" in error
      && (error as { code?: unknown }).code === "WORKFLOW_INTERRUPTED");
}

export function createWorkflowInterruptionMonitor(options: {
  source?: InterruptionSignalSource;
  signals?: NodeJS.Signals[];
  onInterrupt?: (signal: NodeJS.Signals) => void;
} = {}): WorkflowInterruptionMonitor {
  const source = options.source ?? process;
  const signals = options.signals ?? ["SIGTERM", "SIGHUP"];
  let disposed = false;
  let rejectInterruption: ((error: WorkflowInterruptedError) => void) | undefined;

  const listeners = new Map<NodeJS.Signals, () => void>();

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const [signal, listener] of listeners) {
      source.off(signal, listener);
    }
    listeners.clear();
  };

  const interruption = new Promise<never>((_, reject) => {
    rejectInterruption = reject;
  });

  for (const signal of signals) {
    const listener = () => {
      if (disposed) {
        return;
      }
      options.onInterrupt?.(signal);
      dispose();
      rejectInterruption?.(new WorkflowInterruptedError(signal));
    };
    listeners.set(signal, listener);
    source.on(signal, listener);
  }

  return {
    interruption,
    dispose
  };
}
