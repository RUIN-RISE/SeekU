/**
 * Shell renderer — static snapshot before prompt.
 *
 * Phase 2 of CLI upgrade: render header + context bar + input bar
 * before enquirer prompt. Single snapshot, no dynamic refresh during prompt.
 *
 * Split into renderShellTop / renderShellBottom so the body zone
 * (rendered by each stage) sits between them without being cleared.
 */

import chalk from "chalk";
import type { ContextBarData } from "./workboard-view-model.js";
import { getCommandsForStage } from "./command-spec.js";
import type { CliStage } from "./command-spec.js";

// ============================================================================
// Render Args
// ============================================================================

export interface ShellRenderArgs {
  /** Current CLI stage */
  stage: CliStage;
  /** Task title (optional for home stage) */
  taskTitle?: string;
  /** Status: 可继续 | 只读 | 阻塞 */
  status?: string;
  /** Context bar data (from workboard view model) */
  contextBar?: ContextBarData;
  /** Guide hint for mascot (Phase 8) */
  guideHint?: string;
}

// ============================================================================
// Shell Renderer
// ============================================================================

const STAGE_LABELS: Record<CliStage, string> = {
  home: "首页",
  clarify: "条件澄清",
  search: "检索中",
  shortlist: "短名单",
  detail: "候选人详情",
  compare: "对比决策",
  decision: "推荐就绪",
  global: "全局"
};

export class ShellRenderer {
  /**
   * Render the header zone.
   * Format: ┌ Seeku CLI ─ [task title] ─ [stage] ─ [status] ────┐
   */
  renderHeader(args: {
    taskTitle?: string;
    stage: CliStage;
    status?: string;
    guideHint?: string;
  }): void {
    const parts = ["Seeku CLI"];

    if (args.taskTitle) {
      parts.push(args.taskTitle);
    }

    parts.push(STAGE_LABELS[args.stage] || args.stage);

    if (args.status) {
      parts.push(args.status);
    }

    const content = parts.join(" ─ ");
    const width = Math.max(content.length + 4, 60);
    const padding = width - content.length - 4;

    console.log(chalk.dim("┌") + " " + chalk.bold(content) + " " + chalk.dim("─".repeat(padding) + "┐"));

    if (args.guideHint) {
      console.log(chalk.dim("│") + " " + chalk.cyan(args.guideHint) + " ".repeat(width - args.guideHint.length - 3) + chalk.dim("│"));
    }
  }

  /**
   * Render the context bar zone.
   * Format: │ 阶段: [stage]  摘要: [summary]  下一步: [action]  阻塞: [blocker] │
   */
  renderContextBar(data: ContextBarData): void {
    const parts: string[] = [];

    parts.push(`阶段: ${data.stageLabel}`);

    if (data.summary) {
      parts.push(`摘要: ${data.summary}`);
    }

    parts.push(`下一步: ${data.nextActionTitle}`);

    if (data.blocked && data.blockerLabel) {
      parts.push(chalk.yellow(`阻塞: ${data.blockerLabel}`));
    }

    const content = parts.join("  ");
    const width = Math.max(content.length + 4, 60);
    const padding = width - content.length - 2;

    console.log(chalk.dim("│") + " " + content + " ".repeat(padding) + chalk.dim("│"));
  }

  /**
   * Render the input bar zone (bottom bar with command hints).
   * Uses canonical command names, not aliases, to avoid conflicts.
   */
  renderInputBar(stage: CliStage): void {
    const commands = getCommandsForStage(stage);
    const displayCommands = commands.slice(0, 7);

    const hints = displayCommands.map(cmd => `/${cmd.name} ${cmd.description}`);

    const content = hints.join("  ");
    const width = Math.max(content.length + 4, 60);
    const padding = width - content.length - 2;

    console.log(chalk.dim("│") + " " + chalk.dim(content) + " ".repeat(padding) + chalk.dim("│"));
  }

  /**
   * Render shell top half: header + context bar + separator.
   * Called BEFORE the body zone (stage-specific content).
   * Does NOT clear screen — caller controls that.
   */
  renderShellTop(args: ShellRenderArgs): void {
    this.renderHeader({
      taskTitle: args.taskTitle,
      stage: args.stage,
      status: args.status,
      guideHint: args.guideHint
    });

    if (args.contextBar) {
      this.renderContextBar(args.contextBar);
    }

    console.log(chalk.dim("├" + "─".repeat(59) + "┤"));
  }

  /**
   * Render shell bottom half: context bar + input bar + bottom border.
   * Called AFTER the body zone, before enquirer prompt.
   */
  renderShellBottom(args: ShellRenderArgs): void {
    console.log(chalk.dim("├" + "─".repeat(59) + "┤"));

    if (args.contextBar) {
      this.renderContextBar(args.contextBar);
      console.log(chalk.dim("├" + "─".repeat(59) + "┤"));
    }

    this.renderInputBar(args.stage);
    console.log(chalk.dim("└" + "─".repeat(59) + "┘"));
    console.log("");
  }

  /**
   * Render the complete shell in one call.
   * Use only when there is no body zone to preserve
   * (e.g., clarify stage before options list).
   * Does NOT clear screen.
   */
  renderShell(args: ShellRenderArgs): void {
    this.renderShellTop(args);

    // Body placeholder (rendered by each stage)

    this.renderShellBottom(args);
  }
}

export const shellRenderer = new ShellRenderer();
