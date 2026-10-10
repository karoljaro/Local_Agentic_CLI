# Phase 18.2 — structured session-memory quality and latency evaluation

## Status

inconclusive

Evaluation-first; no production change has been made. Final execution belongs to the original fresh goal session `01a1258f-4dac-7490-a63e-fcdf6d8cad6c`, as explicitly directed by the user. Its current rollout confirms `gpt-6.1-sol`, reasoning effort `max`, and the correct working directory. The redundant nested session prepared the baseline/corpus before ownership transferred with zero live attempts; its historical approval checkpoint is retained below. No sub-agents or commits.

Status vocabulary for this record: not started, in progress, evaluation complete, implementation required, verified, inconclusive. The fixed evaluation is complete; full semantic quality and a portable deadline change remain inconclusive. This status describes the evaluation limitations, not unfinished dispatch or a pending approval.

## Baseline

- Starting HEAD: `de94413ba5b35eadbb9af4734cc14af26d4c516e`.
- Initial `git status --short --untracked-files=all`, `git diff`, and `git diff --cached`: empty; clean checkout/index.
- Bun: `1.4.3`. No repository or ancestor `AGENTS.md` found.
- Read the five required historical records in full: Phase 15.5, 16, 17, 18, and 18.1. Their contents are protected.
- Effective `requireLiveTestModel()` target: `qwen3.5:9b`. `OLLAMA_MODEL` is unset; TEST_MODEL is used only by the disposable evaluation and does not change ModelSelection or the persisted preference.
- Effective provider URL: `http://localhost:11434`. Effective `OLLAMA_KEEP_ALIVE="0"`, normalized by the production adapter to `keep_alive: 0` for both normal chat and structured extraction. Residency will be observed, not inferred from request order. No lifecycle/configuration change is planned.
- Normal profile: context window 16384, output reservation 4096, safety allowance 1024, conservative generic estimator. Semantic extraction inherits the window, limits output to `min(1024, configured maxOutputTokens)`, charges schema overhead twice, and uses no tools. No sampler options are set by this code.
- Semantic deadline: production `SessionMemoryService` constructor default **10000 ms**; no environment setting overrides it. A fresh combined caller/session/deadline signal covers extraction/preflight, provider stream, and JSON/schema parsing. Application delta validation/compaction and atomic publication follow; publication has its own 1000 ms bound. Activation/read also has a separate 1000 ms bound. Queue waiting precedes the semantic timer. Every attempt will report both updater duration and `finish()` wall time.
- Limits: goal text <=240 characters; entry text <=160; keys <=64; paths <=240; <=3 source MessageIds and <=3 source EventIds per item; changes <=12 plus optional goal. Decisions 8, constraints 8, files 12, completed 4, pending 6, problems 4; memory render/state cap 1200 conservative estimated tokens; artifact <=65536 bytes; extraction response <=16000 characters, structured provider stream <=256000 characters; user evidence <=6000 and assistant evidence <=2000 characters.
- Focused deterministic command (before any live inference):

```bash
bun test src/application/services/SessionMemoryService.test.ts src/application/services/ModelSessionMemoryUpdater.test.ts src/application/services/ContextBuilderMemory.test.ts src/application/use-cases/RunAgentTurnMemory.test.ts src/composition/createRuntimeMemory.test.ts src/infrastructure/persistence/JsonSessionMemoryStore.test.ts src/infrastructure/model/OllamaMemoryExtraction.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts src/composition/config.test.ts > /tmp/phase-18.2-focused-deterministic.log 2>&1
```

Result: **191 pass, 0 fail, 609 assertions, 9 files**, exit 0, 334 ms reported by Bun. This includes persistence/provenance, failed-delta atomicity, actual structured HTTP mapping, provider/body deadlines, configuration, and optional-update isolation. At that baseline checkpoint, live inference had not started. The completed suite was not repeated after the user resumed; unchanged source hashes and final clean tracked diff preserve its applicability.

## Existing Phase 18 behavior

Inspected schema/types, updater port and implementation, full SessionMemoryService, persistence, renderer/compiler, composition, stream/HTTP adapter, keep-alive normalization, completion loop/presentation, and Phase 18 tests. The historical `/tmp/phase-18-live-{smoke.ts,result.json,smoke.log}` artifacts no longer exist; the historical record retains the single roughly 10-second inconclusive observation. It is not treated as this phase's measurement.

