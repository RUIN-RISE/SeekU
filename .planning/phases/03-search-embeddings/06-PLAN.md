---
phase: 03-search-embeddings
plan: 06
type: execute
wave: 3
depends_on: [03-05]
files_modified:
  - packages/search/src/reranker.ts
  - packages/search/src/index.ts
autonomous: true
requirements: [SEARCH-04]
user_setup: []
must_haves:
  truths:
    - "Results are reranked with evidence-weighted scoring"
    - "Projects matching skills boost relevance"
    - "Freshness penalty reduces outdated profiles"
    - "Follower count contributes logarithmic boost"
  artifacts:
    - path: "packages/search/src/reranker.ts"
      provides: "Evidence-weighted reranking"
      exports: ["Reranker", "RerankResult", "rerank"]
  key_links:
    - from: "packages/search/src/reranker.ts"
      to: "packages/search/src/retriever.ts"
      via: "SearchResult"
      pattern: "import { SearchResult }"
    - from: "packages/search/src/reranker.ts"
      to: "packages/db/src/schema.ts"
      via: "EvidenceItem"
      pattern: "import { evidenceItems }"
---

<objective>
Implement the reranker that applies evidence-weighted scoring to initial retrieval results. This boosts candidates with relevant evidence and penalizes stale profiles.

Purpose: Rerank results with evidence weighting (SEARCH-04)
Output: Reranker module that computes final relevance scores
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/03-search-embeddings/01-RESEARCH.md

<interfaces>
From packages/search/src/retriever.ts (Plan 05):
```typescript
export interface SearchResult {
  personId: string;
  keywordScore: number;
  vectorScore: number;
  combinedScore: number;
  matchedText: string;
}
```

From packages/search/src/planner.ts (Plan 05):
```typescript
export interface QueryIntent {
  skills: string[];
  mustHaves: string[];
}
```

From packages/db/src/schema.ts:
```typescript
export type EvidenceItem = typeof evidenceItems.$inferSelect;
// evidenceType: "project", "repository", etc.
// metadata may contain: language, stars, followers
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create evidence-weighted reranker</name>
  <files>packages/search/src/reranker.ts, packages/search/src/index.ts</files>
  <read_first>
    - packages/search/src/retriever.ts (SearchResult interface)
    - packages/search/src/planner.ts (QueryIntent interface)
    - packages/db/src/schema.ts (EvidenceItem, SearchDocument types)
  </read_first>
  <action>
Create packages/search/src/reranker.ts:

```typescript
import type { SearchResult } from "./retriever.js";
import type { QueryIntent } from "./planner.js";
import type { SearchDocument, EvidenceItem } from "@seeku/db";

export interface RerankResult extends SearchResult {
  finalScore: number;
  evidenceBoost: number;
  freshnessPenalty: number;
  matchReasons: string[];
}

export interface RerankerConfig {
  projectMatchBoost: number;
  repoMatchBoost: number;
  followerBoostScale: number;
  freshnessDecayDays: number;
}

const DEFAULT_CONFIG: RerankerConfig = {
  projectMatchBoost: 0.1,
  repoMatchBoost: 0.05,
  followerBoostScale: 0.02,
  freshnessDecayDays: 365
};

export class Reranker {
  private config: RerankerConfig;

