/**
 * Explicit preference capture for the CLI agent product.
 *
 * This module extracts preference candidates from user language during
 * clarify/refine flows and asks for confirmation before persisting
 * to user memory.
 *
 * Key rules:
 * - Only capture fields explicitly stated in user utterances
 * - Never capture carried-forward or synthesized conditions
 * - Save as source = "explicit"
 * - Never silently upgrade inferred preferences
 * - Rejection does not affect current session
 */

import chalk from "chalk";

import type { SearchConditions } from "./types.js";
import type { UserMemoryStore } from "./user-memory-store.js";
import type { MemoryScope } from "./user-memory-types.js";

// ============================================================================
// Types
// ============================================================================

export interface PreferenceCandidate {
  techStack?: string[];
  locations?: string[];
  role?: string;
  sourceBias?: "bonjour" | "github";
  preferFresh?: boolean;
}

export interface PreferenceCaptureResult {
  captured: boolean;
  candidate: PreferenceCandidate | null;
  reason: "confirmed" | "rejected" | "empty" | "skipped";
}

export interface PreferenceCaptureOptions {
  candidate: PreferenceCandidate;
  sourceContext: "clarify" | "refine";
}

// ============================================================================
// Text-Based Extraction (User-Stated Only)
// ============================================================================

/**
 * Extract preference candidates from user utterance text.
 *
 * This function uses simple pattern matching to identify fields the user
 * explicitly stated in their own words. It does NOT use SearchConditions
 * because those may contain carried-forward or synthesized values.
 *
 * Patterns recognized:
 * - Tech stack: "python", "rust", "会 java", "懂 typescript"
 * - Locations: "杭州", "在北京", "上海或深圳"
 * - Role: "后端", "算法工程师", "frontend", "做前端的"
 * - Source bias: "用 bonjour", "从 github 找"
 * - Freshness: "最近活跃", "要新鲜的", "prefer fresh"
 */
