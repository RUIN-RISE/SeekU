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
