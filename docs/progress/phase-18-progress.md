# Phase 18 — compact structured session working memory

## Status

verified

Fresh execution thread; four parallel read-only Ultra audit agents cover lifecycle, update strategy, persistence/provenance, and context integration. The execution tools cannot launch another top-level Codex session or change its reasoning setting. Root owns design and production edits. No commit requested. Historical Phase 1–17 records are protected.

## Baseline

- Starting HEAD: `c0a0753f3978a93c9b74f0c95f0177e0a2d307a6`.
- Starting git status/diff: clean; no staged, modified, or untracked files.
- Bun: `1.4.2`. No ancestor/repository AGENTS.md found.
- Baseline release passed, exit 0: 825 tests / 46 files / 6548 assertions, format/typecheck, both builds and packaged smoke; `/tmp/phase-18-baseline-release.log`.
- Phase 16 ContextBuilder owns mandatory preflight, one configured system message, all nine tools, exact active turn and the 16384/4096/1024 context/output/safety profile. Phase 17 adds previous exact turn when it fits and relevant canonical old turns; retrieval failure retains Phase 16 recency fallback.
- Phase 17 HistoryRetriever owns current-session completed-turn discovery; exact cosine, threshold 0.65, top 8 candidates, at most 3 selected old turns; separate binary derived index.
- SessionService serializes durable commits; SessionReducer owns model-visible canonical history. `.agent/sessions/<sessionId>/events.jsonl` is canonical append-only history with stable user MessageIds. Tool batches enter canonical history only after all terminal results.
- ToolRunner commits requested/started/terminal events after approval/preparation. Successful edit/replace results distinguish changed true/false; moves and deletes have explicit successful source/destination or deleted output. Read dedup may emit cached references. A final assistant completion is the semantic boundary; tool rounds and denial terminal answers are not proof of task success.
- Effective inputs: OLLAMA_BASE_URL=http://localhost:11434, OLLAMA_MODEL unset, HISTORY_EMBEDDING_MODEL=qwen3-embedding:0.6b, OLLAMA_KEEP_ALIVE=0, TEST_MODEL=qwen3.5:9b. Chat selection remains ModelSelection-owned. Embedding input is never used for memory generation.
- This record was created before production edits.

## Memory semantics

Memory is bounded derived working state, never transcript storage or authoritative workspace contents. Current user, current tool/filesystem evidence and conflicting exact canonical history take precedence. Only current-session state is supported.

- Goal: one high-level objective, retained on operational follow-ups. Initial establishment and explicit user replacement are distinct semantic operations with user evidence; no prompt regex guesses.
- Decisions: settled user choices or assistant-reported committed implementation choices, with source-kind labels; suggestions/proposals excluded. Stable semantic keys replace current choices, e.g. `database`.
- Constraints: persistent user restrictions; evidence-backed removal/replacement uses the same key. Ephemeral command details excluded.
- Files: successful exact tool-output observations only (read/modified/created/moved/deleted); path, activity and bounded source IDs, never contents. A later read preserves known mutation activity. Move removes the source and records destination/from; delete records historical deletion. External edits remain filesystem truth.
- Completed/pending/problems: meaningful task keys, evidence-backed semantic transitions; completing a key removes matching pending/problem state, reopening removes completed. Exact unresolved tool/agent failures are separate deterministic problems; a later matching successful operation resolves its failure. Per-tool success never implies a high-level task completion.
- No secrets, environment dumps, vectors, raw tool bodies, source quotations or narrative transcript are stored. Short evidence quotes are validated transiently and then discarded.
- Collection caps: decisions 8, constraints 8, files 12, completed 4, pending 6, problems 4; goal <=240 characters, entry text <=160, path <=240, source IDs <=3 each. Latest revision wins; duplicate key/text merges bounded provenance. Overflow evicts oldest revision then stable key. Additional total-render cap 1200 conservative estimator tokens evicts whole lower-priority entries.

## Update-strategy decision gate

Selected before production edits: **hybrid A+B**, deterministic event projection plus at most one bounded post-turn semantic delta. Four read-only audits inform the contracts; root resolves the final policy.

