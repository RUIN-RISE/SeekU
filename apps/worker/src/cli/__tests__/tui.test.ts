import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalUI } from "../tui.js";

describe("TerminalUI banner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses truthful data-source copy", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    ui.displayBanner();

    const banner = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(stdoutSpy).toHaveBeenCalled();
    expect(banner).toContain("Bonjour 主资料");
    expect(banner).toContain("GitHub 证据（分批覆盖中）");
    expect(banner).not.toContain("GitHub Engine");
  });
});
