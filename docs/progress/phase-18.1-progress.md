# Phase 18.1 — model-agnostic tool selection and recoverable tool errors

## Status

verified — wording, typed schema feedback, focused regressions, actual request capture, bounded live A/B, all final release gates and complete diff/structural review are finished. The live workflows completed safely with documented model-quality limitations. No production tuning followed the smoke; no commit or staging action.

Execution session: `01a12517-992a-7961-95df-b49870ea9ba9`. A new Codex task was created explicitly for this phase. Its runtime `turn_context` confirms `gpt-6.1-sol`, reasoning effort `max`, and the repository working directory. This is the coding agent's reasoning setting, separate from the behavioral smoke's `TEST_MODEL`. The coordinating session supplied independent inspection, argument-snapshot review and smoke validation. Execution resumed in this same session after obsolete hidden approvals were interrupted; no replacement session or recursive task was created.

## Baseline

- Starting HEAD: `645a43f38e16488417e879832f7dec907eff9bf2`.
- Starting `git status --short --untracked-files=all`: empty.
- Starting `git diff`: empty.
- Bun: `1.4.3`.
- Prior contracts: Phase 14 safety, Phase 15 compact instructions, Phase 15.5 model selection, Phase 16 context budgeting, Phase 17 retrieval, Phase 18 structured memory remain authoritative. The execution task inspected the six historical progress records. Historical records must remain unchanged.
- Baseline `bun run release:check`: formatting and typecheck passed; **934 pass, 0 fail, 6,968 assertions across 53 files**. Build stage initially failed with `Failed to download 'bun-windows-x64-v1.4.3': DNSResolveFailed`; artifact smoke was not reached then. This historical environmental failure was resolved: the user manually verified clean `bun run build` and `bun run build:windows` runs with Bun 1.4.3, exit code 0, and fresh Linux/Windows application and ripgrep artifacts. The coordinator confirmed those artifacts exist. The completed baseline inspection was not repeated; final post-change release gates are recorded below.
- Environment checkpoint: the coordinator confirmed `dist/codesh`, `dist/codesh.exe`, `dist/rg`, and `dist/rg.exe` with fresh 2026-10-10 11:40 timestamps after the user's clean builds. Archiving/restoring the same task cleared its obsolete hidden approval and confirmed the interrupted turn. The resumed task used that completed baseline. Final post-change builds and release verification below all passed.

### Baseline tool definitions and contracts

All nine tools are registered by `createLocalToolExecutor` and serialized by `LocalToolRegistry`. The provider-facing transport projects generic definitions to `{type, function: {name, description, parameters}}`, excluding internal approval/cache metadata. Baseline raw generic and wire definitions were captured in `/tmp/phase-18.1-coordinator-baseline-surface.json`; the starting HEAD also preserves every definition.

| Tool | Input contract / behavior |
| --- | --- |
| `list_directory` | Optional `path`, optional `depth` (default 1, range 1–5); bounded directory inspection; deduplicated read |
| `find_files` | Required `pattern`, optional `path`; bounded glob path discovery; deduplicated read |
| `read_file` | Required `path`, optional `startLine`, `startOffset`, `endLine`; fresh bounded UTF-8 content, continuation and `version`; never deduplicated |
| `search_text` | Required literal single-line `query`; bounded content search; deduplicated read |
| `create_file` | Required `path`, `content`; new file only, safe parent creation, no overwrite |
| `edit_file` | Required `path`, `edits` (1–50 `{oldText,newText}` entries); unique nonoverlapping exact matches against original content; one atomic write with stale-content protection |
| `replace_file` | Required `path`, `content`, `expectedVersion`; existing UTF-8 file only; mandatory lowercase SHA-256 version and stale-content protection |
| `move_file` | Required `source`, `destination`; regular file, no destination overwrite |
| `delete_path` | Required `path`; file or empty directory only, never recursive |

All five mutations require approval, invalidate workspace references when actual execution starts, and never deduplicate. Filesystem containment, protected paths, cancellation, atomic publication and existing optimistic-concurrency checks are unchanged.

Exact baseline model-facing wording:

