# ADR: Web Surface Shares CLI SearchWorkflow

**Date:** 2026-05-11
**Status:** Accepted

## Context

The web agent panel (`apps/api/src/routes/chat-mission.ts`) and the interactive CLI agent (`apps/worker/src/cli/workflow.ts`) both use the same `SearchWorkflow` class. The web drives it via HTTP + SSE through `AgentSessionBridge`; the CLI drives it via terminal I/O.

## Decision

This is intentional. The web is a thin presentation layer over the same search logic. We do not maintain a separate web-optimized search path.

## Consequences

- Quality improvements to SearchWorkflow benefit both surfaces automatically.
- No "fake agent mission" complexity — the web runs the real workflow, not a simplified version.
- A separate web-specific path will only be considered when web-specific UX requirements (faceted filtering, saved searches, collaborative shortlists) demand divergence that cannot be expressed through the existing workflow interface.
- If the web needs to become a primary surface, it should connect to the runtime/session ledger rather than implementing its own mission loop.
