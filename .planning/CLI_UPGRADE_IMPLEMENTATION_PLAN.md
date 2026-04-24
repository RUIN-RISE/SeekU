# Seeku CLI Frontend Upgrade — Implementation Plan

## Frozen Design Summary

### Input Protocol
- Default input = natural language
- `/` prefix = command
- Immediate commands: `/help` `/task` `/tasks` `/memory` `/quit`
- Other `/` commands → command router
- Home: natural language = new task, `/resume` = enter selected task

### Command System
- Organized by task stage, not by tool
- English main command + Chinese aliases
- Groups: Clarify / Search / Shortlist / Compare / Decide / Memory / Task / System
- Commands handle: view status, course-correct, force switch, shortcuts only

### Command Discovery
- Persistent medium-density bottom bar (5-7 commands)
- `/` opens command palette, grouped by stage, current stage on top
- Shortlist: `/` no longer triggers refine. `r` retains as refine alias

### Unified Shell
- 4-zone layout: header / body / context bar / input+bottom bar
- Header: task title + stage + status
- Context bar: always-visible compact workboard
- Workboard no longer hidden behind preview sub-command

### Launcher / Resume
- Flatten launcher → preview → resume/new double loop
- Launcher shows task list + selected item preview
- Submit-based selection, no real-time selection (no raw-mode in home yet)

### State Machine
- States: home / clarify / search / shortlist / detail / compare / decision
- blocked = overlay state, not separate page

### Mascot
- Role: quiet navigator (recruiter assistant)
- Appears at: home empty / blocked / first shortlist / decision complete
- One short actionable sentence, verb-first

### Architecture Constraint
- UI shell state and domain workflow state are separate layers
- Do not rewrite workflow.ts into global state machine early
- Keep enquirer for now; don't rush raw-mode migration

---

## Engineering Constraints (Frozen)

1. `parseCommand("/")` returns `{ kind: "palette" }`, not empty string sentinel
2. `promptLauncher()` returns structured action, does not execute workflow
3. Home phase: submit-based selection, no raw-mode
4. Shell renderer: single snapshot before prompt, no dynamic refresh during prompt
5. Memory: overlay wrapper first, don't change memory-command.ts internals

---

## Phase 1: command-spec / command-router

### Goal
Establish command declaration and parsing layers. Pure additive, zero existing file changes.

### Files

| Action | Path |
|--------|------|
| Create | `apps/worker/src/cli/command-spec.ts` |
| Create | `apps/worker/src/cli/command-router.ts` |
| Create | `apps/worker/src/cli/__tests__/command-spec.test.ts` |
| Create | `apps/worker/src/cli/__tests__/command-router.test.ts` |
| None | All existing files unchanged |

### Tasks

**1.1 Create command-spec.ts**
- Define `CliStage` type: `"home" | "clarify" | "search" | "shortlist" | "detail" | "compare" | "decision" | "global"`
- Define `SeekuCommand` interface: `{ name, aliases, description, stages, immediate?, argumentHint? }`
- Register all commands as `ALL_COMMANDS` constant (data source: extract from tui.ts if/else blocks)
  - Stage commands: refine(r), compare(c), sort(s), export(e), back(b)
  - Task commands: resume, new, task, tasks, transcript
  - System commands: help(?), memory(m), quit(q/exit)
- Export `getCommandsForStage(stage)`, `getImmediateCommands()`, `findCommand(name)`

**1.2 Create command-router.ts**
- Define discriminated union:
  ```typescript
  type ParsedCommand =
    | { kind: "palette" }                           // just "/"
    | { kind: "command"; name: string; args: string } // /xxx [args]
    | null;                                          // natural language
  ```
- Implement `parseCommand(input: string): ParsedCommand`
  - `"/"` → `{ kind: "palette" }`
  - `"/refine"` → `{ kind: "command", name: "refine", args: "" }`
  - `"/refine add location"` → `{ kind: "command", name: "refine", args: "add location" }`
  - `"find AI engineers"` → `null`
- Implement `isImmediateCommand(parsed: ParsedCommand): boolean`

