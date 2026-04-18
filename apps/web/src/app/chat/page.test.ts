import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/Header", () => ({
  Header: () => React.createElement("header", null, "header")
}));

vi.mock("@/components/ChatInterface", () => ({
  ChatInterface: ({ sessionId }: { sessionId?: string }) =>
    React.createElement("div", { "data-session-id": sessionId ?? "" }, "chat-interface")
}));

describe("ChatPage", () => {
  it("passes sessionId from search params into the chat interface", async () => {
    const module = await import("./page.js");

    const tree = await module.default({
      searchParams: Promise.resolve({ sessionId: "session-123" })
    });

    function findProp(node: unknown): string | null {
      if (!node || typeof node !== "object") {
        return null;
      }

      const element = node as { props?: Record<string, unknown> };
      if (element.props?.sessionId === "session-123") {
        return "session-123";
      }

      const children = element.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          const hit = findProp(child);
          if (hit) return hit;
        }
      } else if (children) {
        return findProp(children);
      }

      return null;
    }

    expect(findProp(tree)).toBe("session-123");
  });
});
