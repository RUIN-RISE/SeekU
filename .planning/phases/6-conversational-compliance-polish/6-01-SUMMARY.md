---
phase: 6-conversational-compliance-polish
plan: 01
subsystem: database, auth
tags: [drizzle, next-auth, github-oauth, profile-claims, jwt]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: persons table schema, database infrastructure
provides:
  - profile_claims table schema for talent verification
  - Auth.js v5 GitHub OAuth provider setup
  - claimMethod and claimStatus enums
affects: [profile-claim-workflow, verification-ui, admin-dashboard]

# Tech tracking
tech-stack:
  added: [next-auth@5.0.0-beta.30, jose@6.2.2]
  patterns: [drizzle-orm schema pattern, next-auth v5 handlers pattern]

key-files:
  created:
    - packages/db/src/migrations/0003_profile_claims.ts
    - apps/web/src/lib/auth.ts
    - apps/web/src/app/api/auth/[...nextauth]/route.ts
    - apps/web/.env.example
  modified:
    - packages/db/src/schema.ts

key-decisions:
  - "Migration numbering: 0003 (sequential from existing TS migrations)"
  - "Auth.js v5 beta used for latest features"
  - "GitHub OAuth for claim verification only, not general auth"

patterns-established:
  - "Enum pattern: pgEnum with DO $$ BEGIN exception handling in migration"
  - "Auth config pattern: Export config, handlers, signIn, signOut, auth from auth.ts"

requirements-completed: [COMP-03, COMP-04]

# Metrics
duration: 3min
completed: 2026-04-03
---
# Phase 6 Plan 01: Profile Claims Schema & Auth.js v5 Foundation

**Database schema and Auth.js v5 setup for profile claim verification workflow - enables email or GitHub OAuth verification methods.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T08:02:01Z
- **Completed:** 2026-04-03T08:06:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Profile claims table schema with claim method/status enums
- Auth.js v5 with GitHub OAuth provider for profile verification
- Migration file with proper indexes for person_id and status
- Environment variable documentation for OAuth setup

## Task Commits

Each task was committed atomically:

1. **Task 1: Create profile_claims table schema** - `a634880` (feat)
2. **Task 2: Setup Auth.js v5 with GitHub provider** - `9ab4dbd` (feat)

## Files Created/Modified
- `packages/db/src/schema.ts` - Added claimMethod/claimStatus enums and profileClaims table
- `packages/db/src/migrations/0003_profile_claims.ts` - Migration with enum types, table, indexes
- `apps/web/src/lib/auth.ts` - Auth.js v5 config with GitHub provider, session/jwt callbacks
- `apps/web/src/app/api/auth/[...nextauth]/route.ts` - API route handler for OAuth flow
- `apps/web/.env.example` - Environment variables for AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, JWT_SECRET

## Decisions Made
- Migration numbered 0003 following existing TS migration pattern (0001, 0002)
- Auth.js v5 beta (5.0.0-beta.30) used for latest features and handler pattern
- GitHub OAuth configured for claim verification only per D-03 decision - users choose email OR GitHub, not both

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - straightforward schema and auth setup.

## User Setup Required

**External services require manual configuration.** See frontmatter `user_setup` in 6-01-PLAN.md for:
- GitHub OAuth App creation (Developer Settings -> OAuth Apps)
- Environment variables: AUTH_GITHUB_ID, AUTH_GITHUB_SECRET
- SMTP configuration for email verification (fallback: console.log for MVP testing)

## Next Phase Readiness
- Profile claims schema ready for verification workflow implementation
- Auth.js foundation ready for claim verification UI
- Migration needs to be run before claim functionality works: `pnpm drizzle-push` or equivalent

---
*Phase: 6-conversational-compliance-polish*
*Completed: 2026-04-03*