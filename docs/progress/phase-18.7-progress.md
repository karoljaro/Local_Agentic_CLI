# Phase 18.7 — semantic session-memory capability contract and production acceptance policy

## Status

verified

Status vocabulary: not started, in progress, policy evaluated, implementation complete, verified, inconclusive. This record was created before production changes. Historical progress records are read-only. Cross-model qualification is closed. This phase uses recorded evidence and deterministic checks only: zero live inference, embedding or catalog requests, model downloads or comparisons. No commit is authorized.

The audit, policy evaluation, durable documentation, narrow deterministic guard extension and required validation are complete. **Policy A — best effort** is verified against the existing architecture; production source changes are **none**. No required phase work remains. Verification establishes application/runtime boundaries, not universal extractor correctness.

## Baseline

- Starting HEAD: `20ca506bd55fa6cb666a0f4d034989aab4b3ebb0`.
- Starting `git status --short --untracked-files=all`: empty; clean checkout.
- Starting `git diff`: empty.
- Bun: **1.4.3**.
- No applicable `AGENTS.md` found in the workspace or its ancestor directories.
- ModelPort capability surface: only `streamChat(ModelChatInput)`; no feature flags, semantic suitability classification or capability negotiation. `responseSchema?` is an optional per-request structured-output contract, alongside the required context profile and optional tools/signal. Generic chunks report content, optional tools, finish reason and usage. The semantic caller requires a clean `stop`.
- Semantic-memory scheduling: `RunAgentTurn` durably commits its final assistant event, then calls `SessionMemoryService.schedule()` without awaiting extraction/publication. The service owns cancellation, immutable completed-prefix snapshots and at most one unresolved raw updater invocation. Later opportunities skip extraction while that raw call remains unresolved; no semantic backlog/retry/backfill. New turns, events, session/model changes, unload and disposal invalidate optional work.
- Semantic failure: clean completion/parse/schema/evidence/host errors and the 10000 ms deadline preserve previous semantic notes plus deterministic file/failure observations. Optional failures use internal diagnostics, never canonical chat errors. Cancelled/superseded work is discarded. Artifact reads/publications have separate 1000 ms bounds; missing/corrupt memory reconstructs exact observations from canonical events without semantic backfill.
- Model selection: Phase 15.5 `ModelSelection` owns configured override, remembered successful manual choice, sole-installed resolution and explicit switching. Catalog metadata has no semantic classification. Extraction uses the same selected `ModelPort`; semantic validation failures do not select, reject, persist or replace a model. Actual provider model-not-found/catalog disappearance can clear selection under the existing availability policy; this is independent of semantic quality and never silently substitutes a model.
- Effective deterministic configuration read (no provider request): context/output **16384/4096**, `OLLAMA_KEEP_ALIVE="0"`; semantic output **min(1024, configured output)**, production deadline **10000 ms**.
- Frozen instruction: **2180 characters**, SHA-256 `c151069875f441e574ddf172857dc9b7675cf24b8b2833277397ed0657deac03`. Frozen schema: **1956 JSON.stringify characters**, SHA-256 `623ac4855fe9441e0ad141596f08870006ce8a0c439e99796f3e82dcef978f3e`. Both equal Phase 18.6, checked without updater/provider execution.
- All **212 tracked files** hashed before implementation; baseline manifest: `/tmp/phase-18.7-baseline-integrity.json`.
- Focused deterministic baseline: **433 pass, 0 fail, 1963 assertions, 23 files**, exit 0, Bun **1095 ms**; `/tmp/phase-18.7-baseline-focused.log`. Inspected tests use scripted/deferred models/updaters and mocked fetch; no live calls.

Baseline command (also the final focused scope):

