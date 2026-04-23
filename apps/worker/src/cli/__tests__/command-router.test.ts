import { describe, expect, it } from "vitest";

import {
  parseCommand,
  routeCommand,
  isImmediateCommand,
  isPaletteTrigger,
  isValidCommand
} from "../command-router.js";

describe("command-router", () => {
  describe("parseCommand", () => {
    it('"/" returns palette', () => {
      expect(parseCommand("/")).toEqual({ kind: "palette" });
    });

    it('"/refine" returns command with empty args', () => {
      expect(parseCommand("/refine")).toEqual({
        kind: "command",
        name: "refine",
        args: ""
      });
    });

    it('"/refine  add conditions" returns command with args', () => {
      expect(parseCommand("/refine  add conditions")).toEqual({
        kind: "command",
        name: "refine",
        args: "add conditions"
      });
    });

    it('"find Hangzhou engineers" returns null (natural language)', () => {
      expect(parseCommand("find Hangzhou engineers")).toBeNull();
    });

    it('"" returns null', () => {
      expect(parseCommand("")).toBeNull();
    });

    it('"/Refine" normalizes to lowercase name', () => {
      expect(parseCommand("/Refine")).toEqual({
        kind: "command",
        name: "refine",
        args: ""
      });
    });

    it('"/  " (slash + spaces) returns palette', () => {
      expect(parseCommand("/  ")).toEqual({ kind: "palette" });
    });

    it('"/quit now" returns command with args', () => {
      expect(parseCommand("/quit now")).toEqual({
        kind: "command",
        name: "quit",
        args: "now"
      });
    });

    it('"/unknown" returns command with unknown name', () => {
      expect(parseCommand("/unknown")).toEqual({
        kind: "command",
        name: "unknown",
        args: ""
      });
    });
  });

  describe("routeCommand", () => {
    it("routes immediate command", () => {
      const parsed = { kind: "command" as const, name: "help", args: "" };
      const action = routeCommand(parsed, "shortlist");
      expect(action).toEqual({ type: "immediate", command: "help", args: "" });
    });

    it("routes stage command", () => {
      const parsed = { kind: "command" as const, name: "refine", args: "add location" };
      const action = routeCommand(parsed, "shortlist");
      expect(action).toEqual({ type: "stage", command: "refine", args: "add location" });
    });

    it("routes unknown command", () => {
      const parsed = { kind: "command" as const, name: "foobar", args: "" };
      const action = routeCommand(parsed, "shortlist");
      expect(action).toEqual({ type: "unknown", name: "foobar", args: "" });
    });

    it("routes command unavailable in stage as unknown", () => {
      // compare is only available in shortlist, not detail
      const parsed = { kind: "command" as const, name: "compare", args: "" };
      const action = routeCommand(parsed, "detail");
      expect(action.type).toBe("unknown");
    });

    it("resolves alias to canonical command name", () => {
      const parsed = { kind: "command" as const, name: "r", args: "add skill" };
      const action = routeCommand(parsed, "shortlist");
      expect(action).toEqual({ type: "stage", command: "refine", args: "add skill" });
    });

    it("resolves 'w' to relax in clarify stage", () => {
      const parsed = { kind: "command" as const, name: "w", args: "" };
      const action = routeCommand(parsed, "clarify");
      expect(action).toEqual({ type: "stage", command: "relax", args: "" });
    });

    it("resolves 'w' to why in detail stage", () => {
      const parsed = { kind: "command" as const, name: "w", args: "" };
      const action = routeCommand(parsed, "detail");
      expect(action).toEqual({ type: "stage", command: "why", args: "" });
    });

    it("resolves 's' to search in clarify stage", () => {
      const parsed = { kind: "command" as const, name: "s", args: "" };
      const action = routeCommand(parsed, "clarify");
      expect(action).toEqual({ type: "stage", command: "search", args: "" });
    });

    it("resolves 's' to sort in shortlist stage", () => {
      const parsed = { kind: "command" as const, name: "s", args: "" };
      const action = routeCommand(parsed, "shortlist");
      expect(action).toEqual({ type: "stage", command: "sort", args: "" });
    });

    it("resolves 'a' to add in clarify stage", () => {
      const parsed = { kind: "command" as const, name: "a", args: "" };
      const action = routeCommand(parsed, "clarify");
      expect(action).toEqual({ type: "stage", command: "add", args: "" });
    });

    it("routes clarify search command", () => {
      const parsed = { kind: "command" as const, name: "search", args: "" };
      const action = routeCommand(parsed, "clarify");
      expect(action).toEqual({ type: "stage", command: "search", args: "" });
    });

    it("routes clarify restart command", () => {
      const parsed = { kind: "command" as const, name: "restart", args: "" };
      const action = routeCommand(parsed, "clarify");
      expect(action).toEqual({ type: "stage", command: "restart", args: "" });
    });
  });

  describe("isImmediateCommand", () => {
    it("returns true for /help", () => {
      expect(isImmediateCommand(parseCommand("/help"))).toBe(true);
    });

    it("returns true for /quit", () => {
      expect(isImmediateCommand(parseCommand("/quit"))).toBe(true);
    });

    it("returns false for /refine", () => {
      expect(isImmediateCommand(parseCommand("/refine"))).toBe(false);
    });

    it("returns false for natural language", () => {
      expect(isImmediateCommand(parseCommand("hello"))).toBe(false);
    });

    it("returns false for palette", () => {
      expect(isImmediateCommand(parseCommand("/"))).toBe(false);
    });
  });

  describe("isPaletteTrigger", () => {
    it("returns true for palette", () => {
      expect(isPaletteTrigger(parseCommand("/"))).toBe(true);
    });

    it("returns false for command", () => {
      expect(isPaletteTrigger(parseCommand("/help"))).toBe(false);
    });

    it("returns false for null", () => {
      expect(isPaletteTrigger(parseCommand("hello"))).toBe(false);
    });
  });

  describe("isValidCommand", () => {
    it("returns true for valid command in correct stage", () => {
      expect(isValidCommand(parseCommand("/refine"), "shortlist")).toBe(true);
    });

    it("returns false for valid command in wrong stage", () => {
      expect(isValidCommand(parseCommand("/resume"), "shortlist")).toBe(false);
    });

    it("returns false for unknown command", () => {
      expect(isValidCommand(parseCommand("/foobar"), "shortlist")).toBe(false);
    });

    it("returns false for null input", () => {
      expect(isValidCommand(parseCommand("hello"), "shortlist")).toBe(false);
    });

    it("returns false for palette", () => {
      expect(isValidCommand(parseCommand("/"), "shortlist")).toBe(false);
    });

    it("resolves alias", () => {
      expect(isValidCommand(parseCommand("/r"), "shortlist")).toBe(true);
    });
  });
});
