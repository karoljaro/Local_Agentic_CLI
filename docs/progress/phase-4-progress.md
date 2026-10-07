# Phase 4 implementation progress

## Status

verified

## Baseline

- Starting HEAD: `7c6fac6024da0ecb468fca9587ca4f770c2316fb` (2026-10-07).
- Starting `git status --short`: empty. Starting `git diff --name-only`: empty. No pre-existing changes.
- Phases 1–3 are present in HEAD: `a2d94c7`, `6003da8`, and `7c6fac6`; their progress records report verified status.
- Read the audit, primary plan, and Phase 1–3 records. No applicable AGENTS.md found in workspace/ancestors.
- Created this record before source or test changes. Audit, primary plan, prior records, dependencies, and lockfile are protected inputs.
- Baseline `bun run release:check` passed: formatting, typecheck, 304 tests / 35 files / 2055 assertions, Linux/Windows build, existing limited packaged smoke. Log: `/tmp/phase-4-baseline-release.log`. Ignored `dist/` output is excluded.

## Architecture before Phase 4

- `App` accepts `controller?: PresentationController`; default: `new RuntimePresentationController(createRuntime())`.
- Presentation → controller `listSessions` → runtime `ListSessions.list` → `SessionService.listSessions`; use case wraps `{ sessions }`, controller unwraps it.
- Presentation → controller `listSessionEvents` → runtime `ListSessionEvents.list` → `SessionService.activateSession`; use case wraps `{ events }`, controller unwraps it. Filtering already lives in the service.
- Resume browsing → controller preview → runtime preview → service `readPreviewEvents`; transient, nonactivating reads. Selection activates through the route above.
- Controller forwards IDs, name, turn execution, approval handler, subscriptions, workspace path, and model catalog; catalog's `{ models }` reaches the UI for immediate unwrapping.
- Controller's sole substantive policy: async `switchModel` awaits runtime `unloadCurrentModel({ signal })`, then calls synchronous runtime/model `switchModel`. Both command selection and session-model restoration use the controller route.
- Public runtime also exposes `runAgentTurn`, `idGenerator`, listing classes, synchronous switch, standalone unload, model refresh options, and metrics.
- `OllamaModelRuntime` owns current name/adapter and catalog cache. Its synchronous switch assigns name before adapter construction; it neither unloads nor checks cancellation. Adapter type redundantly intersects `ModelMemoryPort`.
- Exactly one composed `SessionService` supplies the loop, listing wrappers, previews, and subscriptions. It owns filtering, bounded selection, durable-first publication, and errors; Phase 4 must retain this ownership.

## Work completed

- Captured clean baseline and architecture, completed baseline release validation, and created this record (persistent-record/preflight requirements).
- Added nine model-switch tests before implementation. Old implementation: 2 existing catalog tests passed, 9 new cases failed as expected (synchronous switching, no unload, premature identity mutation). After async policy implementation: all 11 pass. `OllamaModelRuntime.switchModel` now validates, checks abort, awaits unload, prepares a local adapter, rechecks, then commits both fields; redundant adapter/port intersection removed. Standalone unload and catalog caching/refresh are unchanged (plan changes 4–5).
- Added explicit service event-order, missing-session, and listing-error cases. Existing service foreign filtering, listing order, activation/error, and preview tests provide remaining equivalence. Ran new and old listing coverage together successfully before retiring wrappers (listing-removal requirements).
- `createRuntime.ts`: private loop/ID generator, direct callable operations and direct session/model arrays; selected reads call activation, previews call preview, subscriptions use the same service. Metrics, model-list force refresh, and standalone unload remain. Real-loop composition tests observe one service across all routes and publication after state commit (plan changes 1–2, 5).
- `types.ts`: `PresentationRuntime` is a `Pick<Runtime, ...>` of the eleven UI operations; turn input/output/delta derive from `Runtime['runTurn']`. `App.tsx` injects `runtime?: PresentationRuntime`, defaults to `createRuntime()`, and passes it directly to hooks. Hooks/fakes now consume the derived API and direct model arrays; only API names/results changed, no stream/lifecycle logic (plan change 3).
- Updated all App fake runtimes; retained command-menu, resume, approval, cancellation, and storage-failure assertions. Added deferred command/model-screen switching with next-turn model assertions, successful session-model restoration through the same async route, and restoration failure retaining current selection. Presentation tests use fakes and in-memory application services without concrete IO/model composition.
- After service coverage (30 tests including old wrappers), direct runtime/App coverage (21 tests), and expanded App routes (17 tests) passed, deleted `PresentationController.ts`, `ListSessions.ts`, `ListSessionEvents.ts`, and both listing test files. No replacement forwarding class or DTO introduced; `ListedSessionEvent` removed with its wrapper.

