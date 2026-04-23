import { describe, expect, it, vi } from "vitest";

import { ShellRenderer } from "../shell-renderer.js";
import type { ContextBarData } from "../workboard-view-model.js";

// Capture console.log output
function captureOutput(fn: () => void): string[] {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = origLog;
  }
  return lines;
}

describe("ShellRenderer", () => {
  const renderer = new ShellRenderer();

  describe("renderHeader", () => {
    it("contains task title and stage name", () => {
      const output = captureOutput(() =>
        renderer.renderHeader({ taskTitle: "找 AI 工程师", stage: "shortlist" })
      );
      const combined = output.join("\n");
      expect(combined).toContain("找 AI 工程师");
      expect(combined).toContain("短名单");
      expect(combined).toContain("Seeku CLI");
    });

    it("renders without taskTitle", () => {
      const output = captureOutput(() =>
        renderer.renderHeader({ stage: "home" })
      );
      const combined = output.join("\n");
      expect(combined).toContain("Seeku CLI");
      expect(combined).toContain("首页");
    });

    it("includes status when provided", () => {
      const output = captureOutput(() =>
        renderer.renderHeader({ stage: "shortlist", status: "可继续" })
      );
      expect(output.join("\n")).toContain("可继续");
    });
  });

  describe("renderContextBar", () => {
    const contextBar: ContextBarData = {
      stageLabel: "短名单就绪",
      summary: "已形成 3 人短名单",
      nextActionTitle: "对比候选人",
      blocked: false
    };

    it("contains stage label and next action", () => {
      const output = captureOutput(() =>
        renderer.renderContextBar(contextBar)
      );
      const combined = output.join("\n");
      expect(combined).toContain("短名单就绪");
      expect(combined).toContain("对比候选人");
    });

    it("with blocked=true contains blocker label", () => {
      const blocked: ContextBarData = {
        ...contextBar,
        blocked: true,
        blockerLabel: "检索无结果"
      };
      const output = captureOutput(() =>
        renderer.renderContextBar(blocked)
      );
      const combined = output.join("\n");
      expect(combined).toContain("检索无结果");
    });

    it("does not show blocker when not blocked", () => {
      const output = captureOutput(() =>
        renderer.renderContextBar(contextBar)
      );
      expect(output.join("\n")).not.toContain("阻塞");
    });
  });

  describe("renderInputBar", () => {
    it("shortlist contains refine, compare, sort descriptions", () => {
      const output = captureOutput(() =>
        renderer.renderInputBar("shortlist")
      );
      const combined = output.join("\n");
      expect(combined).toContain("调整搜索条件");
      expect(combined).toContain("进入对比模式");
      expect(combined).toContain("排序短名单");
    });

    it("home contains resume and new descriptions", () => {
      const output = captureOutput(() =>
        renderer.renderInputBar("home")
      );
      const combined = output.join("\n");
      expect(combined).toContain("继续选中任务");
      expect(combined).toContain("新开任务");
    });

    it("limits to 7 commands", () => {
      const output = captureOutput(() =>
        renderer.renderInputBar("shortlist")
      );
      const combined = output.join("\n");
      // Should not have more than 7 command hints
      const hintCount = (combined.match(/\//g) || []).length;
      expect(hintCount).toBeLessThanOrEqual(7);
    });
  });

  describe("renderShell", () => {
    it("outputs complete shell with all zones", () => {
      const output = captureOutput(() =>
        renderer.renderShell({
          stage: "shortlist",
          taskTitle: "找 AI 工程师",
          status: "可继续",
          contextBar: {
            stageLabel: "短名单就绪",
            summary: "已形成 3 人短名单",
            nextActionTitle: "对比候选人",
            blocked: false
          }
        })
      );
      const combined = output.join("\n");
      expect(combined).toContain("Seeku CLI");
      expect(combined).toContain("找 AI 工程师");
      expect(combined).toContain("短名单就绪");
      expect(combined).toContain("对比候选人");
    });

    it("renders without context bar", () => {
      const output = captureOutput(() =>
        renderer.renderShell({ stage: "home" })
      );
      const combined = output.join("\n");
      expect(combined).toContain("Seeku CLI");
      expect(combined).toContain("首页");
    });
  });
});
