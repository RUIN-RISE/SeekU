# Phase 4: UI & Evaluation - Research

**Researched:** 2026-03-29
**Domain:** Web frontend, CLI interface, search quality evaluation
**Confidence:** HIGH (existing codebase patterns + established frontend ecosystem)

## Summary

Phase 4 delivers dual interfaces for the Seeku search system: a CLI for agent-friendly automation and a web frontend for human users, plus an evaluation system to validate search quality. The CLI extends the existing worker CLI pattern with search commands and JSON output. The web frontend uses React with Next.js App Router, following the frontend-slides skill design philosophy for distinctive, non-generic aesthetics. The evaluation system implements precision@k and coverage metrics against a golden dataset of known AI talent.

**Primary recommendation:** CLI first (smaller scope, reuse existing patterns), then web frontend (React/Next.js with shadcn/ui components). Both consume the existing POST /search API. Eval system uses TypeScript benchmark runner with JSON dataset.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Implementation Decisions

#### Dual Interface Strategy
- CLI comes first (smaller scope, faster validation)
- Web frontend second (using frontend-slides skill)
- Both interfaces share the same search API backend

#### CLI Version (Agent-Friendly)
- Command-line search interface
- JSON output format for parsing
- Scriptable and automatable
- Direct integration with existing worker CLI

#### Web Frontend Version
- Use `frontend-slides` skill for UI design
- Modern, visually appealing interface
- Search input with natural language queries
- Results display with candidate cards
- Evidence preview and detail views

#### Evaluation System
- Benchmark dataset for search quality
- Precision@K metrics
- Coverage metrics
- Admin dashboard for eval results

#### Claude's Discretion
- Specific CLI commands and flags
- Web framework choice (React/Vue/Svelte)
- Component structure
- Styling approach

### Deferred Ideas (OUT OF SCOPE)
- Real-time search suggestions
- Saved searches
- Advanced filters UI
- Export results
- Batch operations
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEARCH-05 | API endpoint `GET /profiles/:personId` returns candidate detail with evidence | Extend existing search.ts route pattern; use persons, evidenceItems tables |
| UI-01 | Search page with natural language input box | React search component; TanStack Query for async state; existing POST /search API |
| UI-02 | Results page with candidate cards (name, headline, match score, evidence preview) | SearchResponseCard interface defined in search.ts; shadcn/ui Card component |
| UI-03 | Candidate detail page with evidence tabs (projects, repos, socials, signals) | EvidenceItem schema with evidenceType enum; Radix UI Tabs component |
| UI-04 | Admin page showing sync status, eval results, and manual trigger buttons | sourceSyncRuns table for sync status; eval results in JSON format |
| EVAL-01 | Create eval query set (50-100 realistic search queries) | JSON dataset file; TypeScript interface for query schema |
| EVAL-02 | Create golden set (known AI talent with expected matches) | JSON dataset file; personId references with relevance labels |
| EVAL-03 | Benchmark runner computes coverage (how many golden set found) | TypeScript benchmark runner; search API integration |
| EVAL-04 | Benchmark runner computes precision@k (top results relevance) | Standard IR evaluation metrics; configurable k values (5, 10, 20) |
| EVAL-05 | Eval dashboard shows metrics and regression reports | Admin dashboard UI; JSON eval results visualization |
</phase_requirements>

## Standard Stack

### Core (Web Frontend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | UI framework | Industry standard, ecosystem depth |
| Next.js | 16.2.1 | Full-stack React framework | App Router RSC, SSR/SSG, API routes |
| Tailwind CSS | 4.2.2 | Styling | Utility-first, matches frontend-slides skill patterns |
| TanStack Query | 5.95.2 | Data fetching/state | Async state management, caching, pagination |

### UI Components
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-dialog | 1.1.15 | Modal dialogs | Candidate detail modal |
| @radix-ui/react-tabs | 1.1.13 | Tabbed content | Evidence tabs (projects, repos, socials) |
| lucide-react | 1.7.0 | Icon library | Search icons, evidence type icons |
| class-variance-authority | 0.7.1 | Component variants | Card variants (hover, selected states) |
| clsx | 2.1.1 | Conditional classes | Dynamic class composition |
| tailwind-merge | 3.5.0 | Merge Tailwind classes | Override styles cleanly |

### Supporting (CLI)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| commander | 9.5.0 | CLI argument parsing | Already used in existing worker CLI pattern |
| tsx | 4.21.0 | TypeScript execution | Run CLI during development |

### Supporting (Evaluation)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.24.2 | Schema validation | Already in @seeku/shared; validate eval datasets |

