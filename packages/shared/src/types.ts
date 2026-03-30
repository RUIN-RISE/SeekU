export type SourceName = "bonjour" | "github" | "web";
export type AliasType = "github" | "x" | "jike" | "website" | "person_id" | "other";
export type SyncRunStatus = "succeeded" | "failed" | "partial";
export type OptOutRequestStatus = "pending" | "processed" | "rejected";

export interface Alias {
  type: AliasType;
  value: string;
  confidence: number;
}

export interface NormalizedProfile {
  source: SourceName;
  sourceProfileId?: string;
  sourceHandle: string;
  canonicalUrl: string;
  displayName?: string;
  headline?: string;
  bio?: string;
  summary?: string;
  avatarUrl?: string;
  locationText?: string;
  aliases: Alias[];
  rawMetadata: Record<string, unknown>;
}

export interface SyncRunConfig {
  source: SourceName;
  jobName: string;
  limit?: number;
  cursor?: Record<string, unknown>;
}

export interface SyncRunError {
  message: string;
  context?: unknown;
}

export interface SyncRunResult {
  status: SyncRunStatus;
  profilesProcessed: number;
  errors: SyncRunError[];
  nextCursor?: Record<string, unknown>;
}

export interface OptOutRequestInput {
  source?: SourceName;
  sourceHandle?: string;
  profileUrl?: string;
  requesterContact: string;
  reason?: string;
  processNow?: boolean;
}

export interface OptOutRequestProcessResult {
  requestId: string;
  hiddenProfileCount: number;
}
