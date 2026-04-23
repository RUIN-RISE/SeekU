/**
 * Candidate feedback capture for the CLI agent product.
 *
 * This module records user feedback on candidates (positive/negative/neutral)
 * and derives inferred preferences from repeated patterns.
 *
 * Key rules:
 * - Feedback is always recorded as an event (raw signal)
 * - Inferred preferences only derive from repeated patterns (3+ in 30 days)
 * - Inferred preferences have lower confidence than explicit
 * - Inferred preferences expire after 30 days
 * - Explicit preferences are never overwritten by inferred
 */

import chalk from "chalk";

import type { SeekuDatabase } from "@seeku/db";
import {
  findRepeatedNegativePatterns,
  listUserMemories,
  recordCandidateFeedback as dbRecordCandidateFeedback,
  type RepeatedNegativePattern
} from "@seeku/db";

import type { UserMemoryStore } from "./user-memory-store.js";
import {
  FEEDBACK_REASON_LABELS,
  INFERENCE_MIN_COUNT,
  INFERENCE_TIME_WINDOW_DAYS,
  INFERRED_PREFERENCE_CONFIDENCE,
  type CandidateFeedbackInput,
  type CandidateFeedbackRecord,
  type FeedbackReasonCode,
  type FeedbackSentiment,
  type InferenceCheckResult
} from "./user-memory-types.js";
import { getInferredExpiryDate } from "./user-memory-types.js";

// ============================================================================
// Feedback Recording
// ============================================================================

export interface RecordFeedbackOptions {
  memoryStore: UserMemoryStore;
  feedback: CandidateFeedbackInput;
}

export interface RecordFeedbackResult {
  recorded: boolean;
  feedback: CandidateFeedbackRecord | null;
  inference?: InferenceCheckResult;
}

/**
 * Record candidate feedback to the database.
 * Does NOT automatically trigger inference - caller should call checkAndApplyInference separately.
 */
export async function recordCandidateFeedback(
  options: RecordFeedbackOptions
): Promise<RecordFeedbackResult> {
  const userId = options.memoryStore.getUserId();

  const dbRecord = await dbRecordCandidateFeedback(options.memoryStore.db, {
    userId,
    personId: options.feedback.personId,
    sentiment: options.feedback.sentiment,
    reasonCode: options.feedback.reasonCode,
    reasonDetail: options.feedback.reasonDetail,
    contextSource: options.feedback.contextSource ?? "shortlist"
  });

  return {
    recorded: true,
    feedback: {
      id: dbRecord.id,
      userId: dbRecord.userId,
      personId: dbRecord.personId,
      sentiment: dbRecord.sentiment,
      reasonCode: dbRecord.reasonCode,
      reasonDetail: dbRecord.reasonDetail,
      contextSource: dbRecord.contextSource,
      createdAt: dbRecord.createdAt
    }
  };
}

// ============================================================================
// Feedback Prompt
// ============================================================================

/**
 * Prompt user for optional feedback reason after a negative action.
 */
export async function promptForFeedbackReason(
  candidateName: string,
  askFreeform: (prompt: string) => Promise<string>
): Promise<{ reasonCode?: FeedbackReasonCode; reasonDetail?: string } | null> {
  console.log("");
  console.log(chalk.dim(`为什么排除 ${candidateName}？可选，回车跳过。`));
  console.log("");

  const options = Object.entries(FEEDBACK_REASON_LABELS)
    .map(([code, label]) => `${code}: ${label}`)
    .join(" / ");
  console.log(chalk.dim(`选项：${options}`));

  const response = await askFreeform("原因或备注");
  if (!response?.trim()) {
    return null;
  }

  const normalized = response.trim().toLowerCase();

  // Check if response matches a reason code
  for (const [code] of Object.entries(FEEDBACK_REASON_LABELS)) {
    if (normalized === code || normalized.startsWith(code)) {
      const detail = response.trim().slice(code.length).trim() || undefined;
      return {
        reasonCode: code as FeedbackReasonCode,
        reasonDetail: detail
      };
    }
  }

  // No code match - treat as freeform detail
  return {
    reasonCode: "other",
    reasonDetail: response.trim()
  };
}

