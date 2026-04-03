---
phase: 6-conversational-compliance-polish
plan: 02
subsystem: web-ui
tags:
  - conversational-repl
  - chat-interface
  - search-refinement
  - react-hooks
requires:
  - apps/api/src/routes/search.ts
provides:
  - apps/web/src/app/chat/page.tsx
  - apps/web/src/components/ChatInterface.tsx
  - apps/web/src/lib/chat-session.ts
affects:
  - apps/web/src/components/Header.tsx
tech-stack:
  added:
    - "@seeku/llm workspace dependency"
    - "@testing-library/react + jsdom for testing"
    - "vitest jsdom environment configuration"
  patterns:
    - "TDD with vitest + React Testing Library"
    - "localStorage persistence for chat session"
    - "LLM condition extraction with Zod validation"
key-files:
  created:
    - apps/web/src/lib/chat-session.ts
    - apps/web/src/hooks/useChatSession.ts
    - apps/web/src/components/ChatMessage.tsx
    - apps/web/src/components/ChatInterface.tsx
    - apps/web/src/app/chat/page.tsx
    - apps/web/src/lib/__tests__/chat-session.test.ts
    - apps/web/src/hooks/__tests__/useChatSession.test.ts
  modified:
    - apps/web/src/components/Header.tsx
    - vitest.config.ts
    - apps/web/package.json
decisions:
  - "Adapt CLI ChatInterface patterns for React/Next.js context"
  - "Use localStorage for session persistence (start simple)"
  - "Reuse CLI LLM condition extraction logic with Zod validation"
  - "Embed mini ResultCards in assistant messages for search results"
metrics:
  duration: "18 minutes"
  completed_date: "2026-04-03T16:20:00Z"
  task_count: 3
  file_count: 9
  test_count: 24
---

# Phase 6 Plan 02: Conversational REPL Interface Summary

## One-liner

Conversational REPL interface for search refinement with LLM condition extraction, React hooks for session management, and embedded search results in chat flow.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Create chat session state management | e35517c, 4c0f88c | chat-session.ts, useChatSession.ts, __tests__ |
| 2 | Create ChatInterface and ChatMessage components | 33e9e5a | ChatInterface.tsx, ChatMessage.tsx |
| 3 | Create /chat page route | 303cf6e | chat/page.tsx, Header.tsx |

## Key Decisions

1. **Adapt CLI patterns for Web**: Reused CLI ChatInterface LLM condition extraction logic with Zod validation, adapted for React context with localStorage persistence.

2. **localStorage first**: Started with localStorage for session persistence (per research recommendation), deferring more complex storage solutions.

3. **Embedded search results**: Mini ResultCards embedded directly in assistant messages, allowing users to see results inline within the conversation flow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Missing test dependencies**
- **Found during:** Task 1 TDD execution
- **Issue:** @testing-library/react and jsdom not installed in web app
- **Fix:** Added dependencies with `pnpm add -D @testing-library/react jsdom --filter @seeku/web`
- **Files modified:** apps/web/package.json
- **Commit:** e35517c

**2. [Rule 3 - Blocking Issue] TypeScript module resolution**
- **Found during:** Task 1 TypeScript check
- **Issue:** vitest couldn't resolve @/ path aliases and @seeku/llm package
- **Fix:** Updated vitest.config.ts with path aliases and added @seeku/llm workspace dependency
- **Files modified:** vitest.config.ts, apps/web/package.json
- **Commit:** e35517c, 4c0f88c

**3. [Rule 1 - Bug] CandidateAnchor type mismatch**
- **Found during:** Task 1 TypeScript check
- **Issue:** Zod transform output had `number | null` but SearchCandidateAnchor expects `number | undefined`
- **Fix:** Updated CandidateAnchorSchema transform and normalizeCandidateAnchor signature to accept nullable values
- **Files modified:** apps/web/src/lib/chat-session.ts
- **Commit:** 4c0f88c

## Test Coverage

- **24 tests passing** across chat-session.test.ts and useChatSession.test.ts
- Tests cover: condition extraction, revision, session persistence, localStorage, message handling

## Files Created/Modified

### Created (7 files)
- `apps/web/src/lib/chat-session.ts` - WebChatSession class with LLM condition extraction
- `apps/web/src/hooks/useChatSession.ts` - React hook with sendMessage, reset, localStorage persistence
- `apps/web/src/components/ChatMessage.tsx` - User/assistant/tool message rendering
- `apps/web/src/components/ChatInterface.tsx` - Full chat UI with message list + input
- `apps/web/src/app/chat/page.tsx` - /chat page route
- `apps/web/src/lib/__tests__/chat-session.test.ts` - 11 tests
- `apps/web/src/hooks/__tests__/useChatSession.test.ts` - 13 tests

### Modified (3 files)
- `apps/web/src/components/Header.tsx` - Added /chat navigation link
- `vitest.config.ts` - Added path aliases + jsdom environment
- `apps/web/package.json` - Added @seeku/llm, zod, @testing-library/react, jsdom

## Verification

- All 24 tests pass
- TypeScript compilation passes
- Files exist and contain expected exports

## Self-Check: PASSED

All created files exist, all commits present in git log.