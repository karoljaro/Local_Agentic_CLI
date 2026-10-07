# Phase 3 implementation progress

## Status

verified

## Baseline

- Starting HEAD: `6003da8d2552cacdbc48c9f0af48bd27165149e9` (2026-10-07).
- Starting `git status --short` and `git diff --name-only`: empty; no pre-existing changes.
- Phases 1 and 2 are in HEAD: `a2d94c7` (literal replacement/read continuation) and `6003da8` (cancellation/persistence lifecycle). Their records report verified status; preserve their behavior and regression coverage.
- Read the architecture audit, primary refactor plan, and Phase 1/2 records. No applicable AGENTS.md found in the workspace or ancestor directories.
- Created this record before source/test changes. Protected inputs: audit, plan, Phase 1 progress, Phase 2 progress.
- Baseline `bun run release:check` passed (exit 0): formatting, typecheck, 282 tests / 36 files / 1786 assertions, Linux/Windows builds and existing limited packaged smoke. Log: `/tmp/phase-3-baseline-release.log`. Generated ignored `dist/` output is excluded from changes.

## Architectural evidence before implementation

- `createRuntime` constructs `PublishingSessionStore(new JsonlSessionStore())`, then `SessionStateCache(publishingSessionStore)`; loop and listing use cases receive the cache, subscriptions receive the publisher.
- `AgentLoop` accepts `SessionStorePort`, checks `instanceof SessionStateCache`, and otherwise constructs a hidden cache. It hands that cache to `ToolRunner`.
- `SessionStateCache.sessions` is an unbounded map of load promises retaining events, reducers, and append tails for every read session.
- Publisher notifies after persistence but before the outer cache applies the reducer.
- `usePresentation` builds resume options by calling `controller.listSessionEvents` for every session. Controller → runtime listing use case → cache retains full model state for previews. Actual selection uses the same route from `useChatSession`.
- `ListSessionEvents` owns foreign-session filtering after the cache has already replayed events.

## Work completed

- Added `SessionServicePort` extending durable operations with activation, state, preview, and subscription APIs (plan changes 1–2).
- Added `SessionService`: one selected cache, a shared ownership queue for safe transitions/load coordination/reads/commits, per-session pending append tails for preview waiting, filtered loading, incremental reduction, durable-first publication, and failure recovery (changes 1, 4–7).
- Migrated `createRuntime`, `RunAgentTurn`/`ToolRunner` dependencies and test composition to explicit service injection; prompt fit validation precedes activation and prompt append. Model-context assembly is unchanged (change 3).
- Retained `ListSessionEvents` and controller/runtime shapes, routed selection to activation, and added a preview method used only for resume summaries. Filtering moved to the service (change 7).
- Added 24 service tests covering all five meaningful old cache/publisher tests plus deterministic commit ordering, deferred append queues/read barriers, observer promise isolation, failures/retry, coalesced loads, preview retention, safe eviction/concurrent switching, foreign filtering, snapshots/listing, and real JSONL legacy/orphan/atomic/interrupted replay.
- After the five migrated behavior tests passed within the initial 22-test service suite, deleted `SessionStateCache.ts`, `SessionStateCache.test.ts`, `PublishingSessionStore.ts`, and `PublishingSessionStore.test.ts`. No compatibility ownership wrappers remain.
- Added runtime composition identity/routing coverage and interactive resume preview/selection coverage. Added cancellation-during-activation coverage. Extended the oversized-prompt regression to require zero durable reads before rejection. Existing cancellation/persistence assertions remain intact.

## Session ownership contract

- **Durable ownership:** `SessionService` directly owns the injected `SessionStorePort`; JSONL remains authoritative and unchanged. Listing delegates without activation.
- **Selected cache:** one optional `SelectedSession` containing events and `AgentStateReducer`, plus selected ID. No full-session map. Events/state return array snapshots (existing reducer snapshot semantics retained).
- **Activation:** selected event/state reads activate on demand. Same-session activation reuses the retained reducer/events; concurrent successful selected reads queue behind the first load and reuse it, avoiding duplicate durable reads/replay.
- **Preview:** waits for that session's already queued writes, reads and filters transient events, creates no reducer/cache, and never changes selection. Whole-file JSONL reads remain acceptable.
- **Append ordering:** all commits and ownership transitions share a promise gate. Appends run in invocation order, durable append first, then retained events/reducer if selected, then synchronous subscriber invocation. Per-session pending tails allow previews to wait for relevant prior appends; idle tail entries are deleted.
- **Reducer updates:** selected state is reduced incrementally. Appends to unselected sessions are durable-only commits and do not take ownership or retain another reducer; a later state read activates/replays authoritative events.
- **Observers:** notification happens after selected state advances. Each synchronous exception and returned-promise rejection is isolated. Returned promises are handled but never awaited for commit success. Observer-triggered state reads queue safely after the committing operation.
- **Eviction/switching:** selection requests run behind prior commits, including reducer finalization and notification. Prior cache is released before loading the new selection; only a fully reconstructed new cache is installed. Returning to an evicted session rereads durability.
- **Failed append:** original persistence failure propagates; events/state/observers do not advance. Recovered ownership/pending tails allow the next queued append to run.
- **Failed load/reduction:** no partially loaded or mutated reducer/events remain retained. Selected identity may remain, but cache is absent and the next selected read/append retries loading cleanly.
- **Failed post-append reduction:** committed event remains durable exactly once; original reducer failure propagates without publication/re-append. Cache is evicted, and the next selected operation reloads authority before committing again.
- **Concurrency:** the ownership gate serializes loads, selected reads, commits, and transitions across sessions as well as within a session. Preview reads are independent except for their relevant queued append tail. No persistent in-flight full-session map or public diagnostics API exists.

