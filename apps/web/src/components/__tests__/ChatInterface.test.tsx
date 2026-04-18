import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatInterface } from "../ChatInterface.js";

const useChatSessionMock = vi.fn();

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: vi.fn(),
  writable: true
});

vi.mock("@/hooks/useChatSession", () => ({
  useChatSession: (options?: unknown) => useChatSessionMock(options)
}));

vi.mock("../ChatMessage.js", () => ({
  ChatMessage: ({ message }: { message: { content: string } }) => React.createElement("div", null, message.content)
}));

vi.mock("../ChatCopilotWorkboard.js", () => ({
  ChatCopilotWorkboard: () => React.createElement("aside", null, "workboard")
}));

describe("ChatInterface", () => {
  it("switches to runtime-backed attached mode when sessionId is provided", () => {
    useChatSessionMock.mockReturnValue({
      messages: [],
      currentConditions: null,
      isProcessing: false,
      runtimeConnectionStatus: "disconnected",
      runtimeNotice: {
        kind: "error",
        message: "当前 runtime 连接已中断。"
      },
      mission: {
        missionId: "session-123",
        goal: "找多智能体工程负责人",
        status: "running",
        phase: "running_search",
        roundCount: 2,
        startedAt: "2026-04-18T00:00:00.000Z",
        latestSummary: "正在执行 runtime-backed mission。",
        corrections: []
      },
      snapshot: null,
      events: [],
      sendMessage: vi.fn(),
      retryRuntimeConnection: vi.fn(),
      reset: vi.fn()
    });

    render(React.createElement(ChatInterface, { sessionId: "session-123" }));

    expect(screen.getByText(/Attached runtime session/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/可提交有限纠偏/).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/当前 runtime 连接已中断/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新连接" })).toBeTruthy();
    expect(screen.getByText(/只会把有限纠偏交给真实 runtime/)).toBeTruthy();
  });
});
