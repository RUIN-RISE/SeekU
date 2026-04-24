/**
 * Guide hints for the mascot/navigator.
 *
 * Phase 8 of CLI upgrade: provide contextual, actionable hints
 * that appear at specific trigger points during the user journey.
 *
 * Implemented triggers:
 * - home_empty: shown when launcher has no resume items
 * - first_shortlist: shown once when shortlist first renders
 * - decision_complete: shown when clear recommendation is made
 *
 * Reserved triggers (defined but not yet wired):
 * - blocked: for recovery stop / no-results scenarios (future integration)
 */

import { ALL_COMMANDS, getCommandsForStage, type CliStage, type SeekuCommand } from "./command-spec.js";

export const MASCOT = "◖•ᴗ•◗";

export type GuideTrigger =
  | "home_empty"
  | "blocked"
  | "first_shortlist"
  | "decision_complete";

export interface GuideHint {
  text: string;
  trigger: GuideTrigger;
}

export interface GuideContext {
  blockerLabel?: string;
  candidateName?: string;
}

const GUIDE_HINTS: Record<GuideTrigger, string> = {
  home_empty: "还没有进行中的任务。输入需求开始搜索。",
  blocked: "当前阻塞：{blocker}。/refine 调整条件或 /back 返回。",
  first_shortlist: "↑↓ 移动，Enter 详情，space 加对比池。",
  decision_complete: "已推荐 {name}。/export 导出，/new 新任务。"
};

/**
 * Format a guide hint text with mascot prefix.
 */
export function formatGuideText(text: string): string {
  return `${MASCOT} ${text}`;
}

/**
 * Get a guide hint for the given trigger.
 * Returns null if no hint should be shown.
 */
export function getGuideHint(
  trigger: GuideTrigger,
  context?: GuideContext
): GuideHint | null {
  const template = GUIDE_HINTS[trigger];
  if (!template) {
    return null;
  }

  let text = template;

  if (trigger === "blocked" && context?.blockerLabel) {
    text = template.replace("{blocker}", context.blockerLabel);
  } else if (trigger === "blocked") {
    return null;
  }

  if (trigger === "decision_complete" && context?.candidateName) {
    text = template.replace("{name}", context.candidateName);
  } else if (trigger === "decision_complete") {
    return null;
  }

  return { text: formatGuideText(text), trigger };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

/**
 * Suggest the closest command name for an unknown input.
 * Returns null if no close match (threshold > 3).
 */
export function suggestClosestCommand(input: string, stage?: CliStage): string | null {
  const normalized = input.toLowerCase();
  let bestName: string | null = null;
  let bestDist = Infinity;
  const commands: SeekuCommand[] = stage ? getCommandsForStage(stage) : ALL_COMMANDS;

  for (const cmd of commands) {
    const names = [cmd.name, ...cmd.aliases];
    for (const name of names) {
      const dist = levenshtein(normalized, name);
      if (dist < bestDist) {
        bestDist = dist;
        bestName = cmd.name;
      }
    }
  }

  if (bestDist <= 3 && bestName) {
    return bestName;
  }

  return null;
}