| Category/boundary | Exact current semantics |
| --- | --- |
| Goal | One user-sourced high-level objective. `initial` cannot overwrite an existing goal; explicit user replacement can. Ordinary follow-ups should preserve it. Host validates source role/quote, while explicit replacement meaning depends on model interpretation. |
| Decisions | Keyed settled user choices, or assistant-reported implementation choices when a real mutation was confirmed and the turn has no unresolved failure. Suggestions are prohibited by the generic prompt. Basis is derived from the cited role, never assigned by the model. |
| Constraints | Keyed persistent user requirements; upsert replaces same-key state, removal requires current user evidence. Ephemeral details should be omitted. |
| Files | Deterministic successful exact tool observations only: read/created/modified/moved/deleted. No-op changes and cached references do not create mutations; later reads preserve mutation anchors. Move removes source, records destination/from; deleted activity is historical. No stored file content. |
| Completed | Meaningful evidence-backed keyed tasks. Upsert removes same-key pending and semantic problems, but cannot override deterministic problems. Assistant completion is blocked by unresolved turn failures. |
| Pending | Explicit keyed work; pending upsert reopens matching completed task. |
| Problems | Semantic unresolved task state plus separately keyed exact tool/agent observations. Problem upsert reopens completed; same-task completed clears semantic problem. Matching successful tool operation clears its exact failure; a later final assistant boundary clears prior agent-error observations. |
| Semantic updater | At most one optional operation at normal final completion, same selected chat ModelPort, production instruction and Zod-derived strict responseSchema, no memory tool/embedding model. Bounded previous memory plus current user/final assistant evidence; the implementation passes tool observations through previous projected memory, not raw tool bodies or a separate tool-evidence array. |
| Deterministic projection | Observer-only exact committed events. File activity and tool/agent failures are projected without semantic inference and remain on semantic failure. They do not prove high-level completion. |
| Provenance | Each operation needs an exact current evidence quote and valid unambiguous current-session MessageId; quote is discarded after validation. Goal/constraints need user evidence. Source roles determine user-sourced/assistant-reported labels. Restore validates event-prefix digest, IDs, roles, positions and exact tool anchors. Quote existence proves origin, not semantic entailment. |
| Failure fallback | Provider, timeout, JSON/schema, invalid evidence or conflicting operations rejects the entire semantic delta. Prior semantic state plus exact observations remains, completed chat stays valid, internal failure status is persisted nonfatally. No retries or historical semantic backfill. Session/model/source fencing rejects late results. |
| Persistence | Derived version-1 JSON per current session, exact normalized event-prefix digest, updater identity/status, bounded state/provenance. Exclusive 0600 same-directory temp + close + atomic rename; no JSONL ownership change or power-loss promise. |
| Rendering priority | Mandatory base instruction/all nine tools/exact active/output+safety, then compact memory, previous whole turn, unchanged Phase 17 retrieval/fallback. Memory order: goal, constraints, decisions, problems, pending, files, completed. Whole-entry eviction, escaped text, no source IDs; budget is `min(1200, floor(inputLimit/8), mandatory remaining)`. |

`RunAgentTurn` appends the final assistant event then **awaits** `maintainMemory()` before its iterator returns. `Conversation.consume()` retains the active turn until iterator completion; `submit()` rejects input while running. Thus memory latency occurs after answer text/final persistence and can delay the next user action. No background worker will be introduced.

## Fixed evaluation corpus

Frozen semantic intent and exact texts below **before live inference**. Execution order is A, B, C, D, E, F. Each case has fixed, source-valid synthetic prerequisite state, created through production application/persistence with deterministic fixture deltas and restored before its one live turn. These prerequisite deltas are fixture construction, not model outcomes or scored inference. This isolates each transition even if an earlier production attempt fails. The six cases are not claimed to be an accumulated six-turn live conversation. Exact prerequisite events, deltas, previous memory/documents, current IDs/evidence and expectations were frozen in `/tmp/phase-18.2-corpus.json` and reproduced here before dispatch. Expected texts and outcomes were not changed after inference.

No tools in the live corpus: all scored category state is semantic. Existing deterministic tests independently cover low-level tool success versus meaningful completion, exact files/failures, and provenance rejection. No chat-answer generation, tool execution, retrieval, embedding inference, TUI work, or workspace-content exposure.

| Case | Exact current user evidence | Exact final assistant evidence | Fixed previous semantic state | Expected applied state |
| --- | --- | --- | --- | --- |
| A — initial goal | Build a local CLI that indexes project notes and lets me search them. | I understand the project objective. Implementation has not started. | Empty. | One goal expressing the local notes-index/search CLI; no invented decision, constraint or completion. |
| B — subordinate follow-up | Now add integration tests for the indexing path. | Integration tests for the indexing path remain pending; I have not completed them. | A goal. | Preserve the high-level goal; record indexing integration tests as pending; do not replace goal with testing or infer completion. |
| C — choice versus proposal | Use SQLite for metadata instead of PostgreSQL. | I suggest caching search results in Redis. This is only a proposal; you have not accepted it. | A goal + B pending. | SQLite decision with user evidence; preserve goal/pending; Redis proposal creates no settled decision or constraint. |
| D — persistent restriction and unresolved blocker | Do not change the terminal UI while doing this. The indexing integration tests are still pending because the test fixture is missing; this blocker is unresolved. | The missing fixture blocks the indexing integration tests; they remain pending. | A goal + B pending + C SQLite choice. | Persistent UI constraint with user evidence; pending tests remain, missing-fixture problem is active under the same semantic task identity; no completion. |
| E — explicit reversal | You can change the terminal UI now. Actually, use PostgreSQL instead of SQLite. | The earlier terminal UI restriction is revoked, and PostgreSQL is now the metadata choice. | D prerequisites including UI constraint and unresolved test blocker. | Remove revoked UI restriction; replace SQLite choice with PostgreSQL without simultaneous contradictory choices; preserve goal and unresolved test task/problem. |
| F — completion and resolution | The indexing integration tests are completed and passing now. The missing fixture blocker is resolved. | The indexing integration tests are complete and the missing fixture blocker is resolved. | E prerequisites: PostgreSQL, no UI restriction, pending tests and unresolved blocker. | Meaningful completion recorded; matching pending/problem cleared; preserve high-level goal and PostgreSQL choice. |

Text/key paraphrases are accepted when final semantic state is equivalent. Initial/upsert/remove counts will be exact, but wording equality is not a quality criterion. Each case is classified as correct, acceptable equivalent, false positive/negative, wrong category, stale state retained, incorrect replacement/removal, invalid evidence, schema/provider failure, or timeout. Critical failures are stated separately rather than hidden in a score. Exact model operations and applied state are retained even when host validation rejects everything.

Precommitted limits: six production attempts, one per case, 10000 ms each; at most one exact-evidence diagnostic replay with only a temporary deadline change to **30000 ms**, only if first representative production update times out. If that replay still yields no useful output, stop expanding the live experiment. Hard aggregate live envelope **120000 ms**, external process **125 seconds** plus 2-second kill grace. Preflight read-only catalog/residency checks have their own 5-second bounds. No diagnostic residency experiment is planned; warm evidence is reported only if naturally observed.

