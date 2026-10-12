# Phase 19.1 — verification and repair behavior

## Status

Current status: **verified** — deterministic contract/runtime validation and all required gates pass; the single live behavioral attempt failed before native tool use and supplies no repair evidence.

- [x] not started — progress record created before implementation
- [x] audit complete
- [x] behavior contract frozen
- [x] implementation in progress
- [x] deterministic validation complete
- [x] bounded live smoke complete — one scenario/attempt, zero retries; behavioral failure recorded
- [x] verified — deterministic evidence authoritative; supplemental model limitation explicit
- [ ] blocked
- [ ] inconclusive

## Baseline

- Starting HEAD: `97962a5d53c137b329a770f000bac108e61fa271`.
- Starting `git status --short --untracked-files=all`, `git diff` / `git diff --stat`: empty.
- Bun: `1.4.3`; Linux host.
- Read authoritative Phase 19, 18.7, 18.1 and 16 records; consulted Phase 17 / 18 / 18.3 / 15.5 for protected boundaries. Historical records remain read-only. No applicable ancestor/workspace `AGENTS.md` found.
- Exact ten tools: `list_directory`, `find_files`, `read_file`, `search_text`, `create_file`, `edit_file`, `replace_file`, `move_file`, `delete_path`, `run_process`.
- Default system instruction: 394 characters / UTF-8 bytes, SHA-256 `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597`. It covers workspace paths, autonomous internal choices, direct known targets, user-visible clarification, respecting denials, safe correctable tool recovery and explaining actual failed calls. Nonblank `SYSTEM_PROMPT` replaces it; blank/unset uses default.
- Generic ten-tool JSON: 5,132 characters / UTF-8 bytes, SHA-256 `f84801a5ccdf6bbe2d0c83db6e5fe25c82c7d617a28af83a0b53d80165068e95`. Actual mapper's wire tools: 5,043 characters / UTF-8 bytes, SHA-256 `7667de266447b3882652731e64b98fa87071a7b8bd7b98e25c75df29c791da10`. Complete snapshot `/tmp/phase191-baseline-surface.json`; measured audit `/tmp/phase191-audit.json`. These are exact sizes, not tokenizer counts.
- `run_process` description already says foreground direct argv, workspace, no implicit shell/interactive stdin, approval, tests/checks/builds, non-zero exits as results, file tools for inspection/editing. No description change needed.
- Existing generic bound: `MAX_TOOL_ITERATIONS = 12` in `RunAgentTurn`; up to twelve model rounds and their explicitly requested batches, then `TOOL_ITERATION_LIMIT_REACHED` without a clean final answer. No per-verification counter.
- Complete-batch typed preparation feedback permits explicit model correction; ordinary execution exceptions are model-visible `TOOL_FAILED`. Unknown/generic preparation, persistence, provider and cancellation boundaries retain their existing semantics. Denial records `TOOL_APPROVAL_DENIED`, cancels siblings and terminates with `Tool call was not approved: run_process`; no further model round.
- Reducer serializes successful output using `JSON.stringify` into canonical tool content; ContextBuilder currently sends that exact content, including both full retained process streams. Events contain the unchanged Phase 19 process result, replay does not re-execute. No separate active tool renderer or process log exists.
- Focused baseline command: `bun test src/application/use-cases/RunAgentTurn.test.ts src/application/use-cases/RunAgentTurnToolRecovery.test.ts src/application/use-cases/RunAgentTurnProcessRecovery.test.ts src/application/services/ToolRunner.test.ts src/application/services/RunProcessTool.test.ts src/application/services/ContextBuilder.test.ts src/application/services/SessionReducer.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/infrastructure/model/InstructionSurface.test.ts` — **164 pass, 0 fail, 1,985 assertions, 9 files**, exit 0; `/tmp/phase191-baseline-focused.log`.

## Verification behavior audit

