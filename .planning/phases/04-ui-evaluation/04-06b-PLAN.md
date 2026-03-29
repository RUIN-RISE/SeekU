---
phase: 04-ui-evaluation
plan: 06b
type: execute
wave: 4
depends_on: [04-06a]
files_modified: [apps/web/src/app/page.tsx, apps/web/src/app/admin/page.tsx, apps/web/src/components/EvalDashboard.tsx, apps/web/src/styles/globals.css]
autonomous: false
requirements: [UI-01, UI-02, EVAL-05]
user_setup: []

must_haves:
  truths:
    - "Search home page displays hero section with SearchBar"
    - "Search home page shows ResultsList when results arrive"
    - "Admin dashboard page shows sync status and eval metrics"
    - "CSS animations (fadeIn, scaleIn) work for modal"
  artifacts:
    - path: "apps/web/src/app/page.tsx"
      provides: "Search home page"
      contains: "SearchBar"
    - path: "apps/web/src/app/admin/page.tsx"
      provides: "Admin dashboard page"
      contains: "EvalDashboard"
    - path: "apps/web/src/components/EvalDashboard.tsx"
      provides: "Eval dashboard component"
      contains: "useSyncStatus"
    - path: "apps/web/src/styles/globals.css"
      provides: "CSS animations"
      contains: "@keyframes fadeIn"
  key_links:
    - from: "apps/web/src/app/page.tsx"
      to: "apps/web/src/components/Header.tsx"
      via: "Header import"
      pattern: "Header"
    - from: "apps/web/src/app/page.tsx"
      to: "apps/web/src/components/SearchBar.tsx"
      via: "SearchBar import"
      pattern: "SearchBar"
    - from: "apps/web/src/app/page.tsx"
      to: "apps/web/src/components/ResultsList.tsx"
      via: "ResultsList import"
      pattern: "ResultsList"
    - from: "apps/web/src/app/admin/page.tsx"
      to: "apps/api/src/routes/admin.ts"
      via: "useSyncStatus hook"
      pattern: "useSyncStatus"
---

<objective>
Assemble web frontend pages using components from Plan 06a: search home page and admin dashboard with Electric Studio styling.

Purpose: Compose the reusable components into complete pages. Implements UI-01 (search page), UI-02 (results display), and EVAL-05 (admin dashboard).
Output: Search home page, admin dashboard page, CSS animations.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/04-ui-evaluation/04-CONTEXT.md
@.planning/phases/04-ui-evaluation/04-RESEARCH.md
@.planning/phases/04-ui-evaluation/04-UI-SPEC.md
@.planning/phases/04-ui-evaluation/04-05-SUMMARY.md
@.planning/phases/04-ui-evaluation/04-06a-SUMMARY.md

<interfaces>
<!-- Key patterns from Plan 06a components -->

From apps/web/src/components/Header.tsx:
```typescript
export function Header();
```

From apps/web/src/components/SearchBar.tsx:
```typescript
export function SearchBar({ onResults }: SearchBarProps);
```

From apps/web/src/components/ResultsList.tsx:
```typescript
export function ResultsList({ data, onSelectCandidate }: ResultsListProps);
```

From apps/web/src/components/CandidateDetailModal.tsx:
```typescript
export function CandidateDetailModal({ personId, onClose }: CandidateDetailModalProps);
```

From apps/web/src/lib/hooks.ts:
```typescript
export function useSyncStatus();
```

From apps/web/src/lib/api.ts:
```typescript
export interface SearchResponse { ... }
```

From UI-SPEC.md Page 1: Search Home Layout:
```
HEADER (dark)          Logo | Nav Links
"发现AI人才"
"通过项目代码找到真正合适的人"
SearchBar
RESULTS (light)
找到 X 位候选人
CandidateCard grid
```

From UI-SPEC.md Page 3: Admin Dashboard:
```
HEADER (same)
Sync Status Card | Eval Metrics Card
Recent Runs Table
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create search home page</name>
  <files>apps/web/src/app/page.tsx, apps/web/src/styles/globals.css</files>
  <read_first>
    - apps/web/src/components/Header.tsx (Header component)
    - apps/web/src/components/SearchBar.tsx (SearchBar component)
    - apps/web/src/components/ResultsList.tsx (ResultsList component)
    - apps/web/src/components/CandidateDetailModal.tsx (Modal component)
    - apps/web/src/lib/api.ts (SearchResponse type)
    - .planning/phases/04-ui-evaluation/04-UI-SPEC.md (Page 1 layout)
  </read_first>
  <behavior>
    - Page displays title in Chinese with dark header background
    - SearchBar triggers search on input
    - ResultsList displays results when data arrives
    - Modal opens when clicking candidate card
  </behavior>
  <action>
Create apps/web/src/app/page.tsx as the search home page.

```typescript
"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { ResultsList } from "@/components/ResultsList";
import { CandidateDetailModal } from "@/components/CandidateDetailModal";
import type { SearchResponse } from "@/lib/api";