- System: `Use workspace-relative paths.`
- `read_file`: `Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.`
- `edit_file`: `Apply local exact edits after reading the file. Each oldText must match once in the original; no overlaps. All edits commit together.`
- `replace_file`: `Replace all text of an existing UTF-8 file; rejects stale versions. Use edit_file for local changes.`
- `expectedVersion`: `version from read_file for this file.`

`read_file` returns **`version`**, derived from the complete current file content even when the returned content is a bounded slice. Other result fields include `path`, `content`, `startLine`, `endLine`, `totalLines`, `truncated`, and optional `nextRead`. `expectedVersion` is required and uses `^[a-f0-9]{64}$`. `replace_file` compares the existing content's version, then writes with `expectedContent`; neither malformed nor stale versions may reach an unsafe overwrite. `edit_file` can safely operate on reliably known exact content without a separate preceding read; its existing description overstates that requirement.

### Baseline validation-error serialization and recovery

Baseline `LocalToolRegistry.prepare` formatted actual Zod failures using `z.prettifyError`, producing tool name, failing field, and validation reason without a stack trace. `ToolRunner.prepareToolCalls` prepared the complete batch before assigning IDs or persisting/executing calls. Baseline `RunAgentTurn` caught preparation errors, recorded `agent.error` with `MODEL_TOOL_CALL_INVALID`, and threw. Thus a malformed schema argument terminated the turn **before** any model-visible `tool.call.failed` result was produced.

Independent deterministic reproduction through the real `RunAgentTurn` and production registry supplied `expectedVersion: "invalid"` for `mini_cli.py`. It produced one model round, zero tool-request events, zero tool-failure events, and `MODEL_TOOL_CALL_INVALID`. The actual thrown message was:

```text
Invalid arguments for tool replace_file: ✖ Invalid string: must match pattern /^[a-f0-9]{64}$/
  → at expectedVersion
```

Evidence: `/tmp/phase-18.1-coordinator-reproduction.json`. No filesystem mutation was executed. In contrast, errors during valid prepared execution already become model-visible tool failures and the existing loop can continue. The existing loop limit is 12 iterations; approval denial is terminal. Valid preparation selects/parses/binds once; the full-batch validation boundary must remain intact.

## Real observed failure

The user asked, “Create mini-project in python in this folder. I wanna test cli.” The agent listed the directory, created `mini_cli.py`, and explained normally. Next, “extend this file with some upgrade. You can choose.” caused a `replace_file` attempt with malformed `expectedVersion`, rejected by the lowercase 64-character SHA-256 contract. When the user explicitly asked what value caused the failure, the agent unnecessarily rediscovered the known path, offered `edit_file` versus `replace_file`, and asked the user to choose. It eventually recovered with a successful exact edit.

The supplied invalid string from that manual run is not present in the user's report; do not fabricate it. The concrete reproduction above uses a separate explicitly documented diagnostic value. The observed issue is selection/autonomy/recovery quality, not inability to mutate files.

## Root-cause assessment

Inspection establishes a concrete application recovery gap: schema validation fails before the error can be returned as tool feedback to the next model round. This is distinct from stale-version/exact-match errors, which already follow the normal model-visible execution-failure path.

The baseline `expectedVersion` property identified `read_file` but did not explicitly require the **current** result's exact `version`, forbid invention/reconstruction, or prescribe rereading unavailable/stale state. Whole-file replacement was already described, but its relationship to bounded exact edits could be made more precise. The baseline `edit_file` description unnecessarily said “after reading” even when exact current content was reliably known. The global instruction covered only path relativity and gave no cross-tool ownership/recovery guidance.

These are genuine contract/feedback weaknesses. The historical model's unnecessary listing and tool-choice question also involve stochastic decision quality; one anecdote cannot prove that every such choice is caused by wording. No provider/model-specific cause or prompt-template assumption is established, and none justifies production specialization.

## Proposed contract

Recorded before production edits. The resumed execution task selected the following exact wording after inspecting the registry, runner, loop, reducer, prepared-execution tests and production request capture:

- `expectedVersion`: `Use exactly the current version from read_file for this file. Never invent or reconstruct it. If unavailable or stale, read_file again.`
- `replace_file`: `Replace the entire existing UTF-8 file; rejects stale versions. Prefer edit_file when bounded exact edits suffice.`
- `edit_file`: `Apply bounded exact edits to reliably known current content; read_file if unknown or stale. Each oldText must match once in the original; no overlaps. All edits commit together.`
- Default system: `Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly. Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work.`

