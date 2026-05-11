import type { MatchStrength } from "@seeku/shared";
import type { SearchConditions, SearchCandidateAnchor } from "@seeku/search";

export type { SearchConditions, SearchCandidateAnchor } from "@seeku/search";

export type RecoveryDiagnosis = "intent_missing" | "retrieval_failed";
export type RecoveryBoundaryDiagnosticCode =
  | "source_coverage_gap"
  | "query_too_broad"
  | "source_bias_conflict";
export type RecoveryPhase =
  | "idle"
  | "diagnosing"
  | "clarifying"
  | "rewriting"
  | "low_confidence_shortlist"
  | "exhausted";

export interface SearchRecoveryState {
  phase: RecoveryPhase;
  diagnosis?: RecoveryDiagnosis;
  rationale?: string;
  clarificationCount: number;
  rewriteCount: number;
  lowConfidenceEmitted: boolean;
  lastRewrittenQuery?: string;
  compareSuggestedRefinement?: string;
  boundaryDiagnosticCode?: RecoveryBoundaryDiagnosticCode;
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

/**
 * Graph features for a candidate.
 * Only populated when graph data is available.
 */
export interface CandidateGraphFeatures {
  /** Total connections in the graph (followers + following) */
  undirectedDegree: number;
  /** Number of people this candidate follows */
  outDegree: number;
  /** Number of people who follow this candidate */
  inDegree: number;
  /** Size of the connected component this candidate belongs to */
  componentSize: number | null;
  /** Number of mutual connections with anchor person (if anchor is available) */
  mutualConnectionCount?: number;
  /** Whether this candidate is a direct neighbor of the anchor person */
  isDirectNeighbor?: boolean;
  /** Whether this candidate is in the same component as the anchor person */
  sameComponentAsAnchor?: boolean;
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
  disambiguation?: string;
  queryReasons?: string[];
  conditionAudit?: ConditionAuditItem[];
  // P0: Source & Freshness visibility
  sources: string[]; // ["Bonjour", "GitHub", ...]
  bonjourUrl?: string; // Bonjour profile link
  primaryLinks?: CandidatePrimaryLink[];
  lastSyncedAt?: Date; // When person data was last updated
  latestEvidenceAt?: Date; // Most recent evidence timestamp
  // Graph features (optional, only when graph data is available)
  graphFeatures?: CandidateGraphFeatures;
}

export interface ComparisonEvidenceSummary {
  evidenceType: string;
  title: string;
  sourceLabel: string;
  freshnessLabel?: string;
}

export type ComparisonDimensionVerdict = "strong" | "mixed" | "weak";
export type ComparisonUncertaintyLevel = "low" | "medium" | "high";
export type ComparisonConfidenceLevel = "high-confidence" | "medium-confidence" | "low-confidence";
export type RecommendationMode =
  | "clear-recommendation"
  | "conditional-recommendation"
  | "no-recommendation";

export interface ComparisonDimensionAssessment {
  score: number;
  verdict: ComparisonDimensionVerdict;
  summary: string;
  evidenceTrace: string[];
}

export interface ComparisonUncertainty {
  level: ComparisonUncertaintyLevel;
  summary: string;
}

export interface ComparisonEntry {
  shortlistIndex?: number;
  candidate: ScoredCandidate;
  profile: MultiDimensionProfile;
  topEvidence: ComparisonEvidenceSummary[];
  decisionTag: "优先深看" | "继续比较" | "补充候选";
  decisionScore: number;
  goalFit: ComparisonDimensionAssessment;
  evidenceStrength: ComparisonDimensionAssessment;
  technicalRelevance: ComparisonDimensionAssessment;
  sourceQualityRecency: ComparisonDimensionAssessment;
  uncertainty: ComparisonUncertainty;
  whySelected: string;
  whyNotSelected: string;
  evidenceTrace: string[];
  recommendation?: string;
  nextStep: string;
}

export interface ComparisonOutcome {
  confidence: ComparisonConfidenceLevel;
  recommendationMode: RecommendationMode;
  recommendedCandidateId?: string;
  recommendation: string;
  rationale: string;
  largestUncertainty: string;
  suggestedRefinement?: string;
}

export interface ComparisonResult {
  entries: ComparisonEntry[];
  outcome: ComparisonOutcome;
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
  disambiguation?: string;
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

export interface GlobalCommandResult {
  type: "globalCommand";
  command: string;
  args?: string;
}

export interface ResultListCommand {
  type: "view" | "compare" | "refine" | "sort" | "showMore" | "quit" | "help" | "add" | "remove" | "togglePool" | "pool" | "clear" | "history" | "undo" | "show" | "open" | "back" | "export" | "moveSelection" | "memory" | "globalCommand";
  command?: string;
  args?: string;
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
