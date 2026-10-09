# Phase 16 — provider-independent context budgeting and bounded Context Compiler

## Status

verified

Status vocabulary: not started → in progress → blocked (if necessary) → implementation complete → verified. No commit is requested. This phase begins in the fresh execution thread `01a12155-7fa6-7203-99b4-a6f43e8ca903`; no Phase 15 experiments are resumed or agents delegated. The execution interface offers no session/reasoning-setting mutation; the requested reasoning depth is used for this work.

## Baseline

- Starting HEAD: `9c6c5c2c4086efc9d35e5877bcc34c5917b1dd7b`.
- Starting `git status --short --untracked-files=all` and `git diff`: empty; clean worktree.
- Bun: `1.4.2`. No repository or ancestor `AGENTS.md` found.
- Read Phase 15 and 15.5 first, then Phase 7 (canonical model history), Phase 8 (linear exact character sizing), Phase 10 (composition-owned defaults), and relevant Phase 1/2 request/cancellation records.
- Effective configuration: `OLLAMA_BASE_URL=http://localhost:11434`, optional `OLLAMA_MODEL` unset, `OLLAMA_KEEP_ALIVE=0`, `SYSTEM_PROMPT=Use workspace-relative paths.`, `MAX_CONTEXT_CHARACTERS=120000`. Explicit live input `TEST_MODEL=qwen3.5:9b` is present. No model download/default change is authorized.
- `ContextBuilder` prepends one system instruction to canonical reducer messages. It groups at user boundaries, always retains the latest turn, and adds whole older turns in reverse recency until the first non-fitting turn. It measures exact serialized UTF-16 message characters, including application IDs. Tools are absent from that measure. There is no token/output reservation or provider-window contract.
- `ModelChatInput`: messages, optional tools, optional abort signal. `ModelStreamChunk`: text delta and optional tool calls. No context profile, usage, or finish reason.
- Ollama chat body: model, mapped messages, optional keep-alive, optional mapped tools, `stream: true`. No per-request context/output options. Completion parser checks `done` but discards `done_reason` and usage counters.
- Baseline `bun run release:check > /tmp/phase-16-baseline-release.log 2>&1`: exit 1. Format passes (132 files); typecheck fails in `InstructionSurface.test.ts:56` because Phase 15.5 made the configured model optional but this deterministic fixture passes it directly to the adapter. Baseline `bun test > /tmp/phase-16-baseline-tests.log 2>&1`: exit 1, 607 pass / 5 fail / 5,943 assertions / 612 tests across 38 files. Three failures are this unset model fixture, two are stale pre-Phase-15 system-prompt expectations in composition tests. Migrate these fixtures to the synthetic model/current instruction contract; no model-selection change.
- Created this record before production edits.

### MAX_CONTEXT_CHARACTERS inventory

All repository references were located with `rg -n 'MAX_CONTEXT_CHARACTERS|maxContextCharacters' --hidden -g '!node_modules' -g '!.git' -g '!dist'`.

| Occurrences | Baseline classification | Phase 16 treatment |
| --- | --- | --- |
| `config.ts`, `createRuntime.ts`, `ContextBuilder.ts` | Actual competing model-input authority and overflow guard | Replace with one token profile; remove character authority |
| `config.test.ts`, `createRuntime.test.ts`, `ContextBuilder.test.ts`, `RunAgentTurn.test.ts`, `Conversation.test.ts`, `InstructionSurface.test.ts` | Character fixtures/exact-character contract tests | Migrate to token profiles and estimated-budget assertions while preserving lifecycle/replay coverage |
| README and `.env.example` | Current configuration documentation | Replace with `MODEL_CONTEXT_TOKENS` and `MODEL_MAX_OUTPUT_TOKENS` |
| Phase 10/15/15.5 progress, July audit, simplification plan | Historical records of the old contract | Preserve; no executable authority or compatibility alias |

## Observed failure

The reported real request had 4,066 provider prompt tokens in a 4,096-token window, leaving approximately 30 tokens for generation. The provider ended at the boundary/truncated output. The application budgeted messages in characters, omitted the fixed tool surface, reserved no output, and let daemon defaults define the actual window. Increasing the daemon window alone would leave the ownership mismatch unresolved. The deterministic regression must prove preflight reservation and explicit request mapping instead.

## Existing context pipeline

Durable JSONL events → `SessionService` selected-session ownership → incremental `SessionReducer`/`AgentStateReducer` → canonical `AgentState.messages` → `ContextBuilder.build` → `RunAgentTurn` → `ModelPort`/currently resolved `ModelSelection` adapter → `OllamaModelAdapter` mapper → `OllamaHttpClient.postJson` → provider.