// ============================================================================
// Inference Engine
// ============================================================================

/**
 * Check if repeated negative patterns warrant inferred preference generation.
 */
export async function checkInferenceConditions(
  memoryStore: UserMemoryStore
): Promise<InferenceCheckResult> {
  const userId = memoryStore.getUserId();
  const since = new Date();
  since.setDate(since.getDate() - INFERENCE_TIME_WINDOW_DAYS);

  const patterns = await findRepeatedNegativePatterns(memoryStore.db, userId, {
    minCount: INFERENCE_MIN_COUNT,
    since
  });

  if (patterns.length === 0) {
    return { shouldInfer: false, patterns: [] };
  }

  return {
    shouldInfer: true,
    patterns: patterns.map((p) => ({
      reasonCode: p.reasonCode,
      count: p.count
    }))
  };
}

/**
 * Map reason code to preference content.
 * Only certain reason codes map to actionable preferences.
 */
function reasonCodeToPreferenceContent(
  reasonCode: string
): Record<string, unknown> | null {
  switch (reasonCode) {
    case "skill_mismatch":
      // Would need to know which skill - can't infer from just the code
      return null;
    case "location_mismatch":
      // Would need to know which location - can't infer from just the code
      return null;
    case "experience_mismatch":
      return { avoidInexperience: true };
    case "not_active":
      return { avoidInactive: true };
    default:
      return null;
  }
}

/**
 * Apply inferred preferences from repeated negative patterns.
 * Only creates new preferences if no conflicting explicit preference exists.
 */
export async function applyInferredPreferences(
  memoryStore: UserMemoryStore,
  patterns: RepeatedNegativePattern[]
): Promise<number> {
  const userId = memoryStore.getUserId();

  // Get existing explicit preferences to avoid conflicts
  const explicitPrefs = await listUserMemories(memoryStore.db, userId, {
    kind: "preference",
    source: "explicit"
  });

  let applied = 0;

  for (const pattern of patterns) {
    const content = reasonCodeToPreferenceContent(pattern.reasonCode);
    if (!content) {
      continue;
    }

    // Check for conflicting explicit preference
    const hasConflict = explicitPrefs.some((pref) => {
      const prefContent = pref.content as Record<string, unknown>;
      // Simple conflict check: if any key overlaps with opposite value
      for (const key of Object.keys(content)) {
        if (key in prefContent) {
          return true;
        }
      }
      return false;
    });

    if (hasConflict) {
      continue;
    }

    // Check if same inferred preference already exists
    const existingInferred = await listUserMemories(memoryStore.db, userId, {
      kind: "preference",
      source: "inferred",
      includeExpired: false
    });

    const alreadyInferred = existingInferred.some((pref) => {
      const prefContent = pref.content as Record<string, unknown>;
      return JSON.stringify(prefContent) === JSON.stringify(content);
    });

    if (alreadyInferred) {
      // Update expiry instead of creating new
      continue;
    }

    // Create inferred preference
    await memoryStore.create({
      kind: "preference",
      scope: { kind: "global" },
      content,
      source: "inferred",
      confidence: INFERRED_PREFERENCE_CONFIDENCE,
      expiresAt: getInferredExpiryDate()
    });

    applied++;
  }

  return applied;
}

/**
 * Main inference flow: check conditions and apply if warranted.
 */
export async function checkAndApplyInference(
  memoryStore: UserMemoryStore
): Promise<InferenceCheckResult> {
  const result = await checkInferenceConditions(memoryStore);

  if (!result.shouldInfer) {
    return result;
  }

  const userId = memoryStore.getUserId();
  const since = new Date();
  since.setDate(since.getDate() - INFERENCE_TIME_WINDOW_DAYS);

  const patterns = await findRepeatedNegativePatterns(memoryStore.db, userId, {
    minCount: INFERENCE_MIN_COUNT,
    since
  });

  const applied = await applyInferredPreferences(memoryStore, patterns);

  if (applied > 0) {
    console.log(chalk.dim(`基于你的反馈模式，我更新了一些偏好设置。`));
  }

  return result;
}