The 394-character system text is needed only for cross-tool autonomy, known-target discovery, clarification boundaries and answering error questions; these responsibilities cannot be expressed cleanly in a single mutation property's contract. Version source/retry and edit-match mechanics stay local. Explicit nonblank `SYSTEM_PROMPT` still replaces the default, rather than receiving an appended manual.

Selected feedback change: an application-port `ToolInputValidationError` distinguishes actual registry schema failures from unknown tools and arbitrary preparation exceptions. ToolRunner parses/selects each call once, collects typed validation failures across the complete batch, and throws a typed batch rejection before assigning any IDs or doing observable work. The loop then records the original proposed calls and truthful failures through existing assistant/tool events; valid siblings are explicitly cancelled, not executed. Only this typed rejection advances to another ordinary model round under the existing 12-iteration bound. Corrected calls go through normal fresh preparation and approval. Zod's already sufficient tool/field/reason text is retained. No read, version substitution, argument repair, approval or mutation occurs on the rejection path. Provider/unknown-tool/generic preparation failures remain terminal.

1. Make `expectedVersion` authoritative for its source and recovery: use exactly the current `version` from `read_file` for this file; never invent or reconstruct it; read again if unavailable or stale. Keep the required strict SHA-256 schema unchanged.
2. Keep `replace_file` explicit about replacement of the entire existing UTF-8 file and direct bounded exact changes toward `edit_file`.
3. Correct `edit_file` wording to reliably known current content while preserving every unique-match, nonoverlap, bounded-batch and atomic-write invariant. Do not introduce an unconditional read requirement.
4. Only if needed for cross-tool behavior, add a tiny generic instruction that clear intent leaves internal tool choices and safe recoverable-error handling with the agent, and that known valid paths need no rediscovery. User-visible ambiguity and undiscoverable information still require clarification. Avoid duplicating the version invariant globally.
5. Repair only actual schema-validation feedback routing, preserving complete-batch preparation: no earlier mutation from an invalid batch may execute. Unknown tools/generic preparation failures remain terminal; normal valid bound execution, approvals, cancellation and filesystem policy stay unchanged. No hidden reread, argument substitution or auto-execution. The model must see the exact failure and choose its next normal call within the existing bounded loop.

## Instruction-surface delta

Exact JavaScript serialized-character counts; these are **not token counts**. Generic definitions include lifecycle metadata; wire definitions use the actual existing transport projection. Combined fixed surface means system content length plus the nine-tool wire array length. The fixed envelope includes serialized system-message and tools keys.

| Measurement | Before | After | Delta |
| --- | ---: | ---: | ---: |
| System instruction content | 29 | 394 | +365 |
| All nine generic definitions (`JSON.stringify`) | 4,274 | 4,430 | +156 |
| All nine provider-facing definitions (`JSON.stringify`) | 4,211 | 4,367 | +156 |
| `replace_file` generic definition | 504 | 616 | +112 |
| `replace_file` provider-facing definition | 478 | 590 | +112 |
| `expectedVersion` description | 37 | 135 | +98 |
| Combined fixed model-facing surface | 4,240 | 4,761 | +521 |
| Serialized fixed `{messages,tools}` envelope | 4,294 | 4,815 | +521 |

Actual capture: `bun /tmp/phase-18.1-capture.ts > /tmp/phase-18.1-capture.log 2>&1` (exit 0), through real config → SessionService → ContextBuilder → RunAgentTurn → production registry → OllamaModelAdapter → mocked HTTP serialization. Complete body and measurements: `/tmp/phase-18.1-final-surface.json`. Exactly nine definitions; recursively removing descriptions makes baseline/current generic definitions deeply identical. The 521-character combined increase is 12.29%; only edit/replace descriptions and the version property contribute the 156-character tool delta. No tokenizer measurement is claimed. Independent coordinator static reconciliation reproduces these counts.

The six-round request-boundary regression additionally captures malformed version → read A → safely rejected stale replacement A → read B → exact replacement B → final answer, with every revised definition/schema and the unchanged 16384/4096, truncate/shift settings in every actual HTTP body. The earlier stale-exact-edit capture still passes for default, blank and explicit system overrides.

## Validation

