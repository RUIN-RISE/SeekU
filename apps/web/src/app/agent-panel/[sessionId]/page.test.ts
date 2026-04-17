import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

describe("AgentPanelPage", () => {
  it("redirects legacy agent-panel routes to chat-first copilot", async () => {
    const module = await import("./page.js");

    await module.default({
      params: Promise.resolve({ sessionId: "session-123" })
    });

    expect(redirectMock).toHaveBeenCalledWith("/chat?sessionId=session-123");
  });
});