export function extractPreferenceFromText(userInput: string): PreferenceCandidate {
  const candidate: PreferenceCandidate = {};
  const text = userInput.toLowerCase();

  // Tech stack patterns (common languages/frameworks)
  const techKeywords = [
    "python", "rust", "java", "typescript", "javascript", "go", "golang",
    "c++", "cpp", "c#", "csharp", "kotlin", "swift", "ruby", "php",
    "react", "vue", "angular", "node", "django", "flask", "spring",
    "tensorflow", "pytorch", "cuda", "llm", "ai", "ml"
  ];
  const foundTech: string[] = [];
  for (const keyword of techKeywords) {
    if (text.includes(keyword)) {
      foundTech.push(keyword);
    }
  }
  // Chinese patterns: "会 X", "懂 X", "X 开发"
  const chineseTechMatch = userInput.match(/(?:会|懂|熟悉|擅长)\s*([a-zA-Z\+\#]+)/g);
  if (chineseTechMatch) {
    for (const match of chineseTechMatch) {
      const tech = match.replace(/^(?:会|懂|熟悉|擅长)\s*/, "");
      if (tech && !foundTech.includes(tech.toLowerCase())) {
        foundTech.push(tech.toLowerCase());
      }
    }
  }
  if (foundTech.length > 0) {
    candidate.techStack = foundTech;
  }

  // Location patterns (Chinese cities)
  const locationKeywords = [
    "杭州", "北京", "上海", "深圳", "广州", "成都", "南京", "武汉",
    "苏州", "西安", "长沙", "天津", "重庆", "厦门", "青岛"
  ];
  const foundLocations: string[] = [];
  for (const loc of locationKeywords) {
    if (userInput.includes(loc)) {
      foundLocations.push(loc);
    }
  }
  if (foundLocations.length > 0) {
    candidate.locations = foundLocations;
  }

  // Role patterns
  const rolePatterns: Array<{ pattern: RegExp; role: string }> = [
    { pattern: /后端|backend/i, role: "backend" },
    { pattern: /前端|frontend/i, role: "frontend" },
    { pattern: /算法|algorithm/i, role: "algorithm" },
    { pattern: /全栈|fullstack/i, role: "fullstack" },
    { pattern: /数据|data\s*engineer/i, role: "data" },
    { pattern: /ai\s*工程师|ai\s*engineer/i, role: "ai" },
    { pattern: /机器学习|ml\s*engineer/i, role: "ml" }
  ];
  for (const { pattern, role } of rolePatterns) {
    if (pattern.test(userInput)) {
      candidate.role = role;
      break;
    }
  }

  // Source bias patterns
  if (text.includes("bonjour") || text.includes("用 bonjour") || text.includes("从 bonjour")) {
    candidate.sourceBias = "bonjour";
  } else if (text.includes("github") || text.includes("用 github") || text.includes("从 github")) {
    candidate.sourceBias = "github";
  }

  // Freshness patterns
  if (
    text.includes("最近活跃") ||
    text.includes("要新鲜") ||
    text.includes("prefer fresh") ||
    text.includes("preferfresh") ||
    text.includes("活跃的")
  ) {
    candidate.preferFresh = true;
  }

  return candidate;
}

/**
 * Merge two preference candidates, unioning arrays and preferring
 * later scalar values.
 */
export function mergePreferenceCandidates(
  base: PreferenceCandidate,
  delta: PreferenceCandidate
): PreferenceCandidate {
  return {
    techStack: unionDedupe(base.techStack, delta.techStack),
    locations: unionDedupe(base.locations, delta.locations),
    role: delta.role ?? base.role,
    sourceBias: delta.sourceBias ?? base.sourceBias,
    preferFresh: delta.preferFresh ?? base.preferFresh
  };
}

function unionDedupe(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  const set = new Set([...(a ?? []), ...(b ?? [])]);
  return set.size > 0 ? [...set] : undefined;
}

/**
 * Check if a preference candidate has any meaningful content.
 */
export function isCandidateEmpty(candidate: PreferenceCandidate): boolean {
  return (
    (!candidate.techStack || candidate.techStack.length === 0) &&
    (!candidate.locations || candidate.locations.length === 0) &&
    !candidate.role &&
    !candidate.sourceBias &&
    !candidate.preferFresh
  );
}

/**
 * Check if a candidate is different enough from existing preferences to warrant asking.
 * For now, we always ask if there's something to save.
 * Future: compare against existing memory to avoid redundant prompts.
 */
export function shouldPromptForCapture(candidate: PreferenceCandidate): boolean {
  return !isCandidateEmpty(candidate);
}

/**
 * Build a candidate from a FRESH extraction result (not accumulated conditions).
 * Only safe to use on the direct output of extractConditions() on user input.
 */
export function candidateFromFreshConditions(conditions: SearchConditions): PreferenceCandidate {
  const candidate: PreferenceCandidate = {};
  if (conditions.skills.length > 0) candidate.techStack = [...conditions.skills];
  if (conditions.locations.length > 0) candidate.locations = [...conditions.locations];
  if (conditions.role) candidate.role = conditions.role;
  if (conditions.sourceBias) candidate.sourceBias = conditions.sourceBias;
  if (conditions.preferFresh) candidate.preferFresh = conditions.preferFresh;
  return candidate;
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format a preference candidate for display to the user.
 */
export function formatCandidateForDisplay(candidate: PreferenceCandidate): string {
  const parts: string[] = [];

  if (candidate.techStack && candidate.techStack.length > 0) {
    parts.push(`技术栈：${candidate.techStack.join(", ")}`);
  }

  if (candidate.locations && candidate.locations.length > 0) {
    parts.push(`地点：${candidate.locations.join(", ")}`);
  }

  if (candidate.role) {
    parts.push(`角色：${candidate.role}`);
  }

  if (candidate.sourceBias) {
    const sourceLabel = candidate.sourceBias === "bonjour" ? "Bonjour" : "GitHub";
    parts.push(`来源偏好：${sourceLabel}`);
  }

  if (candidate.preferFresh) {
    parts.push("优先最近活跃");
  }

  return parts.join(" / ");
}

// ============================================================================
// Capture Flow
// ============================================================================

/**
 * Ask user if they want to save preferences to memory.
 */
export async function askPreferenceConfirmation(
  candidate: PreferenceCandidate,
  askFreeform: (prompt: string) => Promise<string>
): Promise<boolean> {
  const formatted = formatCandidateForDisplay(candidate);

  console.log("");
  console.log(chalk.cyan("我注意到你提到了这些偏好："));
  console.log(chalk.white(`  ${formatted}`));
  console.log("");
  console.log(chalk.dim("要记住这些偏好吗？以后搜索可以默认沿用。"));
  console.log("");

  const response = await askFreeform("[记住] [只这次用] [不记住]");

  const normalized = response.trim().toLowerCase();

  // Accept various affirmative responses
  if (
    normalized === "记住" ||
    normalized === "y" ||
    normalized === "yes" ||
    normalized === "1" ||
    normalized.startsWith("记住")
  ) {
    return true;
  }

  return false;
}

/**
 * Save a confirmed preference candidate to user memory.
 */
export async function savePreferenceToMemory(
  memoryStore: UserMemoryStore,
  candidate: PreferenceCandidate,
  scope: MemoryScope = { kind: "global" }
): Promise<void> {
  const content: Record<string, unknown> = {};

  if (candidate.techStack && candidate.techStack.length > 0) {
    content.techStack = candidate.techStack;
  }

  if (candidate.locations && candidate.locations.length > 0) {
    content.locations = candidate.locations;
  }

  if (candidate.role) {
    content.role = candidate.role;
  }

  if (candidate.sourceBias) {
    content.sourceBias = candidate.sourceBias;
  }

  if (candidate.preferFresh) {
    content.preferFresh = candidate.preferFresh;
  }

  await memoryStore.create({
    kind: "preference",
    scope,
    content,
    source: "explicit",
    confidence: 1.0
  });
}

/**
 * Main capture flow: prompt and optionally save a pre-built candidate.
 *
 * The caller is responsible for building the candidate from user-stated
 * fields only (via extractPreferenceFromText or candidateFromFreshConditions),
 * NOT from accumulated SearchConditions.
 */
export async function captureExplicitPreference(
  memoryStore: UserMemoryStore,
  options: PreferenceCaptureOptions,
  askFreeform: (prompt: string) => Promise<string>
): Promise<PreferenceCaptureResult> {
  const isPaused = await memoryStore.isMemoryPaused();
  if (isPaused) {
    return { captured: false, candidate: null, reason: "skipped" };
  }

  const candidate = options.candidate;

  if (isCandidateEmpty(candidate)) {
    return { captured: false, candidate: null, reason: "empty" };
  }

  if (!shouldPromptForCapture(candidate)) {
    return { captured: false, candidate: null, reason: "skipped" };
  }

  const confirmed = await askPreferenceConfirmation(candidate, askFreeform);

  if (!confirmed) {
    console.log(chalk.dim("好的，这次不记住。"));
    return { captured: false, candidate, reason: "rejected" };
  }

  await savePreferenceToMemory(memoryStore, candidate);
  console.log(chalk.green("已记住。下次搜索我会优先考虑这些偏好。"));

  return { captured: true, candidate, reason: "confirmed" };
}