**Installation:**
```bash
# Web frontend app (new)
cd apps/web
pnpm add react next tailwindcss @tanstack/react-query
pnpm add @radix-ui/react-dialog @radix-ui/react-tabs lucide-react
pnpm add class-variance-authority clsx tailwind-merge

# CLI extension (existing worker app)
cd apps/worker
# commander already used via pattern in cli.ts

# Eval package (new)
cd packages/eval
pnpm add zod  # already available via @seeku/shared
```

**Version verification:** Versions checked against npm registry on 2026-03-29.

## Architecture Patterns

### Recommended Project Structure
```
apps/
├── web/                    # NEW: Web frontend
│   ├── src/
│   │   ├── app/           # Next.js App Router pages
│   │   │   ├── page.tsx   # Search page (UI-01)
│   │   │   ├── results/   # Results page (UI-02)
│   │   │   ├── profiles/[id]/  # Candidate detail (UI-03, SEARCH-05)
│   │   │   └── admin/     # Admin dashboard (UI-04, EVAL-05)
│   │   ├── components/    # React components
│   │   │   ├── SearchBar.tsx
│   │   │   ├── CandidateCard.tsx
│   │   │   ├── EvidenceTabs.tsx
│   │   │   └── EvalDashboard.tsx
│   │   ├── lib/           # Utilities
│   │   │   ├── api.ts     # API client for existing backend
│   │   │   └── hooks.ts   # TanStack Query hooks
│   │   └── styles/        # Global styles
│   │       └── globals.css
│   └── package.json
├── worker/                 # EXISTING: CLI (extend with search)
│   └── src/
│       └── cli.ts         # Add search, show commands
│       └── search-cli.ts  # NEW: Search-specific CLI logic
├── api/                    # EXISTING: Backend API
│   └── src/
│       └── routes/
│           ├── search.ts  # EXISTING: POST /search
│           ├── profiles.ts # NEW: GET /profiles/:personId (SEARCH-05)
│           └── admin.ts   # NEW: Admin endpoints (UI-04)
packages/
├── eval/                   # NEW: Evaluation system
│   ├── src/
│   │   ├── benchmark.ts   # Benchmark runner (EVAL-03, EVAL-04)
│   │   ├── metrics.ts     # Precision@k, coverage computation
│   │   ├── dataset.ts     # Load query/golden sets
│   │   └── index.ts
│   ├── datasets/
│   │   ├── queries.json   # Eval query set (EVAL-01)
│   │   └── golden-set.json # Known talent (EVAL-02)
│   └── package.json
├── search/                 # EXISTING: Search logic
├── db/                     # EXISTING: Database layer
```

### Pattern 1: CLI Search Command
**What:** Extend existing worker CLI pattern with search commands
**When to use:** Agent-friendly interface, automation, JSON output
**Example:**
```typescript
// apps/worker/src/search-cli.ts
import { createDatabaseConnection } from "@seeku/db";
import { QueryPlanner, HybridRetriever, Reranker } from "@seeku/search";
import { SiliconFlowProvider } from "@seeku/llm";

interface SearchCliOptions {
  query: string;
  limit?: number;
  json?: boolean;
}

export async function runSearchCli(options: SearchCliOptions) {
  const db = createDatabaseConnection();
  const provider = SiliconFlowProvider.fromEnv();
  const planner = new QueryPlanner({ provider });
  const retriever = new HybridRetriever({ db, provider });
  const reranker = new Reranker();

  const intent = await planner.parse(options.query);
  const embedding = await provider.embed(intent.rawQuery);
  const results = await retriever.retrieve(intent, { embedding });
  const reranked = reranker.rerank(results, intent, ...);

  if (options.json) {
    console.log(JSON.stringify({ results: reranked, intent }, null, 2));
  } else {
    // Human-readable output
    for (const result of reranked.slice(0, options.limit ?? 10)) {
      console.log(`${result.personId}: ${result.finalScore.toFixed(2)}`);
    }
  }
}

// apps/worker/src/cli.ts - extend existing pattern
if (command === "search") {
  const query = parsed.args.get("query") ?? parsed.positionals[0];
  const limit = Number(parsed.args.get("limit") ?? "10");
  const json = parsed.flags.has("json");
  result = await runSearchCli({ query, limit, json });
}
```