## Runtime API contract

`Runtime` in `src/composition/createRuntime.ts` is the sole presentation API definition. `PresentationRuntime` in `src/presentation/types.ts` picks the following ten functions and workspace value directly from it:

| Member | Contract / owner |
| --- | --- |
| `createSessionId(): SessionId` | Calls the private composed ID generator. Deterministic generator spies and UI fakes remain supported; generator object is not public. |
| `getModelName(): string` | Returns active logical name from the model runtime. |
| `listModels(signal?: AbortSignal, options?: Pick<RuntimeListModelsOptions, 'forceRefresh'>): Promise<ListedModel[]>` | Direct model array. Signal forwards to the existing cached catalog; optional second argument preserves explicit refresh. Catalog port/results/metadata/cache/coalescing remain unchanged internally. |
| `listSessions(): Promise<StoredSession[]>` | Direct durable session array from the one service, preserving adapter order/errors; does not activate. |
| `listSessionEvents(sessionId): Promise<AgentEvent[]>` | Calls service `activateSession`, returning filtered selected-event snapshot. Same-session cache reuse/bounded selection remain service policy. |
| `readSessionPreviewEvents(sessionId): Promise<AgentEvent[]>` | Calls service `readPreviewEvents`; filtered transient read, no activation/reducer retention. |
| `runTurn(input): AsyncIterable<{ contentDelta: string }>` | Calls the private loop's `run`. Signature is `RunAgentTurn['run']`; input has session ID/prompt and optional model name/signal exactly as the existing loop. Presentation continues supplying name/signal. Model name in input remains event metadata; actual selection changes through switch. Streaming/context/tool behavior is unchanged. |
| `setApprovalHandler(handler): () => void` | Existing handler indirection receives request and execution options/signal; replaces current handler. Disposer resets to default denial only if that handler identity is current. Phase 2 UI request/replacement/abort/disposal behavior remains intact. |
| `subscribeSessionEvents(listener): () => void` | Service subscription/disposer. Observes durable commits after selected state advances; service observer isolation unchanged. |
| `switchModel(modelName, signal?: AbortSignal): Promise<string>` | Single async selection route owned by `OllamaModelRuntime`, returning normalized name after commit. |
| `workspacePath: string` | Composition-time `process.cwd()` as before. |

Intentionally retained extensions:

- `getAgentMetrics(sessionId?: SessionId): AgentMetricsSnapshot` (outside the presentation Pick): existing diagnostics/collection/failure isolation.
- `unloadCurrentModel(input?: UnloadModelInput): Promise<void>` (outside the presentation Pick): standalone memory boundary, delegates to model runtime/adapter and does not select a different model. `ModelMemoryPort`, adapter, HTTP and model protocol remain unchanged.
- `forceRefresh` as the optional second argument of direct `listModels`: preserves supported tested invalidation in the real runtime method signature without a second presentation listing API.

`TurnInput = Parameters<Runtime['runTurn']>[0]`; `TurnOutput = ReturnType<Runtime['runTurn']>`; `TurnDelta` infers its iterable element. No independently declared presentation method or turn shape remains. No public loop/generator objects or listing DTOs remain.

## Model-switch contract

