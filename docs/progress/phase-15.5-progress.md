# Phase 15.5 — model selection lifecycle

## Status

verified

Status vocabulary: not started → in progress → blocked (if necessary) → implementation complete → verified. All required deterministic/release gates passed after the final code change. No commit created.

## Baseline

- Starting HEAD: `1ea5d7093d2a67728c97bb8c20da853aa140b2f9`.
- Initial `git status --short --untracked-files=all` and `git diff`: empty, clean checkout.
- Bun: `1.4.2`.
- No repository or ancestor `AGENTS.md` found.
- Baseline config schema: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_KEEP_ALIVE`, `SYSTEM_PROMPT`, `MAX_CONTEXT_CHARACTERS`. `OLLAMA_MODEL` defaulted to `gemma4:12b-it-qat`, including blank input, so unset and explicit configuration were indistinguishable. Baseline `.env.example` explicitly set another Gemma variant; no model setting was found in local `.env`. Effective local model inputs audited separately: `OLLAMA_MODEL`, `OLLAMA_KEEP_ALIVE`, `TEST_MODEL` unset; base URL `http://localhost:11434/`. Therefore this checkout used the implicit stale Gemma value without an explicit model input.
- `createRuntime` synchronously composes `OllamaModelRuntime`, session service/store, context builder and turn execution. The runtime owns the name/adapter and catalog cache; constructor selects the config string without discovery.
- Switch currently trims the name → unloads old adapter via `POST /api/chat` (`messages: []`, `keep_alive: 0`, `stream: false`) → constructs a new adapter → commits its name/adapter. Construction does not activate or load the new model. Inference is lazy.
- Model IDs appear in durable `prompt.submitted.modelName` metadata. `SessionService`/`SessionReducer` rebuild conversation messages and do not own active runtime model selection. Presentation resume currently restores the latest historical prompt model via the manual switch route. Header reads the runtime name; picker reads the provider catalog.
- `JsonlSessionStore` defaults to workspace-local `.agent/sessions`. No existing application model preference/storage abstraction was found. Session history must not become preference storage.
- Baseline `bun run release:check`: format/typecheck pass; 527 tests / 33 files / 5,551 assertions pass. Build fails resolving the already-locked optional `@opentui/core-win32-x64@0.5.14` package, absent locally. Log: `/tmp/phase-15.5-baseline-release.log`. Restore locked platform dependencies for cross-build validation; no package/lockfile changes intended.
- Scope excludes Phase 16/context budgeting, tool contracts/behavior, retrieval, memory architecture and TUI layout.

## Root cause

`Conversation` manual selection/resume → `Runtime.switchModel` → `OllamaModelRuntime.switchModel` → current adapter `unload` → `OllamaHttpClient.postJson`. An absent old model yields HTTP 404; the HTTP client throws a generic error and the switch exits before constructing/committing the replacement. The runtime/header retain the unvalidated stale configured/historical model. Deterministically reproduced against baseline using synthetic `removed-model` and mocked JSON `{"error":"model 'removed-model' not found"}`: switch rejects with unload 404 and `getModelName()` still reports the removed model (`bun /tmp/phase-15.5-stale-repro.ts`).

## Selection policy

Final policy recorded before production implementation:

1. A provider-independent application resolver accepts `configuredModel` separately from remembered preference; composition maps the existing optional `OLLAMA_MODEL` into this input. Installed explicit configuration wins. Unavailable explicit configuration yields an unavailable state with `/model` recovery and never falls through.
2. With no explicit identifier, use an installed remembered successful manual selection.
3. Otherwise exactly one installed model resolves automatically.
4. Multiple models require selection through the existing picker; provider order never resolves a choice.
5. Zero models starts safely, with an actionable install-model message when selection/inference is needed.

History never participates in runtime resolution, even if its model remains installed. Resume preserves the currently resolved/manual runtime selection and replays unchanged durable events. Manual recovery overrides explicit config for this runtime only; the next fresh resolution prioritizes unchanged external config again.

