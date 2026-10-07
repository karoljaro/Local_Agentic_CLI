# Local_Agentic_cli — simplification and refactoring implementation plan

This document is an **implementation plan, not an audit**. **No implementation has been performed during this planning stage.** It is based on `docs/audits/architecture-simplification-audit.md`; repository inspection was limited to resolving implementation dependencies, contracts, and validation requirements.

## 1. Source audit and audited commit

- Primary source: [architecture-simplification-audit.md](../audits/architecture-simplification-audit.md), especially sections B–F. Section G supplies boundaries, not the execution order.
- Audited commit: `5aa8ffd`; full commit inspected: `5aa8ffde7963c3a4ec15d7c3442a54b77ad39cc3`.
- The planning checkout's HEAD matches that commit. Initially, `git diff --name-only` was empty and `git status --short` showed the existing, untracked `docs/audits/` directory. That audit is an input and must not be overwritten or included accidentally in implementation commits.
- Inspected implementation seams: composition/controller, agent loop, tool runner/registry/providers, session cache/publisher/reducer/store, presentation hooks/reducer/buffer, workspace adapters, configuration defaults, and build/smoke scripts. Existing tests were inspected for reusable coverage and missing regressions. No fresh repository-wide audit was conducted.
- Tests, typecheck, builds, and interactive flows were **not run during planning**. Commands below are requirements for the later implementation goal, not reported results.

Only `docs/plans/simplification-refactor-plan.md` was created during this stage. All source, test, configuration, dependency, script, and deletion scopes below describe future implementation work.

## 2. Refactoring goals

1. Remove forwarding classes and result wrappers while retaining an injectable presentation API.
2. Make one explicitly composed session service own persistent appends, selected-session state, incremental reduction, and commit notifications. Browsing previews must not retain model context for every session.
3. Make the session reducer the only assembler of assistant/tool model history. The agent loop owns rounds and context budgeting; ToolRunner owns tool lifecycle and per-turn deduplication.
4. Prepare each tool call once, including normalized arguments and execution metadata, while validating the whole batch before any batch persistence, approval, or workspace IO.
5. Correct cancellation, persistence-error classification, streaming round status, literal edits, and lossless read continuation with explicit regression coverage.
6. Remove confirmed dead code and local duplication after ownership has settled. Preserve useful abstractions and existing folder boundaries.

The endpoint is a small runtime/composition API; an agent loop for model orchestration; ToolRunner plus the Zod registry for prepared execution; session service plus reducer for durable conversation and model context; isolated Ollama integration; safe workspace adapters; and presentation for UI state and interaction. No folder reorganization, event-format migration, retries, new persistence engine, or general plugin/tool framework is required.

## 3. Global invariants

- **Model boundary:** retain `ModelPort`, `ModelMemoryPort`, Ollama adapter, HTTP client, mapper, and NDJSON parser. Application logic continues to depend on ports rather than infrastructure implementations.
- **Conversation reconstruction:** JSONL remains authoritative. Incremental state and fresh replay produce equivalent model messages, including IDs, assistant tool-round content, normalized arguments, result order, failure serialization, and deduplicated-result references. `ContextBuilder` applies the same budget to live and resumed state.
- **Atomic model visibility:** an assistant tool-call batch and its results enter model context only when every call has a terminal event, in original call order. Partial results remain persisted but an unfinished batch is excluded from reconstructed model context. This is replay atomicity, not rollback of workspace side effects.
- **Persistence:** preserve append ordering, missing-session behavior, malformed-event validation, and ignoring an incomplete final JSONL line. Successful append is the existing adapter's commit boundary; this plan does not claim fsync or crash-transaction guarantees. Update cache and notify observers only after the adapter resolves successfully; observer failures cannot change commit outcomes.
- **Approval and tools:** reads remain automatic; creation/editing require explicit approval, defaulting to denial. Explicit denial ends the turn and closes later calls as cancelled without executing them. Validate the complete batch before assigning persisted tool-call IDs or starting it. No automatic retry of tool execution or failed persistence.
- **Cancellation:** use one turn signal across model rounds, approval waiting, and tool execution. Cancellation prevents subsequent work; it does not undo an already completed mutation or abandon an in-progress atomic write. A late approval cannot revive an aborted turn. Successful work must be recorded truthfully if its result can still be appended.
- **Failure truthfulness:** a storage/serialization failure after tool success must reject the turn with that cause, never manufacture `TOOL_FAILED`, feed a false tool error to another model round, or retry the mutation.
- **Workspace safety:** preserve realpath containment, symlink escape prevention, protected paths, byte/output limits, temporary-file cleanup, atomic replacement, `wx` creation, and expected-content checks. Keep `EditWorkspaceFile`'s exactly-one-match policy.
- **UI:** preserve `StreamBuffer` throttling and separate `LiveTurn`, distinct model/presentation reducers, reusable interactive components, event-ID deduplication, and foreign-session filtering. Each model round can stream. Durable completed messages appear once; uncommitted partial output remains visible locally after interruption without being persisted as a completed answer.
- **Models and resources:** unload the previous model before committing a model switch; unload failure/cancellation leaves the selected model unchanged. Preserve injectable clocks/ID generation, diagnostic failure isolation, stream-reader/process cleanup, timers, subscriptions, and approval-listener cleanup.
- **Compatibility:** retain legacy tool replay and existing session files. Raw public tool execution must still validate input even after the runner gains a prepared execution path.

## 4. Dependency and ordering rationale

The sequence deliberately differs from the audit's numbering. First establish correctness around workspace operations and tool lifecycle. Then consolidate session ownership before exposing the final runtime API or removing live context assembly. Stabilize commit-driven presentation before changing the model/tool data path. Optimize budgeting and share safety policy only after the principal ownership changes are verified. Finish with deletions and small mechanical changes.

| Phase | Depends on | Reason for position |
| --- | --- | --- |
| 1. Focused workspace correctness | Baseline | Two local bugs can be fixed without changing orchestration or ownership. |
| 2. Tool cancellation and persistence correctness | Baseline; use phase 1's safe operations | Establish truthful lifecycle behavior before changing prepared execution or session ownership. |
| 3. Single session service and bounded selected-session cache | 2 | Put commit order and cache lifetime under one owner before using its state after every tool batch. |
| 4. Direct runtime API and model-switch ownership | 3 | Expose final selected-session/preview operations once, eliminating wrappers without a later API rewrite. |
| 5. Commit-driven presentation and per-round streaming | 2–4 | Use stable commit notifications and the final runtime injection seam; fix status and finalization together. |
| 6. One-time prepared tool execution | 2 | Keep proven lifecycle semantics while replacing validation/dispatch representation. Scheduled after phase 5 to limit simultaneously changing behavior. |
| 7. Reducer-owned context and common model rounds | 3, 5, 6 | Consume completed durable batches through the session service and remove ToolRunner's duplicate model representation in the same phase. |
| 8. Exact context sizing without repeated serialization | 7 | Optimize the now-canonical context path separately from changing its ownership. |
| 9. Shared workspace policy data | 1, 2 | Share policy values after file semantics and execution cancellation are stable; leave checks in each adapter. |
| 10. Confirmed dead code and remaining local simplifications | 4–9 | Verify reachability against the final architecture, avoiding cleanup of code needed during migration. |

Phases 1 and 2 are independently reviewable correctness changes. Phase 3 combines cache and publishing because leaving two owners would retain the original ambiguity. Phase 4 combines runtime/controller/listing changes and moving unload because deleting the controller alone would lose its only real policy. Phase 7 combines removal of `currentMessages`, `toolMessages`, and the separate no-tools path because retaining either context producer creates a temporary architecture.

No phase should require the following phase to compile or pass its targeted tests. Do not combine phases 2, 3, 6, and 7 in one unchecked rewrite. Keep phases 8–10 in small reviewable commits, validating independent subchanges before proceeding.

### Execution preflight and validation conventions

At the start of the later goal, record `git rev-parse HEAD`, `git status --short`, and `git diff --name-only`. If affected source has diverged from the audited commit, reconcile only those differences before applying the plan. Preserve unrelated user changes. Run `bun run release:check` as a baseline when dependencies and build targets are available; record pre-existing failures separately.

