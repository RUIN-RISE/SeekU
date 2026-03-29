---
phase: 04-ui-evaluation
plan: 05
type: execute
subsystem: web-frontend
tags: [nextjs, react, tailwind, tanstack-query, components]
requires:
  - "apps/api/src/routes/search.ts (POST /search)"
  - "apps/api/src/routes/profiles.ts (GET /profiles/:personId)"
provides:
  - "Next.js 16 web app with App Router"
  - "SearchBar component with 300ms debouncing"
  - "CandidateCard component with match score, reasons, evidence preview"
  - "TanStack Query hooks for search and profile APIs"
affects:
  - "apps/web/* (new application)"
tech-stack:
  added:
    - "Next.js 16 with App Router"
    - "React 19"
    - "Tailwind CSS 4 with @tailwindcss/postcss"
    - "TanStack Query 5"
    - "lucide-react icons"
    - "use-debounce"
    - "clsx + tailwind-merge"
  patterns:
    - "App Router layout.tsx pattern"
    - "TanStack Query useQuery with enabled condition"
    - "useDebouncedCallback for input debouncing"
    - "Electric Studio color palette with Tailwind"
key-files:
  created:
    - "apps/web/package.json"
    - "apps/web/tsconfig.json"
    - "apps/web/next.config.js"
    - "apps/web/tailwind.config.js"
    - "apps/web/postcss.config.js"
    - "apps/web/src/styles/globals.css"
    - "apps/web/src/app/layout.tsx"
    - "apps/web/src/lib/api.ts"
    - "apps/web/src/lib/hooks.ts"
    - "apps/web/src/components/SearchBar.tsx"
    - "apps/web/src/components/CandidateCard.tsx"
decisions:
  - title: "Tailwind CSS 4.x PostCSS plugin"
    rationale: "Tailwind CSS 4 moved PostCSS plugin to @tailwindcss/postcss package"
    impact: "Added @tailwindcss/postcss and autoprefixer devDependencies"
  - title: "EvidenceIcon as React component"
    rationale: "TypeScript strict mode requires JSX return types; function syntax caused type errors"
    impact: "EvidenceIcon now uses props interface pattern for proper JSX typing"
---
# Phase 4 Plan 05: Web Frontend Application Summary

## One-liner
Created Next.js 16 web frontend with Electric Studio styling, TanStack Query hooks, SearchBar with debouncing, and CandidateCard component for search results display.

## What Was Done

### Task 1: Create Next.js web app structure
- Created apps/web package.json with Next.js 16, React 19, TanStack Query
- Configured Tailwind CSS with Electric Studio color palette (accent-blue, bg-dark, etc.)
- Set up App Router layout.tsx with Noto Sans SC and Manrope typography
- Added lucide-react, use-debounce, clsx, tailwind-merge dependencies
- Commit: `16475a0`

### Task 2: Create API client and TanStack Query hooks
- Created api.ts with searchAPI, getProfileAPI, getSyncStatusAPI functions
- Created hooks.ts with useSearch, useProfile, useSyncStatus hooks
- Search hook disabled for queries < 3 characters with 30s stale time
- Commit: `2d42172`

### Task 3: Create SearchBar component with debouncing
- SearchBar uses useDebouncedCallback with 300ms delay
- Integrates useSearch hook for API calls
- Electric Studio styling: blue accent focus state, card shadow
- Loading spinner animation during search
- Commit: `dfdc64c`

### Task 4: Create CandidateCard component
- Gradient avatar with name first character
- Match score badge with dark background (pill shape)
- Match reasons as blue tags (accent-blue/10)
- Evidence preview with icons (Star, GitBranch, Briefcase)
- Hover animation: translateY(-4px) + enhanced shadow
- Commit: `8ac866d`

### Build Fixes (Deviation)
- Added @tailwindcss/postcss for Tailwind CSS 4.x PostCSS plugin
- Added autoprefixer for vendor prefixing
- Fixed EvidenceIcon to be proper React component with props
- Re-exported SearchResponse type from hooks.ts
- Commit: `6bf5162`

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/package.json` | Created | Web app package configuration |
| `apps/web/tsconfig.json` | Created | TypeScript config with path aliases |
| `apps/web/next.config.js` | Created | Next.js configuration |
| `apps/web/tailwind.config.js` | Created | Tailwind CSS with Electric Studio colors |
| `apps/web/postcss.config.js` | Created | PostCSS with @tailwindcss/postcss |
| `apps/web/src/styles/globals.css` | Created | Global styles with fonts and CSS vars |
| `apps/web/src/app/layout.tsx` | Created | App Router root layout |
| `apps/web/src/lib/api.ts` | Created | API client functions |
| `apps/web/src/lib/hooks.ts` | Created | TanStack Query hooks |
| `apps/web/src/components/SearchBar.tsx` | Created | Search input component |
| `apps/web/src/components/CandidateCard.tsx` | Created | Candidate result card |

## Verification

- [x] Web app builds: `pnpm --filter @seeku/web build` succeeds
- [x] TypeScript compiles without errors
- [x] Tailwind CSS styles apply correctly
- [x] All components can be imported without errors

## Must-Haves Verification

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| Web app exists at apps/web with Next.js App Router | PASS | apps/web/src/app/layout.tsx exists |
| SearchBar component debounces input and triggers search | PASS | useDebouncedCallback(300ms) in SearchBar.tsx |
| CandidateCard displays name, headline, score, match reasons, evidence preview | PASS | All fields rendered in CandidateCard.tsx |
| TanStack Query hooks fetch data from search API | PASS | useSearch hook calls searchAPI |

## Key Links

- `apps/web/src/lib/hooks.ts` -> `apps/web/src/lib/api.ts` (imports searchAPI)
- `apps/web/src/lib/api.ts` -> `apps/api/src/routes/search.ts` (POST /search)
- `apps/web/src/components/SearchBar.tsx` -> `apps/web/src/lib/hooks.ts` (useSearch hook)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Tailwind CSS 4.x PostCSS plugin migration**
- **Found during:** Build verification
- **Issue:** Tailwind CSS 4.x moved PostCSS plugin to @tailwindcss/postcss package
- **Fix:** Added @tailwindcss/postcss and autoprefixer to package.json, updated postcss.config.js
- **Files modified:** package.json, postcss.config.js, pnpm-lock.yaml
- **Commit:** 6bf5162

**2. [Rule 1 - Bug] TypeScript JSX.Element return type for EvidenceIcon**
- **Found during:** Build verification
- **Issue:** EvidenceIcon function called with parentheses caused TypeScript type error
- **Fix:** Changed to proper React component with props interface, called as JSX `<EvidenceIcon type={...} />`
- **Files modified:** CandidateCard.tsx
- **Commit:** 6bf5162

**3. [Rule 3 - Blocking Issue] Missing type export for SearchResponse**
- **Found during:** Build verification
- **Issue:** SearchResponse type not exported from hooks.ts
- **Fix:** Added `export { type SearchResponse }` to hooks.ts
- **Files modified:** hooks.ts
- **Commit:** 6bf5162

---

*Duration: ~10 minutes*
*Completed: 2026-03-29*

## Self-Check: PASSED

All claimed files and commits verified:
- apps/web/package.json: FOUND
- apps/web/src/lib/hooks.ts: FOUND
- apps/web/src/components/SearchBar.tsx: FOUND
- apps/web/src/components/CandidateCard.tsx: FOUND
- Commits 16475a0, 2d42172, dfdc64c, 8ac866d, 6bf5162: FOUND