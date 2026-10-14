# Phase 22 — Settings and Configuration Management

Status: implemented and validated. Phase 21 is complete; Phase 19 investigation remains closed.

## Baseline

- HEAD: `002533e11def3db9d51a3e34dcc682623406a62d` (`feat: enhance session handling and error reporting in TerminalApp`).
- Initial worktree: clean. No unrelated changes to preserve.
- No applicable `AGENTS.md` found in the repository or its ancestor directories.
- No commits, live inference, downloads, model experiments or follow-on phase are authorized by this phase.

## Configuration inventory and implementation decisions

Inspected `config`, startup/composition, `ModelSelection`, the legacy model store, catalog/HTTP/chat
adapters, ContextBuilder/request estimator, memory profile consumption and Phase 21 modal/focus/
mouse/error routing. Bun already populates `Bun.env`; there is no separate dotenv loader. The local
ignored `.env` contains keys TEST_MODEL, OLLAMA_BASE_URL, MODEL_CONTEXT_TOKENS,
MODEL_MAX_OUTPUT_TOKENS and HISTORY_EMBEDDING_MODEL; no values/secrets were dumped.

| Baseline value | Source/default | Real consumer | Already persisted? | Application / Settings decision |
| --- | --- | --- | --- | --- |
| Ollama endpoint | OLLAMA_BASE_URL / localhost:11434 | Catalog, chat HTTP client, optional embedding adapter | No | Immutable clients: save for restart; included |
| Startup/selected model | OLLAMA_MODEL / unset, `.agent/model-preference.json` | ModelSelection resolution/activation; adapter identity | Last successful manual selection | Shared authoritative preference; confirmed selection live; reset automatic on restart |
| Keep-alive | OLLAMA_KEEP_ALIVE / `0` | Ordinary Ollama chat and memory requests | No | Included; next request snapshot; explicit unload remains `0`, activation unchanged |
| Context | MODEL_CONTEXT_TOKENS / 16384 | ContextBuilder, request profile/options, memory extraction | No | Included; next new turn/derived operation, never mutate active request/continuation |
| Max output | MODEL_MAX_OUTPUT_TOKENS / 4096 | Output reservation and provider num_predict; memory cap | No | Included; validated together with context, next new turn |
| System instruction | SYSTEM_PROMPT / unchanged 1390-character guidance | ContextBuilder | No | Operational override, excluded; no prompt editing/tuning |
| History embeddings | HISTORY_EMBEDDING_MODEL / unset | Optional HistoryRetriever/OllamaEmbeddingAdapter | No | Operational/development setup, excluded; retrieval semantics unchanged |
| Theme/presentation | Terminal default RGBA colors; existing fixed accents | Native chat/Markdown/modals | No | No safe application theme switch; omitted |
| New/resume startup | CLI `resume` / `--resume`, default new | startupMode, session picker | Session data separately | Navigation, not a persistent preference |
| Workspace/session paths | cwd, `.agent/sessions`, derived memory/index paths | Tools, session/retrieval/memory stores | Sessions/derived data | Excluded; no canonical/derived-state migration |
| Context reserves | max(128, ceil(context/16)); memory/output/retrieval caps | Compiler, memory/retrieval | No | Preserve internally; no independent controls |
| Request behavior | stream=true, truncate=false, shift=false; structured tool mapping | Ollama adapter | No | Fixed protocol, not Settings; unchanged parsing/authority/templates |
| Tool/process/search limits | File 200000 B, read 400 lines/20000 chars, listing 500, search 50/300 chars/5000 ms; bounded process IO/timeouts | Existing tool factory/adapters | No | Internal safeguards/test construction options; excluded |
| Loop/renderer limits | 12 tool rounds; target/max FPS 30/60, alternate screen | AgentLoop, OpenTUI | No | Internal behavior; excluded |
| TEST_MODEL / synthetic fixtures | Optional explicit live-smoke variable / synthetic `test-model` fixtures | test-support and smoke scripts only | No | Dedicated test configuration excluded; arbitrary listed tags remain selectable |
| Build/diagnostic env | Existing OPENTUI assets/libc, inherited CI/process/Git environment | Build, native loading, diagnostic/test boundaries | No | Retained outside preferences |

Five actual fields are implemented: server URL, default model, keep-alive, context window and max
output. No placeholder Appearance/General sections, advanced sampling, provider plugins or secrets.

## Storage, migration and precedence

- One version-1 typed `settings.json`, with a strict `preferences` object. Linux XDG/fallback
  `~/.config/codesh`, Windows roaming AppData, macOS `Library/Application Support/codesh`.
- Built-in preference defaults live in `UserSettings`; production startup awaits validated
  preference loading before constructing provider clients. Explicit low-level config remains
  available for deterministic/test/development boundaries.