Before production edits, `bun test src/infrastructure/tools/ToolDefinitions.test.ts src/application/use-cases/RunAgentTurnToolRecovery.test.ts > /tmp/phase-18.1-regressions-before.log 2>&1` encoded the contract and actual-loop weaknesses: **7 pass / 7 expected fail / 119 assertions / 2 files**. Expected failures establish missing current/exact version wording and terminal malformed/missing schema handling; the just-created exact-edit and unknown-tool safeguards already work. After implementation, the same command passed **14 tests / 217 assertions**.

Initial focused gate: `bun test src/infrastructure/tools src/application/services/ToolRunner.test.ts src/application/use-cases/RunAgentTurn.test.ts src/application/use-cases/RunAgentTurnToolRecovery.test.ts src/application/use-cases/file-operations src/infrastructure/file-system src/infrastructure/model/InstructionSurface.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts src/composition/config.test.ts src/composition/createRuntime.test.ts > /tmp/phase-18.1-focused.log 2>&1` — **423 pass / 0 fail / 4188 assertions / 15 files**. Interim typecheck passed after fixing new test role narrowing. Existing system-default fixtures were migrated without weakening override/context/retrieval semantics.

Coordinator review found that rejected raw arguments also need the same snapshot boundary as successful prepared projections. A controlled ModelPort-owned-object mutation during asynchronous persistence reproduced the alias: `bun test src/application/use-cases/RunAgentTurnToolRecovery.test.ts --test-name-pattern 'snapshotted' > /tmp/phase-18.1-raw-snapshot-before.log 2>&1` — **0 pass / 1 fail / 3 assertions**. `structuredClone` before the first async write fixes it; the same targeted command now passes. This preserves the actual invalid value for later user questions and adds no argument repair.

Expanded focused gate passed **706 tests / 0 failures / 5390 assertions / 30 files**, `/tmp/phase-18.1-focused-final.log`. Exact command:

```bash
bun test src/infrastructure/tools src/application/services/ToolRunner.test.ts src/application/use-cases/RunAgentTurn.test.ts src/application/use-cases/RunAgentTurnToolRecovery.test.ts src/application/use-cases/file-operations src/infrastructure/file-system src/infrastructure/model/InstructionSurface.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts src/composition/config.test.ts src/composition/createRuntime.test.ts src/application/services/ModelSelection.test.ts src/application/services/ContextBuilder.test.ts src/application/services/ContextBuilderRetrieval.test.ts src/application/services/ContextBuilderMemory.test.ts src/application/services/HistoryRetriever.test.ts src/application/services/HistoryTurns.test.ts src/application/services/ExactVectorSearch.test.ts src/application/services/SessionMemoryService.test.ts src/application/services/ModelSessionMemoryUpdater.test.ts src/application/use-cases/RunAgentTurnRetrieval.test.ts src/application/use-cases/RunAgentTurnMemory.test.ts src/composition/createRuntimeRetrieval.test.ts src/composition/createRuntimeMemory.test.ts src/composition/model/ModelResume.test.ts src/composition/model/OllamaModelRuntime.test.ts > /tmp/phase-18.1-focused-final.log 2>&1
```

`bun run typecheck > /tmp/phase-18.1-interim-typecheck-3.log 2>&1` passed. New coverage includes 11 malformed/missing version values rejected before provider reads/writes, multiple invalid calls and cancelled valid siblings, independent generic/unknown failures, original-argument snapshots, approval denial, cancellation, feedback persistence failure, bounded 12-round termination, safe read-derived replacement and just-created exact editing. Existing filesystem/approval/prepared and Phase 15.5–18 regressions passed unchanged except default-system expectations.

| Baseline / checkpoint check | Recorded result |
| --- | --- |
| `git rev-parse HEAD` | starting HEAD above |
| `git status --short --untracked-files=all` / `git diff` | clean baseline |
| `bun --version` | 1.4.3 |
| Baseline `bun run release:check` | format/typecheck and 934 tests passed; Windows cross-compiler DNS failure in build stage |
| Build-environment resolution | user reports clean `bun run build` and `bun run build:windows`, exit 0; all four fresh artifacts independently confirmed; prior DNS/download blocker resolved |
| Real-path malformed-version deterministic diagnostic | reproduced terminal validation gap; no execution/mutation |
| Historical coordinating blocked audit | same live task confirmed `waitingOnApproval` in three consecutive goal turns; user resolved the build environment and the same task resumed |

