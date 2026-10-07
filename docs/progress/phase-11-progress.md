# Phase 11 implementation progress

## Status

verified

## Baseline

- Started 2026-10-07 at HEAD `40fb1864e40ba208524a15c28a757e62b14d5c1b`.
- Starting `git status --short --untracked-files=all` and `git diff --name-only`: both empty. No pre-existing tracked changes.
- Bun `1.4.2`; installed React `19.2.7`, Ink `7.1.0`, react-devtools-core `7.0.1`, @types/react `19.2.17`, marked `18.0.5`, ripgrep-universal `1.18.0`, Zod `4.4.3`; TypeScript `7.0.2` and @types/bun `1.3.14`.
- Phase 1–10 commits `a2d94c7`, `6003da8`, `7c6fac6`, `96cd718`, `46ed7d1`, `d1e953a`, `15100ff`, `257dcf2`, `d0e8a56`, `40fb186` each passed `git merge-base --is-ancestor ... HEAD`; all ten records report verified. Audit, primary plan and all ten progress records inspected; current user goal supersedes their old Ink-specific preservation guidance.
- No applicable AGENTS.md found in workspace/ancestors. Audit, primary plan and Phase 1–10 records are protected inputs. No commit authorized.
- Baseline `bun run release:check`: passed exit 0; 449 tests / 34 files / 4016 assertions / zero failures; formatting checked 125 files; typecheck, Linux/Windows builds and existing smoke passed. Log `/tmp/phase-11-baseline-release.log`. Smoke only checks artifacts/terminal guard/packaged rg, not interactive model flows.
- This file was created before implementation/dependency/script edits.

## Existing behavior inventory

- Runtime already supplies every required capability; no application/runtime change is justified.
- Prompt submission locks synchronously and commits once; every model round streams before final completion. Event IDs deduplicate before clearing live output; only uncommitted current-round text becomes a local partial. Empty commits remain invisible. Independent persistence/model errors remain truthful even if abort is also pending.
- Selection identity and turn identity fence late deltas/commits/finalizers; session change/disposal abort old work and detach subscriptions. Resume uses durable events and optionally restores the latest prompt model through the same async unload-first switch. Preview reads do not activate/retain model state.
- Approvals default deny, show action/target and optional full details; y/allow, n/Escape/deny, arrows plus Enter. Abort/replacement/disposal clears only matching request and removes signal listeners; late allow cannot execute.
- `/model`, `/model name`, `/resume`, slash suggestions/navigation/Tab, unknown/invalid command errors; startup resume offers new session. Native textarea replaces bespoke editing while retaining normal typing/editing/paste and multiline input.
- Ctrl+C cancels an active turn; next idle Ctrl+C exits. Ctrl+C while approval is visible exits with cleanup; Escape approval denies, Escape active turn cancels. Pickers navigate/select/cancel and restore focus. Transcript scrolling is newly required, not inherited old behavior.

## Existing presentation inventory

- Renderer-independent retained/adapted: command parser/suggestions and tests; startup mode and test; session summary and test; content-only tool formatting; StreamBuffer and its two tests after deliberate batching decision; Runtime-derived presentation Pick.
- Ink-specific replaceable: App, screens, chat/components/approval/input, usePresentation, useChatSession, useComposer; manual editor; old renderer/bootstrap. Old reducer is pure but tied to array-wide presentation state and is replaced by incremental durable transcript ownership.
- Obsolete after redesign: all TSX Ink layout tests/renderToString/PassThrough harnesses, state types and wrapper selection primitives; workspace display formatter if unused.
- Existing tests: 14 presentation files / 78 cases. Retain pure parser/startup/summary/buffer cases; rewrite 17 App, 25 chat lifecycle and 9 reducer cases against new controller/native UI behavioral surfaces. Delete old role-label/hierarchy/whitespace/editor-helper assertions. Runtime tests from Phases 1–10 stay unchanged.

## OpenTUI investigation