## Tests / validation

- Baseline git inspection completed; clean worktree.
- `bun run release:check > /tmp/phase-3-baseline-release.log 2>&1`: passed before source/test changes; 282 tests, 0 failures, typecheck/format/build/smoke exit 0.
- Initial `bun run typecheck`: failed for remaining raw-store composition in `ToolRunner.test.ts`; corrected. Expanded helper typecheck failed, then corrected; `/tmp/phase-3-coverage-typecheck-2.log` passed (exit 0).
- `bun test src/application/services/SessionService.test.ts`: passed 22 tests, 257 assertions, 0 failures; `/tmp/phase-3-service-second.log`. Completed before deleting obsolete behavior tests/implementations.
- Required seven-path targeted command plus `src/application/services/ToolRunner.test.ts`: passed 116 tests, 587 assertions, 0 failures; `/tmp/phase-3-initial-targeted.log`.
- Runtime/UI routing tests: 16 tests, 63 assertions, 0 failures; `/tmp/phase-3-routing-tests.log`.
- `bun run typecheck` after routing additions: passed, exit 0; `/tmp/phase-3-routing-typecheck.log`.
- Scoped `bunx biome format --write`: passed on 15 deliberately changed/new TypeScript files (fixed four); then the final loop test file only. Deleted files and protected documentation were excluded.

Final deterministic validation on the final formatted source:

| Command | Result | Evidence |
| --- | --- | --- |
| `bun test src/application/services/SessionService.test.ts src/application/services/SessionReducer.test.ts src/application/use-cases/RunAgentTurn.test.ts src/application/use-cases/ListSessionEvents.test.ts src/infrastructure/persistence/JsonlSessionStore.test.ts src/composition/createRuntime.test.ts src/presentation/App.test.tsx` | Passed | 96 tests across 7 files, 0 failures, 498 assertions; `/tmp/phase-3-final-targeted.log`. Includes all 24 final service cases. |
| `bun run typecheck` | Passed | Exit 0; `/tmp/phase-3-final-typecheck.log`. |
| `bun test` | Passed | 304 tests across 35 files, 0 failures, 2055 assertions; `/tmp/phase-3-final-full-suite.log`. Includes all 25 ToolRunner tests and all Phase 1/2 regressions. |
| `bun run format:check` | Passed | Exit 0; 128 files checked, no fixes; `/tmp/phase-3-final-format.log`. |
| `git diff --check` | Passed | No whitespace errors. |
| `git diff --stat`, `git status --short`, `git ls-files --others --exclude-standard` | Inspected | 12 modified tracked files, 4 deleted tracked files, 4 new files. New files are the service, port, service tests, and this record only. |
| Complete Phase 3 source/test/deletion/new-file diff review | Completed | Scope matches Phase 3; controller/listing shape remains, model context/lifecycle/reducer/persistence formats remain unchanged. |
| HEAD-relative protected-input/dependency diff inspection | Passed | Audit, plan, Phase 1/2 records, `package.json`, and `bun.lock` unchanged. No `.agent/` or generated build artifacts are included. |
| Source ownership search | Passed | No `SessionStateCache` or `PublishingSessionStore` references remain under `src`; one production service construction in `createRuntime`. |

Test inventory relative to starting HEAD:

| File/group | Before | After | Change |
| --- | ---: | ---: | --- |
| Old cache/publisher test files | 5 | 0 | All five meaningful behaviors migrated to service coverage before deletion. |
| `SessionService.test.ts` | 0 | 24 | Five migrated cases plus 19 ownership/failure/concurrency/replay cases, including foreign filtering. |
| `RunAgentTurn.test.ts` | 38 | 39 | Explicit service composition; zero reads for oversized prompt; cancellation during activation added. Existing lifecycle assertions preserved. |
| `createRuntime.test.ts` | 1 | 2 | Shared owner identity, controller activation/preview/publication routing. |
| `App.test.tsx` | 13 | 14 | Explicit service integration; resume preview/activation test. |
| Remaining tests | 225 | 225 | Assertions preserved; necessary ToolRunner/listing test composition migrated. |
| **Full suite** | **282** | **304** | 27 cases added (including 5 migrated), 5 obsolete registrations removed; net +22. |