Every tool round rereads canonical committed state. Reducer owns batch ordering, normalized calls, corresponding terminal results, failed-result serialization and interrupted-batch exclusion. Compiler selection must never replay events, mutate the reducer, or persist its chosen suffix. Presentation transcript/replay and historical model IDs remain untouched. ModelSelection continues to choose runtime model IDs independently of history.

## Proposed context contract

Recorded before broad implementation:

- Evolve `ContextBuilder` in place into the bounded compiler; a rename/wrapper provides no additional responsibility. It accepts canonical state plus the exact fixed tool definitions, configured system text and one immutable provider-independent `ModelContextProfile`.
- Profile fields: `contextWindowTokens`, `maxOutputTokens`. Defaults exist only in composition config: 16,384 / 4,096. Positive safe integers; output strictly below total. Blank env uses defaults; invalid values fail clearly. No character compatibility conversion.
- Compile exact messages/tools plus profile and internal diagnostics. Mandatory system/tools/latest user turn must fit the estimated input limit before invoking the provider. Preflight includes tools even before persisting a newly submitted prompt; subsequent tool-result overflow uses existing `CONTEXT_BUDGET_EXCEEDED` error presentation.
- Output reservation is fixed at the profile maximum. Older completed turns lose first. No truncation, summarization, retrieval, or state mutation.
- `ModelChatInput` requires the resolved profile; adapter maps that very request value to provider options on every inference round. Model selection/activation/unload policy is unchanged.
- Add minimal generic final metadata (`finishReason`, prompt/output usage). Detectable length exhaustion fails the turn, without persisting a clean completed assistant answer or executing partial tool calls. Unknown reason remains unknown; missing stream completion remains an error.

## Sizing strategy

There is no tokenizer in the dependency graph (`zod`, OpenTUI, ripgrep only) or ModelPort. Supported Ollama chat exposes post-response counts, not a clean public model-aligned pre-request tokenizer. No tokenizer dependency, per-round tokenization network call, private endpoint, or adaptive calibration will be added.

Intended conservative estimator: serialize only generic model-visible message fields (role/content, call names/arguments, tool name) and definition fields (name/description/parameters), excluding application IDs and approval/cache metadata. For each serialized structure estimate `ceil(ASCII UTF-8 bytes / 3) + non-ASCII UTF-8 bytes`; count non-ASCII bytes at one estimated token each to avoid the usual English-only character heuristic. Add 16 estimated framing tokens per message/tool and 32 per request. JSON escaping and structured payloads participate. These are estimates, never exact tokenizer counts or a mathematical guarantee for arbitrary model tokenizers.

Safety reserve: `max(128, ceil(contextWindowTokens / 16))` tokens, separate from the estimator's framing allowances. Default 1,024 (6.25% of the total); override 8,192 gives 512. Default theoretical input ceiling 12,288; estimated-input ceiling after safety 11,264. This protects output headroom and provider templates without consuming a huge fixed fraction. Unusual templates/tokenizers remain a documented limitation.

- **Exact:** selected text, structured calls/results and unchanged definitions; serialized UTF-8 byte measurements and selection counts.
- **Estimated:** fixed/system/tool cost, active/selected history cost, input tokens and remaining margin.
- **Provider-reported:** optional prompt/output token counts from final responses; diagnostics only, no feedback loop.
- **Safety:** independent reserved allowance above, never used to retain history.

## Selection algorithm

Group canonical conversation messages at each user message, preserving the established leading legacy group behavior. Mandatory latest group includes every assistant continuation, call and result across tool rounds. Size mandatory system/tools/current group first. Fail if it cannot fit with safety plus full output reservation. Consider immediately previous groups newest-first; add a whole group if it fits, stop at the first that does not. Return the selected contiguous suffix chronologically with one configured system message. No skipping, splitting, rewriting, selective result removal, or durable deletion. Linear grouping and reverse numerical accumulation; serialize each considered structure once per compile, never an expanding candidate request.

## Request profile

`readConfig` → composition constructs validated immutable profile → ContextBuilder budgeting → each `ModelChatInput.contextProfile` → infrastructure-only Ollama `options.num_ctx`/`options.num_predict`. Default 16,384 / 4,096, override tested at 8,192 / 2,048. No daemon/Modelfile requirement. All nine tools remain in every production round.