```bash
bun test src/application/services/SessionMemoryService.test.ts src/application/services/SessionMemoryLifecycle.test.ts src/application/services/ModelSessionMemoryUpdater.test.ts src/application/services/ContextBuilderMemory.test.ts src/application/use-cases/RunAgentTurnMemory.test.ts src/composition/createRuntimeMemory.test.ts src/infrastructure/persistence/JsonSessionMemoryStore.test.ts src/infrastructure/model/OllamaMemoryExtraction.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts src/composition/config.test.ts src/application/use-cases/RunAgentTurnToolRecovery.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/application/services/HistoryRetriever.test.ts src/application/services/ContextBuilderRetrieval.test.ts src/application/use-cases/RunAgentTurnRetrieval.test.ts src/composition/createRuntimeRetrieval.test.ts src/presentation/Conversation.test.ts src/application/services/ModelSelection.test.ts src/composition/model/ModelResume.test.ts src/composition/model/OllamaModelRuntime.test.ts src/infrastructure/model/OllamaModelCatalog.test.ts src/application/services/ContextBuilder.test.ts src/application/services/SessionReducer.test.ts > /tmp/phase-18.7-baseline-focused.log 2>&1
```

### Production audit — complete before implementation

Read the full authoritative Phase 18, 18.3, 18.4, 18.5 and 18.6 records. Consulted Phase 15.5 selection/availability, Phase 16 context authority, Phase 17 retrieval and Phase 18.1 final tool contracts only for protected boundaries. Inspected ModelPort/ModelChatInput/chunks, updater port, Ollama adapter/HTTP/stream/error mapping, catalog/selection/runtime/configuration, the full SessionMemoryService and schema, derived persistence, RunAgentTurn, createRuntime, ContextBuilder/renderer, SessionService/SessionReducer, lifecycle/update/context/persistence/selection tests and README/architecture documentation.

1. **Explicit capabilities?** No. ModelPort advertises the request and stream shapes, not a registry, structured-output bit or semantic capability flag. Only one concrete production inference adapter exists; ModelSelection/OllamaModelRuntime delegate to it. Scripted models are test support.
2. **Structured support assumed or detectable?** The caller supplies the optional field when structured output is required. Optionality permits ordinary chat to omit it; it does not negotiate provider support. Ollama maps it directly to `format`, forwards profile limits and cancellation, caps structured transport at 256000 characters, requires provider completion and closes its reader. No probe establishes grammar enforcement or semantic quality.
3. **Future port ignores/does not support responseSchema?** A rejected request, prose/malformed/invalid JSON, extra fields, non-stop/absent terminal, unexpected tools, oversized stream or timeout cannot publish a delta. Updater parsing and independent host validation remain authoritative even if a provider ignores the schema. A fully conforming result may pass these checks without proving native grammar enforcement. Ignored cancellation cannot publish late output or create additional optional backlog; physical provider cancellation is not guaranteed. No capability bit would enforce these mechanics or prove semantic entailment. No new API is justified today.
4. **Canonical chat correctness on semantic failure?** Unchanged: SessionService writes JSONL and applies SessionReducer before observers/handoff. Optional work cannot rewrite that transcript or turn its completed answer into an agent error. A canonical read/write/model error remains its own error, outside semantic fallback.
5. **Future exact-history correctness?** Unchanged: SessionReducer retains exact canonical messages, and ContextBuilder keeps the active/current chain exact. Empty/unavailable memory adds nothing; previous exact whole turns are included when they fit the existing budget and Phase 17 retrieves original canonical payloads, with Phase 16 recency fallback when retrieval is unavailable. No semantic publication is needed to continue. This is application/history integrity, not a guarantee that every later model answer is semantically correct or that all old turns fit.
6. **Any semantic model classification?** None. Catalog name/size/parameter/quantization metadata is availability/display data only. No model name, family or parameter size gates extraction. Ordinary provider absence/unsupported-chat handling is distinct from semantic suitability.
7. **Enough architecture without a registry?** Yes: optional updater port, strict structured parser, independent atomic host application, validated derived store, prefix/session/model/operation fencing and Phase 18.3 ownership already express best-effort policy. No concrete runtime mismatch or deterministic bug was found.

