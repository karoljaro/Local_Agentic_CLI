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

Status: in progress.