## Latency evidence

The single live harness process completed with exit 0. Evidence: `/tmp/phase-18.2-live.ts`, `/tmp/phase-18.2-live.log`, `/tmp/phase-18.2-live-result.json`, exclusive dispatch guard `/tmp/phase-18.2-live-started.json`, and actual atomic derived artifacts `/tmp/phase-18.2-derived-live-<case>-<production|diagnostic>/`. No application artifacts were written into the checkout.

Exact live command, executed once with approved sandbox escalation for localhost provider access:

```bash
timeout --signal=TERM --kill-after=2s 125s bun run --tsconfig-override /home/karoljaron/Projects/Local_Agentic_CLI/tsconfig.json /tmp/phase-18.2-live.ts > /tmp/phase-18.2-live.log 2>&1
```

Started **2026-10-10T12:10:40.668Z**, ended **2026-10-10T12:11:52.790Z**; monotonic aggregate **72122.634 ms**, below the frozen 120000 ms bound and external 125-second limit. **Six production cases, exactly one inference each; one permitted A deadline replay; seven provider inference requests total. Four production timeouts; zero replay timeouts; two complete schema-valid production deltas rejected by host application. Zero accepted production semantic operations or mutations.** The replay accepted two operations/two item mutations. A retry until success, normal chat generation, tool execution, embedding inference and residency experiment did not occur.

`updater ms` includes production prompt preflight, provider load/inference/stream, and response JSON/schema parsing. `finish ms` additionally includes production host validation/compaction, atomic publication and return. Setup/restoration/current-event appends and before/after residency reads are outside those two timers. Every duration is calculated with `performance.now()`; ISO timestamps show boundaries rather than supplying elapsed-time arithmetic. Queue contention was absent in these controlled calls. The temporary stream observer is included in measured time; it forwarded the unchanged request settings and byte stream.

| Actual attempt | Deadline ms | Updater ms | Finish ms | Result | Raw ops | Accepted / rejected | Item mutations | Resident before / after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A production | 10000 | 10001.613 | 10002.327 | timeout | unavailable | 0 / 0 | 0 | no / no |
| A diagnostic, same A evidence | 30000 | 12833.398 | 12835.193 | success | 2 | 2 / 0 | 2 | no / no |
| B production | 10000 | 10000.620 | 10000.837 | timeout | unavailable | 0 / 0 | 0 | no / no |
| C production | 10000 | 9048.243 | 9048.933 | host contract rejection | 2 | 0 / 2 | 0 | no / no |
| D production | 10000 | 10000.670 | 10001.418 | timeout | unavailable | 0 / 0 | 0 | no / no |
| E production | 10000 | 10000.685 | 10000.982 | timeout | unavailable | 0 / 0 | 0 | no / no |
| F production | 10000 | 9592.606 | 9593.287 | host contract rejection | 3 | 0 / 3 | 0 | no / no |

All fourteen read-only `/api/ps` observations succeeded and returned no resident models immediately before/after all seven actual attempts. Every call is therefore **cold/non-resident**, in the defined provider-residency sense. This makes no claim about OS disk caches or first-ever execution. `keep_alive: 0` was unchanged and shared with normal chat; its unload-after-request policy is consistent with the observations. **Warm/resident updater latency is unavailable**; it was not fabricated through a retention change or extra inference.

The initial production completion time is censored by the timeout: observed updater wall 10001.613 ms, finish 10002.327 ms, no completed structured output. The separately sampled, equally non-resident A replay completed at 12835.193 ms through finish with a valid goal. It is not the counterfactual completion time of the first request. The replay used byte-equivalent provider body/schema/messages/options/model/keep-alive; only the temporary service deadline differed. Existing production remains 10000 ms.

Terminal Ollama frames expose nanosecond provider timings. These three complete frames are trustworthy diagnostic observations; aborted A/B/D/E produced no terminal timing frame, so their load/prompt/generation durations and token counts are **unavailable** rather than zero or extrapolated.

| Completed provider response | Total ms | Load ms | Prompt eval ms / count | Generation ms / count | Finish reason |
| --- | --- | --- | --- | --- | --- |
| A diagnostic | 12831.117 | 2238.455 | 275.283 / 863 | 10313.488 / 680 | stop |
| C production, rejected | 9047.407 | 2463.779 | 304.353 / 905 | 6275.226 / 409 | stop |
| F production, rejected | 9591.378 | 2523.147 | 323.620 / 952 | 6739.545 / 458 | stop |

Generation is the largest measured contributor in all three terminal frames; repeated non-resident loading also costs 2238–2523 ms in those frames. The A replay's generation alone was 10313.488 ms, so its overrun cannot be explained entirely by loading. Timed-out streams had actual frame/thinking activity, not a demonstrated total provider stall; A/B/E had no structured content, and D had only a 386-character partial JSON prefix. Thinking character counts are observations, not token counts or semantic operations. Schema recovery/retry was not invoked. No provider-specific application fields were added.

Product impact: **meaningful blocking latency**. The six production `finish()` calls added 9048.933–10002.327 ms after the controlled final assistant boundary. The unchanged production turn loop awaits this call, and the presentation holds the turn active/rejects new submission until its iterator returns. Thus displaying/persisting answer text does not eliminate this extra wait. This is a static production-control-flow finding paired with measured finish latency, not a live TUI stopwatch or full normal-chat latency measurement. No background worker or presentation change was introduced.

## Quality result

This fixed run **did not maintain the expected applied semantic state in any of the six production cases**: four timeout fallbacks and two atomic host rejections. This is an exact scenario outcome, not a statistical model-accuracy estimate. The successful A replay proves a bounded initial goal can be extracted by this actual target, but is diagnostic evidence outside the original 10-second production case. Fixture-provided prior goal/choices/tasks are not credited as live extraction successes.

