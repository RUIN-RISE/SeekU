export interface SearchCandidateAnchor {
  shortlistIndex?: number;
  personId?: string;
  name?: string;
}

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