Use existing Bun scripts. Every phase requires its listed targeted tests and `bun run typecheck`. Run `bun test` at the major ownership/contract gates specified below and at the end; there is no need to repeat identical broad checks without a new change or unresolved failure. Formatting checks are read-only: `bun run format:check`. Any format writes during implementation must be limited to deliberately changed files.

The current full suite is `bun test`, including `scripts/release-artifacts.test.ts`. `test:unit` and `test:integration` are subsets; `test:contract` currently runs only `OllamaModelAdapter.test.ts`, so it does not replace the full suite. Builds create `dist/`; CLI exercises create `.agent/` in their working directory. Perform interactive validation in a disposable workspace, not this source checkout.

## 5. Ordered implementation phases

### Phase 1 — focused literal-edit and read-continuation fixes

**Goal**

Fix literal replacement and character-limited reads without changing agent orchestration. These are correctness changes, not generic cleanup.

**Why this phase happens here**

Both bugs are confined to workspace operations and can be verified before any runner, session, or UI changes. Implement the edit fix and continuation fix as separate subchanges within this phase so each failure has a narrow cause. The read schema must be stable before registry preparation changes in phase 6.

**Scope**

- `src/application/use-cases/file-operations/EditWorkspaceFile.ts`: `EditWorkspaceFile.execute`.
- `src/infrastructure/tools/providers/ReadFileProvider.ts`: `readFileInputSchema`, `ReadFileInput`, `readFileTool`, `sliceFile`.
- `src/application/use-cases/file-operations/EditWorkspaceFile.test.ts` and `src/infrastructure/tools/LocalToolExecutor.test.ts`: edit and read contract/regression cases.
- `src/composition/factories/createLocalToolExecutor.ts`: existing limits are exercised, not increased.
- `src/infrastructure/file-system/NodeWorkspaceFileSystem.test.ts`: existing safety coverage remains the validation boundary; no filesystem rewrite is needed.

**Changes**

1. Replace `file.content.replace(input.oldText, input.newText)` with callback replacement, returning `input.newText` literally. Keep match counting and `expectedContent` unchanged. Do not reinterpret escapes or relax exactly-one-match enforcement.
2. Preserve existing line-based inputs and add optional `startOffset`, a zero-based JavaScript UTF-16 string offset into the decoded file. It is a continuation cursor, not a byte offset. Reject supplying both `startOffset` and `startLine`; permit `endLine` to keep the original inclusive range endpoint. Validate offsets against the loaded content before slicing. Offset equal to the range endpoint returns an exhausted page; offsets beyond it fail.
3. Add optional output `nextRead: { path, startOffset, endLine? }`, present only when content remains inside the requested range. Include the original explicit `endLine` when supplied. The tool description/schema must tell the model to pass `nextRead` unchanged for continuation, rather than infer `endLine + 1`. Existing `startLine`/`endLine` output describes touched lines and does not guarantee a complete final line.
4. Keep the existing first-page line-range content and metadata for callers without a cursor. Calculate its absolute consumed endpoint before returning a character-limited prefix. If it ends mid-line, the next cursor points to the first unreturned character on that line. If a line-limit page excludes its terminating newline, the next cursor points to that newline rather than skipping it.
5. Cursor-mode pages return contiguous substrings from that exact offset, bounded by `maxCharacters`, `maxLines`, and the requested range's absolute endpoint. Count a newline as the terminator of the current line segment; include it when reached, so even a cursor positioned at a newline makes progress. Do not normalize CRLF or decode escapes again. For an explicit `endLine`, the endpoint excludes that line's following newline, matching the existing range contract; the default whole-file endpoint includes all original content.
6. Preserve the existing `truncated` meaning (a partial-file/range view), empty-file `endLine: 0`, and all byte limits. `nextRead` specifically indicates remaining forward content; do not use `truncated` alone as a pagination loop condition. Historical tool outputs without `nextRead` remain replayable as opaque output.

**Invariants**

- `$&`, `$$`, `` $` ``, and `$'` in `newText` are written literally.
- One approved edit changes exactly one occurrence and rejects a stale file; byte limits and atomic writes remain intact.
- Following returned cursors over an unchanged file reconstructs the requested content with no skipped or duplicated characters, including a line longer than the output limit.
- Every non-exhausted cursor page consumes content and respects existing limits. Existing line-only calls remain valid.

**Tests / validation**

- Add table-driven literal-replacement cases in `EditWorkspaceFile.test.ts` and one real-filesystem `$&` case through the registry. Retain missing/multiple-match, multiline, escaped-newline, stale-write, and size-limit tests.
- Expand the existing character-limit test: `abcdefghij` with limit 5 returns `abcde`, then `fghij` via `nextRead`, rather than continuing at line 2. Paginate a multiline fixture until `nextRead` is absent and assert exact reconstructed content.
- Cover line-limit/newline boundaries, CRLF, Unicode offsets, exact character-limit EOF, trailing newline, empty file, explicit `endLine`, invalid/combined cursors, and very long single lines. Tests must prove progress and output bounds, not merely inspect the first page's metadata.
- Targeted: `bun test src/application/use-cases/file-operations/EditWorkspaceFile.test.ts src/infrastructure/tools/LocalToolExecutor.test.ts src/infrastructure/file-system/NodeWorkspaceFileSystem.test.ts`.
- Typecheck: `bun run typecheck`. Full suite/build: final gate; no interactive check needed here.

**Completion criteria**

Both regression cases pass through public tool execution; cursor paging has an explicit, schema-visible contract; no limits or edit policy have changed; existing safety tests pass.

**Risk: medium** — cursor endpoint/newline mistakes can cause omission, duplication, or a non-progressing loop. The replacement callback itself is low risk.

### Phase 2 — isolate tool lifecycle correctness

**Goal**

Prevent execution after cancellation during approval and prevent successful tool execution from being reported as `TOOL_FAILED` when its result cannot be persisted.

**Why this phase happens here**

This is the highest-risk behavior change. Verify it against the current runner and registry before replacing either representation or the session decorators. Later phases must preserve these regressions rather than discover the rules during their refactors.

**Scope**

- `src/application/services/ToolRunner.ts`: `executeToolCalls`, `requestToolApproval`, `executeToolCall`, terminal-event appends, diagnostic helpers.
- `src/application/use-cases/RunAgentTurn.ts`: `runTurn`, `runWithTools`, model-round boundaries, best-effort agent-error reporting.
- `src/application/ports/ToolExecutorPort.ts`: add separate `ToolExecutionOptions` with optional signal; retain raw request shape for persistence.
- `src/infrastructure/tools/LocalToolExecutor.ts` (`LocalToolRegistry.execute`), `src/infrastructure/tools/LocalTool.ts` (`LocalTool.execute` / `LocalToolOptions.execute`): carry execution options without including them in tool arguments.
- `src/infrastructure/tools/providers/ListFilesProvider.ts`, `src/infrastructure/tools/providers/ReadFileProvider.ts`, `src/infrastructure/tools/providers/SearchFileProvider.ts`, `src/infrastructure/tools/providers/CreateFileProvider.ts`, `src/infrastructure/tools/providers/EditFileProvider.ts`: forward the same execution options to their workspace operation.
- `src/application/ports/WorkspaceFilePort.ts`, `src/application/ports/WorkspaceSearchPort.ts`, `src/application/use-cases/file-operations/EditWorkspaceFile.ts`, `src/infrastructure/file-system/NodeWorkspaceFileSystem.ts`, `src/infrastructure/tools/ripgrep/RipgrepSearch.ts`: cooperative cancellation at safe IO boundaries.
- `src/presentation/hooks/usePresentation.ts`: pending approval resolver/listener cleanup; `src/presentation/hooks/useChatSession.ts`: cancellation/error classification; `src/presentation/state/presentationReducer.ts`: clear active tools on locally finished/failed turns.
- Tests: `src/application/services/ToolRunner.test.ts`, `src/application/use-cases/RunAgentTurn.test.ts`, `src/test-support/RecordingToolExecutor.ts`, `src/presentation/App.test.tsx`, `src/presentation/approval/ApprovalView.test.tsx`, `src/presentation/state/presentationReducer.test.ts`, registry/filesystem/ripgrep tests.