| Fixed case | Classification | Raw semantic evidence and actual applied state |
| --- | --- | --- |
| A — initial goal | timeout in production; correct goal / acceptable additional pending item in the sole replay | Production returned no delta and retained empty memory. Replay established exactly one user-sourced CLI/index/search goal, no decisions/constraints/completion, and an assistant-reported implementation-pending item aligned with the explicit request and “Implementation has not started.” The latter is a derived task interpretation, not mechanically proven by its short status quote alone. |
| B — subordinate follow-up | timeout; pending false negative under the production deadline | No delta; prerequisite high-level goal survived through deterministic failure fallback. Integration tests were not added to pending. Goal retention here does not prove the model understood subordinate work. |
| C — decision versus proposal | incorrect initial-goal operation / invalid goal evidence meaning; wrong category; decision false negative | Returned the existing goal with `mode: initial`, citing the current SQLite-choice quote that does not establish the CLI objective. Host threw `Goal requires explicit user replacement.` and rejected both operations atomically. The second operation wrongly put SQLite in constraints instead of decisions. No settled Redis proposal appeared in raw output or applied state; this narrow absence is observed, not a general false-positive guarantee. |
| D — persistent restriction and blocker | timeout; constraint and problem false negatives under the deadline | Partial unparsed JSON began a user-backed UI constraint with an equivalent key, then was cut off in the next operation. It was not a completed returned delta and no operation was accepted. Fixture pending remained; no live constraint or missing-fixture semantic problem was added. |
| E — reversal | timeout; stale state retained | No structured delta. SQLite choice and the revoked UI restriction remained active despite explicit current user reversal; pending/problem also remained. This is a material stale-memory result of failure fallback, not evidence that the extractor consciously chose both contradictory alternatives. |
| F — completion/resolution | incorrect initial-goal operation; stale pending/problem retained; completion false negative | Returned the existing goal as `initial` with a quote about completed tests. It also requested correct same-key removals of pending and problems, but recorded no completed item. The invalid goal operation caused atomic rejection of all three changes, so the completed task remained pending and the resolved problem remained active. |

Category answers for **qwen3.5:9b in this bounded run**:

- **Goal:** initial goal succeeded only in the 30-second replay. B preservation is fallback-only; C/F unnecessarily reissued an existing goal as initial with unrelated goal evidence, and host protection prevented acceptance. No production operational follow-up actually replaced the real goal.
- **Decision:** limitation. C's explicit SQLite choice was classified as a constraint in raw output and was not applied; Redis proposal was not promoted. E's PostgreSQL reversal timed out, leaving the stale SQLite fixture choice.
- **Constraint:** limitation. D began a correct user-backed restriction in partial output but did not finish/apply it. E failed to clear the revoked restriction. No invented persistent restriction was accepted.
- **Pending:** limitation. B did not establish the requested tests before timeout; F failed to clear completed tests after atomic rejection. A's diagnostic implementation-pending item is separately labeled assistant-reported and is not a test of the indexing-test lifecycle.
- **Problem:** limitation. D did not establish the unresolved semantic blocker; F retained a fixture-seeded blocker after explicit resolution. These are semantic task problems, not deterministic exact tool failures; no tools ran in this corpus.
- **Correction/removal:** limitation. E applied neither decision reversal nor constraint removal. F's raw same-key task removals were plausible and evidence-backed, but the complete delta was rejected, so actual correction failed.

Critical failures are explicit: C wrong-category choice; C/F existing-goal initial operations with quotes that do not support their goal claim; E stale revoked restriction and superseded choice; F resolved problem and completed task remaining active/pending. **Zero semantic operations with invalid required source evidence were accepted.** C/F quote strings and current-session IDs exist and roles are truthful, but quote existence does not prove entailment. The host first rejected initial-over-existing goal; it did not independently classify all remaining semantic claims. No arbitrary removal, source-rule weakening or partial application is proposed.

Decision gate:

| Gate category | Finding / action |
| --- | --- |
| A — generic contract ambiguity | Not established. The existing generic instruction already distinguishes an absent initial goal from explicit replacement, preserves goals on operational follow-ups, separates settled choices from suggestions, and requires keyed revocation/completion. Two repeated invalid initial operations are insufficient evidence to reinterpret those explicit rules as an application-contract defect. No prompt/schema correction pass or affected-case rerun. |
| B — current model/run weakness | Complete C/F deltas violated explicit goal-operation semantics; C also used the wrong category. These are bounded observed extraction limitations, separate from wording/key variation. No model-specific tuning. |
| C — provider latency/residency | Four production timeouts, no naturally warm request, repeated measured load cost and generation-dominated complete frames. Document separately; do not redesign lifecycle or hide it with a large timeout. |
| D — application correctness bug | None established. Deterministic coverage passes; application rejected both invalid deltas atomically, retained fallback state, persisted bounded artifacts and left canonical events unchanged. Preserving stale memory on failure has a product cost, but is the existing explicit nonfatal contract. |
| E — corpus/evaluator ambiguity | Fixed synthetic preconditions isolate cases; their state is not scored as live success. Exact wording/keys are not required. D's partial output is unscored, provider timing is missing for aborts, and diagnostic A is separated from production. Expected texts/state and corpus hashes were not altered after inference. |

Explicit correction semantics are not shown to need redesign. E supplied no completed result and F's removals were blocked by an unrelated invalid goal operation; existing keyed correction/application tests already pass. No generic forgetting behavior, semantic backfill or extra diagnostic inference is justified by this run.

## Deadline decision

**Conclusion: likely too short, but architecture/lifecycle evidence is insufficient for a safe change. Production remains 10000 ms.** The portable timeout decision is **inconclusive / insufficient evidence**, rather than a claim that 10 seconds is appropriate or a justified new value.