All requested focused coverage is complete: definitions/schemas; read/edit/replace; strict malformed/stale rejection; read-derived successful replacement; ToolRunner/prepared complete-batch boundaries; model-visible schema feedback and RunAgentTurn recovery; bounded retry termination; stale exact-edit recovery; actual production request capture and instruction size; filesystem/approval regression; model selection/context/retrieval/memory boundaries. The schema/metadata baseline digest is `59864a09db0ffff847b3df8aa3fe59eb68519574fd01f826810a60d346f03dcb`, reproduced unchanged after recursively excluding only description fields.

Final gates on the final production/test files (all command exit codes 0):

| Exact command / check | Result | Evidence |
| --- | --- | --- |
| `bun run typecheck` | pass | `/tmp/phase-18.1-final-typecheck.log` |
| `bun test` | 949 pass / 0 fail / 7223 assertions / 54 files | `/tmp/phase-18.1-final-tests.log` |
| `bun run format:check` | pass; 166 files; no fixes | `/tmp/phase-18.1-final-format.log` |
| `bun run build:linux` | pass | `/tmp/phase-18.1-final-linux.log` |
| `bun run build:windows` | pass | `/tmp/phase-18.1-final-windows.log` |
| `bun run smoke:build` | pass; packaged artifact/terminal/ripgrep checks | `/tmp/phase-18.1-final-smoke.log` |
| `bun run release:check` | pass; format/typecheck + same 949 tests / 7223 assertions / 54 files + both builds and packaged smoke | `/tmp/phase-18.1-final-release.log` |
| `git diff --check` | pass | final review |
| `git diff --stat` | reviewed; 14 tracked paths, 367 insertions / 25 deletions; excludes 2 new files | final review |
| `git status --short --untracked-files=all` | reviewed; those 14 modifications plus progress record and recovery test | final review |
| protected-path `git diff --exit-code` | pass; architecture/safety/historical/dependency paths unchanged | final review |
| `git rev-parse HEAD` / `git diff --cached --stat` | starting HEAD unchanged; nothing staged | final review |

The full suite grows by 15 tests and 255 assertions; no existing test is removed or weakened. Initial test type-narrowing/formatter issues were corrected before the final gates. Only progress-document updates occur after these gates; expensive passing gates are not repeated for documentation. New-file `git diff --no-index --check /dev/null <file>` checks have no whitespace diagnostics (exit 1 denotes the expected new-file difference). Windows is cross-built; native Windows execution is not claimed.

## Behavioral smoke

Actual configured model: **`qwen3.5:9b`**, resolved exclusively through unchanged `requireLiveTestModel()` and verified installed. The production default system prompt and configured 16384/4096 profile were used. Exactly two scenarios, one attempt each; no downloads, model comparisons, sampling, tuning or behavioral retries. C is covered by the six-round deterministic real-filesystem/HTTP integration above; no invasive stale injection into the live product path.

Fixed limits before execution: 240-second aggregate AbortSignal, 60-second provider-request deadline, six model rounds per user turn, external 250-second process limit (+2-second kill grace). No timeout retry, downloads/comparisons/sweeps/sampler changes. Delegate the configured profile, system wording, tools and adapter unchanged except temporary abort deadlines. Record actual calls/arguments/results, final file outcomes and assistant text. Auto-approval applies only to the disposable harness; production approvals are covered above. Deterministic safety remains authoritative and stochastic smoke supplemental.

Access history: the sandboxed catalog preflight returned `ECONNREFUSED` at 2 ms with **zero inference requests and zero scenario attempts**; evidence `/tmp/phase-18.1-sandbox-preflight.{json,log}`. Its subsequent hidden approval was interrupted before execution. The coordinator then executed the reviewed unchanged harness with authorized localhost access. This was the single live A/B run, not a retry of an inference or behavioral scenario. No provider request timed out in that run. Command: `timeout --signal=TERM --kill-after=2s 250s bun /tmp/phase-18.1-tool-smoke.ts > /tmp/phase-18.1-tool-smoke.log 2>&1`, exit 0. Started `2026-10-10T10:14:05.874Z`, total **89094 ms**, **10 inference requests**, **7 tool calls**, **4 approved disposable mutations**, **0 tool failures**. All requests used the same nine definitions; no provider options/sampler/template changes. The focused harness uses the production loop/compiler/registry/adapter with in-memory sessions and omits optional memory/retrieval services, so it performs no semantic-memory or embedding inference.