- Official sources: [repository](https://github.com/anomalyco/opentui), [Core docs](https://opentui.com/docs/), [React docs](https://opentui.com/docs/bindings/react/), [standalone executables](https://opentui.com/docs/reference/standalone-executables/), [renderer](https://opentui.com/docs/core-concepts/renderer/), [lifecycle](https://opentui.com/docs/core-concepts/lifecycle/), [keyboard](https://opentui.com/docs/core-concepts/keyboard/), [testing](https://opentui.com/docs/core-concepts/testing/), [ScrollBox](https://opentui.com/docs/components/scrollbox/), [Textarea](https://opentui.com/docs/components/textarea/), [Select](https://opentui.com/docs/components/select/), [Markdown](https://opentui.com/docs/components/markdown/), [keymap](https://opentui.com/docs/keymap/overview/). Installed @opentui/core `0.5.14` declarations/package/bundled source inspected; npm latest `0.5.15` was blocked by existing 7-day `minimumReleaseAge`, preserved unchanged. Initial sandbox package-cache write failed; escalated Bun install of 0.5.14 passed. React >=19.2 and Bun >=1.3 documented; local Bun satisfies Core requirement.
- Core: createCliRenderer; Box/Text/Markdown/Textarea/Select/ScrollBox renderables, Yoga layout; absolute positioning and zIndex for temporary interactions. Terminal default foreground/background available via RGBA; one accent plus muted/error colors suffices.
- Textarea owns editing, paste, selection and undo; configurable native bindings map Enter to submit and Shift+Enter/Ctrl+J to newline. Select owns navigation, selection, viewport and active row. Global key handlers precede focused input; preventDefault/stopPropagation provide explicit ownership.
- ScrollBox has stickyScroll/stickyStart bottom, pauses after manual upward scrolling, resumes at bottom, viewportCulling true by default, scrollBy(viewport), scrollTo and scrollChildIntoView. Use these instead of custom virtualization/follow state.
- Renderer exitOnCtrlC false + exitSignals [] permit application-owned async shutdown. destroy is idempotent, restores terminal and removes resources; app must separately await runtime turn. autoFocus false prevents mouse clicks stealing composer focus. Native resize events/Yoga handle dimensions.
- Core testing export provides native createTestRenderer, mock keys/paste/mouse, renderOnce/flush/frame capture/resize; no Ink test harness needed. React testRender/act and devtools/reconciler are viable but unnecessary with Core.
- Keymap package supports contextual command ownership; direct single global focus-aware handler plus primitive bindings is simpler for this product. No keymap package required. React DevTools applies only to rejected binding.
- Markdown streaming parser is incremental, stable blocks experimental; default coalesced mode preferred. Live region will batch to avoid replacing native content buffers for every raw fragment.
- Final packaging follow-up inspected [Bun install platform selection](https://bun.com/docs/pm/cli/install) and local Bun help: foreign optional packages need explicit `--os`/`--cpu` selection. Used the documented CLI preparation rather than speculative bunfig settings or build-time auto-installs.

## Core vs React decision

Selected OpenTUI Core. Stable renderable children and direct narrow updates naturally separate durable transcript, live round and overlays. Native editor/select/focus/scroll primitives already supply the needed interaction. Rejected React: same native capabilities with reconciliation, hooks, external-store/component subscription discipline, React/reconciler/devtools/JSX dependencies and lifecycle overhead without a clear product benefit. No swappable binding adapter or React/Core hybrid.

## Architecture

- `Conversation.ts`: product-specific owner of selected session, event-ID set, durable transcript, active turn/controller, live buffer, model switching/loading and runtime subscription. Emits incremental append/reset/live/status changes; no generic store/reducer framework. Selection/turn identity guards all async work. Native UI is its only production observer.
- `TerminalApp.ts`: creates conversation shell, subtle model/session header, native ScrollBox with stable committed children and independent live region, native lightweight textarea. Owns one global key listener and product-specific temporary interactions. Overlay async work has identity/AbortController guards. No parallel focus/scroll manager.
- Product `SessionPicker`, `ModelPicker`, `ApprovalPrompt` directly create Core primitives. Only these temporary surfaces own focus while present. No speculative modal/list/theme wrappers.
- Production `index.ts` calls bootstrap `start.ts`, which implements terminal guard, renderer startup, shutdown/error/signal cleanup and awaits active runtime/picker work before renderer destruction. Runtime remains injected via derived Pick; production creates the existing verified runtime once.
- Actual folder: flat product modules under presentation plus existing pure commands/formatters/state utilities retained only when used; no Ink-like screen/hook hierarchy.
- Test approach: pure transcript/controller regression tests with scripted/deferred runtime; actual native renderer tests for typing, focus, menus, approvals, scroll/resize/cleanup. PTY scripted path validates source and packaged native interface without requiring Ollama.
- Final dependencies: exact @opentui/core 0.5.14; Ink/React/@types/react/react-devtools-core/direct marked removed after actual usage check; Bun/TS/Biome/ripgrep/Zod retained. Windows native optional package must be installed for cross-compilation; artifact names and rg preserved.

## Visual/interaction contract

Conversation first: cool-accent `›` user marker with wrapped prompt text; indented plain native Markdown assistant prose without role headings/cards; compact muted `•` tools and red `×` failures; model/session subtly accented above history. Composer uses one separator and native text editing. Temporary focused pickers/approvals use native Select and absolute positioning. Terminal default background/foreground, one cool accent, muted metadata and red errors; no permanent metrics/dashboard/theme abstraction.

## Performance contract

Committed transcript nodes are created only on durable/local entries, not transformed per token. Live output has its own native renderable and 32ms StreamBuffer: retained because native content setters replace styled/native buffers even under Core; deterministic cadence bounds work with low latency. Native ScrollBox sticky following and viewport culling handle history. One runtime subscription and one key listener per app, not per render. Overlay changes do not rebuild transcript. No O(history × tokens) transformation. Culling bounds painting, not resident node/layout count; no custom virtualization was justified by the native 100-entry test and actual long-response PTY. Live content still grows with the current response, with bounded update cadence rather than arbitrary high FPS.

## Keyboard/focus contract

Native composer normally owns focus. Enter submits; Shift+Enter/Ctrl+J newline; native text editing/paste/undo. Focused Select owns picker arrows/PageUp/PageDown/Enter; root Home/End sets its native active row. Global handler owns Ctrl+C/Escape, F2/F3, slash suggestions, transcript PageUp/PageDown and Ctrl+Home/End; consumes only handled keys. Ctrl+C cancels active work, exits idle or pending approval; Escape denies approval, closes picker, cancels active work or dismisses suggestions in that order. Closing interactions restores composer; autoFocus disabled. Mouse scrolling uses native ScrollBox; no parallel FocusManager.

## Build/packaging contract

Preserve Linux `codesh`/`rg` and Windows `codesh.exe`/`rg.exe`. Core's supported Bun compile path embeds the native library, parser worker, grammar assets and WASM; no custom extraction/plugin is needed. `scripts/build-artifact.ts` exports the actual shared build options, selects production `index.ts` and defines `process.env.OPENTUI_LIBC` as `glibc` for the existing Linux target. Compile failure propagation and rg packaging remain unchanged. Install foreign optional native packages before cross-building with `bun install --frozen-lockfile --os '*' --cpu x64`, including after dependency changes; README documents this supported preparation. Both application builds and smoke passed. The isolated Linux artifact test also executes actual embedded parser/Markdown/TypeScript assets with a fresh temporary cache. Native Windows execution remains external.

## Ink removal

Production now uses `index.ts` → `startTerminal` → OpenTUI Core. Removed `index.tsx`, `src/App.tsx`, the old approval/chat/components/hooks/input/screens modules and their Ink harness/implementation tests, `presentationReducer` and obsolete workspace formatter. Removed unused old selection/history/state types and old compact approval-detail helper. Retained only runtime-derived types, pure command/startup/session-summary/tool-content helpers and intentional StreamBuffer/tests. No React/Ink rendering path or dependency remains.

## Validation

- Baseline release passed as recorded above. This is baseline evidence, not final Phase 11 release verification.
- Native Core probe using actual createTestRenderer/TextRenderable/renderOnce/destroy passed, captured `OpenTUI native renderer`; `/tmp/phase-11-native-probe.log`. No external library issue on Linux.
- Native textarea probe passed multiline editing and CRLF paste normalization; `/tmp/phase-11-editor-probe.log`. Research agent's `/tmp/phase11-research/native-probe.ts` passed session/model selection/focus, approval default deny/exactly-once settlement/details, 36x10 resize, sticky scrolling, mouse behavior, global-key interception and idempotent destruction. This scratch probe is not repository coverage.
- `bun test src/presentation/Conversation.test.ts src/presentation/TranscriptLog.test.ts`: **40 passed / 0 failed / 153 assertions / 2 files**; `/tmp/phase-11-controller-tests.log`. Covers multiple streaming rounds, stable history during deltas, durable deduplication, blank completion, exceptional return, partial/error/cancellation, truthful storage errors, session identity fences, resumed model restoration, model failure preserving prior truth, awaited disposal and real application approval cancellation preventing late execution. Transcript coverage includes compact success/failure tools, legacy orphan fallback and incomplete activity.
- `bun test src/presentation/TerminalApp.test.ts`: **10 passed / 0 failed / 57 assertions / 1 file**; `/tmp/phase-11-native-tests-3.log`. Actual native Core renderer covers focused textarea, editing/submission once, multiline paste/newline, slash navigation/Tab, model picker, session previews/navigation/resume/cancel/focus, approval allow/deny/default deny/abort/stale input, visible streaming before completion/one durable answer, long history/manual scroll/bottom-follow, resize and listener/resource cleanup.
- `bun test scripts/opentui-artifact.test.ts`: **1 passed / 0 failed / 3 assertions / 1 file**; `/tmp/phase-11-artifact-probe.log`. Compiles real native Core using production shared options, executes from isolated temporary cwd without an asset root, renders a frame and asserts native `.so` and parser worker are embedded. Does not exercise a production conversation or native Windows execution.
- Integration typecheck passed at the recorded intermediate state (`/tmp/phase-11-integrated-typecheck.log`); delegated controller/builder typechecks also passed. Final root integration typecheck and scoped formatting subsequently passed, as recorded below.
- Initial integration errors were unfinished module imports and six fixture approvals lacking required sessionId; corrected without weakening runtime types. Controller agent corrected three test-fixture failures before its final passing run.
- Native Markdown highlighting is asynchronous. Initial frame assertions ran before its worker completed, and the sandbox rejected the default cache write outside the workspace. An approved standalone native probe rendered successfully after worker initialization. Deterministic native UI tests now use the official `MockTreeSitterClient`, resolve pending highlights before frame capture, and production retains the real client.
- A pending approval assertion hung because Bun 1.4.2's pending `.rejects.toHaveProperty` matcher blocked before triggering abort. Corrected the test by collecting the rejection, aborting and then checking the awaited error. Two subsequent UI fixture failures were an incorrectly encoded mock Ctrl+End key (now `END`) and a truncated narrow hint (Escape now appears first). Final native run is green.
- Recovery `git diff --check` passed before continuation. Final deterministic and PTY results subsequently supersede the unfinished integration state.
- After production cutover/cleanup: `bun test` passed **437 tests / 28 files / 3888 assertions / 0 failures** (`/tmp/phase-11-full-tests.log`); `bun run typecheck` passed (`/tmp/phase-11-final-typecheck.log`); `bun run format:check` passed **110 files, no fixes** (`/tmp/phase-11-format-check.log`). Build/smoke results are checkpoint 15. Final release below includes the strengthened artifact probe.
- `bun run release:check`: **passed exit 0**, **437 tests / 28 files / 3903 assertions / 0 failures**, **110 format-checked files**, typecheck, Linux and Windows build-all, isolated smoke all passed (`/tmp/phase-11-final-release.log`). Test-count change from 449 baseline is entirely presentation replacement: 78 old presentation cases replaced by 65 new cases plus 1 native artifact case; runtime/application tests are unchanged.
- Actual source TUI in `/tmp/phase-11-pty-source` with scripted endpoint verified typing, live first/later rounds, compact successful/failed tools, model selection, approval details/deny/allow, cancellation, scrolling/follow and resize. Isolated packaged TUI in `/tmp/phase-11-pty-release` verified native startup, real packaged rg-backed tool calls, pending approval cancellation leaving sample unchanged, exit/restart/durable resume. Real Ollama `llama3.2:1b-instruct-q4_K_M` produced a sentence and Markdown list through production source TUI in `/tmp/phase-11-pty-real`; completion captured successfully. Real model tool correctness beyond this check is not claimed.
- Actual wrapper compared `stty -g` before/after: `/tmp/phase-11-terminal-packaged.log` (Ctrl+C during approval), `/tmp/phase-11-terminal-real.log` (idle Ctrl+C), `/tmp/phase-11-terminal-resume.log` (SIGTERM after durable resume) each report **exit=0 terminal=restored**. Native injected render/handler faults were not artificially forced; source handlers inspected and normal/signal/approval shutdown exercised.

## Checkpoints

### Initial baseline capture

- Inspected HEAD/status/diff, package.json, entrypoint, runtime API and presentation file inventory, phase statuses and git history.
- Decided to investigate APIs, behaviors and packaging independently before architecture. No implementation changed.
- Fits OpenTUI by avoiding inherited Ink ownership assumptions. Validation: clean worktree and statuses captured. Remaining: complete baseline and research.

### 1 — Baseline and old behavior inventory

- Inspected protected audit/plan/ten phase records, all presentation control/state/workflow files and all 14 presentation test files; direct Runtime capabilities and Phase 2/4/5 lifecycle contracts.
- Decided pure behavior helpers may remain, Ink hooks/components/reducer layout state will be replaced. Changed this record only (then installed research dependency). Validation: all ancestry checks and release baseline passed, exact counts above. Limit: existing smoke has no interactive coverage. Remaining: new Core implementation and behavioral tests.

### 2 — OpenTUI research

- Inspected official docs/repository/npm and installed 0.5.14 APIs including renderer lifecycle, native editor/select/scroll/focus/layout/keyboard/test declarations and packaging requirements. Core installed through Bun; package/lock are the first implementation-related changes.
- Decided native primitives fit requirements; avoid custom editor/virtualizer/keymap manager. Validation: installed version and Bun compatibility confirmed; latest release excluded by existing age policy, no policy bypass. Remaining: deterministic native prototype/tests and cross-build assets.

### 3 — Core vs React

- Inspected both binding contracts and subscription/lifecycle costs. Selected Core for stable imperative transcript/live ownership; rejected React for unnecessary reconciliation and dependency surface. No architecture adapter. Validation: research advice inspected against installed declarations. Limitation: exact Core behavior still needs native tests.

### 4 — Architecture checkpoint before broad implementation

- Chosen state ownership, runtime subscriptions, live/durable strategy, renderer lifecycle, focus/keyboard/native scrolling, folder/testing/dependency/build plans are recorded above.
- Implementation ownership: root owns TerminalApp/bootstrap/integration, controller/transcript behavioral work delegated separately, packaging delegated separately, picker/approval native builders delegated separately. No concurrent writes to shared files.
- Why Core fits: product code directly changes native primitives, committed children remain stable, no wrapper chain/global render churn. Validation: baseline/research complete; runtime boundary needs no changes. Remaining: implement independently verifiable slices and record checks continuously.

### 5 — Renderer/bootstrap implementation (initial slice)

- Inspected installed renderer config/events and lifecycle declarations, native layout/focus/default-color APIs. Added `presentation/start.ts` with interactive guard, Core renderer lifecycle, signal/error cleanup and awaited application shutdown; added initial `TerminalApp.ts` with a shallow product-owned shell.
- Decided alternate-screen native ScrollBox for controllable history, default terminal background, 30fps target/60 maximum, mouse autofocus disabled. Bootstrap awaits runtime cancellation before renderer.destroy; startup construction failure also restores terminal.
- Files/symbols: `startTerminal`, `TerminalApp` constructor/shutdown. Fits Core by using its actual renderer lifecycle rather than Ink unmount patterns.
- Validation: declarations inspected; integration/typecheck pending delegated controller/picker modules. Old entrypoint remains active temporarily until new behavior is tested. Limitation: no native smoke claim yet. Remaining: integrate new module APIs and native renderer tests.

### 6 — Conversation/composer implementation (initial slice)

- Added native textarea with Enter submit, Shift+Enter/Ctrl+J newline, native paste/edit/undo and familiar Ctrl+A/E/U; minimal model/session header; structural user marker; plain native Markdown assistant region; compact durable tool lines; two slash suggestions. Product code talks directly to Core primitives.
- Stable history nodes are direct ScrollBox children, inserted before one independent streaming region; avoids wrapping all history in a single culling unit. Composer and ephemeral activity are outside scrolling content. One global key handler routes only owned keys.
- Files/symbols: `TerminalApp.appendEntry`, `submit`, `updateSuggestions`, `onKey`; no generic visual/focus/scroll framework. Validation: API inspection; executable native checks pending module completion. Remaining: integrate streaming controller and test typing/submit/focus/scroll/resize before deleting Ink.

### 7 — Streaming integration

- Inspected integrated controller and native shell plus focused test logs. Added `Conversation`, `TranscriptLog` and controller regressions; `TerminalApp` consumes incremental notifications and updates only its live Markdown region for a live notification, returning before header/status work.
- Durable event IDs are checked before live reset; authoritative commits replace live text exactly once. Exceptional return/error/cancellation preserves only uncommitted partial text locally. Selection/turn identities fence late callbacks. Chosen 32ms batching uses retained renderer-independent StreamBuffer because native content setters replace buffers; historical arrays/nodes remain stable during raw deltas.
- Files/symbols: `Conversation.submit`, subscription binding, live buffer, `TranscriptLog`, `TerminalApp.onConversationChange/appendEntry`. Validation: 40 controller/transcript cases and native before-completion/dedup case passed. Limitation at this checkpoint: real Ollama had not been exercised. Remaining then: final integration/PTY checks.

### 8 — Compact tool activity

- Inspected durable tool events and old pure content formatter. TranscriptLog tracks independent activity lifetimes only on tool events and emits compact durable success/failure lines; TerminalApp renders direct native Text children and ephemeral active activity separately.
- No permanent tool cards or metric dashboard. Files: `TranscriptLog.ts`, `TerminalApp.ts`, existing pure tool formatter. Validation: tool order, success/failure, legacy orphan and interrupted activity tests passed. Remaining: actual TUI tool exercise and renderer-level legacy history check.

### 9 — Session/resume interaction

- Added direct Core `SessionPicker`: new-session row, summary/recency/current metadata, native Select navigation, Enter selection and Escape cancellation. Preview reads do not activate sessions; closed instances fence late preview results. Conversation replay uses durable state and existing unload-first model restoration, preserving history if restoration fails.
- Files/symbols: `SessionPicker`, `Conversation.selectSession/initialize`, TerminalApp session interaction. Validation: native previews/navigation/resume/cancel/focus and controller old-work detachment/stale-load tests passed. Limitation: runtime preview API has no abort signal, so late UI results are fenced instead. Remaining: production resume/PTY checks.

### 10 — Model selection

- Added direct Core `ModelPicker`, current/active rows, cancellable catalog load and product error status. Runtime remains sole model truth; selection invokes existing switchModel/unload-first semantics. Failure remains visible in the picker and prior model remains selected.
- Files: `ModelPicker.ts`, `Conversation.switchModel`, TerminalApp command controller. Validation: native selection/focus and controller switch/failure/cancellation/restoration tests passed. Remaining: native failure display and production exercise.

### 11 — Approvals/cancellation

- Added direct Core `ApprovalPrompt`, explicit operation/target, deny selected by default, allow/deny keys and optional JSON details with native scrolling. TerminalApp owns exact request settlement, removes abort listeners and fences replacement/late decisions; disposal denies pending requests and unregisters runtime handler.
- Active-turn cancellation and session detachment preserve truthful partial/error outcomes. Disposal waits tracked turns, session loads and model operations before renderer destruction.
- Files: `ApprovalPrompt.ts`, TerminalApp's registered approval handler/shutdown, `Conversation.cancel/dispose`. Validation: native allow/deny/default/Escape/abort/stale input and real application pending-approval late-allow test passed. Remaining then: actual TUI approval and shutdown verification.

### 12 — Keyboard/focus/scroll/resize

- One root key listener owns global commands and consumes only handled keys; native textarea/Select retain editing/navigation. Composer focus returns after temporary interactions. F2/F3 open model/session pickers; PageUp/Down scroll native transcript; Ctrl+Home/End navigate history; native mouse wheel and sticky bottom behavior remain in use.
- Historical entries are direct ScrollBox children with viewport culling, not one giant wrapper. Manual upward scroll prevents forced following; returning bottom resumes it. Narrow hints put cancellation first and approval target does not shrink away.
- Validation: 100-entry native history/manual scroll/output/bottom resume, native focus, narrow resize and disposal tests passed. No custom focus/scroll manager. Remaining: PTY resize/mouse/key exercise and final lifecycle review.

### 15 — Build/packaging changes (partial)

- Inspected standalone docs, installed Core native/worker asset imports and exact build helper. Changed only shared build options/entrypoint/glibc define and added isolated native artifact test; artifact names, rg copy/chmod and failure propagation retained.
- Validation: native artifact 1 test / 3 assertions passed and Windows x64 optional package installed. Limitation: production entrypoint migration is pending; production Linux/Windows builds and smoke have not run. Remaining: finish cutover, cross-build and final smoke/release.

### 16 — Targeted validation (partial)

- Completed factual focused results are recorded in Validation: controller/transcript 40/153, native UI 10/57, artifact 1/3; all passing. Intermediate typecheck passed. Deterministic native tests use official test client rather than relying on asynchronous cache initialization.
- No runtime implementation edits. Root must still review integration, finish cleanup and run final gates. These results do not justify verified status yet.

### Recovery checkpoint — interrupted Ultra run, 2026-10-07

- Root reread this entire record, inspected current tracked diff and all changed paths, recovered test logs and queried all existing subagents before new implementation. HEAD remains `40fb1864e40ba208524a15c28a757e62b14d5c1b`. `git diff --check` passed; tracked diff is 3 files, 55 insertions / 5 deletions. Untracked implementation is additional and excluded from that stat.
- Current tracked changes: `bun.lock`, `package.json`, `scripts/build-artifact.ts`.
- Current untracked changes: this record; `scripts/opentui-artifact.test.ts`; presentation `ApprovalPrompt.ts`, `Conversation.ts`, `Conversation.test.ts`, `ModelPicker.ts`, `SessionPicker.ts`, `TerminalApp.ts`, `TerminalApp.test.ts`, `TranscriptLog.ts`, `TranscriptLog.test.ts`, `start.ts`; `src/test-support/FakeTerminalRuntime.ts`.
- No deletions yet. Old `index.tsx`, App, Ink screens/hooks/components/tests and React/Ink dependencies still exist. Active production TUI is still Ink, while build helper already expects the not-yet-created `index.ts`. This is the explicit incomplete integration boundary, not a finished dual renderer design.
- Audit/plan, Phase 1–10 records and application/domain/infrastructure/composition implementations have no worktree changes. No generated `.agent` or dist artifacts are listed in status. Root source formatting/final gates are outstanding.
- Subagent status: behavior_inventory **complete** (behavior inventory, Conversation/TranscriptLog, 40 tests / 153 assertions, typecheck/format); opentui_research **implementation/research complete** (Core/React findings, three picker/approval builders, native scratch probes), but its subsequent read-only final architecture/lifecycle/performance review **errored at usage limit and is incomplete**; packaging_research **implementation and focused native probe complete by earlier factual report**, currently shown running while final recovery response is requested. Root owns all handed-off files and has not treated a missing final review as completed.
- Existing temporary scripted Ollama server/probes are scratch preparation only; source/packaged actual-TUI PTY runs have not been performed. The previously started server process must be checked before reuse. No real model or native Windows validation is claimed.
- All recovered facts above are now persisted. Next bounded slice: inspect integrated lifecycle and strengthen only missing native regressions, then complete source cutover/removal with checkpoints. Do not redo passing baseline/research merely because the run was interrupted.

### Recovery continuation — bounded native coverage complete

- Root inspected all new product modules, startup lifecycle, runtime-derived types, native fixtures and focused tests. Added native renderer cases for later-round live output beside compact success/failure tools; partial stream plus error/cancel; loaded legacy transcript with no model metadata/orphan tool result; picker switch failure retaining old model; session selection aborting active work and fencing late output; Ctrl+C approval shutdown.
- Files: `TerminalApp.test.ts` only. No production/runtime change in this slice. Native primitives remain the tested behavioral surface.
- `bun test src/presentation/TerminalApp.test.ts`: **17 passed / 0 failed / 87 assertions / 1 file** (`/tmp/phase-11-native-recovered.log`). Initial new legacy fixture expected Markdown delimiters to disappear, but the official mock highlighter intentionally has no syntax captures; corrected the fixture to plain legacy prose. Actual parser formatting remains a PTY check, not claimed by the mock.
- `bun run typecheck`: passed exit 0 (`/tmp/phase-11-recovered-typecheck.log`). Current entrypoint/build mismatch remains explicitly pending. Next slice: production cutover and obsolete Ink removal, followed by dependency cleanup and gates.

### 13 — Production cutover and old Ink removal

- Inspected every source import of Ink/React/marked, old bootstrap/App and new native coverage. Changed `package.json` module/start to `index.ts`; added entrypoint directly calling researched Core bootstrap. Deleted 28 obsolete paths: old entrypoint/App, all old visual hierarchy and Ink hooks/manual editor/reducer plus obsolete tests/workspace helper. No runtime tests removed or runtime implementations changed.
- Simplified `presentation/types.ts` to actual runtime-derived contract/startup/session summary types and removed unused `formatToolDetails`/serialization helper. Native Core primitives now own presentation; no adapter, TSX screen tree or dual renderer remains.
- Validation: typecheck passed (`/tmp/phase-11-cutover-typecheck.log`); `bun test src/presentation` **63 passed / 0 failed / 258 assertions / 7 files** (`/tmp/phase-11-cutover-presentation.log`). Actual new entrypoint non-TTY invocation passed exit 0 and printed the interactive-terminal guard. Source import search found no React/Ink/marked imports; remaining Ink-related manifest dependencies are pending removal.
- Limitations: production PTY and final release gates pending. Next: dependency/compiler cleanup, then packaging/integration validation.
- Packaging agent did not return an additional recovery response; root inspected its completed source and passing native log and interrupted the lingering agent. Its implementation/probe are complete; no new work was accepted from it. Final application builds remain root-owned.

### 14 — Dependency/compiler cleanup

- Actual source usage inspection confirmed Core is the only binding. `bun remove ink react @types/react react-devtools-core marked` succeeded and updated package/lock. Removed React JSX/types compiler settings; retained Bun types, exact Core 0.5.14, ripgrep, Zod and existing toolchain. Core's own marked/parser/FFI dependencies remain transitive. No DevTools workflow is selected and no Ink testing package remains.
- No package age-policy or runtime configuration changes. Why Core fits: no reconciler/JSX/React dependency needed for direct renderables. Validation: `bun run typecheck` passed (`/tmp/phase-11-cleanup-typecheck.log`); presentation suite **65 passed / 0 failed / 267 assertions / 7 files** (`/tmp/phase-11-cleanup-presentation.log`). Final dependency/source inspection and release gates remain.

### Lifecycle review correction

- Recovered final read-only agent review completed: controller/transcript/native integration test run 57 cases / 240 assertions passed before its additional two lifecycle regressions. No other concrete runtime-identity/cancellation/key/per-token historical-work defect found. Process/error hooks still require actual bootstrap PTY evidence.
- Agent's native deferred-preview probe proved `app.closed` could resolve before pending picker reads settled. Root fixed this narrowly: `TerminalApp.showPicker` tracks actual picker load promises; shutdown closes/aborts immediately, fences late results, and awaits picker IO plus Conversation disposal before destroying renderer. Session previews have no abort API, so completion is awaited without a runtime change.
- Added native deferred session-preview/model-catalog cases proving shutdown remains pending, model catalog aborts, runtime listeners detach immediately and renderer destroys after reads settle. All 65 presentation cases / 267 assertions pass. Remaining: scoped formatting, application builds, production PTY and final gates.

### 15 — Production build/packaging validation

- Production Linux build passed. Initial Windows cross-build correctly failed because dependency removal had left the Windows native package unavailable to Core's isolated resolution. Re-ran supported `bun install --frozen-lockfile --os '*' --cpu x64`; lock/manifest unchanged, Windows native resolution restored. Windows cross-build then passed exit 0. No build script auto-install/network side effect introduced.
- `bun run build:linux`, `bun run build:windows`, `bun run smoke:build`: passed (`/tmp/phase-11-build-linux.log`, `/tmp/phase-11-build-windows.log`, `/tmp/phase-11-smoke.log`). Smoke preserves ELF/PE/executable/rg checks and isolated new/resume non-TTY startup. It does not validate interactive model operation.
- Scoped formatter passed, fixing only four affected root files. README now documents Core UI/keys, Bun >=1.3, glibc/embedded assets and exact cross-platform install prerequisite; current architecture presentation section now reflects actual Core ownership. Historical audit/plans and Phase 1–10 records remain untouched.
- Bounded final artifact task delegated separately to behavior agent, owning only `scripts/opentui-artifact.test.ts`: exercise actual embedded parser worker/WASM/grammar offline in addition to current native frame assertions. Root owns PTY and all other source. Remaining: strengthened asset evidence, production PTY, final full gates/diff.

### 16 — Native asset and production PTY validation (continuation)

- Bounded artifact agent completed and root inspected the full single-file change. Compiled probe initializes real TreeSitterClient in a fresh temporary dataPath; awaits actual highlighting; renders native Markdown; proves heading/strong/injected TypeScript keyword captures and concealed delimiters. Worker grammar/query load logs come from embedded Bun paths; no warnings/errors/downloads/cache hits. Root rerun passed **1 test / 18 assertions / 0 failures** (`/tmp/phase-11-artifact-final.log`). Linux x64 only; native Windows remains separate.
- Source PTY verified scripted first/later rounds, two compact successful tools, model-picker switch to alternate-model, approval default deny/details and explicit deny (sample stayed old marker), then allow (sample changed to new marker); active Ctrl+C preserved partial lines and displayed cancellation. Resize and manual PageUp held the prior reading position while new stream continued/completed; Ctrl+End reached the final streamed line. F3 showed current session summary/time with New session and Escape.
- Real local Ollama check initially failed with sandbox socket permission; approved external check succeeded and listed gemma4:12b-it-qat and llama3.2:1b-instruct-q4_K_M. Previous unavailable-service assumption is superseded. Real-model TUI validation is now running in isolated `/tmp/phase-11-pty-real`; do not claim outcome before capture.
- Isolated packaged TUI is running from `/tmp/phase-11-pty-release` with only codesh/rg and fixture file, without checkout/node_modules. Wrapper records stty before/after plus exit code under `/tmp/phase-11-terminal-*.log`; restoration and restart/resume still pending.

### 17 — Full/final validation and complete diff review

- Inspected final tracked package/lock/compiler/build/docs/helper diff, removed bootstrap/hooks/reducer/visual hierarchy, new production modules and all new controller/transcript/native/artifact tests. Compared removed tests' required semantics against replacements; no runtime/application test weakened. Final lifecycle review completed and its one confirmed picker IO gap was fixed/tested before this gate.
- Required commands passed: `bun run typecheck`, `bun test`, `bun run format:check`, `bun run build:linux`, `bun run build:windows`, `bun run smoke:build`, `bun run release:check`. Final release: **437 passed / 0 failed / 3903 assertions / 28 files; 110 formatted files**. Native Core/artifact-specific tests are included. All logs and intermediate counts are recorded above; baseline 449/4016 is distinct.
- Actual isolated standalone restart opened the native session picker, selected the saved session and replayed authoritative user/assistant/tool history. Pending approval exit preserved the untouched sample file. Real Ollama output completed in source TUI. Wrapper logs verified exit 0 and exact terminal-state restoration on packaged approval Ctrl+C, real-model idle Ctrl+C and resumed packaged SIGTERM. Dedicated tmux server and scripted provider process stopped after checks.
- Structural search `rg -n 'ink|@inkjs|react-devtools-core|@opentui|OpenTUI' src scripts package.json` classified every remaining match: Core imports/package/test labels; native `flexShrink`; syntax token `markup.link`; pre-existing filesystem `unlink`/`symlink`/link fixture text. No Ink/React/DevTools import/dependency/old bootstrap/hook/TSX survives. Exact dependency/import scan and TSX file scan returned no matches. Transitive marked is Core's native renderer dependency, not an old presentation renderer.
- Final `git diff --check` passed; new source whitespace checks also had no diagnostics (no-index exit 1 means new-file diff, not a whitespace error). `git diff --stat`: **36 tracked paths, 62 insertions / 4653 deletions**; additional **14 untracked intentional new paths** are listed below. No index/commit action performed.
- Protected Phase 1–10 records, audit, primary plan and application/domain/composition/infrastructure paths have empty diff. Bun supply-chain policy and unrelated dependencies/configuration remain unchanged. Dist artifacts are ignored. Repository `.agent` has two pre-existing files with newest mtime **2026-06-12T07:43:46Z**, predating Phase 11 start **2026-10-07T16:45:52Z**; left untouched. All active model/tool PTY state was isolated under `/tmp`.
- Final agent state: initial behavior/controller work complete; Core research/builders complete; initial Core final-review attempt failed at usage limit and was superseded by completed root/behavior-agent review; packaging implementation/probe consolidated by root, lingering task interrupted; bounded strengthened artifact task complete. No necessary work remains only in agent context.
- OpenTUI fit/performance: direct primitive ownership, one focus-aware key subscription, bounded live-only batching, append-only committed children and native sticky/culling behavior; no renderer adapter/design-system/custom editor/focus/scroll manager. Limitations: culling retains layout/nodes, very narrow hints truncate, picker filtering intentionally omitted in favor of native navigation/page/Home/End, native Windows execution external. These do not reopen verified runtime architecture.

Final `git status --short --untracked-files=all`:

```text
 M README.md
 M bun.lock
 M docs/ARCHITECTURE.md
 D index.tsx
 M package.json
 M scripts/build-artifact.ts
 D src/App.tsx
 D src/presentation/App.test.tsx
 D src/presentation/approval/ApprovalView.test.tsx
 D src/presentation/approval/ApprovalView.tsx
 D src/presentation/chat/ChatScreen.test.tsx
 D src/presentation/chat/ChatScreen.tsx
 D src/presentation/chat/LiveTurn.tsx
 D src/presentation/chat/Transcript.test.tsx
 D src/presentation/chat/Transcript.tsx
 D src/presentation/components/Interactive.tsx
 D src/presentation/components/Markdown.test.tsx
 D src/presentation/components/Markdown.tsx
 D src/presentation/components/SelectionScreen.tsx
 M src/presentation/formatters/tool.ts
 D src/presentation/formatters/workspace.ts
 D src/presentation/hooks/useChatSession.test.tsx
 D src/presentation/hooks/useChatSession.ts
 D src/presentation/hooks/useComposer.test.ts
 D src/presentation/hooks/useComposer.ts
 D src/presentation/hooks/usePresentation.ts
 D src/presentation/input/CommandMenu.tsx
 D src/presentation/input/Composer.test.tsx
 D src/presentation/input/Composer.tsx
 D src/presentation/screens/ModelScreen.tsx
 D src/presentation/screens/ResumeScreen.tsx
 D src/presentation/screens/Screens.test.tsx
 D src/presentation/state/presentationReducer.test.ts
 D src/presentation/state/presentationReducer.ts
 M src/presentation/types.ts
 M tsconfig.json
?? docs/progress/phase-11-progress.md
?? index.ts
?? scripts/opentui-artifact.test.ts
?? src/presentation/ApprovalPrompt.ts
?? src/presentation/Conversation.test.ts
?? src/presentation/Conversation.ts
?? src/presentation/ModelPicker.ts
?? src/presentation/SessionPicker.ts
?? src/presentation/TerminalApp.test.ts
?? src/presentation/TerminalApp.ts
?? src/presentation/TranscriptLog.test.ts
?? src/presentation/TranscriptLog.ts
?? src/presentation/start.ts
?? src/test-support/FakeTerminalRuntime.ts
```

## Remaining work

Native Windows execution remains external validation: the Windows x64 cross-build and PE/rg contract pass, but console behavior/keys/restoration have not been executed on Windows. No required Linux/deterministic implementation work remains. Real Ollama source check and Linux source/standalone PTY workflows are complete. No commit created.

## Final summary

Verified Phase 11: active production presentation uses OpenTUI Core 0.5.14 through shallow product modules, native input/selection/focus/scroll/Markdown, stable committed history with independently batched live output, compact activity and focused approvals/pickers. Ink/React hooks/components/reducer/dependencies removed; verified runtime architecture untouched. Linux/Windows artifact contracts and rg preserved; actual embedded parser/native assets verified. Full release passed 437 tests / 3903 assertions, formatting, typecheck, Linux/Windows builds and smoke. Scripted source/packaged and real Ollama Linux PTY checks passed, including terminal restoration. Native Windows execution remains external. No commit.
