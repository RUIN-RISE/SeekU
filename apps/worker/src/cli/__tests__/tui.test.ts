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

  it("marks low-confidence shortlist output distinctly", () => {
    const ui = new TerminalUI();
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    ui.displayShortlist(
      [{
        personId: "person-1",
        name: "Ada",
        headline: "Python Backend Engineer",
        location: "杭州",
        company: null,
        experienceYears: null,
        matchScore: 31,
        matchStrength: "weak",
        matchReason: "地点命中：杭州",
        queryReasons: ["地点命中：杭州"],
        sources: ["Bonjour"]
      }] as any,
      {
        skills: ["python"],
        locations: ["杭州"],
        experience: undefined,
        role: "backend",
        sourceBias: undefined,
        mustHave: [],
        niceToHave: [],
        exclude: [],
        preferFresh: false,
        candidateAnchor: undefined,
        limit: 10
      },
      {
        sortMode: "overall",
        showingCount: 1,
        totalCount: 1,
        lowConfidence: true,
        uncertaintySummary: "当前结果仍然偏弱，需要继续 refine。"
      }
    );

    const output = stdoutSpy.mock.calls.map((call) => call.join("")).join("\n");
    expect(output).toContain("低置信 shortlist");
    expect(output).toContain("可先看的人");
    expect(output).toContain("为什么我还不能直接推荐");
  });
});

describe("TerminalUI compare prompt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts refine and short aliases in compare prompt", async () => {
    const ui = new TerminalUI();
    const promptLine = vi.spyOn(ui as any, "promptLine")
      .mockResolvedValueOnce("refine")
      .mockResolvedValueOnce("r");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(ui.promptCompareAction()).resolves.toBe("refine");
    await expect(ui.promptCompareAction()).resolves.toBe("refine");

    expect(promptLine).toHaveBeenNthCalledWith(1, "compare>", "back");
    expect(promptLine).toHaveBeenNthCalledWith(2, "compare>", "back");
    expect(logSpy).toHaveBeenCalled();
  });

  it("keeps back, clear, and quit behavior stable", async () => {
    const ui = new TerminalUI();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(ui as any, "promptLine")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("clear")
      .mockResolvedValueOnce("q");

    await expect(ui.promptCompareAction()).resolves.toBe("back");
    await expect(ui.promptCompareAction()).resolves.toBe("clear");
    await expect(ui.promptCompareAction()).resolves.toBe("quit");
  });
});
