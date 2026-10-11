# Phase 18.3 — structured session-memory lifecycle and turn latency

## Status

verified

Status vocabulary: not started, in progress, lifecycle evaluated, implementation complete, verified, blocked, inconclusive. No commit requested. Historical progress records are protected. No sub-agents are used.

Focused lifecycle implementation, deterministic concurrency coverage, two bounded live scenarios and all release gates are complete. No required work remains. Verification concerns ownership/latency/safety, not semantic extraction quality.

## Baseline

- Starting HEAD: `cf119e40e77c897e0acb811188edae695f8cff16`.
- Starting `git status --short --untracked-files=all` and `git diff`: empty; clean checkout. No repository/ancestor `AGENTS.md` found.
- Bun: `1.4.3`. Effective `TEST_MODEL=qwen3.5:9b`, selected only for disposable live evaluation. Application `OLLAMA_MODEL` unset. Provider `http://localhost:11434`.
- Effective `OLLAMA_KEEP_ALIVE="0"`, normalized to `keep_alive: 0`. Context/output profile remains 16384/4096; semantic output cap remains 1024 with unchanged instruction/schema/settings.
- Production semantic deadline: **10000 ms**. Activation/read and atomic publication each have a separate **1000 ms** caller bound.
- Read Phase 18.2 authoritative evidence and relevant Phase 18, 18.1, 17, 16 and 15.5 contracts. No six-case quality-corpus rerun is planned.
- Focused deterministic baseline: `bun test` over RunAgentTurn, RunAgentTurnMemory, SessionMemoryService, SessionService, Conversation, ModelSessionMemoryUpdater, ContextBuilderMemory, JsonSessionMemoryStore, ModelSelection, ModelResume, ContextBuilderRetrieval, RunAgentTurnRetrieval, HistoryRetriever, RunAgentTurnToolRecovery, createRuntimeMemory, OllamaMemoryExtraction and OllamaModelAdapter tests. **395 pass, 0 fail, 2418 assertions, 17 files**, exit 0; `/tmp/phase-18.3-baseline-focused.log`.
- This record was created before production edits.

## Lifecycle analysis

Confirmed old normal sequence:

`Conversation.submit()` sets an active turn → composition resolves the selected model → RunAgentTurn activates canonical session and derived memory → durable prompt append → canonical model/tool loop → durable final `assistant.message.completed` append → **await maintainMemory() → await SessionMemoryService.finish() → queued semantic extraction** → schema/delta/provenance validation → atomic derived publication → iterator completes → `Conversation.consume()` finally clears active → next submission accepted.

- SessionService serializes durable appends/selection/reducer updates through its ownership gate. It appends to the durable store before notifying memory/presentation observers. SessionReducer remains canonical history assembler.
- Conversation.consume holds active through iterator completion; submit rejects while active/loading/disposed. TUI uses the same running gate. Conversation tracks interactive iterators, session loads and model switches for disposal.
- SessionMemoryService owns selected-session exact projection, generation/scope cancellation, evidence, source digest, semantic finish promise tail, and publication tail. `finish()` already snapshots evidence and prefix before queueing. Its old queue may wait behind earlier semantic work; no independent optional-work owner exists.
- Each semantic request combines caller, session and fresh 10000 ms deadline signals. ModelSessionMemoryUpdater checks selected identity before/after stream; selected chat ModelPort receives that signal. Ollama adapter forwards it to fetch; stream finally cancels/releases its reader. ModelPort/ModelSelection/adapter have no chat-request mutual-exclusion gate, so detaching alone permits overlapping inference. Provider scheduling/VRAM cannot be assumed to prioritize chat.
- Any canonical event changes the prefix digest and fences an old result. Session activation aborts scope and advances generation, including A→B→A. Prefix/provenance validation remains authoritative. Candidate publication uses exclusive temporary file, close, cancellation check and atomic rename, never JSONL. Already-dispatched OS rename cannot be rolled back; publication tails preserve order even after caller timeout.
- Model switching serializes selection operations but does not serialize streams against switching. Composition must cancel optional work before switch/unload and before next turn model resolution. Selected identity checks alone are insufficient for prompt cancellation and A→B→A invalidation.
- Old shutdown aborts/awaits tracked conversation work; memory is indirectly inside that work. Detached memory needs explicit runtime disposal cancellation with no optional-inference flush.
- Next-turn context can use prior valid semantic memory plus current exact deterministic projection. The exact current user/active chain is mandatory; the previous whole turn is included when it fits under existing Phase 16/17 policy; older history/retrieval and deterministic fallback remain unchanged. Renderer already states derived notes may be stale and yields to current user/workspace/tool/conflicting exact history.

