# Phase 6: Unified Raw-Mode Evaluation

## Executive Summary

**Decision: SKIP full raw-mode migration for compare/detail/clarify stages.**

Current enquirer + `/` command interception provides sufficient UX. Raw-mode migration cost outweighs benefits given project constraints.

---

## Current State Analysis

### Enquirer-Based Prompts

| Stage | Prompt Method | Input Type | `/` Interception |
|-------|---------------|------------|------------------|
| Clarify | `chat.askFreeform()` inside `SearchWorkflow.runClarifyLoop()` | Single-line text | ✅ Workflow-level command interception |
| Compare | `promptCompareAction()` | Single-line text | ✅ Routes to command router |
| Detail | `promptDetailAction()` | Single-line text | ✅ Routes to command router |
| Shortlist | `promptShortlistHotkeys()` | Raw-mode keypress | N/A (already raw) |
| Launcher | `promptResumePanelChoice()` | Single-line text | ✅ Routes via `parseLauncherAction()` |

### Experience Gaps Identified

1. **No line editing**: Backspace works, but no cursor movement (←→), no word delete (Ctrl+W)
2. **No history**: Up/down arrow doesn't cycle through previous inputs
3. **Paste behavior**: Multi-line paste truncates to first line
4. **Multi-byte input**: Chinese IME composition works but no visual feedback during composition
5. **No tab completion**: Cannot tab-complete command names

### Current Mitigations

- `/` prefix provides command access without memorizing hotkeys
- Command palette (`/` then Enter) shows available commands
- Shortlist already uses raw-mode for hotkey navigation (↑↓ Enter Space)
- Natural language input works correctly for task creation

---

## Raw-Mode Migration Engineering Cost

### Required Components

| Component | Estimated Lines | Complexity | Risk |
|-----------|-----------------|------------|------|
| Line editor with cursor | ~200 | High | Multi-byte cursor positioning |
| History buffer | ~50 | Low | Memory management |
| Paste handler | ~30 | Medium | Large paste performance |
| IME composition state | ~80 | High | Platform-specific behavior |
| Tab completion | ~40 | Low | Command name lookup |
| **Total** | **~400** | **High** | **Multi-byte + cross-platform** |

### Reference: Claude Code's Ink Layer

Claude Code uses [Ink](https://github.com/vadimdemedes/ink) (React for CLI) for rendering:
- Declarative UI components
- Built-in `<TextInput>` with cursor, editing, validation
- Cross-platform key handling via `useInput()` hook
- ~1500 lines of Ink-based UI code in Claude Code

**Migration to Ink would require:**
- Rewrite all prompt methods as Ink components
- Replace enquirer dependency
- New test infrastructure (Ink testing utilities)
- Estimated: 2-3 weeks engineering time

### Alternative: Custom Raw-Mode Implementation

Building raw-mode from scratch (like shortlist does):
- Reuse existing `promptShortlistHotkeys()` patterns
- Add line editing layer
- Handle multi-byte cursor positioning manually
- Estimated: 1 week engineering time
- Risk: Edge cases in IME, paste, terminal compatibility

---

## Comparison Matrix

| Criterion | Current (Enquirer) | Raw-Mode Custom | Ink Migration |
|-----------|-------------------|-----------------|---------------|
| Line editing | ❌ Backspace only | ✅ Full | ✅ Full |
| History | ❌ None | ✅ Up/down | ✅ Up/down |
| Paste | ⚠️ Truncates | ✅ Full | ✅ Full |
| IME support | ⚠️ Works, no feedback | ⚠️ Complex | ✅ Built-in |
| Tab completion | ❌ None | ✅ Possible | ✅ Built-in |
| Engineering cost | — | 1 week | 2-3 weeks |
| Maintenance | Low | High | Medium |
| Test stability | High | Medium | Medium |
| Cross-platform | ✅ Enquirer handles | ⚠️ Manual | ✅ Ink handles |

---

## Decision Rationale

### Why SKIP

1. **Marginal UX improvement**: The primary user flow is:
   - Natural language input (works)
   - Command invocation via `/` (works)
   - Shortlist navigation (already raw-mode)
   
   Line editing and history are nice-to-have, not blockers.

2. **High engineering cost**: 1-3 weeks for features used in ~10% of interactions.

3. **Risk profile**: Multi-byte cursor positioning has subtle bugs across terminals (iTerm2, Windows Terminal, VS Code terminal). Shortlist raw-mode works because it's single-key navigation, not line editing.

4. **Project phase**: CLI upgrade phases 1-5 deliver core value (command system, launcher, memory overlay). Raw-mode is polish, not foundation.

5. **Alternative path**: If raw-mode becomes critical later, migrate to Ink (better long-term maintainability than custom implementation).

### What We Keep

- Shortlist remains raw-mode (already working)
- Enquirer for clarify/compare/detail/launcher
- `/` command interception (Phase 4)
- Command palette (Phase 4)
- Phase 7 remains skipped because raw-mode migration is not recommended

### Future Trigger Conditions

Re-evaluate if:
- User feedback specifically requests line editing/history
- Enquirer becomes unmaintained
- Project adopts Ink for other CLI tools

---

## Recommendations

### Immediate (Phase 6)

1. **Document current behavior**: Add user-facing docs explaining `/` command system
2. **Accept enquirer limitations**: No code changes
3. **Proceed to Phase 8**: Mascot + visual polish

### Future (Post-Launch)

1. **Monitor user feedback**: Track requests for line editing/history
2. **Evaluate Ink adoption**: If other Seeku tools need CLI, consider shared Ink layer
3. **Benchmark competitor CLIs**: Compare UX with similar tools

---

## Appendix: Shortlist Raw-Mode Reference

Current shortlist raw-mode implementation (`tui.ts` lines ~900-1150):

```typescript
// Key patterns used:
// - key.name === "up" / "down" → navigation
// - key.name === "return" → select
// - key.name === "space" → toggle pool
// - str === "/" → enter line mode for commands
// - key.ctrl && key.name === "c" → abort

// Line mode for commands:
enterLineMode(prompt: string, initial: string, handler: (raw: string) => ResultListCommand)
```

This pattern works for single-key navigation but would need significant extension for line editing.

---

## Conclusion

**Phase 6 Decision: SKIP raw-mode migration.**

Proceed to Phase 8 (mascot + visual polish) with current enquirer-based prompts.

The `/` command system (Phase 4) already addresses the primary UX gap (command discoverability). Raw-mode would address secondary gaps (line editing) at disproportionate cost.
