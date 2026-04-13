import type { MatchStrength } from "@seeku/shared";

export interface SearchConditions {
  skills: string[];
  locations: string[];
  experience?: string;
  role?: string;
  sourceBias?: "bonjour" | "github";
  mustHave: string[];
  niceToHave: string[];
  exclude: string[];
  preferFresh: boolean;
  candidateAnchor?: SearchCandidateAnchor;
  limit: number;
}

export interface SearchCandidateAnchor {
  shortlistIndex?: number;
  personId?: string;
  name?: string;
}

export type { MatchStrength };
export type ConditionAuditStatus = "met" | "unmet" | "unknown";

export interface ConditionAuditItem {
  label: string;
  status: ConditionAuditStatus;
  detail: string;
}

export type MissingField = "skills" | "locations" | "experience";
export type ClarifyAction = "search" | "add" | "relax" | "restart" | "quit";
export type SortMode = "overall" | "tech" | "project" | "location" | "fresh" | "source" | "evidence";
export type DetailAction = "back" | "refine" | "why" | "quit" | "open";
export type ShortlistMoveDirection = "up" | "down" | "top" | "bottom" | number;

export interface SearchDraft {
  conditions: SearchConditions;
  missing: MissingField[];
}

export interface DimensionScores {
  techMatch: number;
  locationMatch: number;
  careerStability: number;
  projectDepth: number;
  academicImpact: number;
  communityReputation: number;
}

export interface MultiDimensionProfile {
  dimensions: DimensionScores;
  overallScore: number;
  highlights: string[];
  summary: string;
}

export interface CandidatePrimaryLink {
  type: "bonjour" | "github" | "website" | "project";
  label: string;
  url: string;
}

export interface ScoredCandidate {
  personId: string;
  name: string;
  headline: string | null;
  location: string | null;
  company: string | null;
  experienceYears: number | null;
  matchScore: number;
  profile?: MultiDimensionProfile;
  matchStrength?: MatchStrength;
  matchReason?: string;
  queryReasons?: string[];
  conditionAudit?: ConditionAuditItem[];
  // P0: Source & Freshness visibility
  sources: string[]; // ["Bonjour", "GitHub", ...]
  bonjourUrl?: string; // Bonjour profile link
  primaryLinks?: CandidatePrimaryLink[];
  lastSyncedAt?: Date; // When person data was last updated
  latestEvidenceAt?: Date; // Most recent evidence timestamp
}

export interface ComparisonEvidenceSummary {
  evidenceType: string;
  title: string;
  sourceLabel: string;
  freshnessLabel?: string;
}

export interface ComparisonEntry {
  shortlistIndex?: number;
  candidate: ScoredCandidate;
  profile: MultiDimensionProfile;
  topEvidence: ComparisonEvidenceSummary[];
  decisionTag: "优先深看" | "继续比较" | "补充候选";
  decisionScore: number;
  recommendation: string;
  nextStep: string;
}

export type ExportFormat = "md" | "csv" | "json";
export type ExportTarget = "shortlist" | "pool";

export interface ExportCandidateRecord {
  shortlistIndex?: number;
  name: string;
  headline: string | null;
  location: string | null;
  company: string | null;
  matchScore: number;
  source: string;
  freshness: string;
  bonjourUrl?: string;
  whyMatched: string;
  decisionTag?: ComparisonEntry["decisionTag"];
  recommendation?: string;
  nextStep?: string;
  topEvidence: ComparisonEvidenceSummary[];
}

export interface ExportArtifactFile {
  format: ExportFormat;
  label: string;
  path: string;
}

export interface ExportArtifact {
  target: ExportTarget;
  format: ExportFormat;
  generatedAt: string;
  outputDir: string;
  querySummary: string;
  count: number;
  files: ExportArtifactFile[];
  records: ExportCandidateRecord[];
}

export interface ScriptSearchResultOutput {
  personId: string;
  name: string;
  headline: string | null;
  location: string | null;
  matchScore: number;
  matchStrength: MatchStrength;
  matchReasons: string[];
  matchReason: string;
  whyMatched: string;
  queryReasons: string[];
  source: string;
  sources: string[];
  freshness: string;
  bonjourUrl?: string;
  lastSyncedAt?: string;
  latestEvidenceAt?: string;
}

export interface ScriptSearchResponseOutput {
  results: ScriptSearchResultOutput[];
  total: number;
  resultWarning?: string;
}

export interface ShortlistPromptState {
  selectedIndex: number;
  showingCount: number;
}

export interface ShortlistStatusMessage {
  tone: "info" | "success" | "warning";
  text: string;
}

export interface ResultListCommand {
  type: "view" | "compare" | "refine" | "sort" | "showMore" | "quit" | "help" | "add" | "remove" | "togglePool" | "pool" | "clear" | "history" | "undo" | "show" | "open" | "back" | "export" | "moveSelection";
  indexes?: number[];
  sortMode?: SortMode;
  exportFormat?: ExportFormat;
  exportTarget?: ExportTarget;
  prompt?: string;
  direction?: ShortlistMoveDirection;
}

export interface SearchHistoryEntry {
  conditions: SearchConditions;
  resultCount: number;
  timestamp: Date;
}