**Changes**

1. Pass the turn's signal to `executeToolCalls`, approval waiting, and `execute(request, options)`. Check cancellation before prompt/model work, after asynchronous preparation/approval boundaries, after writing `tool.call.started` but before execution, and before the next tool/model round. Keep signal/options out of durable events and deduplication keys.
2. Extend `ToolApprovalHandler` with an execution-options argument carrying the signal. Race approval waiting against abort with an abort listener removed in `finally`; retain a rejection handler on the underlying approval promise so late settlements do not become unhandled rejections. Recheck the signal even if approval resolves `true` concurrently with abort.
3. `usePresentation` must settle/clear only the matching pending request on abort, replacement, handler disposal, or unmount, removing its listener. Late callbacks cannot clear a newer request. Preserve existing keyboard policy: Escape rejects while approval is visible; Ctrl+C exits in that state and unmount cancels the turn. Do not silently redesign approval shortcuts.
4. Treat only an explicit `false` (including the default handler) as denial. Preserve `TOOL_APPROVAL_DENIED` and closing remaining calls with `TOOL_BATCH_CANCELLED`. For a non-abort approval-handler exception, append a best-effort `agent.error` with `TOOL_APPROVAL_FAILED` using the runner's existing store/clock/ID dependencies, then propagate the original cause even if error reporting fails. Abort is not denial.
5. Restrict the execution catch to executor work. Actual execution failures produce `tool.call.failed` and remain available to the model as today. Persistence, output serialization, timestamp/ID generation, and diagnostic calculations sit outside that execution catch. Diagnostic calculation/recording remains best-effort and cannot manufacture failure.
6. After executor success, append `tool.call.completed` outside the execution catch. If this append fails, stop the turn with the original persistence cause; do not append `TOOL_FAILED`, execute another tool, call the model again, or retry the operation. The UI fallback must display the storage error when no error event could be committed.
7. Cancellation is cooperative. Reads/listing check before subsequent IO; edit checks after reading and before initiating its write. Once atomic write/create starts, await completion and cleanup. A successful operation that finishes while aborted still gets a truthful completion append before stopping later work. Do not race a mutation promise against abort and discard its eventual result.
8. Ripgrep receives the same signal in both search branches. Abort kills running children, waits for both branches to settle, drains/cleans readers, and removes listeners. Preserve timeout and early-limit termination distinctions. Filesystem calls without safe mid-operation cancellation finish at the nearest safe boundary.
9. If abort occurs before an operation starts, propagate `AbortError`; do not fabricate terminal outcomes to make an interrupted batch appear complete. If a genuine execution error occurs, record that actual failure outside the catch before stopping on a pending abort. If storage fails while stopping, preserve the storage failure rather than label it a tool failure. Incomplete batches stay excluded by replay.
10. Clear transient active-tool indicators when a local turn terminates. Do not persist synthetic success/failure solely to clear UI state. A committed success can precede the cancellation message; never describe that operation as rolled back. In `useChatSession`, classify cancellation by the propagated `AbortError`, not merely `signal.aborted`, so an independent storage failure is still displayed even if cancellation also occurred. Normalize cancellation checks/races to `AbortError`; preserve independent failures as their original cause.

**Invariants**

- Abort during deferred approval followed by late `true` invokes the executor zero times.
- Explicit denial retains existing batch-closing behavior; cancellation and handler failures are distinguishable from denial.
- Successful mutation plus failed completion append produces the real storage error and no `TOOL_FAILED`; no later operation runs.
- Completed mutations remain completed. No background mutation is abandoned, retried, or described as rolled back.
- Atomic replay, normalized inputs, per-turn deduplication/invalidation, diagnostic isolation, and resource cleanup remain intact.

**Tests / validation**

- Add runner tests using deferred approval and fault-injecting stores: already aborted; abort while approval remains unresolved; late approval; abort after started-event append; abort between calls; executor succeeds while signal becomes aborted; completion append fails after a simulated mutation (also when the signal becomes aborted); failure-event append fails after an actual executor error; approval handler throws; diagnostics throw. Assert the UI still displays the storage error in the combined abort/storage case.
- Assert executor/model request counts, original rejection cause, committed event types, and absence of false terminal events. Reconstruct each interrupted event prefix to prove incomplete batches are excluded.
- Add an agent-loop integration test for successful mutation plus storage failure: no final model round, no synthetic completed assistant answer, and one mutation attempt. Preserve tests for normal failure feedback, denial, invalid complete batches, and iteration limits.
- Add interactive pending-approval abort/unmount coverage and verify late approval cannot revive the turn. Test ripgrep abort cleanup for both branches; keep filesystem temporary-file/stale-write tests.
- Targeted: `bun test src/application/services/ToolRunner.test.ts src/application/use-cases/RunAgentTurn.test.ts src/infrastructure/tools src/infrastructure/file-system src/application/use-cases/file-operations/EditWorkspaceFile.test.ts src/presentation/App.test.tsx src/presentation/approval/ApprovalView.test.tsx src/presentation/state/presentationReducer.test.ts`.
- Typecheck: `bun run typecheck`. Full suite: `bun test`. Build: final gate. Manual approval/cancellation exercise: final interactive procedure.

**Completion criteria**

Both audit regressions are permanently covered; lifecycle catches have distinct execution and persistence boundaries; cancellation reaches approval and execution; no mutation is retried; all cleanup/failure tests and the full suite pass.

**Risk: high** — cancellation or storage failure after a real mutation can cause false reporting, missing evidence, or repeated side effects if boundaries are wrong.

### Phase 3 — one session service, with explicit cache ownership

**Goal**

Consolidate cache, commit publication, and selected-session lifetime. Eliminate constructor-created caches and preview-induced model-state retention.

**Why this phase happens here**

Phase 2 establishes storage failure semantics. Now replace the two decorators together and guarantee durable append → cache/reducer update → notification before phases 4, 5, and 7 depend on that contract.

**Scope**

- Add `src/application/services/SessionService.ts` and `src/application/ports/SessionServicePort.ts`.
- Replace `src/application/services/SessionStateCache.ts` and `src/composition/PublishingSessionStore.ts`; migrate `src/application/services/SessionStateCache.test.ts` and `src/composition/PublishingSessionStore.test.ts` into `src/application/services/SessionService.test.ts` before deleting them.
- `src/application/services/SessionReducer.ts`: reuse `AgentStateReducer`; preserve legacy and atomic paths.
- `src/application/ports/SessionStorePort.ts`, `src/infrastructure/persistence/JsonlSessionStore.ts`: keep the durable adapter contract; no on-disk schema change.
- `src/composition/createRuntime.ts`, `src/application/use-cases/RunAgentTurn.ts`: explicit construction/injection; `RunAgentTurnDependencies` and `AgentLoop` constructor.
- `src/application/use-cases/ListSessionEvents.ts`, `src/presentation/adapters/PresentationController.ts`, `src/presentation/hooks/usePresentation.ts`: add the uncached preview route while the existing API still compiles.
- Tests: existing session reducer/persistence tests, `src/application/use-cases/ListSessionEvents.test.ts`, `src/application/use-cases/RunAgentTurn.test.ts`, `src/composition/createRuntime.test.ts`, `src/presentation/App.test.tsx`, and `src/test-support/InMemorySessionStore.ts` as the durable fake.

**Changes**

