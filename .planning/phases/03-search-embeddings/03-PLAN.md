---
phase: 03-search-embeddings
plan: 03
type: execute
wave: 2
depends_on: [03-01]
files_modified:
  - packages/search/src/index-builder.ts
  - packages/search/src/index.ts
  - packages/search/package.json
autonomous: true
requirements: [DATA-07]
user_setup: []
must_haves:
  truths:
    - "Search documents are built from persons and their evidence items"
    - "doc_text contains name, headline, summary, and evidence descriptions"
    - "Facets are extracted for role, location, source, and tags"
    - "rank_features include evidence counts and freshness"
  artifacts:
    - path: "packages/search/src/index-builder.ts"
      provides: "Search document construction from person data"
      exports: ["buildSearchDocument", "buildAllSearchDocuments", "SearchDocumentInput"]
    - path: "packages/search/src/index.ts"
      provides: "Module exports"
  key_links:
    - from: "packages/search/src/index-builder.ts"
      to: "packages/db/src/schema.ts"
      via: "Person, EvidenceItem types"
      pattern: "import { persons, evidenceItems }"
---

<objective>
Create the search index builder that constructs denormalized search_documents from merged person data and evidence items. This extracts searchable text, facet arrays, and ranking features.

Purpose: Populate search_documents table with queryable content (DATA-07)
Output: Index builder module that transforms persons + evidence into search documents
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/03-search-embeddings/01-RESEARCH.md

<interfaces>
From packages/db/src/schema.ts (after Plan 01 schema extension):
```typescript
export type Person = typeof persons.$inferSelect;
export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type SearchDocument = typeof searchDocuments.$inferSelect;
export type NewSearchDocument = typeof searchDocuments.$inferInsert;

// Evidence types: "social", "project", "repository", "community_post", "job_signal", "education", "experience", "profile_field"
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create search package structure and index builder</name>
  <files>packages/search/package.json, packages/search/src/index-builder.ts</files>
  <read_first>
    - packages/db/src/schema.ts (Person, EvidenceItem, SearchDocument types)
    - packages/identity/src/index.ts (pattern reference for module structure)
  </read_first>
  <action>
Create packages/search/ module with index builder:

1. Create packages/search/package.json:
```json
{
  "name": "@seeku/search",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@seeku/db": "workspace:*",
    "@seeku/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.2",
    "@types/node": "^22.13.10"
  }
}
```

2. Create packages/search/src/index-builder.ts:
```typescript
import type { Person, EvidenceItem, NewSearchDocument } from "@seeku/db";

export interface SearchDocumentInput {
  person: Person;
  evidence: EvidenceItem[];
}

export interface RankFeatures {
  evidenceCount: number;
  projectCount: number;
  repoCount: number;
  followerCount: number;
  freshness: number; // Days since last update
}

export function buildSearchDocument(input: SearchDocumentInput): NewSearchDocument {
  const { person, evidence } = input;

  // Build doc_text from person and evidence
  const textParts: string[] = [];

  // Person basic info
  if (person.primaryName) textParts.push(person.primaryName);
  if (person.primaryHeadline) textParts.push(person.primaryHeadline);
  if (person.summary) textParts.push(person.summary);
  if (person.primaryLocation) textParts.push(person.primaryLocation);

  // Evidence items
  for (const item of evidence) {
    if (item.title) textParts.push(item.title);
    if (item.description) textParts.push(item.description);
  }

  const docText = textParts.join(" ");

  // Extract facets
  const facetRole = extractRoles(person, evidence);
  const facetLocation = extractLocations(person, evidence);
  const facetSource = extractSources(evidence);
  const facetTags = extractTags(person, evidence);

  // Compute rank features
  const rankFeatures = computeRankFeatures(person, evidence);

  return {
    personId: person.id,
    docText,
    facetRole,
    facetLocation,
    facetSource,
    facetTags,
    rankFeatures,
    updatedAt: new Date()
  };
}

function extractRoles(person: Person, evidence: EvidenceItem[]): string[] {
  const roles: Set<string> = new Set();

  // From headline (e.g., "AI Engineer @ Startup" -> "AI Engineer")
  if (person.primaryHeadline) {
    const headlineRoles = person.primaryHeadline
      .split(/[,@]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 50);
    headlineRoles.forEach(r => roles.add(r.toLowerCase()));
  }

  // From evidence (job signals, experience)
  evidence
    .filter(e => e.evidenceType === "job_signal" || e.evidenceType === "experience")
    .forEach(e => {
      if (e.title) roles.add(e.title.toLowerCase());
    });

  return Array.from(roles);
}

