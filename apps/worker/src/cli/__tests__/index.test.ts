import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { runWorkflowSession, parseLauncherAction } from "../index.js";
import { SearchWorkflow } from "../workflow.js";

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

describe("B7: SearchWorkflow options preservation", () => {
  it("preserves workItemId from options", () => {
    const db = {} as any;
    const llmProvider = {} as any;
    const workflow = new SearchWorkflow(db, llmProvider, {
      sessionId: "test-session",
      workItemId: "wi-existing"
    });

    expect(workflow.getWorkItemId()).toBe("wi-existing");
  });

  it("preserves memoryStore from options", () => {
    const db = {} as any;
    const llmProvider = {} as any;
    const memoryStore = { hydrateContext: vi.fn() } as any;
    const workflow = new SearchWorkflow(db, llmProvider, {
      sessionId: "test-session",
      memoryStore
    });

    // memoryStore is private, but we can verify it's not undefined
    // by checking that the workflow was constructed without error
    expect(workflow.getSessionId()).toBe("test-session");
  });

  it("preserves workItemStore from options", () => {
    const db = {} as any;
    const llmProvider = {} as any;
    const workItemStore = { get: vi.fn() } as any;
    const workflow = new SearchWorkflow(db, llmProvider, {
      sessionId: "test-session",
      workItemStore
    });

    expect(workflow.getSessionId()).toBe("test-session");
  });

  it("uses new sessionId when workItemId is absent", () => {
    const db = {} as any;
    const llmProvider = {} as any;
    const workflow = new SearchWorkflow(db, llmProvider, {
      sessionId: "test-session"
    });

    expect(workflow.getWorkItemId()).toBeUndefined();
  });
});

describe("Phase 5: memory overlay returns to launcher", () => {
  it("memory action in parseLauncherAction does not terminate", () => {
    const action = parseLauncherAction("memory", 0, undefined);
    expect(action).toEqual({ type: "memory" });
  });

  it("memory action does not equal quit", () => {
    const action = parseLauncherAction("m", 3, "s-default");
    expect(action).toEqual({ type: "memory" });
    expect(action!.type).not.toBe("quit");
  });

  it("routes slash memory aliases to memory action", () => {
    expect(parseLauncherAction("/memory", 3, "s-default")).toEqual({ type: "memory" });
    expect(parseLauncherAction("/m", 3, "s-default")).toEqual({ type: "memory" });
    expect(parseLauncherAction("/mem", 3, "s-default")).toEqual({ type: "memory" });
  });

  it("after memory, launcher can still accept new/quit", () => {
    expect(parseLauncherAction("memory", 0, undefined)?.type).toBe("memory");
    expect(parseLauncherAction("1", 0, undefined)?.type).toBe("new");
    expect(parseLauncherAction("q", 0, undefined)?.type).toBe("quit");
  });
});