Evidence is repeated deadline failures in A/B/D/E, plus one valid diagnostic replay at 12835.193 ms. However, only that one relaxed sample establishes a valid state after 10 seconds; it cannot establish the completion time or semantic validity of the four censored requests. C/F completed within 10 seconds yet failed for explicit operation/category reasons, which a longer deadline would not fix. A replay had 2238.455 ms loading and 10313.488 ms generation; C/F also spent 2463.779/2523.147 ms loading. No resident sample exists to separate the current lifecycle from warm execution, and large blocking generation remains even without the measured load cost.

This evidence does not identify a smallest justified provider/model-independent deadline with adequate headroom. Raising it to an arbitrary round number to make the single replay fit would be model/run tuning and would expand already meaningful blocking latency. The current 10-second bound still protects completed chat from unbounded optional work. No configuration/deadline implementation change or new test is needed because no production change is made. A separate lifecycle/product-latency decision may be warranted; this phase makes no keep-alive, scheduling, budget, selection or architecture change.

## Final state

**No production change.** Only `docs/progress/phase-18.2-progress.md` is added. All prompts, schemas, source validation/provenance, memory limits/deadlines, ModelPort/provider boundary, SessionService/Reducer ownership, compiler/profile/priority, persistence implementation, model selection/keep-alive, Phase 17 retrieval, Phase 18.1 tool recovery/all nine contracts, approvals, TUI, durable transcript and historical progress records remain unchanged. No commit or staged change.

The fixed bounded evaluation is complete. Its overall conclusion is **inconclusive for full semantic quality and a safe portable deadline choice**, with useful concrete latency and C/F semantic-contract failures established. The useful A replay identifies load/generation contributions, so it is not described as an unexplained provider stall or a failed diagnostic. No universal model guarantee, statistical accuracy or warm-latency conclusion is claimed; no verified semantic-quality claim is made.

Final production behavior remains **model/provider independent**: no model-name branch, model-size heuristic, Qwen-specific wording/schema, dedicated memory model or provider-specific application semantics. Ollama-specific timing/residency observation exists only in the temporary harness/evidence. This is a source-boundary confirmation, not empirical certification of other models/providers.

Completed focused checks remain 191 pass / 0 fail / 609 assertions / 9 files. Final review covered the complete new record, all 27 JSON blocks against frozen/actual evidence, all seven on-disk atomic artifacts, exact replay body equivalence, one-attempt ordering, aggregate bounds, and fourteen residency observations. The corpus digest/read-only mode and all six frozen production-source hashes match. `git diff --check` and the new-file `git diff --no-index --check /dev/null docs/progress/phase-18.2-progress.md` have no whitespace findings (the latter exits 1 because the new file differs from `/dev/null`). Tracked diff and index are empty, HEAD remains the baseline, and status contains only this progress record. Full release/build gates are intentionally not rerun for this documentation-only phase. No benchmark fixture or temporary evidence is committed.

## Historical execution handoff and approval blocker

The following checkpoint is retained as historical progress. Its execution ownership and pending-approval state were superseded by the user-directed transfer below; it does not describe the final state.

Checkpoint: **2026-10-10 11:57:39 UTC**. The requested new execution session remains authoritative and live: `01a12599-29c5-7063-817b-8f5a53c19036`, turn `01a12599-2d7b-70e1-a079-6511b91af70e`, status `active`, flag `waitingOnApproval`. The same original preflight escalation has remained pending across the originating turn and two automatic goal continuations. The second turn was a verified wait against that specific session; the third independently reconfirmed the identical blocker. The available thread controls expose reading, sending and waiting, but no approval-resolution or interruption operation. Follow-up messages containing the saved preflight result have not resolved the pending tool approval. No new task, inference run or alternative execution path has been started.

The sandboxed preflight failed with `ECONNREFUSED` and **zero inference requests**; exact evidence is `/tmp/phase-18.2-preflight-failure.json`. The originating coordinator then reviewed and executed the identical read-only command with explicit sandbox escalation approval:

```bash
bun run --tsconfig-override /home/karoljaron/Projects/Local_Agentic_CLI/tsconfig.json /tmp/phase-18.2-preflight.ts
```

That approved check succeeded at **2026-10-10T11:50:17.566Z**, confirming configured `TEST_MODEL=qwen3.5:9b` is installed. `/api/tags` took 2.620316 ms and `/api/ps` took 0.177673 ms; `/api/ps` returned `models: []`. These are read-only diagnostic timings, **not semantic updater latency**, and residency must be checked again immediately before any inference. Evidence is `/tmp/phase-18.2-preflight-result.json`; no provider load/unload, generation, embedding, download or restart occurred.

The original approval in the separate session is still pending even though the identical read succeeded in the originating session. The user was asked to dismiss that duplicate pending approval so the new execution session can continue from the saved result. This is a runtime sandbox/workflow blocker, not an automatic approval-review rejection and not a semantic/provider-quality result.

As of this checkpoint: **six fixed cases defined, zero live cases attempted, zero live retries, zero semantic operations or applied live mutations**. Quality, updater latency and the deadline decision are unmeasured. The phase remains **in progress**, not verified or scientifically inconclusive. The originating goal is marked **blocked** after the required three-turn audit; its full objective remains unchanged. On resumption, continue this same session and frozen corpus, recheck residency, execute the bounded production-path corpus once, and complete the required quality/latency/deadline report. Do not recreate the corpus or restart merely because an observation wait expired.

Final checkpoint checks: HEAD remains `de94413ba5b35eadbb9af4734cc14af26d4c516e`; corpus SHA-256 and all captured production source hashes match; `git status --short --untracked-files=all` contains only this new progress record. Focused deterministic result remains 191 pass / 0 fail / 609 assertions / 9 files. No commit or production change.

## Frozen exact execution inputs

