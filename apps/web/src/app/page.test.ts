import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

describe("HomePage", () => {
  it("redirects the root route to chat-first copilot", async () => {
    const module = await import("./page.js");

    module.default();

    expect(redirectMock).toHaveBeenCalledWith("/chat");
  });
});