- Existing saved preferences win. Only a missing file admits the five legacy ordinary env
  fallbacks; the first successful save materializes all values. Missing keys in an existing file
  use defaults, including explicit null automatic-model preference. No stale env overrides a save.
- A valid workspace model preference wins over legacy OLLAMA_MODEL and migrates once into the
  same document. Archive only after confirmed persistence; an existing archive is preserved.
  Archive failure leaves an inactive legacy file, never a competing writer. Existing settings
  prevent later imports from other workspaces. Preferences are now application-wide.
- Migration write failure retains the previous model/file and reports the problem; a retry through
  Settings may save the retained values. Invalid legacy env also reports the problem and permits
  replacing it through Settings, preserving a valid legacy model. No TEST_MODEL import occurs.
- SYSTEM_PROMPT and HISTORY_EMBEDDING_MODEL remain operational env overrides. No ordinary env
  variable is removed from development/diagnostics; their production compatibility role changed.
- Bounded regular-file reads (16 KiB), strict schema and unknown/future-field rejection. Malformed,
  unsupported or unreadable files remain untouched and read-only until repaired/restarted.
- Serialized fresh read/modify writes, private new directories (0700)/files (0600), exclusive lock,
  synced same-directory temporary file, fingerprint comparison, atomic rename and awaited cleanup.
  A failed pre-commit write keeps the prior values/bytes. Post-commit cancellation keeps the commit.
  Independent-process lock contention reports retry; crashed locks/temp files require deliberate
  cleanup after all instances exit. No watcher, polling, credential persistence or power-loss claim.

## Runtime and interface

- `/settings` uses the existing registry, native renderables, focus/key routing, nested model picker
  and Error Dialog. Arrow navigation, explicit Enter save, Esc cancel/back, R selected reset, keyboard
  detail scrolling and mouse editing are supported. 26×6 compact rendering is tested.
- Chat keeps terminal-native selection; Settings/picker/error/approval own interactive mouse mode,
  and final return to chat disables reporting. Unsaved editor input survives nested errors/session
  metadata; model navigation cannot discard a text edit. Closing/shutdown abort/fence saves and
  drain pending work. Opening local settings does not cancel discovery or generation.
- Endpoint persists for restart with saved and active values shown separately. No endpoint probe,
  reconstruction, download, warmup or in-flight provider mutation.
- One ContextBuilder per new turn uses the latest validated profile across all of that turn's
  requests/continuations. Existing compilation/retrieval/history/tool semantics are unchanged.
  Memory extraction snapshots the same profile at its own next operation with its existing cap.
- Context range 8192–1048576; output 1–262144. Input after output/safety must be at least
  max(4096, actual fixed system/tool estimate + 1024). Default fixed estimate is 2259 tokens;
  default available input is 11264. No promise of universal model context/GPU capability.
- Keep-alive changes affect the next provider request; selector offers 0, 5m, 30m, -1, provider
  default and an existing valid legacy duration. Explicit activation/unload policy is unchanged.
- Both UI surfaces invoke existing ModelSelection, retain confirmed identity while pending, persist
  after successful activation and reconcile actual failures. A persistence warning opens Error Dialog
  while preserving confirmed runtime selection. Model reset clears only the next-start preference.
- No theme field: current rendering follows terminal colors and lacks an application theme switch.

## Deterministic coverage

- Disposable file stores/fake IO and runtime boundaries cover default/seed/reload/migration/reset,
  stale env, test-only isolation, URL/budget validation, unknown/future fields, malformed recovery,
  atomic/permission failures, serialized/independent/manual concurrent writes and cancellation.
- Native renderer tests cover navigation/editing/validation/save/error/focus, nesting/synchronization,
  pending/failed activation, unavailable/stale lists, active discovery/generation, shutdown, narrow
  resize, keyboard detail scrolling and terminal-native mouse restoration.
- A native UI → real disk → fresh production composition integration test edits inference budgets,
  selects through `/model`, reopens Settings, reloads and verifies the real adapter request using
  scripted HTTP responses. Other preferences and original malformed bytes are preserved.
- No actual user's settings file, Ollama inference, downloads or provider qualification used.

## Validation

- Initial focused configuration run: 61 passed. Native UI/integration refinement: 64 passed.
- First full run: 1311 passed / 1 failed; failure exposed a changed slash-menu ordering. Restored
  the existing command order and reverified that navigation contract. No production/tool policy
  test required changing its behavior or assertions.
- Final focused run: **92 passed, 0 failed, 307 assertions across 7 files**.
- Final standalone `bun test`: **1312 passed, 0 failed, 9088 assertions across 80 files**.
- `bun run typecheck`: passed. `bun run format:check`: passed (218 files).
- `bun run build:linux`: passed. `bun run build:windows`: passed (cross-build only).
- `bun run smoke:build`: passed. `git diff --check`: passed.
- `bun run release:check`: passed, repeating format/typecheck, all **1312** tests, both builds
  and the artifact smoke. Final documentation-only formatting/diff checks also passed.
