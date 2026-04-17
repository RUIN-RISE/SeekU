import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "../Header.js";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    React.createElement("a", { href, className }, children)
  )
}));

describe("Header", () => {
  it("promotes chat copilot as the primary nav entry", () => {
    render(React.createElement(Header));

    expect(screen.getByRole("link", { name: "Copilot" }).getAttribute("href")).toBe("/chat");
    expect(screen.getByRole("link", { name: "搜索" }).getAttribute("href")).toBe("/search");
    expect(screen.getByRole("link", { name: "Deal Flow" }).getAttribute("href")).toBe("/deal-flow");
  });
});
