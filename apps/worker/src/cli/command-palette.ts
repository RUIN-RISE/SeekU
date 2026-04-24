/**
 * Command palette — compact command list.
 *
 * Two-line format: stage commands on first line, global on second.
 */

import chalk from "chalk";
import { getCommandsForStage, type CliStage } from "./command-spec.js";

export function renderCommandPalette(stage: CliStage): void {
  const commands = getCommandsForStage(stage);

  const stageCommands = commands
    .filter(c => c.stages.includes(stage))
    .filter(c => c.name !== "resume" || stage === "home");
  const taskCommands = commands.filter(c =>
    ["new", "task", "tasks", "workboard", "transcript"].includes(c.name)
    && !c.stages.includes(stage)
  );
  const systemCommands = commands.filter(c =>
    ["help", "memory", "quit"].includes(c.name)
    && !c.stages.includes(stage)
  );

  if (stageCommands.length > 0) {
    console.log(chalk.dim(`主要：${stageCommands.map(cmd => `/${cmd.name}`).join("  ")}`));
  }

  if (taskCommands.length > 0) {
    console.log(chalk.dim(`任务：${taskCommands.map(cmd => `/${cmd.name}`).join("  ")}`));
  }

  if (systemCommands.length > 0) {
    console.log(chalk.dim(`系统：${systemCommands.map(cmd => `/${cmd.name}`).join("  ")}`));
  }

  console.log("");
}
