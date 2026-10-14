# Phase 21 — UI Interaction, Clipboard and Feedback

## Baseline

- HEAD: `6dd9fea2d7dead3ad01e13a3680b241d8d7696d7`.
- Worktree clean before this phase; no unrelated changes to preserve.
- No applicable `AGENTS.md` in the repository or its ancestors.
- Phase 20 is complete; Phase 19 remains closed. No commits, inference, provider
  qualification, model/tool protocol changes, dependencies or broad UI redesign.
- Installed OpenTUI Core: `0.5.14`; inspected installed types and bundled sources,
  including native selection, text buffers, clipboard services and keyboard parsing.

## Integration points and decisions

- `TerminalApp` owns renderables, key routing, modal focus and shutdown;
  `Conversation` already fences turns/session changes and consumes durable events.
- Reuse renderer selection and native text-buffer extraction/highlighting. Keep
  clipboard operations presentation-owned and separate from canonical history.
- Use installed native host clipboard and renderer OSC 52 adapter. Host success
  and an unacknowledged terminal write must receive different feedback.
- Reuse command registry for `/copy`, existing picker/modal lifecycle for errors,
  and fake runtime/native renderer utilities for deterministic verification.
- Existing model switching is asynchronous (discovery, unload/activation and
  preference persistence). Observe it without altering selection/residency policy.
- Waiting is neutral provider feedback; no warmup, fake progress or model claims.

## Implementation checklist

- [x] Mouse selection/highlight, native extraction and clipboard lifecycle.
- [x] Distinguishable Ctrl+Shift+C before Ctrl+C; `/copy` fallback and feedback.
- [x] Model list/switch feedback and first meaningful response waiting.
- [x] Reusable safe error dialog, scroll/copy/close/focus recovery.
- [x] Deterministic state, keyboard/mouse and native renderer regression tests.
- [x] README and real architecture boundaries.
- [x] Required full validation and final status/limitations.

## Focused tests and final validation

- Added `ConversationSelection`, `clipboard`, `ErrorDialog` and operation-error
  formatter, integrated with existing command registry/pickers/TerminalApp.
- Selection uses native extraction/highlighting, adapts colors to terminal theme,
  snapshots before composer edits, and detaches destroyed-node/renderer listeners.
- Ctrl+Shift+C is routed before Ctrl+C only when modifiers are distinct. Tests also
  exercise collapsed raw Ctrl+C and preserve its existing cancel/exit semantics.
- Lists show immediate fetching text, ignore concurrent refresh and abort/fence
  closed picker results. Existing caching and asynchronous activation are preserved;
  header retains confirmed identity during application and reconciles on settlement.
- First content/native-tool activity ends waiting through an optional isolated
  application observation. Provider/tool payloads and canonical events are unchanged.
- Loading uses static text, so there are no animation timers. Only temporary copy
  feedback owns a timer; clipboard/picker/turn cleanup remains owned and bounded.
- Errors use one temporary native modal, first-error retained without queue/stack.
  Scrollable wrapping, compact sizing, focus restoration and copy-details are tested.
  Diagnostic messages/codes/causes are bounded, controls escaped and credential fields
  redacted; arbitrary objects/stacks/request bodies are never serialized.
- Equivalent session-list failure reuses the dialog; normal agent/tool failures stay
  in their canonical/chat flow. No generic retry mechanism was added.
- Final focused run: **191 passed, 0 failed, 2,353 assertions across 15 files**.
  Added 33 tests: 26 native renderer interactions, five clipboard/diagnostic tests
  and two engine-observation tests. Existing assertions were updated only for the
  new status notification, error-modal policy, confirmed-model wording and command.
- Native coverage includes highlighted Unicode/multiline/wrapped/Markdown/code
  selection, both theme palettes, no-selection/failure/duplicate copy, `/copy`,
  distinct/collapsed shortcuts, normal cancellation, mouse scrolling/model actions,
  session/node cleanup, late clipboard feedback, active-turn selection and shutdown.
- Loading/error coverage includes pending/refresh/cancel/late lists, confirmed
  model identity and activation failure recovery, transport-only metadata versus
  first content/tool activity, empty/failure/timeout/cancellation/session/shutdown,
  duplicate dialogs, 26×6 compact layout, long scrolling/resize, focus restoration,
  copy success/failure, details bounds/redaction/control escaping and feedback timer cleanup.
- Standalone full gates passed: `bun test` **1,219 passed, 0 failed, 8,733 assertions
  across 73 files**, typecheck, formatting (205 files), Linux build, Windows cross-build,
  build smoke and `git diff --check`. Initial `release:check` also passed.
- Final interaction review added composer-click coverage to the `/copy` test and
  found native editor selection could erase its conversation snapshot. Corrected
  snapshot ownership for editor focus, kept modal-entry cleanup explicit, and
  repeated final validation after this narrow fix.
- Final post-fix focused and standalone gates repeated successfully with the same
  **191 / 1,219 tests and zero failures**. Final `bun run release:check` passed,
  repeating format/typecheck, all 1,219 tests, both builds and build smoke.
- Controlled Fedora native host clipboard smoke **passed outside the sandbox**:
  initial text preserved in memory, Unicode/multiline write returned `written`, read
  roundtrip matched exactly, prior text restore returned `written`, service disposed.
  No clipboard contents were printed. Initial sandbox attempt returned `unsupported`
  before any write; the desktop-access permission allowed the controlled check.

## Limitations

