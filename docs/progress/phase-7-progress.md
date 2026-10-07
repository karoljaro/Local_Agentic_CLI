# Phase 7 implementation progress

## Status

verified

## Baseline

- Starting HEAD: `d1e953a13d47fe72b11472f3fc6507c6658ac34a` (2026-10-07).
- Starting `git status --short`: empty. Starting `git diff --name-only`: empty. No pre-existing changes.
- Phases 1–6 are present in HEAD: `a2d94c7`, `6003da8`, `7c6fac6`, `96cd718`, `46ed7d1`, `d1e953a`; all six progress records report verified status.
- Read the architecture audit, primary execution plan, and Phase 1–6 records. No applicable AGENTS.md found in workspace/ancestors.
- Created this record before source/test edits. Audit, primary plan, Phase 1–6 records, package and lockfile are protected inputs.
- Baseline `bun run release:check` passed, exit 0: 364 tests / 34 files / 2451 assertions, typecheck/format, Linux/Windows builds and existing packaged smoke. Log `/tmp/phase-7-baseline-release.log`; ignored dist output excluded.

## Context architecture before Phase 7

- `AgentLoop.runTurn` checks prompt size before activation/append, commits the prompt, reads `SessionService.readSessionState`, and invokes `ContextBuilder.build` once.
- No executor: `runStreamingModelTurn` requests that initial context, reads deltas/tool calls, ignores tool calls, and persists final text (including empty text). Empty registry enters the same separate text method from `runWithTools`.
- Tools: `runWithTools` assigns initial messages to `currentMessages`; every round calls `fitModelMessages` → `ContextBuilder.fit` on this carried array. After normalized batch persistence and awaited execution it manually appends an assistant model message (ID/content/tool calls) and `ToolRunner.toolMessages` to that array. Committed state is not reread for later requests.
- `ToolRunner.executeToolCalls` creates `toolMessages`, maps failures to JSON error content, serializes successful or cached output, and returns those messages plus optional denial terminal text. `recordToolExecution` separately serializes outputs for diagnostic character counts. `SessionReducer.toToolMessage` serializes the same outputs/errors during committed reduction/replay.
- `SessionReducer` alone assembles replay batch history: assistant content/ID/normalized calls followed by terminal results in original call order, only after every call has a terminal event. Legacy requested/terminal and orphan terminal paths remain supported. Its incremental state is owned by the bounded selected-session service.
- These are all production model-history assembly sites outside SessionReducer: `RunAgentTurn.runWithTools`' assistant/result array append and `ToolRunner.executeToolCalls`' tool-result pushes. ContextBuilder prepends system context and selects whole turns; prompt preflight constructs a single candidate user message solely for budgeting. Model adapters map protocol fields, not history ownership. Presentation has a separate UI transcript reducer.
- `readModelResponse` accumulates round text/tool calls; its `streamContent` boolean gates deltas, although both callers pass true. Final successful text uses `appendAssistantCompleted`; tool-round content uses `appendAssistantToolCallsCompleted`. Stream failure reports best-effort MODEL_STREAM_FAILED and exits without completion/execution.
- Live/replay can diverge because later live requests use the separately fitted carried array rather than current committed reducer state. Denial returns terminal text without a next request; durable denial/cancelled results are assembled only by reducer. Previously dropped turns cannot be reconsidered by the carried array.

## Work completed