Execution ownership update, **2026-10-10 12:08:48 UTC**: the user explicitly transferred evaluation ownership to the originating fresh goal session `01a1258f-4dac-7490-a63e-fcdf6d8cad6c`; the nested session was redundant. Its latest instruction is to stop without inference or progress edits. No further nested-session wait or new session is required. The corpus/hash and precommitted limits are unchanged; both live-run guard and live-result files were absent at transfer, confirming zero live attempts. The earlier blocked checkpoint above is historical and no longer the execution plan.

The temporary `/tmp/phase-18.2-live.ts` harness imports the existing updater/service/adapter and production atomic JSON memory store. It restores each frozen source-valid prerequisite artifact, submits only the frozen current events through SessionService, checks actual updater inputs and ModelChatInput against the frozen offline capture, and observes provider NDJSON timing without adding application-contract fields. The disposable canonical-event backing store is `InMemorySessionStore`; SessionService and its reducer still own event assembly. Derived publication uses the actual `JsonSessionMemoryStore` under `/tmp`; no production JSONL is read or written. A `--dry-run` checked all six exact restorations, production prompt/schema equality, host application and transcript immutability using a no-op fake response with **zero network/inference requests**; its milliseconds are not live latency evidence. No completed baseline inspection or test suite was repeated. Live mode uses an exclusive run-start file and refuses an existing live-result file to prevent duplicate evaluation. Production attempts retain the default 10000 ms; the sole conditional replay changes only the temporary service deadline to 30000 ms. Aggregate/external bounds remain 120000 ms/125 seconds plus 2-second kill grace. Residency is read immediately before and after each actual attempt; no residency experiment, model-selection or lifecycle change is introduced.

Accepted/rejected operations are the actual parsed delta and production host-validation outcome. Final item-mutation count compares whole stored entries, including provenance/revision, across category/key identities; it is not a semantic-accuracy score. Raw structured provider text and terminal timing frames are diagnostic observations. The first-case replay is useful only if a valid applied initial goal exists; otherwise the original precommitted stop condition prevents further expansion.

Frozen at **2026-10-10T11:43:01.338Z**, before any live inference. Corpus SHA-256: `604290fa83c6896efa752dd6bc8e2649870367f3a452f2946795f97ad59d0a13`; `/tmp/phase-18.2-corpus.json` is read-only. Six controlled fixtures were verified by the actual host source validation/application, then their production updater messages/schema were captured offline. Neither fixture construction nor capture invokes a provider. Synthetic event timestamps are fixture data, not measurement timestamps.

Every current user ID is `p182-user-<case>`, final assistant ID `p182-assistant-<case>`; corresponding event IDs `p182-event-<case>-user` and `p182-event-<case>-assistant`. Each case uses its own current-session identity `phase182-case-<case>`. Earlier prerequisite events reuse the frozen A–E texts above in that case's own session. Tools: none.

### A — exact previous memory

```json
{
  "goal": null,
  "decisions": [],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [],
  "problems": []
}
```

### B — exact previous memory

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [],
  "problems": []
}
```

### C — exact previous memory

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": []
}
```

### D — exact previous memory

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [
    {
      "key": "metadata-store",
      "text": "Use SQLite for metadata.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-C"
      ],
      "sourceEventIds": [],
      "revision": 6
    }
  ],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": []
}
```

### E — exact previous memory

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [
    {
      "key": "metadata-store",
      "text": "Use SQLite for metadata.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-C"
      ],
      "sourceEventIds": [],
      "revision": 6
    }
  ],
  "constraints": [
    {
      "key": "terminal-ui",
      "text": "Do not change the terminal UI.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-D"
      ],
      "sourceEventIds": [],
      "revision": 8
    }
  ],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": [
    {
      "key": "indexing-integration-tests",
      "text": "Indexing integration tests blocked by missing test fixture.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-D"
      ],
      "sourceEventIds": [],
      "revision": 8
    }
  ]
}
```

### F — exact previous memory

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [
    {
      "key": "metadata-store",
      "text": "Use PostgreSQL for metadata.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-E"
      ],
      "sourceEventIds": [],
      "revision": 10
    }
  ],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": [
    {
      "key": "indexing-integration-tests",
      "text": "Indexing integration tests blocked by missing test fixture.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-D"
      ],
      "sourceEventIds": [],
      "revision": 8
    }
  ]
}
```

## Exact actual attempts and applied state

The exact bounded evidence and previous state for each attempt are the frozen A–F inputs above. The replay uses the identical A previous memory/current evidence/IDs and body. Tools: none for all seven calls. Raw returned operations are null when no completed delta returned; D's partial text is preserved separately and is never counted as accepted operations. The final memory is read after production atomic persistence/source validation.

### A — original 10-second production attempt

- Finish start/end: `2026-10-10T12:10:40.672Z` → `2026-10-10T12:10:50.675Z`; 10002.326560 ms.
- Updater monotonic start/end: 37.376542 → 10038.989310 ms; 10001.612768 ms.
- Residency checks: before `2026-10-10T12:10:40.671Z`, after `2026-10-10T12:10:50.675Z`; both known non-resident, all returned model lists empty.
- Status: timeout; parsed operations unavailable, accepted 0, rejected 0, stored item mutations 0.
- Application diagnostics: `{"semanticAttempts":1,"resumeEvents":0,"observedEvents":2,"lastFailure":"semantic-update-failed"}`; transcript unchanged: true.
- Updater failure: `TimeoutError: The operation timed out.`; abort reason `TimeoutError: The operation timed out.`.

Actual completed updater delta:

```json
null
```

Raw structured provider text before abort (JSON string; partial/incomplete is untrusted):

```json
""
```

Resulting persisted/applied SessionMemory:

```json
{
  "goal": null,
  "decisions": [],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [],
  "problems": []
}
```

### A — sole 30-second deadline diagnostic

- Finish start/end: `2026-10-10T12:10:50.745Z` → `2026-10-10T12:11:03.580Z`; 12835.193462 ms.
- Updater monotonic start/end: 10109.867032 → 22943.265519 ms; 12833.398487 ms.
- Residency checks: before `2026-10-10T12:10:50.745Z`, after `2026-10-10T12:11:03.580Z`; both known non-resident, all returned model lists empty.
- Status: success; parsed operations 2, accepted 2, rejected 0, stored item mutations 2.
- Application diagnostics: `{"semanticAttempts":1,"resumeEvents":0,"observedEvents":2}`; transcript unchanged: true.

Actual completed updater delta:

```json
{
  "version": 1,
  "goal": {
    "mode": "initial",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "evidence": {
      "messageId": "p182-user-A",
      "quote": "Build a local CLI that indexes project notes and lets me search them."
    }
  },
  "changes": [
    {
      "operation": "upsert",
      "category": "pending",
      "key": "implement-cli-core",
      "text": "Begin implementation of the note-indexing CLI tool as per initial user request.",
      "evidence": {
        "messageId": "p182-assistant-A",
        "quote": "Implementation has not started."
      }
    }
  ]
}
```

Accepted operations: optional goal plus all returned changes shown above; rejected operations: none.

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "implement-cli-core",
      "text": "Begin implementation of the note-indexing CLI tool as per initial user request.",
      "basis": "assistant-reported",
      "sourceMessageIds": [
        "p182-assistant-A"
      ],
      "sourceEventIds": [],
      "revision": 2
    }
  ],
  "problems": []
}
```