1. Normalize requested string with the existing `normalizeOllamaModelName` (`trim`). Whitespace-only/empty names reject with `Ollama model name cannot be empty.` before unload or construction. Existing naming conventions remain; no catalog existence check or additional naming grammar is introduced.
2. Check the supplied optional signal before any unload. Already-aborted requests reject with normalized `DOMException` named `AbortError`, regardless of custom reason.
3. Await current adapter unload with the same signal. Existing request is `/api/chat`, current model name, `messages: []`, `keep_alive: 0`, `stream: false`; completion includes reading its response body. No candidate is constructed before this resolves.
4. On unload failure, stop and propagate original failure. If cancellation produced an AbortError or the signal's arbitrary `reason`, normalize it to AbortError. An independent unload/transport failure retains its cause even when cancellation is also pending. No new adapter/name commits.
5. Recheck abort immediately after unload and before construction. Construct next adapter locally with unchanged base URL/keep-alive configuration; construction failure propagates without mutating either active field.
6. Recheck abort after candidate construction and immediately before commit. Assign name and adapter synchronously with no intervening asynchronous work; only then resolve with normalized name.

Every precommit failure preserves old logical model name and adapter identity. Successful physical unload cannot be rolled back; the old logical adapter remains able to request/reload its model on a later chat. Switching does not mutate session ownership, catalog cache, diagnostics, or other composition dependencies. Direct same-name switches still unload; presentation's existing restore path skips switching when saved name already matches.

Commands/model-screen selection and session-model restoration both call this one async runtime operation. There is no public synchronous set/switch alternative. Standalone unload does not change logical selection and is preserved independently.

## Tests / validation

- `bun run release:check > /tmp/phase-4-baseline-release.log 2>&1`: passed before source/test changes, exit 0; counts and limits recorded above.
- Existing listing tests inspected before retirement: stored session order; all durable event types in stored order; foreign-session exclusion. Service filtering (deliberately unsafe adapter), listing-order, preview isolation, selection, and adapter-error tests plus added explicit coverage passed before deletion.
- `bun test src/composition/model/OllamaModelRuntime.test.ts`: pre-fix expected 2 pass / 9 fail (`/tmp/phase-4-switch-before.log`); after implementation 11 pass / 0 fail / 51 assertions (`/tmp/phase-4-switch-after.log`). Includes custom abort reasons during unload, abort after unload and during candidate construction, construction failure, old-adapter chat on failure, and normalized success after deferred unload body completion.
- `bun test src/application/services/SessionService.test.ts src/application/use-cases/ListSessions.test.ts src/application/use-cases/ListSessionEvents.test.ts`: passed before deletion; 30 tests / 281 assertions; `/tmp/phase-4-listing-migration.log`.
- `bun test src/composition/createRuntime.test.ts src/presentation/App.test.tsx`: passed, 21 tests / 102 assertions; `/tmp/phase-4-direct-api.log`.
- Expanded `bun test src/presentation/App.test.tsx`: passed, 17 tests / 68 assertions; `/tmp/phase-4-ui-routes.log`.
- Migration typecheck identified expected errors in the obsolete controller plus two strict optional-signal fixture/unload objects. Corrected conditional options without loosening port types; obsolete controller subsequently removed. Final typecheck passed as recorded below.
- Post-deletion typecheck found that an always-throwing fake switch inferred `Promise<void>`; explicitly annotated `Promise<string>`. No production contract weakened.
- Scoped `bunx biome format --write` on the ten deliberately changed TypeScript/TSX files: passed, seven formatted. No protected documentation, unrelated source, or deleted paths included.

Final deterministic validation on final formatted source:

| Command | Result / counts | Evidence / limits |
| --- | --- | --- |
| `bun test src/composition/createRuntime.test.ts src/composition/model/OllamaModelRuntime.test.ts src/application/services/SessionService.test.ts src/presentation/App.test.tsx src/presentation/state/sessionSummary.test.ts src/presentation/screens/Screens.test.tsx src/infrastructure/model/OllamaModelAdapter.test.ts` | Passed: 85 tests / 7 files / 493 assertions / 0 failures | `/tmp/phase-4-final-targeted.log`; includes all migrated listing behavior and model/UI routes. |
| `bun run typecheck` | Passed, exit 0 | `/tmp/phase-4-final-typecheck.log`. |
| `bun test` | Passed: 321 tests / 33 files / 2164 assertions / 0 failures | `/tmp/phase-4-final-full-suite.log`; all Phase 1–3 regressions remain. |
| `bun run format:check` | Passed, exit 0; 123 files, no fixes | `/tmp/phase-4-final-format.log`. |
| `bun run build && bun run smoke:build > /tmp/phase-4-final-build-smoke.log 2>&1` | Passed, exit 0 | Linux/Windows build output observed; smoke log in `/tmp`. Smoke proves existing artifact/terminal-guard/packaged-rg checks, not full interactive agent flow or native Windows execution. Ignored `dist/` is excluded. |
| `git diff --check`, `git diff --stat`, `git status --short`, untracked inventory | Passed / inspected | Ten modified source/test files, five deleted files, this new record only. |
| Complete source/test/deletion diff and new progress record review | Completed | Direct API/ownership only. Hook diff is API/import/variable/result changes; lifecycle/stream reconciliation unchanged. |
| HEAD-relative protected-input/dependency checks | Passed | Audit, plan, Phase 1–3 records, package/lockfile unchanged. No `.agent/` or build artifact included. |
| Obsolete structure/public-switch search | Passed | No old controller/listing/alias/approval method references under source; no synchronous switch/set-model entry point. Remaining production `switchModel` references are async owner, direct delegate/type, and two UI routes. `setModelName`/`setModelSelection` are React state setters. Internal ID-generator uses remain intentionally private to loop/runner. |
| Exact file inventory and hook-scope assertions | Passed | Read-only Python verification compared all 15 tracked diff paths to Phase 4 scope, verified five obsolete files absent and this record the sole untracked file. Both hooks exactly match HEAD after only the specified controller→runtime API/type/import substitutions and direct model-array unwrapping. |

Test inventory relative to starting HEAD (parameterized cases counted individually):

| File/group | Before | After | Coverage disposition |
| --- | ---: | ---: | --- |
| Listing test files | 3 | 0 | Ordered durable events migrated to service; foreign filtering already migrated in Phase 3 and retained; stored-session order remains in service and runtime. All three old registrations passed alongside new coverage before retirement. |
| `SessionService.test.ts` | 24 | 27 | Added explicit event ordering, empty missing-session behavior, listing error identity. Existing service ownership/foreign/error/preview tests unchanged. |
| `createRuntime.test.ts` | 2 | 7 | Existing shared-owner/name/normalization/metrics/workspace behavior migrated to direct API; real turn/service identity and subscriptions, direct arrays/errors, deterministic IDs/privacy, catalog refresh, unload-before-next-turn, abort/standalone unload, approval replacement/disposal/default denial. |
| `OllamaModelRuntime.test.ts` | 2 | 11 | Both cache/refresh cases retained; nine added deterministic switch cases failed on old implementation before passing on new ownership. |
| `App.test.tsx` | 14 | 17 | All old assertions retained with fake-runtime migration; existing resume strengthened with model restoration; three added command/screen/restoration-failure cases. |
| Remaining tests | 259 | 259 | Unchanged. |
| **Full suite** | **304** | **321** | Net +17; three wrapper registrations retired only after equivalent coverage passed. |

## Deviations / discoveries

