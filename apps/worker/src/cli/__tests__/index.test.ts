import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { runWorkflowSession } from "../index.js";

describe("runWorkflowSession", () => {
  it("persists interrupted when an external termination signal arrives", async () => {
    const signalSource = new EventEmitter();
    const saveWorkflow = vi.fn(async () => undefined);
    const unsubscribe = vi.fn();
    const workflow = {
      execute: vi.fn(
        () =>
          new Promise<void>(() => undefined)
      ),
      interrupt: vi.fn(),
      subscribeToSessionEvents: vi.fn(() => unsubscribe),
      getTerminationReason: vi.fn(() => undefined),
      getSessionId: vi.fn(() => "session-1"),
      getSessionSnapshot: vi.fn(() => ({
        sessionId: "session-1",
        runtime: {
          status: "searching",
          statusSummary: "正在搜索匹配候选人。",
          whyCodes: [],
          whySummary: null,
          lastStatusAt: new Date(0).toISOString()
        }
      })),
      getTranscript: vi.fn(() => [])
    };

    const runPromise = runWorkflowSession({
      workflow: workflow as any,
      ledger: { saveWorkflow } as any,
      signalSource: signalSource as any,
      interruptionSignals: ["SIGTERM"]
    });

    await Promise.resolve();
    signalSource.emit("SIGTERM");
    await runPromise;

    expect(saveWorkflow).toHaveBeenNthCalledWith(1, workflow, "active");
    expect(saveWorkflow).toHaveBeenLastCalledWith(workflow, "stopped", {
      terminationReason: "interrupted"
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
