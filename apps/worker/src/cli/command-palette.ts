/**
 * Command palette — static command list rendering.
 *
 * Phase 4 of CLI upgrade: render available commands for a stage.
 * Static list for now, no arrow selection.
 */

import chalk from "chalk";
import { getCommandsForStage, type CliStage } from "./command-spec.js";

export function renderCommandPalette(stage: CliStage): void {
  const commands = getCommandsForStage(stage);

  console.log(chalk.bold("\n命令列表：\n"));

  // Current stage commands first
  const stageCommands = commands.filter(c => c.stages.includes(stage));
  const globalCommands = commands.filter(c => c.stages.includes("global") && !c.stages.includes(stage));

  for (const cmd of stageCommands) {
    const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(", ")})` : "";
    const args = cmd.argumentHint ? ` ${cmd.argumentHint}` : "";
    console.log(`  /${cmd.name}${args}${aliases}  ${chalk.dim(cmd.description)}`);
  }

  if (globalCommands.length > 0) {
    console.log(chalk.dim("\n全局命令："));
    for (const cmd of globalCommands) {
      const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(", ")})` : "";
      console.log(`  /${cmd.name}  ${chalk.dim(cmd.description)}${aliases}`);
    }
  }

  console.log("");
}