- Captured baseline/phase presence and current ownership; created persistent record before source/test changes.
- `RunAgentTurn.ts / AgentLoop.runTurn`: one loop now handles optional executor, empty registry and tools. Every iteration awaits `buildModelMessages` → SessionService state → ContextBuilder.build. Removed `currentMessages`, manual assistant/tool history appending, `runWithTools`, and `runStreamingModelTurn`; completed tool execution returns to the canonical boundary (requirements 1–2, 5, 9–11, 19).
- `buildModelMessages`: catches and reports ContextBudgetExceededError at the shared read/build boundary; retained prompt preflight before activation/append. No retries or duplicate prompt commits (requirement 17).
- `readModelResponse`: removed streamContent and false branch; all nonempty deltas stream. Finalization remains durable for text/empty answers, denial stays terminal, stream errors exit before preparing/executing calls, and loop remains exactly 12 rounds (requirements 12–16, 20).
- `appendAssistantToolCallsCompleted`: now returns void because orchestration no longer uses the persisted event to build a second assistant message. Its persisted payload remains unchanged.
- `ToolRunner.ts / ToolExecutionBatchResult, executeToolCalls`: removed ModelMessage import, toolMessages, model serialization/pushes; returns `{}` or `{ terminalMessage }`. Prepared lifecycle/approval/cancellation/dedup/invalidation and awaited terminal appends remain unchanged. Replaced string-returning stringifyToolOutput with numeric measureToolOutputCharacters used only inside isolated diagnostic recording (requirements 3–4, 16, 18, 24–25).
- `ToolRunner.test.ts`: migrated five history-result assertions to durable events/minimal controls, retaining result ordering/linkage and lifecycle checks. LifecycleStore now serializes at its durable append boundary like JSONL, preserving the Phase 2 post-success serialization failure regression after removing runner serialization. Diagnostic sizing failure test asserts successful commit, zero metrics, two serialization attempts (diagnostic/commit), and incomplete-batch exclusion.
- `RunAgentTurn.test.ts`: common harness now captures committed prefixes at actual ModelPort.streamChat entry; each request independently reconstructs a fresh service/reducer and ContextBuilder. Existing multiple-call, failed-second-call, intermediate text, repeated search and prepared mutation invalidation cases explicitly assert checked boundary counts. Existing real JSONL normalized-input test now reconstructs via a fresh JSONL store/service at both requests, retaining every Phase 6 identity/parse/projection assertion.
- Added 16 deterministic loop cases: existing/legacy/orphan initial context; deferred final terminal barrier plus state/build counts; real JSONL interrupted-prefix new turn; initial/post-tool whole-turn truncation; normalized list references across rounds; six no-executor/empty-registry text/tool-data/empty combinations; partial stream with accumulated calls; common initial build budget reporting; successful twelfth text round; twelve two-call batches without a thirteenth request; denial/cancelled results visible identically on a later prompt. Existing next-context budget case additionally asserts one prompt, one request, one committed result, no completed answer.
- SessionReducer, SessionService, ContextBuilder and prepared executor production code are unchanged; their established semantics now determine every request.

## Canonical context contract

- State read: await SessionService.readSessionState for each request, after prior lifecycle appends resolve. Service queue/reducer/cache semantics are unchanged; no loop cache or event-array reconstruction.
- Build/request: ContextBuilder.build(state).messages is request-local and sent directly to ModelPort with the same optional signal. No direct loop fit call, history append, or carried array. System messages/grouping/size accounting/current-turn retention/whole newest older turns/first-over-budget cutoff/error class remain unchanged. Repeated JSON serialization remains Phase 8 work.
- Completed batches: the final real terminal append triggers reducer publication of one assistant message plus ordered tool messages. Loop awaits the entire runner before reading/building a next round. Original IDs/names/normalized arguments/intermediate content survive unchanged.
- Incomplete batches: durable partial events and completed workspace side effects may exist, but reducer excludes the whole assistant/results batch until every call is terminal. Cancellation/storage failure stops without a new request or fabricated terminals; a fresh prompt reconstructs the same exclusion.
- Failed batches: genuine non-abort execution failure is persisted as TOOL_FAILED, mapped solely by reducer to the existing JSON error shape, and completes its slot; later calls can finish and the complete batch can enter a next request. Persistence/reduction errors propagate their actual cause, never become tool errors.
- Denial/cancelled results: explicit/default denial persists TOOL_APPROVAL_DENIED and closes later calls with TOOL_BATCH_CANCELLED without execution. Runner returns terminal text; loop streams/commits it and ends without another model request. Reducer assembles denial/cancelled messages for later prompts/replay.
- References: deduplication persists unchanged `{ cached, sourceToolCallId, message }` output linking to the original success. Reducer serializes this identically live/replay. Prepared successful mutations still clear turn-local references; subsequent actual output remains durable authority. No dedup cache moved to context.
- Budget errors: oversized prompt preflight still rejects before durable reads/activation/append/model/tool work, with no error append as before. A read/build ContextBudgetExceededError is best-effort reported as CONTEXT_BUDGET_EXCEEDED and rethrown. Next-round oversized results remain committed; no next request/final answer, retry or duplicate prompt.
- No-tools: absent executor and zero tools enter the same loop/read/finalization path; omit the tools property, perform one text round, ignore all returned tool-call data, never prepare/execute calls, commit accumulated text.
- Empty completion: successful no-continuation round commits assistant.message.completed even with empty content. Presentation continues its Phase 5 invisible-empty behavior.
- Stream failure: already yielded deltas remain local presentation partials; MODEL_STREAM_FAILED is best effort for non-abort failures. No successful assistant completion, batch persistence or accumulated call execution follows. Abort reporting and signal checks remain unchanged.
- Limit: at most 12 model rounds with tools; round 12 may complete text normally. If it returns tools, execute/commit the complete twelfth batch, then report TOOL_ITERATION_LIMIT_REACHED and throw the same text; no thirteenth request. Limit is per round, not per call.

