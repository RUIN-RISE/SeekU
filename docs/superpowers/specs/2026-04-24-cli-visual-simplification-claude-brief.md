# CLI Visual Simplification — Claude Code Frontend Brief

Date: 2026-04-24
Owner: Claude Code with `frontend-skill`
Surface: `apps/worker/src/cli`

## Problem

The current CLI is functionally stronger but visually noisy:

- The launcher shows header, context bar, task rows, local-cache/legacy labels, helper text, and command bar all at once.
- The mascot work is currently a text hint engine, so users do not perceive a visible mascot or coherent guide character.
- The command bar advertises slash commands, but the launcher has had mismatches such as `/help` rendering as invalid input.
- The overall look varies between banner, shell frame, shortlist, workboard, command palette, and prompts.

## Design Thesis

Make Seeku feel like a calm operator console:

- One visual anchor per screen.
- Progressive disclosure instead of permanent helper noise.
- Mascot as a subtle navigator, not a new panel.
- Commands are discoverable through `/help` and inline suggestions, not a long persistent footer.
- Legacy/cache/debug state is available but visually secondary.

## Recommended Direction

Claude Code should design a compact TUI system around three zones:

1. Header: one-line brand, stage, and selected task state.
2. Body: the primary decision list or current object only.
3. Footer: one short affordance line, preferably `Enter 继续 · /help 命令 · /new 新任务 · q 退出`.

Keep the shell frame only where it adds hierarchy. Avoid repeating context in both header and task rows.

## Mascot Treatment

Introduce a recognizable but lightweight mascot identity:

- Name: `Seeku`
- Glyph: `◖•ᴗ•◗` or another terminal-safe single-line glyph selected by Claude Code.
- Voice: concise, helpful, no emoji spam.
- Placement: one dim/cyan guide line under the header only when there is a useful nudge.
- Format example: `◖•ᴗ•◗ 选中任务后按 Enter 继续，或输入 /new 重新开始。`

Avoid large ASCII art, separate mascot panels, or repeated hints on every rerender.

## Launcher Simplification

Target launcher shape:

```text
Seeku CLI · 首页
◖•ᴗ•◗ 选中任务后按 Enter 继续，或 /new 新开搜索。

❯ [2] 杭州工程师                    推荐就绪 · 确认推荐
  [3] 在杭州的AI创业者              对比决策 · 继续对比
  [4] 找一个在杭州的浙大本科生       检索候选人 · 调整搜索条件

Enter 继续 · /new 新任务 · /help 命令 · q 退出
```

Defer or hide by default:

- `legacy session`
- `local cache`
- timestamps
- `attach <sessionId>`
- long command lists
- repeated stage/summary/next-action triplets

Show these only in `/help`, `/task`, `/workboard`, or a detail/debug mode.

## Slash Command Completion

Full raw-mode tab completion remains out of scope unless the raw-mode decision is reopened.

Recommended minimum viable behavior:

- Unknown slash command shows the nearest valid commands for the current stage.
- `/help` always works anywhere the footer advertises it.
- Bare `/` opens the command palette where supported.
- Command palette should be compact and grouped by intent, not a long flat list.

## Acceptance Criteria

- Launcher first screen has one primary list and one footer line.
- `/help` works from launcher and all advertised commands either work or are not shown.
- A mascot glyph/name is visibly present in at least the empty-home and launcher-with-tasks states.
- No screen repeats the same state in three places.
- Legacy/cache/timestamp metadata is hidden from default launcher rows.
- Existing CLI-focused tests and worker typecheck pass.

## Implementation Notes

Likely files:

- `apps/worker/src/cli/tui.ts`
- `apps/worker/src/cli/shell-renderer.ts`
- `apps/worker/src/cli/command-palette.ts`
- `apps/worker/src/cli/guide.ts`
- `apps/worker/src/cli/index.ts`
- `apps/worker/src/cli/__tests__/*`

Keep the work as a separate visual simplification batch after the launcher command bugfix batch.
