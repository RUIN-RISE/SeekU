/**
 * Memory management commands for the CLI.
 *
 * Minimal command surface:
 * - memory list   — show all memories grouped by kind
 * - memory delete <id> — delete a specific memory
 * - memory pause  — pause memory consumption/capture
 * - memory resume — resume memory consumption/capture
 *
 * Rules:
 * - Read-only inspection, no task truth changes
 * - Delete is scoped to the current user
 * - Pause/resume persisted via user_preferences table
 * - Explicit vs inferred clearly labeled
 */

import chalk from "chalk";
import type { UserMemoryStore } from "./user-memory-store.js";
import type {
  UserMemoryContext,
  UserMemoryKind,
  UserMemoryRecord,
  CandidateFeedbackRecord,
  FeedbackReasonCode
} from "./user-memory-types.js";
import { FEEDBACK_REASON_LABELS } from "./user-memory-types.js";

// ============================================================================
// Types
// ============================================================================

export type MemoryCommand =
  | { action: "list" }
  | { action: "delete"; id: string }
  | { action: "pause" }
  | { action: "resume" }
  | { action: "help" };

export interface MemoryCommandResult {
  ok: boolean;
  message: string;
}

// ============================================================================
// Command Parsing
// ============================================================================

export function parseMemoryCommand(input: string): MemoryCommand | null {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd === "list" || cmd === "ls" || cmd === "l") {
    return { action: "list" };
  }

  if (cmd === "delete" || cmd === "rm" || cmd === "del") {
    const id = parts[1];
    if (!id) {
      return null;
    }
    return { action: "delete", id };
  }

  if (cmd === "pause" || cmd === "off") {
    return { action: "pause" };
  }

  if (cmd === "resume" || cmd === "on") {
    return { action: "resume" };
  }

  if (cmd === "help" || cmd === "?" || cmd === "h") {
    return { action: "help" };
  }

  return null;
}

// ============================================================================
// Display
// ============================================================================

const KIND_LABELS: Record<UserMemoryKind, string> = {
  preference: "偏好",
  feedback: "反馈",
  hiring_context: "招聘上下文"
};

function formatSourceLabel(source: string): string {
  if (source === "explicit") return chalk.green("显式");
  if (source === "inferred") return chalk.dim("推断");
  return source;
}

