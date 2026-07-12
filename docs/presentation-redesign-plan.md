# Presentation redesign plan

Status: in progress (started 2026-07-12)

This document is the working record for the staged rebuild described in
`codex-prompt-agentic-cli-presentation.md`. It is updated after every implementation stage and
records the implementation that actually exists, not only the intended design.

## Stage 1 — analysis and target design

### Existing engine-to-UI flow

`createRuntime()` composes the session store, model runtime, agent loop, tools, approval callback,
model catalogue, and session queries. The old UI called the runtime directly:

1. a chat hook appended an optimistic user row;
2. `RunAgentTurn.run()` persisted `prompt.submitted` and yielded final-answer `contentDelta` chunks;
3. tool rounds were executed inside `ToolRunner`, with approval delegated through
   `runtime.setToolApprovalHandler()`;
4. all prompt, assistant, tool, and error events were persisted to JSONL;
5. the old UI appended the collected final answer locally, while resume reloaded only
   `prompt.submitted` and `assistant.message.completed` through `ListSessionEvents`.

The model stream itself is an `AsyncIterable`. In tool-enabled turns, intermediate model content is
buffered by the application layer while tool calls run; only the final response (or terminal denial
message) is yielded to the caller. Streaming deltas are intentionally not durable events.

### Functional reference retained from `ui_old/`

The reference establishes these required behaviours: interactive-terminal guard, new/resume startup,
model warm-up and switching, restoring the latest session model, abort with Escape, editable/pasteable
single composer, model/session keyboard lists, approval with yes/no keys, history restoration, and
Markdown rendering. Those behaviours will be reimplemented against the target design.

Small, independent ideas worth retaining after adaptation:

- text editing semantics (cursor movement, deletion, paste normalisation, Ctrl+A/E/U);
- abort-controller cleanup pattern;
- model metadata formatting and home-relative workspace formatting;
- safe Markdown tokenisation with raw HTML suppressed;
- extracting concise path/content previews from approval input.

No final file in `App.tsx` or `presentation/` will import `ui_old/`.

### Problems in the old presentation

- Tool lifecycle events are persisted but excluded from the transcript query and invisible live.
- The active answer is rebuilt with one React state update per delta, without batching.
- Completed history and the active stream are owned by the same large chat hook; command execution,
  model unloading, session loading, errors, and local transcript mutation are coupled there too.
- Opening `/model` or `/resume` clears chat state before navigation, so preservation relies on a
  remount/reload rather than stable screen state.
- Command metadata, parsing, and command effects do not share one registry; there is no command menu.
- The input is disabled for the whole turn even though the requested design requires it to remain
  usable during streaming (submission will still be guarded to prevent overlapping turns).
- Approval supports direct y/n only and has no selected decision or optional details.
- The session header and history are interwoven with conditional empty/header rendering.
- Tool, system, cancellation, and approval-waiting entries have no presentation types.
- The old Markdown renderer is substantially larger than the required syntax surface and includes a
  table subsystem not required by the redesign.
- Old components import each other through aliases that now point at the intentionally empty new
  presentation location; the pre-implementation typecheck therefore fails. `ui_old/` will be excluded
  from the active TypeScript program while remaining available as a functional reference.

### Target architecture

The target is a small unidirectional presentation layer:

```text
durably appended engine events + turn deltas + approval request
                         |
                         v
              PresentationController
                         |
                         v
      usePresentation state + active-stream buffer
                         |
                         v
       screen components / chat / composer / approval
```

User actions travel in the other direction through controller methods: run/abort turn, load sessions,
list/switch models, unload model, and resolve approval. Presentation maps data and focus; engine retains
agent iteration, persistence, model/provider calls, tool execution, approval consequences, and session
semantics.

Planned concrete structure (directories are created only when populated):

```text
src/App.tsx
src/presentation/
  adapters/PresentationController.ts
  approval/ApprovalView.tsx
  chat/ChatScreen.tsx
  chat/Transcript.tsx
  commands/commands.ts
  components/Markdown.tsx
  components/SelectionList.tsx
  hooks/useComposer.ts
  hooks/usePresentation.ts
  screens/ModelScreen.tsx
  screens/ResumeScreen.tsx
  state/presentationReducer.ts
  state/sessionEvents.ts
  types.ts
```

The exact structure may be consolidated as implementation shows which boundaries are useful.

### State, history, and stream design

- Completed transcript entries live in reducer state and are rendered through Ink `Static` with stable
  event/UI ids. The session header is a single static item.
- The active response is separate from completed history. Deltas enter a ref-backed buffer and flush at
  a short interval; completion flushes synchronously before promoting exactly one non-empty answer.
- Engine events append tool/system/error rows without copying or reparsing the entire session. Initial
  resume loading maps the complete durable event list once.
- Turn completion reconciles the streamed answer with its durable assistant event id, preventing local
  and event-observer duplication.