Exact provider terminal timing metadata (duration fields in nanoseconds):

```json
{
  "total_duration": 12831116836,
  "load_duration": 2238455374,
  "prompt_eval_duration": 275283000,
  "prompt_eval_count": 863,
  "eval_duration": 10313488000,
  "eval_count": 680,
  "done_reason": "stop"
}
```

### B — original 10-second production attempt

- Finish start/end: `2026-10-10T12:11:03.667Z` → `2026-10-10T12:11:13.668Z`; 10000.837253 ms.
- Updater monotonic start/end: 23031.370957 → 33031.990634 ms; 10000.619677 ms.
- Residency checks: before `2026-10-10T12:11:03.667Z`, after `2026-10-10T12:11:13.668Z`; both known non-resident, all returned model lists empty.
- Status: timeout; parsed operations unavailable, accepted 0, rejected 0, stored item mutations 0.
- Application diagnostics: `{"semanticAttempts":1,"resumeEvents":2,"observedEvents":4,"lastFailure":"semantic-update-failed"}`; transcript unchanged: true.
- Updater failure: `TimeoutError: The operation timed out.`; abort reason `TimeoutError: The operation timed out.`.

Actual completed updater delta:

```json
null
```

Raw structured provider text before abort (JSON string; partial/incomplete is untrusted):

```json
""
```

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [],
  "problems": []
}
```

### C — original 10-second production attempt

- Finish start/end: `2026-10-10T12:11:13.747Z` → `2026-10-10T12:11:22.796Z`; 9048.933147 ms.
- Updater monotonic start/end: 33111.797796 → 42160.040951 ms; 9048.243155 ms.
- Residency checks: before `2026-10-10T12:11:13.747Z`, after `2026-10-10T12:11:22.796Z`; both known non-resident, all returned model lists empty.
- Status: invalid provenance/evidence or application rejection; parsed operations 2, accepted 0, rejected 2, stored item mutations 0.
- Application diagnostics: `{"semanticAttempts":1,"resumeEvents":4,"observedEvents":6,"lastFailure":"semantic-update-failed"}`; transcript unchanged: true.
- Host failure: `Error: Goal requires explicit user replacement.`. All returned operations were rejected atomically; no individual operation was accepted.

Actual completed updater delta:

```json
{
  "version": 1,
  "goal": {
    "mode": "initial",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "evidence": {
      "messageId": "p182-user-C",
      "quote": "Use SQLite for metadata instead of PostgreSQL."
    }
  },
  "changes": [
    {
      "operation": "upsert",
      "category": "constraints",
      "key": "database-technology",
      "text": "Use SQLite for metadata storage instead of PostgreSQL.",
      "evidence": {
        "messageId": "p182-user-C",
        "quote": "Use SQLite for metadata instead of PostgreSQL."
      }
    }
  ]
}
```

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": []
}
```

Exact provider terminal timing metadata (duration fields in nanoseconds):

```json
{
  "total_duration": 9047407300,
  "load_duration": 2463779064,
  "prompt_eval_duration": 304353000,
  "prompt_eval_count": 905,
  "eval_duration": 6275226000,
  "eval_count": 409,
  "done_reason": "stop"
}
```

### D — original 10-second production attempt

- Finish start/end: `2026-10-10T12:11:22.872Z` → `2026-10-10T12:11:32.874Z`; 10001.418330 ms.
- Updater monotonic start/end: 42236.752522 → 52237.422896 ms; 10000.670374 ms.
- Residency checks: before `2026-10-10T12:11:22.872Z`, after `2026-10-10T12:11:32.874Z`; both known non-resident, all returned model lists empty.
- Status: timeout; parsed operations unavailable, accepted 0, rejected 0, stored item mutations 0.
- Application diagnostics: `{"semanticAttempts":1,"resumeEvents":6,"observedEvents":8,"lastFailure":"semantic-update-failed"}`; transcript unchanged: true.
- Updater failure: `TimeoutError: The operation timed out.`; abort reason `TimeoutError: The operation timed out.`.

Actual completed updater delta:

```json
null
```

Raw structured provider text before abort (JSON string; partial/incomplete is untrusted):

