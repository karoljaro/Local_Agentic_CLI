# Phase 17 — semantic retrieval over durable conversation history

## Status

verified

Fresh execution thread; parallel Ultra reasoning audits cover turn semantics, vector/persistence, and embedding/provider boundaries. The execution interface cannot create another Codex session or mutate its reasoning setting. No commit requested. Prior Phase 1–16 progress records remain unchanged.

## Baseline

- Starting HEAD: `7683522a74b2adfe2606938c0df696f35a9453b7`.
- Starting git status/diff: clean, no staged or untracked changes.
- Bun: `1.4.2`. No repository AGENTS.md found; earlier records report no ancestor instructions.
- Read Phase 16, 15.5, 15 and relevant Phase 1/2/7/8/10 records/code. Phase 16 compiler groups at user boundaries, retains latest exact, then contiguous newest whole historical turns until first non-fitting turn. System and all nine tools participate; default window/output/safety = 16384/4096/1024. Token sizing is an estimate.
- `.agent/sessions/<sessionId>/events.jsonl` is append-only canonical data. SessionService serializes selected state/commits, SessionReducer owns canonical messages, completed tool batches enter only after all terminal results; incomplete batches are excluded. Durable user message IDs survive replay.
- Current provider is Ollama at `http://localhost:11434`; OLLAMA_MODEL unset, keep-alive default 0, TEST_MODEL explicitly qwen3.5:9b; HISTORY_EMBEDDING_MODEL unset. Chat selection/preference remain Phase 15.5-owned.
- Dependencies: OpenTUI 0.5.14, ripgrep-universal ^1.18.0, zod ^4.4.3; dev Biome 2.5.1, Bun types ^1.4.2, TypeScript ^7.0.2. No vector/tokenizer dependency.
- Baseline release: exit 0, `/tmp/phase-17-baseline-release.log`; 632 tests / 38 files / 5920 assertions, both builds and packaged smoke pass.
- Created this record before production edits.

## Retrieval design audit

Completed audit: user-boundary turn with durable user MessageId, scoped by SessionId. Exact canonical payload comes from SessionReducer; bounded deterministic search text is separate. Leading legacy groups and malformed tool chains are not indexed. Source projection, identity, stale-data and dedup contracts are recorded in the decision gate below.

## Vector backend evaluation

Completed primary-source evaluation and bounded synthetic benchmark select exact Float32 cosine scan. No dependency added. Decision, alternatives and measurements below.

## Embedding contract

Application EmbeddingPort supplies opaque modelIdentity and embed(texts, signal), 1–32 texts per batch. OllamaEmbeddingAdapter owns /api/embed mapping and validates cardinality, finite/nonzero Float32 vectors, dimension and response model. HISTORY_EMBEDDING_MODEL is explicit and separate from chat selection. Unconfigured or failed retrieval is nonfatal; no downloads or hidden fallback.

## Index contract

Durable JSONL remains authoritative. BinaryHistoryIndexStore persists a disposable, atomically replaced compact metadata/Float32 envelope under ignored .agent/history-index. Header identity/version/dimension/source hashes and checksum detect incompatibility; canonical payloads are never stored in the cache. Missing/corrupt/incompatible caches rebuild; validated prefixes support incremental resume.

## Retrieval/compiler policy

Recorded before implementation: mandatory system/tools and active exact turn win; previous whole turn exact if it fits; ranked relevant older candidates share the existing budget, may skip oversized candidates, and final selected turns are chronological. Threshold 0.65, top eight candidates, at most three selected old turns. Unused budget stays unused on successful retrieval. Unavailable retrieval deliberately preserves Phase 16 recency fallback.

## Implementation checkpoints

- Baseline and parallel read-only audits started.

## Validation

All final deterministic gates pass on the final code/tests. No provider is required by normal tests. Final focused command:

```bash
bun test src/application/services/HistoryRetriever.test.ts src/application/services/HistoryTurns.test.ts src/application/services/ExactVectorSearch.test.ts src/application/services/ContextBuilderRetrieval.test.ts src/infrastructure/persistence/BinaryHistoryIndexStore.test.ts src/infrastructure/model/OllamaEmbeddingAdapter.test.ts src/application/services/ContextBuilder.test.ts src/application/services/SessionReducer.test.ts src/application/services/SessionService.test.ts src/infrastructure/persistence/JsonlSessionStore.test.ts src/application/use-cases/RunAgentTurn.test.ts src/application/use-cases/RunAgentTurnRetrieval.test.ts src/composition/config.test.ts src/composition/createRuntime.test.ts src/composition/createRuntimeRetrieval.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts src/infrastructure/model/InstructionSurface.test.ts src/application/services/ModelSelection.test.ts src/composition/model/OllamaModelRuntime.test.ts src/composition/model/ModelResume.test.ts
```

