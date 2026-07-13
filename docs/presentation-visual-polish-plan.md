# Presentation visual polish plan

Status: complete (2026-07-13)

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

- cyan: keyboard focus, primary selection, and the existing `You` identity marker;
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
- Named colours/inverse rendering avoid assumptions about dark terminal backgrounds. A later focused
  composer refinement adds one deliberately bounded RGB work surface; see the follow-up section below.

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

Status: complete.

- Removed the redundant bottom margin from the active streaming response; Markdown spacing plus the
  composer's own separator now provide one calmer transition instead of stacked blank space.
- Existing `You`, `Assistant`, and `Tool` markers, stream buffer, waiting animation, active-tool content,
  focus ownership, command behaviour, and approval semantics were retained.
- Added full chat render coverage at 24 columns and tool -> approval -> paused composer coverage at 30
  columns. History, live response, interactive surfaces, help, and metadata remain within width.
- Confirmed `src/App.tsx` remains the unchanged 80-line orchestrator. No controller, engine, durable event,
  reducer, stream-buffer, navigation, or command-effect file changed.

Final changed production components:

- `components/Interactive.tsx` (new small shared primitives);
- `input/Composer.tsx`;
- `input/CommandMenu.tsx`;
- `components/SelectionScreen.tsx`;
- `screens/ModelScreen.tsx`;
- `screens/ResumeScreen.tsx`;
- `approval/ApprovalView.tsx`;
- `chat/ChatScreen.tsx` (dropdown placement only);
- `chat/LiveTurn.tsx` (one spacing adjustment).

Final verification:

- `bun run format:check`: pass, 128 files;
- `bun run typecheck`: pass;
- `bun test`: **191 pass, 0 fail**, 394 assertions across 40 files;
- forced Biome JavaScript lint over `src/App.tsx` and `src/presentation`: pass. The two informational
  bracket-access suggestions predate this polish and are required by TypeScript's
  `noPropertyAccessFromIndexSignature`; Markdown AST index-key warnings remain explicitly skipped;
- `bun run build`: pass for Linux and Windows artifacts;
- `bun run smoke:build`: pass;
- `git diff --check`: pass;
- narrow renders: chat 24, composer/dropdown 28, approval 28, selection screen 30 columns — pass;
- interactive slash menu -> model screen -> Escape -> preserved chat — pass.

Terminal-dependent limitations:

- Inverse video and named ANSI colours follow the user's terminal palette, intentionally avoiding a
  hardcoded dark theme. On monochrome/limited palettes, markers, one-sided edges, filled/empty decision
  glyphs, and bold text still carry state.
- Background colour is deliberately limited to selected controls and the compact approval label. It does
  not form artificial full-width rectangles, so resize cannot leave a padded colour block behind.
- Unicode line/marker glyph appearance depends on the terminal font. Windows Terminal and contemporary
  Linux terminals support the used characters; an older font may substitute visually equivalent glyphs.
- No screenshot asset was available for pixel-by-pixel comparison; verification used real Ink rendering,
  interactive input streams, and bounded terminal widths.

All five visual-polish stages and acceptance criteria are complete. Architecture and behaviour remain
intact.

## Focused composer refinement — 2026-07-13

The follow-up request intentionally changes only the composer, its hints/metadata, and slash dropdown:

- Input and command autocomplete now share one full-width work surface inside the composer. Focused input
  uses `#30363d`; paused/unfocused input uses the quieter `#24272b`.
- The input keeps its cyan focus edge and marker. Non-empty focused input text uses explicit `#f0f6fc`,
  while the placeholder uses `#c9d1d9`, for predictable contrast on the controlled surface.
- Dropdown inherits the same surface without continuing the input's cyan focus edge. Its list and hints
  use regular horizontal padding, so the shared background—not a frame fragment—connects it to the input.
- Active command uses cyan background across its complete row, including the `›` marker, with black
  marker/name/description text. Only the name is bold; the description explicitly disables bold and no
  nested active text uses `dimColor`. The optional accent variant was added to `SelectionRow`;
  model/resume retain their existing inverse variant unchanged.
- Dropdown command names use `#f0f6fc`; inactive descriptions and dropdown help use `#b1bac4`.
  Composer action hints use `#8b949e`, and labelled model/cwd/session metadata uses `#7d8590` outside
  the surface. None of these levels relies on `dimColor` for contrast.
- The input has its own native Ink surface with `height={3}` and `alignItems="center"`. Its marker,
  cursor, and text stay in the middle row, with one full-background breathing row above and below;
  no padding is added to the input value.
- Empty focused input renders one presentation-only cell between its inverse cursor cell and placeholder
  (`› █ Ask about this workspace…`). Entered values are rendered unchanged.
- Expanded autocomplete adds one internal bottom-padding row after its keyboard hints. Because the
  padding belongs to `CommandMenu`, the closed composer keeps its previous height.
- The surface uses real Ink width/background layout rather than padding with manual spaces, so resize and
  dropdown close redraw cleanly.

Follow-up verification:

- empty focused input and entered text cursor rendering: pass;
- active and inactive slash-command contrast paths: pass;
- identical three-row input surface when the dropdown is closed or open at 60 and 28 columns: pass;
- input-only vertical focus edge with an unframed dropdown at 60 and 28 columns: pass;
- targeted composer, chat-flow, App interaction, and selection-screen regressions: pass;
- narrow composer/dropdown at 28 columns: pass;
- `bun run format:check`: pass, 128 files;
- `bun run typecheck`: pass;
- `bun test`: **195 pass, 0 fail**, 431 assertions;
- forced Biome lint over the four touched composer files: pass;
- `bun run build` and `bun run smoke:build`: pass.

No selection-screen layout, controller, reducer, engine, stream, navigation, or command behaviour changed.