- Controlled actual OpenTUI renderer/PTY smoke passed using a fake runtime and disposable disk
  settings. Exercised `/settings`, four arrow moves to output, text editing/Enter confirmation,
  confirmed disk value 2048, Esc back to chat, reopen, resize 80×24 → 26×6, Esc and Ctrl+C shutdown.
  Observed focus composer → settings choices → editor → choices → composer; mouse reporting false
  in chat, true in Settings and false on shutdown. Zero turns/history entries, network or inference.
  Temporary smoke storage was removed; bounded evidence is in `/tmp/phase22-native-smoke-evidence.json`.

## Known limits

Windows cross-build cannot prove native Windows runtime behavior; macOS runtime is untested.
No live Ollama endpoint/model/context behavior is claimed from scripted requests. Endpoint and
model reset require restart. External manual file changes require restart; no watcher exists.
Independent instances may see stale cached display until restart, but saves re-read and merge
current valid preferences and never overwrite an active transaction. Filesystem locks from a
terminated process require cleanup; atomic replacement is not a hardware power-loss guarantee.

## Final repository state and decision

- HEAD remains `002533e11def3db9d51a3e34dcc682623406a62d`; no commit.
- 14 tracked modifications and 14 new files, all Phase 22 implementation/tests/docs. No dependency,
  lockfile, prompt, model/tool authority, stream parser, canonical reducer/session storage, Git
  inspection, process approval or Markdown streaming change.
- Ordinary user preferences are connected to actual production configuration and shared model
  persistence. Endpoint/reset-model restart semantics and active-request boundaries are explicit.
- Completion decision: **Phase 22 complete**. All requested gates passed; no Phase 22.1 or model
  investigation begins. No commit created.

## Pre-release correction — chat scrolling and terminal copying

This is a focused bugfix before the first stable release, with no new development or diagnostic
phase. It supersedes the reporting-disabled chat behavior described above and in Phase 21's
terminal-selection correction; those earlier validation records remain historical.

- Fix baseline HEAD: `36fd9e16d47a11003055d8c057d966bddd9a2b2b`. No applicable `AGENTS.md`.
  Changes preserve the surrounding README and unrelated work. No commit, tag, publication,
  application-version, dependency or lockfile change.