**1.3 Create command-spec.test.ts** (~12 tests)
- ALL_COMMANDS non-empty, each name unique
- `getCommandsForStage("shortlist")` includes refine/compare/sort/export
- `getCommandsForStage("home")` includes resume/new
- `getCommandsForStage("compare")` includes back/refine
- `getImmediateCommands()` = { help, task, tasks, memory, quit }
- `findCommand("r")` finds refine via alias
- `findCommand("unknown")` returns undefined

**1.4 Create command-router.test.ts** (~8 tests)
- `parseCommand("/")` → `{ kind: "palette" }`
- `parseCommand("/refine")` → `{ kind: "command", name: "refine", args: "" }`
- `parseCommand("/refine  add conditions")` → `{ kind: "command", name: "refine", args: "add conditions" }`
- `parseCommand("find Hangzhou engineers")` → `null`
- `parseCommand("")` → `null`
- `isImmediateCommand(parseCommand("/help"))` → true
- `parseCommand("/unknown")` → `{ kind: "command", name: "unknown", args: "" }`

**1.5 Verify**: typecheck + full test suite passes with zero changes to existing tests

### Rollback
Delete 4 new files. Zero impact.

---

## Phase 2: shell-renderer (static snapshot before prompt)

### Goal
Non-shortlist stages render header + context bar + bottom bar before enquirer prompt. Single snapshot, no dynamic refresh during prompt.

### Files

| Action | Path |
|--------|------|
| Create | `apps/worker/src/cli/shell-renderer.ts` |
| Create | `apps/worker/src/cli/__tests__/shell-renderer.test.ts` |
| Modify | `apps/worker/src/cli/workboard-view-model.ts` — add `toContextBar()` |
| Modify | `apps/worker/src/cli/tui.ts` — call shell renderer before prompts |
| None | index.ts, workflow.ts, resume-resolver.ts, resume-panel-types.ts |

### Tasks

**2.0 Technical spike**: Write a 20-line script to verify that console.log output before enquirer prompt is not overwritten. Determine render timing.

**2.1 Add `toContextBar()` to workboard-view-model.ts**
```typescript
interface ContextBarData {
  stageLabel: string;
  summary: string;
  nextActionTitle: string;
  blocked: boolean;
  blockerLabel?: string;
}

function toContextBar(viewModel: WorkboardViewModel): ContextBarData
```
Extract compact data from existing WorkboardViewModel. No new business logic.

**2.2 Create shell-renderer.ts**
```typescript
class ShellRenderer {
  renderHeader(args: {
    taskTitle?: string;
    stage: CliStage;
    status?: string;       // "可继续" | "只读" | "阻塞"
    guideHint?: string;    // placeholder for Phase 8 mascot
  }): void

  renderContextBar(data: ContextBarData): void

  renderInputBar(stage: CliStage): void
  // Fetches from command-spec getCommandsForStage(stage)
  // Renders one line of 5-7 command hints

  renderShell(args: RenderArgs): void
  // clearScreen + renderHeader + renderContextBar + renderInputBar
}
```

Rendered layout:
```
┌ Seeku CLI ─ 找 AI 工程师 ─ 短名单就绪 ─ 可继续 ────┐
│ 当前任务: 找 AI 工程师    摘要: 已形成 3 人短名单     │
├─────────────────────────────────────────────────────┤
│ (body: rendered by each stage)                       │
├─────────────────────────────────────────────────────┤
│ 阶段: 短名单就绪  下一步: 对比候选人  阻塞: 无       │
├─────────────────────────────────────────────────────┤
│ /refine 调整  /compare 对比  /sort 排序  /task 状态  │
└─────────────────────────────────────────────────────┘
```

**2.3 Modify tui.ts — add shell renderer calls**

Pattern for each non-shortlist prompt method:
```typescript
async promptClarifyAction(taskContext: TaskContext): Promise<ClarifyAction> {
  this.shellRenderer.renderShell({ ...taskContext, stage: "clarify" });  // new
  const raw = await this.promptLine(">", "1");                           // unchanged
  // ... existing if/else unchanged
}
```

Modified methods:
- `promptClarifyAction()`
- `promptCompareAction()`
- `promptDetailAction()`
- `promptResumableAction()`
- `promptReadOnlyAction()`

NOT modified:
- `promptShortlistHotkeys()` — already raw mode
- `displayShortlist()` / `displayCompare()` — body content, not shell