| Scenario | Actual prompts and sequence | Outcome / limitation |
| --- | --- | --- |
| A, create then extend | “Create a small Python CLI in mini_cli.py in this folder so I can test the agent. A single file is enough.” → `create_file(mini_cli.py)` → normal answer; then “Extend this file with a useful improvement. You can choose.” → `read_file(mini_cli.py)` → `edit_file` (four exact edits) → `read_file(mini_cli.py)` → `replace_file` (exact current read version) → empty final answer | Known target preserved, no directory/path discovery, no internal-tool menu/question, no invented version. Final Python adds a `calc` command. The intermediate schema-valid edit produced malformed Python and an unusable interactive helper; the model reread and replaced it safely. Final reply was empty. |
| B, whole replacement | “Rewrite the entire legacy.json as exactly {"version":2,"enabled":true} followed by a newline. Remove all legacy fields.” → `read_file(legacy.json)` → `replace_file` → normal answer | Final file exactly `{"version":2,"enabled":true}\n`; read-derived version, no discovery/question/guess. Prose incorrectly listed removal of a `path` field that never existed. |
| C, controlled stale recovery | deterministic real filesystem + actual HTTP serialization: malformed replace → read A → external change B → stale replace A rejected → read B → safe exact replace B → completion | Both failures visible and actionable; no unsafe overwrite, hidden repair or extra round. Live C was not attempted. |

Exact live replacement versions, independently checked against the preceding actual `read_file.version`:

- A: `b7eec72ee7f0accc6a3d41201e5278913a66aa5f6573d456c5e227d591a9291b` (the reread after the exact edit).
- B: `d62626996fa746d38fd19e065f60aa0f73c51158f662d49ae946e377155c8abf`.

Complete actual arguments, results, streamed text and final fixture contents: `/tmp/phase-18.1-tool-smoke-result.json`; trace `/tmp/phase-18.1-tool-smoke.log`; harness `/tmp/phase-18.1-tool-smoke.ts`. Both disposable fixture directories were removed. Independent coordinator review `/tmp/phase-18.1-coordinator-smoke-review.json` confirms exact version equality, no known-path rediscovery/internal tool terms, final Python AST validity and `calc + 2 3` exit 0 with `2.0 + 3.0 = 5.0`, and exact final JSON. Its AST inspection reports the intermediate edit's `(` was never closed on line 29.

Classification: **safe workflow and tool selection passed; supplemental response/code-quality limitations observed**. Intermediate Python syntax/interactive-helper quality, A's empty completion, and B's inaccurate prose are stochastic/model-quality behavior, not a reproduced contract ambiguity or implementation bug. No production wording change, additional model invocation or retuning followed. No malformed/stale tool failure occurred live, so live A/B does **not** prove autonomous tool-error recovery; that claim is supported by the deterministic loop/integration tests. Successful schema-valid edits can still contain bad code because tools authoritatively enforce bounded file-edit safety, not language semantics. One model/run does not establish reliability across models or guarantee future choices.

## Final contract

`replace_file` remains existing-file whole replacement with mandatory strict lowercase SHA-256 `expectedVersion`. Its source is exactly the **current `read_file.version` for that file**, never generated from remembered content or guessed. Unavailable/stale versions require a normal read/reread before a safe retry. The provider retains its original version check and atomic expected-content write; no automatic read/version substitution/rewrite was added. `read_file.version` still covers the complete file even when its returned text is sliced.

`edit_file` remains 1–50 bounded exact, unique, nonoverlapping edits against original content, committed together with stale-content protection. Reliably known current content, including a small file just created in the active turn, can be edited directly. Unknown/stale text or failed exact matching leads to the existing safe reread/error contract. No unconditional read ceremony is imposed.

