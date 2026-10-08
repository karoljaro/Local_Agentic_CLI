# Phase 15 — model-facing instruction surface

## Status

verified — implementation, instruction inventory, size reconciliation, production diff review and all deterministic/release gates are complete. The user explicitly stopped further local-model experiments and accepted the collected evidence; missing optimized cases/repetitions are not additionally sampled, not blockers. Both the comparison client and the task-owned Ollama server have stopped. No further model requests, benchmark scripts, production wording changes, phase restart or new session.

The previous localhost approval request was never surfaced or available to the user. That specific pending query is unavailable/stale and is no longer a valid blocker; the phase continued from its recorded checkpoint.

## Baseline

- Starting HEAD: `1ea5d7093d2a67728c97bb8c20da853aa140b2f9`.
- Starting `git status --short --untracked-files=all`, `git diff`, and `git diff --stat`: empty; clean workspace.
- Bun: `1.4.2`.
- No applicable `AGENTS.md` in the repository or its ancestors.
- Fresh execution session explicitly requested by the user: `01a11c56-d7de-78a0-82f1-f2910ab4070a`, titled `Phase 15 — model-facing instruction audit`; no further session or agents started. The parent verified this session's `turn_context` metadata: model `gpt-6.1-sol`, effort `max`. Max reasoning was inherited; no setting change was needed.
- Resumed existing parent metadata also confirms `gpt-6.1-sol` / effort `max`; no replacement session or settings change.
- Configuration defaults: `gemma4:12b-it-qat`, `http://localhost:11434`, `OLLAMA_KEEP_ALIVE=0`, `MAX_CONTEXT_CHARACTERS=120000`; `SYSTEM_PROMPT` can replace the default after trimming, with blank values falling back to it.
- Starting resolved environment differed only in model selection: `llama3.2:1b-instruct-q4_K_M`; starting system text was the same default. The empirical primary was the already-installed Phase 14 capable model `gemma4:12b-it-qat`. No environment/model-selection configuration was changed by this phase.
- Starting default system text: `You are a local coding agent.` (29 characters).
- Nine Phase 14 tools remain the fixed surface: `list_directory`, `find_files`, `read_file`, `search_text`, `create_file`, `edit_file`, `replace_file`, `move_file`, `delete_path`.
- Phase 14 recorded serialized tool size: 4,679 characters. Parent independently reproduced this through the real request path with a capture-only mocked HTTP transport; all nine per-tool sizes match Phase 14.
- Baseline `bun run release:check`: independent parent review PASSED, exit 0; 527 tests, 0 failures, 5,551 assertions across 33 files; format/typecheck, Linux/Windows builds, and artifact smoke all passed. Temporary log: `/tmp/phase15-parent-baseline-release.log`. This existing checkpoint was used before implementation; no restart was needed.
- Previous blocker (superseded): the fresh session reported `active` / `waitingOnApproval` / turn `inProgress` for `curl --max-time 10 --silent --show-error http://localhost:11434/api/tags`. The user subsequently confirmed that this approval was never surfaced in the UI and explicitly directed continuing from this checkpoint without waiting for it. The specific query was treated as unavailable/stale. The existing parent session continued implementation in the shared worktree; the inaccessible task was told to avoid concurrent edits if it later resumes. No new session or phase restart. The continuation plan first attempted normal read-only CLI discovery, then used verified Phase 14 installed-model evidence until model smoke became available. Localhost access did not block static work.
- Normal `ollama list` retry: exit 1, `socket: operation not permitted` for `127.0.0.1:11434`. Used Phase 14 installed-model evidence at that checkpoint rather than waiting on discovery; permitted model execution became available later as recorded below. Baseline instructions/full schemas and actual wire body are preserved in `/tmp/phase15-baseline.json` for identical old/new fixtures.

## Model-facing instruction inventory

The actual path is `readConfig` → `createRuntime` → `ContextBuilder.build` → `RunAgentTurn` / `ModelPort.streamChat` → `OllamaModelAdapter` → `OllamaHttpClient.postJson`. Phase 7/8 records confirm canonical state/reducer request ownership and exact character accounting; these production paths are unchanged.

Other inventoried source paths: `src/application/services/{SessionReducer,ToolRunner}.ts`, `src/application/use-cases/file-operations/EditWorkspaceFile.ts`, `src/infrastructure/file-system/NodeWorkspaceFileSystem.ts`, `src/infrastructure/tools/ripgrep/RipgrepSearch.ts`, `src/infrastructure/tools/LocalToolExecutor.ts` (`LocalToolRegistry`, `toToolDefinition`), `src/infrastructure/tools/LocalTool.ts` (`defineLocalTool`), `src/infrastructure/model/mappers/OllamaChatMapper.ts`, and `src/infrastructure/model/ollama/OllamaHttpClient.ts`. The symbols and conditional text from these files are classified below.

