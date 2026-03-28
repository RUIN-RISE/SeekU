import type { EvidenceType, SeekuDatabase, SourceName, SourceProfile } from "@seeku/db";

export interface EvidenceItemInput {
  source: SourceName;
  sourceProfileId?: string;
  evidenceType: EvidenceType;
  title?: string;
  description?: string;
  url?: string;
  occurredAt?: Date;
  metadata: Record<string, unknown>;
  evidenceHash: string;
}

export interface EvidenceExtractionResult {
  items: EvidenceItemInput[];
  errors: Array<{ message: string; context?: unknown }>;
}

export interface MatchReason {
  signal: string;
  confidence: number;
}

export interface MatchResult {
  confidence: number;
  reasons: MatchReason[];
}

export interface ProfileMatchInput {
  sourceProfile: SourceProfile;
  candidateProfiles: SourceProfile[];
}

export interface ResolutionInput {
  db: SeekuDatabase;
  bonjourProfiles: SourceProfile[];
  githubProfiles: SourceProfile[];
}

export interface ResolutionMatch {
  personId: string;
  bonjourProfileId: string;
  githubProfileId: string;
  confidence: number;
  reasons: MatchReason[];
}

export interface ResolutionResult {
  personsCreated: number;
  identitiesCreated: number;
  matchedPairs: number;
  reviewPairs: number;
  unresolvedProfiles: number;
  matches: ResolutionMatch[];
  errors: Array<{ message: string; context?: unknown }>;
}
