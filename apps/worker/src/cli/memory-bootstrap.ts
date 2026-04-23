/**
 * Memory-aware session bootstrap.
 *
 * Hydrates user memory at session start, shows a concise summary,
 * and lets the user adopt / ignore / view their stored preferences.
 * Memory only seeds defaults — subsequent user input always overrides.
 *
 * Rules:
 * - Read-only: no writes during bootstrap
 * - Explicit > inferred when merging into conditions
 * - User must explicitly choose; no silent adoption
 * - Skip entirely if memoryPaused or no memory
 */

import chalk from "chalk";
import type { SearchConditions } from "./types.js";
import type { UserMemoryStore } from "./user-memory-store.js";
import type {
  PreferenceContent,
  UserMemoryContext,
  UserMemoryRecord
} from "./user-memory-types.js";

// ============================================================================
// Types
// ============================================================================

export type BootstrapChoice = "adopt" | "ignore" | "view";

export interface BootstrapSummary {
  /** Human-readable one-liners for each applicable preference. */
  explicitLines: string[];
  /** Human-readable one-liners for inferred prefs (shown dimmer). */
  inferredLines: string[];
  /** Total count of all memories (for "view" option). */
  totalMemoryCount: number;
}

export interface BootstrapResult {
  /** What the user chose. */
  choice: BootstrapChoice;
  /** The conditions seeded from memory (empty if user chose ignore). */
  seededConditions: Partial<SearchConditions>;
  /** The full context if user wants to view. */
  context?: UserMemoryContext;
}

// ============================================================================
// Summary Shaping
// ============================================================================

function preferenceToLine(content: PreferenceContent): string[] {
  const parts: string[] = [];

  if (content.techStack?.length) {
    parts.push(`技术栈 ${content.techStack.join(", ")}`);
  }
  if (content.locations?.length) {
    parts.push(`地点 ${content.locations.join(", ")}`);
  }
  if (content.role) {
    parts.push(`角色 ${content.role}`);
  }
  if (content.sourceBias) {
    parts.push(`来源 ${content.sourceBias}`);
  }
  if (content.preferFresh) {
    parts.push("优先最近活跃");
  }
  if (content.mustHave?.length) {
    parts.push(`必须 ${content.mustHave.join(", ")}`);
  }
  if (content.exclude?.length) {
    parts.push(`排除 ${content.exclude.join(", ")}`);
  }
  if (content.avoidInactive) {
    parts.push("避免不活跃候选人");
  }
  if (content.avoidInexperience) {
    parts.push("避免经验不足");
  }

  return parts;
}

export function shapeSummary(context: UserMemoryContext): BootstrapSummary {
  const explicitLines: string[] = [];
  const inferredLines: string[] = [];

  for (const record of context.preferences) {
    const content = record.content as PreferenceContent;
    const lines = preferenceToLine(content);
    const tag = record.source === "inferred" ? chalk.dim("[推断]") : "";

    if (record.source === "inferred") {
      inferredLines.push(...lines.map((l) => `${tag} ${l}`));
    } else {
      explicitLines.push(...lines);
    }
  }

  return {
    explicitLines,
    inferredLines,
    totalMemoryCount: context.allMemories.length
  };
}

// ============================================================================
// Display
// ============================================================================

export function displayMemorySummary(summary: BootstrapSummary): void {
  if (summary.explicitLines.length === 0 && summary.inferredLines.length === 0) {
    return;
  }

  console.log("");
  console.log(chalk.cyan("可沿用的偏好："));

  for (const line of summary.explicitLines) {
    console.log(`  ${line}`);
  }

  for (const line of summary.inferredLines) {
    console.log(`  ${chalk.dim(line)}`);
  }

  console.log("");
}

export function displayFullMemory(context: UserMemoryContext): void {
  console.log("");
  console.log(chalk.bold("完整记忆："));
  console.log(chalk.dim("-".repeat(40)));

  const memories = context.allMemories;
  if (memories.length === 0) {
    console.log(chalk.dim("  暂无存储的记忆。"));
    console.log("");
    return;
  }

  for (const record of memories) {
    const kindLabel =
      record.kind === "preference"
        ? "偏好"
        : record.kind === "feedback"
          ? "反馈"
          : "招聘上下文";
    const sourceLabel = record.source === "inferred" ? chalk.dim(" (推断)") : "";
    const confidence = `置信度 ${(record.confidence * 100).toFixed(0)}%`;
    const content = JSON.stringify(record.content);

    console.log(`  ${chalk.cyan(kindLabel)}${sourceLabel} ${chalk.dim(confidence)}`);
    console.log(`  ${chalk.dim(content.length > 80 ? content.slice(0, 80) + "..." : content)}`);
  }

  console.log("");
}

// ============================================================================
// Conditions Seeding
// ============================================================================