### Pattern 2: React Search Component
**What:** TanStack Query + async search with debounced input
**When to use:** Web frontend search page
**Example:**
```typescript
// apps/web/src/lib/hooks.ts
import { useQuery } from "@tanstack/react-query";

interface SearchResponse {
  results: SearchResultCard[];
  total: number;
  intent: QueryIntent;
}

export function useSearch(query: string, filters?: SearchFilters) {
  return useQuery({
    queryKey: ["search", query, filters],
    queryFn: async () => {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, filters })
      });
      return res.json() as SearchResponse;
    },
    enabled: query.length > 2,
    staleTime: 30_000
  });
}

// apps/web/src/components/SearchBar.tsx
import { useSearch } from "@/lib/hooks";
import { useDebouncedCallback } from "use-debounce";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedCallback(setQuery, 300);
  const { data, isLoading } = useSearch(debouncedQuery);

  return (
    <div className="search-container">
      <input
        type="text"
        placeholder="Find AI engineers with RAG experience in Beijing..."
        onChange={(e) => debouncedQuery(e.target.value)}
        className="search-input"
      />
      {isLoading && <Spinner />}
      {data && <ResultsList results={data.results} />}
    </div>
  );
}
```

### Pattern 3: Evidence Tabs Component
**What:** Radix UI Tabs for categorized evidence display
**When to use:** Candidate detail page (UI-03)
**Example:**
```typescript
// apps/web/src/components/EvidenceTabs.tsx
import * as Tabs from "@radix-ui/react-tabs";
import { EvidenceItem } from "@seeku/db";

interface EvidenceTabsProps {
  evidence: EvidenceItem[];
}

function groupByType(items: EvidenceItem[]) {
  return {
    projects: items.filter(i => i.evidenceType === "project"),
    repositories: items.filter(i => i.evidenceType === "repository"),
    socials: items.filter(i => i.evidenceType === "social"),
    signals: items.filter(i => i.evidenceType === "job_signal")
  };
}

export function EvidenceTabs({ evidence }: EvidenceTabsProps) {
  const grouped = groupByType(evidence);

  return (
    <Tabs.Root defaultValue="projects" className="tabs-root">
      <Tabs.List className="tabs-list">
        <Tabs.Trigger value="projects">Projects ({grouped.projects.length})</Tabs.Trigger>
        <Tabs.Trigger value="repositories">Repos ({grouped.repositories.length})</Tabs.Trigger>
        <Tabs.Trigger value="socials">Socials ({grouped.socials.length})</Tabs.Trigger>
        <Tabs.Trigger value="signals">Signals ({grouped.signals.length})</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="projects">
        <EvidenceGrid items={grouped.projects} />
      </Tabs.Content>
      {/* ... other tabs */}
    </Tabs.Root>
  );
}
```

### Pattern 4: Evaluation Benchmark Runner
**What:** TypeScript benchmark runner computing precision@k and coverage
**When to use:** Eval system (EVAL-03, EVAL-04)
**Example:**
```typescript
// packages/eval/src/metrics.ts
export interface EvalResult {
  queryId: string;
  precisionAt5: number;
  precisionAt10: number;
  precisionAt20: number;
  coverage: boolean;  // Did we find expected candidate?
  expectedInTopK: number;  // Position of expected candidate
}

export function computePrecisionAtK(
  results: SearchResultCard[],
  expectedIds: string[],
  k: number
): number {
  const topK = results.slice(0, k);
  const matches = topK.filter(r => expectedIds.includes(r.personId));
  return matches.length / k;
}

export function computeCoverage(
  results: SearchResultCard[],
  expectedIds: string[]
): boolean {
  return results.some(r => expectedIds.includes(r.personId));
}

// packages/eval/src/benchmark.ts
export async function runBenchmark(
  queries: EvalQuery[],
  goldenSet: GoldenSetEntry[]
): Promise<BenchmarkSummary> {
  const results: EvalResult[] = [];

  for (const query of queries) {
    const response = await fetch("/api/search", {
      method: "POST",
      body: JSON.stringify({ query: query.text, limit: 50 })
    });
    const searchResults = await response.json();

    const expectedIds = goldenSet
      .filter(g => g.queryId === query.id)
      .map(g => g.personId);

    results.push({
      queryId: query.id,
      precisionAt5: computePrecisionAtK(searchResults.results, expectedIds, 5),
      precisionAt10: computePrecisionAtK(searchResults.results, expectedIds, 10),
      precisionAt20: computePrecisionAtK(searchResults.results, expectedIds, 20),
      coverage: computeCoverage(searchResults.results, expectedIds),
      expectedInTopK: findExpectedPosition(searchResults.results, expectedIds)
    });
  }

  return summarize(results);
}
```