export default function HomePage() {
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-bg-light">
      {/* Header */}
      <Header />

      {/* Hero Section (dark background per UI-SPEC) */}
      <section className="bg-bg-dark py-16 px-6">
        <div className="max-w-[640px] mx-auto text-center">
          <h1 className="font-chinese-display font-extrabold text-4xl text-text-light mb-3">
            发现AI人才
          </h1>
          <p className="font-body text-lg text-text-light/80 mb-8">
            通过项目代码找到真正合适的人
          </p>
          <SearchBar onResults={setResults} />
        </div>
      </section>

      {/* Results Section (light background) */}
      <section className="bg-bg-light">
        {results && (
          <ResultsList
            data={results}
            onSelectCandidate={setSelectedPersonId}
          />
        )}
      </section>

      {/* Candidate Detail Modal */}
      <CandidateDetailModal
        personId={selectedPersonId}
        onClose={() => setSelectedPersonId(null)}
      />
    </div>
  );
}
```

Add CSS animations to apps/web/src/styles/globals.css (append after existing content):
```css
/* Animation keyframes for modal */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
```

Do NOT use server components for stateful components - use "use client" directive.
Do NOT add skeleton loading for initial state - empty state is fine.
  </action>
  <verify>
    <automated>grep -n "HomePage" apps/web/src/app/page.tsx && grep -n "Header" apps/web/src/app/page.tsx && grep -n "SearchBar" apps/web/src/app/page.tsx && grep -n "ResultsList" apps/web/src/app/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - apps/web/src/app/page.tsx exists
    - File contains `"use client"` directive
    - File imports Header, SearchBar, ResultsList, CandidateDetailModal
    - File imports SearchResponse from "@/lib/api"
    - File contains `export default function HomePage`
    - File has Header component
    - File has hero section with bg-bg-dark background
    - File has title "发现AI人才" in Chinese
    - File has subtitle "通过项目代码找到真正合适的人"
    - File has SearchBar component with onResults callback
    - File has ResultsList component when results exist
    - File has CandidateDetailModal component
    - File uses useState for results and selectedPersonId
    - apps/web/src/styles/globals.css contains @keyframes fadeIn
    - apps/web/src/styles/globals.css contains @keyframes scaleIn
  </acceptance_criteria>
  <done>
    Search home page displays Header and hero section.
    Chinese title and subtitle per UI-SPEC.
    SearchBar triggers search and passes results to ResultsList.
    Clicking card opens CandidateDetailModal.
    Dark header + light results section layout.
    CSS animations for modal transitions.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create admin dashboard page</name>
  <files>apps/web/src/app/admin/page.tsx, apps/web/src/components/EvalDashboard.tsx</files>
  <read_first>
    - apps/web/src/components/Header.tsx (Header component)
    - apps/web/src/lib/hooks.ts (useSyncStatus hook)
    - packages/eval/src/types.ts (BenchmarkSummary interface)
    - .planning/phases/04-ui-evaluation/04-UI-SPEC.md (Page 3 layout)
  </read_first>
  <behavior>
    - Dashboard shows sync status card and eval metrics card
    - Sync status shows recent runs with time, source, status
    - Eval metrics show precision@k and coverage (placeholder until eval runs)
    - "Run Eval" button placeholder
  </behavior>
  <action>
Create apps/web/src/app/admin/page.tsx and apps/web/src/components/EvalDashboard.tsx for admin dashboard.

1. Create apps/web/src/components/EvalDashboard.tsx:
```typescript
"use client";

import { RefreshCw, Play } from "lucide-react";
import { useSyncStatus } from "@/lib/hooks";

interface EvalMetrics {
  avgPrecisionAt5: number;
  avgPrecisionAt10: number;
  avgPrecisionAt20: number;
  coverageRate: number;
}

interface EvalDashboardProps {
  evalMetrics?: EvalMetrics;
  onRunEval?: () => void;
  onTriggerSync?: () => void;
}

