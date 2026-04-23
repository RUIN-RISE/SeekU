/**
 * Shell renderer — static snapshot before prompt.
 *
 * Phase 2 of CLI upgrade: render header + context bar + input bar
 * before enquirer prompt. Single snapshot, no dynamic refresh during prompt.
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

    // Stage label
    const stageLabels: Record<CliStage, string> = {
      home: "首页",
      clarify: "条件澄清",
      search: "检索中",
      shortlist: "短名单",
      detail: "候选人详情",
      compare: "对比决策",
      decision: "推荐就绪",
      global: "全局"
    };
    parts.push(stageLabels[args.stage] || args.stage);

    // Status
    if (args.status) {
      parts.push(args.status);
    }

    const content = parts.join(" ─ ");
    const width = Math.max(content.length + 4, 60);
    const padding = width - content.length - 4;

    console.log(chalk.dim("┌") + " " + chalk.bold(content) + " " + chalk.dim("─".repeat(padding) + "┐"));

    // Guide hint (Phase 8 mascot placeholder)
    if (args.guideHint) {
      console.log(chalk.dim("│") + " " + chalk.cyan(args.guideHint) + " ".repeat(width - args.guideHint.length - 3) + chalk.dim("│"));
    }
  }

  /**
   * Render the context bar zone.
   * Format: │ 阶段: [stage]  下一步: [action]  阻塞: [blocker] │
   */
  renderContextBar(data: ContextBarData): void {
    const parts: string[] = [];

    parts.push(`阶段: ${data.stageLabel}`);
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
   * Format: │ /refine 调整  /compare 对比  /sort 排序  /task 状态 │
   */
  renderInputBar(stage: CliStage): void {
    const commands = getCommandsForStage(stage);

    // Limit to 5-7 commands for density
    const displayCommands = commands.slice(0, 7);

    const hints = displayCommands.map(cmd => {
      const alias = cmd.aliases[0] || cmd.name[0];
      return `/${alias} ${cmd.description}`;
    });

    const content = hints.join("  ");
    const width = Math.max(content.length + 4, 60);
    const padding = width - content.length - 2;

    console.log(chalk.dim("│") + " " + chalk.dim(content) + " ".repeat(padding) + chalk.dim("│"));
  }

  /**
   * Render the complete shell (header + context bar + input bar).
   * Called before enquirer prompt in non-shortlist stages.
   */
  renderShell(args: ShellRenderArgs): void {
    // Clear screen for clean render
    console.clear();

    // Header
    this.renderHeader({
      taskTitle: args.taskTitle,
      stage: args.stage,
      status: args.status,
      guideHint: args.guideHint
    });

    // Separator
    console.log(chalk.dim("├" + "─".repeat(59) + "┤"));

    // Body placeholder (rendered by each stage)
    // This is where stage-specific content goes

    // Context bar (if provided)
    if (args.contextBar) {
      console.log(chalk.dim("├" + "─".repeat(59) + "┤"));
      this.renderContextBar(args.contextBar);
    }

    // Input bar
    console.log(chalk.dim("├" + "─".repeat(59) + "┤"));
    this.renderInputBar(args.stage);

    // Bottom border
    console.log(chalk.dim("└" + "─".repeat(59) + "┘"));

    // Blank line before prompt
    console.log("");
  }
}

// Singleton instance for convenience
export const shellRenderer = new ShellRenderer();
