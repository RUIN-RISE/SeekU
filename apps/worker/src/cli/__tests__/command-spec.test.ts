import { describe, expect, it } from "vitest";

import {
  ALL_COMMANDS,
  getCommandsForStage,
  getImmediateCommands,
  findCommand,
  isImmediate,
  getAllCommandNames
} from "../command-spec.js";

describe("command-spec", () => {
  describe("ALL_COMMANDS", () => {
    it("is non-empty", () => {
      expect(ALL_COMMANDS.length).toBeGreaterThan(0);
    });

    it("has unique command names", () => {
      const names = ALL_COMMANDS.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it("every command has required fields", () => {
      for (const cmd of ALL_COMMANDS) {
        expect(cmd.name).toBeTruthy();
        expect(Array.isArray(cmd.aliases)).toBe(true);
        expect(cmd.description).toBeTruthy();
        expect(Array.isArray(cmd.stages)).toBe(true);
        expect(cmd.stages.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getCommandsForStage", () => {
    it("shortlist includes refine, compare, sort, export", () => {
      const cmds = getCommandsForStage("shortlist");
      const names = cmds.map((c) => c.name);
      expect(names).toContain("refine");
      expect(names).toContain("compare");
      expect(names).toContain("sort");
      expect(names).toContain("export");
    });

    it("home includes resume and new", () => {
      const cmds = getCommandsForStage("home");
      const names = cmds.map((c) => c.name);
      expect(names).toContain("resume");
      expect(names).toContain("new");
    });

    it("compare includes back and refine", () => {
      const cmds = getCommandsForStage("compare");
      const names = cmds.map((c) => c.name);
      expect(names).toContain("back");
      expect(names).toContain("refine");
    });

    it("clarify includes search, add, relax, restart", () => {
      const cmds = getCommandsForStage("clarify");
      const names = cmds.map((c) => c.name);
      expect(names).toContain("search");
      expect(names).toContain("add");
      expect(names).toContain("relax");
      expect(names).toContain("restart");
    });

    it("detail includes back, open, why, refine", () => {
      const cmds = getCommandsForStage("detail");
      const names = cmds.map((c) => c.name);
      expect(names).toContain("back");
      expect(names).toContain("open");
      expect(names).toContain("why");
      // refine is available in detail stage per tui.ts line 635-637
      expect(names).toContain("refine");
    });

    it("always includes global commands", () => {
      const home = getCommandsForStage("home");
      const shortlist = getCommandsForStage("shortlist");
      const homeNames = home.map((c) => c.name);
      const slNames = shortlist.map((c) => c.name);

      // Global commands: help, memory, quit, task, tasks, transcript, workboard, new
      expect(homeNames).toContain("help");
      expect(homeNames).toContain("memory");
      expect(homeNames).toContain("quit");
      expect(slNames).toContain("help");
      expect(slNames).toContain("memory");
      expect(slNames).toContain("quit");
    });
  });

  describe("getImmediateCommands", () => {
    it("returns help, task, tasks, memory, quit", () => {
      const cmds = getImmediateCommands();
      const names = cmds.map((c) => c.name);
      expect(names).toContain("help");
      expect(names).toContain("task");
      expect(names).toContain("tasks");
      expect(names).toContain("memory");
      expect(names).toContain("quit");
    });

    it("all returned commands have immediate=true", () => {
      const cmds = getImmediateCommands();
      for (const cmd of cmds) {
        expect(cmd.immediate).toBe(true);
      }
    });
  });

  describe("findCommand", () => {
    it("finds refine by name", () => {
      expect(findCommand("refine")?.name).toBe("refine");
    });

    it("finds refine by alias 'r'", () => {
      expect(findCommand("r")?.name).toBe("refine");
    });

    it("returns undefined for unknown command", () => {
      expect(findCommand("unknown")).toBeUndefined();
    });

    it("finds help by alias '?'", () => {
      expect(findCommand("?")?.name).toBe("help");
    });

    // Stage-aware alias resolution

    it("resolves 'w' to relax in clarify stage", () => {
      expect(findCommand("w", "clarify")?.name).toBe("relax");
    });

    it("resolves 'w' to why in detail stage", () => {
      expect(findCommand("w", "detail")?.name).toBe("why");
    });

    it("resolves 's' to search in clarify stage", () => {
      expect(findCommand("s", "clarify")?.name).toBe("search");
    });

    it("resolves 's' to sort in shortlist stage", () => {
      expect(findCommand("s", "shortlist")?.name).toBe("sort");
    });

    it("resolves 'a' to add in clarify stage", () => {
      expect(findCommand("a", "clarify")?.name).toBe("add");
    });

    it("falls back to global when stage not provided", () => {
      // Without stage, returns first match (why has alias w)
      expect(findCommand("w")?.name).toBe("relax");
    });

    it("finds clarify commands by name", () => {
      expect(findCommand("search", "clarify")?.name).toBe("search");
      expect(findCommand("add", "clarify")?.name).toBe("add");
      expect(findCommand("relax", "clarify")?.name).toBe("relax");
      expect(findCommand("restart", "clarify")?.name).toBe("restart");
    });
  });

  describe("isImmediate", () => {
    it("returns true for help", () => {
      expect(isImmediate("help")).toBe(true);
    });

    it("returns false for refine", () => {
      expect(isImmediate("refine")).toBe(false);
    });

    it("returns false for unknown", () => {
      expect(isImmediate("unknown")).toBe(false);
    });
  });

  describe("getAllCommandNames", () => {
    it("includes all names and aliases", () => {
      const names = getAllCommandNames();
      expect(names.has("refine")).toBe(true);
      expect(names.has("r")).toBe(true);
      expect(names.has("help")).toBe(true);
      expect(names.has("?")).toBe(true);
      expect(names.has("quit")).toBe(true);
      expect(names.has("q")).toBe(true);
      expect(names.has("exit")).toBe(true);
    });
  });
});