Startup initialization uses catalog discovery/preference reading only, no activation/unload/inference. Selection means an available chosen model, not a promise of provider RAM residency. Manual switching refreshes availability, unloads a previous adapter when appropriate, clears old selection after successful unload, confirms a provider activation response, commits the new adapter/name, then remembers it. Post-unload activation/construction/cancellation failures leave no selected model; no fictitious rollback. Before-unload failures retain a still-valid previous selection. Inference/list refresh detects disappeared runtime selections. Provider discovery failures remain truthful recoverable state and do not crash CLI startup.

## Persistence contract

Use workspace application state `.agent/model-preference.json`, beside the existing `.agent/sessions`, shared across sessions rather than owned by any conversation. Format: `{"lastSelectedModel":"<identifier>"}` plus newline, no credentials/settings framework/database. This deliberately follows the existing workspace-local state pattern; it is not a global cross-workspace preference.

Write a uniquely named exclusive temporary file in the same directory, close it, then rename over the destination. Normal interruption exposes the previous complete file or the new complete file; no power-loss/fsync durability promise. Clean owned temporary files on write failure. Missing, unreadable, malformed or invalid-shaped preference is ignored. Next successful manual activation replaces corruption. Reads/automatic resolution do not write preference. Persist only after confirmed manual activation and state commit. Write failure leaves activation successful and presents a concise warning including the persistence error; it does not claim rollback.

## Implementation checkpoints

