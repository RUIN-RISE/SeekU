export interface SearchConditions {
  skills: string[];
  locations: string[];
  experience?: string;
  role?: string;
  limit: number;
}

export type MissingField = "skills" | "locations" | "experience";

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
}