- Screen navigation is a small discriminated union (`chat`, `models`, `resume`); composer state remains
  mounted above screen-specific views or is stored in the presentation hook, so cancellation preserves
  the draft.
- Focus is explicit: exactly one of composer, command menu handling, selection screen, approval, or
  turn-cancel shortcut is active.

### Minimal engine contract change

Add a runtime subscription for successfully appended durable `AgentEvent` values. A small publishing
session-store decorator (or equivalent composition-level observer) will notify only after the delegated
append succeeds. This is provider- and UI-agnostic and allows presentation to show tool lifecycle events
without polling or moving tool logic into React. The unsubscribe function is mandatory and tested.

The existing `setToolApprovalHandler` remains the request/decision bridge. No domain approval policy is
moved to presentation.

### Stages and completion criteria

1. **Analysis and plan** — complete when engine, stream, sessions, commands, approval, tests, dependencies,
   and all old UI files have been inspected and this document records the target design.
2. **Foundation** — complete when the new App, types, reducer, controller, subscription cleanup, screen
   state, and application shell typecheck with no imports from `ui_old/`.
3. **Chat** — complete when session header/history, live batched response, pre-token loader, composer,
   footer context, error/cancel, and concise tool rows work and have focused tests.
4. **Commands** — complete when one registry drives parsing/menu labels/effects, filtering and keyboard
   navigation work, and draft/focus behaviour is tested.
5. **Screens** — complete when model and resume use one selection mechanism, support loading/error/filter,
   preserve chat/draft on cancel, and commit through runtime APIs.
6. **Approval and tools** — complete when selected decisions, optional details, exclusive focus, cleanup,
   and one/multiple tool lifecycle sequences are covered.
7. **Markdown and finish** — complete when required block/inline syntax is readable at narrow widths and
   unused new code is removed.
8. **Optimisation and verification** — complete when render scope/cleanup are reviewed and format check,
   typecheck, complete tests, build, and relevant smoke checks pass (or an external-only limitation is
   explicitly recorded).

### Baseline verification

- `bun run typecheck`: failed before implementation because `src/App.tsx` exports no `App` and archived
  `ui_old/` alias imports target the absent new presentation files.
- `bun test`: not reached by the chained baseline command because typecheck failed first.
- Biome lint is disabled by repository configuration; `format:check` is the effective static style check.

## Stage log

### Stage 2 — foundation (complete)

Implemented:

- `src/App.tsx` now exports a small initial orchestration shell with injected-controller support and an
  interactive-terminal guard;
- `presentation/types.ts` defines screens, stable history entries, active tools, selection states, and
  turn state without depending on React;
- `RuntimePresentationController` is the only presentation adapter over the concrete runtime;
- `presentationReducer` owns completed history and active tool transitions;
- `StreamBuffer` owns ref-like high-frequency delta batching outside completed history;
- startup parsing moved into the active presentation and is wired by `index.tsx`;
- archived `ui_old/` is excluded from the active TypeScript program. It remains unchanged and available
  for reference and old behavioural tests.

Engine contract changes:

- `PublishingSessionStore` decorates the real JSONL store and publishes a durable `AgentEvent` only after
  `appendSessionEvent` succeeds. Listener exceptions cannot affect the engine, and unsubscribe removes
  the listener.
- Runtime now exposes `subscribeSessionEvents(listener)`.
- `ListSessionEvents` now returns every durable event for the requested session, not only user/final
  assistant messages. This is required to restore the same concise tool timeline shown live. It also
  defensively filters mismatched session ids.

No agent loop, provider, tool execution, persistence format, approval policy, or session reducer domain
logic changed.

Verification after stage 2:

- `bun run typecheck`: pass.
- Focused tests for publishing, full event listing, startup, stream batching, and presentation reduction:
  10 pass, 0 fail.
- Biome format on all touched files: pass.

### Stage 3 — main chat

Status: complete.

Implemented:

- `Transcript` always starts with one stable session header and renders completed entries through Ink
  `Static`; user, assistant, system, tool, error, and cancellation rows have textual markers in addition
  to colour;
- active stream text lives only in `StreamBuffer` and is read with `useSyncExternalStore` by `LiveTurn`,
  so token batches do not update or copy the completed history array;
- 32 ms batching flushes every delta on completion/error and timers are cleared on start, reset, and
  disposal;
- the waiting animation mounts only during `waiting`, unmounts on the first non-empty delta, and owns a
  cleanup function for its interval;
- `useChatSession` reconciles the final durable assistant event with buffered text, suppressing the live
  observer copy until exactly one completed row is promoted;
- errors before/after the first token, abort, partial assistant output, empty final responses, and
  intermediate assistant text around tool rounds are handled explicitly;
- requested/running tools remain dynamic; terminal success/failure becomes concise static history;
- the composer supports cursor editing, paste normalisation, Ctrl+A/E/U, empty-submit and duplicate-submit
  guards. It remains editable during a turn but cannot submit an overlapping turn;