- Created this record before production edits; initial checkout/config/model ownership audit recorded.
- Completed architecture/ownership/storage inspection and synthetic baseline reproduction; finalized policy and persistence contract before production edits.
- Model-name audit: executable default in `config.ts`; real IDs in deterministic config/composition/adapter/catalog/turn/command tests (including `qwen3:8b`, `llama3.1:8b`, `llama3.2`); README/env intentional examples; historical Phase 10/11/14 and audit logs. The default and deterministic real-model fixtures were removed. Historical documents remain unchanged. Deterministic tests use a shared constant independent of environment; the explicitly live smoke uses only `TEST_MODEL`, without a hidden fallback.
- Infrastructure semantics checked against upstream [Ollama chat API](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion) and [server handlers](https://github.com/ollama/ollama/blob/main/server/routes.go): empty chat loads, empty chat with zero keep-alive unloads, absent model returns model-specific 404 JSON. Manual activation must omit zero keep-alive (otherwise it is an unload) and require a completed load response. Only model-specific not-found at the unload boundary becomes success; endpoint/proxy/server/transport failures remain errors.
- Introduced provider-independent `ModelSelection` application ownership and minimal activation/preference ports. `OllamaModelRuntime` now only wires dependencies. Optional `OLLAMA_MODEL` has no hard-coded default. Startup discovery is nonfatal/lazy, and turn boundaries refresh availability before committing prompt model metadata.
- Added atomic `.agent/model-preference.json` storage with nonfatal corrupt/unreadable reads and independent write-failure warnings. No session event changes or memory-architecture changes.
- Added infrastructure HTTP status/body error type, narrow model-not-found unload normalization, model-specific inference/activation guidance and completed-load confirmation. Manual loads use provider default retention; real chat keep-alive remains unchanged.
- Presentation initializes runtime selection, replays history without historical model restoration, refreshes catalog in the existing picker, and displays `/model` for unresolved headers. Successful activation commits; post-unload failure clears selected state. Provider errors retain their primary cause.
- Shared `SYNTHETIC_MODEL` fixture is environment-independent; live helper requires explicit `TEST_MODEL` with actionable missing-input diagnostics. Real IDs removed from deterministic executable tests. README/env examples explain the new lifecycle.
- Focused initial tests: selection/preference/helper 60 pass / 233 assertions; migrated composition/provider/presentation 92 pass / 1,285 assertions. Temporary failures during migration were fixture expectations/types and modal-overlay header inspection; these were corrected before final verification.
- Extended focused suite passed: 194 tests / 13 files / 1,742 assertions. All nine resume/history combinations and provider-specific versus transport/permission classifications passed. Older catalog requests cannot overwrite newer selection/discovery state.
- First full gates: 608 deterministic tests / 37 files / 5,942 assertions; typecheck, format, Linux/Windows builds, build smoke and release check passed. Locked optional platform packages and the matching Bun Windows cross-compiler runtime were restored after baseline/sandbox failures; package and lockfile unchanged.
- Final diff review caught a presentation transition detail: header text could retain the old name while provider activation was pending after unload. During a pending command it now says `Switching model…`; completion/failure returns to the actual selected name or `/model` placeholder. No layout/style change. Final gates were rerun successfully after this code/test adjustment.
- Single optional real smoke used explicit discovered `TEST_MODEL=qwen3.5:9b` with a 20-second aggregate bound. Installed names were `gemma4:12b`, `ministral-3:14b`, `qwen3.5:9b`; the smoke ended with `FAIL: The operation was aborted.` at the bound before the final pass/restart assertion. No retries, pull/delete, inference or benchmark. Temporary state cleaned. This optional result does not invalidate deterministic verification; live end-to-end recovery remains unconfirmed.

## Validation

- Baseline identity/status/diff/Bun checks and expected stale-switch reproduction completed above.

| Command/check | Final result | Evidence |
| --- | --- | --- |
| Baseline `bun run release:check` | format/typecheck + 527 tests passed; build failed on missing locked Windows OpenTUI optional package | `/tmp/phase-15.5-baseline-release.log` |
| Focused selection/preference/config/helper | 60 pass, 0 fail, 233 assertions | `/tmp/phase-15.5-focused-selection.log` |
| Migrated composition/provider/presentation | 92 pass, 0 fail, 1,285 assertions | `/tmp/phase-15.5-focused-integration.log` |
| Expanded focused model/resume/presentation/helper suite | 194 pass, 0 fail, 1,742 assertions, 13 files | `/tmp/phase-15.5-targeted.log` |
| Final native header/picker tests | 25 pass, 0 fail, 1,009 assertions | `/tmp/phase-15.5-final-header.log` |
| `bun run typecheck` | pass | `/tmp/phase-15.5-final-typecheck.log` |
| `bun test` | 608 pass, 0 fail, 5,942 assertions, 37 files; no live server/model requirement | `/tmp/phase-15.5-final-tests.log` |
| `bun run format:check` | pass, 131 files | `/tmp/phase-15.5-final-format.log` |
| `bun run build:linux` | pass | `/tmp/phase-15.5-final-linux.log` |
| `bun run build:windows` | pass after matching Bun compiler download; final run uses cache | `/tmp/phase-15.5-final-windows.log` |
| `bun run smoke:build` | pass; isolated binary new/resume and packaged ripgrep checks | `/tmp/phase-15.5-final-build-smoke.log` |
| `bun run release:check` | pass; includes format/typecheck, same 608 tests, both builds and build smoke | `/tmp/phase-15.5-final-release.log` |
| Single optional Ollama smoke | incomplete/failed at 20-second bound, no retry; not a deterministic release requirement | `/tmp/phase-15.5-ollama-smoke.log` |
| `git diff --check`, `git diff --stat`, `git status --short --untracked-files=all` | pass/reviewed; only phase source/tests/docs and the optional smoke | final structural review |

Final review covered the full tracked diff and every new file. Protected Phase 1–15 records, package/lockfile, context builder/budgeting, system/tool definitions, tool ports/lifecycle/providers, workspace safety, session store/service/reducer are unchanged. Model identifier scans across current source/scripts and repository documentation found no stale executable/deterministic real-model references; remaining real names are historical records/audits, this phase's baseline/smoke evidence, and commented README/env live-test examples. No broad 404 swallowing or arbitrary multiple-model fallback. Only the existing picker/header content and model lifecycle plumbing changed in presentation. Generated release files are removed after verification; temporary preference/smoke directories are cleaned, and no checkout application preference/session files are generated. No expensive gates rerun for progress-document-only updates.

## Final contract

| Situation | Expected result |
| --- | --- |
| Explicit configured + installed | use explicit model |
| Explicit configured + missing | surface unavailable; allow /model recovery |
| No explicit + remembered installed | use remembered model |
| No explicit + remembered missing + one installed | use sole installed model |
| No explicit + remembered missing + many installed | require selection |
| No explicit + no remembered + one installed | auto-select sole model |
| No explicit + no remembered + many installed | require selection |
| No installed models | start safely; inference unavailable |
| Stale current → valid new | switch succeeds after confirmed activation |
| Old unload returns not-found | treat model-specific not-found as already unloaded |
| New activation fails | do not commit/persist attempted model |

- **Configuration:** unset/blank `OLLAMA_MODEL` means no explicit input, with no permanent default model ID. Explicit input outranks remembered preference. Manual recovery may override it in this runtime; config/env is never rewritten, and explicit input wins on next fresh resolution. Resolver input `configuredModel` supports future configuration sources without environment-specific policy.
- **Startup:** constructor has no claimed selected model. Terminal initialization resolves provider availability + preference, with no provider load/unload or generated inference. Zero/multiple/missing-explicit states start normally, show the reason and actionable selection/install guidance. Provider discovery errors start safely with their primary error, not a misleading model-swap suggestion.
- **Resume/history:** historical `prompt.submitted.modelName` values remain untouched. Resuming keeps the available application runtime choice and never activates/persists a historical model just because it appears in events. Continued prompts record the actual runtime ID supplied by composition; an unresolved selection rejects before any new prompt event is committed. Installed/missing historical models, installed/missing preference and explicit input, multiple/no installed models are tested through real composition/session service with mocked provider/storage.
- **Manual switch:** refresh catalog → reject unavailable candidate → unload previous adapter if different → clear previous selected state after successful unload → create/activate candidate → require completed load response for that model → cancellation gate → commit name/adapter → write convenience preference → notify presentation. A stale adapter's model-specific not-found unload is success. A valid old selection survives a failed unload; a known-missing old selection does not. Post-unload construction/load/cancellation failures leave no selected model. No rollback is claimed. Same-model manual selection still confirms activation and can remember it, without unnecessary unload.
- **Persistence:** `.agent/model-preference.json`, `{"lastSelectedModel":"<identifier>"}` plus newline, shared by all sessions in this workspace. Exclusive same-directory temporary write + close + atomic rename; corrupt/missing/unreadable preference ignored. Only successful manual activation writes. Failed attempted selection never writes. Persistence failure keeps confirmed selection and appends its actual error as a warning.
- **Provider mapping:** infrastructure alone inspects bounded Ollama HTTP status/body. Unload normalizes only HTTP 404 JSON whose error says this model (or the model artifact generically) was not found. Other-model/endpoint/proxy/plain-text 404, permission/server/transport errors remain failures. Known model absence/capability/format/memory failures retain primary provider text plus `/model` guidance; generic transport/server/permission/malformed responses do not receive a misleading hint. Streaming model-not-found clears runtime selected state.
- **Presentation:** selected header uses the current runtime name; unresolved header says `No model selected · /model`; pending command says `Switching model…`. Existing picker refreshes installed names, opens with no selection, stays open on failed activation with the actual error, and closes/updates normally after success. Historical transcript notices/errors remain historical; the current selection state is cleared by a successful selection. Layout, styling, focus and approval/tool behavior are unchanged.
- **Tests:** fake-only `SYNTHETIC_MODEL = 'test-model'` never reads environment. `requireLiveTestModel` uses only explicit trimmed `TEST_MODEL`, with `No live test model configured. Set TEST_MODEL=<installed-model>.` if absent. Optional `scripts/smoke-model.ts` skips unconfigured live coverage, prints its chosen model, validates installed availability and never picks provider order or downloads anything. `bun test` is fully deterministic without Ollama/TEST_MODEL.
- **Optional smoke limitation:** exactly one local lifecycle attempt, discovered `qwen3.5:9b`, ended at its 20-second bound. Live completion/restart is unconfirmed; no repeat, inference, benchmark, model deletion/pull or native Windows execution claim. Runtime restart and durable-history recovery are verified deterministically.
- **Intentional limits:** preference remains workspace-local following `.agent` conventions; no global settings framework or database. Atomic replacement does not promise power-loss durability; externally removed models are detected on fresh startup, turn discovery, picker refresh or provider failure, not by background polling. Selection is an available chosen model, not guaranteed provider RAM residency. Manual load uses provider retention; real chat preserves existing configured keep-alive. Cancellation after a successful selection commit cannot roll back provider activation or a completed preference write. No Phase 16/context/retrieval/tool work included.