  constructor(config?: Partial<RerankerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  rerank(
    results: SearchResult[],
    intent: QueryIntent,
    documents: Map<string, SearchDocument>,
    evidenceByPerson: Map<string, EvidenceItem[]>
  ): RerankResult[] {
    return results.map(result => {
      const doc = documents.get(result.personId);
      const evidence = evidenceByPerson.get(result.personId) ?? [];

      const evidenceBoost = this.computeEvidenceBoost(evidence, intent);
      const freshnessPenalty = this.computeFreshnessPenalty(doc);
      const matchReasons = this.extractMatchReasons(result, evidence, intent);

      const finalScore =
        result.combinedScore *
        (1 + evidenceBoost) *
        freshnessPenalty;

      return {
        ...result,
        finalScore,
        evidenceBoost,
        freshnessPenalty,
        matchReasons
      };
    }).sort((a, b) => b.finalScore - a.finalScore);
  }

  private computeEvidenceBoost(
    evidence: EvidenceItem[],
    intent: QueryIntent
  ): number {
    let boost = 0;

    const skillsLower = intent.skills.map(s => s.toLowerCase());

    // Projects matching skills
    const matchingProjects = evidence.filter(e =>
      e.evidenceType === "project" &&
      this.matchesSkills(e, skillsLower)
    );
    boost += this.config.projectMatchBoost * matchingProjects.length;

    // Repositories matching skills
    const matchingRepos = evidence.filter(e =>
      e.evidenceType === "repository" &&
      this.matchesSkills(e, skillsLower)
    );
    boost += this.config.repoMatchBoost * matchingRepos.length;

    // Follower count (log scale)
    const followers = evidence.reduce((sum, e) => {
      const f = e.metadata?.followers ?? e.metadata?.stargazers_count ?? 0;
      return sum + (typeof f === "number" ? f : 0);
    }, 0);
    boost += this.config.followerBoostScale * Math.log10(followers + 1);

    return boost;
  }

  private matchesSkills(evidence: EvidenceItem, skillsLower: string[]): boolean {
    const text = `${evidence.title ?? ""} ${evidence.description ?? ""}`.toLowerCase();
    const lang = evidence.metadata?.language as string | undefined;

    return skillsLower.some(skill =>
      text.includes(skill) ||
      (lang && lang.toLowerCase() === skill)
    );
  }

  private computeFreshnessPenalty(doc?: SearchDocument): number {
    if (!doc) return 0.5; // Unknown freshness = penalty

    const freshness = doc.rankFeatures?.freshness ?? 0;
    // Exponential decay: e^(-days/365)
    return Math.exp(-freshness / this.config.freshnessDecayDays);
  }

  private extractMatchReasons(
    result: SearchResult,
    evidence: EvidenceItem[],
    intent: QueryIntent
  ): string[] {
    const reasons: string[] = [];

    // From matched text
    if (result.matchedText) {
      const snippets = result.matchedText
        .slice(0, 200)
        .split(/\s+/)
        .slice(0, 5);
      if (snippets.length > 0) {
        reasons.push(`Matches: "${snippets.join(" ")}..."`);
      }
    }

    // From evidence
    const skillsLower = intent.skills.map(s => s.toLowerCase());
    for (const e of evidence.slice(0, 3)) {
      if (this.matchesSkills(e, skillsLower) && e.title) {
        reasons.push(`${e.evidenceType}: ${e.title}`);
      }
    }

    // From roles
    if (intent.roles.length > 0) {
      reasons.push(`Role match: ${intent.roles.join(", ")}`);
    }

    return reasons.slice(0, 5); // Max 5 reasons
  }
}

export function rerank(
  results: SearchResult[],
  intent: QueryIntent,
  documents: Map<string, SearchDocument>,
  evidenceByPerson: Map<string, EvidenceItem[]>
): RerankResult[] {
  const reranker = new Reranker();
  return reranker.rerank(results, intent, documents, evidenceByPerson);
}
```

Update packages/search/src/index.ts:
```typescript
export * from "./index-builder.js";
export * from "./embedding-generator.js";
export * from "./planner.js";
export * from "./retriever.js";
export * from "./reranker.js";
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/search && pnpm build --filter=@seeku/search</automated>
  </verify>
  <done>
    - Reranker class computes evidence boost
    - Project/repo matching boosts score based on skill relevance
    - Freshness penalty applies exponential decay
    - Match reasons extracted for display
    - TypeScript compilation succeeds
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/search
2. Build passes for @seeku/search
3. RerankResult extends SearchResult with finalScore
4. Evidence boost computed from matching projects/repos
5. Freshness penalty exponential decay formula
</verification>

<success_criteria>
1. Evidence-weighted scoring boosts relevant candidates (SEARCH-04)
2. Project matching adds 0.1 boost per match
3. Repository matching adds 0.05 boost per match
4. Freshness penalty reduces stale profiles exponentially
5. Match reasons extracted for UI display
6. All packages compile and build successfully
</success_criteria>

<output>
After completion, create `.planning/phases/03-search-embeddings/06-SUMMARY.md`
</output>