export interface SearchConditions {
  skills: string[];
  locations: string[];
  experience?: string;
  role?: string;
  sourceBias?: "bonjour" | "github";
  limit: number;
}

export type MissingField = "skills" | "locations" | "experience";
export type ClarifyAction = "search" | "add" | "relax" | "restart" | "quit";
export type SortMode = "overall" | "tech" | "project" | "location";
export type DetailAction = "back" | "refine" | "why" | "quit" | "open";

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

export interface ScoredCandidate {
  personId: string;
  name: string;
  headline: string | null;
  location: string | null;
  company: string | null;
  experienceYears: number | null;
  matchScore: number;
  profile?: MultiDimensionProfile;
  matchReason?: string;
  // P0: Source & Freshness visibility
  sources: string[]; // ["Bonjour", "GitHub", ...]
  bonjourUrl?: string; // Bonjour profile link
  lastSyncedAt?: Date; // When person data was last updated
  latestEvidenceAt?: Date; // Most recent evidence timestamp
}

export interface ResultListCommand {
  type: "view" | "compare" | "refine" | "sort" | "showMore" | "quit" | "help" | "add" | "pool" | "clear" | "history" | "undo" | "show" | "open";
  indexes?: number[];
  sortMode?: SortMode;
}

export interface SearchHistoryEntry {
  conditions: SearchConditions;
  resultCount: number;
  timestamp: Date;
}