- Catalog/adapter/HTTP/ModelMemoryPort boundaries remain useful. Runtime model-list results are direct arrays while catalog internals keep their existing port/protocol contract. Explicit force-refresh capability is preserved with a documented direct API extension.
- Existing later-round `receivedFirstDelta`/completion reconciliation is Phase 5 scope and remains unchanged.
- Direct model listing now returns `ListedModel[]`, removing immediate UI `{ models }` unwrapping too. Its refresh argument moved from the old runtime options object to an optional second argument, keeping the UI's signal-first contract and tested invalidation capability. Infrastructure catalog result wrappers remain behind their useful boundary.
- Cancellation normalization is limited to actual abort checks/abort-caused unload rejection. Independent unload failures remain original causes, consistent with Phase 2 error truthfulness.
- Model construction fault injection uses private-state test inspection/spies; no production factory/diagnostic surface was added for tests.
- Optional live Ollama verification was not used. No external model was unloaded or changed by validation; deterministic tests use mocked fetch and presentation fakes. No interactive/native Windows claim is made.
- No blockers. No Phase 5+ work started.

## Remaining work

None for Phase 4.

## Architecture after Phase 4

- `App` → injected `PresentationRuntime` (derived Pick), default `createRuntime()`. No controller construction/import remains.
- Presentation → runtime `listSessions` → the one `SessionService.listSessions` → durable adapter.
- Actual selection → runtime `listSessionEvents` → service `activateSession`; foreign filtering/replay/cache lifetime remain service-owned.
- Resume previews → runtime `readSessionPreviewEvents` → service `readPreviewEvents`; transient, no activation or model reducer retention. Presentation summary formatting/sorting unchanged.
- Presentation → runtime `runTurn` → private loop → same service/runner/model ports. Session subscription goes directly to that service, after durable/state commit.
- Presentation command/screen or session restoration → runtime async `switchModel` → `OllamaModelRuntime.switchModel` → current adapter unload → cancellation checks/local candidate → synchronous name+adapter commit.
- One production `new SessionService(new JsonlSessionStore())` remains in composition. No new session wrappers/caches/filters. Runtime diagnostic/model-memory extensions stay outside presentation's Pick.

## Final Phase 4 summary

- Status: verified against starting HEAD `7c6fac6024da0ecb468fca9587ca4f770c2316fb`. All required deterministic validation passed.
- Added (1): `docs/progress/phase-4-progress.md`, created before source/test changes.
- Changed (10): `src/App.tsx`; `src/composition/createRuntime.ts` and `.test.ts`; `src/composition/model/OllamaModelRuntime.ts` and `.test.ts`; `src/application/services/SessionService.test.ts`; `src/presentation/App.test.tsx`; `src/presentation/hooks/usePresentation.ts`; `src/presentation/hooks/useChatSession.ts`; `src/presentation/types.ts`.
- Deleted (5): `src/presentation/adapters/PresentationController.ts`; `src/application/use-cases/ListSessions.ts` and `.test.ts`; `src/application/use-cases/ListSessionEvents.ts` and `.test.ts`.
- Removed `RuntimePresentationController`, independent `PresentationController` method declarations, both listing classes/result wrappers, and `ListedSessionEvent`. Kept private loop and generator, one service, model/memory/protocol ports, diagnostics, refresh, and standalone unload. Simplified redundant adapter/port intersection.
- Final runtime API and model-switch semantics are specified above. All public switching is async, unload-first, and preserves logical name/adapter on unload failure, precommit cancellation, or construction failure.
- Tests: migrated wrapper coverage before deletion, expanded direct composition and UI fakes/routes, nine pre-fix switch regressions, retained prior-phase behaviors. Final required targeted 85 tests and full 321 tests pass; typecheck/format/build/smoke/whitespace/scope/protected-input checks pass.
- Unresolved Phase 4 issues: none. Optional real-model, interactive packaged/native Windows validation was not performed and is not claimed. Baseline/final smoke limitations are recorded separately.
- Phase 5+ was not started: `receivedFirstDelta`, assistant/error reconciliation, `StreamBuffer`, `LiveTurn`, reducers/context assembly, prepared tools/metadata lookup, `currentMessages`, `toolMessages`, `ContextBuilder`, workspace policy, JSONL, dependencies, and folder structure remain unchanged in behavior. No retries or general dead-code cleanup. Audit, primary plan, and Phase 1–3 records remain unchanged. No commit created.
