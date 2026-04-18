import { describe, expect, it } from "vitest";

import type { AgentTranscriptEntry } from "../agent-session-events.js";
import { SearchWorkflow } from "../workflow.js";

describe("SearchWorkflow ledger integration", () => {
  it("reuses an existing sessionId and transcript when provided", () => {
    const transcript: AgentTranscriptEntry[] = [
      {
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
    expect(workflow.getTranscript().map((entry) => entry.content)).toContain("继续这个 session");
  });
});