- Native Markdown extraction can retain inline delimiters and normalize blank
  spacing between rendering blocks; no second reconstruction engine is introduced.
- Terminals can reserve/collapse Ctrl+Shift+C. `/copy` retains the captured selection
  through composer editing; OpenTUI may clear the visual highlight when editing begins.
- OSC 52 does not acknowledge clipboard receipt; feedback explicitly says so.
- Installed native packages expose Linux Wayland/X11, macOS pasteboard and Windows
  clipboard backends. Fedora host roundtrip exercised; backend transport is not
  exposed by the API. Windows/macOS runtime clipboard and real-terminal shortcut
  forwarding were not exercised. No live Ollama inference was run.

## Final repository state

- HEAD remains `6dd9fea2d7dead3ad01e13a3680b241d8d7696d7`.
- 12 tracked files modified and eight new files, all within Phase 21. No commit,
  dependency/lockfile change, provider/tool protocol change or unrelated work reset.
- Relevant files: `TerminalApp`, `Conversation`, `ModelPicker`, `SessionPicker`,
  command registry, new selection/clipboard/error-dialog/error-formatter modules,
  their native/unit tests, the narrowly observed `RunAgentTurn` lifecycle and its
  tests, README, architecture notes and this progress record.
- All three defined user-facing capabilities are complete. Phase 21 ends here.

## Post-phase UX fix — terminal-native selection in Ptyxis

This section supersedes the application-owned selection/copy behavior recorded above.

- Fix baseline: HEAD still `6dd9fea2d7dead3ad01e13a3680b241d8d7696d7`, with the
  preceding Phase 21 work uncommitted (12 tracked modifications/eight new files).
  Preserve that work, including loading/error feedback and the engine observation.
- No applicable `AGENTS.md`; installed OpenTUI remains `0.5.14`. Inspected
  `renderer.d.ts`, installed `useMouse`/enable/disable/input/shutdown implementations
  and parsed keyboard modifiers before editing. The supported `useMouse` setter
  changes native terminal reporting and clears mouse capture/parser button state.
- Correction: chat disables mouse reporting from terminal startup. Ptyxis owns
  unmodified drag selection, its highlight and native Ctrl+Shift+C copying. Picker,
  approval, error and Workspace Changes lifecycles enable mouse reporting while
  interactive, then disable it and clear renderer selection on return to chat.
- Remove `ConversationSelection`, its snapshots/theme hooks and `/copy`; the app
  cannot inspect a terminal-owned selection. Keep the error dialog's explicit C/
  Copy details action and its bounded clipboard service.
- Distinct Ctrl+Shift+C events are consumed before Ctrl+C, without application
  copying, cancellation, exit or editor input. Identical raw Ctrl+C bytes retain
  ordinary Ctrl+C semantics; Ptyxis must consume its configured native copy shortcut.
- Chat mouse-wheel behavior belongs to the terminal with reporting disabled.
  PageUp/PageDown and Ctrl+Home/End still scroll app history; composer arrows retain
  their existing meaning. Interactive views retain application mouse-wheel handling.
- Removed obsolete internal-selection, highlight, snapshot and `/copy` tests. Retained
  all loading/error tests and moved clipboard cleanup checks to explicit Copy details.
  Added 13 native renderer regressions in `TerminalMouseMode.test.ts`, including
  native reporting calls, unshifted drag ownership, startup/resume/model/session/
  approval/error/Workspace Changes transitions, mouse wheel/click delivery, focus,
  history/composer keyboard navigation, Kitty and modifyOtherKeys Shift events,
  uppercase names, raw Ctrl+C collision, late fetch suppression and shutdown.
- Focused run passed: **194 tests, 0 failures, 2,414 assertions across 16 files**.
  Eleven protected/pre-existing implementation/test files were hash-checked against
  the fix baseline and remained byte-identical, including engine, Conversation,
  model/session picker and Workspace Changes files. No protocol, tool, persistence,
  model-loading or streaming implementation changed in this fix.
- Controlled real-PTY smoke with the fake runtime passed: chat emitted no mouse
  enable modes; F2 emitted native enable modes 1000/1002/1003/1006; Esc emitted their
  disable modes; a distinct CSI-u Ctrl+Shift+C did not exit; ordinary raw Ctrl+C
  closed cleanly with exit code 0. No inference, desktop clipboard write or custom
  application escape sequences were used. This verifies wire reporting/lifecycle,
  not Ptyxis's physical selection highlight or clipboard shortcut UI.
- README and architecture notes describe terminal ownership and removal of `/copy`.
- Standalone full gates passed: **1,222 tests, 0 failures, 8,794 assertions across
  74 files**, typecheck, format check (205 files), Linux build, Windows cross-build,
  build smoke and `git diff --check`. Final `bun run release:check` also passed,
  repeating formatting/typecheck, all 1,222 tests, both builds and build smoke.
- Remaining terminal-specific limits: native Copy must be bound/consumed by Ptyxis;
  identical Ctrl+C bytes cannot be distinguished. Selection/wrapping/clipboard and
  chat wheel/alternate-screen behavior follow terminal settings. Page keys remain
  the reliable app-history navigation. Real Ptyxis selection/clipboard interaction
  and Windows/macOS terminal runtime behavior have not been manually exercised here.
- Final HEAD remains the fix baseline. No commit, dependency change, additional
  diagnostic subphase or unrelated reset. The pre-existing Phase 21 work remains
  uncommitted; only its obsolete selection path was removed as requested.