1. The new service directly owns the durable `SessionStorePort`, `AgentStateReducer`, retained selected-session events, per-session append queue, and subscriber set. Do not keep a cache decorator around a publishing decorator or add a generic event bus.
2. `SessionServicePort` extends the durable read/append/list contract only with `readSessionState(sessionId): Promise<AgentState>`, `readPreviewEvents(sessionId): Promise<AgentEvent[]>`, `activateSession(sessionId): Promise<AgentEvent[]>`, and `subscribe(listener): () => void`. Activation loads/selects that session and returns a snapshot of its events; activating the already selected session reuses its state. Regular selected-event/state reads activate if necessary and share that load. `readPreviewEvents` reads/filter events without constructing or retaining a reducer for that session. It may still read a whole JSONL file transiently; persistent preview indexes and a streaming preview parser are outside scope.
3. Composition creates exactly one service and injects it into the loop and runner. Remove `instanceof SessionStateCache` and the hidden fallback constructor. After validating that its prompt fits, the loop activates the session before appending the prompt; consecutive turns reuse activation. Tests explicitly compose `SessionService(new InMemorySessionStore())`; do not reproduce the hidden wrapping in a new constructor.
4. Retain a single idle selected-session cache. Coalesce concurrent loads for that selected session; replace the prior selection only after its queued appends settle. Queue bookkeeping and any temporarily retained in-flight entry are removed when idle. Repeated previews and repeated selections must not grow an unbounded map of full event/state copies. Keep switching between sessions outside active turns, as the UI already does.
5. Within each append queue: await durable append, add the event to retained state when applicable, apply the reducer, then synchronously notify observers with per-listener exception isolation. Do not await listener promises; a listener may read state after notification without blocking its own append. If durable append fails, cache and notifications do not advance, and a later queued append can still run.
6. On load/reducer failure, evict invalid memory and permit a clean reload; if reduction fails after a successful durable append, surface that failure without re-appending the already committed event. Do not publish a commit against stale cached state.
7. Move `ListSessionEvents`' session-ID filtering into the service for selected reads, preview reads, and replay loading. Preserve ordering and original adapter errors. Resume previews use `readPreviewEvents`; selecting a session uses `activateSession` and its full events. Summary formatting/sorting remains in presentation's `buildSessionOption`.

**Invariants**

- A subscriber sees a committed event after reducer state has advanced. Failed writes do not update memory or publish.
- Reads wait for prior queued appends; failed queue entries do not permanently poison later operations.
- Selected-session state is incrementally reduced once and is reproducible from JSONL after restart.
- Previewing N sessions creates zero retained model reducers for those previews; repeatedly changing selection retains at most one idle full cache.
- Atomic batch visibility, legacy replay, foreign-session filtering, and observer cleanup remain unchanged.

**Tests / validation**

- Migrate all cache/publisher tests, then add deferred append-order tests, observer-triggered state reads, no notification on failed append, load failure/retry, reducer failure eviction, concurrent load coalescing, and restart reconstruction.
- Browse many fake sessions and assert preview reads never activate/reduce them. Select several sessions and show evicted selections require a fresh durable read while the current selection remains incremental. Use injected store/reducer observations or private-state inspection in tests; do not add public diagnostic API solely to count cache entries.
- Migrate the existing foreign-session test from `ListSessionEvents.test.ts` into service coverage before phase 4 removes the wrapper.
- Targeted: `bun test src/application/services/SessionService.test.ts src/application/services/SessionReducer.test.ts src/application/use-cases/RunAgentTurn.test.ts src/application/use-cases/ListSessionEvents.test.ts src/infrastructure/persistence/JsonlSessionStore.test.ts src/composition/createRuntime.test.ts src/presentation/App.test.tsx`.
- Typecheck: `bun run typecheck`. Full suite: `bun test`. Build/manual: final gate.

**Completion criteria**

One explicitly composed service owns state and publication; both old decorators and the loop's concrete-class check are removed; selected cache lifetime is bounded; preview isolation and commit ordering have passing regressions.

**Risk: medium** — incorrect queue/publication order can expose stale state or duplicate commits; premature eviction can lose in-memory incremental state.

### Phase 4 — direct runtime API and unload-and-switch ownership

**Goal**

Remove forwarding classes and expose the small API actually used by UI, with model switching owned by the active-model runtime.

**Why this phase happens here**

The session service now defines selected and preview read operations. Flatten these endpoints once, and move unload policy before removing the controller that currently enforces it. This phase changes API shape, not streaming or context behavior.

**Scope**

- `src/composition/createRuntime.ts`: `Runtime`, returned operations, private use-case instances.
- `src/composition/model/OllamaModelRuntime.ts`: `switchModel`, `unload`, current-model type annotations.
- Delete `src/presentation/adapters/PresentationController.ts` (`RuntimePresentationController` and duplicated method declarations).
- Delete `src/application/use-cases/ListSessions.ts` and `src/application/use-cases/ListSessionEvents.ts`, including `ListedSessionEvent`; retire `src/application/use-cases/ListSessions.test.ts` and `src/application/use-cases/ListSessionEvents.test.ts` only after equivalent service/runtime coverage exists.
- `src/App.tsx`: `AppProps`, injected runtime, `InteractiveApp`; `src/presentation/hooks/usePresentation.ts`, `src/presentation/hooks/useChatSession.ts`, `src/presentation/types.ts`: API types/imports and callers.
- Tests: `src/composition/createRuntime.test.ts`, `src/composition/model/OllamaModelRuntime.test.ts`, `src/presentation/App.test.tsx`; relevant `SessionService.test.ts` contracts.

**Changes**

1. Keep `RunAgentTurn` and the ID generator private to composition. Return direct functions: `createSessionId`, `getModelName`, `listModels(signal)`, `listSessions`, `listSessionEvents(sessionId)` for activation/selected events, `readSessionPreviewEvents(sessionId)`, `runTurn(input)`, `setApprovalHandler`, `subscribeSessionEvents`, and async `switchModel(modelName, signal)`, plus `workspacePath`.
2. Listing methods return arrays directly, without `{ sessions }`/`{ events }` wrappers. Delegate them to the phase-3 service, which retains filtering and persistence policies. Keep the existing diagnostic `getAgentMetrics` extension pending the explicit decision in section 6; it is not required by presentation.
3. Define presentation's injected type as a `Pick<Runtime, ...>` of these UI operations, with turn input/delta types derived from the runtime contract. Do not write another class or maintain a second independently specified method surface. `App` accepts `runtime?: PresentationRuntime` and defaults to `createRuntime()`.
4. Move unload-and-switch into `OllamaModelRuntime.switchModel`: first normalize/validate the requested name and reject blank names, then await unload of the current adapter with the signal, recheck abort, and construct the next adapter into a local variable before committing both active name and adapter. Never change either if unload/construction fails or cancellation wins. Remove public synchronous switching and stop asking presentation to orchestrate unload separately.
5. Change fake runtimes and composition tests to the async contract. Remove the redundant `OllamaModelAdapter & ModelMemoryPort` intersection; the class already implements the port. Preserve model catalog caching and the standalone unload port.

**Invariants**

- UI remains injectable without filesystem/Ollama calls in presentation tests.
- Selecting/restoring a model unloads the previous model first. Failure or abort leaves active name/adapter unchanged.
- Session filtering, previews, ID injection, approval-handler identity cleanup, and subscriptions retain their behavior.
- No application import of composition/infrastructure is introduced.

**Tests / validation**

- Add mocked-fetch runtime/model-runtime tests for unload request before the next model's chat, unload failure, abort, normalization, session-model restoration, and approval-handler replacement/disposal.
- Preserve listing and foreign-session checks in service/runtime tests before deleting listing tests. Update App command-menu/model/resume fakes.
- Targeted: `bun test src/composition/createRuntime.test.ts src/composition/model/OllamaModelRuntime.test.ts src/application/services/SessionService.test.ts src/presentation/App.test.tsx src/presentation/state/sessionSummary.test.ts src/presentation/screens/Screens.test.tsx src/infrastructure/model/OllamaModelAdapter.test.ts`.
- Typecheck: `bun run typecheck`. Full suite: `bun test`. Build: final gate. Manual model switch/resume: final procedure.

**Completion criteria**

No forwarding controller/listing classes or listing result wrappers remain; App uses the injectable direct API; every exposed model-switch path passes unload-first failure/cancellation tests.

**Risk: low** — call-site churn is mechanical, but missing unload or activation routing would regress model/session behavior.

### Phase 5 — commit-driven presentation and streaming for every round

**Goal**

Fix buffered text remaining hidden under `waiting` in later rounds, and use one durable-event path for completed assistant messages/errors.

**Why this phase happens here**

Session notifications now follow cache commits, and the runtime injection API is settled. Fix status and finalization together because both depend on the distinction between committed round content and the current uncommitted stream. Avoid an intermediate solution that preserves the completion refs only to remove them immediately.

