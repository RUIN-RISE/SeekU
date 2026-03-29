---
phase: 04-ui-evaluation
plan: 06a
type: execute
wave: 3
depends_on: [04-05]
files_modified: [apps/web/src/components/Header.tsx, apps/web/src/components/ResultsList.tsx, apps/web/src/components/EvidenceTabs.tsx, apps/web/src/components/CandidateDetailModal.tsx]
autonomous: true
requirements: [UI-03, UI-04]
user_setup: []

must_haves:
  truths:
    - "Header component displays dark background with navigation"
    - "ResultsList displays candidate cards in responsive grid"
    - "EvidenceTabs groups evidence by type with Radix UI"
    - "CandidateDetailModal shows profile with evidence tabs"
  artifacts:
    - path: "apps/web/src/components/Header.tsx"
      provides: "Dark header with navigation"
      exports: ["Header"]
    - path: "apps/web/src/components/ResultsList.tsx"
      provides: "Results grid display"
      contains: "CandidateCard"
    - path: "apps/web/src/components/EvidenceTabs.tsx"
      provides: "Evidence tabbed content"
      contains: "Tabs.Root"
    - path: "apps/web/src/components/CandidateDetailModal.tsx"
      provides: "Candidate detail modal"
      contains: "EvidenceTabs"
  key_links:
    - from: "apps/web/src/components/ResultsList.tsx"
      to: "apps/web/src/components/CandidateCard.tsx"
      via: "CandidateCard import"
      pattern: "CandidateCard"
    - from: "apps/web/src/components/CandidateDetailModal.tsx"
      to: "apps/api/src/routes/profiles.ts"
      via: "useProfile hook"
      pattern: "useProfile"
    - from: "apps/web/src/components/CandidateDetailModal.tsx"
      to: "apps/web/src/components/EvidenceTabs.tsx"
      via: "EvidenceTabs import"
      pattern: "EvidenceTabs"
---

<objective>
Build reusable web frontend components: Header, ResultsList, EvidenceTabs, and CandidateDetailModal following Electric Studio design.

Purpose: Create the core UI components that will be composed into pages in Plan 06b. Implements UI-03 (candidate detail modal) and UI-04 (admin dashboard components).
Output: Header, ResultsList, EvidenceTabs, CandidateDetailModal components.
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

<interfaces>
<!-- Key patterns from previous plans and UI-SPEC -->

From apps/web/src/lib/hooks.ts:
```typescript
export function useSearch(query: string, filters?: SearchFilters, limit?: number);
export function useProfile(personId: string);
export function useSyncStatus();
```

From apps/web/src/lib/api.ts:
```typescript
export interface SearchResultCard { ... }
export interface ProfileResponse { ... }
```

From apps/web/src/components/CandidateCard.tsx:
```typescript
export function CandidateCard({ candidate, onSelect }: CandidateCardProps);
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

From UI-SPEC.md Page 2: Candidate Detail Modal:
```
[X Close]
Avatar | Name | Headline | Score
[Projects] [Repositories] [Socials] [Job Signals]
Evidence items in selected tab
```

Modal Specs (from UI-SPEC):
- Size: Max 720px width, max 80vh height
- Background: white, centered with backdrop
- Close: X button top-right, click backdrop, ESC key
- Animation: fadeIn backdrop + scaleIn modal

Evidence Tabs (Radix UI):
| Tab | Content | Icon |
| Projects | Personal/portfolio projects | Briefcase |
| Repositories | GitHub repos, stars, languages | GitBranch |
| Socials | LinkedIn, Twitter, blog links | Link |
| Job Signals | Hiring status, company changes | TrendingUp |
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Header component</name>
  <files>apps/web/src/components/Header.tsx</files>
  <read_first>
    - apps/web/src/styles/globals.css (bg-dark, text-light colors)
    - .planning/phases/04-ui-evaluation/04-UI-SPEC.md (Header specs: 60px height, dark background)
  </read_first>
  <behavior>
    - Header has 60px height with dark background
    - Logo "Seeku" with blue accent on 'u'
    - Navigation links: 搜索, 管理
    - Links have hover state (blue accent)
  </behavior>
  <action>
Create apps/web/src/components/Header.tsx following UI-SPEC Header specs.

```typescript
"use client";

import Link from "next/link";