All counts below use runtime strings or serialized fragments from the actual request body. Description values are ASCII; their standalone JSON strings add two quote characters. Tool/schema totals include JSON keys, constraints and quoting, and are not sums of prose alone. Conditional payload sizes depend on paths/content/errors, so representative serialized examples are identified explicitly.

| Origin file / symbol | Baseline serialized size | Purpose / inclusion / overlap |
| --- | ---: | --- |
| `src/composition/config.ts` / `ConfigSchema.SYSTEM_PROMPT` | 29 content; 61 for its serialized system-message array | Sole production default; one system message per request; baseline role boilerplate with no operational guidance |
| `readConfig` / `envString`, environment `SYSTEM_PROMPT` | Variable; baseline 29 content | Trimmed nonblank override replaces default, never appends it; blank/unset use default |
| `src/composition/createRuntime.ts`, `ContextBuilder.constructor/build` | 0 additional instruction characters | Pass and wrap configured text once; no appended manual, tool-selection hints, retrieved instructions or per-round suffix |
| `RunAgentTurn.runTurn/buildModelMessages`, `ModelPort` | 0 additional instruction characters | Send canonical history and the same full nine-tool array every round; IDs/metrics/limits are not added instructions |
| `LocalToolExecutor.ts` / `toToolDefinition`, `LocalTool.ts` / `defineLocalTool` | 4,679 for the transported tool array | Zod-to-JSON conversion strips `$schema`; strictness/constraints/descriptions remain. Internal approval, dedup and invalidation metadata are excluded by transport |
| `OllamaModelAdapter`, `OllamaChatMapper.toOllamaMessage/toOllamaTool`, `OllamaHttpClient.postJson` | 0 appended prose; fixed instruction fields 4,762 including envelope | Actual serializer: maps messages/tools, then `JSON.stringify(body)`; model/keep-alive/stream are protocol configuration, not instructions |
| `SessionReducer.toToolMessage/stringifyToolOutput` | Variable; JSON error envelope adds 24 for an ordinary unescaped message | Serialize success data or `{error:{message}}`, without descriptions, stacks, error codes or hidden tool manual |
| `ToolRunner.createCachedToolOutput` | 94 with source ID `example` | Conditional `{cached,sourceToolCallId,message}` reference; includes `Result reused from tool call ….`; preserves meaning of a deduplicated result |
| `ToolRunner.executeToolCalls` / denial and subsequent batch cancellation | 63 / 82 for `delete_path` error payloads | Conditional lifecycle status; denial is also terminal assistant text. Existing lifecycle/history behavior retained |
| `EditWorkspaceFile.execute` / missing, ambiguous, overlapping edits | 120 / 110 / 105 with `src/stale.conf`, edit 1 | Conditional error guidance: reread exact current content, include unique context, combine overlaps; duplication with the normal exact-edit contract is useful on failure |
| `ReadFileProvider.ts` / `sliceFile` | Variable | Conditional line/offset-out-of-range facts; argument refinements fail before entering model history; successful partial reads supply data/continuation, not an appended manual |
| `ReplaceFileProvider.execute` / stale read version | 107 with `config/legacy.json` | Conditional reread-before-replacing guidance; `expectedVersion` schema explains source on successful calls |
| `NodeWorkspaceFileSystem.writeFile` / optimistic content mismatch | 85 with `src/stale.conf` | Conditional reread instruction for a stale write; does not belong in every system prompt |
| `NodeWorkspaceFileSystem.deletePath`, `moveFile` | 84 with directory `notes`; 120 for `notes/draft.txt` → `notes/final.txt` | Nonempty-directory and partial-move recovery; operation restrictions also appear in definitions |
| `NodeWorkspaceFileSystem.compileFilePattern` | 111 | Unsupported-glob failure explains allowed wildcards; same normal-call semantics belong in `pattern` |
| `NodeWorkspaceFileSystem.reserveTemporaryFile/cleanupFailure/createFileAtomically` | Variable; warning string 68 for `.tmp-a.txt-example` | Conditional retry/remnant cleanup guidance; successful create warnings are an array, not an error envelope |
| `NodeWorkspaceFileSystem` / path resolution, policy, type/size checks, `pathError`; `RipgrepSearch` / `runRipgrep/parseRipgrepMatch/parseRipgrepJsonLine` | Variable | Conditional facts: absent/existing path, outside/protected/symlink/root path, wrong path type, size, permission, unsupported platform names, cross-filesystem operation, search unavailable/timeout/exit/invalid JSON; compact diagnostics, not behavioral manuals |
| Workspace file text, search excerpts, user/assistant text and historical results | Variable | Conversation/tool data, potentially containing quoted instructions; not application-injected fixed guidance and not changed here |
| Installed model/runtime framing, inspected via `/api/show` for `gemma4:12b-it-qat` | No model-defined system string; rendered framing not exposed as serialized characters | Metadata reports template `{{ .Prompt }}` and no `system` field. Its template source length is not treated as model-facing size. Native prompt counters include runtime framing; it is unchanged and no application instruction depends on this provider template |