Provider metadata audit uses the [official chat API](https://docs.ollama.com/api/chat) and [upstream API types](https://github.com/ollama/ollama/blob/main/api/types.go); `done_reason`, `prompt_eval_count` and `eval_count` will be mapped generically. [Upstream prompt handling](https://github.com/ollama/ollama/blob/main/server/prompt.go) trims messages by default. Set supported chat fields `truncate: false`, `shift: false` in infrastructure to request truthful overflow instead of provider history removal/context shifting. No additional product knobs or tokenization endpoint.

## Validation

Baseline release result above. Deterministic tests use only synthetic model IDs.

- Added the default output/window regression before production edits: `bun test src/composition/config.test.ts > /tmp/phase-16-regression-before.log 2>&1` — expected failure, 7 pass / 1 fail / 11 assertions. Missing 16,384/4,096 fields reproduced the absent profile contract.
- Implemented one validated immutable profile, conservative visible-structure estimator, request-local complete-turn selection and diagnostics. Compiler is the evolved ContextBuilder; SessionReducer/SessionService and ModelSelection production code are unchanged.
- RunAgentTurn now supplies fixed tools to initial prompt preflight and each canonical build. Each request carries the same compiler profile. Mandatory overflow keeps existing preflight/persistence boundaries; post-tool overflow commits no clean answer. Length completion raises `MODEL_OUTPUT_TRUNCATED` through existing error mechanisms, with no partial call execution.
- Ollama maps profile to explicit options each inference request, disables input truncation/context shifting, and forwards final generic reason/valid prompt/output counts (including metadata-only terminal frames). Missing reason is left unavailable, unknown provider strings map to `unknown`; no invented stop reason or adaptive behavior.
- Replaced obsolete exact-character compiler tests with the token estimate/whole-turn contract, retaining linear traversal checks, no history serialization beyond cutoff, exact Unicode/escaping payload checks, current failures and multi-call recovery. All existing request-boundary/replay/cancellation/prepared execution regressions remain. Migrated deterministic fixtures and fixed the baseline stale instruction/unset-model fixture errors.
- Initial focused migration: 184 pass / 4 fail / 1,473 assertions / 188 tests in 8 files; failures were profile expectation additions, a custom-system fixture that still fit, and an obsolete character cutoff. Second focused run: 187 pass / 1 fail / 1,696 assertions; calibrated the small test profile against the new estimator to preserve its first-round/post-tool cutoff assertion. These are fixture migrations, not live model experiments.
- Expanded focused run: `bun test src/application/services/ContextBuilder.test.ts src/application/use-cases/RunAgentTurn.test.ts src/composition/config.test.ts src/composition/createRuntime.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts src/infrastructure/model/InstructionSurface.test.ts src/application/services/ModelSelection.test.ts src/composition/model/OllamaModelRuntime.test.ts src/composition/model/ModelResume.test.ts src/application/services/SessionReducer.test.ts > /tmp/phase-16-focused-4.log 2>&1` — 232 pass / 0 fail / 1,990 assertions / 10 files. Follow-up typecheck caught a prepared-tool fixture field typo; strengthened the capture with exact success-result/no-failure assertions while correcting it before final gates.
- Actual JSONL resume coverage preserves the original serialized event-file prefix and all 80 prior canonical messages after restarting ownership, while the model gets fewer messages and the exact current prompt. Fresh replay remains complete after the new answer.

Final focused command is the same expanded 10-file command above with output `/tmp/phase-16-focused-final.log`: **234 pass / 0 fail / 2,005 assertions / 10 files**. It includes the stronger exact successful tool-result capture and estimated equality/one-token-over safety boundary cases. No production/test/script edits followed the final gates below.

| Final command/check | Result | Evidence |
| --- | --- | --- |
| `bun run typecheck` | pass, exit 0 | `/tmp/phase-16-final-typecheck.log` |
| `bun test` | pass, exit 0; 632 tests, 0 failures, 5,920 assertions across 38 files | `/tmp/phase-16-final-tests.log` |
| `bun run format:check` | pass, exit 0; 135 files, no fixes | `/tmp/phase-16-final-format.log` |
| `bun run build:linux` | pass, exit 0 | `/tmp/phase-16-final-linux.log` |
| `bun run build:windows` | pass, exit 0; locked native dependencies/compiler already available | `/tmp/phase-16-final-windows.log` |
| `bun run smoke:build` | pass, exit 0; existing packaged artifact/terminal/ripgrep checks | `/tmp/phase-16-final-build-smoke.log` |
| `bun run release:check` | pass, exit 0; format/typecheck, same 632 tests / 5,920 assertions / 38 files, both builds and packaged smoke | `/tmp/phase-16-final-release.log` |
| `git diff --check` | pass, exit 0 | final review |
| `git diff --stat` | reviewed; 20 tracked changed files, 1,212 insertions / 718 deletions; excludes 4 new files | final review |
| `git status --short --untracked-files=all` | reviewed; same 20 tracked files + new progress record, smoke script, estimator and profile | final review |
| `git diff --no-index --check /dev/null <new-file>` for all 4 new files | no whitespace diagnostics; exit 1 is the expected new-file difference | final new-file review |
| `git rev-parse HEAD`, `git diff --cached --stat` | starting HEAD unchanged; nothing staged | final review |
| Protected-file `git diff --exit-code` | pass, exit 0; prior progress records, SessionReducer/SessionService, ModelSelection, tools/filesystem, picker/conversation production, dependencies/lockfile unchanged | structural review |
| Fixed-surface reconciliation through actual mapper | 29 system-content characters + 4,211 serialized tool characters = 4,240; 9 definitions unchanged. Estimated fixed request cost 1,522 tokens includes generic structure/request framing | capture-only local inspection, no provider request |

Coverage includes all requested categories: short/long exact history, fixed nine-tool cost, large old/current reads, initial/post-tool mandatory overflow with no next provider call, multi-call active batches, failed results, production stale edit/reread/retry, system override, 8,192/2,048 compiler/wire override, invalid config/profile, JSONL resume without durable trimming, and unchanged Phase 15.5 model-selection/resume lifecycle. Captured composition tests traverse the real config/runtime/service/reducer/compiler/loop/ModelSelection/adapter/HTTP serializer, using synthetic responses and prepared read-output fixtures. Their three rounds assert one system, nine definitions, exact growing current chain, ordered success results, bounded recent suffix, unchanged durable prefix, stable profile identity and actual per-request options. Existing stale-edit capture additionally runs the real filesystem executor through five rounds and preserves each failure/recovery prefix.

The full suite grows from 612 baseline tests (including 5 pre-existing fixture failures) to 632 passing tests. Obsolete exact-character tests were replaced by the new estimator/selection contract; existing loop/replay/selection/tool/TUI lifecycle coverage remains. No model IDs from environment enter deterministic fixtures. Packaged smoke does not claim native Windows execution or an interactive TUI session. Only progress-document edits occur after the passing gates, so expensive gates are not rerun for them.

## Real-model smoke

Exactly one optional live sequence completed, exit 0:

`bun run scripts/smoke-context.ts > /tmp/phase-16-ollama-smoke.log 2>&1`

Explicit environment input: `TEST_MODEL=qwen3.5:9b`, already installed. One catalog check, then one disposable read-only workflow: user → native `read_file(smoke.conf)` → exact `answer=42\n` result → model final answer containing 42. Two inference requests, all nine tools each round, default profile 16,384/4,096, one 45-second aggregate abort deadline. No downloads, retries, sampler tuning, activation experiment, long-history request or benchmark matrix. Localhost execution used the tool's sandbox escalation; no product permissions/lifecycle changes. Temporary fixture state was cleaned.

| Round | Estimated fixed tokens | Estimated active tokens | Estimated input tokens | Provider-reported prompt tokens | Provider-reported output tokens | Provider reason |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| First request | 1,522 | 63 | 1,585 | 1,176 | 100 | stop |
| After exact read result | 1,522 | 214 | 1,736 | 1,316 | 38 | stop |

This is one recorded estimator/provider comparison, not adaptive calibration or performance evidence. Counts include each model's rendered framing; no isolated exact system/tool token count is claimed. Explicit context/output options were accepted, both provider totals were far below the configured window, and no length exhaustion occurred. The live sequence is closed; no additional request will be run.

## Final contract

| Item | Final value |
| --- | --- |
| Context window | 16384 tokens |
| Max output reservation | 4096 tokens |
| Theoretical input ceiling | 12288 tokens |
| Sizing method | Conservative generic model-visible JSON/UTF-8 estimate: ceil(ASCII bytes / 3) + non-ASCII bytes, per structure |
| Safety allowance | 1024 tokens by default; max(128, ceil(window / 16)), plus estimated 16/message or tool and 32/request framing |
| Fixed tools | 9 |
| Historical policy | newest complete turns; contiguous recent window, stop at first non-fitting turn, chronological final request |
| Active turn | exact |
| Semantic retrieval | not implemented |
| Ollama num_ctx | 16384/request |
| Ollama num_predict | 4096/request |

The former failure admitted 4,066 prompt tokens into a daemon-defined 4,096 window and silently exhausted generation space. The final contract reserves output first and bounds every request against the same immutable profile sent to ModelPort and Ollama. Default estimated input must be ≤11,264, including fixed system/tools/structured history cost; the theoretical 12,288 is a ceiling rather than a fill target. Profile validation rejects zero/negative/fractional/unsafe limits and output ≥ total. Defaults live only in composition config; no character budget or daemon/Modelfile setting competes with it. Manual model selection, preferences, explicit model semantics and historical IDs retain Phase 15.5 ownership.

**Exact versus estimated:** user/system strings, selected canonical messages, normalized calls, complete result/error strings and all nine definitions are unchanged. UTF-8 serialization byte measurements and selected/dropped turn counts are exact measurements. Token costs/margins are explicitly estimated; provider-reported prompt/output counts are separately labeled diagnostics. No exact pre-request model tokenization is claimed. Application IDs and approval/cache/invalidation flags are excluded from estimated prompt cost because the transport does not expose them; reference/error JSON inside actual result content remains included. The default fixed request estimate is 1,522 tokens, not an exact standalone tool token count.

**Mandatory overflow:** system + tools + current complete chain exceeding estimated input allowance throws `ContextBudgetExceededError` before inference. Initial preflight includes tools and rejects before a prompt append. A later exact tool result can overflow the next round: its already committed events/results remain durable, `CONTEXT_BUDGET_EXCEEDED` is recorded through the existing error mechanism, and no next model call or clean final answer occurs. No current text/result truncation or output-reservation reduction.

**Dropped-turn semantics:** selection affects only the transient model request. Complete older user interactions lose atomically, newest first until the first non-fitting next older group. No older smaller group is skipped into the request. Calls/results/continuations within retained canonical turns stay ordered and together. All original durable events, reducer snapshots, replay/transcripts and historical metadata remain complete. Canonical reducer batch barriers and established legacy-history compatibility remain unchanged; the compiler does not reconstruct or repair event history. Leading legacy groups and consecutive users retain their existing grouping behavior. The compiler rejects additional system messages in canonical conversation state to enforce its single configured instruction.

**Finish behavior:** `stop`, `length`, `tool_calls` and other explicit provider reasons map to generic `stop`, `length`, `tool`, `unknown`; absent reason remains unavailable. Valid final `prompt_eval_count`/`eval_count` map to generic prompt/output usage, including terminal metadata-only frames. A generic length finish raises `ModelOutputTruncatedError` / `MODEL_OUTPUT_TRUNCATED`, preserving any already streamed partial display but committing no clean assistant completion or partial tool batch. A stream without provider `done` still fails. Unknown/missing reason cannot be used to claim a detected context-boundary cause. Ollama receives `truncate: false` and `shift: false`, so the compiler remains the history-selection owner on providers supporting these public fields.

**Diagnostics/performance:** compiled output and overflow errors expose configured total/output, safety, estimated fixed/active/history/input cost, selected/dropped counts and estimated remaining margin. Remaining margin is unused estimated input allowance after subtracting output and safety; safety is retained in addition to it. Diagnostics never enter normal assistant output or a TUI panel. Group history once, size the mandatory group and each considered older group once, accumulate numerically in reverse, flatten the final suffix once. Work is approximately linear in history/message payloads considered; older payloads beyond the first cutoff are not serialized. No persistent sizing cache or replay-state cache was added.

**Intentional limits and Phase 17:** the estimator is conservative for ordinary coding text, with stronger non-ASCII accounting, but is not a formal bound for every tokenizer, pathological ASCII/high-entropy payload, custom template or unsupported model capacity. There is no automatic model-capacity discovery, tokenizer dependency, network tokenization, calibration learning or output-budget adaptation. Providers that omit stop metadata or ignore public no-truncation flags cannot supply proof of the reason for an apparently completed response. Large current tool outputs intentionally fail when they cannot fit exactly. Dropped history is not semantically searched or summarized. Phase 17 can extend candidate/history selection at this compiler boundary while retaining mandatory exact content, fixed overhead, profile/output/safety invariants and reducer/durable-history ownership.

Final structural review confirms: sole provider-independent profile; default 16,384/4,096; only infrastructure production code knows `num_ctx`/`num_predict`; all nine unchanged tools every production round; no SessionReducer/SessionService/storage mutation; no ModelSelection policy/preference/header/picker changes; no TUI redesign; no FAISS, vector DB, embeddings, semantic ranking, summaries, session memory or retrieval; no dependencies/lockfile changes. Historical Phase 1–15.5 progress records and historical audits/plans remain unchanged. Generated `dist` and `.agent` files are not tracked, staged or committed. No commit or staging action is created.
