/**
 * Command specification — declarative command registry.
 *
 * Phase 1 of CLI upgrade: establish command declaration layer.
 * Pure data, no handlers. Handlers live in command-router.ts and tui.ts.
 */

// ============================================================================
// Stage Definition
// ============================================================================

/**
 * CLI interaction stages. Commands are filtered by current stage.
 */
export type CliStage =
  | "home"
  | "clarify"
  | "search"
  | "shortlist"
  | "detail"
  | "compare"
  | "decision"
  | "global";

// ============================================================================
// Command Specification
// ============================================================================

/**
 * Declarative command definition.
 */
export interface SeekuCommand {
  /** Primary command name (e.g., "refine") */
  name: string;
  /** Alternative invocations (e.g., ["r"] for refine) */
  aliases: string[];
  /** Short description for help/palette */
  description: string;
  /** Stages where this command is available */
  stages: CliStage[];
  /** If true, executes immediately without waiting for stop point */
  immediate?: boolean;
  /** Hint for command arguments (displayed in palette) */
  argumentHint?: string;
}

// ============================================================================
// Command Registry
// ============================================================================

/**
 * All registered commands.
 *
 * Data source: extracted from tui.ts if/else blocks and frozen design.
 */
export const ALL_COMMANDS: SeekuCommand[] = [
  // ---------------------------------------------------------------------------
  // Clarify Stage Commands
  // ---------------------------------------------------------------------------

  {
    name: "search",
    aliases: ["s", "1"],
    description: "直接搜索",
    stages: ["clarify"]
  },
  {
    name: "add",
    aliases: ["a", "2"],
    description: "补充条件",
    stages: ["clarify"]
  },
  {
    name: "relax",
    aliases: ["w", "3"],
    description: "放宽条件",
    stages: ["clarify"]
  },
  {
    name: "restart",
    aliases: ["4"],
    description: "重新描述需求",
    stages: ["clarify"]
  },

  // ---------------------------------------------------------------------------
  // Stage Commands
  // ---------------------------------------------------------------------------

  {
    name: "refine",
    aliases: ["r"],
    description: "调整搜索条件",
    stages: ["shortlist", "compare", "detail"],
    argumentHint: "[条件描述]"
  },
  {
    name: "compare",
    aliases: ["c"],
    description: "进入对比模式",
    stages: ["shortlist"]
  },
  {
    name: "sort",
    aliases: ["s"],
    description: "排序短名单",
    stages: ["shortlist"],
    argumentHint: "[排序模式]"
  },
  {
    name: "export",
    aliases: ["e"],
    description: "导出结果",
    stages: ["shortlist", "decision"]
  },
  {
    name: "back",
    aliases: ["b"],
    description: "返回上一阶段",
    stages: ["detail", "compare"]
  },
  {
    name: "open",
    aliases: ["o"],
    description: "打开 Bonjour 主页",
    stages: ["detail"]
  },
  {
    name: "why",
    aliases: ["w"],
    description: "查看评分依据",
    stages: ["detail"]
  },
  {
    name: "clear",
    aliases: [],
    description: "清空对比池",
    stages: ["compare"]
  },

  // ---------------------------------------------------------------------------
  // Task Commands
  // ---------------------------------------------------------------------------

  {
    name: "resume",
    aliases: [],
    description: "继续选中任务",
    stages: ["home"]
  },
  {
    name: "new",
    aliases: [],
    description: "新开任务",
    stages: ["home", "global"]
  },
  {
    name: "task",
    aliases: [],
    description: "查看当前任务状态",
    stages: ["global"],
    immediate: true
  },
  {
    name: "tasks",
    aliases: [],
    description: "返回任务列表",
    stages: ["global"],
    immediate: true
  },
  {
    name: "transcript",
    aliases: [],
    description: "查看历史对话",
    stages: ["global"]
  },
  {
    name: "workboard",
    aliases: [],
    description: "查看任务工作板",
    stages: ["global"]
  },

  // ---------------------------------------------------------------------------
  // System Commands
  // ---------------------------------------------------------------------------

  {
    name: "help",
    aliases: ["?"],
    description: "查看帮助",
    stages: ["global"],
    immediate: true
  },
  {
    name: "memory",
    aliases: ["m"],
    description: "管理记忆偏好",
    stages: ["global"],
    immediate: true
  },
  {
    name: "quit",
    aliases: ["q", "exit"],
    description: "退出",
    stages: ["global"],
    immediate: true
  }
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get commands available in a specific stage.
 * "global" stage commands are always included.
 */
export function getCommandsForStage(stage: CliStage): SeekuCommand[] {
  return ALL_COMMANDS.filter(cmd =>
    cmd.stages.includes(stage) || cmd.stages.includes("global")
  );
}

/**
 * Get all immediate commands (execute without waiting for stop point).
 */
export function getImmediateCommands(): SeekuCommand[] {
  return ALL_COMMANDS.filter(cmd => cmd.immediate === true);
}

/**
 * Find a command by name or alias in a specific stage context.
 * This resolves the stage-specific alias collision problem.
 */
export function findCommand(nameOrAlias: string, stage?: CliStage): SeekuCommand | undefined {
  // If stage is provided, search stage-specific commands first
  if (stage) {
    const stageMatch = ALL_COMMANDS.find(cmd =>
      (cmd.stages.includes(stage) || cmd.stages.includes("global")) &&
      (cmd.name === nameOrAlias || cmd.aliases.includes(nameOrAlias))
    );
    if (stageMatch) return stageMatch;
  }

  // Fallback to global search (for backward compatibility)
  return ALL_COMMANDS.find(cmd =>
    cmd.name === nameOrAlias || cmd.aliases.includes(nameOrAlias)
  );
}

/**
 * Check if a command name/alias is immediate.
 */
export function isImmediate(nameOrAlias: string): boolean {
  const cmd = findCommand(nameOrAlias);
  return cmd?.immediate === true;
}

/**
 * Get all command names and aliases (for autocomplete/validation).
 */
export function getAllCommandNames(): Set<string> {
  const names = new Set<string>();
  for (const cmd of ALL_COMMANDS) {
    names.add(cmd.name);
    for (const alias of cmd.aliases) {
      names.add(alias);
    }
  }
  return names;
}