`LocalToolRegistry.prepare` Zod argument errors/unknown-tool errors terminate the turn before a tool batch enters model history. `RunAgentTurn` agent errors, adapter/transport failures, constructor/configuration errors, cancellation exceptions and context-budget messages are presentation/lifecycle diagnostics; `SessionReducer` ignores `agent.error`. They are not extra model-visible instructions. `README.md` had a copied default in a configuration example; it can become an environment override when copied but is not loaded directly. `.env.example` sets only model/base URL/context limit and contributes no system instruction. Presentation descriptions, approvals, CLI help, progress records and test fixtures are not injected into requests. Provider-specific chat templating is owned by the external runtime, not application prompt composition.

Each tool's top-level description is always included, once per full tool array:

| Origin `src/infrastructure/tools/providers/` / symbol | Description chars | Standalone wire definition chars | Schema chars | Purpose / overlaps |
| --- | ---: | ---: | ---: | --- |
| `ListDirectoryProvider.ts` / `listDirectoryTool` | 181 | 476 | 208 | Typed directory/tree inspection; repeats workspace paths, default depth and filename-tool advice |
| `FindFilesProvider.ts` / `findFilesTool` | 159 | 541 | 299 | Filename/glob discovery; repeats workspace paths and implementation traversal limits |
| `ReadFileProvider.ts` / `readFileTool` | 204 | 856 | 570 | Current text, ranges and lossless continuation; repeats cursor advice and replacement-version source |
| `SearchTextProvider.ts` / `searchTextTool` | 148 | 481 | 249 | Literal content search; repeats filename-tool advice and literal-query property |
| `CreateFileProvider.ts` / `createFileTool` | 101 | 343 | 158 | New file plus missing parents; repeats workspace paths |
| `EditFileProvider.ts` / `editFileTool` | 143 | 647 | 422 | Unique nonoverlapping local edits against original content; repeats workspace paths |
| `ReplaceFileProvider.ts` / `replaceFileTool` | 171 | 542 | 286 | Existing whole-file replacement; repeats workspace paths, version source and neighboring edit choice |
| `MoveFileProvider.ts` / `moveFileTool` | 156 | 422 | 184 | One regular-file move, no overwrite, missing parents; repeats workspace paths |
| `DeletePathProvider.ts` / `deletePathTool` | 157 | 361 | 120 | File/empty-directory deletion; repeats workspace paths and nonempty-directory recovery |
| Total array (including brackets and separators) | 1,420 | 4,679 | 2,496 | Nine unchanged capabilities |

Every Zod property description is listed below; other properties have no description. All are always included in their tool definition. Existing `.refine` messages are validation diagnostics, not serialized descriptions.

| Origin property / provider | Content chars / standalone JSON chars | Semantics / overlap |
| --- | ---: | --- |
| `depth` / ListDirectory | 26 / 28 | Levels and default 1; duplicates top-level default depth |
| `pattern` / FindFiles | 101 / 103 | Supported glob syntax, basename versus scoped path matching; required semantics |
| `startLine` / ReadFile | 63 / 65 | One-based default 1 and exclusion with offset; `First line` repeats property name |
| `startOffset` / ReadFile | 73 / 75 | UTF-16 zero-based cursor plus repeated `nextRead` advice |
| `endLine` / ReadFile | 53 / 55 | Inclusive end, excludes following newline; `Last line` repeats name |
| `query` / SearchText | 64 / 66 | Single-line literal text, whitespace/pipes; duplicates literal search concept but adds important preservation semantics |
| `edits[].newText` / EditFile | 52 / 54 | Literal replacement and empty deletion; required semantics |
| `expectedVersion` / ReplaceFile | 30 / 32 | Version source is `read_file`; duplicates read/replace top-level advice |

## Duplication audit

The baseline system sentence identifies the role but neither explains workspace paths nor changes any particular action. Its API-contract audit: role identity is boilerplate; replace it with one existing cross-tool fact, workspace-relative paths, instead of adding a nine-tool manual. Do not add completion/read/retry/avoid-calls rules without demonstrated benefit. Exact-edit and stale-version errors already carry local recovery guidance.