## Evidence synthesis

- [Phase 18.4](phase-18.4-progress.md): one generic instruction-only clarification was frozen before its final Qwen A–F evaluation; schema/host/atomicity/lifecycle/settings stayed unchanged. A established the goal but was too slow. B/E exhausted output; C/F were rejected atomically after existing-goal reissue (F also used an absent quote). D's redundant SQLite operation was host-accepted with an exact current quote that did not support its meaning, while the required restriction/blocker were omitted. Zero production-acceptable cases. No host-contract/schema/provenance bug was established; quote origin is not entailment.
- [Phase 18.5](phase-18.5-progress.md): the identical frozen contract/corpus with Gemma returned completed A/F deltas; F meaningfully completed and cleared matching pending/problem with two redundant removals. B/C/D/E exhausted 1024 output; fragments were not accepted/scored as completed operations. All six exceeded 10000 ms; zero production-acceptable cases. Historical **Outcome C — inconclusive capability comparison** remains unchanged, not rescored.
- [Phase 18.6](phase-18.6-progress.md): authoritative final **Outcome A — model capability is strongly implicated**. The same frozen generic contract behaved materially better with Ministral. All six outputs completed structurally, no output-limit failures and no unchanged-goal reissue; B accepted subordinate pending, C accepted SQLite under decisions and excluded Redis, F accepted meaningful completion and cleared pending/problem. A/B/C/F were semantically valid in the diagnostic run; only B/C were both valid and within the production 10000 ms bound. D was host-accepted and timely but omitted the constraint and recorded a supported blocker under a separate key instead of the established task key. E produced remove+upsert for the same decision target and an unsupported unrelated problem removal; the entire delta was rejected. Seven accepted operations had supporting evidence; E's unsupported removal never reached host validation after the earlier duplicate-target conflict. This does not create an entailment guarantee. D/E remain unfulfilled requirements.
- The Phase 18.6 raw harness host/timing flag for D is not semantic success. Qualification timing and runtime host acceptance are separate from actual semantic validity. Six isolated fixtures do not establish universal correctness, statistical reliability or end-to-end self-generated key stability.
- Preserve **Direction 1 — current design retained**, no automatic default-model recommendation/change and permanently closed cross-model qualification. This evidence does not declare Ministral officially supported or Qwen/Gemma unsupported. Model-specific evidence stays in progress records, not generic product policy.

## Capability taxonomy

| Concept | Final definition |
| --- | --- |
| Mechanical provider capability | Honor the structured request/profile/cancellation/terminal stream contract used by the updater, or report inability as an optional-operation failure. This describes transport, not model understanding. No new capability API or probe. |
| Semantic model suitability | Empirical reliability of a model/configuration in following the generic minimal, bounded, evidence-supported delta contract, including stable keys, compound changes, coherent reversal and completion. No name-based class, numeric score or universal guarantee. |
| Individual update accepted | This completed request independently passes clean-stop/size/JSON/schema, current evidence/role/goal/target/host rules, provenance and current ownership fences, then atomically publishes within the existing I/O boundary. Acceptance does not establish arbitrary semantic entailment or qualify its model. |
| Application correctness without semantic memory | Durable canonical events and SessionReducer remain authoritative; exact active/current history and deterministic projections remain usable, with budgeted exact previous/retrieved history. Optional failure cannot invalidate a completed conversation. Ordinary canonical/provider/context errors retain their own behavior. |

Semantic expectations include unchanged goal → `goal:null`, absence-only initial establishment, explicit user-supported objective replacement, no unchanged-state restatement, settled choices as decisions, persistent user restrictions as constraints, proposal exclusion, stable category/task keys, one operation per category/key, coherent replacements/reversals, explicit pending/unresolved problems, meaningful completion and matching clearing, actually supporting evidence, and completion within the fixed output/deadline envelope.

**Compound change (D):** extract independent durable restrictions and unresolved blockers in the same turn; attach a blocker belonging to an established task to that task's key across pending/problems/completed. No fuzzy host key merging.