```json
"{\n  \"version\": 1,\n  \"goal\": null,\n  \"changes\": [\n    {\n      \"operation\": \"upsert\",\n      \"category\": \"constraints\",\n      \"key\": \"terminal-ui-stability\",\n      \"text\": \"Do not change the terminal UI while doing this.\",\n      \"evidence\": {\n        \"messageId\": \"p182-user-D\",\n        \"quote\": \"Do not change the terminal UI while doing this.\"\n      }\n    },\n    {\n      \"operation\": \"up"
```

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [
    {
      "key": "metadata-store",
      "text": "Use SQLite for metadata.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-C"
      ],
      "sourceEventIds": [],
      "revision": 6
    }
  ],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": []
}
```

### E — original 10-second production attempt

- Finish start/end: `2026-10-10T12:11:32.998Z` → `2026-10-10T12:11:42.999Z`; 10000.982119 ms.
- Updater monotonic start/end: 52362.493966 → 62363.179238 ms; 10000.685272 ms.
- Residency checks: before `2026-10-10T12:11:32.998Z`, after `2026-10-10T12:11:42.999Z`; both known non-resident, all returned model lists empty.
- Status: timeout; parsed operations unavailable, accepted 0, rejected 0, stored item mutations 0.
- Application diagnostics: `{"semanticAttempts":1,"resumeEvents":8,"observedEvents":10,"lastFailure":"semantic-update-failed"}`; transcript unchanged: true.
- Updater failure: `TimeoutError: The operation timed out.`; abort reason `TimeoutError: The operation timed out.`.

Actual completed updater delta:

```json
null
```

Raw structured provider text before abort (JSON string; partial/incomplete is untrusted):

```json
""
```

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [
    {
      "key": "metadata-store",
      "text": "Use SQLite for metadata.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-C"
      ],
      "sourceEventIds": [],
      "revision": 6
    }
  ],
  "constraints": [
    {
      "key": "terminal-ui",
      "text": "Do not change the terminal UI.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-D"
      ],
      "sourceEventIds": [],
      "revision": 8
    }
  ],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": [
    {
      "key": "indexing-integration-tests",
      "text": "Indexing integration tests blocked by missing test fixture.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-D"
      ],
      "sourceEventIds": [],
      "revision": 8
    }
  ]
}
```

### F — original 10-second production attempt

- Finish start/end: `2026-10-10T12:11:43.084Z` → `2026-10-10T12:11:52.678Z`; 9593.286633 ms.
- Updater monotonic start/end: 62448.930353 → 72041.536215 ms; 9592.605862 ms.
- Residency checks: before `2026-10-10T12:11:43.084Z`, after `2026-10-10T12:11:52.678Z`; both known non-resident, all returned model lists empty.
- Status: invalid provenance/evidence or application rejection; parsed operations 3, accepted 0, rejected 3, stored item mutations 0.
- Application diagnostics: `{"semanticAttempts":1,"resumeEvents":10,"observedEvents":12,"lastFailure":"semantic-update-failed"}`; transcript unchanged: true.
- Host failure: `Error: Goal requires explicit user replacement.`. All returned operations were rejected atomically; no individual operation was accepted.

Actual completed updater delta:

```json
{
  "version": 1,
  "goal": {
    "mode": "initial",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "evidence": {
      "messageId": "p182-user-F",
      "quote": "The indexing integration tests are completed and passing now."
    }
  },
  "changes": [
    {
      "operation": "remove",
      "category": "pending",
      "key": "indexing-integration-tests",
      "evidence": {
        "messageId": "p182-user-F",
        "quote": "The indexing integration tests are completed and passing now. The missing fixture blocker is resolved."
      }
    },
    {
      "operation": "remove",
      "category": "problems",
      "key": "indexing-integration-tests",
      "evidence": {
        "messageId": "p182-user-F",
        "quote": "The missing fixture blocker is resolved."
      }
    }
  ]
}
```

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p182-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [
    {
      "key": "metadata-store",
      "text": "Use PostgreSQL for metadata.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-E"
      ],
      "sourceEventIds": [],
      "revision": 10
    }
  ],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": [
    {
      "key": "indexing-integration-tests",
      "text": "Indexing integration tests blocked by missing test fixture.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p182-user-D"
      ],
      "sourceEventIds": [],
      "revision": 8
    }
  ]
}
```

Exact provider terminal timing metadata (duration fields in nanoseconds):

```json
{
  "total_duration": 9591377809,
  "load_duration": 2523146829,
  "prompt_eval_duration": 323620000,
  "prompt_eval_count": 952,
  "eval_duration": 6739545000,
  "eval_count": 458,
  "done_reason": "stop"
}
```

## Final summary table

| Item | Final value |
| --- | --- |
| TEST_MODEL | qwen3.5:9b |
| fixed live semantic cases | 6 defined and attempted once each |
| live retries | 0 ordinary; 1 permitted A deadline diagnostic |
| goal handling | limitation; correct initial goal only in diagnostic, C/F invalid initial-over-existing operations |
| decision handling | limitation; C wrong category/rejection, E timeout |
| constraint handling | limitation; D timeout, E stale revoked restriction |
| pending handling | limitation; B timeout, F completed task remains pending |
| problem handling | limitation; D timeout, F resolved problem remains active |
| explicit correction | limitation; E timeout, F atomic rejection |
| semantic updater timeout | 10000 ms production, unchanged |
| timeout decision | inconclusive; likely too short for this run, no safe portable new value |
| initial/non-resident latency | measured; A production 10002.327 ms timeout, A diagnostic completion 12835.193 ms; all calls non-resident |
| warm/resident latency | unavailable; none observed, no retention experiment |
| production change | none; progress document only |
| model-specific production logic | none |
| provider-specific production logic | none |
| Phase 17 retrieval changes | none |
| Phase 18.1 tool changes | none |