Repeated concepts: workspace-relative paths in eight tool descriptions; `nextRead` in the read description and cursor property; version source in read description, replace description and `expectedVersion`; filename-versus-content advice in list/find/search descriptions; depth default in description/property; literal search in description/property; empty/nonempty deletion in description/error. Keep failure-specific guidance and all execution payloads unchanged. Most other schema fields already avoid unnecessary prose.

Pairwise choice review:

- list versus find: typed directory entries/tree versus recursive glob-matched file paths.
- find versus search: names/paths versus literal text inside files.
- search versus read: locate bounded excerpts versus retrieve actual current text/ranges/continuation.
- create versus replace: new/no-overwrite plus parents versus an existing complete file guarded by its read version.
- edit versus replace: local exact unique regions versus complete content; preserve explicit local-edit preference on replace.
- move versus create/delete: rename/move one existing regular file without copying contents through the model; no overwrite.
- delete versus edit/replace: remove the path versus remove/change text within an existing file; empty directories only and never recursive.

## Proposed optimized contract

Recorded before production edits:

- System default: `Use workspace-relative paths.` Same 29 characters as the baseline; one useful agent-wide fact replaces role boilerplate. Explicit `SYSTEM_PROMPT` replacement semantics stay unchanged and will be documented.
- Operation descriptions communicate directory entries, globbed file paths, literal contents, current reads, new creation, local batch edits, whole-file replacement, regular-file move, and file/empty-directory delete.
- Remove repeated workspace-path sentences and obvious property-name restatements; keep root defaults, glob limitations/scope, UTF-16 indexing, inclusive ranges, exact unchanged `nextRead`, partial-line metadata, unique/nonoverlapping original matches, literal/empty replacements, read-version source, stale rejection, no overwrite and nonrecursive deletion.
- Keep outputs/errors, all schema constraints and lifecycle metadata byte-for-byte equivalent; no filesystem/search/runner/context/provider behavior edits.
- Candidate echo instruction for isolated A/B diagnostics only: `Use tool calls; do not print tool schemas or tool-call JSON.` Retain only if actual model runs demonstrate value. No parser workaround.
- Add captured-request and footprint guards with maintenance headroom; all nine definitions must appear once in every real request, including recovery rounds and explicit system overrides.

## Experiment matrix

Baseline and optimized runs used the same `gemma4:12b-it-qat`, production adapter/loop/executor, identical isolated fixtures and sampler settings. The saved baseline changes only system/definition wording in the harness; live tool functionality stays identical. No model downloads. Each workflow began with a fresh in-memory session and disposable filesystem; mutations were auto-approved only there. The original plan repeated discovery/find/search/multi-edit/replace/stale cases once; baseline repetitions completed, optimized repetitions were not additionally sampled after the user's stop instruction. Model metrics are empirical, separate from deterministic safety/serialization evidence.

Temporary harness: `/tmp/phase15-model-comparison.ts`, plan verified before running. The current-session permitted retry succeeded; installed-model metadata confirmed native tools/thinking support, thinking defaults on and supports `false`. A provider-default pilot had 90-second request timeouts and was explicitly cancelled (exit 130) after confirming natural filename search and two-edit batching. It is retained separately at `/tmp/phase15-model-pilot-defaults.{log,json}` and is not mixed into the paired comparison. The comparison used the same model, `keep_alive=5m`, temperature 0, seed 7, 512 generated-token diagnostic cap, native `think=false`, initially 90-second request / 240-second turn timeout for both variants. These temporary HTTP controls/counter collection did not change production configuration, orchestration, adapter parsing, history, context-window management, or tool functionality. Historical command: `bun run /tmp/phase15-model-comparison.ts both gemma4:12b-it-qat`; it is stopped and will not be rerun. The old request snapshot allowed a genuine baseline after wording edits with identical execution behavior.

Environmental interruption: after 17 baseline and three optimized successful runs, the optimized create request lost its socket before any tool call; the service then returned connection refused. This is retained as an interrupted transport attempt in `/tmp/phase15-both-capable-interrupted.json`, outside paired behavior totals. Started the already-installed Ollama locally (`127.0.0.1:11434`, version 0.35.1, CPU) with permitted access; `/api/show` again confirmed the same installed capable model. Resumed the existing harness with `--resume`: all 20 completed runs preserved, same settings/fixtures/system/schema snapshots enforced, only the 14 unfinished cases run. No phase restart, Codex session, model download, or production service/runtime change. The old unsurfaced curl approval remains stale and irrelevant.