## Live vs replay evidence

`checkRequestBoundaries` runs at ModelPort.streamChat entry before response consumption. It JSON-clones committed events and constructs a new SessionService/InMemorySessionStore/reducer plus a new ContextBuilder with identical configuration. It compares fresh service state to reduceAgentState(prefix), then compares the actual input.messages structurally to fresh build(state). The live state/cache and builder are never reused. Prefix capture does not read the live service. Existing exact full message/event-order assertions remain.

| Case | Request-boundary evidence |
| --- | --- |
| Existing initial/legacy/orphan history | Prior prompt/answer, legacy requested/completed and orphan completed output followed by new committed prompt; actual first request shape plus one live state read/build. Existing reducer legacy/orphan tests unchanged. |
| Multiple successes / intermediate content | Two-call exact order/IDs/arguments assertions retained; intermediate assistant content checked; both request prefixes compared independently. Deferred final append test proves state/build/request counts stay one until last terminal persists, then advance to two. |
| Failed second call | Real second executor throws file missing; full ordered lifecycle/error shape retained; both actual request boundaries independently compared. |
| Search/list references | Existing repeated search compares all three boundaries; added list case normalizes arguments and compares three boundaries, two reused results reference original ID. |
| Prepared mutation invalidation | Existing search → cached search → approved edit → search → answer compares all five boundaries; executor list and version-2 output prove invalidation, including the immediate post-edit request. |
| Truncation | Budget 500 with a huge old turn, recent complete turn and new tool turn: first request retains recent whole turn, post-tool request drops it wholly; both equal independent replay, retain current/system and fit budget. No sizing change. |
| Normalized real JSONL batch | Existing Phase 6 real-disk normalized multi-call/dedup case now loads a fresh JsonlSessionStore + SessionService at both boundaries, compares to the same disk prefix, and verifies final state/projection as before. |
| Interrupted real JSONL prefix | Persist two-call batch with first terminal and second requested/started only; fresh service/loop with new prompt sends neither assistant tool content nor any partial result/call. Fresh disk/service comparison at request; exact original prefix retained and only new prompt/final appended. |
| Denial/cancelled history | First run streams intermediate/terminal text, commits denied/cancelled outcomes with zero execution and one request. Next prompt through same live service compares to fresh prefix; IDs/order/error JSON/terminal content match. |
| No-tools / limits | Every request in the common harness also gets fresh comparison, including six no-tools variants, 11 batches + twelfth final text, and all 12 two-call tool rounds. |

The cloned in-memory prefixes model JSON-serializable durable commits. Real JSONL cases additionally prove disk loading/service reconstruction. These comparisons are at intermediate requests, not inferred from final turn state.

## Tests / validation