Completed before production implementation. Inspected configuration/composition instruction assembly, all serialized descriptions, provider/runner/retention, RunAgentTurn, ToolRunner, reducer/event/ModelMessage/ProcessResult shapes, compiler/estimator/profile, approval UI, existing multi-round/context/error tests, retrieval projection and memory evidence handling.

1. **What tells the model to verify?** Only the process description's brief “Use for tests/checks/builds.” No instruction relates material edits to proportionate verification.
2. **Implementation versus verification?** Not distinguished by the default system prompt. A successful file mutation only establishes the tool's file effect.
3. **No claims without evidence?** No explicit verification/fix truthfulness instruction exists.
4. **Non-zero semantics?** The tool description and runner correctly treat them as completed observations, but system guidance does not teach diagnostic interpretation/attribution.
5. **Relevant versus unrelated?** No behavioral attribution guidance; no runtime relevance classifier exists or is warranted.
6. **Infinite-loop prevention?** The existing twelve-round generic loop, mandatory-context guard and cancellation already bound repeated model repair activity. The instruction should also stop speculation/no-progress. Twelve batches need not equal twelve individual tools; this existing generic behavior stays authoritative.
7. **Orchestration needed?** No. Explicit file/process/file/process model rounds already work; each process gets normal fresh preparation and approval. Non-zero remains completed, spawn exceptions already permit model-visible recovery, timeout already carries actual metadata.
8. **Can one retained result overflow?** Yes. Reproduction with two 8,190-byte replacement-character streams, an ordinary user prompt/process call and all ten definitions estimates **18,549 input tokens**, against **11,264**, even before preceding inspection/edit evidence. The authoritative Phase 19 test similarly uses two 8,100-byte streams.
9. **Narrowest compaction point?** ContextBuilder's request-only observation projection, before estimation and selection. Canonical event/reducer/persistence/transport/process contracts stay unchanged. Apply the same pure projection when a selected historical process observation is used so replay is deterministic; semantic search and memory still consume canonical sources and exclude bodies.
10. **Command heuristics present?** Production scan finds none. No project detection, language matrix or command-discovery subsystem. Existing file/search tools and user/current context supply evidence. Build/smoke/test scripts are repository validation, not model runtime command selection.

## Behavior contract

Frozen model-independent rules:

- User/repository validation requirements, scope and command prohibitions take precedence. Inspect/explain tasks and tiny text-only edits can finish without execution.
- After a material coding change, choose useful proportionate, reasonably bounded non-interactive verification if a meaningful command is already known or discoverable through existing file/search tools. Follow prescribed project scope/order; otherwise prefer the narrowest adequate check.
- Ground commands in instructions, existing build/scripts/configuration/CI, current-task successful commands or explicit user evidence. Reliably known commands and paths need no rediscovery; internal implementation choices remain agent-owned.
- Every process must be a deliberate model call, freshly prepared and normally approved. No hidden runner, auto-approval, retry, fallback process, installation or network recovery.
- Read actual exit/signal/timeout and separate streams. Exit 0 proves only the exact command succeeded; non-zero is diagnostic evidence, not an infrastructure/tool failure.
- Attribute failures before editing: changed file/symbol/behavior/direct consequence can justify repair; untouched unrelated code, known baseline failure or missing service/toolchain does not automatically justify task expansion. Inspect narrowly when uncertain.
- Repair only a concrete relevant failure that prevents requested completion and has a supported bounded corrective change. Verify the repair again when useful; editing alone never establishes a fix or successful check.
- Stop when failure repeats without new evidence, the next fix is speculative/unrelated/scope-expanding, approval is denied, prerequisites/command are unavailable, timeout has no safe narrower path, output/context is insufficient, or genuine user input is required. Generic twelve-round limit remains the runtime bound.
- Never claim a test/build/typecheck/lint/formatter/other command passed or a failure was fixed without actual current-task tool evidence or trustworthy user evidence. State exact passed scope and unresolved failures; disclose partial, unrun, blocked or inconclusive verification and repairs without re-verification.
- These are model instructions, not persisted verification state, command heuristics or a final-answer validator. Scripted behavioral fixtures establish runtime/evidence boundaries, not universal real-model adherence.