CPU allowance checkpoint: nested creation and multi-edit then passed; replacement hit the harness's 90-second request deadline after list/read and before a mutation, and stale recovery hit that deadline before its first call. Native timing logs support slow CPU processing; these incomplete transport attempts were archived rather than called behavioral regressions or tool failures. Cancelled the owned comparison process (exit 130), increased only temporary wall-clock allowances to 300 seconds/request and 900 seconds/turn, and resumed with `--slow-cpu --repeat-pairs=replace,stale`. Both longer-allowance baseline repetitions reproduced the original replacement/stale behavior; the first optimized replacement and stale-recovery cases subsequently passed. Optimized second repetitions were not additionally sampled. Other completed results were preserved. Per-result allowances are recorded. Model, sampler options, thinking setting, output cap, prompts, fixtures, instruction snapshots and production behavior were unchanged. No latency claims are inferred across the service interruption.

The user confirmed the laptop was in eco mode because its battery was low; inference remained sequential and power settings were unchanged. Longer-allowance successful runs support the timeout diagnosis, without claiming that every interruption was a timeout (the earlier service failure was a separate transport interruption).

Final stop checkpoint: the user explicitly accepted the collected evidence as sufficient and stopped all further local-model experiments. The client stopped with exit 130; the task-owned Ollama server stopped with exit 0. `/tmp/phase15-both-capable.json` contains 26 completed results: 17 baseline and nine optimized. Optimized deletion completed before cancellation; optimized conversation produced no completed result and is not additionally sampled. No optimized echo diagnostic, extra repetitions, 1B probes, candidate echo-rule A/B, isolated-token probes, further Ollama requests or additional benchmark scripts were run after this instruction. These omissions are documented limits, not outstanding phase blockers.

| Workflow | Fixed prompt | Expected natural choice / independent outcome |
| --- | --- | --- |
| Discovery/read | Inspect the top-level layout, find the deployment guide, read it, and tell me which port staging uses. Do not change files. | list/find → read → answer 7314; no mutations |
| Filename search | Find files whose filename matches Invoice*.ts. Report paths without reading file contents. | `find_files`; `src/InvoiceStore.ts` |
| Content search | Find the literal text InvoiceFlag in file contents. Report matching paths and line numbers. | `search_text`; `src/settings.ts`, not filename-only decoy `docs/InvoiceFlag.md` |
| Nested create | Create src/features/auth/config/defaults.ts with exactly this content: `export const authEnabled = true;` followed by a newline. | One create, several missing parents; exact content |
| Multi-edit | In src/settings.ts, change mode from dev to prod and retries from 1 to 3. Preserve everything else. | read → one edit call with two entries; exact content |
| Replace | Replace the entire config/legacy.json with exactly `{"version":2,"enabled":true}` followed by a newline. Do not preserve legacy fields. | read → replace with that file's version; exact content |
| Stale recovery | Set the value of mode in src/stale.conf to prod. Preserve any other settings. | Harness changes dev to staging immediately before first edit; actual missing-oldText failure → read → retry; `mode=prod\n` |
| Move | Rename notes/draft.txt to notes/final.txt. | `move_file`; source absent, original contents preserved |
| Delete | Delete notes/disposable.txt. | `delete_path`; target absent; no recursive behavior |
| No-tool conversation | What is 6 multiplied by 7? Answer briefly. | Zero tools, answer 42 |
| Schema echo | List the root directory and summarize the entries in one short sentence. | Structured list call; no definition/schema/call JSON as ordinary text |

The installed 1B model was an optional schema-echo/instruction-sensitivity diagnostic; it was not run. The candidate echo-rule A/B was also not run. Ordinary assistant content and structured tool calls were inspected in the completed capable-model traces; printed JSON was never reinterpreted as a call. Comparison fields: correct first tool, calls, rounds, failed/invalid calls, repeated reads/searches, unnecessary mutations, echo, completion and useful final answer.

## Size comparison

Independent parent baseline capture used `readConfig({})` → `ContextBuilder.build` with empty conversation messages → `OllamaModelAdapter.streamChat` → the actual serialized HTTP body captured by a mocked `fetch`. No network request or production instrumentation was used. System content: 29 characters; serialized system-message array: 61; serialized tool array: 4,679; content + tool definitions: 4,708; serialized `{messages: systemMessages, tools}`: 4,762. These wire-envelope counts are kept separate from instruction-content counts.

Post-edit actual-path capture (`/tmp/phase15-optimized.json`): system content 29; system array 61; tools 4,211; content + definitions 4,240; serialized fixed fields 4,294. All schema constraints and approval/dedup/invalidation metadata compare identically to the baseline after removing only description fields. No functionality changes.