**Scope**

- `src/presentation/hooks/useChatSession.ts`: event subscription, `runPrompt`, per-round buffer boundaries, completion/error refs and local fallback entries.
- `src/presentation/state/presentationReducer.ts`: `ChatAction`, `chatReducer`, `applyEvent`, `appendUnique`.
- `src/presentation/chat/LiveTurn.tsx`, `src/presentation/state/StreamBuffer.ts`: preserve components/buffering; change only if integration requires a proven correction.
- `src/presentation/App.test.tsx`, `src/presentation/state/presentationReducer.test.ts`, `src/presentation/state/StreamBuffer.test.ts`, `src/presentation/chat/ChatScreen.test.tsx`, `src/presentation/chat/Transcript.test.tsx`; add `src/presentation/hooks/useChatSession.test.tsx` if hook assertions cannot be expressed reliably through App.

**Changes**

1. Remove the turn-wide `receivedFirstDelta` latch. Dispatch the existing idempotent `turn.streaming` action on every nonempty delta; repeated actions while streaming return the same state. Each persisted tool-round boundary can therefore enter `waiting`, and the next round's first delta returns to `streaming`.
2. For both `assistant.tool_calls.completed` and `assistant.message.completed`, flush/reset the current buffer at the commit boundary and dispatch the durable event to the reducer. Apply these buffer/status side effects only on first receipt of that event ID, tracking applied IDs for the selected session and initializing them from loaded events; a redelivered earlier commit must not reset a later round's live buffer. Tool-round completion enters waiting for the next work; final completion is added once using its durable event ID. `turn.finished` only closes transient turn state; it no longer creates another completed assistant entry from streamed content.
3. Remove `completedAssistantRef` and the full `activeAgentErrorRef` reconciliation path. A durable `agent.error` is reduced once. Before reducing a non-abort error, flush and append any uncommitted partial content locally, then reset the stream so the catch cannot append it again. A small per-run flag may track whether a durable error was displayed; it must not store a parallel history/event representation.
4. On cancellation, retain the current round's uncommitted partial output and one local cancellation entry; do not present a redundant model-abort error as another cancellation failure. Suppress only a genuine abort error for the active turn, never an unrelated error just because the signal is aborted. On failure without a committed error event, append the actual thrown error locally. On storage failure after final text but before its completion event, that text stays a local partial, not a fabricated durable answer.
5. Guard callbacks/async finalizers by session and active-turn identity so old-session completions cannot reset a new stream or append local entries to the new session. Retain abort on session change/unmount, subscription disposal, and buffer timer cleanup.
6. Update test fake runtimes to publish completion events before successful iterator termination. A successful raw delta stream without a durable completion must not be used to test a production contract that requires committed messages.

**Invariants**

- Two or more model rounds all display live text under `streaming`, including text after a tool batch.
- Every committed assistant message/error appears once through the same event reducer in live use and reconstruction.
- Previously committed round content never reappears as a partial; interrupted current-round content remains visible locally.
- Buffer flush/reset occurs at round commits and termination; final messages and local fallbacks do not duplicate each other.
- UI/model reducers remain separate; streaming deltas do not copy transcript history.

**Tests / validation**

- Add a controlled interactive two-round regression: emit first-round text, persist tool calls, complete tools, then emit second-round text while withholding final completion. Assert both `turnStatus: streaming` and visible second-round `LiveTurn` content before the iterator finishes.
- Test completion before iterator end, empty completion, event redelivery while a later round already has buffered text, abort after a committed intermediate round, failure after partial text, final-message append failure, foreign-session events, session switch during an old run, and unmount cleanup.
- Targeted: `bun test src/presentation/App.test.tsx src/presentation/state/presentationReducer.test.ts src/presentation/state/StreamBuffer.test.ts src/presentation/chat/ChatScreen.test.tsx src/presentation/chat/Transcript.test.tsx`. If the hook test file is added, also run `bun test src/presentation/hooks/useChatSession.test.tsx`.
- Typecheck: `bun run typecheck`. Full suite: `bun test`. Build: final gate. Manual streaming/cancellation: final procedure.

**Completion criteria**

The audit's waiting-with-buffered-text regression passes before final completion; durable completion refs are gone; live/reloaded durable transcript entries match; partial/error/cancellation tests show no duplicates.

**Risk: medium** — event/buffer ordering can hide text, duplicate final output, or lose partial output at interruption.

### Phase 6 — prepare a tool once and execute the prepared result

**Goal**

Remove repeated schema validation, name dispatch, and metadata lookup while retaining a safe raw public executor.

**Why this phase happens here**

Lifecycle behavior is already covered by phase 2. Change the prepared representation separately, then phase 7 can remove model-history construction without also changing tool dispatch semantics.

**Scope**

- `src/application/ports/ToolExecutorPort.ts`: `PreparedToolExecution`, `ToolExecutorPort.prepare`, raw `execute`, execution options.
- `src/infrastructure/tools/LocalToolExecutor.ts`: `LocalToolRegistry.prepare`, `execute`, cached model definitions; `src/infrastructure/tools/LocalTool.ts`: retain typed Zod/provider binding.
- `src/application/services/ToolRunner.ts`: `prepareToolCalls`, prepared/persisted call types, metadata usage, `executeToolCall`, requested-event approval metadata.
- `src/application/use-cases/RunAgentTurn.ts`: persist only the prepared batch's serializable call projection.
- `src/test-support/RecordingToolExecutor.ts`, `src/application/services/ToolRunner.test.ts`, `src/application/use-cases/RunAgentTurn.test.ts`, `src/infrastructure/tools/LocalToolExecutor.test.ts`, `src/domain/Tool.ts` only if readonly definition annotations need adjustment.

**Changes**

1. `prepare(request)` returns a small readonly prepared record containing normalized `toolName`/`toolInput`, approval/deduplication/invalidation metadata, and an execution function bound to the already selected provider and parsed input. This record is in-memory only; no new class hierarchy, global handle registry, or persistence schema is needed.
2. Raw `LocalToolRegistry.execute(request, options)` remains the safe entry: call `prepare` once and invoke the returned execution function. The runner invokes that prepared function directly. Do not expose an unchecked raw-input bypass or let preparation perform workspace IO.
3. Runner preparation validates every call first. Only after the entire batch succeeds does it assign IDs and return records pairing `{ call: PersistedModelToolCall, execution: PreparedToolExecution }`. The agent persists `records.map(record => record.call)` and the runner uses the paired prepared execution; never serialize closures, signal, or metadata into JSONL.
4. Use prepared metadata for approval, deduplication keys, and invalidation. Delete `getToolDefinition` and repeated array scans. Preserve normalized argument identity between approval, persisted calls, deduplication, and execution.
5. Generate model definitions once in the registry constructor. Return an array copy or readonly view so callers cannot alter the registry's list; treat cached definitions as immutable. Keep the existing tool names/descriptions/schema semantics, including phase 1's additive read cursor.
6. Preserve per-turn runner creation and cached-result references. `read_file` remains non-deduplicated; successful mutations invalidate workspace references. Retain phase-2 signal/persistence boundaries on the prepared function path.

**Invariants**

- Each model tool call is parsed once; direct raw execution still rejects invalid/unknown tools.
- An invalid later batch member prevents IDs, batch persistence, approval, and execution for every member.
- Prepared metadata cannot diverge from the selected provider. Persisted arguments and approved arguments are the executed normalized arguments.
- Deduplication references, mutation invalidation, cancellation, and truthful persistence errors retain their behavior.

**Tests / validation**

- Add a schema parse counter to prove one validation through runner execution and one through direct raw execution. Prove no provider executes during preparation and retain whole-batch invalid-input tests.
- Test prepared approval/invalidation metadata without consulting a separate definition list, raw unknown-tool rejection, normalized inputs, definition-list stability, and compatibility of persisted call projections with replay.
- Rerun all phase-2 regressions on the prepared path, including late approval and successful mutation plus failed result append.
- Targeted: `bun test src/application/services/ToolRunner.test.ts src/application/use-cases/RunAgentTurn.test.ts src/infrastructure/tools/LocalToolExecutor.test.ts src/application/services/SessionReducer.test.ts`.
- Typecheck: `bun run typecheck`. Full suite: `bun test`. Build/manual: final gate.