- Before editing, inspected the real `TerminalApp.transcript` ScrollBox, startup configuration,
  modal/focus lifecycles, native input routing, and installed OpenTUI **0.5.14** declarations and
  implementations for renderer, ScrollBox, ScrollBar and Slider. Also checked the
  [versioned upstream ScrollBox source](https://raw.githubusercontent.com/anomalyco/opentui/v0.5.14/packages/core/src/renderables/ScrollBox.ts).
- Root cause: startup and normal chat explicitly disabled mouse reporting, so parsed wheel and
  pointer events could not reach chat hit testing. The general scrollbar configuration also
  requested `visible: false`; this version can recalculate that initial visibility on overflow,
  yielding a drawn scrollbar whose interaction is still disabled by mouse mode. A visible bar
  or a `useMouse` assertion alone therefore does not prove working interaction.
- Restore reporting at startup and when composed with an existing renderer. Use the native
  overflow-controlled vertical scrollbar, with a one-column track and existing accent/default
  terminal colors. OpenTUI's Slider handles track clicks, thumb dragging and capture; its existing
  ScrollBar/ScrollBox callbacks update content translation and sticky-follow state. No custom
  scrollbar event implementation or dependency patch.
- On view transitions, clear renderer selection and briefly disable/re-enable reporting through
  the supported setter. Disabling resets native capture and parsed button state, including a
  drag interrupted by closing a modal. Chat and every interactive modal retain reporting;
  shutdown leaves it disabled. Existing focus restoration remains intact.
- PageUp/PageDown and Ctrl+Home/End retain their behavior, as do composer arrows and ordinary
  Ctrl+C cancellation/exit. Existing distinguishable Ctrl+Shift+C handling remains ahead of
  Ctrl+C, with no cancellation, exit, draft input or chat clipboard write. Indistinguishable raw
  Ctrl+C bytes retain the existing policy. Neither `/copy` nor the removed chat-selection/
  clipboard implementation was restored; Error Dialog's existing Copy details action is retained.
- README now says: "To copy text, hold Shift while selecting it with your mouse, then press
  Ctrl+Shift+C (or your terminal's copy shortcut)." Ordinary dragging is delivered to OpenTUI.
  Architecture notes reflect application scrolling and terminal-native Shift selection.
- No model, agent, tool, provider, streaming, Conversation, canonical history, Git inspection,
  settings storage or persistence implementation changed.

### Regression coverage and evidence boundaries

- Added **11** native-renderer regression cases in `ChatScrolling.test.ts`. SGR input is simulated,
  while the installed native renderer performs actual layout, hit testing, mouse capture,
  viewport culling and scrolling. Assertions check both positions/content translation and rendered
  messages, rather than only the reporting flag.
- Cover wheel up/down through chat content; visible scrollbar track clicks; thumb dragging both
  ways and outside its track across render frames at 70×24 and 32×12; keyboard pages/ends; draft,
  focus and position preservation; resize; following streamed output at the bottom; staying on
  older messages during live growth/commit; wheel/scrollbar use after completion.
- Open/close model and session pickers, Settings, approval, Error Dialog and Workspace Changes.
  Interrupt a live modal drag, then verify restored chat focus/position and functioning wheel and
  scrollbar. Check overlay mouse routing does not scroll chat underneath. Existing modal tests
  retain nested Settings/model/error focus, mouse actions, error/detail and Workspace Changes
  scrolling, late-result fencing, Ctrl+C, Kitty/modifyOtherKeys Ctrl+Shift+C and shutdown cleanup.
- Updated only obsolete reporting-disabled assertions in the existing mouse/Settings tests;
  retained shutdown-disabled assertions and existing keyboard/cancellation contracts.
- Focused native renderer run: **94 passed, 0 failed, 1,548 assertions across 7 files**.
  Evidence: `/tmp/codesh-chat-scroll-focused.log`.
- Controlled real-PTY smoke uses the actual renderer with the existing fake runtime and a mock
  syntax parser, injecting SGR mouse and keyboard bytes through a real PTY. It performs no model
  inference, provider requests, tool execution, session/settings disk writes or clipboard writes.
  This verifies application behavior and terminal protocol output, rather than physical mouse
  gestures or desktop clipboard integration.
- Initial PTY runs reached the scrolling/modal/stream/copy-shortcut checks, then the temporary
  observer read `composer.plainText` after shutdown and raised `EditBuffer is destroyed`.
  Corrected only that observer to avoid destroyed-node access; final PTY result is recorded below.
- Final controlled PTY smoke **passed**, exit code **0**, with **46** successful checks and **56**
  state/frame captures. Verified wheel directions, scrollbar track click and out-of-track thumb
  capture, keyboard pages/ends, all six modal lifecycles, nested error return to model picker,
  approval/error/Workspace Changes detail scrolling, stream follow/older-message preservation,
  post-stream scrolling, distinguishable Ctrl+Shift+C without exit, ordinary Ctrl+C shutdown,
  and native mouse-mode enable/disable sequences on the PTY wire. Evidence:
  `/tmp/codesh-chat-scroll-pty-evidence.json` and `/tmp/codesh-chat-scroll-pty.log`;
  reproducible temporary harness: `/tmp/codesh-chat-scroll-pty.py` plus
  `/tmp/codesh-chat-scroll-pty.ts`. No physical selection/copy result is inferred from this smoke.
- **Manual Ptyxis acceptance: passed, reported by the user in this session.** The user confirmed
  working scroll/mouse and scrollbar interaction, plus Shift + mouse selection followed by
  Ctrl+Shift+C copying, in response to the requested check that Codesh stays open. This is manual
  user-observed evidence, separate from the simulated native-renderer input and controlled PTY.

### Required release validation

| Command | Result | Evidence |
| --- | --- | --- |
| `bun test` | Passed: 1,323 tests, 0 failures, 9,234 assertions, 81 files | `/tmp/codesh-chat-scroll-test.log` |
| `bun run typecheck` | Passed | `/tmp/codesh-chat-scroll-typecheck.log` |
| `bun run format:check` | Passed: 219 files | `/tmp/codesh-chat-scroll-format-check.log` |
| `bun run build:linux` | Passed | `/tmp/codesh-chat-scroll-build-linux.log` |
| `bun run build:windows` | Passed, cross-build | `/tmp/codesh-chat-scroll-build-windows.log` |
| `bun run smoke:build` | Passed | `/tmp/codesh-chat-scroll-smoke-build.log` |
| `bun run release:check` | Passed: format/typecheck, all 1,323 tests, both builds, artifact smoke | `/tmp/codesh-chat-scroll-release-check.log` |
| `git diff --check` | Passed, including final documentation | Working-tree check |

Final documentation-only format and diff checks passed after recording these results. HEAD remains
the fix baseline. This pre-release bugfix is complete; no commit, tag, publication or version change.
Windows/macOS physical terminal interactions are not exercised by Linux tests or a Windows
cross-build. The required manual Ptyxis checks are complete; no further phase is opened.