| Surface | Before chars | After chars | Change | Purpose |
| --- | ---: | ---: | ---: | --- |
| System instructions | 29 | 29 | 0 | One cross-tool path rule replaces role boilerplate |
| Tool definitions | 4,679 | 4,211 | -468 | Remove duplicate path/choice/version/cursor advice while retaining contracts |
| Combined fixed instructions | 4,708 | 4,240 | -468 | Same full nine-tool capabilities |
| Serialized system-message array | 61 | 61 | 0 | Includes actual role/content envelope |
| Serialized fixed request fields | 4,762 | 4,294 | -468 | Same JSON envelope and separators |

The combined fixed instruction footprint fell by 468 characters (9.94%). Description-level accounting of the same transported tools:

| Tool-definition component | Before chars | After chars | Change |
| --- | ---: | ---: | ---: |
| Top-level description text | 1,420 | 1,050 | -370 |
| Serialized schemas, including property descriptions | 2,496 | 2,398 | -98 |
| Property description text (already included in schemas) | 462 | 364 | -98 |

The component rows overlap: property prose is part of schemas, not additional overhead. Their reductions explain the full 468-character tool-array reduction. Final read-only reconciliation of live `readConfig`, registry definitions and the real transport mapper matched the saved optimized wire snapshot exactly. Removing only description fields left baseline/current constraints and approval/dedup/invalidation metadata deeply equal; all nine tools remained present.