**Completion criteria**

One parse and one provider selection per call; the runner no longer looks up tool metadata independently; raw execution remains validated; all durable events are serializable and preparation/lifecycle tests pass.

**Risk: medium** — losing the validation boundary or separating approval metadata from executed arguments could enable unapproved/invalid operations.

### Phase 7 — reducer-owned model context and one round orchestration path

**Goal**

Remove the second conversation assembler and consolidate the no-tools path into the same model-round lifecycle.

**Why this phase happens here**

The session service owns committed reducer state, the prepared runner owns execution, and presentation handles committed round boundaries. Now delete the duplicate model-message representation from both runner and loop together, without introducing an interim history mapper.

**Scope**

- `src/application/use-cases/RunAgentTurn.ts`: `AgentLoop.runTurn`, `runWithTools`, `runStreamingModelTurn`, `fitModelMessages`, `readModelResponse`, `currentMessages` handling.
- `src/application/services/ToolRunner.ts`: `ToolExecutionBatchResult`, `toolMessages`, `stringifyToolOutput` used for model history, terminal-turn result.
- `src/application/services/SessionReducer.ts`: sole `toToolMessage`/output serialization and batch assembly; preserve legacy helpers.
- `src/application/services/ContextBuilder.ts`: use `build` from canonical state; sizing optimization waits for phase 8.
- Tests: `src/application/use-cases/RunAgentTurn.test.ts`, `src/application/services/ToolRunner.test.ts`, `src/application/services/SessionReducer.test.ts`, `src/application/services/SessionService.test.ts`, `src/application/services/ContextBuilder.test.ts`, `src/test-support/AgentEventFixtures.ts` and `src/test-support/ScriptedModel.ts` if fixture reuse needs changes.

**Changes**

1. Before each model request, await the session service's state, then run `ContextBuilder.build(state)`. Remove manual appending to `currentMessages` and the separate assistant/tool mapping after execution. Catch budget errors at this common boundary and preserve `CONTEXT_BUDGET_EXCEEDED` reporting.
2. ToolRunner appends lifecycle events and returns only turn-control information, such as optional `terminalMessage` for explicit denial. Delete `toolMessages` from its result/type and model-message imports. Keep metric sizing as a diagnostic concern; do not move a second model serializer into a helper module.
3. Keep successful output/string/error message mapping exclusively in `SessionReducer`. A completed batch therefore becomes visible identically in live use and replay. Await all terminal appends before starting another model round. Cancellation/storage failure exits without requesting context from an unfinished batch.
4. Use one round-reading/finalization path for optional executor, empty registry, and tool-enabled runs. Omit `tools` from requests when no tools are available; retain one text round in that mode, ignore any returned tool-call data, and persist its text exactly as the existing no-tools path does. Keep the 12-round tool limit and denial terminal text behavior.
5. Delete the `streamContent` parameter/false branch; all nonempty content deltas stream. Persist empty final assistant messages as currently done, even though UI does not render them. Failed streams never persist a completed answer or execute their accumulated tool calls.
6. Update test harnesses with explicit session-service composition and reusable event fixtures. Preserve a small set of complete event-order/ID-linkage assertions. Convert other large repeated event arrays to behavioral checks and relationships between recorded IDs, not fixed global counter positions. Do not weaken live/replay or ordering coverage to make the refactor easier.

**Invariants**

- Every live model request equals `ContextBuilder.build(reduceAgentState(sessionId, committedEventsAtThatBoundary))` for the same event prefix/configuration.
- Assistant content, tool-call IDs/arguments, original result order, real execution failures, denial/cancelled batch results, and cache references have the same live/replayed shape.
- Partial batches never enter model context; legacy messages remain readable.
- Context retains the system message/current turn and only whole older turns. Tool limit, model signal, metrics, empty responses, and partial-stream behavior remain intact.

**Tests / validation**

- Add explicit live-vs-fresh-replay comparisons at each next-round boundary, not just at turn end: multiple calls, failed second call, intermediate assistant text, deduplicated search/list reference, mutation invalidation, and context truncation.
- For an interrupted batch, instantiate a fresh service from the persisted prefix and run a new prompt; assert no partial batch is sent. Preserve legacy requested/terminal and orphan-terminal reducer tests.
- Cover absent executor and empty registry via the same orchestration path, one request without `tools`, streamed/empty completion, prompt-too-large rejection before append, result-too-large failure, stream failure after deltas, denial, and 12-round limit.
- Targeted: `bun test src/application/use-cases/RunAgentTurn.test.ts src/application/services/ToolRunner.test.ts src/application/services/SessionReducer.test.ts src/application/services/SessionService.test.ts src/application/services/ContextBuilder.test.ts src/presentation/App.test.tsx`.
- Typecheck: `bun run typecheck`. Full suite: `bun test`. Build: `bun run build`, then `bun run smoke:build`. Interactive full flow: final gate.

**Completion criteria**

No parallel `currentMessages` assembly, `toolMessages`, stream suppression branch, or separate no-tools model lifecycle remains; every request-boundary equivalence test passes; the ownership target is reached without merging loop and runner or the two reducers.

**Risk: medium** — reading context too early can expose an incomplete batch, while changing serialization/budget timing can alter live/resume behavior.

### Phase 8 — exact context sizing with one serialization per message

**Goal**

Remove repeated serialization of growing candidate histories without changing which turns fit.

**Why this phase happens here**

Phase 7 establishes one context path. Keep this performance/complexity change separate so equivalence failures are attributable to sizing, not conversation ownership.

**Scope**

- `src/application/services/ContextBuilder.ts`: `fit`, `measureMessages`, `groupMessagesIntoTurns`, budget checks.
- `src/application/services/ContextBuilder.test.ts`, plus budget/request-equivalence cases in `src/application/use-cases/RunAgentTurn.test.ts`.

**Changes**

1. Compute each message's `JSON.stringify(message).length` once per fit and aggregate turn sizes. Use exact array accounting: empty array length 2; for N messages, `2 + sum(serializedLengths) + max(0, N - 1)`.
2. Keep separate system/current-turn mandatory sizes and add whole older turns from newest backward until the first candidate exceeds the budget. Account for commas between groups; do not approximate with content lengths or bytes.
3. Keep sizing local to a fit call; do not add a long-lived mutable context-size cache. Preserve grouping, chronological output, error class, and the `>` cutoff (exactly equal fits).

**Invariants**

Selected messages and budget errors are identical to the pre-optimization algorithm. Escaping, IDs, tool calls, and result JSON count exactly as before; whole-turn retention is unchanged.

**Tests / validation**

- Add exact-fit/one-character-over tests, empty/system-only state, multiple system messages, escaped characters, Unicode, and tool-call/result metadata. Compare selected turns to a test-only straightforward JSON-length reference across representative histories/budgets.
- Targeted: `bun test src/application/services/ContextBuilder.test.ts src/application/use-cases/RunAgentTurn.test.ts`.
- Typecheck: `bun run typecheck`. Full suite/build: final gate. No wall-clock performance thresholds or benchmark infrastructure needed.

**Completion criteria**

No repeated full-candidate serialization occurs in the selection loop; exact-size boundary and reference-equivalence tests pass.

**Risk: medium** — a missing array comma/bracket changes budget boundaries and potentially the conversation supplied to the model.

### Phase 9 — share workspace policy values, retain adapter enforcement

**Goal**

Remove duplicated protected-directory/safe-env lists without flattening filesystem and search safety into a generic adapter.

**Why this phase happens here**

Workspace semantics and cancellation are already tested. Sharing data now is a narrow change whose safety effects can be checked independently of tool lifecycle.

**Scope**