### Anti-Patterns to Avoid
- **Generic UI components:** Don't use default shadcn/ui styling without customization. Follow frontend-slides skill for distinctive aesthetics.
- **No debouncing on search:** Leads to excessive API calls. Always debounce input.
- **Ignoring match reasons:** The search API returns matchReasons - display them for transparency.
- **Storing eval results in database:** Keep as JSON files for simplicity, version control, and easy inspection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal dialogs | Custom overlay component | @radix-ui/react-dialog | Accessibility, focus trap, escape handling |
| Tab navigation | Custom tab switcher | @radix-ui/react-tabs | Keyboard navigation, accessibility |
| Async state management | useState + useEffect | TanStack Query | Caching, loading states, refetch, stale-while-revalidate |
| CLI argument parsing | Custom argv parser | commander (existing pattern) | Flag parsing, help generation, subcommands |
| Search debouncing | Custom setTimeout wrapper | use-debounce library | Cleanup, cancelation, leading/trailing options |
| JSON validation | Custom type checks | zod schemas | Already in @seeku/shared; runtime validation |

**Key insight:** The project already has established patterns for CLI (apps/worker/src/cli.ts) and API routes (apps/api/src/routes/). Extend these rather than creating new patterns.

## Common Pitfalls

### Pitfall 1: Frontend Generic Aesthetics
**What goes wrong:** Default component library styling creates "AI slop" look
**Why it happens:** Developers copy component examples without customization
**How to avoid:** Follow frontend-slides skill principles: distinctive typography, bold color choices, custom animations
**Warning signs:** Using Inter/Roboto fonts, purple gradients, predictable layouts

### Pitfall 2: Search Without Debouncing
**What goes wrong:** Every keystroke triggers API call, overwhelming backend
**Why it happens:** Direct onChange handler without delay
**How to avoid:** Use useDebouncedCallback with 300ms delay, disable query when input < 3 chars
**Warning signs:** Network tab shows many pending requests during typing

### Pitfall 3: Eval Dataset Not Versioned
**What goes wrong:** Golden set changes silently, making eval results incomparable
**Why it happens:** Storing dataset in database or non-versioned location
**How to avoid:** Keep queries.json and golden-set.json in packages/eval/datasets/, commit to git
**Warning signs:** Eval metrics change without code changes

### Pitfall 4: Missing Evidence Preview
**What goes wrong:** Candidate cards show only name/score, hiding why they matched
**Why it happens:** Simplifying UI, ignoring matchReasons and evidencePreview from API
**How to avoid:** Display matchReasons as tags, show top 3 evidence items
**Warning signs:** Users can't understand why candidate appeared in results

### Pitfall 5: Admin Dashboard No Real Data
**What goes wrong:** Dashboard shows mock data, not actual sync/eval status
**Why it happens:** Building UI before backend endpoints exist
**How to avoid:** Use sourceSyncRuns table for sync status, run eval benchmark before dashboard
**Warning signs:** Dashboard shows hardcoded values

## Code Examples

### Candidate Card Component
```typescript
// apps/web/src/components/CandidateCard.tsx
// Source: Adapted from SearchResponseCard interface in search.ts
import { SearchResultCard } from "@seeku/search";
import { Star, GitBranch, Briefcase } from "lucide-react";

interface CandidateCardProps {
  candidate: SearchResultCard;
  onSelect: (personId: string) => void;
}

function EvidenceIcon(type: string) {
  switch (type) {
    case "repository": return <GitBranch className="w-4 h-4" />;
    case "project": return <Briefcase className="w-4 h-4" />;
    default: return null;
  }
}

export function CandidateCard({ candidate, onSelect }: CandidateCardProps) {
  return (
    <article
      className="candidate-card hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => onSelect(candidate.personId)}
    >
      <header className="card-header">
        <h3 className="candidate-name">{candidate.name}</h3>
        {candidate.headline && <p className="headline">{candidate.headline}</p>}
      </header>

      <div className="match-info">
        <span className="score">{candidate.matchScore.toFixed(1)}</span>
        <div className="match-reasons">
          {candidate.matchReasons.map(reason => (
            <span key={reason} className="reason-tag">{reason}</span>
          ))}
        </div>
      </div>

      <div className="evidence-preview">
        {candidate.evidencePreview.map(evidence => (
          <div key={evidence.url ?? evidence.title} className="evidence-item">
            {EvidenceIcon(evidence.type)}
            <span className="evidence-title">{evidence.title}</span>
            {evidence.stars && (
              <span className="stars">
                <Star className="w-3 h-3" />
                {evidence.stars}
              </span>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
```