**Replacement/reversal (E):** replace an existing decision with one same-key upsert; remove a revoked restriction under its existing key. Remove+upsert on the same category/key is conflicting and rejects the whole delta. Preserve unrelated problems unless evidence supports their resolution. No corpus-specific prompt additions or host relaxation.

## Candidate policies

| Candidate | Decision and reasoning |
| --- | --- |
| A — best effort for mechanically compatible selected ports | **Selected.** Existing optional lifecycle, independent strict validation and safe exact/deterministic fallback contain observable failures. Generic and compatible with future models/providers; unknown suitability does not prevent chat. Weak extractors may spend optional compute without benefit; this cost does not require new correctness machinery. |
| B — hardcoded model allowlist | **Rejected.** Bounded qualification does not establish official per-name support. Name/family/parameter checks would be stale identity heuristics, outside the generic architecture. No extraordinary requirement exists. |
| C — persisted qualification registry | **Rejected.** No qualification owner, immutable version/digest/quantization identity or invalidation protocol exists. Prompt/schema/configuration changes would require requalification; mutable tags and stale records could imply false confidence. Six cases are insufficient for a durable capability grant. It adds operations without strengthening per-update correctness. Offline records can inform operator choice without runtime state. |
| D — dynamic circuit breaker | **Rejected.** No independently established production need. Thresholds/reset/session/model semantics add hidden state, transient failures can suppress useful extraction, and host-accepted semantic mistakes evade such counting. Phase 18.3 already releases turns, bounds idle work and prevents backlog. Existing unresolved-call suppression is ownership/resource containment, not a quality/failure-count circuit breaker. |
| Mechanical capability bit | **Not needed.** One concrete production adapter maps the supplied schema; absent/inadequate output already fails safely. A declaration cannot prove enforcement, cancellation or semantic quality. Define the port expectation in documentation without speculative negotiation/types. |

Policy evaluation is complete before documentation/test implementation. Runtime source remains unchanged. One existing mocked runtime failure test lacks a direct assertion that failed semantic extraction preserves selected-model ownership and next-turn routing/history; extend that test narrowly. Existing tests already protect the other failure, cancellation, atomicity, authority and fallback invariants, so no new test suite or stochastic-quality assertion is needed.

## Production changes

**No production source changes.** The runtime already matched Policy A; no deterministic implementation bug required correction. No prompt/schema/host/configuration/lifecycle/provider change.

Exact repository changes:

- [docs/ARCHITECTURE.md](../ARCHITECTURE.md#semantic-session-memory-contract): durable generic capability/authority/mechanical/suitability/acceptance/fallback/selection/qualification contract. Includes compound-change and coherent-reversal expectations and origin-versus-entailment limits. Corrects the existing ContextBuilder budget description and SessionService owner name to the audited current implementation; adds memory services to the existing application inventory. No concrete evaluation model names in this document.
- [README.md](../../README.md): short model-independent suitability/acceptance explanation and link to the durable contract.
- [createRuntimeMemory.test.ts](../../src/composition/createRuntimeMemory.test.ts): extends the existing mocked malformed-extraction test with selected-model retention, successful next ordinary turn using exact prior/current messages, unchanged historical prompt model IDs, and identical selected routing for all ordinary/semantic requests. Two optional failures remain two independent opportunities, with no hidden switch/route. No new test case/suite or quality assertion; **9 additional assertions**, unchanged test count.
- This new progress record: baseline, full evidence synthesis, completed audit, taxonomy, policy alternatives, exact changes and deterministic/structural validation. All historical progress records remain read-only.

## Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Baseline focused deterministic scope | **433 pass, 0 fail, 1963 assertions, 23 files**, exit 0, Bun 1095 ms | `/tmp/phase-18.7-baseline-focused.log` |
| Final same focused scope | **433 pass, 0 fail, 1972 assertions, 23 files**, exit 0, Bun 1210 ms | `/tmp/phase-18.7-final-focused.log` |
| `bun run typecheck` | pass, exit 0 | `/tmp/phase-18.7-final-typecheck.log` |
| `bun run format:check` | pass, exit 0; **167 files**, no fixes | `/tmp/phase-18.7-final-format.log` |
| Tracked source/history/HEAD/index integrity | **89 production source files and 25 historical progress records byte-unchanged**; only README, architecture and the existing test differ among 212 baseline tracked files; HEAD unchanged, empty index diff | `/tmp/phase-18.7-final-integrity.json` |
| Frozen instruction/schema and effective configuration | exact Phase 18.6 hashes; context/output 16384/4096, keep-alive 0; zero provider/updater execution for hash/config read | deterministic static/configuration audit above |
| Complete tracked diff review | only two documentation edits and one extended deterministic test | `git diff -- README.md docs/ARCHITECTURE.md src/composition/createRuntimeMemory.test.ts` |
| `git diff --check` | pass, exit 0; no diagnostics | final whitespace review |
| New-record `git diff --no-index --check /dev/null docs/progress/phase-18.7-progress.md` | no whitespace diagnostics; exit 1 is expected new-file difference | final whitespace review |
| Markdown local links/contract anchor/final newlines/trailing whitespace | pass; all required sections present, no unresolved local links | `/tmp/phase-18.7-doc-review.json` |
| Static production identity/routing scan | no model-specific names/semantic branches or forbidden routing/capability APIs | production-only `rg`, excluding tests |
| `git diff --stat` / `git status --short --untracked-files=all` / index | three tracked files, **171 insertions / 6 deletions**, plus this one new record; exact intended four paths, no staging | final structural review |

All focused provider/catalog/embedding behavior is scripted or mocked, with disposable test storage. No real inference/embedding/catalog request, download, previous-model rerun, alternate/fourth-model test or live confirmation. No Linux/Windows/build/smoke/full-release reruns: production source is unchanged, and the required documentation/test-only gates above pass.

### Policy invariants and existing deterministic protection

| Invariant | Deterministic protection in the passing focused scope |
| --- | --- |
| Canonical transcript and successful answer survive extraction failure | RunAgentTurnMemory failure isolation; OllamaMemoryExtraction HTTP/body/partial/transport failures; extended createRuntimeMemory malformed result |
| Turn releases while extraction is unresolved; next exact history works | RunAgentTurnMemory deferred Conversation/next-submit test; durable-final-before-handoff; denial deterministic-publication handoff |
| Production timeout is nonfatal | SessionMemoryLifecycle injected **10000 ms** deadline, no real-clock wait; SessionMemoryService timeout fallback |
| Malformed/schema-invalid/host-rejected result is nonfatal and atomic | ModelSessionMemoryUpdater invalid/partial/length/oversize/tool cases; SessionMemoryService schema/evidence/reserved/goal conflicts; scheduled whole-delta rejection |
| Cancelled/superseded late work cannot update current state | SessionMemoryLifecycle prefix/model/session A→B→A, ignored abort, ordered publication and disposal; createRuntimeMemory cancellation before interactive/model/session/unload/dispose |
| Absent/corrupt memory preserves exact context and recoverable observations | ContextBuilderMemory empty-memory equality and mandatory-active precedence; SessionMemoryService missing/corrupt/provenance restore; JsonSessionMemoryStore integrity |
| Semantic failure preserves model selection and current/historical routing | Extended createRuntimeMemory test through real composition/adapter/store and mocked provider; ModelSelection transport retention, ordinary disappearance behavior and resume tests |
| No dedicated model route or model-specific semantics | Updater selected-port/no-tools/profile tests; configuration no hidden routing; actual runtime wire route assertions; static production scan |
| responseSchema is mapped and independently validated | OllamaModelAdapter format/terminal/cancellation/transport tests; scripted ModelPort returns untrusted invalid output without grammar enforcement and updater/host reject it |
| Retrieval/tools retain protected behavior | HistoryRetriever/ContextBuilderRetrieval/RunAgentTurnRetrieval/createRuntimeRetrieval; ToolDefinitions/RunAgentTurnToolRecovery; all unchanged |

## Final policy

**Policy A — semantic session memory is optional best-effort derived state.** Any otherwise selectable installed model remains usable for normal application operation, regardless of unknown or weak semantic suitability. Extraction may opportunistically use the selected mechanically compatible ModelPort. Every update must independently pass the unchanged strict request/schema/evidence/host/provenance/ownership/atomic-publication boundary. Failure or absence uses prior valid notes where available plus deterministic projections and exact canonical context; conversation acceptance/continuation does not depend on memory freshness or on ever having published semantic notes.

Mechanical schema transport and semantic suitability are different properties. Individual host acceptance is a third property; it does not establish model suitability or arbitrary natural-language entailment. Normal application support remains independent of semantic quality. Actual provider/model absence keeps Phase 15.5 availability handling, without silent replacement. No capability flag/registry, model allowlist, failure-count circuit breaker, dedicated memory route, numeric score, UI or entailment subsystem is justified.

### Exact acceptance boundary

- Safe completed-turn eligibility, immutable matching current-user/final evidence and bounded preflight; extraction uses the same selected model, whose identity is checked before and after its stream.
- Clean terminal `stop`, no tool calls/other finish reason; <=16000 response characters, valid JSON and strict version-1 delta (nullable required goal, <=12 changes, bounded text/key/quote/ID, strict nested objects). Host parses again independently.
- Exact quote exists in the supplied unambiguous current-turn source ID. Source role sets basis. Goal/constraints require user evidence; initial cannot overwrite existing goal. Assistant decisions require confirmed changed-turn mutation and zero unresolved turn failures; assistant completion requires zero unresolved turn failures. These guards also apply to the respective category removals where implemented.
- One operation per category/key; reserved tool-/agent- identities and deterministic problems cannot be changed semantically; files cannot be emitted. Completed upsert clears matching pending/semantic problems, pending/problem upsert reopens completed. Any invalid operation rejects the entire delta, retaining its pre-delta state plus exact projected observations.
- Compact document schema/provenance and updater-version metadata remain valid; selected session, activation generation, exact prefix digest and uncancelled operation still own publication. Model changes cancel that owner, including A→B→A. Atomic persistence succeeds before owned in-memory semantic replacement. Existing publication tails retain order beyond caller timeout; an already-dispatched rename may finish only under its correctly labeled old prefix, with no rollback promise.

An exact quote proves origin, not that its meaning entails an operation. Stable task identity, explicit objective replacement, accepted choices/proposal exclusion, compound-change completeness and unrelated-problem resolution remain extractor behavioral obligations; host validation cannot prove them generally. No accepted-result statistic or durable model qualification is inferred from the frozen corpus.

### Failure policy

| Condition | Production behavior |
| --- | --- |
| 10000 ms extraction timeout | Reject optional result; bounded owner settles nonfatally; keep prior semantic state and deterministic projection. Raw ignoring invocation still occupies its one slot until settlement. |
| Output limit/non-stop/missing terminal/tool output/oversized response | Reject before semantic application; no partial parse repair, retry or accepted fragment. |
| Malformed JSON/schema-invalid result | Reject the whole result; no semantic claims published. |
| Invalid evidence/roles/goals/targets/reserved state or host rejection | Atomic delta rejection; earlier apparently valid operations in that delta are discarded too. |
| Cancellation/supersession/model/session change/disposal | Abort owned work and discard late extraction; new interactive work does not wait; already-dispatched atomic I/O retains its actual prefix/order. |
| No updater/no published semantic state/unavailable or invalid artifact | No semantic section when empty; reconstruct exact observations from canonical events, use reducer-owned exact current context and existing previous/retrieval selection. No historical semantic backfill. |
| Publication failure | No owned in-memory semantic replacement; prior semantic state/current exact effects remain. Existing internal diagnostic only. |

These conditions do not append a canonical chat error, rewrite events or switch models because of semantic quality. Genuine canonical/model/storage/context failures remain independent. Weak models may produce no semantic benefit; that is an operational consideration, not a normal-chat rejection policy.

### Structural review

- Canonical JSONL/SessionService ownership and SessionReducer are byte-unchanged. Semantic memory remains separate derived state; current user/workspace/tool/conflicting exact history outrank notes and mandatory active history has budget precedence.
- Phase 18.3 scheduler owner, interactive cancellation, supersession, one unresolved invocation, zero backlog, immediate release and disposal are byte-unchanged. No worker/queue/task manager/process-global capability map is added.
- Phase 17 retrieval, independent embedding model/configuration/index, **0.65 / top8 / max3** remain byte-unchanged. Phase 18.1 nine tools/ToolRunner/preparation/recovery/approvals and Phase 15.5 selection/preferences/truthful historical IDs remain byte-unchanged.
- Semantic instruction/schema/host/evidence/key/output/deadline/keep-alive are unchanged. No corpus examples enter the prompt; D/E are generic documented expectations only.
- Production contains no Qwen/Gemma/Ministral semantic branch, name/family/parameter allowlist, qualification registry, circuit breaker, dedicated MEMORY_MODEL/SEMANTIC_MODEL/MEMORY_PROVIDER, score/health badge/telemetry subsystem, entailment checker or capability UI. Static source scan and byte identity confirm this.
- Cross-model qualification remains closed: **0 live inference requests**, **0 live embeddings/catalog reads**, **0 downloads/model comparisons**, no fourth-model evaluation. No automatic default/model/preference change, staging or commit.

### Final summary table

| Item | Final value |
| --- | --- |
| semantic memory authority | optional derived notes; canonical events/exact current evidence override memory |
| mechanical capability | structured request/profile/cancellation/terminal contract; no new ModelPort API |
| semantic suitability | empirical generic minimal-delta/evidence/key/transition/bounded-completion behavior; no identity class |
| individual update acceptance | independently valid whole delta plus provenance/current ownership and atomic publication; no entailment guarantee |
| production policy | A — best effort through the selected mechanically compatible port |
| unknown model suitability | otherwise selectable installed model remains usable; optional extraction may yield no benefit |
| semantic failure | nonfatal prior-state/deterministic/exact fallback; cancelled obsolete extraction discarded |
| model selection on memory failure | retained for semantic-quality failures; no switch/replacement; ordinary actual absence handling preserved |
| hardcoded allowlist | no |
| qualification registry | no |
| runtime circuit breaker | no; unchanged unresolved-invocation suppression is lifecycle containment |
| dedicated MEMORY_MODEL | no |
| entailment checker | no |
| capability UI | no |
| D compound-change requirement | capture independent restriction/blocker; reuse established task key |
| E reversal requirement | one same-key decision upsert; existing-key revocation; no duplicate target or unrelated problem removal |
| production deadline | 10000 ms unchanged |
| semantic output cap | 1024 unchanged; lower configured output still honored |
| OLLAMA_KEEP_ALIVE | 0 unchanged |
| Phase 18.3 lifecycle changes | none |
| Phase 17 retrieval changes | none |
| Phase 18.1 tool changes | none |
| model-specific production logic | none |
| live inference requests | 0 |
| production source changes | none; two existing docs updated, one existing deterministic test extended, this progress record added |

Final HEAD remains `20ca506bd55fa6cb666a0f4d034989aab4b3ebb0`. The complete tracked diff and this entire new record were reviewed; final record-only edits receive repeated whitespace/link/status/integrity checks without repeating successful tests/typecheck/format. No production source, historical record, environment/configuration, dependency, default-model or preference-policy change; no staging or commit. Zero live inference requests throughout Phase 18.7.