Exact isolated system/tool/combined token counts: **not measured**. The supported ModelPort exposes no standalone tokenizer. Native Ollama `prompt_eval_count` measures the fully rendered prompt, with a separate cached-token counter ([official API reference](https://docs.ollama.com/api/chat)); workflow counts include user text and provider framing. Isolated probes were not run and no tokenizer dependency or approximate count was introduced. Consequently no isolated-instruction token table is claimed.

The completed matched first requests do have native full-prompt counters. These are reported totals, not isolated instruction counts or sums of independently tokenized surfaces; every pair used identical user text and model/provider framing:

| Full first-request prompt | Baseline tokens | Optimized tokens | Change |
| --- | ---: | ---: | ---: |
| Discovery/read | 953 | 863 | -90 |
| Filename search | 941 | 851 | -90 |
| Content search | 942 | 852 | -90 |
| Nested create | 954 | 864 | -90 |
| Multi-edit | 952 | 862 | -90 |
| Replace | 955 | 865 | -90 |
| Stale recovery | 945 | 855 | -90 |
| Move | 938 | 848 | -90 |
| Delete | 933 | 843 | -90 |

The distinct cached-token counts are not subtracted from these full-prompt totals. No token total is reported for unsampled optimized conversation/echo requests.

## Model behavior comparison

Primary baseline: all 17 completed runs passed independent task checks, with 40 tool calls / 57 model rounds, four tool failures (two deliberate stale edits and two multi-edit exact-match failures), 11/17 expected first choices, no schema echo, no unnecessary mutations, and no repeated identical reads/searches without intervening mutation attempts. All filename/content/create/move/delete/no-tool choices were correct. Known-file multi-edit/replace/stale requests unnecessarily began with directory listing in both repetitions. Both multi-edit attempts used two entries per batch but overescaped quotes on their first exact match; both reread after failure and completed correctly.

Optimized: all nine completed workflows passed independent task checks, with 17 calls / 26 rounds, 8/9 expected first choices and one deliberately induced stale-edit failure. Multi-edit used read → one two-entry batch, with no failure. Replacement still began with a directory list, then read and used the correct read-derived `expectedVersion`; this existing unnecessary listing was unchanged. Stale recovery used read → failed exact edit → read current staging content → successful retry, without repeating the failing edit. Rename and deletion each directly used their dedicated tool. No invalid call or schema failure, repeated read/search without an intervening mutation attempt, unnecessary mutation or schema/call JSON echo occurred in the nine completed optimized cases.

Only matched first repetitions are used for the aggregate before/after comparison; unequal 17-versus-nine totals are not presented as an improvement:

| Matched nine-workflow metric | Baseline | Optimized |
| --- | ---: | ---: |
| Expected first tool choice | 6/9 | 8/9 |
| Tool calls | 21 | 17 |
| Model rounds | 30 | 26 |
| Failed tool calls | 2 (one quote mismatch, one injected stale edit) | 1 (injected stale edit) |
| Redundant reads/searches without an intervening mutation attempt | 0/0 | 0/0 |
| Unnecessary mutation attempts | 0 | 0 |
| Ordinary-text schema/tool-call JSON echo | 0 | 0 |
| Task completion | 9/9 | 9/9 |

The two recovery reads in baseline multi-edit/stale are justified after failures and counted in calls, not mislabeled as redundant identical reads. Directory listings before known-file operations are reported separately above. This is model usability evidence; no tool functionality was altered to improve the metrics.

Manual final-answer review supplements the automated completion/usefulness flags: baseline root-list diagnostic names all five directories correctly but calls them “four”; record this minor count error rather than treating the heuristic as a full prose-quality judgment. Mutation completion checks compare exact contents/path outcomes independently of assistant claims. Both search answers report the intended paths, and content search reports line 3.

Final workflow evidence (`calls/rounds`; baseline repetition count shown explicitly; one optimized sample for each completed case):

| Workflow | Baseline | Optimized | Regression? |
| --- | --- | --- | --- |
| Discovery/read | 3/4 ×2; list/list/read, correct port | 3/4; identical sequence/answer, no mutation | No observed regression |
| Find vs search | Correct find/search, 1/2 each ×2 | Correct find/search, 1/2 each; correct path/line, decoy excluded | No observed regression |
| Nested create | 1/2; exact nested file | 1/2; exact nested file | No |
| Multi-edit | 5/6 ×2; extra list and one failure each; two-entry batches | 2/3; read then one two-entry edit, no failures, preserved other text | Improved sampled run |
| Replace | 3/4 ×2 under longer allowances; list/read/version-guarded replace | 3/4 under the same allowances; same sequence, correct version and complete content | No observed regression; extra list persists |
| Stale recovery | 5/6 ×2 under longer allowances; failure/read/retry succeeds | 4/5; read/failure/read/retry succeeds, one injected failure | Improved sampled run |
| Move/delete | 1/2 each; correct operations/outcomes | 1/2 each; direct move/delete, correct contents/path outcomes | No observed regression |
| No-tool answer | 0/1; useful answer 42 | Not additionally sampled | Not assessed in optimized model run; deterministic no-tool behavior passes |
| Schema echo diagnostic | 1/2; structured list, no schema echo; minor count error | Not additionally sampled; no echo in other nine completed cases | Dedicated optimized comparison not assessed; optional 1B/A/B not run |

Manual review of all completed optimized final answers found them concise and consistent with checked outcomes; it supplements automated usefulness flags rather than requiring identical prose. Sampled pairs show no meaningful regression and fewer calls; these results do not establish statistical confidence or coverage of the untested optimized cases. Evidence comes from one capable model and fixed sampler configuration, one optimized sample per completed case, unequal baseline repetitions, service interruption and eco-mode CPU constraints. Replacement/stale comparisons use matched longer allowances; other completed cases retain their recorded controls. Incomplete transport/timeout/cancelled attempts are retained separately and excluded from completed behavior totals, not counted as successful cases. No latency or broad model-generalization claim is made.

Schema echo was explicitly inspected in baseline diagnostics and completed request traces. It was not reproduced on the capable model; the smaller-model reproduction and echo-rule A/B were not sampled. There is therefore no collected evidence that the additional rule improves behavior. It was not retained, and no parser workaround was introduced. The user accepted these empirical limits and directed closure without further sampling.

## Validation

Independent parent baseline release passed as recorded above. All post-implementation deterministic gates below passed on the final production changes. Empirical comparison is closed on the user's instruction with the coverage limits above.

- Initial post-edit focused gate: `bun test src/infrastructure/model/InstructionSurface.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/infrastructure/tools/LocalTool.test.ts src/infrastructure/tools/LocalToolExecutor.test.ts src/infrastructure/tools/providers/ReplaceFileProvider.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts src/composition/config.test.ts src/composition/createRuntime.test.ts src/application/use-cases/RunAgentTurn.test.ts` — 162 pass, 0 fail, 2,295 assertions, 9 files; `/tmp/phase15-focused.log`.
- Post-edit `bun run typecheck` — pass.
- New capture coverage exercises actual RunAgentTurn → prepared production read/edit → reducer → Ollama HTTP serialization across five recovery rounds, for default/blank/custom system configurations. Exactly one unappended system instruction, exactly nine definitions, no hidden metadata/manual, original error guidance and real final file outcome are asserted. These scripted requests prove deterministic transport/recovery contracts, not natural model reasoning.

| Final command | Result |
| --- | --- |
| `bun run typecheck` | PASS, exit 0 |
| `bun test` | PASS, exit 0; 531 tests, 0 failures, 5,956 assertions, 34 files |
| `bun run format:check` | PASS, exit 0; 121 files; initial read-schema line wrapping corrected |
| `bun run build:linux` | PASS, exit 0 |
| `bun run build:windows` | PASS, exit 0 |
| `bun run smoke:build` | PASS, exit 0 |
| `bun run release:check` | PASS, exit 0; same 531 tests / 5,956 assertions / 34 files, formatting, typecheck, both builds and artifact smoke |
| `git diff --check` | PASS |

Temporary final command logs: `/tmp/phase15-final-{typecheck,test,format,linux,windows,smoke,release}.log`. Complete tracked diff and new capture test reviewed: production edits are only system/tool/schema description text, plus formatter line wrapping. No dependencies, filesystem/search behavior, approval metadata, model/request orchestration, context selection/budget/window, retrieval, memory or presentation changes. Structural search finds the sole production default in `config.ts` and its single `ContextBuilder` system-message wrapping; no hidden appended manual. Obsolete `list_files`/`search_file` names survive only as presentation labels for historical events and in historical/test records, not in registered definitions. No Phase 1–14 record changes or tracked `dist`/`.agent` artifacts.

Final release log completed at `2026-10-08T17:24:31.994Z`. Final read-only review confirmed every changed production/test file and README predates that passing gate; live definitions/system instructions still exactly match the verified optimized snapshot. Only this progress record changed afterward. The existing focused/full/release results therefore cover the final code and were reused, as instructed, without another expensive gate or any post-stop model request. Formatting is scoped to source/config files; this Markdown record is not part of that gate.

Final diff checks: `git diff --check` passed (exit 0). `git diff --stat` reports 14 tracked files, 47 insertions and 32 deletions; it excludes the new progress record and new captured-request test. `git status --short --untracked-files=all` shows exactly those 14 modifications and those two new files. Both new files were also inspected with `git diff --no-index --check /dev/null <file>`: no whitespace diagnostics; exit 1 indicates the expected new-file difference. The complete tracked diff and both new files were reviewed. Protected-scope diff queries returned no changes to Phase 1–14 records, application/domain/file-system/search/presentation paths, dependencies or generated artifacts. HEAD remains `1ea5d7093d2a67728c97bb8c20da853aa140b2f9`; no commit or staging action.

Checkpoint: stale approval superseded by explicit user instruction; normal CLI discovery attempted and unavailable; baseline runtime snapshot saved; all instruction sources and duplicated concepts inventoried; optimized contract and fixed workflows recorded before production edits.

## Final contract

Accepted contract below. Phase 1–14 records are unchanged. No commit is created.

The sole default system instruction is `Use workspace-relative paths.` Nonblank `SYSTEM_PROMPT` overrides replace it after trimming; blank/unset values use it. Application composition adds no other instructions. Every round retains all nine tools, with the same inputs, constraints, approval/cache metadata and implementations as Phase 14.

| Tool | Final description | Wire chars |
| --- | --- | ---: |
| `list_directory` | Inspect file and directory entries, including empty directories. Default path is root; depth selects a bounded tree. | 411 |
| `find_files` | Find file paths recursively by glob, without searching contents. path scopes the search; default root. | 475 |
| `read_file` | Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines. | 748 |
| `search_text` | Find literal text in files; returns bounded path/line/excerpt matches. If truncated, narrow the query. | 424 |
| `create_file` | Create a new UTF-8 file and missing parent directories; never overwrite existing paths. | 329 |
| `edit_file` | Apply local exact edits after reading the file. Each oldText must match once in the original; no overlaps. All edits commit together. | 623 |
| `replace_file` | Replace all text of an existing UTF-8 file; rejects stale versions. Use edit_file for local changes. | 478 |
| `move_file` | Move or rename one regular file; creates missing destination parents and fails if destination exists. Rejects symlinks and directories. | 401 |
| `delete_path` | Delete one file or empty directory, never recursively. Rejects symlinks, protected paths and workspace root. | 312 |

Final property descriptions (all other properties remain undescribed):

| Property | Description | Content chars |
| --- | --- | ---: |
| `depth` | Levels to list; default 1. | 26 |
| `pattern` | Only `*`, `**`, `?` wildcards. Without `/` matches basenames; with `/` matches paths relative to path. | 92 |
| `startLine` | One-based; default 1. Cannot accompany startOffset. | 51 |
| `startOffset` | Zero-based UTF-16 cursor. | 25 |
| `endLine` | Inclusive; excludes the following newline. | 42 |
| `query` | Literal single-line text; preserves whitespace and \|. | 53 |
| `edits[].newText` | Literal text; empty deletes the match. | 38 |
| `expectedVersion` | version from read_file for this file. | 37 |

Success payloads and errors are unchanged. In particular, missing/ambiguous exact-match and stale-version failures retain their local reread/retry guidance. No global recovery manual or provider-specific prompt is introduced. The echo-rule candidate is not retained because collected diagnostics do not demonstrate value. All nine capabilities, nested creation, typed listing, glob finding, literal search, lossless continuation, batch exact edits, guarded replacement, bounded move/delete, approvals, cancellation, containment, protected paths and symlink protections retain their Phase 14 behavior.