function extractLocations(person: Person, evidence: EvidenceItem[]): string[] {
  const locations: Set<string> = new Set();

  if (person.primaryLocation) {
    locations.add(person.primaryLocation.toLowerCase());
  }

  // From evidence metadata (location field)
  evidence.forEach(e => {
    const loc = e.metadata?.location as string | undefined;
    if (loc) locations.add(loc.toLowerCase());
  });

  return Array.from(locations);
}

function extractSources(evidence: EvidenceItem[]): string[] {
  const sources: Set<string> = new Set();
  evidence.forEach(e => {
    if (e.source) sources.add(e.source);
  });
  return Array.from(sources);
}

function extractTags(person: Person, evidence: EvidenceItem[]): string[] {
  const tags: Set<string> = new Set();

  // From evidence titles/descriptions (tech keywords)
  const techKeywords = ["python", "javascript", "typescript", "rust", "go", "java",
    "machine learning", "ai", "deep learning", "nlp", "rag", "llm", "gpt",
    "react", "vue", "node", "docker", "kubernetes", "aws", "gcp"];

  const allText = [
    person.primaryHeadline,
    person.summary,
    ...evidence.map(e => `${e.title ?? ""} ${e.description ?? ""}`)
  ].join(" ").toLowerCase();

  techKeywords.forEach(kw => {
    if (allText.includes(kw)) tags.add(kw);
  });

  // From repository language
  evidence
    .filter(e => e.evidenceType === "repository")
    .forEach(e => {
      const lang = e.metadata?.language as string | undefined;
      if (lang) tags.add(lang.toLowerCase());
    });

  return Array.from(tags);
}

function computeRankFeatures(person: Person, evidence: EvidenceItem[]): RankFeatures {
  const now = Date.now();
  const updatedAt = person.updatedAt ? new Date(person.updatedAt).getTime() : now;
  const freshness = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24)); // Days

  return {
    evidenceCount: evidence.length,
    projectCount: evidence.filter(e => e.evidenceType === "project").length,
    repoCount: evidence.filter(e => e.evidenceType === "repository").length,
    followerCount: 0, // Will be extracted from metadata when available
    freshness
  };
}

export async function buildAllSearchDocuments(
  persons: Person[],
  evidenceByPerson: Map<string, EvidenceItem[]>
): Promise<NewSearchDocument[]> {
  return persons.map(person => {
    const evidence = evidenceByPerson.get(person.id) ?? [];
    return buildSearchDocument({ person, evidence });
  });
}
```
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/search</automated>
  </verify>
  <done>
    - buildSearchDocument function exists and returns NewSearchDocument
    - Facet extraction functions exist (roles, locations, sources, tags)
    - RankFeatures computation includes evidence counts and freshness
    - TypeScript compilation succeeds
  </done>
</task>

<task type="auto">
  <name>Task 2: Create search module exports</name>
  <files>packages/search/src/index.ts</files>
  <read_first>
    - packages/search/src/index-builder.ts (exports to include)
  </read_first>
  <action>
Create packages/search/src/index.ts:
```typescript
export * from "./index-builder.js";
```

This will be extended in subsequent plans to include:
- planner.ts (Query planner)
- retriever.ts (Hybrid retrieval)
- reranker.ts (Evidence-weighted reranking)
  </action>
  <verify>
    <automated>pnpm typecheck --filter=@seeku/search && pnpm build --filter=@seeku/search</automated>
  </verify>
  <done>
    - packages/search/src/index.ts exports index-builder
    - TypeScript compilation succeeds
    - Build succeeds
  </done>
</task>

</tasks>

<verification>
Phase-level verification:
1. TypeScript typecheck passes for @seeku/search
2. Build passes for @seeku/search
3. buildSearchDocument produces valid NewSearchDocument
4. Facets extracted correctly from person and evidence
</verification>

<success_criteria>
1. Search document builder creates doc_text from person + evidence (DATA-07)
2. Facets extracted for role, location, source, tags
3. Rank features computed for evidence weighting
4. Module exports properly organized
5. All packages compile and build successfully
</success_criteria>

<output>
After completion, create `.planning/phases/03-search-embeddings/03-SUMMARY.md`
</output>