export function Header() {
  return (
    <header className="h-[60px] bg-bg-dark flex items-center px-6">
      <div className="flex items-center gap-8 w-full max-w-[1200px] mx-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <span className="text-xl font-english-display font-bold text-text-light">
            Seek<span className="text-accent-blue">u</span>
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-6">
          <Link
            href="/"
            className="text-text-light hover:text-accent-blue transition-colors font-body"
          >
            搜索
          </Link>
          <Link
            href="/admin"
            className="text-text-light hover:text-accent-blue transition-colors font-body"
          >
            管理
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

Do NOT use Inter/Roboto - use font-english-display for logo.
Do NOT add logout/auth links - MVP doesn't have authentication.
  </action>
  <verify>
    <automated>grep -n "Header" apps/web/src/components/Header.tsx && grep -n "Seeku" apps/web/src/components/Header.tsx && grep -n "bg-bg-dark" apps/web/src/components/Header.tsx</automated>
  </verify>
  <acceptance_criteria>
    - apps/web/src/components/Header.tsx exists
    - File contains `"use client"` directive
    - File contains `export function Header`
    - File contains `header` element with `h-[60px]` and `bg-bg-dark`
    - File contains logo text "Seek" with accent on "u"
    - File contains navigation links: 搜索, 管理
    - File uses Link from "next/link"
    - File has hover styling (hover:text-accent-blue)
  </acceptance_criteria>
  <done>
    Header component with dark background and navigation links.
    Logo displays "Seeku" with blue accent on 'u'.
    Navigation: 搜索 (home), 管理 (admin).
    Height 60px as per UI-SPEC.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create ResultsList component</name>
  <files>apps/web/src/components/ResultsList.tsx</files>
  <read_first>
    - apps/web/src/lib/api.ts (SearchResponse, SearchResultCard)
    - apps/web/src/components/CandidateCard.tsx (CandidateCard component)
    - .planning/phases/04-ui-evaluation/04-UI-SPEC.md (Results grid layout)
  </read_first>
  <behavior>
    - Results displayed in grid: minmax(360px, 1fr)
    - Shows count of results found
    - Cards clickable to open detail modal
  </behavior>
  <action>
Create apps/web/src/components/ResultsList.tsx for displaying search results grid.

```typescript
"use client";

import { CandidateCard } from "./CandidateCard";
import type { SearchResponse } from "@/lib/api";

interface ResultsListProps {
  data: SearchResponse;
  onSelectCandidate: (personId: string) => void;
}

export function ResultsList({ data, onSelectCandidate }: ResultsListProps) {
  if (!data.results.length) {
    return (
      <div className="text-center py-12 text-text-muted">
        <p className="text-lg">No candidates found</p>
        <p className="text-sm mt-2">Try a different search query</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto px-6 py-8">
      {/* Results Count */}
      <h2 className="font-chinese-display font-bold text-lg text-text-dark mb-6">
        找到 {data.total} 位候选人
      </h2>

      {/* Results Grid */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
        {data.results.map((candidate) => (
          <CandidateCard
            key={candidate.personId}
            candidate={candidate}
            onSelect={onSelectCandidate}
          />
        ))}
      </div>
    </div>
  );
}
```

Do NOT add pagination in MVP - display all results (limited by API limit parameter).
Do NOT use fixed 3-column layout - use auto-fill minmax for responsive grid.
  </action>
  <verify>
    <automated>grep -n "ResultsList" apps/web/src/components/ResultsList.tsx && grep -n "CandidateCard" apps/web/src/components/ResultsList.tsx && grep -n "grid-template-columns" apps/web/src/components/ResultsList.tsx</automated>
  </verify>
  <acceptance_criteria>
    - apps/web/src/components/ResultsList.tsx exists
    - File contains `"use client"` directive
    - File imports `CandidateCard` from "./CandidateCard"
    - File imports `SearchResponse` from "@/lib/api"
    - File contains `export function ResultsList`
    - File displays result count with Chinese text "找到 X 位候选人"
    - File uses grid layout with minmax(360px, 1fr)
    - File renders CandidateCard for each result
    - File passes onSelectCandidate to CandidateCard
    - File handles empty results with "No candidates found"
  </acceptance_criteria>
  <done>
    ResultsList displays search results in responsive grid.
    Shows count in Chinese ("找到 X 位候选人").
    Grid auto-fills with min-width 360px per card.
    Handles empty results gracefully.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create EvidenceTabs component</name>
  <files>apps/web/src/components/EvidenceTabs.tsx</files>
  <read_first>
    - packages/db/src/schema.ts (EvidenceItem, evidenceType enum)
    - apps/web/src/lib/api.ts (ProfileResponse)
    - .planning/phases/04-ui-evaluation/04-UI-SPEC.md (Evidence Tabs specs)
  </read_first>
  <behavior>
    - Tabs for Projects, Repositories, Socials, Job Signals
    - Each tab shows count of items
    - Radix UI Tabs with keyboard navigation
  </behavior>
  <action>
Create apps/web/src/components/EvidenceTabs.tsx using Radix UI Tabs.

```typescript
"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { Briefcase, GitBranch, Link, TrendingUp, Star } from "lucide-react";
import { clsx } from "clsx";

interface EvidenceItem {
  id: string;
  evidenceType: string;
  title: string | null;
  description: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
}

interface EvidenceTabsProps {
  evidence: EvidenceItem[];
}

type TabValue = "projects" | "repositories" | "socials" | "signals";

const tabConfig: { value: TabValue; label: string; icon: React.ReactNode; types: string[] }[] = [
  { value: "projects", label: "Projects", icon: <Briefcase className="w-4 h-4" />, types: ["project"] },
  { value: "repositories", label: "Repositories", icon: <GitBranch className="w-4 h-4" />, types: ["repository"] },
  { value: "socials", label: "Socials", icon: <Link className="w-4 h-4" />, types: ["social"] },
  { value: "signals", label: "Job Signals", icon: <TrendingUp className="w-4 h-4" />, types: ["job_signal"] }
];

function groupByType(items: EvidenceItem[]): Record<TabValue, EvidenceItem[]> {
  const grouped: Record<TabValue, EvidenceItem[]> = {
    projects: [],
    repositories: [],
    socials: [],
    signals: []
  };

  for (const item of items) {
    for (const config of tabConfig) {
      if (config.types.includes(item.evidenceType)) {
        grouped[config.value].push(item);
      }
    }
  }

  return grouped;
}

function EvidenceItemCard({ item }: { item: EvidenceItem }) {
  const stars = typeof item.metadata?.stargazers_count === "number" ? item.metadata.stargazers_count : null;
  const language = typeof item.metadata?.language === "string" ? item.metadata.language : null;

  return (
    <div className="p-3 rounded-lg bg-bg-light border border-gray-200">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-body font-medium text-text-dark truncate">
          {item.title ?? "Untitled"}
        </h4>
        {stars && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Star className="w-3 h-3 fill-current" />
            {stars}
          </span>
        )}
      </div>
      {item.description && (
        <p className="text-sm text-text-muted mt-1 line-clamp-2">{item.description}</p>
      )}
      <div className="flex items-center gap-2 mt-2">
        {language && (
          <span className="text-xs px-2 py-0.5 rounded bg-accent-blue/10 text-accent-blue">
            {language}
          </span>
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent-blue hover:underline"
          >
            View
          </a>
        )}
      </div>
    </div>
  );
}

export function EvidenceTabs({ evidence }: EvidenceTabsProps) {
  const grouped = groupByType(evidence);

  return (
    <Tabs.Root defaultValue="projects" className="w-full">
      <Tabs.List className="flex gap-1 border-b border-gray-200 mb-4">
        {tabConfig.map((config) => (
          <Tabs.Trigger
            key={config.value}
            value={config.value}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 font-body text-sm",
              "border-b-2 border-transparent",
              "data-[state=active]:border-accent-blue data-[state=active]:text-accent-blue",
              "data-[state=inactive]:text-text-muted data-[state=inactive]:hover:text-text-dark"
            )}
          >
            {config.icon}
            {config.label}
            <span className="text-xs bg-bg-light px-1.5 py-0.5 rounded">
              {grouped[config.value].length}
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {tabConfig.map((config) => (
        <Tabs.Content key={config.value} value={config.value} className="grid gap-3">
          {grouped[config.value].length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No items</p>
          ) : (
            grouped[config.value].map((item) => (
              <EvidenceItemCard key={item.id} item={item} />
            ))
          )}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
```

Do NOT add evidence filtering or sorting in MVP - just display grouped by type.
Do NOT use custom tab implementation - use Radix UI for accessibility.
  </action>
  <verify>
    <automated>grep -n "@radix-ui/react-tabs" apps/web/src/components/EvidenceTabs.tsx && grep -n "Tabs.Root" apps/web/src/components/EvidenceTabs.tsx && grep -n "groupedByType" apps/web/src/components/EvidenceTabs.tsx</automated>
  </verify>
  <acceptance_criteria>
    - apps/web/src/components/EvidenceTabs.tsx exists
    - File contains `"use client"` directive
    - File imports `* as Tabs` from "@radix-ui/react-tabs"
    - File imports icons from "lucide-react" (Briefcase, GitBranch, Link, TrendingUp, Star)
    - File contains `export function EvidenceTabs`
    - File uses `Tabs.Root` and `Tabs.List` components
    - File groups evidence by type (projects, repositories, socials, signals)
    - File displays count for each tab
    - File handles empty tab content
    - File uses active state styling (data-[state=active])
    - File contains EvidenceItemCard for each item
    - File displays stars from metadata.stargazers_count
    - File displays language from metadata.language
  </acceptance_criteria>
  <done>
    EvidenceTabs groups evidence by type with 4 tabs.
    Radix UI Tabs provide keyboard navigation and accessibility.
    Each tab shows count and list of evidence items.
    Items show title, description, stars, language, URL link.
  </done>
</task>

<task type="auto">
  <name>Task 4: Create CandidateDetailModal component</name>
  <files>apps/web/src/components/CandidateDetailModal.tsx</files>
  <read_first>
    - apps/web/src/lib/hooks.ts (useProfile hook)
    - apps/web/src/lib/api.ts (ProfileResponse)
    - apps/web/src/components/EvidenceTabs.tsx (EvidenceTabs component)
    - .planning/phases/04-ui-evaluation/04-UI-SPEC.md (Modal specs)
  </read_first>
  <behavior>
    - Modal opens when personId is set
    - Close via X button, backdrop click, ESC key
    - Max 720px width, max 80vh height
    - Shows loading state while fetching profile
  </behavior>
  <action>
Create apps/web/src/components/CandidateDetailModal.tsx using Radix UI Dialog.

```typescript
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { useProfile } from "@/lib/hooks";
import { EvidenceTabs } from "./EvidenceTabs";

interface CandidateDetailModalProps {
  personId: string | null;
  onClose: () => void;
}

export function CandidateDetailModal({ personId, onClose }: CandidateDetailModalProps) {
  const { data, isLoading, error } = useProfile(personId ?? "");

  if (!personId) {
    return null;
  }

  return (
    <Dialog.Root open={Boolean(personId)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-[fadeIn_0.3s_ease-out]" />

        {/* Modal Content */}
        <Dialog.Content
          className={clsx(
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-[720px] max-h-[80vh]",
            "bg-bg-white rounded-card shadow-lg",
            "p-6 overflow-y-auto",
            "data-[state=open]:animate-[scaleIn_0.3s_ease-out]"
          )}
        >
          {/* Close Button */}
          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-bg-light transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-text-muted" />
            </button>
          </Dialog.Close>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-12 text-red-500">
              <p>Failed to load candidate details</p>
            </div>
          )}

          {/* Content */}
          {data?.person && (
            <div>
              {/* Header */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-blue to-accent-indigo flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {data.person.primaryName.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <Dialog.Title className="font-chinese-display font-bold text-xl text-text-dark">
                    {data.person.primaryName}
                  </Dialog.Title>
                  {data.person.primaryHeadline && (
                    <Dialog.Description className="text-sm text-text-muted mt-1">
                      {data.person.primaryHeadline}
                    </Dialog.Description>
                  )}
                  {data.person.primaryLocation && (
                    <p className="text-xs text-text-muted mt-1">{data.person.primaryLocation}</p>
                  )}
                </div>
              </div>

              {/* Evidence Tabs */}
              <EvidenceTabs evidence={data.evidence} />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Add CSS animations to globals.css if not already present. This will be done in Plan 06b when assembling the page.
  </action>
  <verify>
    <automated>grep -n "@radix-ui/react-dialog" apps/web/src/components/CandidateDetailModal.tsx && grep -n "useProfile" apps/web/src/components/CandidateDetailModal.tsx && grep -n "EvidenceTabs" apps/web/src/components/CandidateDetailModal.tsx</automated>
  </verify>
  <acceptance_criteria>
    - apps/web/src/components/CandidateDetailModal.tsx exists
    - File contains `"use client"` directive
    - File imports `* as Dialog` from "@radix-ui/react-dialog"
    - File imports `X` from "lucide-react"
    - File imports `useProfile` from "@/lib/hooks"
    - File imports `EvidenceTabs` from "./EvidenceTabs"
    - File contains `export function CandidateDetailModal`
    - File uses `Dialog.Root` with `open={Boolean(personId)}`
    - File uses `Dialog.Overlay` for backdrop
    - File uses `Dialog.Content` with max-w-[720px] and max-h-[80vh]
    - File uses `Dialog.Close` button
    - File handles loading state with spinner
    - File handles error state
    - File displays person name, headline, location
    - File renders EvidenceTabs with evidence data
    - File calls onClose when dialog closes
  </acceptance_criteria>
  <done>
    CandidateDetailModal opens when personId is provided.
    Close via X button, backdrop click, ESC key.
    Max 720px width, max 80vh height as per UI-SPEC.
    Shows loading spinner while fetching.
    Displays candidate info and evidence tabs.
  </done>
</task>

</tasks>

<verification>
After completing tasks:
1. Web app builds: `pnpm --filter @seeku/web build`
2. Components can be imported without errors
3. Radix UI Dialog and Tabs work correctly
</verification>

<success_criteria>
- Header component with dark background and navigation
- ResultsList displays results in responsive grid
- EvidenceTabs groups evidence by type with Radix UI
- CandidateDetailModal shows profile with evidence tabs
- All components use Electric Studio styling
- App builds without errors
</success_criteria>

<output>
After completion, create `.planning/phases/04-ui-evaluation/04-06a-SUMMARY.md`
</output>