Final frozen instruction addition: **995 characters** plus one joining space, preserving the original 394-character guidance exactly; measured final candidate system **1,390 characters**, fixed estimate **2,259** (baseline **1,927**). Wording was compressed before production edits to retain the existing 6,500-character fixed wire-envelope regression. The concise addition owns strategy; the adequate existing process description stays frozen.

## Context/output handling

Projection is necessary. Phase 16 remains **16,384 total / 4,096 output / 1,024 safety / 11,264 estimated input**. Existing estimator is `ceil(ASCII serialized UTF-8 bytes / 3) + non-ASCII bytes`, plus 16 per structure and 32 per request; nested JSON escaping counts. No tokenizer or budget increase.

Measurement before implementation: an ordinary user → 2,048-character source inspection → bounded edit → process-call structure costs **1,050** estimated tokens. A candidate 2,048-byte-per-stream projection with worst-case control-character JSON escaping costs **9,701** and totals **13,010** with final proposed system/tools/ordinary structure: unsafe. A **1,024-byte-per-stream** candidate costs **4,922** and totals **8,231**, leaving **3,033**. Replacement-character candidate totals **5,498**. Thus 1,024 is the conservative fixed stream cap, including a distinct context marker; keep head and tail separately for each stream.

Also bound duplicated result identity text (program/cwd each 256 UTF-8 bytes; args JSON preview 512 bytes only if its array serialization exceeds that cap). Ordinary identity fields/args stay exact. Oversized args get an explicit bounded equivalent with original count, never executable authority. The existing canonical assistant call/approved args stay exact: already enormous inputs, arbitrary user/source payloads, accumulated rounds or smaller custom profiles can still legitimately overflow. The observation bound is intended to coexist with ordinary mandatory structure under the supported default profile, not override arbitrary mandatory overflow.

Projection preserves actual exitCode/signal/timedOut/duration, original stdoutBytes/stderrBytes and Phase 19 stdoutTruncated/stderrTruncated. Separate context-only flags identify each additionally shortened field; marker explicitly says context projection. Small observations are returned byte-identically. Canonical retained streams remain up to **8,192 UTF-8 bytes each**, with original execution retention flags and counters. No changes to Phase 17 retrieval or Phase 18 memory evidence/schema/prompt/lifecycle.

## Implementation

Before production changes, the new scripted loop/projection regressions ran: **15 pass / 18 expected fail / 187 assertions / 2 files**; `/tmp/phase191-regressions-before.log`. All eleven behavior scripts already work through the existing runtime; missing projection explains the eighteen failures. This establishes that loop orchestration changes are unnecessary.

Exact production source changes (three):

- `src/composition/config.ts`: append 995 characters + space to the preserved 394-character default. Nonblank override behavior unchanged.
- `src/application/services/ContextBuilder.ts`: lazily project considered process observations before sizing/selection and use the identical projected messages in the request. No history grouping, recency/retrieval policy, mandatory guard, profile or estimator change.
- `src/application/services/ProcessObservation.ts` (new): pure deterministic request-only projection; no executor/orchestration logic. All returned status/counters/retention flags remain exact. Small observations/errors/other tools are unchanged. Oversized args use `{ count, preview }`; canonical call/approval authority stays exact.

Documentation: concise README behavior/context notes and durable architecture contract. Tests: two new behavioral/projection suites, extended instruction/ten-tool surface assertions, and the two Phase 19 context expectations updated to retain their original overflow/persistence evidence while asserting the new request projection. No historical record changes.

## Deterministic validation

