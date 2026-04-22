import { describe, expect, it } from "vitest";

import type { AgentTranscriptEntry } from "../agent-session-events.js";
import { SearchWorkflow } from "../workflow.js";

describe("SearchWorkflow ledger integration", () => {
  it("reuses an existing sessionId and transcript when provided", () => {
    const transcript: AgentTranscriptEntry[] = [
      {
        type: "message",
        id: "existing-1",
        role: "user",
        content: "继续这个 session",
        timestamp: "2026-04-18T00:00:00.000Z"
      }
    ];

    const workflow = new SearchWorkflow({} as any, {} as any, {
      sessionId: "33333333-3333-3333-3333-333333333333",
      initialTranscript: transcript
    });

    expect(workflow.getSessionId()).toBe("33333333-3333-3333-3333-333333333333");
    expect(
      workflow.getTranscript()
        .filter((entry): entry is Extract<AgentTranscriptEntry, { type: "message" }> => entry.type === "message")
        .map((entry) => entry.content)
    ).toContain("继续这个 session");
  });

  it("mirrors session events into transcript as event entries", () => {
    const workflow = new SearchWorkflow({} as any, {} as any);

    const transcript = workflow.getTranscript();
    expect(transcript.some((entry) => entry.type === "event")).toBe(true);
    expect(
      transcript.some((entry) =>
        entry.type === "event" && entry.event.type === "session_started")
    ).toBe(true);
    expect(
      transcript.some((entry) =>
        entry.type === "message" && entry.content === "CLI agent 会话已启动，等待输入。")
    ).toBe(true);
  });
});