**2.4 Create shell-renderer.test.ts** (~8 tests)
- renderHeader contains task title, stage name
- renderHeader without taskTitle doesn't crash
- renderContextBar contains stage, summary, next action
- renderContextBar with blocked=true contains blocker label
- renderInputBar("shortlist") contains refine/compare/sort
- renderInputBar("home") contains resume/new
- renderShell outputs complete (header + context bar + input bar)

**2.5 Verify**: typecheck + full test suite + visual check

### Rollback
Comment out `this.shellRenderer.renderShell(...)` calls in tui.ts. ShellRenderer console.log is idempotent.

---

## Phase 3: launcher flatten (submit-based selection)

### Goal
Single-layer launcher interaction. Default preview top-ranked item. Remove preview sub-loop. Preserve B7 memoryStore/workItemStore/workItemId passing chain.

### Files

| Action | Path |
|--------|------|
| Modify | `apps/worker/src/cli/index.ts` — rewrite promptLauncher, flatten flow |
| Modify | `apps/worker/src/cli/tui.ts` — add displayLauncherV2 |
| Create | `apps/worker/src/cli/__tests__/launcher-v2.test.ts` |
| Deprecate | `presentRecordPreview()`, `presentRestoredSession()` — keep bodies |
| None | workflow.ts, resume-resolver.ts, resume-panel-types.ts |

### Tasks

**3.0 Add resume chain tests in index.test.ts** (before refactoring)
- Test buildWorkflowFromRecord receives memoryStore/workItemStore/workItemId
- Test new SearchWorkflow receives memoryStore/workItemStore
- Verify these pass on current code first

**3.1 Add displayLauncherV2 to tui.ts**
```typescript
interface LauncherDisplayOptions {
  items: TaskResumeItem[];
  defaultSelection: TaskResumeItem;
  contextBar: ContextBarData;
}

displayLauncherV2(options: LauncherDisplayOptions): void
```
Renders: shell header + task list + selected item context bar + bottom bar.

**3.2 Rewrite promptLauncher in index.ts**

Returns structured action, does NOT execute workflow:
```typescript
type LauncherAction =
  | { type: "resume_selected_task"; sessionId: string }
  | { type: "create_new_task"; initialPrompt?: string }
  | { type: "show_selected_task"; sessionId: string }
  | { type: "open_memory" }
  | { type: "quit" };
```

Input routing:
- Natural language → `{ type: "create_new_task", initialPrompt: raw }`
- `/resume` → `{ type: "resume_selected_task", sessionId: defaultItem.sessionId }`
- `/new` → `{ type: "create_new_task" }`
- `/task` → `{ type: "show_selected_task", sessionId: defaultItem.sessionId }`
- `/memory` → `{ type: "open_memory" }`
- `/quit` → `{ type: "quit" }`
- Number N → resume item N

Top-level orchestrator handles actions (preserves B7 passing chain):
```typescript
switch (action.type) {
  case "resume_selected_task": {
    const record = await ledger.load(action.sessionId);
    const workflow = buildWorkflowFromRecord({ db, llmProvider, record, memoryStore, workItemStore });
    await runWorkflowSession({ workflow, ledger });
    break;
  }
  case "create_new_task": {
    const workflow = new SearchWorkflow(db, llmProvider, { memoryStore, workItemStore });
    await runWorkflowSession({ workflow, ledger, initialPrompt: action.initialPrompt });
    break;
  }
  case "show_selected_task": {
    const record = await ledger.load(action.sessionId);
    // Render full workboard, then return to launcher
    break;
  }
  // ...
}
```

**3.3 Mark old functions @deprecated**
Add `/** @deprecated Phase 3 — replaced by flat launcher */` to `presentRecordPreview()` and `presentRestoredSession()`. Keep function bodies intact.

**3.4 Create launcher-v2.test.ts** (~8 tests)
- Natural language input → `{ type: "create_new_task", initialPrompt: "..." }`
- `/resume` → `{ type: "resume_selected_task", sessionId: "..." }`
- `/new` → `{ type: "create_new_task" }`
- `/task` → `{ type: "show_selected_task", sessionId: "..." }`
- `/memory` → `{ type: "open_memory" }`
- `/quit` → `{ type: "quit" }`
- Number `1` → resume top-ranked item
- Empty items → `{ type: "create_new_task" }`