Result: **463 pass / 0 fail / 2920 assertions / 20 files**; `/tmp/phase-17-final-focused.log`.

| Final gate | Result | Evidence |
| --- | --- | --- |
| bun run typecheck | pass, exit 0 | /tmp/phase-17-final-typecheck.log |
| bun test | 825 pass / 0 fail / 6548 assertions / 46 files, exit 0 | /tmp/phase-17-final-tests.log |
| bun run format:check | pass, 150 files, no fixes, exit 0 | /tmp/phase-17-final-format.log |
| bun run build:linux | pass, exit 0 | /tmp/phase-17-final-linux.log |
| bun run build:windows | pass, exit 0 | /tmp/phase-17-final-windows.log |
| bun run smoke:build | pass, exit 0 | /tmp/phase-17-final-build-smoke.log |
| bun run release:check | pass, exit 0; same 825 tests / 6548 assertions / 46 files, both builds + packaged smoke | /tmp/phase-17-final-release.log |
| git diff --check | pass, exit 0 | final structural review |
| git diff --stat | reviewed; 7 tracked paths (excludes 16 new files) | final structural review |
| git status --short --untracked-files=all | reviewed; 7 modified + 16 new, only phase source/tests/docs/config example | final structural review |
| new-file whitespace review | no whitespace errors in all 16 new files; no-index diff exit 1 indicates expected difference | final structural review |
| protected-path diff | unchanged prior Phase 1–16 records, canonical reducer/service/store, chat selection/model lifecycle, tool/system surface, presentation, dependencies/lockfile | final structural review |
| HEAD/staging | HEAD remains 7683522a74b2adfe2606938c0df696f35a9453b7, nothing staged, no commit | final structural review |

The suite grows from 632 to 825 passing tests (+193). Existing tests remain unchanged except six additive embedding configuration tests; no Phase 16/15.5 expectation was weakened. Compiler retrieval focus is 27 pass / 88 assertions. It proves previous priority, relevance-selected exact candidates, chronology/cap/dedup, malformed/foreign-ID rejection, oversized skip/next fit, exact estimate boundary/reserves, mandatory overflow, all-nine-tool cost, complete read/search/edit failure/recovery chains, sparse 200-turn history and unchanged fallback. Explicit old SQLite file observation precedes the exact current PostgreSQL workspace read in the active chain; neither payload is rewritten.

Coverage of all 22 requested retrieval categories spans fake-vector ranking/service tests, binary-cache corruption/rebuild/model/dimension/identity tests, actual JSONL resume/incremental tests, actual composition/Ollama wire capture, compiler budgeting and preserved SessionReducer/SessionService/RunAgentTurn/model-selection regressions. Old read_file, search_text, edit_file and failure/recovery payloads remain whole and exact. User query embedding is reused through tool rounds; active tool results are neither queried nor indexed. Missing/corrupt/changed-format/model/dimension/source caches rebuild; provider/cache failures and deadline fallback complete ordinary chat without error events. Caller cancellation aborts HTTP and prevents chat invocation.

Full production and new-file diff reviewed by root and independent agents; all findings resolved. After passing gates, only progress documentation and README paragraph wrapping changed. Expensive gates were not rerun for those document-only edits.

## Optional live smoke

Skipped: HISTORY_EMBEDDING_MODEL unset. TEST_MODEL is never an embedding fallback. No real embedding/chat inference performed; no downloads/retries/matrix.

## Final contract

Verified final contract below. All mandatory deterministic/release gates passed; optional live smoke skipped.

