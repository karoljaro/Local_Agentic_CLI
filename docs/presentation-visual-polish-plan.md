# Presentation visual polish plan

Status: in progress (started 2026-07-13)

This document tracks the staged visual/interaction polish defined by
`codex-visual-polish-prompt.md`. The existing presentation architecture, controller, reducer, stream
buffer, engine contracts, commands, navigation, and approval semantics remain unchanged.

## Stage 1 — visual audit

No screenshot asset is present in the repository or attached in the available workspace context. The
audit therefore uses the current Ink components, interactive/render tests, and 24–80 column rendered
layouts as the source of truth.

### Hierarchy issues

- The composer is three ungrouped text rows. Its prompt marker is visible, but there is no surface edge
  separating history from editing, and help/metadata have nearly the same visual rhythm.
- `CommandMenu` is mounted above the composer, so it reads as transient transcript content instead of an
  autocomplete owned by the input.
- Command selection adds colour/bold and a marker but has no surface treatment; command name and
  description compete on one undifferentiated row.
- `SelectionScreen` puts keyboard help beside the title, then renders `/ query` as plain text. The filter
  does not read as a focused input, and list rows resemble raw terminal output.
- Model and session rows duplicate selected-marker/colour decisions inside their screen wrappers rather
  than receiving a single visual selection treatment.
- Approval is semantically correct but visually uses the same unbounded vertical flow as history. It
  needs a compact attention surface, stronger operation/resource hierarchy, and clearer selected/safe
  decision state.
- Active tool/waiting states are already compact and readable; only spacing/colour consistency is needed.

### Small shared visual vocabulary

Only three reusable primitives are justified:

1. `InputSurface` — a lightweight one-sided border, focus marker, and content slot used by the composer
   and selection filter.
2. `KeyHints` — consistently low-priority keyboard help with emphasized keys.
3. `SelectionRow` — one marker/background-independent selection pattern used by command, model, and
   session rows where practical.

This is not a theme or design system. Semantic colour rules stay local and small:

- cyan: keyboard focus and primary selection only;
- green: success/current/approve;
- yellow: tool activity and approval attention;
- red: errors/reject/destructive warning;
- gray/dim: help and metadata;
- inverse/background: selected interactive controls, always paired with a marker and bold text.

Inverse selection and named terminal colours are preferred over dark-theme-specific RGB surfaces so the
UI remains legible on light themes and limited palettes. Background is reserved for compact selected
controls and the approval label, not full-width panels.

### Stages and completion criteria

1. **Composer/dropdown** — input has a clear focus edge; menu is rendered immediately below it inside the
   composer; help and metadata are separate; slash/filter/empty/Tab/Escape/Enter behaviour is unchanged.
2. **Selection screens** — shared title/filter/list/help hierarchy, focused placeholder, consistent rows,
   loading/error/empty/submitting states, and bounded 24-column output.
3. **Approval** — compact attention edge/header, separated action/resource, unmistakable default Reject,
   responsive decisions, optional details, unchanged y/n/arrows/Enter/Escape/d behaviour.
4. **Consistency/verification** — active flow spacing checked; targeted interaction and narrow renders,
   full typecheck/tests/format/build pass; no controller/engine/reducer changes.

## Stage log

### Stage 1 — complete

- Audited composer, command menu, shared selection screen, model/resume rows, approval, active turn,
  transcript, and their render/interaction tests.
- Baseline: `bun run typecheck` pass; presentation tests 21 pass, 0 fail.
- Confirmed no screenshot asset is available locally; narrow and interactive Ink renders are the visual
  regression baseline.

### Stage 2 — composer and command dropdown complete

- Added `InputSurface`, `KeyHints`, and `SelectionRow` in one small shared component file.
- Composer now has a focused cyan one-sided edge, prompt marker, more legible italic placeholder, and a
  clear separation between input, key hints, and dimmed labelled metadata.
- `CommandMenu` moved from `ChatScreen` into `Composer`, immediately below `InputSurface`. It shares the
  same left edge, so it reads as autocomplete rather than transcript content.
- The selected command combines a `›` marker, bold name, and inverse surface. Descriptions remain lower
  priority and move below the command below 48 columns. Empty state and dropdown-specific key hints live
  inside the dropdown.
- Named colours/inverse rendering avoid assumptions about dark terminal backgrounds. No full-width RGB
  surface was introduced.

Verification after stage 2:

- composer hierarchy test at 60 columns: pass;
- composer/dropdown width test at 28 columns: pass;
- existing interactive slash-menu/model-screen test: pass;
- `bun run typecheck`: pass.

### Stage 3 — selection screens

Status: complete.

- `SelectionScreen` now owns the shared title -> filter -> options/status -> key-hints hierarchy.
- The filter uses `InputSurface` with a search marker, visible end cursor, screen-specific placeholder,
  and a muted state while loading/submitting.
- Options sit on a subtle left edge and every model/session uses `SelectionRow`: marker + bold + inverse
  selection, not colour alone.
- Keyboard help moved from the title to a dedicated low-priority footer. Loading, empty/no-match, error,
  secondary information, and submitting states remain inside the list surface.
- Model names retain priority over current/size/quantisation metadata; below 40 columns model metadata
  moves to an indented second line.
- Session id/current state occupies the first line; timestamp and prompt preview form an indented second
  level. The terminal-height viewport accounts for the estimated two-line session row.

Verification after stage 3:

- model/resume rendering, metadata and error test: pass;
- common hierarchy and maximum width at 30 columns: pass;
- loading and no-session state test: pass;
- interactive open/cancel test: pass;
- `bun run typecheck`: pass.

### Stage 4 — approval

Status: complete.

- Approval now has a compact double yellow attention edge and a small yellow/black `APPROVAL` label; the
  background is limited to the label instead of filling a theme-dependent full-width panel.
- Operation name and primary path/query/resource are separate from the low-priority `decision required`
  text.
- Decisions pair an empty/filled marker, shortcut, label, bold text, and semantic selected background:
  green Approve or red Reject. Reject remains the safe default.
- Decision boxes use wrapping with `flexShrink={0}`, so at 28 columns whole controls move to separate lines
  rather than breaking labels.
- Key hints use the shared visual language. Optional details have their own muted left edge and remain
  concise; file content, old/new text, large JSON, and diffs remain hidden by default.

Verification after stage 4:

- concise/default-safe approval render test at 28 columns: pass;
- no large old/new content in default output: pass;
- maximum rendered line width 28 columns: pass;
- `bun run typecheck`: pass.

### Stage 5 — consistency and final verification

Status: in progress.