Only actual typed schema failures enter the new preparation-feedback path; existing execution failures keep their model-visible recovery path. Complete-batch preparation still runs before IDs, persistence, approval or filesystem work; valid inputs still select/parse/bind once. If any schema fails, the loop snapshots the original proposed arguments, records the existing assistant/tool lifecycle with precise validation failures and cancelled siblings, and makes the next ordinary model request. Rejected records have no executable authority, started event, approval, mutation, hidden read/write or cache invalidation. The model chooses any safe repair; a corrected mutation requires fresh preparation and normal approval. Arbitrary preparation/unknown-tool errors, provider failures, approval denial, cancellation and persistence failures retain their existing terminal boundaries. Recovery is bounded by the existing 12-iteration loop, compiler budget and cancellation, with no application-side argument correction or provider retry machinery.

The default guidance makes ordinary internal choices agent-owned for clear intent, keeps known targets direct, permits clarification for user-visible ambiguity or undiscoverable required information, respects denials and directs truthful answers about failed calls. Actual supplied invalid arguments remain available in canonical history even if a ModelPort later mutates its own object. Explicit `SYSTEM_PROMPT` overrides retain replacement semantics.

Static portability review: the exact wording is equally true for future Gemma 4, Ministral, Ollama or llama.cpp-backed ModelPorts. It names existing generic tools/result fields and invariants only; no model IDs, parameter-size heuristics, provider templates/formats or model psychology. Independent baseline/current reconciliation excludes only descriptions and finds no name/schema/lifecycle change. No other model was invoked or downloaded. This is a contract portability review, not empirical multi-model certification.

| Item | Final value |
| --- | --- |
| Tool surface | 9 tools |
| replace_file safety | unchanged |
| expectedVersion source | current read-derived `version` |
| expectedVersion guessing | forbidden by contract |
| stale version recovery | reread then safe retry |
| edit_file | valid bounded exact alternative |
| internal tool choice | agent-owned when user intent clear |
| user clarification | only for user-visible ambiguity / required information unavailable safely |
| model-specific production logic | none |
| provider-specific production logic | none |
| tested live model | `qwen3.5:9b`, actual configured `TEST_MODEL` |
| deterministic safety | authoritative |
| behavioral smoke | supplemental; A/B safely complete with quality limits above |
| Phase 18 memory changes | none |
| Phase 17 retrieval changes | none |
| Phase 16 context changes | none |

## Structural final review

- Entire tracked diff and both new files reviewed. Production changes are two mutation descriptions, one version-property description, a compact generic system default, and typed schema-failure routing through the existing loop/events. README avoids accidentally replacing new default guidance with the old short example. Test fixtures change only default-system expectations plus additive regressions. Independent coordinator whole-diff review found no remaining issues; `/tmp/phase-18.1-coordinator-boundary-review.json` confirms the same changed/protected-file inventory.
- Exactly nine registered tools; all schemas, names, strictness, bounds and approval/cache policies identical to starting HEAD after excluding description text. Required version pattern remains `^[a-f0-9]{64}$`. Filesystem/exact-edit/replace implementation and protected-path policy unchanged. No hidden autofix, guessed version, mutation without approval or partial execution of invalid batches.
- ModelSelection/preference/config model inputs, Context Compiler/estimator/profile/output/safety, retrieval embeddings/index/threshold 0.65/top8/max3/deadlines, SessionMemory schemas/updater/extraction/persistence/provenance/rendering/deadlines, durable reducer/service/store and TUI production unchanged. `git diff --exit-code` over these protected paths and Phase 14–18 historical records passed; the complete status inventory also excludes all other historical records.
- No dependencies/lockfile/environment-file changes, new tools, generic writes/shell capability, provider/model branching, context/retrieval/memory quality work or TUI changes. Existing Phase 14 mutation safety, prepared execution and approvals passed deterministic/full gates. Build smoke is packaged validation, not a claim of native Windows execution.
- The final changed set is 14 tracked paths plus this progress document and `RunAgentTurnToolRecovery.test.ts`; no disposable fixture or generated artifact is in it. `git ls-files dist .agent` is empty. Live fixture cleanup independently confirmed. HEAD remains `645a43f38e16488417e879832f7dec907eff9bf2`, index empty, no commit made.
- Passing gates cover the final code and tests. Only this progress record changed afterward. Final whitespace/status checks complete the record without repeating expensive gates or live inference. No required Phase 18.1 implementation/verification work remains.