/**
 * Merge EXPLICIT memory preferences into a partial SearchConditions.
 * Inferred preferences are shown to the user but NOT seeded into defaults.
 * This is the V1 contract: inferred memory is informational only.
 */
export function seedConditionsFromMemory(
  context: UserMemoryContext
): Partial<SearchConditions> {
  const seeded: Partial<SearchConditions> = {};

  // V1: Only explicit preferences are seeded. Inferred is shown but not defaulted.
  const explicitPrefs = context.preferences.filter((p) => p.source === "explicit");

  for (const record of explicitPrefs) {
    const content = record.content as PreferenceContent;

    if (content.techStack?.length) {
      seeded.skills = unionDedupe(seeded.skills, content.techStack);
    }
    if (content.locations?.length) {
      seeded.locations = unionDedupe(seeded.locations, content.locations);
    }
    if (content.role && !seeded.role) {
      seeded.role = content.role;
    }
    if (content.sourceBias && !seeded.sourceBias) {
      seeded.sourceBias = content.sourceBias as "bonjour" | "github";
    }
    if (content.preferFresh && !seeded.preferFresh) {
      seeded.preferFresh = content.preferFresh;
    }
    if (content.mustHave?.length) {
      seeded.mustHave = unionDedupe(seeded.mustHave, content.mustHave);
    }
    if (content.exclude?.length) {
      seeded.exclude = unionDedupe(seeded.exclude, content.exclude);
    }
  }

  return seeded;
}

function unionDedupe(
  a: string[] | undefined,
  b: string[] | undefined
): string[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  const set = new Set([...(a ?? []), ...(b ?? [])]);
  return set.size > 0 ? [...set] : undefined;
}

// ============================================================================
// Bootstrap Flow
// ============================================================================

/**
 * Parse user input into a bootstrap choice.
 */
export function parseBootstrapChoice(input: string): BootstrapChoice | null {
  const normalized = input.trim().toLowerCase();

  if (
    normalized === "沿用" ||
    normalized === "y" ||
    normalized === "yes" ||
    normalized === "1" ||
    normalized.startsWith("adopt") ||
    normalized.startsWith("沿用")
  ) {
    return "adopt";
  }

  if (
    normalized === "查看" ||
    normalized === "view" ||
    normalized === "v" ||
    normalized === "2" ||
    normalized.startsWith("查看")
  ) {
    return "view";
  }

  if (
    normalized === "忽略" ||
    normalized === "ignore" ||
    normalized === "skip" ||
    normalized === "n" ||
    normalized === "no" ||
    normalized === "3" ||
    normalized.startsWith("忽略")
  ) {
    return "ignore";
  }

  return null;
}

/**
 * Run the memory bootstrap flow at session start.
 *
 * Returns a BootstrapResult indicating what the user chose and
 * any conditions to seed.
 */
export async function runMemoryBootstrap(
  memoryStore: UserMemoryStore,
  askFreeform: (prompt: string) => Promise<string | null>
): Promise<BootstrapResult> {
  // Check if memory is paused — skip entirely
  const memoryPaused = await memoryStore.isMemoryPaused();
  if (memoryPaused) {
    return { choice: "ignore", seededConditions: {} };
  }

  // Hydrate context (read-only)
  const context = await memoryStore.hydrateContext();

  // No preferences at all — skip
  if (context.preferences.length === 0) {
    return { choice: "ignore", seededConditions: {}, context };
  }

  // Shape and display summary
  const summary = shapeSummary(context);

  if (summary.explicitLines.length === 0 && summary.inferredLines.length === 0) {
    return { choice: "ignore", seededConditions: {}, context };
  }

  displayMemorySummary(summary);

  // Prompt user for choice
  while (true) {
    const viewHint = summary.totalMemoryCount > context.preferences.length
      ? ` / [查看] 全部 ${summary.totalMemoryCount} 条记忆`
      : " / [查看] 完整记忆";
    const promptText = `[沿用] 作为默认条件${viewHint} / [忽略]`;

    const input = await askFreeform(promptText);
    if (!input?.trim()) {
      // Empty input = ignore
      console.log(chalk.dim("不沿用记忆。"));
      return { choice: "ignore", seededConditions: {}, context };
    }

    const choice = parseBootstrapChoice(input);
    if (!choice) {
      console.log(chalk.dim("请输入 沿用 / 查看 / 忽略"));
      continue;
    }

    if (choice === "view") {
      displayFullMemory(context);
      // After viewing, return to the same selection loop (re-display summary)
      displayMemorySummary(summary);
      continue;
    }

    if (choice === "adopt") {
      console.log(chalk.green("已沿用偏好作为默认搜索条件。"));
      return {
        choice: "adopt",
        seededConditions: seedConditionsFromMemory(context),
        context
      };
    }

    // ignore
    console.log(chalk.dim("不沿用记忆。"));
    return { choice: "ignore", seededConditions: {}, context };
  }
}