- Add `src/infrastructure/file-system/workspacePolicy.ts` with readonly policy values.
- `src/infrastructure/file-system/NodeWorkspaceFileSystem.ts`: `EXCLUDED_DIRECTORIES`, `SAFE_ENV_FILES`, skip predicates.
- `src/infrastructure/tools/ripgrep/RipgrepSearch.ts`: excluded/safe-env globs and `searchWithRipgrep` forwarding.
- `src/infrastructure/file-system/NodeWorkspaceFileSystem.test.ts`, `src/infrastructure/tools/ripgrep/RipgrepSearch.test.ts`, `src/infrastructure/tools/LocalToolExecutor.test.ts`.

**Changes**

1. Export the existing exact directory names (`node_modules`, `.git`, `.agent`) and allowed env basenames (`.env.dev`, `.env.development`, `.env.example`) from one immutable data module.
2. Derive filesystem sets and ripgrep globs locally from these values. Keep filesystem's broader `.env` directory rule, path-segment checks, and realpath checks in that adapter; keep ripgrep's two bounded searches and `.env*` exclusion in its adapter. Sharing names must not silently widen or narrow either adapter's policy.
3. Move `searchWithRipgrep`'s body directly into `RipgrepSearch.search`; preserve lower-level process/parsing helpers, injected command runner, branch settlement, ordering, timeout/limit semantics, and phase-2 abort cleanup.

**Invariants**

Both adapters still enforce their own safety boundary. Protected/safe-env decisions, filesystem containment, search ordering/bounds, and process cleanup are unchanged.

**Tests / validation**

- Extend existing policy tests with nested protected directories, secret env variants, and all allowed env basenames. Assert generated command globs preserve the current exclusions and validate actual tool search results as well as mocked commands. Retain symlink escape and atomic-write tests.
- Targeted: `bun test src/infrastructure/file-system/NodeWorkspaceFileSystem.test.ts src/infrastructure/tools/ripgrep/RipgrepSearch.test.ts src/infrastructure/tools/LocalToolExecutor.test.ts`.
- Typecheck: `bun run typecheck`. Full suite: `bun test`. Build/manual packaged search: final gate.

**Completion criteria**

Each policy value has one declaration, both adapters still check policy, search forwarding is gone, and existing plus extended safety/cancellation tests pass without changed access decisions.

**Risk: medium** — an incorrect glob or path translation can expose protected files even though the shared value list looks correct.

### Phase 10 — confirmed dead code and small local simplifications

**Goal**

Delete confirmed unused branches/types and remaining small duplication against the settled architecture.

**Why this phase happens here**

Reachability and callers are now stable. Some audit cleanup already disappears naturally in phases 4/7; do not recreate it or perform a second deletion pass on compatibility code.

**Scope**

- `src/presentation/types.ts`: `CompletedAssistant` and resulting unused `EventId` import.
- `src/presentation/state/presentationReducer.ts`: `session.load-started` union member/branch; `src/presentation/state/presentationReducer.test.ts` for existing behavior checks.
- `tsconfig.json`: nonexistent `src/ui_old` exclusion, conditional on confirming the directory is still absent.
- `src/infrastructure/runtime/BunUuidV7IdGenerator.ts`, `src/infrastructure/runtime/BunUuidV7IdGenerator.test.ts`: redundant `BunWithUuidV7` cast/type.
- `src/composition/config.ts`, `src/application/services/ContextBuilder.ts`, `src/infrastructure/model/OllamaModelAdapter.ts`, and their tests: production default ownership.
- `scripts/build-artifact.ts`: `buildLinux`, `buildWindows`; preserve `scripts/build.ts`, `scripts/build-linux.ts`, `scripts/build-windows.ts`, `scripts/release-artifacts.ts`, `scripts/smoke-build.ts`, `scripts/release-artifacts.test.ts` contracts.
- Conditional provider export visibility only: `src/infrastructure/tools/providers/ListFilesProvider.ts`, `src/infrastructure/tools/providers/ReadFileProvider.ts`, `src/infrastructure/tools/providers/SearchFileProvider.ts`, `src/infrastructure/tools/providers/CreateFileProvider.ts`, `src/infrastructure/tools/providers/EditFileProvider.ts`. Other suspicious items are gated in section 6.

**Changes**

1. Run `rg -n 'CompletedAssistant|session\.load-started|streamContent|ListedSessionEvent|BunWithUuidV7' src` and inspect every remaining match. Remove confirmed unused declarations/branches only. `streamContent` and `ListedSessionEvent` should already be absent from phases 7/4.
2. Confirm `src/ui_old` is absent and no generated/build input requires it, then remove the stale tsconfig exclusion. Do not remove another exclusion or change typechecking policy.
3. Verify the installed Bun types declare the used zero-argument `randomUUIDv7()` overload; replace `(Bun as BunWithUuidV7).randomUUIDv7()` with `Bun.randomUUIDv7()`. Preserve branded ID construction and injection. If the installed types do not support it, retain the cast and record the failed verification; do not update dependencies to force cleanup.
4. Keep production model/base URL/context defaults in `readConfig`. Require explicit `baseUrl`/`modelName` in `OllamaModelAdapter` and explicit `maxContextCharacters` in `ContextBuilder` options; composition already supplies them. Update test-only constructor calls to use explicit fixture values. Do not import composition defaults into application/infrastructure or create a defaults service. Preserve current default values, blank-env normalization, errors, and optional keep-alive semantics.
5. Extract one private compile helper in `build-artifact.ts` accepting target/outfile. Keep platform wrappers responsible for copying the matching rg binary and Linux permissions. Preserve failure logs/exit status, target names, filenames, and both separately callable package commands. No packaging changes or new build abstraction layer.
6. Limit `*_TOOL_NAME` visibility only after the section-6 reference check. Do not remove constants themselves, model refresh, catalog fields, metrics, legacy replay, or dependencies by assumption. Clock/Temporal work is explicitly deferred pending its gate.

**Invariants**

Only code proven unreferenced is deleted. Runtime defaults/configuration behavior, UUID generation, dependency boundaries, standalone artifacts, rg packaging, platform commands, and Linux executable bits remain unchanged.

**Tests / validation**

- No new tests are needed for unused-type/action deletion or forwarding removal; preserve the meaningful existing tests. Update constructor fixtures, then run existing ID, configuration, context, adapter, and release-artifact coverage.
- Targeted: `bun test src/presentation/state/presentationReducer.test.ts src/infrastructure/runtime/BunUuidV7IdGenerator.test.ts src/composition/config.test.ts src/composition/createRuntime.test.ts src/application/services/ContextBuilder.test.ts src/application/use-cases/RunAgentTurn.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts scripts/release-artifacts.test.ts`.
- Typecheck: `bun run typecheck`. Full suite: `bun test`. Formatting: `bun run format:check`.
- Build: run `bun run build:linux` and `bun run build:windows` after changing the helper, then `bun run smoke:build`; final `release:check` validates the combined entrypoint. Linux can validate the PE artifact but cannot prove Windows runtime behavior; native Windows smoke remains part of release validation.

**Completion criteria**

Confirmed dead declarations/branch/exclusion are removed where still dead; redundant cast is removed only if supported; production defaults have one owner; shared compilation preserves all artifact contracts. Every retained suspicious item has its verification outcome recorded.

**Risk: low** — mostly mechanical changes; constructor-default or packaging mistakes are the main regression risk. Conditional removals must not broaden scope.

## 6. Deferred and verification-required items

These are not required removals. The implementation goal must record verification results; retaining an item with an explicit unresolved gate is acceptable. Do not equate lack of a UI caller with lack of value.