### CLI Search Commands
```bash
# Search via CLI (extends existing pattern)
seeku search "AI工程师 Python 北京" --json

# Interactive mode (optional enhancement)
seeku search -i

# Get candidate details (extends existing pattern)
seeku show <person-id> --json

# Run eval benchmark
seeku eval run --queries datasets/queries.json --golden datasets/golden-set.json
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side fetching | React Server Components + hydration | Next.js 13+ (2023) | Better SEO, faster initial load |
| Manual debounce | useDebouncedCallback hook | React ecosystem (2020+) | Cleaner code, proper cleanup |
| Custom modal JS | Radix UI primitives | Radix v1 (2022) | Accessibility built-in |
| Eval in notebook | TypeScript benchmark runner | Project decision (2026) | CI integration, reproducible |

**Deprecated/outdated:**
- Class components: Use functional components with hooks
- Inline styles: Use Tailwind utility classes
- Fetch in useEffect: Use TanStack Query for async state

## Open Questions

1. **Web Framework Choice**
   - What we know: CONTEXT.md allows Claude's discretion for framework choice
   - What's unclear: React vs Vue vs Svelte for this specific use case
   - Recommendation: React + Next.js - matches existing TypeScript ecosystem, frontend-slides skill patterns, and TanStack Query integration

2. **Admin Dashboard Scope**
   - What we know: UI-04 requires sync status and eval metrics display
   - What's unclear: Whether admin should have manual trigger buttons for workers
   - Recommendation: Include trigger buttons - useful for testing, matches existing worker CLI commands

3. **Eval Dataset Size**
   - What we know: EVAL-01 specifies 50-100 queries, EVAL-02 specifies known AI talent
   - What's unclear: Exact golden set size and relevance labeling methodology
   - Recommendation: Start with 50 queries and 100 known profiles, refine based on search quality results

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Frontend build | ✓ | Check runtime | — |
| pnpm | Package management | ✓ | 10.32.1 | — |
| PostgreSQL | Search API backend | ✓ | 16 + pgvector | — |
| SiliconFlow API | Search embeddings | ✓ | (external) | — |
| Docker | Local dev database | ✓ | docker-compose.yml | Direct Postgres install |

**Missing dependencies with no fallback:**
- None identified

**Missing dependencies with fallback:**
- None identified

## Integration Points

### Existing Search API
The existing `POST /search` endpoint (apps/api/src/routes/search.ts) returns:
```typescript
interface SearchResponseBody {
  results: SearchResultCard[];
  total: number;
  intent: QueryIntent;
}
```

This is the single source for both CLI and web frontend. No duplication needed.

### Required New Endpoint: GET /profiles/:personId
For SEARCH-05, add a new route:
```typescript
// apps/api/src/routes/profiles.ts
export function registerProfileRoutes(server: FastifyInstance, db: SeekuDatabase) {
  server.get("/profiles/:personId", async (request, reply) => {
    const params = request.params as { personId: string };
    const person = await db.select().from(persons).where(eq(persons.id, params.personId));
    const evidence = await db.select().from(evidenceItems).where(eq(evidenceItems.personId, params.personId));

    if (!person.length) {
      return reply.status(404).send({ error: "not_found" });
    }

    return { person: person[0], evidence };
  });
}
```

### Admin Endpoints
For UI-04, add endpoints:
```typescript
// apps/api/src/routes/admin.ts
export function registerAdminRoutes(server: FastifyInstance, db: SeekuDatabase) {
  server.get("/admin/sync-status", async () => {
    const runs = await db.select().from(sourceSyncRuns).orderBy(desc(sourceSyncRuns.startedAt)).limit(10);
    return { runs };
  });

  server.post("/admin/run-eval", async () => {
    // Trigger eval benchmark, return results
  });
}
```

## Sources

### Primary (HIGH confidence)
- Existing codebase patterns (apps/worker/src/cli.ts, apps/api/src/routes/search.ts) - Project-specific conventions
- packages/db/src/schema.ts - Data schema for persons, evidence_items
- packages/search/src/planner.ts, reranker.ts - Search logic patterns
- npm registry version checks (2026-03-29) - Current package versions

### Secondary (MEDIUM confidence)
- frontend-slides skill (SKILL.md) - UI design philosophy and viewport rules
- frontend-design skill (SKILL.md) - Distinctive aesthetics principles
- Phase 3 RESEARCH.md - Search document structure and API patterns
- webapp-testing skill (SKILL.md) - Playwright testing patterns

### Tertiary (LOW confidence)
- Web search results for evaluation patterns - Need verification against IR literature

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified against npm registry, existing project patterns
- Architecture: HIGH - Based on existing codebase structure and established patterns
- Pitfalls: HIGH - Derived from frontend-slides skill and common React mistakes

**Research date:** 2026-03-29
**Valid until:** 30 days (stable frontend ecosystem, project patterns are fixed)