- Baseline release passed as above.
- Initial loop/runner tests: 74 pass / 1 fail / 379 assertions (`/tmp/phase-7-initial-targeted.log`); the old diagnostic test's model-message expectation was invalid for its intentionally incomplete batch. Corrected to durable output and exclusion assertions; no production reducer change.
- Initial typecheck passed (`/tmp/phase-7-initial-typecheck.log`). Boundary harness insertion briefly produced a syntax error; corrected. Typecheck then identified unused imports reserved for added cases; resolved by implementing those cases.
- Boundary-upgraded existing loop/runner suite: 75 pass / 521 assertions (`/tmp/phase-7-boundary-upgrade-2.log`).
- Expanded coverage first run: 89 pass / 1 fail (`/tmp/phase-7-expanded-tests.log`); 600-character fixture still retained the recent turn after tools. Set fixture budget to 500 to exercise actual whole-turn dropping. ContextBuilder unchanged.
- Expanded loop/runner coverage: 91 pass / 0 fail / 740 assertions (`/tmp/phase-7-expanded-tests-2.log`). Expanded typecheck passed (`/tmp/phase-7-expanded-typecheck-2.log`).
- Baseline production copied into isolated `/tmp/phase-7-before-hmp7mh6l` with final tests: `bun test src/application/use-cases/RunAgentTurn.test.ts -t 'awaits every terminal append|common initial context budget error'` failed as expected, 0 pass / 2 fail / 14 assertions. Old path reads state once rather than twice and does not report an initial build budget error (`/tmp/phase-7-regressions-before.log`). Workspace source was never reverted.
- Scoped `bunx biome format --write src/application/use-cases/RunAgentTurn.ts src/application/use-cases/RunAgentTurn.test.ts src/application/services/ToolRunner.ts src/application/services/ToolRunner.test.ts`: passed; formatted only these four deliberately changed files (three fixed).

Final validation on final formatted source:

| Command / inspection | Result | Evidence / notes |
| --- | --- | --- |
| `bun test src/application/use-cases/RunAgentTurn.test.ts src/application/services/ToolRunner.test.ts src/application/services/SessionReducer.test.ts src/application/services/SessionService.test.ts src/application/services/ContextBuilder.test.ts src/presentation/App.test.tsx` | Passed: 146 tests / 6 files / 1100 assertions / zero failures | `/tmp/phase-7-final-targeted.log`; exact Phase 7 plan command. |
| `bun run typecheck` | Passed, exit 0 | `/tmp/phase-7-final-typecheck.log`. |
| `bun test` | Passed: 380 tests / 34 files / 2813 assertions / zero failures | `/tmp/phase-7-final-full-suite.log`; all Phase 1–6 coverage, including Phase 5 hook/presentation and Phase 6 parse/selection tests. |
| `bun run format:check` | Passed, exit 0; 124 files, no fixes | `/tmp/phase-7-final-format.log`. |
| `bun run build` | Passed, exit 0 | `/tmp/phase-7-final-build.log`; existing Linux/Windows targets. Ignored dist output excluded. |
| `bun run smoke:build` | Passed, exit 0 | `/tmp/phase-7-final-smoke.log`; existing artifact/terminal guard/packaged rg checks, not an interactive agent or native Windows run. |
| `git diff --check`, `git diff --stat`, `git status --short`, untracked inventory | Passed / inspected | Four tracked source/test changes (654 insertions / 146 deletions) and this new record only. |
| Complete Phase 7 source/test diff and progress record | Reviewed | Canonical state boundary, removed parallel history, shared lifecycle, fresh-prefix fixtures, retained old contracts/assertions. |
| `rg -n 'currentMessages|toolMessages|streamContent' src` | No matches | Historical descriptions in protected docs/this record remain intentionally. |
| Production assistant/tool/history/serialization search | Passed / investigated | All model history pushes and assistant/tool message construction are in SessionReducer; one loop state/build boundary. Runner serialization is numeric diagnostic sizing only. ContextBuilder system/prompt-preflight/selection and Ollama protocol mapping remain their existing responsibilities. Adapter unload `messages: []` is a model-memory command, not an agent conversation request. |
| HEAD-relative exact scope/protected-input verification | Passed | Read-only Python assertions: exact four tracked paths and one untracked record; HEAD unchanged; all six phase commits ancestors; audit/plan/Phase 1–6 records/package/bun.lock byte-identical to HEAD. ContextBuilder/SessionReducer/SessionService/prepared executor files also byte-identical; no JSONL schema, generated artifact or .agent changes included. |

Deterministic test inventory relative to starting HEAD:

| File / group | Before | Added | Final | Evidence |
| --- | ---: | ---: | ---: | --- |
| RunAgentTurn.test.ts | 40 | 16 | 56 | New common-path/replay/atomic/budget/limit cases; existing harness and normalized JSONL case upgraded at actual request boundaries; existing full-order/ID assertions retained. |
| ToolRunner.test.ts | 35 | 0 | 35 | Five result assertions migrated to committed events/minimal controls, durable serialization fixture, all prepared/lifecycle regressions retained. |
| SessionReducer.test.ts | 6 | 0 | 6 | Unchanged legacy/orphan/atomic/result mapping. |
| SessionService.test.ts | 27 | 0 | 27 | Unchanged commit ordering, cache/preview ownership, fresh replay, persistence faults. |
| ContextBuilder.test.ts | 5 | 0 | 5 | Unchanged system/grouping/whole-turn/budget behavior. |
| App.test.tsx | 17 | 0 | 17 | Unchanged approval/cancellation/resume/direct runtime behavior. |
| Targeted total | 130 | 16 | 146 | Exact plan paths. |
| Full suite | 364 | 16 | 380 | No tests removed; all prior phases remain green. |

## Deviations / discoveries

- No blockers identified. ContextBuilder repeated serialization belongs to Phase 8 and remains unchanged.
- Initial build errors previously escaped before tool-path reporting. The shared boundary now reports CONTEXT_BUDGET_EXCEEDED consistently, as Phase 7 requires; oversized prompt preflight remains pre-append with existing no-event behavior.
- Lifecycle fake now performs JSON serialization at commit rather than relying on the removed runner serializer. This preserves real post-success serialization failure coverage and matches JSONL ownership.
- Truncation fixture required budget 500 rather than 600 to force recent-turn eviction after tools; this is fixture calibration, not a sizing algorithm change.
- No audit/plan/prior records/schema/dependencies/service/cache/registry/presentation/workspace policy/adapter/protocol/folder/retry changes. Phase 8+ has not started.
- Optional Ollama check has not been performed; deterministic request-boundary comparisons are authoritative.

## Remaining work

None for Phase 7.

## Final Phase 7 summary

- Status: verified against starting HEAD `d1e953a13d47fe72b11472f3fc6507c6658ac34a`. All required deterministic validation passed.
- Added (1): `docs/progress/phase-7-progress.md`, created before source/test changes.
- Changed (4): `src/application/use-cases/RunAgentTurn.ts`, `src/application/use-cases/RunAgentTurn.test.ts`, `src/application/services/ToolRunner.ts`, `src/application/services/ToolRunner.test.ts`. Deleted files: none.
- Removed duplicate `currentMessages` live history, manual assistant/tool array appends, ToolRunner.toolMessages and its model-message serializer/import/pushes, `fitModelMessages`, separate `runWithTools`/`runStreamingModelTurn` lifecycle methods, streamContent suppression, and unused returned tool-batch event. Numeric metrics sizing is retained and isolated.
- Final orchestration: prompt preflight → service activation/committed prompt → common round loop → await SessionService state → ContextBuilder.build → shared model stream → durable final assistant text (including empty), or prepared whole-batch projection → awaited ToolRunner terminal events → repeat canonical read/build. Explicit denial streams/commits its terminal text and ends; stream/cancellation/persistence failures stop; exactly twelve tool rounds remain allowed.
- SessionReducer is now the sole assistant/tool conversation assembler for both incremental live state and fresh replay. Completed batches enter context only after terminal persistence; incomplete batches remain excluded on new prompts/restarts. IDs/order/normalized arguments/content/errors/denial/cancelled/reference/legacy shapes are preserved.
- Added 16 deterministic cases and upgraded existing boundaries to fresh reconstruction. Real JSONL normalized and interrupted cases complement cloned durable-prefix tests. Existing whole-order/ID assertions, prepared one-parse/selection/identity guarantees, diagnostics and Phases 1–5 regressions remain green.
- Validation: baseline release passed; final targeted 146 and full 380 tests pass; typecheck, format, build, packaged smoke, whitespace/search/protected-input/exact-scope checks and complete diff/record review pass. Details and limits are above.
- Unresolved Phase 7 issues: none. Optional Ollama/interactive/native Windows checks were not performed and are not claimed. Existing smoke limitations remain documented.
- Phase 8+ was not started. ContextBuilder sizing/serialization algorithm and budget accounting are unchanged; no service/cache/runtime/presentation/registry/protocol/schema/workspace policy/default/dependency/folder/retry redesign or general cleanup. Audit, primary plan, Phase 1–6 records and package/lockfile are unchanged. No commit created; no .agent or generated artifact included.