| Item | Default disposition | Verification required before changing it | Validation if changed |
| --- | --- | --- | --- |
| Legacy replay in `SessionReducer.ts` | Preserve, including orphan terminal messages and old requested/terminal pairs. | Representative older JSONL fixtures plus an explicit compatibility/migration decision. Current producer graphs alone are insufficient. No removal is authorized by this plan. | Reducer legacy tests and loading/restarting historical session fixtures. |
| `forceRefresh` in `OllamaModelRuntime.ts` | Preserve tested runtime capability. | Search runtime callers/tests; decide whether diagnostics or model-install workflows need explicit invalidation. A product/API decision is needed before deleting behavior used in tests. | `bun test src/composition/model/OllamaModelRuntime.test.ts src/composition/createRuntime.test.ts src/presentation/App.test.tsx`. |
| `ListedModel.modifiedAt` / `sizeBytes` | Preserve parser/type contract. | `rg -n 'modifiedAt|sizeBytes|ListedModel' src`; examine catalog consumers, tests, and intended diagnostics. Confirm no supported consumer needs these fields before deleting parser/type output together. | `bun test src/infrastructure/model/OllamaModelCatalog.test.ts src/presentation/screens/Screens.test.tsx src/composition/model/OllamaModelRuntime.test.ts`. |
| Exported `*_TOOL_NAME` constants | Candidate for private constants in phase 10. | `rg -n '_TOOL_NAME' src scripts index.tsx`; confirm every use is local and check re-exports/dynamic consumers. This is visibility reduction, not deleting tool names or constants. | Registry tests and typecheck. |
| `react-devtools-core` | Preserve dependency. | Inspect the installed Ink DEV integration and run the supported `DEV=true` workflow with a devtools server. Decide explicitly whether optional devtools support is retained; no direct project import does not prove deadness. | Full suite, build, and DEV workflow if a separate approved dependency change is undertaken. |
| `getAgentMetrics` / metric collection | Preserve diagnostic API and failure isolation. | `rg -n 'getAgentMetrics|AgentMetrics|recordModelRequest|recordToolExecution' src`; make a product decision about diagnostics. If later removed, remove collection, ports, API, and tests coherently, rather than just hide the getter. | `InMemoryAgentMetrics.test.ts`, loop diagnostics tests, runtime tests. |
| `TemporalClock` / `temporal-polyfill` | Defer runtime/dependency change. | Confirm sub-millisecond precision is not contractual: inspect all `ClockPort`/timestamp consumers, older session sorting, supported-runtime output, and product requirements. Verify no other Temporal use with `rg -n 'Temporal|temporal-polyfill' src scripts package.json`. | A separately authorized change may use `new Date().toISOString()` behind the same injected `ClockPort`; preserve UTC/branded IDs and test timestamp parsing, mixed historical precision, summaries, replay, full suite/build. Remove the dependency only after zero remaining uses and regenerate the lockfile with the existing package manager. |
| Smoke coverage | Keep script; explicitly limit its claim. | `scripts/smoke-build.ts` uses ignored stdin, so CLI invocations stop at the interactive-terminal guard. Its separate rg search proves packaged binary availability, not an agent-mediated search. | Required PTY/interactive source and packaged flows in section 7 close this validation gap. A new smoke harness is a separate improvement, not a prerequisite refactor. |

The `read_file` continuation issue is **not deferred**: inspection confirms the audit's example and phase 1 specifies its treatment. The later-round streaming bug belongs inside phase 5 because status and commit reconciliation are coupled. Approval cancellation and post-success persistence failure are isolated in phase 2. Literal replacement is isolated in phase 1.

No large folder moves, new generic mediator, merged reducers, replacement for Zod, model-port collapse, filesystem-check removal, retry system, or unrelated feature work belongs in this plan.

## 7. Final whole-project validation procedure

Run this after the required phases, from a cleanly understood worktree. Record command outcomes, platform, and any remaining external validation limits; do not claim an unperformed interactive/native-platform check passed.

1. **Coverage and diff review.** Run `git diff --check`, `git diff --stat`, and `git status --short`. Review changed files against phase scopes. Confirm no unexpected `.agent/`, generated files, dependency edits, or audit edits are included. Search for obsolete ownership: `rg -n 'RuntimePresentationController|PresentationController|SessionStateCache|PublishingSessionStore|ListedSessionEvent|CompletedAssistant|session\.load-started|streamContent|currentMessages|toolMessages|getToolDefinition|BunWithUuidV7' src`. Investigate any match; legacy replay/helpers and diagnostics are intentionally retained.
2. **Targeted regressions.** Verify all newly added cases ran: literal replacement, lossless cursor progress, late approval after abort, mutation success plus failed completion append, commit/cache ordering, preview isolation/cache eviction, second-round live rendering, and request-boundary live/replay equivalence. Run `bun test src/application/services src/application/use-cases src/presentation src/composition src/infrastructure/tools src/infrastructure/file-system src/infrastructure/persistence` if results are not already available for the final code state.
3. **Whole-project automated gate.** Run `bun run release:check`. This executes formatting, typecheck, full `bun test`, both-platform build, and packaged smoke. If diagnosing a failure, use the exact constituent commands: `bun run format:check`, `bun run typecheck`, `bun test`, `bun run build`, `bun run smoke:build`. After a fix, rerun the affected checks and restore a passing final gate; document pre-existing/external failures explicitly.
4. **Source interactive flow in a disposable workspace.** With Ollama and an installed model available, run `bun run /absolute/path/to/Local_Agentic_CLI/index.tsx` in a real terminal. Use that workspace's known fixtures to exercise search → read → answer, intermediate tool-round text → visible next-round streaming, approved literal `$&` edit, denied edit, cancellation while streaming, and read pagination across a very long line. Assert file contents, one final answer, preserved local partial output, and absence of later execution after cancellation. Test Ctrl+C exit/unmount during approval without approving the operation. Deterministic automated tests, not model compliance alone, establish these edge-case guarantees.
5. **Resume and unload.** Restart with `bun run /absolute/path/to/Local_Agentic_CLI/index.tsx resume`; compare durable history and model context to the previous successful session, select another session, and check preview ordering/content. Test a session ending in an incomplete batch via a test fixture: completed side effects stay on disk, but the batch is absent from model context. Switch models and restore a session model; verify unload-first requests and unchanged selection on forced unload failure through the automated mock. Partial local output is not expected to survive restart as a completed message.
6. **Packaged interactive flow.** Copy `dist/codesh` plus `dist/rg` (Windows: `codesh.exe` plus `rg.exe`) into a disposable release directory. Run the executable in a real terminal from the fixture workspace and perform an agent-mediated `search_file`, then resume the saved session. Existing `smoke:build` alone is insufficient evidence. Execute the native Windows package/smoke flow on Windows for release claims; Linux cross-compilation and PE signatures establish artifact shape only.
7. **Resource termination.** After cancellation, denial, session changes, and unmount, ensure tests release listeners/timers and interactive runs leave no rg child or open stream behind. Verify no stray temporary edit file remains. Do not introduce a new diagnostics surface merely for this check.

## 8. Definition of Done

### Planning-stage completion

- The primary audit was read and the affected repository contracts/tests/build commands inspected at the audited commit.
- All six high-value audit findings have concrete phases: API → 4; model context → 7; session ownership/cache → 3; streaming UI → 5; one-time preparation → 6; lifecycle/error/cancellation → 2.
- All five confirmed correctness issues have explicit transformations and regression requirements: streaming status → 5; approval cancellation → 2; false `TOOL_FAILED` after persistence failure → 2; literal edit → 1; read continuation → 1.
- Smaller findings are assigned: shared policy/search forwarding → 9; context sizing → 8; no-tools/stream flag/test fixture cleanup → 7; defaults/UUID/types/build/dead code → 4 or 10; timestamp/dependency questions → explicit section-6 gates.
- Every phase states goal, rationale, concrete scope, changes, invariants, tests/validation, completion criteria, and risk. Suspicious code and legacy compatibility have verification conditions. Final full-project and interactive validation is defined.
- This complete plan is persisted at `docs/plans/simplification-refactor-plan.md`, with no implementation performed and no other repository file changed during this stage.

### Later implementation completion

- Required phases have independently passing gates and coherent reviewable changes; all confirmed correctness regressions pass.
- The target ownership boundaries are present, obsolete forwarding/duplicate context paths are absent, and selected-session cache retention is bounded.
- Persistent model context has one assembler; live and restart request-boundary equivalence and incomplete-batch exclusion are proven.
- Useful ports, policies, reducers, components, injection seams, and cleanup remain. Legacy replay remains supported.
- Suspicious/deferred items have explicit recorded decisions or unresolved gates; none was removed solely because it lacks a current production caller.
- The final automated gate passes, and interactive/package checks are recorded for the validated platforms. Unavailable external/native checks remain clearly identified and are not represented as passes.
- No unrelated architecture, dependency, folder, or product changes are included.
