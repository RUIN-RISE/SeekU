/**
 * Command router — parse and route slash commands.
 *
 * Phase 1 of CLI upgrade: establish command parsing layer.
 * Uses discriminated union for parsed results (no empty string sentinel).
 */

import { findCommand, isImmediate } from "./command-spec.js";
import type { CliStage } from "./command-spec.js";

// ============================================================================
// Parsed Command Types (Discriminated Union)
// ============================================================================

/**
 * Result of parsing user input.
 *
 * - `{ kind: "palette" }` — user typed "/" alone, open command palette
 * - `{ kind: "command"; name; args }` — user typed "/xxx [args]"
 * - `null` — not a command, treat as natural language
 */
export type ParsedCommand =
  | { kind: "palette" }
  | { kind: "command"; name: string; args: string }
  | null;

/**
 * Routed command action for stage-specific handling.
 */
export type CommandAction =
  | { type: "immediate"; command: string; args: string }
  | { type: "stage"; command: string; args: string }
  | { type: "unknown"; name: string; args: string };

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse user input into command or natural language.
 *
 * @param input - Raw user input string
 * @returns ParsedCommand discriminated union
 *
 * @example
 * parseCommand("/")              // { kind: "palette" }
 * parseCommand("/refine")        // { kind: "command", name: "refine", args: "" }
 * parseCommand("/refine add")    // { kind: "command", name: "refine", args: "add" }
 * parseCommand("find engineers") // null
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  // Must start with /
  if (!trimmed.startsWith("/")) {
    return null;
  }

  // Just "/" — open command palette
  if (trimmed === "/") {
    return { kind: "palette" };
  }

  // Extract command name and args
  const withoutSlash = trimmed.slice(1);
  const firstSpace = withoutSlash.indexOf(" ");

  if (firstSpace === -1) {
    // No args: "/refine"
    return { kind: "command", name: withoutSlash.toLowerCase(), args: "" };
  }

  // Has args: "/refine add location"
  const name = withoutSlash.slice(0, firstSpace).toLowerCase();
  const args = withoutSlash.slice(firstSpace + 1).trim();
  return { kind: "command", name, args };
}

// ============================================================================
// Routing
// ============================================================================

/**
 * Route a parsed command to an action type.
 *
 * @param parsed - Parsed command (must be kind: "command")
 * @param stage - Current CLI stage
 * @returns CommandAction for handling
 */
export function routeCommand(
  parsed: { kind: "command"; name: string; args: string },
  stage: CliStage
): CommandAction {
  const { name, args } = parsed;

  // Stage-aware lookup: resolves alias collisions across stages
  const cmd = findCommand(name, stage);
  if (!cmd) {
    return { type: "unknown", name, args };
  }

  // Check if available in current stage
  const availableInStage =
    cmd.stages.includes(stage) || cmd.stages.includes("global");
  if (!availableInStage) {
    return { type: "unknown", name, args };
  }

  // Return canonical command name, not raw input token
  const canonicalName = cmd.name;

  // Immediate commands
  if (cmd.immediate) {
    return { type: "immediate", command: canonicalName, args };
  }

  // Stage commands
  return { type: "stage", command: canonicalName, args };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a parsed command is immediate.
 */
export function isImmediateCommand(parsed: ParsedCommand): boolean {
  if (parsed === null || parsed.kind === "palette") {
    return false;
  }
  return isImmediate(parsed.name);
}

/**
 * Check if parsed input should open command palette.
 */
export function isPaletteTrigger(parsed: ParsedCommand): boolean {
  return parsed?.kind === "palette";
}

/**
 * Check if parsed input is a valid command (exists and available).
 */
export function isValidCommand(
  parsed: ParsedCommand,
  stage: CliStage
): boolean {
  if (parsed === null || parsed.kind === "palette") {
    return false;
  }
  const cmd = findCommand(parsed.name, stage);
  if (!cmd) return false;
  return cmd.stages.includes(stage) || cmd.stages.includes("global");
}

/**
 * Type guard: check if a value is a CommandAction (from / command routing).
 */
export function isCommandAction(value: unknown): value is CommandAction {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value.type === "immediate" || value.type === "stage" || value.type === "unknown")
  );
}