function formatExpiry(record: UserMemoryRecord): string {
  if (!record.expiresAt) return "";
  const daysLeft = Math.max(
    0,
    Math.ceil((record.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  return chalk.dim(` (${daysLeft}天后过期)`);
}

function contentSummary(content: Record<string, unknown>): string {
  const parts: string[] = [];
  if (content.techStack) parts.push(`技术栈 ${(content.techStack as string[]).join(", ")}`);
  if (content.locations) parts.push(`地点 ${(content.locations as string[]).join(", ")}`);
  if (content.role) parts.push(`角色 ${content.role}`);
  if (content.sourceBias) parts.push(`来源 ${content.sourceBias}`);
  if (content.preferFresh) parts.push("优先活跃");
  if (content.mustHave) parts.push(`必须 ${(content.mustHave as string[]).join(", ")}`);
  if (content.exclude) parts.push(`排除 ${(content.exclude as string[]).join(", ")}`);
  if (content.avoidInactive) parts.push("避免不活跃");
  if (content.avoidInexperience) parts.push("避免经验不足");

  if (parts.length === 0) {
    const json = JSON.stringify(content);
    return json.length > 60 ? json.slice(0, 60) + "..." : json;
  }
  return parts.join(" · ");
}

export function displayMemoryList(
  context: UserMemoryContext,
  paused: boolean
): void {
  console.log("");
  console.log(chalk.bold("Memory"));
  console.log(chalk.dim("-".repeat(48)));

  if (paused) {
    console.log(chalk.yellow("  ⏸ Memory 已暂停（暂停收集和使用）"));
    console.log("");
  }

  if (context.allMemories.length === 0 && context.candidateFeedbacks.length === 0) {
    console.log(chalk.dim("  暂无记忆。"));
    console.log("");
    return;
  }

  // Group user_memories by kind
  const groups = new Map<UserMemoryKind, UserMemoryRecord[]>();
  for (const record of context.allMemories) {
    const list = groups.get(record.kind) ?? [];
    list.push(record);
    groups.set(record.kind, list);
  }

  const kindOrder: UserMemoryKind[] = ["preference", "feedback", "hiring_context"];
  for (const kind of kindOrder) {
    const records = groups.get(kind);
    if (!records?.length) continue;

    const label = KIND_LABELS[kind];
    console.log(chalk.bold(`  [${label}] (${records.length})`));

    for (const record of records) {
      const sourceTag = formatSourceLabel(record.source);
      const idShort = record.id.slice(0, 8);
      const summary = contentSummary(record.content);
      const expiry = formatExpiry(record);

      console.log(`    ${chalk.cyan(idShort)}  ${sourceTag}${expiry}`);
      console.log(`    ${chalk.dim(summary)}`);
    }
    console.log("");
  }

  // Candidate feedback events (from candidate_feedback_memories table)
  if (context.candidateFeedbacks.length > 0) {
    console.log(chalk.bold(`  [候选人反馈] (${context.candidateFeedbacks.length})`));
    for (const fb of context.candidateFeedbacks) {
      const idShort = fb.id.slice(0, 8);
      const sentiment = fb.sentiment === "negative"
        ? chalk.red("负面")
        : fb.sentiment === "positive"
          ? chalk.green("正面")
          : chalk.dim("中性");
      const reason = fb.reasonCode ? ` ${FEEDBACK_REASON_LABELS[fb.reasonCode as FeedbackReasonCode] ?? fb.reasonCode}` : "";
      const detail = fb.reasonDetail ? ` (${fb.reasonDetail})` : "";

      console.log(`    ${chalk.cyan(idShort)}  ${sentiment}${chalk.dim(reason)}${chalk.dim(detail)}`);
    }
    console.log("");
  }
}

export function displayMemoryHelp(): void {
  console.log("");
  console.log(chalk.bold("Memory 命令"));
  console.log(chalk.dim("-".repeat(40)));
  console.log("  list          查看所有记忆");
  console.log("  delete <id>   删除指定记忆");
  console.log("  pause         暂停记忆收集和使用");
  console.log("  resume        恢复记忆收集和使用");
  console.log("  help          显示帮助");
  console.log("");
}

// ============================================================================
// Command Execution
// ============================================================================

export async function executeMemoryCommand(
  command: MemoryCommand,
  memoryStore: UserMemoryStore,
  askFreeform: (prompt: string) => Promise<string | null>
): Promise<MemoryCommandResult> {
  if (command.action === "help") {
    displayMemoryHelp();
    return { ok: true, message: "" };
  }

  if (command.action === "list") {
    const context = await memoryStore.hydrateContext();
    const paused = await memoryStore.isMemoryPaused();
    displayMemoryList(context, paused);
    return { ok: true, message: "" };
  }

  if (command.action === "pause") {
    const alreadyPaused = await memoryStore.isMemoryPaused();
    if (alreadyPaused) {
      return { ok: true, message: "Memory 已经处于暂停状态。" };
    }
    await memoryStore.pauseMemory();
    console.log(chalk.yellow("Memory 已暂停。后续搜索不会使用或收集记忆。"));
    return { ok: true, message: "paused" };
  }

  if (command.action === "resume") {
    const alreadyPaused = await memoryStore.isMemoryPaused();
    if (!alreadyPaused) {
      return { ok: true, message: "Memory 已经处于活跃状态。" };
    }
    await memoryStore.resumeMemory();
    console.log(chalk.green("Memory 已恢复。后续搜索会使用和收集记忆。"));
    return { ok: true, message: "resumed" };
  }

  if (command.action === "delete") {
    // First try user_memories
    const record = await memoryStore.get(command.id);
    if (record) {
      return confirmAndDelete(memoryStore, record, askFreeform);
    }

    // Try prefix match in user_memories
    const all = await memoryStore.list();
    const match = all.find((r) => r.id.startsWith(command.id));
    if (match) {
      return confirmAndDelete(memoryStore, match, askFreeform);
    }

    // Try candidate_feedback_memories
    const feedbacks = await memoryStore.listCandidateFeedback();
    const feedbackMatch = feedbacks.find((f) => f.id.startsWith(command.id));
    if (feedbackMatch) {
      return confirmAndDeleteFeedback(memoryStore, feedbackMatch, askFreeform);
    }

    return { ok: false, message: `未找到记忆 ${command.id}。` };
  }

  return { ok: false, message: "未知命令。" };
}

async function confirmAndDelete(
  memoryStore: UserMemoryStore,
  record: UserMemoryRecord,
  askFreeform: (prompt: string) => Promise<string | null>
): Promise<MemoryCommandResult> {
  const kindLabel = KIND_LABELS[record.kind];
  const sourceLabel = record.source === "inferred" ? "推断" : "显式";
  const summary = contentSummary(record.content);

  console.log("");
  console.log(`  ${chalk.bold(kindLabel)} (${sourceLabel}) ${chalk.cyan(record.id.slice(0, 8))}`);
  console.log(`  ${chalk.dim(summary)}`);
  console.log("");
  console.log(chalk.yellow(`确定删除？[y/N]`));

  const confirmation = await askFreeform("y/N");
  const normalized = confirmation?.trim().toLowerCase();
  if (normalized !== "y" && normalized !== "yes") {
    return { ok: true, message: "已取消。" };
  }

  const deleted = await memoryStore.delete(record.id);
  if (deleted) {
    console.log(chalk.green("已删除。"));
    return { ok: true, message: "deleted" };
  }
  return { ok: false, message: "删除失败，可能已被移除。" };
}

async function confirmAndDeleteFeedback(
  memoryStore: UserMemoryStore,
  feedback: CandidateFeedbackRecord,
  askFreeform: (prompt: string) => Promise<string | null>
): Promise<MemoryCommandResult> {
  const sentiment = feedback.sentiment === "negative" ? "负面" : feedback.sentiment === "positive" ? "正面" : "中性";
  const reason = feedback.reasonCode
    ? ` (${FEEDBACK_REASON_LABELS[feedback.reasonCode as FeedbackReasonCode] ?? feedback.reasonCode})`
    : "";

  console.log("");
  console.log(`  ${chalk.bold("候选人反馈")} (${sentiment}${reason}) ${chalk.cyan(feedback.id.slice(0, 8))}`);
  console.log(`  ${chalk.dim(`personId: ${feedback.personId}`)}`);
  console.log("");
  console.log(chalk.yellow(`确定删除？[y/N]`));

  const confirmation = await askFreeform("y/N");
  const normalized = confirmation?.trim().toLowerCase();
  if (normalized !== "y" && normalized !== "yes") {
    return { ok: true, message: "已取消。" };
  }

  const deleted = await memoryStore.deleteCandidateFeedbackById(feedback.id);
  if (deleted) {
    console.log(chalk.green("已删除。"));
    return { ok: true, message: "deleted" };
  }
  return { ok: false, message: "删除失败，可能已被移除。" };
}

// ============================================================================
// Interactive Memory Session
// ============================================================================

/**
 * Run an interactive memory management loop.
 * User can enter commands repeatedly until they choose to exit.
 */
export async function runMemoryManagementSession(
  memoryStore: UserMemoryStore,
  askFreeform: (prompt: string) => Promise<string | null>
): Promise<void> {
  // Show list on entry
  const context = await memoryStore.hydrateContext();
  const paused = await memoryStore.isMemoryPaused();
  displayMemoryList(context, paused);

  while (true) {
    const input = await askFreeform("memory> (list / delete <id> / pause / resume / q)");
    if (!input?.trim()) continue;

    const normalized = input.trim().toLowerCase();
    if (normalized === "q" || normalized === "quit" || normalized === "exit" || normalized === "back") {
      console.log(chalk.dim("退出 memory 管理。"));
      return;
    }

    const command = parseMemoryCommand(normalized);
    if (!command) {
      console.log(chalk.dim("未知命令。输入 help 查看可用命令。"));
      continue;
    }

    await executeMemoryCommand(command, memoryStore, askFreeform);
  }
}