- the footer shows active model, workspace, and compact session id;
- the first Markdown implementation covers required paragraphs, headings, lists, inline formatting, and
  fenced code while suppressing raw HTML.

Focus at this stage is exclusive between composer, turn-cancel handling, and the approval view. The
approval view was introduced early so a mutating tool cannot deadlock while later command/screens work is
in progress; its final stage-6 verification remains pending.

Verification after stage 3:

- `bun run typecheck`: pass.
- presentation tests (stream, reducer/tool sequences, composer editing, Markdown, transcript, startup):
  10 pass, 0 fail.
- Biome format: pass.

### Stage 4 — command system

Status: complete.

- `COMMANDS` is the sole source for names, usage, descriptions, argument support, and action ids.
- The parser separates metadata from effects and handles `/model`, `/model <name>`, `/resume`, invalid
  arguments, and unknown slash commands.
- The command menu opens for slash input, filters metadata, handles empty results, Up/Down, Tab, Enter,
  and Escape, and disappears with the composer rather than becoming durable history.
- A submission lock prevents repeated Enter events. Opening a screen preserves the slash draft; commit
  clears it, while cancellation restores chat with the draft intact and the menu dismissed.

### Stage 5 — model and resume screens

Status: complete.

- Both screens use the same generic `SelectionScreen` for keyboard ownership, filtering, bounded viewport,
  loading/submitting/error states, confirmation, and cancellation.
- Model selection marks the current model and shows available size/quantisation metadata. The old model is
  unloaded only on commit (not when merely opening the screen), then runtime switches the model.
- Resume includes New chat and session rows enriched with last durable timestamp and latest prompt preview;
  corrupt/unreadable individual histories degrade to an id-only row instead of failing the whole list.
- Resume options sort newest first. Selecting a saved session restores all transcript/tool events and the
  most recent explicit model. Initial `codesh resume` cannot cancel into a fabricated chat; in-chat resume
  can always return without changing session/history/draft.
- Chat state and composer live in the presentation hook above the screen components, so screen swaps do not
  destroy them.

### Stage 6 — approval and tools

Status: complete.

- Approval defaults to Reject, supports arrow selection + Enter, direct y/n, Esc reject, and optional
  details with `d`.
- The default view shows action, primary path/query/resource, decisions, and help only. It does not render
  old/new file content, full JSON, or diffs.
- The approval handler owns one pending resolver, rejects a superseded/unmounted request, unregisters from
  runtime, disables composer/turn shortcuts, and restores focus after resolution.
- Tool requested/running state is dynamic and concise; completed/failed state becomes stable history.
  Multiple calls are tracked by `toolCallId`, including independent terminal success/failure.

Additional engine streaming correction discovered during these stages:

- Tool-enabled model rounds previously buffered all content until the round ended, including the final
  answer. `RunAgentTurn` now yields deltas from every round immediately. A durable
  `assistant.tool_calls.completed` event is the presentation boundary that promotes intermediate text,
  clears the active buffer, and starts waiting for the next round. This preserves model context and event
  semantics while satisfying real-time rendering; the application test explicitly covers it.

Verification after stages 4–6:

- `bun run typecheck`: pass.
- Presentation plus complete `RunAgentTurn` suite: 48 pass, 0 fail.
- Includes render tests for model/resume/approval, parser/menu filtering, resume metadata, a multi-tool
  success/failure sequence, and 31 application agent-turn scenarios.
- Biome format: pass.

### Stage 7 — Markdown and visual finish

Status: complete.

- The lightweight renderer uses the existing `marked` dependency but owns a new, smaller Ink mapping.
- Supported blocks: paragraphs, headings, ordered/unordered/task lists, block quotes, horizontal rules,
  and fenced code. Supported inline forms: bold, emphasis, strike, inline code, links, images-as-labels,
  escapes, and line breaks.
- Raw HTML is suppressed. Code has no frame or horizontal padding, normalises tabs/CR, remains copyable,
  and wraps within the terminal.
- Message bodies use only a two-column marker indent and one vertical line between entries; there are no
  per-message frames or large banners.
- Narrow-width render tests at 24/28 columns verify both prose and code stay within the terminal. Flex
  layout and Ink window-size state provide resize behaviour without cached widths.
- The old table-heavy renderer was rejected; tables were outside the required syntax surface and would
  add disproportionate layout code. The archived renderer's value import was changed to a relative
  archived path solely so its historical test remains runnable after the active alias moved.

Reuse decision: no source file was copied wholesale. The new Markdown component retains only the sound
ideas identified in stage 1 (Marked tokenisation, suppressing HTML, normalising terminal code lines) in a
new and smaller structure. Input editing and approval preview semantics were likewise reimplemented in
the new hooks/formatters rather than imported from `ui_old/`.

Verification after stage 7:

- focused narrow Markdown/transcript tests: 5 pass, 0 fail;
- `bun run typecheck`: pass;
- Biome format: pass.

### Stage 8 — optimisation and final verification

Status: in progress.