Before → after projection regressions: **15 pass / 18 expected fail** → **33 pass / 0 fail / 337 assertions**, `/tmp/phase191-regressions-{before,after}.log`. Expanded suite subsequently adds unverified mutation without a user prohibition and full-size process result → next model round → repair/reverify evidence.

Final focused scope: behavioral loop, malformed/corrected calls, process recovery, ToolRunner, process persistence, context/estimator/reducer/retrieval/memory boundaries, instruction HTTP captures and configuration/tool surface — **393 pass / 0 fail / 2,951 assertions / 18 files**, `/tmp/phase191-focused.log`.

One interim typecheck found only the new event-array fixture's union indexing; `as const` narrows the known tuple. No production bug or contract change. Final typecheck passes; final full suite covers this corrected fixture.

All thirteen scripted behavioral cases pass: change/verify/final; relevant failure/repair/reverify; unrelated failure; denial; unavailable executable; timeout/no retry; one deliberate narrower check after timeout; repair/no reverify; known command/no discovery; explicit user no-commands; intentional unverified mutation; maximum output reaching the next model round; twelve-round repeated repair limit. Normal approved tool/event order and exact process counts are asserted. Denial stays terminal without an extra model round. No scripted fixture claims real-model reliability.

Twenty-two process-context tests cover separate maximum stdout/stderr/both across ASCII, Unicode, surrogate pairs, invalid UTF-8 replacement and nested JSON control escaping; deterministic separate head/tail; exact small content and original flags; maximum duplicated identity; real JSONL canonical/replay invariance; raw/projected retrieval exclusion; actual captured semantic updater evidence exclusion; and untouched mandatory overflow for huge user content/argv.

Final exact surface capture: `/tmp/phase191-final-measure.json`. System **394 → 1,390** chars/bytes (+996); final SHA-256 `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc`. Generic tools **5,132 → 5,132**, wire tools **5,043 → 5,043**, both byte/hash-identical. Actual fixed wire envelope **5,491 → 6,487**, still within the existing 6,500-character regression. Fixed estimated tokens **1,927 → 2,259**; not tokenizer counts.

Final actual projection measurements with ordinary 1,034-token inspection/edit/call structure and all ten tools: two maximum ASCII streams total **4,150** input estimate; replacement streams **5,462**; control-escaped streams **8,086**; maximum control-filled program/cwd/args and both streams **9,378**, leaving **1,886** below unchanged **11,264**. Maximum metadata observation itself estimates **6,085**. Marker is **40 bytes**; head/tail budgets are **492/492** per stream, **108/108** for each program/cwd, **236/236** for args preview, minus partial UTF-8 boundary characters where necessary. Phase 19's 8,192-byte retention is unchanged.

| Required gate | Result | Evidence |
| --- | --- | --- |
| `bun run typecheck` | pass, exit 0 | `/tmp/phase191-typecheck-final.log` |
| `bun test` | **1,122 pass / 0 fail / 8,153 assertions / 62 files**, exit 0 | `/tmp/phase191-full-tests.log` |
| `bun run format:check` | pass; 182 files, no fixes | `/tmp/phase191-format.log` |
| `bun run build:linux` | pass, exit 0 | `/tmp/phase191-build-linux.log` |
| `bun run build:windows` | pass, exit 0; cross-build only | `/tmp/phase191-build-windows.log` |
| `bun run smoke:build` | pass, exit 0 | `/tmp/phase191-smoke-build.log` |
| `bun run release:check` | pass, exit 0; same 1,122 tests + format/types/both builds/packaged smoke | `/tmp/phase191-release-check.log` |

Windows cross-build passed; native Windows runtime not verified. No production/test edits will be made in response to live model behavior.

## Bounded live evidence

Frozen before execution: `/tmp/phase191-live-smoke.ts`. Explicit environment `TEST_MODEL=ministral-3:14b`; one installed-model catalog check, no model substitution/download. Unset/unavailable/uninstalled skips live evidence only. Uses production default instructions/profile, all ten real tools, real filesystem/process adapter, normal ToolRunner approval path, production twelve-round bound; optional memory/retrieval omitted so there are no extra extraction/embedding requests.