## Candidate policies

| Policy | Evaluation |
| --- | --- |
| A: synchronous semantic finish | Freshest memory but blocks submit after durable answer. Phase 18.2 measured 9048.933–10002.327 ms. No canonical correctness requirement justifies waiting for optional derived state. |
| B: resident model, still synchronous | Phase 18.2 found non-residency in all 14 checks and 2238–2523 ms model load in completed frames. Generation remained 6275–10313 ms. Removing reload cannot resolve multi-second post-answer blocking; global retention would change intentional runtime lifecycle. Rejected as UX fix. |
| C: owned opportunistic finish | Serious candidate: existing exact-prefix/generation/provenance/publication fences support late-result discard. Needs owned cancellation before interactive inference, bounded pending work, observed rejection and shutdown/session/model wiring. Focused extension of SessionMemoryService rather than generic job machinery. |

The optional warm diagnostic is **skipped**: authoritative Phase 18.2 load/generation evidence is sufficient to reject B. Keep-alive and 10000 ms semantic deadline remain unchanged.

## Chosen lifecycle

Chosen before production edits: **C, owned opportunistic maintenance**. SessionMemoryService owns one current maintenance operation, cancellation controller, observed completion, and at most one unresolved raw updater invocation across the runtime. Superseding work aborts the old controller immediately; the next turn never awaits its semantic completion. An updater that ignores cancellation suppresses later optional extraction until its raw promise settles, so requests cannot accumulate. No retry/backfill/quality change.

Normal sequence: canonical final append and observer projection → hand immutable prefix/evidence/memory snapshots to the owner → iterator returns without awaiting maintenance → Conversation clears active → idle result validates and atomically publishes if still owned. Handoff may dispatch extraction before consume's finally runs; it cannot await it. Separate read/write I/O bounds are preserved.

New interactive turn cancels before model resolution/preflight and again at direct loop entry. Every observed canonical event invalidates pending maintenance. Session activation advances generation; composition cancels immediately when changing selected session. Model switch/unload cancels before invoking unchanged ModelSelection. Runtime disposal aborts/unsubscribes memory immediately, with no inference flush. The completed interactive turn's controller is checked at scheduling, then detached; a later cancel of that already completed turn does not own background publication. Failed/interrupted/denied turns schedule deterministic-only derived publication under the same owner, without semantic completion inference or optional I/O on the turn's blocking path. Already-aborted scheduling is skipped as before; committed exact observations remain in memory and rebuildable from canonical events.

Publication requires unchanged session, activation generation, exact prefix digest, current operation signal and existing provenance/host validation. Cancelled late deltas never enter publication. Atomic publication remains ordered beyond caller timeout; only actual dispatched I/O is retained in the publication tail, with no backlog of cancelled inference operations. An already-dispatched rename can complete with an older **correctly labeled valid prefix**; it is never attributed to new events/model/session and cannot overtake a newer write. In-memory semantic replacement checks cancellation after I/O too.

Next-turn context uses the last successfully published semantic state and exact current projection; missing immediately previous semantic extraction is allowed. Current user/workspace/tool/conflicting exact history precedence is unchanged. Canonical events, SessionReducer, compiler, retrieval, schema/prompt/settings and model selection policies remain untouched. Process exit may lose pending derived updates; canonical completion remains durable.