export function EvalDashboard({ evalMetrics, onRunEval, onTriggerSync }: EvalDashboardProps) {
  const { data: syncStatus, isLoading: syncLoading } = useSyncStatus();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Sync Status Card */}
      <div className="bg-bg-white rounded-card shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-6">
        <h3 className="font-chinese-display font-bold text-lg text-text-dark mb-4">
          Sync Status
        </h3>
        {syncLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : syncStatus?.runs?.length > 0 ? (
          <div>
            <p className="text-sm text-text-muted mb-2">
              Last sync: {syncStatus.runs[0].source} ({syncStatus.runs[0].status})
            </p>
            <p className="text-xs text-text-muted">
              {new Date(syncStatus.runs[0].startedAt).toLocaleString()}
            </p>
            <div className="mt-4 space-y-2">
              {syncStatus.runs.slice(0, 5).map((run) => (
                <div key={run.id} className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">{run.source}</span>
                  <span className={`px-2 py-0.5 rounded ${
                    run.status === "succeeded" ? "bg-green-100 text-green-700" :
                    run.status === "failed" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No sync runs recorded</p>
        )}
        {onTriggerSync && (
          <button
            onClick={onTriggerSync}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-accent-blue text-text-light rounded-card hover:bg-accent-indigo transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Trigger Sync
          </button>
        )}
      </div>

      {/* Eval Metrics Card */}
      <div className="bg-bg-white rounded-card shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-6">
        <h3 className="font-chinese-display font-bold text-lg text-text-dark mb-4">
          Eval Metrics
        </h3>
        {evalMetrics ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">Precision@5</span>
              <span className="font-mono text-lg text-text-dark">
                {evalMetrics.avgPrecisionAt5.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">Precision@10</span>
              <span className="font-mono text-lg text-text-dark">
                {evalMetrics.avgPrecisionAt10.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">Precision@20</span>
              <span className="font-mono text-lg text-text-dark">
                {evalMetrics.avgPrecisionAt20.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">Coverage</span>
              <span className="font-mono text-lg text-text-dark">
                {(evalMetrics.coverageRate * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No eval results yet. Run eval benchmark.</p>
        )}
        {onRunEval && (
          <button
            onClick={onRunEval}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-accent-blue text-text-light rounded-card hover:bg-accent-indigo transition-colors"
          >
            <Play className="w-4 h-4" />
            Run Eval
          </button>
        )}
      </div>
    </div>
  );
}
```

2. Create apps/web/src/app/admin/page.tsx:
```typescript
"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { EvalDashboard } from "@/components/EvalDashboard";

export default function AdminPage() {
  const [evalMetrics, setEvalMetrics] = useState<{
    avgPrecisionAt5: number;
    avgPrecisionAt10: number;
    avgPrecisionAt20: number;
    coverageRate: number;
  } | null>(null);

  const handleRunEval = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/admin/run-eval`, {
        method: "POST"
      });
      const data = await response.json();
      // For MVP, eval results might not be available yet
      console.log("Eval triggered:", data);
    } catch (error) {
      console.error("Eval failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-bg-light">
      <Header />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <h1 className="font-chinese-display font-bold text-2xl text-text-dark mb-8">
          Admin Dashboard
        </h1>
        <EvalDashboard
          evalMetrics={evalMetrics}
          onRunEval={handleRunEval}
        />
      </main>
    </div>
  );
}
```

Do NOT implement full eval API integration - placeholder is sufficient for MVP.
Do NOT add authentication - admin is unprotected for development.
  </action>
  <verify>
    <automated>grep -n "EvalDashboard" apps/web/src/components/EvalDashboard.tsx && grep -n "useSyncStatus" apps/web/src/components/EvalDashboard.tsx && grep -n "admin" apps/web/src/app/admin/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - apps/web/src/components/EvalDashboard.tsx exists
    - apps/web/src/app/admin/page.tsx exists
    - EvalDashboard.tsx contains `"use client"` directive
    - EvalDashboard.tsx contains `export function EvalDashboard`
    - EvalDashboard.tsx imports RefreshCw, Play from "lucide-react"
    - EvalDashboard.tsx imports useSyncStatus from "@/lib/hooks"
    - EvalDashboard.tsx has Sync Status Card section
    - EvalDashboard.tsx has Eval Metrics Card section
    - EvalDashboard.tsx displays precision@5, precision@10, precision@20, coverage
    - EvalDashboard.tsx has "Trigger Sync" and "Run Eval" buttons
    - admin/page.tsx contains `"use client"` directive
    - admin/page.tsx imports Header and EvalDashboard
    - admin/page.tsx contains `export default function AdminPage`
    - admin/page.tsx has handleRunEval function
    - admin/page.tsx calls fetch to /admin/run-eval endpoint
  </acceptance_criteria>
  <done>
    Admin dashboard shows sync status and eval metrics.
    Sync status displays recent runs with status badges.
    Eval metrics placeholder for precision@k and coverage.
    "Run Eval" button triggers POST /admin/run-eval.
    Page accessible at /admin route.
  </done>
</task>

</tasks>

<verification>
After completing tasks:
1. Web app builds: `pnpm --filter @seeku/web build`
2. Dev server starts: `pnpm --filter @seeku/web dev`
3. Pages accessible: / (search home), /admin (admin dashboard)
4. Modal opens and closes correctly
5. Evidence tabs switch content
</verification>

<success_criteria>
- Search home page with Chinese title, SearchBar, ResultsList
- Candidate detail modal with Radix UI Dialog and EvidenceTabs
- Admin dashboard with sync status card and eval metrics card
- CSS animations (fadeIn, scaleIn) for modal transitions
- All pages use Electric Studio styling
- App builds and runs without errors
</success_criteria>

<output>
After completion, create `.planning/phases/04-ui-evaluation/04-06b-SUMMARY.md`
</output>