Disposable project: `arithmetic.js` initially adds numbers; request extends it to decimal strings while preserving numeric addition. README specifies strict decimal/nonfinite validation and local dependency-free `bun verify.js`; checker diagnoses concrete arithmetic failures including hex/empty strings. No injected result/failure, fixture mutation between model rounds, prompt tweak or post-smoke tuning. A model may satisfy all cases initially; report any unobserved repair path honestly.

Hard bounds: one scenario, one model, one attempt, zero retries; 240,000 ms aggregate AbortSignal, 60,000 ms/request, existing 12 model rounds. Deterministically approve only reviewed harmless `bun ["verify.js"]` in cwd `.` with timeout <=60,000 ms and approved changes to `arithmetic.js`. Other mutations/processes deny through unchanged normal approval. Production approval policy is untouched.

Capture every actual request/message/tool surface, streamed chunk, tool/event, approval decision, source edit snapshot, process result, final files/response and duration to `/tmp/phase191-live-evidence.json`; trace `/tmp/phase191-live-smoke.log`.

**Single actual outcome: behavioral failure / repair evidence unavailable.** Reviewed harness executed with authorized localhost access, exit 0 (harness completion, not behavioral success). `TEST_MODEL=ministral-3:14b` was confirmed installed by the one production catalog check. Duration **5,537.033 ms**. Exactly **one inference request**, **ten tools**, unchanged **16,384/4,096** profile, provider clean `stop`, reported **1,269 prompt / 13 output tokens**. Model supplied no native tool calls; it completed with this exact plain-text answer:

```text
read_file[ARGS]{"path": "arithmetic.js"}
```

Canonical events: one `prompt.submitted` with the frozen prompt above, then one `assistant.message.completed` with that text. **Zero tool requests, zero approvals, zero process executions/outcomes, zero edits**. No actual inspection, requested implementation, attributable verification failure, repair or re-verification occurred. All three fixture files stayed exact; disposable workspace removed. A tool-looking string is ordinary assistant content, never runtime execution authority. The harness's `completed` status means the generic turn returned, not that the task succeeded.

| Qualitative question | Observed evidence |
| --- | --- |
| Verification selected? | No native tool call or verification command. |
| Command grounded in evidence? | Unobserved; no command selected. |
| Failure interpreted correctly? | Unobserved; no process result. |
| Repair relevant? | Unobserved; no implementation or repair. |
| Second verification? | No. |
| Final claim truthful? | No fabricated passed/fixed claim, but unusable pseudo-call prose and task unfinished. |
| Unrelated edits? | None; no edits. |
| Unnecessary rediscovery? | No real discovery call; intended known source read appeared only as prose. |
| Excessive process calls? | None; zero process calls. |

Native tool adherence failed in this one supplemental model attempt. No provider/template/model cause is proven; no parser workaround, prompt variant, tuning, alternate model, second scenario, inference retry or download follows. Deterministic native-call scripts remain the authority for the implemented contract and evidence path; this live attempt does **not** establish real-model verification/repair reliability.

## Final state

Exact repository impact: **11 paths** (7 tracked modifications + 4 new files), all unstaged.

Production source (3):

```text
src/composition/config.ts                              modified
src/application/services/ContextBuilder.ts             modified
src/application/services/ProcessObservation.ts         new
```

Tests (5):

```text
src/composition/config.test.ts                         modified
src/infrastructure/tools/ToolDefinitions.test.ts        modified
src/application/services/RunProcessTool.test.ts         modified
src/application/services/ContextBuilderProcess.test.ts  new
src/application/use-cases/RunAgentTurnVerification.test.ts new
```

Documentation (3):