**3.5 Verify**: typecheck + full test suite. Step 3.0 tests must still pass.

### Rollback
Old functions preserved. Flag switch to use old launcher path.

---

## Phase 4: `/` command entry + minimal command palette

### Goal
All stages recognize `/` prefix commands. Shortlist `/` changes from refine to command entry. Minimal static command palette.

### Files

| Action | Path |
|--------|------|
| Modify | `apps/worker/src/cli/command-router.ts` — add routeCommand |
| Modify | `apps/worker/src/cli/tui.ts` — promptXxx add `/` interception |
| Modify | `apps/worker/src/cli/tui.ts` — shortlist `/` key behavior change |
| Create | `apps/worker/src/cli/command-palette.ts` |
| Create | `apps/worker/src/cli/__tests__/command-palette.test.ts` |
| None | index.ts (already refactored in Phase 3) |

### Tasks

**4.1 Add routeCommand to command-router.ts**
```typescript
type CommandAction =
  | { type: "immediate"; command: string }
  | { type: "stage"; command: string; args: string }
  | { type: "unknown"; name: string };

routeCommand(parsed: { kind: "command"; name: string; args: string }, stage: CliStage): CommandAction
```

**4.2 Add `/` interception to non-shortlist prompt methods in tui.ts**

```typescript
async promptClarifyAction(ctx: TaskContext): Promise<ClarifyAction | CommandAction> {
  this.shellRenderer.renderShell({ ...ctx, stage: "clarify" });
  const raw = await this.promptLine(">", "1");

  const parsed = parseCommand(raw);
  if (parsed) {
    if (parsed.kind === "palette") return { type: "immediate", command: "help" };
    return routeCommand(parsed, "clarify");
  }

  // existing if/else unchanged
}
```

Apply same pattern to: promptCompareAction, promptDetailAction, promptResumableAction, promptReadOnlyAction.

**4.3 Change shortlist `/` key behavior in tui.ts**

At `tui.ts` line ~981:
- Old: `str === "/"` triggers refine
- New: `str === "/"` triggers `enterLineMode("/", "", ...)` for command input
- `key.name === "r"` retains refine alias
- First time `/` pressed: show one-time migration hint

**4.4 Create command-palette.ts**
```typescript
renderPalette(stage: CliStage): void
// Fetch from getCommandsForStage(stage)
// Current stage commands on top
// Render as console.log lines
```

**4.5 Create command-palette.test.ts** (~4 tests)
- renderPalette("shortlist") contains current-stage commands
- renderPalette("shortlist") current-stage before system commands
- renderPalette("home") contains resume/new

**4.6 Update tui.test.ts**
- New: shortlist `/` no longer triggers refine
- New: `r` still triggers refine

**4.7 Verify**: typecheck + full test suite

### Rollback
Shortlist `/` behavior via constant: `const SLASH_TRIGGERS_REFINE = false`. Set `true` to restore.

---

## Phase 5: memory overlay wrapper

### Goal
`/memory` becomes overlay that returns to previous stage, instead of exiting CLI.

### Files

| Action | Path |
|--------|------|
| Modify | `apps/worker/src/cli/index.ts` — `/memory` routing to overlay wrapper |
| None | `memory-command.ts` internals unchanged |

### Tasks

**5.1 Add overlay wrapper in index.ts**
```typescript
async function runMemoryOverlay(memoryStore: UserMemoryStore, ui: TerminalUI): Promise<void> {
  const enquirer = await import("enquirer");
  const { Input } = enquirer.default as unknown as { Input: any };
  await runMemoryManagementSession(memoryStore, async (prompt) => {
    const input = new Input({ message: prompt });
    const result = await input.run();
    return result?.trim() || null;
  });
  // Caller re-renders shell after return
}
```

Wire into orchestrator:
```typescript
case "open_memory":
  await runMemoryOverlay(memoryStore, ui);
  // Re-render current shell state
  break;
```

**5.2 Add test in index.test.ts**
- Memory overlay enters/exits, control flow continues