## Deviations / discoveries

- The ownership gate also serializes commits/selected loads across different sessions. This deliberately stronger ordering keeps a single reducer safe during transitions without a map of independently loaded full sessions; UI selection remains outside active turns as before. Per-session pending append tails are used by previews and removed when idle.
- Unselected appends do not implicitly select or retain a reducer. Selected appends (the agent loop's path) update reducer state before notification; later reads of other sessions replay durable authority.
- First typecheck found one remaining raw-store test composition; fixed explicitly. Expanded test typecheck then found strict optional property/function-this/union narrowing errors in new test helpers; fixed without loosening types.
- Initial deferred failed-queue test run was interrupted because the rejection assertion waited before releasing the deferred operation. The test now attaches a nonblocking rejection handler and asserts original error identity after releasing the latch; the rerun passed.
- No blockers or later-phase implementation. Controller/listing wrappers, model-switch policy, currentMessages/toolMessages, reducer semantics, persistence format, and dependency versions remain unchanged.

## Remaining work

None for Phase 3.

## Architectural evidence after implementation

- `src/composition/createRuntime.ts` constructs exactly one `SessionService(new JsonlSessionStore())` per runtime.
- The same instance reaches `RunAgentTurn`/`AgentLoop`, each per-turn `ToolRunner`, `ListSessions`, `ListSessionEvents`, runtime preview, and subscriptions. Runtime identity assertions verify shared composition; constructors perform no fallback wrapping.
- Resume summaries: `usePresentation` → controller `readSessionPreviewEvents` → runtime preview → service `readPreviewEvents`; formatting and sorting remain in presentation.
- Actual selection: `useChatSession` → controller `listSessionEvents` → retained runtime/use-case wrapper → service `activateSession`. The loop validates prompt fit, activates, checks cancellation, then appends.
- Retained full state: one optional selected events/reducer object. Previews retain only transient returned event arrays in callers, with no service-owned reducer/state cache. Pending append tail map contains promises only and clears when idle.
- All four obsolete cache/publisher source/test files are removed; no remaining source references to either class or concrete cache detection.

## Final Phase 3 summary

- Status: verified against starting HEAD `6003da8d2552cacdbc48c9f0af48bd27165149e9`. No commit created.
- Added (4):
  - `src/application/ports/SessionServicePort.ts`.
  - `src/application/services/SessionService.ts`.
  - `src/application/services/SessionService.test.ts`.
  - `docs/progress/phase-3-progress.md` (created before source/test changes).
- Changed (12):
  - `src/application/services/ToolRunner.ts`, `src/application/services/ToolRunner.test.ts`.
  - `src/application/use-cases/RunAgentTurn.ts`, `src/application/use-cases/RunAgentTurn.test.ts`.
  - `src/application/use-cases/ListSessionEvents.ts`, `src/application/use-cases/ListSessionEvents.test.ts`, `src/application/use-cases/ListSessions.test.ts`.
  - `src/composition/createRuntime.ts`, `src/composition/createRuntime.test.ts`.
  - `src/presentation/adapters/PresentationController.ts`, `src/presentation/hooks/usePresentation.ts`, `src/presentation/App.test.tsx`.
- Deleted (4): `src/application/services/SessionStateCache.ts`, `src/application/services/SessionStateCache.test.ts`, `src/composition/PublishingSessionStore.ts`, `src/composition/PublishingSessionStore.test.ts`.
- Removed the decorator stack, unbounded cache map, hidden fallback construction, and concrete cache detection. One explicitly composed service now owns durable access, one selected events/reducer cache, safe serialized commits/transitions, pending append cleanup, and subscriptions. Preview reads retain no model reducer/state and do not change selection.
- Durable append precedes retained events/reduction/publication. Failed writes preserve original causes and do not publish/advance memory; failed reducers invalidate memory without duplicating persisted events; clean reads/queued appends recover. Observers see advanced selected state and cannot alter commit success.
- Tests: five migrated cache/publisher cases; 19 additional service cases; runtime/UI routing and activation-cancellation regressions. Foreign filtering is tested with a deliberately unsafe adapter. Real JSONL restart tests preserve legacy/orphan replay, atomic result ordering, and incomplete prefixes. Existing Phase 1/2 assertions remain.
- Validation: baseline release check; final 96 targeted tests, 304 full-suite tests, typecheck, formatting, whitespace check, complete diff review, immutable-input/dependency/artifact inspection.
- Unresolved Phase 3 issues: none. Optional Ollama/manual model verification was not used; no post-migration build, native Windows run, or manual model-flow claim is made. Baseline build/smoke evidence is separately identified above.
- Phase 4+ was not started: controller and both listing use cases remain; unload/switch, streaming reconciliation, prepared execution, ContextBuilder, workspace policies, currentMessages/toolMessages, AgentStateReducer, JSONL adapters/schema, dependencies, and folders were not redesigned. Protected audit/plan/Phase 1/2 records are unchanged.