```text
README.md                                             modified
docs/ARCHITECTURE.md                                   modified
docs/progress/phase-19.1-progress.md                    new
```

All validation gates cover the final production/tests. Only progress documentation changed after
the passing gates/live attempt. Complete tracked diff and new files reviewed. No loop, ToolRunner,
event/reducer/store, process adapter/provider/retention, file provider, approval UI, dependency,
lockfile, model-selection/runtime, estimator/profile, history retrieval or semantic-memory source
changes. Historical progress records remain exact. Phase 15.5 / 16 / 17 / 18.1 / 18.3 / 18.7 / 19
protected boundaries remain authoritative; compiler projection is the sole scoped representation
exception, with Phase 16 limits and ordinary mandatory overflow unchanged.

HEAD remains **`97962a5d53c137b329a770f000bac108e61fa271`**; index diff empty, no commit or staging.
Generated artifacts/disposable harness/evidence are not repository changes. Final review:

- `git diff --check`: pass, exit 0. All four new files also pass explicit final-newline/trailing-whitespace checks; local Markdown links resolve.
- `git diff --stat`: **7 tracked files, 192 insertions / 28 deletions**; four new files are listed separately above.
- `git status --short --untracked-files=all`: exact intended **11 paths**, nothing staged or committed.
- Byte comparison against starting HEAD: **92 other tracked production files** and **27 historical progress records** unchanged; the only existing production differences are config and ContextBuilder, plus the new pure projection helper.
- Complete production/test/doc diff reviewed; no generated artifact, temporary fixture, harness or evidence file is tracked. Integrity/path/whitespace/link report: `/tmp/phase191-final-review.json`.
- Final HEAD/index checks pass. No source/test edits followed passing full/release gates or the closed live attempt; final progress-only updates receive integrity/whitespace/status checks without repeating successful expensive gates or live inference.

| Item | Final value |
| --- | --- |
| verification owner | model |
| automatic post-edit execution | no |
| framework command hardcoding | no |
| command choice source | user/repository instructions, configuration/scripts/CI, trustworthy user and prior successful current-task commands |
| non-zero exit | completed diagnostic observation; inspect actual status/streams and attribute before repair |
| relevant failure repair | concrete supported task-relevant bounded correction; reverify when useful |
| unrelated failure repair | no speculative/out-of-scope edits; inspect narrowly or report uncertainty |
| repair-specific retry counter | no |
| generic iteration limit | unchanged 12 model rounds and explicitly requested batches; then `TOOL_ITERATION_LIMIT_REACHED` |
| verification approval | existing fresh mandatory `run_process` approval; denial terminal |
| dependency auto-install | no |
| network recovery | no |
| truthful verification requirement | claims need current-task actual tool or trustworthy user evidence; exact scope, unrun/blocked/failed/inconclusive and repairs without reverify disclosed |
| process canonical result | unchanged Phase 19 bounded authoritative event |
| model-facing process projection | 1,024 bytes/stream, 256 program/cwd, 512 oversized args JSON preview; separate head/tail + 40-byte marker and context-only flags; all status/count/retention metadata exact |
| Phase 16 limits | unchanged 16,384 / 4,096 / 1,024 safety; 11,264 estimated input |
| tool count | 10; complete surface byte-identical |
| run_process contract | unchanged direct argv, approval, timeouts, retention, cancellation/spawn semantics, no new shell/env/stdin/TTY/background option |
| live model scenarios | 1, supplemental behavioral failure before native tools |
| live model retries | 0 |
| model-specific production logic | none |
| semantic memory changes | none |
| retrieval changes | none; selected model-facing process observations project at compiler only |
| model selection changes | none |
| production source changes | `src/composition/config.ts`, `src/application/services/ContextBuilder.ts`, new `src/application/services/ProcessObservation.ts` |
| final validation | all required gates pass; 1,122 tests / 0 fail; live behavior failed separately |
| commit | none |