| Item | Final value |
| --- | --- |
| Retrieval scope | current session only |
| Active turn | exact |
| Immediate previous turn | exact when it fits |
| Older history | semantic retrieval when available; Phase 16 recency fallback otherwise |
| Retrieval unit | whole completed user-boundary turn, durable user MessageId scoped by SessionId |
| Search representation | deterministic bounded user/assistant text + tool/path/query/range metadata; no raw tool bodies or mutation text |
| Payload representation | original exact reducer-owned turn, including complete tool chains |
| Embedding provider contract | EmbeddingPort, opaque model identity + bounded cancellable text batch |
| Current embedding adapter | Ollama /api/embed, explicit HISTORY_EMBEDDING_MODEL; no chat fallback/download |
| Vector backend | exact normalized Float32 cosine scan, dependency-free |
| Index source of truth | derived from durable JSONL through canonical SessionReducer state |
| Index persistence | .agent/history-index/<sessionId>.bin; compact header + LE Float32 vectors + checksum |
| Rebuild behavior | missing/corrupt/incompatible -> rebuild; matching prefix reused; newly completed turns only; verified batch checkpoint on provider failure/timeout |
| Context window | 16384 |
| Output reservation | 4096 |
| Safety allowance | 1024 default |
| Structured memory | not implemented |
| Cross-session memory | not implemented |

Cosine similarity is primary; only exact-score ties prefer newer canonical position. Recent/active IDs are excluded, repeated candidates deduplicated, selected old payloads sent chronologically. Oversized candidates skip whole and smaller next candidates may fit; previous context gets budget priority and may omit whole if oversized. No arbitrary recency refill after successful zero-match retrieval.

Known limits: fixed threshold varies by embedding model, bounded projection can miss semantics beyond caps, exact old file/tool text can be stale, same-tag/same-dimension model replacement needs explicit cache deletion, first batch exceeding deadline cannot checkpoint until a whole batch succeeds. Initial/rebuild embedding attempts have a 10-second actual abort deadline; completed prefixes may get a further bounded one-second write allowance. No native Windows execution or real embedding-quality claim is made by deterministic/build tests. Large exact old turns may never fit and are never summarized/truncated.

Phase 18 boundary: no LLM summaries, generated importance/goal/decision/pending-work/file-state memory, cross-session consolidation, dynamic tool routing, TUI/context-window/model-selection redesign. Future structured session memory may use these boundaries without making the cache canonical.

### Decision gate — recorded before production implementation

Chosen backend: in-process exact normalized Float32 cosine scan, no dependency.