| Strategy | Cost/latency | Tool surface/replay/testing | Quality/failure/complexity |
| --- | --- | --- | --- |
| A deterministic only | no inference; incremental exact events | unchanged nine tools; replayable exact projection; easy fake tests | accurate tool effects, cannot reliably interpret free-form goal/accepted choice/constraint/task state without brittle parsing; insufficient target semantics |
| B post-turn extraction | one additional bounded generation after completed turn; deadline limits added latency | no visible tools; strict schema and fake updater; persisted semantic output, not reproducible replay | supports semantic categories, risks misinterpretation; quote/source validation, explicit source labels and independent file ownership reduce risk; nonfatal failure |
| C internal update protocol/tool | no separate call, but repeated tool rounds/token surface and agent compliance cost | a tenth/internal operation changes model tool behavior and replay semantics; partial updates need staging | attractive future explicit-edit control but broader loop/tool change and premature completion risk; rejected for this phase |

Model choice: reuse currently selected chat ModelPort; no MEMORY_MODEL or embedding misuse. A narrow SessionMemoryUpdaterPort owns semantic extraction, with a generic optional responseSchema on ModelChatInput mapped only by infrastructure. No selection-policy/preference changes. An independent memory model adds configuration/download/selection/capability complexity and possible unload churn without evidence of benefit. Future providers may map responseSchema or fail the optional update safely.