### Rollback
Flag switch: overlay mode vs standalone session mode.

---

## Phase 6: Evaluate unified raw-mode

**Status:** Completed — decision documented in `.planning/PHASE_6_RAW_MODE_EVALUATION.md`.

### Goal
Assess whether compare/detail/clarify stages should migrate from enquirer to raw-mode.

### Output
Evaluation document:
- Current enquirer + `/` command interception experience gaps
- Raw-mode migration engineering cost (line editing, paste, multi-byte, history, cursor)
- Comparison with Claude Code's Ink rendering layer
- Decision: proceed / skip / partial

### Files
No code changes. Evaluation only.

### Decision

Skip full raw-mode migration. Current enquirer prompts plus `/` command interception satisfy the primary UX need, while custom raw-mode line editing adds disproportionate multi-byte and cross-terminal risk.

---

## Phase 7: workflow/domain state machine (conditional)

**Status:** Skipped — Phase 6 did not recommend raw-mode migration.

### Prerequisite
Only if Phase 6 proves necessary.

### Output
Evaluation document + decision. No pre-commitment.

---

## Phase 8: mascot + visual polish

**Status:** Next after the staged command-surface hardening batch is reviewed/committed.

### Goal
Mascot integration + command palette enhancement + visual consistency.

### Files

| Action | Path |
|--------|------|
| Create | `apps/worker/src/cli/guide.ts` |
| Modify | `apps/worker/src/cli/shell-renderer.ts` — integrate guide into header |
| Modify | `apps/worker/src/cli/command-palette.ts` — enhanced interaction |

### Tasks

**8.1 Create guide.ts**
```typescript
type GuideTrigger = "home_empty" | "blocked" | "first_shortlist" | "decision_complete";

interface GuideHint {
  text: string;
  trigger: GuideTrigger;
}

function getGuideHint(trigger: GuideTrigger, context?: {
  blockerLabel?: string;
  candidateName?: string;
}): GuideHint | null
```

Copy:
- home_empty: "还没有进行中的任务。输入需求开始搜索。"
- blocked: dynamic based on blockerLabel
- first_shortlist: "↑↓ 移动，Enter 详情，space 加对比池。"
- decision_complete: "已推荐 {name}。/export 导出，/new 新任务。"

**8.2 Integrate into shell-renderer**
`renderHeader()` accepts optional `guideHint` parameter. Displays at header right or below.

**8.3 Enhance command palette**
- Up/down arrow selection
- Enter to confirm
- Esc to close
- Current-stage commands highlighted

**8.4 Visual consistency review**
- Border/alignment/color consistent across all stages
- Chinese/English label style unified
- Bottom bar density ≤ 7 commands

### Rollback
Guide hint passed as `null` suppresses display. Palette falls back to static list.

---

## Must-Preserve Tests

| File | Count | Why |
|------|-------|-----|
| `resume-resolver.test.ts` | 32 | Ranking/sorting/async integration, untouched by Phase 1-4 |
| `workboard-view-model.test.ts` | 23 | Pure functions, all stages depend on these |
| `tui.test.ts` | 29 | Existing render tests, Phase 2 only adds calls |
| `index.test.ts` | 5+ | Workflow session persistence + B7 passing chain |
| `next-best-action.test.ts` | ~10 | B3 pure functions, all stages depend on these |

## Critical Regression Paths

1. **Resume full chain**: launcher select → resume → execute → interrupt → re-resume. Involves index.ts + workflow.ts + session-ledger.ts. Most likely to break in Phase 3.
2. **Shortlist `/` key**: behavior change in Phase 4. Must verify `r` still triggers refine.
3. **B7 passing chain**: memoryStore/workItemStore/workItemId in buildWorkflowFromRecord. Must have explicit test in Phase 3.

## Phase Dependencies

```
Phase 1 → Phase 2 (shell renderer needs command-spec for bottom bar)
Phase 2 → Phase 3 (launcher needs shell renderer for context bar)
Phase 3 → Phase 4 (launcher flattened before adding / interception in task shell)
Phase 4 → Phase 5 (memory overlay needs / command routing)
Phase 5 → Phase 8 (mascot needs complete shell)
Phase 6, 7: independent evaluation, no code dependency
```