Provider concurrency review: application ModelPort has no mutual exclusion. Ollama supports parallel work when memory permits and FIFO queueing otherwise, so neither concurrency nor scheduler priority is safe to assume ([official FAQ](https://docs.ollama.com/faq)). HTTP signals/reader cancellation reach the request; upstream handlers derive execution context from the request ([routes](https://github.com/ollama/ollama/blob/main/server/routes.go)). This supports cooperative cancellation, not a generic server-side cancellation-ack guarantee. Live smoke will measure local stream settlement and interactive dispatch separately; no priority API/configuration is invented.

## Validation

Baseline above. Deterministic concurrency coverage precedes live inference. Live plan is at most two disposable, bounded scenarios: idle completion and immediate next turn, using configured TEST_MODEL and unchanged production semantic request. Separate turn-release, semantic-work, submission/start and observable cancellation latencies will be recorded. Semantic success is not required for lifecycle success.

Before live inference, expanded focused command covers the baseline 17 files plus SessionMemoryLifecycle, TerminalApp, createRuntime, createRuntimeRetrieval and ToolDefinitions: **468 pass, 0 fail, 3994 assertions, 22 files**, exit 0; `/tmp/phase-18.3-focused-deterministic.log`. Typecheck also passes; `/tmp/phase-18.3-before-live-typecheck.log`. Tests use deferred promises and a controllable injected deadline signal; no new concurrency sleeps. They establish durable append before handoff, unresolved updater/Conversation release/next submit, exact previous+current context without fresh semantic memory, valid idle publication, timeout/failure/atomic rejection, observed detached rejection, supersession/backlog suppression, old raw result discard, session A→B→A, model switching/A→B→A identity reuse, cancellation before catalog/stream/unload/session load, cancelled publication, delayed atomic-write ordering, and immediate disposal/unsubscription. Existing provenance/deterministic file/problem/retrieval/tool-recovery tests pass.

An interim full run passed **970 tests / 55 files / 7325 assertions** before the final additional regressions. That run exposed test-fixture teardown allowing optional work to outlive mocked storage (a synthetic `selected` memory artifact/temp). Fixture teardown now cancels and observes owned work before restoring mocks, including model-resume disposal order. The two exclusively generated synthetic artifacts were identified by their current-run birth time, test-model identity and fixture paths, then removed; subsequent focused run produced no checkout memory files. No canonical/user artifacts were removed. Final release gates cover the finalized code/tests below.

### Frozen live lifecycle smoke

Read-only preflight: configured TEST_MODEL installed; provider version `0.40.2`; `/api/ps` has no resident models. No activation, inference, download or keep-alive change in preflight.

Harness `/tmp/phase-18.3-live.ts`, exclusive dispatch guard `/tmp/phase-18.3-live-started.json`, result `/tmp/phase-18.3-live-result.json`. Exactly two scenarios A then B, no retry. Aggregate caller bound **45000 ms**; external hard limit **50 seconds** plus 2-second termination grace. At most **two real production semantic requests and one real ordinary chat request**; no embeddings. First answer in each scenario is scripted through the actual RunAgentTurn/SessionService/JSONL/Conversation lifecycle to isolate post-answer latency. Semantic work uses ModelSessionMemoryUpdater with actual configured selected ModelPort, production schema/instruction/settings/window/output and default 10000 ms bound. This is a lifecycle smoke, not an end-to-end first-answer speed or quality benchmark.

Fixed first user evidence: `Build a local CLI for searching project notes.` Fixed controlled final evidence: `I understand the objective; implementation has not started.` B next user: `Reply with exactly OK. Do not use tools.` B waits for an actual semantic response byte before immediate next submission, proves it is still pending, then observes cancellation and a real ordinary selected-model request with all nine tools and unchanged profile. At B's second committed canonical answer the disposable memory owner is closed, preventing a third semantic opportunity. Disposable actual JSONL and atomic memory stores live only under `/tmp`; captured canonical events/artifacts and boundary timestamps are preserved in the result before cleanup. Read-only residency observations accompany each scenario. The observer forwards unchanged bytes and records local fetch/reader settlement; it cannot establish a server/GPU cancellation acknowledgement.

### Live results

The sandboxed Bun preflight failed with `ECONNREFUSED` before dispatch: **zero scenarios, zero semantic/chat requests**, no dispatch guard created; `/tmp/phase-18.3-preflight-failure.json`. The identical harness command then ran once with approved escalation for local provider access:

```bash
timeout --signal=TERM --kill-after=2s 50s bun run --tsconfig-override /home/karoljaron/Projects/Local_Agentic_CLI/tsconfig.json /tmp/phase-18.3-live.ts > /tmp/phase-18.3-live.log 2>&1
```

Exit 0, explicit PASS. Started **2026-10-11T17:47:03.350Z**, ended **2026-10-11T17:47:19.653Z**; **16302.875 ms** aggregate. Exactly **two real semantic requests, one real next chat request**, no repeated scenario/quality corpus/warm diagnostic. All four before/after residency reads returned no resident models. Both semantic bodies retain `keep_alive: 0`, `num_ctx: 16384`, `num_predict: 1024`, no tools, unchanged production strict schema/instruction and no-truncate/no-shift. Schema SHA-256 for both actual requests: `623ac4855fe9441e0ad141596f08870006ce8a0c439e99796f3e82dcef978f3e`. The ordinary next request retains all nine tools, 16384/4096 and the same transport policy.

All elapsed measurements use `performance.now()`. Canonical completion marker is SessionService's final-event notification after the durable JSONL append and reducer application. Interactive release marker is Conversation's idle status after consume completes. Semantic owner settlement includes validation/fallback and bounded artifact I/O; updater settlement separately measures the real semantic operation. Acceptance means `submit()` returned true; port start means the next real ModelPort stream was entered, not token arrival.

| Metric | A: idle completion | B: immediate next turn |
| --- | --- | --- |
| Canonical final → interactive release | **1.456 ms** | **0.392 ms** first turn; **0.053 ms** real next turn |
| Semantic still pending at first release | yes | yes |
| Semantic start → owner settlement | **10002.387 ms** | **2495.715 ms** |
| Semantic start → updater settlement | **10001.772 ms** | **2495.723 ms** |
| Outcome | 10000 ms deadline / TimeoutError; nonfatal fallback | next-turn abort / AbortError; obsolete update discarded |
| Next submission → accepted | not applicable | **0.075 ms** |
| Next submission → real ModelPort start | not applicable | **3.798 ms** |
| Abort signal → observable local body settlement | **0.009 ms** at deadline | **0.019 ms** at supersession |
| Semantic artifact | atomic failed-status empty fallback at exact two-event prefix | no cancelled semantic artifact |
| Canonical events | prompt + committed answer | two prompts + two committed answers |
| Detached/unhandled/canonical chat errors | zero | zero |

B submitted after the first actual semantic response byte (approximately 2495 ms after semantic start), before extraction finished. Cancellation propagated before the next HTTP inference dispatch. The next real request finished normally with `OK` in **3592.888 ms** provider total, including **2551.679 ms** model load, **385.474 ms** prompt evaluation and **652.596 ms** generation. It did not wait out the old 10-second semantic deadline. These provider timings describe that ordinary short chat, not a warm extraction or semantic-quality result. Local body/reader settlement is observable; server/GPU cancellation completion is unavailable, so the tiny local cancellation numbers are not a remote preemption guarantee. Current provider behavior supports the interactive-priority policy; future ports must propagate cooperative cancellation. An ignoring port is prevented from accumulating additional optional generations.

A's timeout did not retain Conversation.active or add a chat error. The real canonical answer and the two-event fallback artifact survived unchanged. B's cancelled extraction did not publish into its four-event prefix; the next request used exact preceding user/assistant history plus exact new input, with no immediately preceding semantic update. Both disposable directories were cleaned. No live semantic mutation was accepted or required; valid idle semantic publication is proven by deferred deterministic and production request/persistence/resume tests. This smoke isolates the post-answer boundary with controlled first answers; it does not claim one-millisecond total model response time, native TUI stopwatch measurements, statistical latency or semantic quality.

### Final deterministic and release gates

Final review also moved denied/error deterministic-only derived publication off turn completion; exact observations still project on committed events and remain rebuildable. An added deferred-write denial test proves this handoff cannot block its committed terminal answer. Normal semantic scheduling and both measured live paths remain unchanged; no extra inference was run after this refinement.

| Command/check | Result | Evidence |
| --- | --- | --- |
| Focused baseline, before edits | 395 pass, 0 fail, 2418 assertions, 17 files | `/tmp/phase-18.3-baseline-focused.log` |
| Expanded focus, before live | 468 pass, 0 fail, 3994 assertions, 22 files | `/tmp/phase-18.3-focused-deterministic.log` |
| Final expanded focus | **469 pass, 0 fail, 3997 assertions, 22 files** | `/tmp/phase-18.3-final-focused.log` |
| `bun run typecheck` | pass | `/tmp/phase-18.3-final-typecheck.log` |
| `bun test` | **973 pass, 0 fail, 7347 assertions, 55 files** | `/tmp/phase-18.3-final-tests.log` |
| `bun run format:check` | pass, 167 files | `/tmp/phase-18.3-final-format.log` |
| `bun run build:linux` | pass | `/tmp/phase-18.3-final-linux.log` |
| `bun run build:windows` | pass, existing cross-build cache, no download | `/tmp/phase-18.3-final-windows.log` |
| `bun run smoke:build` | pass, packaged new/resume and ripgrep | `/tmp/phase-18.3-final-build-smoke.log` |
| `bun run release:check` | pass; same 973 tests/7347 assertions, type/format, both builds, packaged smoke | `/tmp/phase-18.3-final-release.log` |
| `git diff --check`, `git diff --stat`, `git status --short --untracked-files=all` | pass/reviewed; 13 tracked paths + two new files | final structural review below |

The 22-file final focus is the baseline list plus SessionMemoryLifecycle, TerminalApp, createRuntime, createRuntimeRetrieval and ToolDefinitions. All full-release gates cover the finalized production code/tests. Passing gates were not repeated for final progress-record-only edits. Packaged Windows build validation is not native Windows execution.

## Final state

**Production scheduling changed to owned opportunistic maintenance. Keep-alive is unchanged at 0; semantic deadline remains 10000 ms.** No prompt/schema/sampler/reasoning/output/model/quality change. No dedicated memory model, downloads, new tool, generic scheduler, provider-specific priority API or model-specific branch.

1. **Why blocking:** the old `RunAgentTurn` durably appended final assistant → awaited maintainMemory/finish/semantic extraction/publication → iterator returned → Conversation.consume cleared active → submit accepted. Phase 18.2 measured **9048.933–10002.327 ms** of optional post-answer finish latency; it was a real submission gate, not merely delayed model residency cleanup.
2. **Keep-alive evidence:** all 14 Phase 18.2 checks were non-resident; completed requests loaded for **2238–2523 ms** and generated for **6275–10313 ms**. Generation alone prevents retention-only synchronous work from solving UX latency. No need to change intentional global retention to make optional extraction numbers smaller; skipped warm diagnostic.
3. **Chosen sequence:** durable final event/observation → immutable owned handoff → optional extraction may start → iterator/Conversation release without awaiting it → valid idle result validates/publishes atomically; new interactive work aborts pending maintenance before model resolution/inference. Denied/failed paths hand off deterministic-only publication without optional I/O blocking.
4. **Safety:** SessionMemoryService owns one current operation/controller/completion and one unresolved raw updater slot; there is no semantic generation queue. Prefix/session-generation/provenance/selected-updater validation plus permanent operation cancellation reject late output. Separate copies protect host evidence from updater mutation. Actual atomic writes remain ordered beyond timeout; a dispatched older rename may finish only with its actual old prefix and cannot overtake a newer write. Session/model changes fence immediately, including A→B→A; unchanged ModelSelection still owns selection/resume. Shutdown aborts/unsubscribes with no optional flush; exit may lose pending derived work, never its completed canonical answer.
5. **UX:** old 9–10 seconds → measured **0.392–1.456 ms** post-answer release for the two first turns. Semantic work separately took **10002.387 ms** timeout or **2495.715 ms** before supersession. Next submit **0.075 ms**, real stream start **3.798 ms**. Semantic failure is compatible with lifecycle success.
6. **Keep-alive decision:** **unchanged at 0**. Normal chat reload remains a configurable runtime choice; no retention change is necessary to release completed turns.
7. **Deadline:** production **10000 ms**, plus unchanged bounded artifact I/O. It bounds optional idle work and reaches provider cancellation; no 15/20/30-second expansion.
8. **Exact production files:** `src/application/services/SessionMemoryService.ts` (owned scheduling/cancellation/raw-call bound/immutable evidence/disposal/ordered publication), `src/application/use-cases/RunAgentTurn.ts` (handoff instead of awaiting derived work; cancel at entry), `src/composition/createRuntime.ts` (shared owner and next-turn/session/model/unload/disposal wiring), `src/presentation/Conversation.ts` (invoke runtime disposal), `src/presentation/types.ts` (expose disposal through existing runtime contract). README documents behavior; remaining source edits are additive deterministic tests and fixture lifecycle adaptation.

| Item | Final value |
| --- | --- |
| canonical transcript ownership | unchanged: durable JSONL and SessionReducer |
| semantic memory role | optional derived state |
| old post-answer blocking | Phase 18.2: 9048.933–10002.327 ms |
| new post-answer blocking | measured 0.392–1.456 ms; real next answer 0.053 ms |
| memory execution | opportunistic, explicitly owned |
| interactive request priority | cancel pending optional work before interactive model resolution/stream |
| pending semantic work per session | at most 1 unresolved updater invocation across runtime; 1 current handoff; zero semantic backlog |
| stale/late result policy | discard cancelled or changed prefix/session/generation/model output; ordered atomic writes retain their actual prefix |
| session/model fencing | preserved and cancellation strengthened |
| OLLAMA_KEEP_ALIVE | unchanged at 0 |
| semantic deadline | 10000 ms |
| warm diagnostic | skipped |
| model-specific production logic | none |
| provider-specific production logic | none added; generic lifecycle policy |
| Phase 17 retrieval changes | none |
| Phase 18.1 tool changes | none |
| semantic prompt/schema changes | none |

### Structural review

Reviewed the complete tracked diff and both new files. Canonical JSONL ownership, SessionService/SessionReducer, atomic JsonSessionMemoryStore implementation, normalized exact-prefix digest, provenance checks, compact semantic schema/renderer/authority rule and ContextBuilder priority are preserved. Current input/workspace/tool/conflicting exact history override lagging notes; no turn waits for immediately preceding semantic freshness. No memory tool, cross-session sharing or dedicated memory model. No model/provider family branching, new process-global maps, worker/job framework, TUI layout/panel/status feature or unbounded semantic queue. Detached failures have explicit owners/handlers and cannot become a later chat rejection.

Protected-path `git diff --exit-code` passes for all six historical records, canonical store/reducer/service, ModelSelection, updater/prompt/schema/renderer, ContextBuilder/HistoryRetriever, ModelPort/updater port, Ollama adapter, memory store, configuration, tools/ToolRunner, dependencies/lockfile and environment example. Retrieval 0.65/top8/max3/deadline/index and all Phase 18.1 nine-tool/recovery/approval behavior are unchanged. Shutdown only wires optional owner cancellation; existing active turn/load/model-switch disposal still runs.

Final tracked diff: **13 files, 448 insertions / 72 deletions**, plus this new progress record and `SessionMemoryLifecycle.test.ts` (untracked files are excluded from ordinary diff statistics). No checkout memory artifacts remain; no generated `/tmp`, `.agent` or `dist` file is tracked/staged. Starting/final HEAD is `cf119e40e77c897e0acb811188edae695f8cff16`; index unchanged/empty. No commit created. Final whitespace/status/complete-diff review passed after the document update without rerunning successful release gates. A separate read-only check of the saved live result confirms exact next-turn context, canonical SessionReducer replay, fallback document schema and disposal cleanup; no additional provider request occurred.