Ollama supports JSON schemas in chat `format`; Zod conversion and response validation are documented in [official structured-output documentation](https://docs.ollama.com/capabilities/structured-outputs) and the [chat API](https://docs.ollama.com/api/chat). Native schema support does not establish semantic correctness. No live inference is part of this design audit.

Semantic extraction receives only bounded previous memory, current user/final assistant evidence and exact compact tool activity/failure metadata; no tool file bodies or mutation content. It returns <=12 keyed operations with exact source quotes, not a whole transcript summary. Current user evidence is required for goal/constraints and user-sourced decisions. Assistant reports are labeled distinctly and completion requires a clean final lifecycle boundary. Failed/cancelled/denied turns get deterministic observations only. No per-tool generation, automatic retry or background task.

Extraction uses the configured context window, at most 1024 generated tokens, <=16000 response characters, a 10-second aggregate deadline, and conservative preflight including schema overhead. Oversized evidence/schema requests skip semantic work. Provider/schema/timeout/partial-output failure preserves the completed chat and previous semantic memory plus exact file/failure updates. Subsequent completed turns offer a new opportunity; no retry loop.

## Persistence contract

**B: durable derived artifact**, `.agent/session-memory/<sessionId>.json`, readable format version 1, session identity, exact event-prefix boundary/count/digest, updater version/model identity, semantic contents and provenance. Semantic output is persisted incrementally and is not deterministically reproducible. Canonical JSONL remains the underlying historical truth.

Strict schema, bounded file read/write, exclusive same-directory temporary file (0600), close and atomic rename, owned-temporary cleanup on failure; no fsync/power-loss promise. Missing/corrupt/incompatible/foreign/stale-prefix memory is rejected without impacting chat. Deterministic file/problem projection may rebuild once from existing events; semantic memory is unavailable until subsequent successful extraction. No inference-heavy whole-history rebuild or migration. Valid source prefixes permit deterministic catch-up on resume. Memory never changes durable events.

Selected-session in-memory state receives exact committed events incrementally. Prefix/provenance validation scans history once on activation/resume; ordinary updates process only the changed turn plus bounded memory. Compiler rounds read an immutable bounded snapshot, perform no memory I/O/inference or history replay.

Digest encoding v1: initial SHA-256 of `session-memory-event-prefix-v1`; each step SHA-256(previous hex + newline + complete JSON event with recursively lexicographically sorted object keys). Array order, strings and all JSON values remain intact. This survives canonical JSONL schema key reordering without relying on Phase 17's lossy search projection. Single application writer; no cross-process coordination or polling for external JSONL edits. Existing SessionService selected-state caching remains unchanged.

Audit disposition: canonical JSONL's existing unterminated-tail append recovery and shallow snapshots are pre-existing concerns outside Phase 18; memory neither edits tails nor mutates shared event/message objects. A canonical read/append error stays a canonical error rather than being hidden by memory fallback. Resume validation only covers events supplied by the canonical service. No durable store/reducer/service change is justified by this phase.

## Provenance contract

Semantic entries have stable category/key identity and <=3 current-session durable MessageIds. Updates require a short exact quote in the bounded current-turn user/final-assistant evidence; quotes are discarded after validation. Persisted labels distinguish user-sourced from assistant-reported evidence; these identify source role, not mechanically proven acceptance or probabilistic confidence. All semantic paraphrases remain derived claims. The extractor interprets settled choices versus proposals; quote existence does not prove entailment. Exact tool activity/problems also reference durable terminal EventIds and the owning user MessageId.

On restore, every reference must exist in the validated current-session source prefix, with an appropriate role/type; absent, duplicate/ambiguous, future or foreign references reject the artifact. Prefix digest covers exact durable event data, including tool results (not Phase 17 search hashes). IDs alone explain origin but do not prove semantic entailment; this limitation remains explicit. No IDs or hashes are exposed to the ordinary model prompt.

## Compiler integration

One request-local system message: unchanged configured base prompt followed by a bounded working-memory data section. Empty memory adds nothing. Deterministic category/entry order, JSON-escaped short values; no provenance IDs. Brief authority instruction: working notes may be stale; current user, workspace/tool evidence and conflicting exact history take precedence.

Priority chosen by root: base system + nine tools + exact active + output/safety reservation, then compact memory, then exact previous turn when it fits, then unchanged Phase 17 candidates (or Phase 16 recency fallback). The compiler audit suggested previous-before-memory; root chooses the requested continuity priority because high-level state otherwise disappears behind large recent turns. Memory cap remains small: min(1200, floor(inputLimit/8)), reducing optional footprint for small profiles.

Charge actual combined-system estimate minus base-system estimate, including wrapper/escaping/rounding, through the existing Phase 16 estimator. Drop whole lowest-priority memory entries until the cap and remaining mandatory budget fit; never truncate text/JSON or reduce output. Deterministic priority within memory: goal, constraints, decisions, problems, pending, files, completed (newer revisions first). Add memory cost/selection diagnostics. Previous/retrieved canonical payloads remain whole, exact and chronological. Memory references never suppress retrieval or enter the binary/vector index.

## Implementation checkpoints

- Baseline captured, release started, progress record created and read-only audits launched.
- Four Ultra audits complete, read-only: lifecycle 127 tests/1269 assertions; persistence 156 tests; compiler 132 tests; strategy inspected installed Zod/schema behavior without live inference. Counts overlap baseline and are not additive. All recommend hybrid projection/extraction and independent durable provenance. Root chose memory-before-previous budget priority, documented above.
- Production boundaries implemented: strict memory/delta schemas and bounded provenance, dedicated store/updater ports, JSON atomic store, exact event projection with failure/no-op/cache distinctions, incremental prefix digest, explicit normal-completion extraction, session-generation fencing, selected-model identity checks, single combined-system rendering and separate memory budget diagnostics.
- Old runtime/retrieval tests explicitly fake only the optional semantic updater while preserving their ordinary-chat wire/count assertions; retrieval persistence expectations now include the separate memory directory. New tests exercise default production semantic composition independently.
- Initial focused implementation suite passes: 80 tests / 4 files / 230 assertions; `/tmp/phase-18-focused-initial.log`. Typecheck passes. Additional loop/wire/JSONL coverage continues.
- First complete suite: 920 pass / 52 files / 6879 assertions; `/tmp/phase-18-pre-review-tests.log`. New memory focus subsequently 101 pass / 7 files / 370 assertions, including actual HTTP/body timeout, partial response and 256000-character transport bound.
- Four independent implementation reviews found concrete edge cases. Root fixed role-changing semantic provenance and repeated-read anchors; buffered committed events during asynchronous activation and awaited same-session readiness; authoritative reactivation recovers missed observer events after a canonical reduction failure without changing SessionService. Normal activation checks count/last ID in O(1), recovery alone scans canonical history.
- Unresolved changed-turn failures are tracked separately from compacted display state, preventing omitted problems from licensing false completion. Problems reopen matching completed tasks. File provenance now validates exact observation path/activity/from, message association and revision against terminal-event metadata; unrelated/future file sources reject the artifact.
- Publication order remains held until underlying writes settle even after caller timeout; queued expired/stale publications are skipped. JsonSessionMemoryStore serializes paths across store instances in this process, including reads. Atomic rename is not cancellable after dispatch; no claim of cross-process locking or rollback. No background polling/worker/retry is introduced.
- Review regression focus: 50 service tests pass; `/tmp/phase-18-review-regressions-2.log`. Final lifecycle/compiler rechecks found a legacy requested/terminal mutation with only one message anchor: repeated later reads could pin an unsupported read-message reference. Root now derives preserved message anchors from the retained original event metadata; five cross-turn reads, goal continuity and resume equality are covered. Final service suite: 51 pass / 170 assertions. All scoped independent rechecks report their findings resolved. Live smoke is closed with the limitation below.

## Validation

Final deterministic checks on the production code (all exit 0):

| Command / scope | Result | Evidence |
| --- | --- | --- |
| Focused memory/lifecycle/retrieval/compiler/session/config/model/provider/persistence/tool-contract suite | 557 pass, 0 fail; 27 files; 3403 assertions | `/tmp/phase-18-final-focused.log` |
| `bun run typecheck` | pass | `/tmp/phase-18-final-typecheck.log` |
| `bun test` | 934 pass, 0 fail; 53 files; 6968 assertions | `/tmp/phase-18-final-tests.log` |
| `bun run format:check` | pass; 165 files | `/tmp/phase-18-final-format.log` |
| `bun run build:linux` | pass | `/tmp/phase-18-final-linux.log` |
| `bun run build:windows` | pass | `/tmp/phase-18-final-windows.log` |
| `bun run smoke:build` | pass | `/tmp/phase-18-final-smoke.log` |
| `bun run release:check` | pass; format/typecheck, 934 tests / 53 files / 6968 assertions, both builds, packaged smoke | `/tmp/phase-18-final-release.log` |
| `git diff --check`, `git diff --stat`, `git status --short --untracked-files=all`, complete diff review | pass; reviewed tracked diff and every new production boundary plus new regression suites | final structural audit below |

The focused suite explicitly includes SessionMemoryService/schema, updater, renderer/compiler, atomic store, RunAgentTurn memory/retrieval, SessionService/Reducer/JSONL, HistoryRetriever/HistoryTurns/index/embeddings, config/runtime, ModelSelection/resume/runtime, Ollama adapter and the nine-tool instruction/definition surface. It requires no live provider; controlled fakes/mocked transport determine semantic deltas regardless of environment. Full-suite increase over baseline: 109 tests in seven new memory test files.

Coverage includes all 30 requested memory scenarios: empty state; initial/persistent/replaced goal; accepted/superseded decisions; persistent/revoked constraints; reads/mutations/failed edits/moves/deletes; meaningful task transitions; unresolved/resolved problems; duplicate/capped state; corruption/resume/exact source boundaries; unchanged durable history; session isolation; budget/mandatory overflow/deterministic compaction; retrieval and fallback; update failure/cancellation/multi-round boundaries. Additional tests reject foreign/nonexistent/ambiguous/future/inconsistent provenance, invalid/unknown/oversized schema, fabricated file mutations, partial output and timeouts, invalid-delta partial application, late session/model changes, interrupted tool batches, activation races, unabortable delayed writes, compaction-hidden failures and legacy file anchors.

Actual production request capture proves one combined system message with memory once, exact active/previous/canonical retrieved payloads, all nine unchanged tools, charged memory cost, 16384/4096, safety 1024, and unchanged no-truncate/no-shift wire behavior. A real temporary filesystem/JSONL/restart integration verifies exact mutation activity and persisted source MessageIds coexist with Phase 17 retrieval.

Final structural audit:

- Durable JSONL, SessionService/SessionReducer, workspace tool contracts, HistoryRetriever/HistoryTurns/vector backend/index/EmbeddingPort, ModelSelection/preferences/picker/header, config inputs and TUI production files are unchanged. Memory never mutates conversation events or file contents. Historical Phase 1–17 records are unchanged.
- Separate current-session provenance/schema/store/updater/renderer boundaries; deterministic file ownership cannot be overridden by semantic extraction. No transcript/narrative summary, vector memory index, codebase RAG, cross-session sharing, new workspace tool, `/memory` command, panel or background worker. Optional inference is explicit at durable normal completion.
- One system message and the same compiler budget; exact active context and output/safety reserve precede memory. Current user/tool/workspace/conflicting canonical history precedence is rendered. Phase 17 thresholds (0.65 / top 8 / at most 3 selected), exact canonical payloads/dimension handling and nonfatal fallback remain unchanged. Embedding and semantic generation stay separate.
- Corruption/read/write/update failures are nonfatal. Cancellation, interrupted batches, denied/error turns, model/session selection changes, stale boundaries, duplicate identities and delayed writes have deterministic regressions. Collections and serialization are bounded with whole-entry eviction.
- Final HEAD remains `c0a0753f3978a93c9b74f0c95f0177e0a2d307a6`; index has no staged changes. `git diff --stat` covers 10 tracked files, 221 insertions / 59 deletions; 16 new source/test/progress files are separately reviewed because git does not include untracked files in that statistic. No commit made.
- No generated `.agent` memory/index/session artifact is in the changed/new-file set. The checkout has no `.agent/session-memory` directory after exact test-fixture cleanup; existing canonical session/model preference/index state was not deleted. Packaged artifacts are ignored build output.
- Gates were not repeated after the final progress-document-only updates; final whitespace/status checks suffice.

## Optional live smoke

**INCONCLUSIVE**. Exactly one real semantic operation, selected existing chat model `qwen3.5:9b` via unchanged ModelSelection and existing workspace preference. First sandboxed discovery could not connect to localhost (zero inference requests); the permitted localhost execution then performed the single bounded scenario. No downloads, model fallback, retry, prompt sweep, sampler tuning or matrix.

Disposable actual JSONL/session/reducer/tool workflow: scripted normal chat requested a real edit from `database=sqlite` to `database=postgresql` in `service.ts`; user evidence specified file-service goal, PostgreSQL, no TUI redesign, and pending integration tests. Real post-turn generation used ModelSessionMemoryUpdater → current ModelSelection → production Ollama adapter, with schema, no tools, 16384/1024 extraction profile and the unchanged 10-second production deadline. Ordinary scripted completion remained valid.

The optional update did not succeed at the bounded boundary: updater status failed, internal diagnostic `semantic-update-failed`, elapsed 10021 ms. No semantic state was accepted. The available harness records do not distinguish a provider stall from any generation/validation failure coinciding with the deadline; no additional diagnostic inference was attempted. Consequently live semantic quality and the subsequent real memory-bearing chat request are unconfirmed. Deterministic tests cover both contracts.

Real request counts: semantic 1, subsequent chat 0. Aggregate AbortSignal 25000 ms; external process limit 30000 ms (+2s kill grace). Fixture cleanup complete. Evidence: `/tmp/phase-18-live-smoke.ts`, `/tmp/phase-18-live-smoke.log`, `/tmp/phase-18-live-result.json`. No generated fixture/state entered the checkout or commit. Stop condition honored; smoke is closed.

## Final contract

| Item | Final value |
| --- | --- |
| Memory scope | current session |
| Memory authority | derived working state |
| Conversation source of truth | durable JSONL |
| Workspace source of truth | filesystem |
| Goal representation | single user-sourced objective; initial or explicit-replacement operation |
| Decisions | bounded keyed settled choices; user-sourced or assistant-reported derived claims |
| Constraints | bounded keyed persistent user requirements; evidence-backed supersession/removal |
| File activity | exact successful tool observations: read/modified/created/moved/deleted; historical metadata only |
| Completed | bounded meaningful task keys; matching pending/problems removed; assistant completion blocked by unresolved turn failures |
| Pending | bounded explicit task keys; completion/reopening transitions |
| Problems | bounded semantic unresolved tasks and exact application failures; resolved/replaced deterministically where possible |
| Update strategy | hybrid incremental exact projection plus one bounded post-turn semantic delta |
| Semantic updater | selected chat ModelPort, strict schema, <=12 operations; no embedding/memory model selection |
| Persistence | `.agent/session-memory/<sessionId>.json`, readable version 1, atomic replacement; durable derived artifact |
| Provenance | current-session durable MessageIds; exact terminal EventIds for observations; complete normalized event-prefix digest |
| Memory size cap | 1200 conservative estimated tokens plus category/text/provenance caps; JSON <=64 KiB |
| Model-facing representation | escaped compact category lines appended once to single configured system message; no IDs/hashes |
| Context priority | mandatory base/tools/exact active/output/safety > memory > exact previous when fitting > retrieved history |
| Retrieval relationship | complementary; exact canonical turns and separate binary index unchanged |
| Cross-session memory | not implemented |
| Background updates | not implemented |

**Rationale and overhead.** Deterministic events know tool outcomes/path changes but cannot reliably identify accepted free-form decisions and long-lived objectives. The selected hybrid preserves those exact facts and adds semantic categories through a separately validated delta. Deterministic-only semantic heuristics and an internal/tenth memory tool were rejected at the gate above. At most one extra model request per normal completed user turn; same selected chat model/context window, <=1024 output tokens, deadline 10 seconds, read/write caller deadlines 1 second each. No per-tool inference, model downloads, automatic retry, polling or workers. Every ordinary chat request retains 16384/4096 and the default 1024 safety reserve.

**Footprint.** Measured deterministic representative memory (goal + PostgreSQL decision + TUI constraint + pending integration tests): four items, 347 appended characters, 630 bytes of compact internal memory JSON. The full wrapper/escaping/rounding is charged through the Phase 16 estimator; with the default base prompt it costs exactly **120 estimated tokens**. The empty-base rendering costs 121; a request's base string can change rounding by one token. This is a fixture measurement, not a successful live semantic extraction or model-tokenizer count. Maximum state is capped; count/render tests enforce deterministic whole-entry reduction.

**Rebuild/corruption.** Missing, malformed, incompatible, foreign, mismatched-prefix or invalid-provenance memory is unavailable without breaking chat. Resume scans canonical events once for source validation and exact file/problem recovery. Valid semantic artifacts restore without inference; deterministic tail events catch up. Deleted/corrupt semantic notes are not inferred again from old history automatically. A later safe completed turn may introduce semantic notes from its own evidence. Removing memory never removes conversation events or workspace files.

**Supersession.** Semantic category/key replaces previous current values; duplicate same text/basis merges <=3 references. Basis/text changes replace obsolete source lists. Goal initial updates cannot overwrite an existing goal; explicit user replacement may. Constraints/choices remove by key with current evidence. Completing a task clears matching pending/semantic problems; pending/problem upserts reopen completed tasks. Exact file moves remove the source and track destination/from; deletes clear old move metadata. Later reads retain original mutation event/message anchors and fresh relevance. Matching successful tool outcomes clear their exact failures. Older entries age out by revision/key and lower-priority category when caps apply.

**Failure/cancellation.** Semantic/provider/schema/timeout/persistence failure remains internal and cannot rewrite JSONL or turn a completed response into an agent error. Failed, denied, interrupted, cancelled or unfinished tool rounds cannot invoke a successful semantic completion update. Exact already-committed file effects can remain known/rebuildable even if an unfinished tool batch is absent from canonical model history; they do not imply task completion. Independently retained changed-turn failures remain completion guards even when their display entries are compacted away. Session-generation/source/model fences reject late results. Publication ordering survives caller timeout until underlying writes settle; expired queued writes are skipped. An already-dispatched atomic rename is not rollbackable, and cross-process writers are outside the contract.

**Known limits.** Semantic quote checks prove source origin, not paraphrase entailment or actual acceptance; a schema-valid model can still misinterpret a choice/task/goal. All notes remain explicitly derived and subordinate to current evidence. Assistant implementation choices require a successful mutation but are still assistant-reported, not mechanically established architectural truth. Stable semantic keys and explicit goal changes depend on extractor interpretation. User evidence >6000 characters or final response >2000 skips semantic extraction; model/schema capability or a short configured context may also disable that turn's semantic update. No old semantic backfill, multi-process coordination, external-edit polling, authoritative file-state claims, cross-session profile or codebase RAG. Identity metadata maps grow with canonical event identities for provenance validation; stored/rendered semantic state stays bounded and contains no duplicated transcript. The single live operation was inconclusive; real-model semantic quality remains unconfirmed.

**Recommended next phase.** Evaluate semantic-update quality and completion latency against a fixed bounded corpus, and design explicit correction/recovery semantics if evidence warrants it. Preserve the provider-independent boundary, canonical ownership and existing context profile; cross-session memory remains a separate future feature.
