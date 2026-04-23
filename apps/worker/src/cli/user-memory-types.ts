/**
 * User memory types for the CLI agent product.
 *
 * These types define the structured contract for user-level, cross-session memory.
 * Memory augments agent context without overwriting task truth.
 */

// ============================================================================
// Structured Memory Scope
// ============================================================================

export type MemoryScope =
  | { kind: "global" }
  | { kind: "role"; role: string }
  | { kind: "location"; location: string }
  | { kind: "work_item"; workItemId: string };

// ============================================================================
// Memory Kind
// ============================================================================

export type UserMemoryKind = "preference" | "feedback" | "hiring_context";

export type UserMemorySource = "explicit" | "inferred";

// ============================================================================
// Memory Content Types
// ============================================================================

export interface PreferenceContent {
  techStack?: string[];
  locations?: string[];
  role?: string;
  preferFresh?: boolean;
  sourceBias?: string;
  avoidTechStack?: string[];
  mustHave?: string[];
  exclude?: string[];
  [key: string]: unknown;
}

export interface FeedbackContent {
  candidateId: string;
  candidateName?: string;
  verdict: "positive" | "negative" | "neutral";
  reasons: string[];
  note?: string;
}

export interface HiringContextContent {
  hiringRole?: string;
  teamContext?: string;
  businessContext?: string;
  activeSearches?: string[];
  [key: string]: unknown;
}

// ============================================================================
// Memory Record
// ============================================================================

export interface UserMemoryRecord {
  id: string;
  userId: string;
  kind: UserMemoryKind;
  scope: MemoryScope;
  content: Record<string, unknown>;
  source: UserMemorySource;
  confidence: number;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date | null;
}

// ============================================================================
// Store Operations
// ============================================================================

export interface CreateUserMemoryOptions {
  kind: UserMemoryKind;
  scope: MemoryScope;
  content: Record<string, unknown>;
  source: UserMemorySource;
  confidence?: number;
  note?: string;
  expiresAt?: Date | null;
}

export interface ListUserMemoriesFilter {
  kind?: UserMemoryKind;
  scope?: MemoryScope;
  source?: UserMemorySource;
  includeExpired?: boolean;
  limit?: number;
}

export interface UpdateUserMemoryOptions {
  content?: Record<string, unknown>;
  confidence?: number;
  note?: string;
  expiresAt?: Date | null;
}

// ============================================================================
// Hydration Context
// ============================================================================

export interface UserMemoryContext {
  userId: string;
  memoryPaused: boolean;
  preferences: UserMemoryRecord[];
  feedbacks: UserMemoryRecord[];
  candidateFeedbacks: CandidateFeedbackRecord[];
  hiringContexts: UserMemoryRecord[];
  allMemories: UserMemoryRecord[];
}

// ============================================================================
// Default Expiration Policy
// ============================================================================

export const INFERRED_MEMORY_EXPIRY_DAYS = 30;

export function getInferredExpiryDate(from = new Date()): Date {
  const expiry = new Date(from);
  expiry.setDate(expiry.getDate() + INFERRED_MEMORY_EXPIRY_DAYS);
  return expiry;
}

export function getExplicitExpiryDate(): null {
  return null;
}

// ============================================================================
// Candidate Feedback Types
// ============================================================================

export type FeedbackSentiment = "positive" | "negative" | "neutral";

export type FeedbackReasonCode =
  | "skill_mismatch"
  | "location_mismatch"
  | "experience_mismatch"
  | "not_active"
  | "culture_fit"
  | "other";

export const FEEDBACK_REASON_LABELS: Record<FeedbackReasonCode, string> = {
  skill_mismatch: "技能不匹配",
  location_mismatch: "地点不合适",
  experience_mismatch: "经验不符",
  not_active: "不够活跃",
  culture_fit: "文化不匹配",
  other: "其他原因"
};

export interface CandidateFeedbackInput {
  personId: string;
  sentiment: FeedbackSentiment;
  reasonCode?: FeedbackReasonCode;
  reasonDetail?: string;
  contextSource?: string;
}

export interface CandidateFeedbackRecord {
  id: string;
  userId: string;
  personId: string;
  sentiment: FeedbackSentiment;
  reasonCode: string | null;
  reasonDetail: string | null;
  contextSource: string;
  createdAt: Date;
}

// ============================================================================
// Inference Rules
// ============================================================================

export const INFERENCE_MIN_COUNT = 3;
export const INFERENCE_TIME_WINDOW_DAYS = 30;
export const INFERRED_PREFERENCE_CONFIDENCE = 0.65;

export interface InferenceCheckResult {
  shouldInfer: boolean;
  patterns: Array<{
    reasonCode: string;
    count: number;
  }>;
}