- Expected scale: hundreds/few thousand completed turns; measured dimension 768. One bounded Bun/Linux run (5 warmups, 20 searches each) measured 1000/5000/10000/25000 vectors: build 5.96/22.18/37.56/100.96 ms; median search 0.766/3.836/7.651/19.207 ms; p95 0.796/3.936/7.853/19.990 ms. Raw vectors occupy 3.072/15.36/30.72/76.8 MB. Synthetic generation/build is not model inference. Script: `/tmp/phase17-vector-benchmark.ts`.
- Standard TypeScript/Bun has no native ABI/system libraries, works with current Linux/Windows build pipeline, and compact little-endian Float32 persistence is straightforward.
- FAISS rejected: approximate/massive-scale machinery unnecessary here; core C++20/OpenMP/BLAS and faiss-node native addon/prebuild/companion library packaging add install and release complexity. It is viable, not assumed incompatible. [FAISS](https://github.com/facebookresearch/faiss), [faiss-node](https://github.com/ewfian/faiss-node).
- HNSW rejected: hnswlib-node has current Bun Ubuntu CI and Node Windows CI, Apache-2.0, node-addon-api/node-gyp. Approximate graph/index build and native executable packaging add complexity without a demonstrated latency need. [upstream](https://github.com/yoshoku/hnswlib-node), [Bun native executable guidance](https://bun.com/docs/bundler/executables#embed-n-api-addons).

Chosen retrieval unit: user-boundary group before active group, stable durable user MessageId scoped by SessionId; shared Phase 16 grouping. Leading legacy non-user group is not indexed. Reject indexing malformed orphan/missing/duplicate tool chains; do not repair canonical compatibility payloads. Safe published failed/interrupted turns need no final assistant answer to qualify.

Search representation: deterministic bounded current user/assistant natural language plus tool names and whitelisted short path/query/pattern/range arguments; no raw tool results, edit/replacement/create bodies or generated summaries. Limit total 8000 characters, bound individual contributions, strip fenced code from search text only. Query = bounded active user request only, cached across tool rounds. Exact canonical retrieved payload remains unmodified; old file/result text remains historical evidence, workspace/read_file is authoritative current state. No instruction/tool changes warranted.

Embedding contract: application port with opaque model identity and bounded text batch; adapter `/api/embed`, explicit configured model, truncate=false, caller signal. Identity includes normalized endpoint and embedding model, independent of chat selection. Finite nonzero vectors normalized in exact backend; dimensions validated before reuse. Batch rebuild avoids one model reload per turn; provider-default retention, no chat lifecycle hooks. [Ollama API](https://docs.ollama.com/api/embed).

Persistence: `.agent/history-index/<safe-session-id>.bin`, ignored via existing `.agent` rule. Single atomically replaced file: compact JSON header then little-endian Float32 body. Header contains version, session identity, embedding identity, dimension, ordered stable turn IDs and SHA-256 search-source fingerprints, vector-body checksum. No duplicate transcript. Validate shape/length/checksum/vectors; missing/corrupt/old format/model/dimension/source mismatch discards cache and rebuilds from canonical state. New completed units append vectors only. Selected-session application service owns ensure/query/index lifecycle, serialized by one promise gate; no workers/background hooks/reducer/index event replay. Writes use exclusive same-directory temp + close + cancellation check + rename, clean owned temp on failure. Another process may replace cache atomically; next restart validates source and repairs. Cache carries no correctness authority.

Compiler priority: mandatory exact system/all tools/active, previous exact whole group if it fits, then cosine-ranked older candidates >=0.65, up to eight candidates and at most three selected old turns, all charged to Phase 16 input estimate. Candidate may skip when oversized (unlike contiguous recency); consider next ranked candidate. Deduplicate IDs/exclude immediate previous and active, sort selected old turns chronologically. No extra recency refill on successful retrieval, even zero matches. Unavailable/unconfigured/provider/cache failure deliberately falls back to the existing Phase 16 contiguous recency policy, retaining all overflow guarantees. Preflight mandatory budget occurs before any embedding work. Retrieval timeout aborts actual embedding HTTP operations after 10 seconds total per attempt; caller cancellation propagates. Failed active-turn retrieval is memoized through tool rounds; next user turn may retry. No normal UI noise.

Relevance limitations: 0.65 is a conservative fixed policy, not model-calibrated probability; model-dependent false positives/negatives remain. Mutable embedding tags replaced in place with same dimension are not detectable through embed response identity; deleting cache explicitly rebuilds. Full canonical payload can be stale/large: compiler skips oversized turns without truncating. This phase adds no summaries/structured memory.

### Implementation audit refinement

Independent review found that an aggregate rebuild timeout could repeatedly discard valid completed batches on large resumed sessions. Publish a verified source-prefix checkpoint after an embedding/timeout failure when at least one complete batch succeeded (bounded one-second cache-write cleanup allowance, caller cancellation still respected). Current request falls back; next user request resumes from that valid derived prefix. No partial/mixed-dimension batch is published. This avoids repeated full-session embedding without workers or background work. Cache reads now check file size before allocation and read only that bounded size; cancellation preserves primary cleanup error as AbortError.cause.

### Checkpoint — production and deterministic coverage

- Added narrow EmbeddingPort and HistoryIndexPort, shared unchanged user-boundary grouping, integrity eligibility, bounded deterministic search projection, exact normalized cosine scan, current-session HistoryRetriever, compact atomic binary cache and Ollama embedding adapter. No dependency/lockfile changes.
- Compiler receives ranked stable IDs, resolves canonical exact turns, preserves previous/active and estimates all selected payloads against existing reserves. Loop preflights before enabled embedding and rereads canonical state each tool round. Composition creates no retrieval service/adapter/store work when embedding model is unset, preserving Phase 16 request lifecycle.
- Initial full suite: 785 pass / 10 fail / 6328 assertions / 795 tests / 45 files. Failures exposed redundant compiler builds added to disabled paths; fixed by retaining the original one-build path without configured retrieval. No old test expectations weakened. Regression-focused composition/RunAgentTurn: 77 pass / 0 fail / 1120 assertions / 3 files.
- Root retrieval initial focus: 23 pass / 74 assertions. Added valid-prefix checkpoint and deterministic timeout coverage afterward. Root JSONL/loop+store focus: 40 pass / 119 assertions / 2 files. Real JSONL test preserves the original serialized prefix and complete 40-turn replay; sparse old/previous/active payloads persist across actual read_file tool rounds and index reuse after restart embeds query + newly completed turn only.
- Independent adapter/config/composition focus: 69 pass / 232 assertions / 3 files. Independent grouping/vector focus: 53 pass / 122 assertions / 2 files. Binary store focus: 37 pass / 84 assertions / 1 file. These overlap later combined gates; counts are not additive.
- Bounded cache reads and truthful temporary-file cleanup tested. Caller cancellation .cause retains underlying cleanup information; ordinary failures are internally diagnosed and produce fallback without assistant output/errors. Rebuild stores only complete verified batches.
- README and .env.example describe separate embedding configuration, source/cache ownership, threshold/caps/fallback and stale-payload limitations. Protected historical progress records, tool/system instructions, chat selection and presentation are unchanged.
- Baseline release exit 0, including both builds and packaged smoke; `/tmp/phase-17-baseline-release.log`.

### Cache size and final review checkpoint

Calculated compact envelope sizes for 768-dimensional Float32 vectors and 36-character stable user IDs (no raw transcript): 1000 = 3,202,232 bytes; 5000 = 16,010,232 bytes; 10000 = 32,020,232 bytes. Metadata costs approximately 130 bytes/unit, versus 3072 vector bytes/unit. This calculation uses the actual compact header shape; no compression is warranted. Cache limits: 50,000 entries, dimension <=65,536, envelope <=256 MiB; oversized/corrupt cache reads are rejected before allocation. Atomic rename has no fsync/power-loss guarantee, and abandoned temporary files from process termination are not treated as canonical data.

Both provider/lifecycle and vector/persistence independent reviews found no remaining correctness issue. Successful atomic cache publication now updates in-memory ownership before honoring a racing cancellation, avoiding redundant embedding of already committed vectors. Deterministic tests cover that race, checkpoint resume and nonfatal deadlines. Caller cancellation discards uncommitted rebuild work; provider failure/timeout can checkpoint completed batches.

Protected-path diff audit passed: SessionReducer/SessionService, durable JSONL store, ModelSelection/runtime/preferences, chat adapter/wire options, all tools/filesystem, presentation, dependencies/lockfile and historical records unchanged. All selected data comes from canonical current-session messages; index has no event replay/file reads/tool execution/LLM summaries. Final compiler test audit and consolidated gates subsequently passed, as recorded in Validation.

## Final structural review

- Durable JSONL is complete/authoritative; index is only derived vectors/identity/source metadata and rebuilds from canonical history. SessionReducer remains sole history assembler; retriever never replays events.
- Retrieval is current-session only. Stable durable user IDs identify whole safe turns. Recent/active exclusion and dedup prevent duplicate payloads. No orphan chains enter semantic retrieval; legacy canonical/fallback compatibility remains.
- Mandatory active/system/all nine tools stay exact; previous whole turn retains priority when it fits. Old turns are relevance-selected and chronological; successful retrieval leaves spare input budget unused. No selected payload is split, summarized or truncated.
- All payloads use the unchanged compiler estimate/window/output/safety budget. Mandatory overflow precedes embedding/provider work; length completion remains incomplete-response error. Ollama num_ctx/num_predict and truncate=false/shift=false remain unchanged.
- Embedding configuration is separate from chat ModelSelection, OLLAMA_MODEL, TEST_MODEL and .agent/model-preference.json. No hidden defaults, downloads, new dependencies, external routing or TUI changes. Ollama endpoint/model format exists only in infrastructure/composition.
- Serialized service lifecycle, bounded cancellable embedding requests, safe atomic cache replacement/checkpoint and corrupt-index fallback preserve ordinary chat and durable data. No abandoned background worker/provider request exists.
- No summaries, structured session/personal memory, cross-session retrieval, model/tool/presentation redesign or Phase 18 work. No generated index/.agent/dist artifact is tracked or staged. No commit created.


## Post-verification live embedding smoke

Later validation on 2026-10-09, started at 17:29:36.800 UTC. Original Phase 17 status remains **verified**; the original Optional live smoke skip above is preserved unchanged. This attempt is supplemental observation, not threshold calibration.

Final result: **INCONCLUSIVE** — the first real query embedding timed out before any vector was returned. Stop condition honored: no retry, model download, comparison, threshold change, chat request, production edit or release-suite rerun.

| Observation | Actual result |
| --- | --- |
| Resolved HISTORY_EMBEDDING_MODEL | qwen3-embedding:0.6b |
| Ollama endpoint | http://localhost:11434 |
| Installed-model check | PASS; one real /api/tags request reports the configured model installed |
| Phase 17 embedding identity | `["ollama","http://localhost:11434","qwen3-embedding:0.6b"]` |
| Returned vector dimension | unavailable; no embedding response completed |
| Query embedding | one /api/embed attempt, failed with TimeoutError: The operation timed out. |
| Historical vectors created | 0; historical batch was never requested |
| Expected relevant cosine score | unavailable |
| Highest unrelated cosine score | unavailable |
| Threshold | 0.65, unchanged |
| Retrieved turn count / selected retrieved IDs | 0 / [] (timeout fallback; not a relevance result) |
| Cache | missing; no .agent/history-index/<sessionId>.bin produced; reuse check not performed |
| Chat requests | 0; chat invocation was unnecessary for the intended compiler/canonical-payload instrumentation |
| Timeout | production retrieval 10,000 ms; aggregate AbortSignal 40,000 ms; hard process limit 45,000 ms (+2 s kill grace) |
| Actual scenario elapsed | 10,044 ms; stopped at production retrieval deadline, before aggregate/process deadline |
| Fixture cleanup | confirmed complete |
| Changes | appended progress record only; no production code, deterministic tests, dependency or configuration changes |

Disposable fixture: session `phase17-live-c593b54c-ac15-4374-b1e5-988045992a13`, workspace `/tmp/phase17-live-retrieval-aetgyh` (removed). Six completed historical turns: old PostgreSQL/data-preserving migration policy, terminal UI, image scaling, HTTP timeouts, unrelated filesystem work, and a neutral immediately previous request for a brief answer. The old policy used stable durable MessageId `p17-live-db-policy`; previous/active IDs were `p17-live-previous-neutral` and `p17-live-active`. Fifteen durable JSONL events were created and reduced through actual SessionService/SessionReducer, including an exact historical read_file chain whose raw body was excluded from the embedding projection.

Expected old request: “For this project the database should use PostgreSQL and migrations must preserve existing production data.” Current exact request: “How should we handle schema changes without risking the data already stored by users?” The query was not copied from the old turn. All nine production tool definitions and the configured 16384/4096 profile participated in compiler preflight before embedding. The later selected-payload/chronology/dedup/token-cost, derived-cache and one-resume checks were not reached, so this live attempt makes no new success claim for those invariants.

Actual error path: OllamaEmbeddingAdapter /api/embed query → real abort at HistoryRetriever's unchanged 10-second deadline → `fallbackReason: timeout`, `indexState: missing`, `failureDetail: The operation timed out.` The harness stopped immediately on that fallback, with no historical embedding or chat invocation. The diagnostic category is correct and exposes no concrete implementation bug. No claim is made about whether model loading or inference caused the delay; the installed-model check alone cannot establish successful embedding generation.

Evidence: disposable harness `/tmp/phase-17-live-smoke.ts`, result `/tmp/phase-17-live-result.json`; command `timeout --signal=TERM --kill-after=2s 45s bun /tmp/phase-17-live-smoke.ts` (exit 0; harness explicitly reports INCONCLUSIVE). Localhost access used command sandbox escalation. The request received the real cancellation signal, no background indexing was started, and no full vectors were printed. The original 825-test deterministic/release verification remains valid and was not repeated for this document-only append. No commit created.

## Post-verification timeout diagnostic

Later diagnostic on 2026-10-09, started at 17:51:05.305 UTC. **PASS**. Exactly one new scenario, followed by one successful cache-reuse check within that scenario. Original verification status remains **verified**; both the original unset-model skip and first post-verification timeout remain above unchanged. No production code, timeout, threshold, dependency, model configuration or Phase 16 behavior changed.

External evidence supplied before this attempt: a direct cold Ollama `/api/embed` request for `qwen3-embedding:0.6b` succeeded with `total_duration: 1225781464 ns` (1.225781464 s), `load_duration: 1205740930 ns` (1.205740930 s), `prompt_eval_count: 13`, and dimension 1024. This is separately attributed provider evidence, not another request made by this diagnostic. The external command's exact input/body and connection options were not supplied, so no unsupported curl-versus-Bun equivalence or cause is claimed.

### Deadline and execution trace

Observed path: disposable JSONL fixture → SessionService/SessionReducer canonical state → HistoryRetriever → observed EmbeddingPort delegating unchanged to OllamaEmbeddingAdapter → OllamaHttpClient → real Bun fetch → response JSON/validation → exact vector scan → ContextBuilder. Instrumentation lived only in `/tmp` and wrapped/delegated existing methods; it did not replace embedding inference, vector calculations, request bodies, cancellation signals or compiler policy.

- The promise gate runs before `retrieveSelected`; canonical grouping/projection/fingerprints then run before `AbortSignal.timeout(10000)` is created. The ten-second deadline covers cache read, query embedding, historical embedding batches, cache write and vector search. There is no separate adapter timer. Caller cancellation is combined through `AbortSignal.any` and passed unchanged to fetch.
- Query and historical indexing intentionally share one deadline for this retrieval operation. In the original failed attempt, query was first and no historical request ran. Catalog lookup, awaited fixture writes, canonical replay and compiler preflight occur before that deadline. No unawaited SessionService operation or initializer competes with this fresh retriever's gate.
- This attempt's gate wait was 0.098 ms, missing-cache read 0.444 ms. At query embedding entry the combined signal was only 0.813 ms old and un-aborted; at HTTP request start it was 1.125 ms old, with the ten-second timer created approximately 1.2 ms earlier. The historical batch used that same signal after the successful query (signal age 1507.380 ms at its HTTP start). Reuse created a fresh deadline/signal; no elapsed signal was inherited from the first retrieval.
- Actual POST was `http://localhost:11434/api/embed`, model `qwen3-embedding:0.6b`, input array, `truncate:false`; body keys were exactly `input`, `model`, `truncate`. Query input count/length: 1 / 85 characters. Historical batch: 6 inputs / lengths 343, 134, 152, 151, 173, 100 characters. No chat model, TEST_MODEL, chat context options, model-selection operation, keep_alive override or download was involved.
- Bun 1.4.2 ran with explicit command sandbox escalation, as did the prior smoke. DNS returned `::1` and `127.0.0.1` for localhost; all checked upper/lower-case HTTP_PROXY, HTTPS_PROXY, ALL_PROXY and NO_PROXY variables were absent. Configured localhost URL was unchanged. Both catalog GET and embedding POST succeeded; the actual socket address was not instrumented, so DNS/address-family causation is not inferred.

### Single diagnostic timing

Times below are UTC on 2026-10-09; durations come from monotonic instrumentation. Scan timing is an upper bound from first vector access through retriever return, including final result construction. These are fixture observations, not a benchmark.

| Boundary | Timestamp | Duration / observation |
| --- | --- | --- |
| Installed-model catalog GET | 17:51:05.309 → 17:51:05.312 | HTTP 200; 2.879 ms; configured model installed |
| Retrieval entry / gate entry | 17:51:05.321 | gate wait 0.098 ms |
| Production deadline created | 17:51:05.322 | fresh 10000 ms deadline |
| Cache/index ensure starts with read | 17:51:05.322 | 0.444 ms; missing cache; initial index creation required |
| Query embedding start → completion | 17:51:05.323 → 17:51:06.829 | 1506.068 ms; one 1024-dimensional vector |
| Query HTTP start → response headers | 17:51:05.323 → 17:51:06.828 | HTTP 200; 1504.567 ms |
| Query response body complete | 17:51:06.828 | request-through-body 1504.952 ms |
| Historical embedding batch | 17:51:06.829 → 17:51:06.937 | 108.104 ms; six 1024-dimensional vectors |
| Cache/index ensure ends with write | 17:51:06.938 → 17:51:06.941 | atomic cache write 2.712 ms |
| Vector search → retrieval return | 17:51:06.941 → 17:51:06.942 | scan upper bound 0.478 ms |
| Initial retrieval complete | 17:51:06.942 | total retrieval 1620.829 ms; no fallback |
| Compiler handoff → completion | 17:51:06.943 → 17:51:06.944 | expected stable ID selected; all invariants passed |
| One fresh-service cache reuse | 17:51:06.945 → 17:51:06.955 | total 10.462 ms; query embedding 8.981 ms; zero historical embeddings |

Real query provider response reported `total_duration: 1504106313 ns`, `load_duration: 1481208640 ns`, `prompt_eval_count: 16`. Historical batch reported `total_duration: 105144486 ns`, `load_duration: 1210402 ns`, `prompt_eval_count: 193`. Both responses named the configured embedding model and returned dimension 1024. Reuse query also returned 1024. No full vectors were logged.

Aggregate limits: 40000 ms caller AbortSignal, 45000 ms external process timeout (+2 s kill grace). Entire scenario, including fixture creation, initial retrieval, compiler checks, one reuse and cleanup, took 1651 ms. No deadline fired; no retry or additional diagnostic/provider comparison was run. Three embedding requests were made: initial query, one historical batch, and the single successful reuse query. Chat requests: zero.

### Retrieval, cache and invariant evidence

The fixture preserved the first smoke's six completed topics and exact current query: old PostgreSQL/data-preserving migration policy with a complete read_file chain; unrelated terminal UI, image processing, HTTP configuration and filesystem turns; a neutral immediate previous turn; active request “How should we handle schema changes without risking the data already stored by users?” Fifteen events were durably appended and replayed into canonical state. The historical raw tool body was absent from embedding inputs, while its exact canonical payload was retained in the selected compiler turn.

| Stable durable MessageId | Actual cosine score | Selection |
| --- | --- | --- |
| p17-live-db-policy | 0.7082527878680477 | retrieved old turn |
| p17-live-terminal-ui | 0.3422998134637874 | excluded |
| p17-live-image-processing | 0.4379774575810556 | excluded; highest unrelated score |
| p17-live-http-config | 0.3647101825715270 | excluded |
| p17-live-filesystem | 0.43049492944069845 | excluded |
| p17-live-previous-neutral | 0.42910220837811985 | exact recent priority; excluded from semantic candidates |

Threshold remains **0.65**. Five old candidates were considered; exactly one retrieved ID was selected: `p17-live-db-policy`. Final chronological user IDs were `[p17-live-db-policy, p17-live-previous-neutral, p17-live-active]`. Assertions confirmed exact canonical message-object payloads, complete historical read_file call/result structure, active/previous exactness, chronology, no duplicates, no irrelevant refill and all nine unchanged tool definitions.

Compiler estimates: input 1942 tokens, retrieved payload 286 tokens, fixed input limit 11264, remaining margin 9322. Context/output/safety remain **16384 / 4096 / 1024**. Selected exact payloads, including old tool output, consume the same existing input budget. Canonical history and durable JSONL remained complete and byte-for-byte unchanged after both retrievals; old file content remains historical evidence under the unchanged workspace-source-of-truth contract.

Disposable session: `phase17-live-760dc0b2-0d86-4cce-8249-1deeefecb322`. Cache was created at `.agent/history-index/phase17-live-760dc0b2-0d86-4cce-8249-1deeefecb322.bin` within `/tmp/phase17-timeout-diagnostic-x81vcD`. Size: 25538 bytes; six historical vectors; compact header version 1, session identity, embedding identity `["ollama","http://localhost:11434","qwen3-embedding:0.6b"]`, dimension **1024**, stable IDs/source hashes and checksum. Header/vector storage contained no duplicate canonical transcript or raw historical tool body. A fresh SessionService/retriever reused the validated cache (`indexState: reused`), embedded only its query, produced the same candidates/compiler payload and left cache/durable bytes unchanged. The initial `indexState: missing` records the starting cache state, not failure to publish it. No incompatible cache existed or was reused.

Code audit confirms dimension derives from returned query length, compatibility requires matching model identity/dimension/source IDs and hashes, binary reads allocate according to validated dimension, and vectors are checked against it. The synthetic benchmark's 768 dimension is not assumed by production code. The fixture and cache were removed after verification; no generated `.agent` artifact entered the repository.

### Diagnostic conclusion

Treat the prior timeout as a transient provider/infrastructure failure unless further evidence identifies a cause: the same configured production path and same query now complete comfortably inside the unchanged deadline. This is an inference from successful reproduction, not a proven explanation of the earlier stall. The first attempt did not separately instrument HTTP connection, response headers/body or provider execution, so its exact boundary/cause cannot be reconstructed from that record. This attempt found no stale signal, gate starvation, pre-query serialized work, unexpected deadline sharing or persistent localhost failure. No production correctness bug was exposed and no timeout increase is justified by these observations.

Evidence: `/tmp/phase-17-timeout-diagnostic.ts`, observational wrappers `/tmp/phase-17-timeout-instrumentation.ts`, result `/tmp/phase-17-timeout-diagnostic-result.json`; command `timeout --signal=TERM --kill-after=2s 45s bun /tmp/phase-17-timeout-diagnostic.ts` (exit 0, explicit PASS). Progress-record-only change; focused tests/typecheck/full release gates were not rerun because no production code changed. Prior deterministic verification remains intact. Append preservation and `git diff --check` passed. Existing staging was preserved; no commit created.
