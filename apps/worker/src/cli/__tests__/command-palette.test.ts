import { describe, expect, it, vi } from "vitest";
import { renderCommandPalette } from "../command-palette.js";

describe("renderCommandPalette", () => {
  it("renders shortlist stage commands", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    renderCommandPalette("shortlist");

    const output = logSpy.mock.calls.map(c => c[0]).join("\n");
    expect(output).toContain("refine");
    expect(output).toContain("compare");
    expect(output).toContain("sort");

    logSpy.mockRestore();
  });

  it("renders current-stage commands before global commands", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    renderCommandPalette("shortlist");

    const calls = logSpy.mock.calls.map(c => c[0]);
    const refineIndex = calls.findIndex(c => c && c.includes("refine"));
    const helpIndex = calls.findIndex(c => c && c.includes("help"));

    expect(refineIndex).toBeLessThan(helpIndex);

    logSpy.mockRestore();
  });

  it("renders home stage commands", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    renderCommandPalette("home");

    const output = logSpy.mock.calls.map(c => c[0]).join("\n");
    expect(output).toContain("resume");
    expect(output).toContain("new");

    logSpy.mockRestore();
  });

  it("renders compare stage commands", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    renderCommandPalette("compare");

    const output = logSpy.mock.calls.map(c => c[0]).join("\n");
    expect(output).toContain("back");
    expect(output).toContain("refine");
    expect(output).toContain("clear");

    logSpy.mockRestore();
  });

  it("renders memory in non-home stages", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    renderCommandPalette("shortlist");

    const output = logSpy.mock.calls.map(c => c[0]).join("\n");
    expect(output).toContain("memory");

    logSpy.mockRestore();
  });

  it("renders memory in compare stage", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    renderCommandPalette("compare");

    const output = logSpy.mock.calls.map(c => c[0]).join("\n");
    expect(output).toContain("memory");

    logSpy.mockRestore();
  });
});