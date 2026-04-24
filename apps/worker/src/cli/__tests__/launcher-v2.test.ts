import { describe, expect, it, vi } from "vitest";

import { parseLauncherAction } from "../index.js";

describe("parseLauncherAction", () => {
  const defaultSessionId = "s-default-123";

  describe("natural language input", () => {
    it("returns create_new_task with initialPrompt for natural language", () => {
      const action = parseLauncherAction("find AI engineers in Hangzhou", 3, defaultSessionId);
      expect(action).toEqual({ type: "new", initialPrompt: "find AI engineers in Hangzhou" });
    });

    it("returns create_new_task for multi-word input", () => {
      const action = parseLauncherAction("找杭州的 AI 工程师", 3, defaultSessionId);
      expect(action).toEqual({ type: "new", initialPrompt: "找杭州的 AI 工程师" });
    });
  });

  describe("/resume command", () => {
    it("returns attach with default sessionId for /resume", () => {
      const action = parseLauncherAction("/resume", 3, defaultSessionId);
      expect(action).toEqual({ type: "attach", sessionId: defaultSessionId });
    });

    it("returns null for /resume without defaultSessionId", () => {
      const action = parseLauncherAction("/resume", 3, undefined);
      expect(action).toBeNull();
    });
  });

  describe("/new command", () => {
    it("returns create_new_task without initialPrompt for /new", () => {
      const action = parseLauncherAction("/new", 3, defaultSessionId);
      expect(action).toEqual({ type: "new" });
    });
  });

  describe("/help command", () => {
    it("returns help for /help", () => {
      const action = parseLauncherAction("/help", 3, defaultSessionId);
      expect(action).toEqual({ type: "help" });
    });

    it("returns help for ?", () => {
      const action = parseLauncherAction("?", 3, defaultSessionId);
      expect(action).toEqual({ type: "help" });
    });
  });

  describe("memory command", () => {
    it("returns open_memory for 'memory'", () => {
      const action = parseLauncherAction("memory", 3, defaultSessionId);
      expect(action).toEqual({ type: "memory" });
    });

    it("returns open_memory for 'm'", () => {
      const action = parseLauncherAction("m", 3, defaultSessionId);
      expect(action).toEqual({ type: "memory" });
    });
  });

  describe("quit command", () => {
    it("returns quit for 'q'", () => {
      const action = parseLauncherAction("q", 3, defaultSessionId);
      expect(action).toEqual({ type: "quit" });
    });

    it("returns quit for 'quit'", () => {
      const action = parseLauncherAction("quit", 3, defaultSessionId);
      expect(action).toEqual({ type: "quit" });
    });

    it("returns quit for 'exit'", () => {
      const action = parseLauncherAction("exit", 3, defaultSessionId);
      expect(action).toEqual({ type: "quit" });
    });
  });

  describe("number selection", () => {
    it("returns attach with index-based sessionId for number 2", () => {
      const action = parseLauncherAction("2", 5, defaultSessionId);
      expect(action).toEqual({ type: "attach", sessionId: "__index__:0" });
    });

    it("returns attach with index-based sessionId for number 3", () => {
      const action = parseLauncherAction("3", 5, defaultSessionId);
      expect(action).toEqual({ type: "attach", sessionId: "__index__:1" });
    });

    it("returns null for number out of range", () => {
      const action = parseLauncherAction("10", 5, defaultSessionId);
      expect(action).toBeNull();
    });

    it("returns new for number 1", () => {
      const action = parseLauncherAction("1", 5, defaultSessionId);
      expect(action).toEqual({ type: "new" });
    });
  });

  describe("attach command", () => {
    it("returns attach with explicit sessionId", () => {
      const action = parseLauncherAction("attach abc-def-123", 3, defaultSessionId);
      expect(action).toEqual({ type: "attach", sessionId: "abc-def-123" });
    });
  });

  describe("/task command", () => {
    it("returns show_task with default sessionId for /task", () => {
      const action = parseLauncherAction("/task", 3, defaultSessionId);
      expect(action).toEqual({ type: "show_task", sessionId: defaultSessionId });
    });

    it("returns show_task with default sessionId for /workboard", () => {
      const action = parseLauncherAction("/workboard", 3, defaultSessionId);
      expect(action).toEqual({ type: "show_task", sessionId: defaultSessionId });
    });

    it("returns show_transcript with default sessionId for /transcript", () => {
      const action = parseLauncherAction("/transcript", 3, defaultSessionId);
      expect(action).toEqual({ type: "show_transcript", sessionId: defaultSessionId });
    });

    it("returns show_tasks for /tasks", () => {
      const action = parseLauncherAction("/tasks", 3, defaultSessionId);
      expect(action).toEqual({ type: "show_tasks" });
    });
  });

  describe("empty items", () => {
    it("returns new for empty input with no items", () => {
      const action = parseLauncherAction("", 0, undefined);
      expect(action).toEqual({ type: "new" });
    });
  });
});
