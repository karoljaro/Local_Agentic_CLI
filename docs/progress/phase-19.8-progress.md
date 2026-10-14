# Phase 19.8 — production system prompt redesign and final acceptance

## Status

Current status: **verified** — final implementation outcome **REVERTED**. All 28 semantic meanings and all pre-live deterministic gates passed; the one frozen live scenario failed at request 1 (textual pseudo-call, no native call). Exact Phase 19.7 production prompt/tests restored; all final deterministic/build/release gates pass. Exactly 1/2 inference requests, zero retries; budget permanently closed. **Phase 19 native-tool adherence investigation is CLOSED.**

- [x] not started — this record created before production source modification
- [x] baseline captured
- [x] candidate semantics verified
- [x] implementation complete
- [x] deterministic verification complete
- [x] live acceptance frozen
- [x] live acceptance complete
- [ ] accepted
- [x] reverted
- [ ] blocked
- [x] verified — phase process complete, independently of candidate acceptance

## Baseline

- Starting HEAD: `60b400629389a8fbef5b1135c696261af21345a2`; Bun **1.4.3**; Linux host.
- Starting status, tracked diff and index diff: **empty**. No staging or commit.
- Authoritative records: [Phase 19.7](phase-19.7-progress.md), [Phase 19.6](phase-19.6-progress.md), [Phase 19.1](phase-19.1-progress.md), [Phase 19](phase-19-progress.md). Historical records and prior evidence are read-only.
- Phase 19.7 is authoritative and final diagnostic evidence: **D1 native / C1 textual / C2 textual / D2 native; zero provider failures; Outcome A**. It authorizes this sole implementation/acceptance successor. No historical diagnostic will be rerun.
- No applicable AGENTS.md found; no sub-agents requested or spawned.
- Baseline manifest `/tmp/phase198/baseline.json` protects 237 tracked files, local environment file bytes without exposing contents, and 50 Phase 19.7 artifacts. Exact source/test backups retained outside the repository for restoration.
- Current system: **1390 UTF-8 bytes**, SHA-256 `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc`; exact bytes saved without final newline in `/tmp/phase198/old-system.txt`.
- Candidate: **1584 UTF-8 bytes**, SHA-256 `e3c983bb6b25ba2961ac6eb22d42bb08648e3a912b9507bcce0f1a3083973cfe`; exact supplied text saved in `/tmp/phase198/candidate-system.txt`. Ordinary ASCII spaces; no leading/trailing whitespace, tabs, CR/LF, model names, provider-template syntax or call examples.
- Exact tool count **10**, ordered: `list_directory`, `find_files`, `read_file`, `search_text`, `create_file`, `edit_file`, `replace_file`, `move_file`, `delete_path`, `run_process`.
- All-tool generic JSON: 5132 bytes, SHA-256 `f84801a5ccdf6bbe2d0c83db6e5fe25c82c7d617a28af83a0b53d80165068e95`; wire array: 5043 bytes, SHA-256 `7667de266447b3882652731e64b98fa87071a7b8bd7b98e25c75df29c791da10`. Both match Phase 19.1; full baseline snapshots retained.
- Provider/model expected: Ollama **0.40.2**, `http://localhost:11434`, **ministral-3:14b**; digest `129e04c05b562f6e6ea7ec07ef0b0a61ef1aeaedb91ac524e67a1672eba7bb36`; 3414-byte template SHA-256 `aa65b5aebf89e7dfb3aa05af9220299a7e1cebe3ab97daae3c2e259acbdf278c`. Live metadata identity verified: full selected tag and complete show response equal Phase 19.7, including provider version/template/parameters/Modelfile/model_info. Metadata is not inference.
- Effective config matches default production chat surface with only isolated selected model: context/output **16384/4096**, keep_alive **0**, no sampler/schema/template override. No environment/preferences/model-selection source change.
- Expected sole production source change: `src/composition/config.ts`, default system string only. Relevant tests: config, InstructionSurface, ToolDefinitions, OllamaModelAdapter, RunAgentTurnNativeTools, RunAgentTurnVerification, ContextBuilderProcess; broader ToolRunner/recovery/context tests as appropriate.
- Existing Phase 19.1 deterministic coverage remains authoritative: 13 verification/repair loop scripts (verify, repair/reverify, unrelated failure, denial, unavailable command, timeout, narrower evidence-grounded follow-up, unreverified repair, known commands, prohibition, unverified mutation, maximum process observation, 12-round bound) and 22 process projection tests (bounded separate streams, exact status/flags, canonical persistence/replay, retrieval/memory exclusion, mandatory overflow).

### Exact Phase 19.7 production system

```text
Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly. Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work. Respect user/repository command restrictions and required checks. Verify material changes with bounded proportionate run_process checks from instructions/configuration/CI or user/prior successful commands; reuse known commands. Tiny text edits or unavailable/disproportionate checks may remain unverified. Read exit status/stdout/stderr: non-zero exits are diagnostic results, not tool failures. Repair only evidenced failures relevant to requested work; inspect narrowly if uncertain. Reverify repairs when useful. Stop when failure persists without new evidence, fixes are speculative/unrelated or broaden scope, execution is denied/unavailable, or timeout/output prevents safe progress. No automatic dependency installation, downloads or network recovery. Never claim checks passed or failures fixed without current-task tool or trustworthy user evidence; edits alone prove neither. Report verified scope and failed/unrun/blocked/inconclusive checks; disclose repairs without re-verification.
```

### Exactly one candidate

```text
Work only with workspace-relative paths. When inspection or action is needed, use the available functions through the provider's structured function-call channel; never represent a function invocation as ordinary assistant text. For clear requests, act autonomously and use known paths directly. Ask only when user-visible ambiguity remains or required information cannot be obtained safely. Respect denials and user/repository restrictions. When explaining a failed function or process call, report its actual arguments and error before continuing safe unfinished work. For material changes, perform bounded, proportionate, non-interactive verification using known repository, CI, configuration, prior successful, or user-provided commands when available; reuse known commands. Tiny edits or unavailable/disproportionate checks may remain unverified. Treat non-zero process exits as diagnostic evidence. Repair only relevant, evidenced failures; inspect narrowly when uncertain and reverify repairs when useful. Stop when safe progress is blocked, failures repeat without new evidence, a fix would be speculative, unrelated, or broaden scope, execution is denied/unavailable, or timeout/output prevents reliable work. Do not install dependencies, download artifacts, or use network recovery automatically. Never claim a check passed or a failure was fixed without current-task function/process evidence or trustworthy user evidence; edits alone prove neither. Report what was verified and any failed, unrun, blocked, or inconclusive checks; disclose repairs that were not reverified.
```

Fence framing newlines are presentation only; neither saved string has a final newline. No other candidate exists and this wording will never be tuned after live output.

## Protected semantic review

All **28 meanings retained** by direct review against the supplied text. Deterministic config/instruction tests will assert its exact identity and semantic clauses; runtime behavior uses existing scripted tests. No runtime semantic validator is added.

| # | Meaning | Exact retained clause | Review |
| --- | --- | --- | --- |
| 1 | workspace-relative paths | Work only with workspace-relative paths. | pass |
| 2 | autonomy for clear requests | For clear requests, act autonomously | pass |
| 3 | known paths directly | use known paths directly | pass |
| 4 | ask only for visible ambiguity or safely unavailable required information | Ask only when user-visible ambiguity remains or required information cannot be obtained safely. | pass |
| 5 | respect denials | Respect denials | pass |
| 6 | respect user/repository restrictions | user/repository restrictions | pass |
| 7 | actual failed-call arguments/error | report its actual arguments and error | pass |
| 8 | bounded/proportionate material-change verification | For material changes, perform bounded, proportionate, non-interactive verification | pass |
| 9 | ground commands in repository/CI/configuration/prior success/user evidence | using known repository, CI, configuration, prior successful, or user-provided commands when available | pass |
| 10 | reuse known commands | reuse known commands | pass |
| 11 | tiny/unavailable/disproportionate may remain unverified | Tiny edits or unavailable/disproportionate checks may remain unverified. | pass |
| 12 | nonzero process exit is diagnostic evidence | Treat non-zero process exits as diagnostic evidence. | pass |
| 13 | only relevant/evidenced repair | Repair only relevant, evidenced failures | pass |
| 14 | narrow inspection when uncertain | inspect narrowly when uncertain | pass |
| 15 | reverify when useful | reverify repairs when useful | pass |
| 16 | stop repeated failures without evidence | failures repeat without new evidence | pass |
| 17 | stop speculative/unrelated/scope-broadening fixes | a fix would be speculative, unrelated, or broaden scope | pass |
| 18 | stop denied/unavailable execution | execution is denied/unavailable | pass |
| 19 | stop unreliable timeout/output | timeout/output prevents reliable work | pass |
| 20 | no automatic dependency installation | Do not install dependencies | pass |
| 21 | no automatic artifact download | download artifacts | pass |
| 22 | no automatic network recovery | use network recovery automatically | pass |
| 23 | no passed/fixed claims without current evidence | Never claim a check passed or a failure was fixed without current-task function/process evidence or trustworthy user evidence | pass |
| 24 | edits alone do not prove success | edits alone prove neither | pass |
| 25 | report verified/failed/unrun/blocked/inconclusive | Report what was verified and any failed, unrun, blocked, or inconclusive checks | pass |
| 26 | disclose unreverified repairs | disclose repairs that were not reverified | pass |
| 27 | provider structured-function-call channel only | through the provider's structured function-call channel | pass |
| 28 | no textual imitation of invocation | never represent a function invocation as ordinary assistant text | pass |

Interpretation caveats: “diagnostic evidence” retains the meaning that nonzero process exits are completed observations, not application tool failure; the unchanged run_process description and scripted runtime tests establish this distinction. “user/repository restrictions” includes command prohibitions and required checks. “act autonomously”, “continuing safe unfinished work”, and relevant/evidenced repair retain safe internal recovery. The automatic prohibition applies jointly to installation, artifact download and network recovery. No required listed semantic is missing.

## Implementation and deterministic acceptance

Implemented the exact supplied string in config.ts. Only config/instruction tests changed: exact identity/hash, all 28 clauses, absence of call examples, and the fixed instruction+tool envelope cap 6500 → 6700 (194-byte prompt growth; no runtime context budget change). Ten-tool definitions and provider/runtime suites unchanged. Existing commands only: focused tests; `bun test`; `bun run typecheck`; `bun run format:check`; `git diff --check`; `bun run build:linux`; `bun run build:windows`; `bun run smoke:build`; `bun run release:check`. No installation or new build infrastructure.

## Final live acceptance contract

Exactly one real application scenario; maximum **2 provider inference requests TOTAL**, no retry or control. First live inference after Phase 19.7 must be request 1 of this scenario. No live call until every deterministic gate passes and freeze/guard/ledger exist.

- Exact user: Read native-tool-acceptance.txt using the workspace tools and return its exact full contents. Do not guess.
- Disposable host-generated fixture `native-tool-acceptance.txt`, no newline, contains `PHASE_19_8_ACCEPTANCE_684271`. Value absent from initial system/user/model input and request; only successful real application read_file may reveal it.
- Revised default system, **all ten unchanged real tools**, production ModelPort/Ollama adapter/HTTP/parser, ContextBuilder, RunAgentTurn, LocalToolRegistry preparation, ToolRunner, normal approval policy, canonical session events/results and second model round. No synthetic tool, manual harness tool execution, or reduced surface.
- Request 1 must emit provider-native read_file for the exact safe fixture path; request 2 must finish without another tool call and answer only the exact proof (surrounding whitespace permitted).
- Any missing/wrong/invalid call, failed normal execution, bad final proof, third required request, provider failure or security/approval bypass rejects the candidate. Restore baseline source and candidate-only test changes, retain this record, validate final state, close.
- Material provider/model/template identity drift prevents launch: revert and close as acceptance blocked by drift. No download or alternate model.

## Final decision and Phase 19 closure

**REVERTED.** Exactly one terminal implementation outcome: reverted. The candidate failed the first-request native-call requirement; no second request was allowed or needed. Exact baseline production/test bytes restored. **Phase 19 native-tool adherence investigation is CLOSED.** Under either completed result the investigation closes permanently. No second candidate, Phase 19.8.1, Phase 19.9, tuning, diagnostic or replication is permitted. Future model/provider/capability/prompt work requires a separate major phase with a new product requirement. Commit: none.

## Pre-live deterministic results

All gates passed, exit 0; inference **0**. Focused command: `bun test src/composition/config.test.ts src/infrastructure/model/InstructionSurface.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts src/application/use-cases/RunAgentTurnNativeTools.test.ts src/application/use-cases/RunAgentTurnVerification.test.ts src/application/services/ContextBuilderProcess.test.ts src/application/services/ToolRunner.test.ts src/application/use-cases/RunAgentTurnToolRecovery.test.ts src/application/use-cases/RunAgentTurnProcessRecovery.test.ts`.

| Gate | Result | Log |
| --- | --- | --- |
| bun test [10 focused suites] | pass; 194 tests / 0 fail / 1716 assertions / 10 files | `/tmp/phase198/pre-focused.log` |
| bun test | pass; 1134 tests / 0 fail / 8244 assertions / 63 files | `/tmp/phase198/pre-full.log` |
| bun run typecheck | pass | `/tmp/phase198/pre-typecheck.log` |
| bun run format:check | pass | `/tmp/phase198/pre-format.log` |
| git diff --check | pass | `/tmp/phase198/pre-diff-check.log` |
| bun run build:linux | pass | `/tmp/phase198/pre-build-linux.log` |
| bun run build:windows | pass | `/tmp/phase198/pre-build-windows.log` |
| bun run smoke:build | pass | `/tmp/phase198/pre-smoke-build.log` |
| bun run release:check | pass; 1134 tests / 0 fail / 8244 assertions / 63 files | `/tmp/phase198/pre-release-check.log` |

Windows is cross-build/artifact validation only; no native Windows runtime claim. Existing release check includes format, types, full tests, both builds and packaged smoke. Artifact snapshot: `/tmp/phase198/pre-validation.json`; exactly codesh, codesh.exe, rg, rg.exe. No dependency/download/model inference occurred. Native parser, pseudo-call non-execution, all ten definitions, Phase 19.1 behavioral scripts and ContextBuilder process invariants passed. No generic runtime mismatch was exposed.

## Freeze before request 1

Frozen at **2026-10-14T11:06:10.109002+00:00**, after every deterministic gate passed, before any live inference. Candidate **1584 bytes**, SHA-256 `e3c983bb6b25ba2961ac6eb22d42bb08648e3a912b9507bcce0f1a3083973cfe`; all ten generic/wire tool definitions exactly equal the baseline.

- First wire body captured by **real RunAgentTurn → ContextBuilder → OllamaModelAdapter → OllamaHttpClient serialization**, with an empty scripted HTTP completion solely to capture request 1: **zero inference, zero tools executed**. **6950 bytes**, SHA-256 `7911c07015364054175b611453bf277acca22e73b3498c16aa4039f3f98eebe8`. Only initial roles system/user, exact prescribed user, unchanged all-ten-tool array, production 16384/4096 profile, keep_alive 0, stream true, truncate/shift false, no extra option. The proof is absent from the exact wire body and ModelPort input; no harness source is delivered.
- Frozen plan `/tmp/phase198/frozen-plan.json`, SHA-256 `db1367dab42f1ebf307f6135f8f391a5264c0d4863bada79b5f47174c3684dd9`; launch guard `/tmp/phase198/launch-guard.json`, SHA-256 `9761cd515c07928aef41741803c526ed875f0960c8ed0ded168f3e09e3e06239`. **37 frozen artifacts** (including helpers, gate logs, capture/input, identities, backups and fixture), all read-only. Syntax-only Bun bundle passed (130 modules); this is host-harness syntax validation, separate from release gates.
- Empty `/tmp/phase198/inference-ledger.jsonl` created/fsynced before launch. Each provider dispatch is counted and fsynced **before real fetch**. Hard maximum **2**. Permanent `/tmp/phase198/live-once.lock` is created exclusively/fsynced before dispatch; second launch forbidden after success, failure or interruption.
- Host harness uses normal production registry and bound preparation/execution, normal ToolRunner lifecycle and production SessionService/JsonlSessionStore/reducer. Registry instrumentation observes preparation and returns the same prepared record. Read_file normally requires **no approval**; no hidden approval or privilege is introduced. Any wrong call stops acceptance without alternate execution. Request 2 requires completed canonical read evidence and exact result serialization. Second-round tool calls fail before another tool execution or request 3. No tool is called manually.
- Raw response bytes forwarded unchanged with highWaterMark 0; every original byte chunk/base64/time, exact NDJSON line/frame and mapped ModelStreamChunk retained. No native-emission diagnostic stop; full normal provider stream and canonical continuation are required.
- Per-provider request bound **60000 ms**, aggregate **130000 ms**; no extension/retry. Complete selected provider identity checked at launch, before each dispatch and at close. Repository/history/environment/prior/frozen byte hashes checked before dispatch and at close. No activation/unload, retrieval/memory/embedding inference.
- Expected fixture **28 bytes**, SHA-256 `77891fa2f61656eb1ebf99a64616a1e6c9d9a25d716a7c9b447f9f1daf0c4bd6`; unchanged single file.

### Exact frozen first provider wire body

```json
{"model":"ministral-3:14b","messages":[{"role":"system","content":"Work only with workspace-relative paths. When inspection or action is needed, use the available functions through the provider's structured function-call channel; never represent a function invocation as ordinary assistant text. For clear requests, act autonomously and use known paths directly. Ask only when user-visible ambiguity remains or required information cannot be obtained safely. Respect denials and user/repository restrictions. When explaining a failed function or process call, report its actual arguments and error before continuing safe unfinished work. For material changes, perform bounded, proportionate, non-interactive verification using known repository, CI, configuration, prior successful, or user-provided commands when available; reuse known commands. Tiny edits or unavailable/disproportionate checks may remain unverified. Treat non-zero process exits as diagnostic evidence. Repair only relevant, evidenced failures; inspect narrowly when uncertain and reverify repairs when useful. Stop when safe progress is blocked, failures repeat without new evidence, a fix would be speculative, unrelated, or broaden scope, execution is denied/unavailable, or timeout/output prevents reliable work. Do not install dependencies, download artifacts, or use network recovery automatically. Never claim a check passed or a failure was fixed without current-task function/process evidence or trustworthy user evidence; edits alone prove neither. Report what was verified and any failed, unrun, blocked, or inconclusive checks; disclose repairs that were not reverified."},{"role":"user","content":"Read native-tool-acceptance.txt using the workspace tools and return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"list_directory","description":"Inspect file and directory entries, including empty directories. Default path is root; depth selects a bounded tree.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"depth":{"description":"Levels to list; default 1.","type":"integer","minimum":1,"maximum":5}},"additionalProperties":false,"required":[]}}},{"type":"function","function":{"name":"find_files","description":"Find file paths recursively by glob, without searching contents. path scopes the search; default root.","parameters":{"type":"object","properties":{"pattern":{"type":"string","minLength":1,"maxLength":200,"description":"Only *, **, ? wildcards. Without / matches basenames; with / matches paths relative to path."},"path":{"type":"string","minLength":1}},"required":["pattern"],"additionalProperties":false}}},{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}},{"type":"function","function":{"name":"search_text","description":"Find literal text in files; returns bounded path/line/excerpt matches. If truncated, narrow the query.","parameters":{"type":"object","properties":{"query":{"type":"string","minLength":1,"maxLength":20000,"pattern":"^[^\\r\\n\\0]+$","description":"Literal single-line text; preserves whitespace and |."}},"required":["query"],"additionalProperties":false}}},{"type":"function","function":{"name":"create_file","description":"Create a new UTF-8 file and missing parent directories; never overwrite existing paths.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"content":{"type":"string"}},"required":["path","content"],"additionalProperties":false}}},{"type":"function","function":{"name":"edit_file","description":"Apply bounded exact edits to reliably known current content; read_file if unknown or stale. Each oldText must match once in the original; no overlaps. All edits commit together.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"edits":{"minItems":1,"maxItems":50,"type":"array","items":{"type":"object","properties":{"oldText":{"type":"string","minLength":1},"newText":{"type":"string","description":"Literal text; empty deletes the match."}},"required":["oldText","newText"],"additionalProperties":false}}},"required":["path","edits"],"additionalProperties":false}}},{"type":"function","function":{"name":"replace_file","description":"Replace the entire existing UTF-8 file; rejects stale versions. Prefer edit_file when bounded exact edits suffice.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"content":{"type":"string"},"expectedVersion":{"type":"string","pattern":"^[a-f0-9]{64}$","description":"Use exactly the current version from read_file for this file. Never invent or reconstruct it. If unavailable or stale, read_file again."}},"required":["path","content","expectedVersion"],"additionalProperties":false}}},{"type":"function","function":{"name":"move_file","description":"Move or rename one regular file; creates missing destination parents and fails if destination exists. Rejects symlinks and directories.","parameters":{"type":"object","properties":{"source":{"type":"string","minLength":1},"destination":{"type":"string","minLength":1}},"required":["source","destination"],"additionalProperties":false}}},{"type":"function","function":{"name":"delete_path","description":"Delete one file or empty directory, never recursively. Rejects symlinks, protected paths and workspace root.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1}},"required":["path"],"additionalProperties":false}}},{"type":"function","function":{"name":"run_process","description":"Run one foreground process with direct argv in the workspace. No implicit shell or interactive stdin. Requires approval. Use for tests/checks/builds; non-zero exits are results. Prefer file tools for inspection/editing.","parameters":{"type":"object","properties":{"program":{"type":"string","maxLength":1024},"args":{"default":[],"maxItems":128,"type":"array","items":{"type":"string","maxLength":8192}},"cwd":{"default":".","type":"string","minLength":1,"maxLength":4096},"timeoutMs":{"default":60000,"type":"integer","minimum":1000,"maximum":300000}},"required":["program"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

Fence framing newlines are presentation only. Actual body is minified without a final newline. Request 2 cannot be known before the genuine read result; it must use the same system/tool/options and normal canonical messages/result path.

## Frozen live result — rejected at request 1

The one-shot launch completed with clean provider HTTP 200/completed transport, but **zero raw message.tool_calls and zero mapped native calls**. Exact ordinary content:

```text
read_file[ARGS]{"path": "native-tool-acceptance.txt"}
```

This is textual pseudo-call prose with no execution authority. The frozen host acceptance assertion rejected request 1 at provider-stream completion before tool preparation/normal execution. RunAgentTurn recorded its ordinary model-stream error path; this assertion is the acceptance failure, **not a provider/transport/parser failure**. Request 2 was **not sent**. Exactly **1 / maximum 2 inference requests**, zero retries/alternate candidates/models/controls. All preparation/approval/execution/process/mutation counters **0**. No parser fallback. Fixture unchanged.

Production `src/composition/config.ts` and both candidate-only test expectation changes (`config.test.ts`, `InstructionSurface.test.ts`) restored from exact preimplementation backups. All **237 tracked files** equal baseline byte hashes; source diff and index diff empty. Architecture/README considered: architecture already states structured tool authority and non-executable prose; no durable changes retained for the rejected candidate. Only this new progress record remains.

Final baseline gates rebuilt and validated all four release artifacts; both codesh binaries contain the exact restored system and do not contain the rejected candidate. Live helpers, input, output and ledger are never edited or relaunched.

### Live environment and timing

One approved outside-sandbox localhost launch: `bun /tmp/phase198-live.ts > /tmp/phase198/live.log 2>&1`. No relaunch. Started **2026-10-14T11:06:29.222Z**, finished **2026-10-14T11:06:34.857Z**, host duration **5634.8422820000005 ms**. Request 1 duration **5566.073671 ms**, HTTP **200**, transport completed, provider terminal **stop**. Native raw/mapped count **0/0**. Received **16 chunks / 16 NDJSON frames / 16 mapped chunks / 2357 bytes**. Naturally available provider counters: **1272 prompt tokens / 16 output tokens**; terminal timing/cached counters preserved below. Harness exit 0 means evidence collection completed, not acceptance success.

Candidate production system, all **10 unchanged real production tools**, normal **16384/4096** ContextBuilder profile, normal ModelPort/Ollama adapter/HTTP/parser, preparation/ToolRunner/session/event/result components were assembled. No synthetic executor or reduced tool surface. No normal tool lifecycle was produced because no native call existed. Actual structured arguments: **none**. Normal read_file execution: **not reached**, no output/result metadata/content delivered. Request 2 and exact-proof completion: **unrun** after request-1 failure. The model never received the hidden value.

Complete provider version/selected tag/show/template/parameter identity matched Phase 19.7 before freeze, at launch and immediately before request 1. After failed acceptance/restoration, independent **metadata-only** version/tags/show recheck also matched exactly; `/tmp/phase198/provider-final-identity.json`. No provider failure or material drift. Frozen success-only at-close check was not reached; this independent metadata close check replaces it without inference. No activation/unload/embedding/retrieval/memory request.

Workspace integrity: only `native-tool-acceptance.txt`, **26 bytes**, SHA-256 `77891fa2f61656eb1ebf99a64616a1e6c9d9a25d716a7c9b447f9f1daf0c4bd6`, unchanged and still disposable outside the repository. Initial model-visible input had only exact system/user and tool definitions; proof absent. Every execution/preparation/approval/process/mutation counter is **0**. Source/test/history/environment/prior-evidence/frozen-artifact byte integrity passes; no unrelated environment values were logged.

### Exact request 1 and raw native fields

Actual submitted wire body `/tmp/phase198/request-1.json` is **byte-for-byte identical** to the exact frozen first body embedded above: **6950 bytes**, SHA-256 `7911c07015364054175b611453bf277acca22e73b3498c16aa4039f3f98eebe8`. No final newline. The exact ModelPort input and production output mapping are preserved in the live evidence. Raw native calls `[]`; mapped calls `[]`. No function invocation is reconstructed from assistant content.

### Every original transport chunk

Base64 encodes every exact received byte chunk; arrival times are milliseconds from launch. Concatenation equals the exact NDJSON capture below. No read-ahead, textual extraction or repair.

```json
[
  {
    "atMs": 4724.98066,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjMzLjk0Njc1MzA0NFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicmVhZCJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 4786.406149,
    "bytes": 132,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjAwODg5MjAwM1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXyJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 4844.092185,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjA2NjU3OTU3M1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiZmlsZSJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 4900.19169,
    "bytes": 137,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjEyMjcxMDg1M1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiW0FSR1NdIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 4956.313162,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjE3ODgzODU2NloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoie1wiIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 5013.498588,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjIzNjAwMzM1OFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicGF0aCJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 5069.739538,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjI5MjI2Mzg1N1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCI6In0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 5127.899602,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjM1MDQyMDI0M1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIFwiIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 5191.8619340000005,
    "bytes": 137,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjQxNDM3Mzc1NVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoibmF0aXZlIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 5258.766731,
    "bytes": 136,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjQ4MTI4NTcwM1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXRvb2wifSwiZG9uZSI6ZmFsc2V9Cg=="
  },
  {
    "atMs": 5327.211123,
    "bytes": 132,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjU0OTcxOTUyOVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLSJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 5387.054772,
    "bytes": 137,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjYwOTU3MzIzMloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiYWNjZXB0In0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 5444.065796,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjY2NjU3NjU5MVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiYW5jZSJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 5500.94793,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0LjcyMzQ0MzQ4N1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLnR4dCJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 5558.409413,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0Ljc4MDkxNzY0OVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCJ9In0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 5617.757905,
    "bytes": 335,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDExOjA2OjM0Ljg0MDI1MzE5N1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIn0sImRvbmUiOnRydWUsImRvbmVfcmVhc29uIjoic3RvcCIsInRvdGFsX2R1cmF0aW9uIjo1NTY1NTQ4MzE0LCJsb2FkX2R1cmF0aW9uIjozNzQzMjQ2NjYzLCJwcm9tcHRfZXZhbF9jb3VudCI6MTI3MiwicHJvbXB0X2V2YWxfY2FjaGVkX2NvdW50IjowLCJwcm9tcHRfZXZhbF9kdXJhdGlvbiI6OTIzNjE2MDAwLCJldmFsX2NvdW50IjoxNiwiZXZhbF9kdXJhdGlvbiI6ODkzMjI4MDAwfQo="
  }
]
```

### Exact raw provider NDJSON frames

Raw capture `/tmp/phase198/provider-1.ndjson`, SHA-256 `eacfddab1ab7af14e5ecf62e41e1433c61e6b11a3cc2fc90db8796e1cf081a33`. The final newline belongs to transport. All frames lack native `message.tool_calls`; provider completion and counters were naturally received.

```jsonl
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:33.946753044Z","message":{"role":"assistant","content":"read"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.008892003Z","message":{"role":"assistant","content":"_"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.066579573Z","message":{"role":"assistant","content":"file"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.122710853Z","message":{"role":"assistant","content":"[ARGS]"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.178838566Z","message":{"role":"assistant","content":"{\""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.236003358Z","message":{"role":"assistant","content":"path"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.292263857Z","message":{"role":"assistant","content":"\":"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.350420243Z","message":{"role":"assistant","content":" \""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.414373755Z","message":{"role":"assistant","content":"native"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.481285703Z","message":{"role":"assistant","content":"-tool"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.549719529Z","message":{"role":"assistant","content":"-"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.609573232Z","message":{"role":"assistant","content":"accept"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.666576591Z","message":{"role":"assistant","content":"ance"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.723443487Z","message":{"role":"assistant","content":".txt"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.780917649Z","message":{"role":"assistant","content":"\"}"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T11:06:34.840253197Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":5565548314,"load_duration":3743246663,"prompt_eval_count":1272,"prompt_eval_cached_count":0,"prompt_eval_duration":923616000,"eval_count":16,"eval_duration":893228000}
```

### Every mapped production ModelStreamChunk

The following is the unchanged production parser/mapper output, including observation times. Ordinary tool-looking content remains contentDelta; no native field was lost.

```json
[
  {
    "atMs": 4725.194338,
    "chunk": {
      "contentDelta": "read"
    }
  },
  {
    "atMs": 4786.458389,
    "chunk": {
      "contentDelta": "_"
    }
  },
  {
    "atMs": 4844.141355,
    "chunk": {
      "contentDelta": "file"
    }
  },
  {
    "atMs": 4900.237164,
    "chunk": {
      "contentDelta": "[ARGS]"
    }
  },
  {
    "atMs": 4956.359682,
    "chunk": {
      "contentDelta": "{\""
    }
  },
  {
    "atMs": 5013.5794940000005,
    "chunk": {
      "contentDelta": "path"
    }
  },
  {
    "atMs": 5069.78922,
    "chunk": {
      "contentDelta": "\":"
    }
  },
  {
    "atMs": 5127.948097,
    "chunk": {
      "contentDelta": " \""
    }
  },
  {
    "atMs": 5191.915558,
    "chunk": {
      "contentDelta": "native"
    }
  },
  {
    "atMs": 5258.841876,
    "chunk": {
      "contentDelta": "-tool"
    }
  },
  {
    "atMs": 5327.262031,
    "chunk": {
      "contentDelta": "-"
    }
  },
  {
    "atMs": 5387.098381,
    "chunk": {
      "contentDelta": "accept"
    }
  },
  {
    "atMs": 5444.107062,
    "chunk": {
      "contentDelta": "ance"
    }
  },
  {
    "atMs": 5500.996072,
    "chunk": {
      "contentDelta": ".txt"
    }
  },
  {
    "atMs": 5558.456183,
    "chunk": {
      "contentDelta": "\"}"
    }
  },
  {
    "atMs": 5617.90399,
    "chunk": {
      "contentDelta": "",
      "finishReason": "stop",
      "usage": {
        "promptTokens": 1272,
        "outputTokens": 16
      }
    }
  }
]
```

### Canonical application events

The production SessionService/JsonlSessionStore wrote these exact normal events. The host rejects the non-native response after the completed provider stream; the loop's `MODEL_STREAM_FAILED` event records that host assertion, not a provider failure. No assistant.tool_calls.completed, tool.call.requested/started/completed/failed or read_file result exists. No fabricated successful assistant event is claimed.

```json
[
  {
    "id": "01a13a17-a002-7725-a788-c7a5fe44a871",
    "sessionId": "phase-19-8-acceptance",
    "timestamp": "2026-10-14T11:06:29.250558189Z",
    "type": "prompt.submitted",
    "messageId": "01a13a17-a002-7726-a257-f8c92e72f758",
    "prompt": "Read native-tool-acceptance.txt using the workspace tools and return its exact full contents. Do not guess.",
    "modelName": "ministral-3:14b"
  },
  {
    "id": "01a13a17-b5dd-779f-859c-710d53941f68",
    "sessionId": "phase-19-8-acceptance",
    "timestamp": "2026-10-14T11:06:34.845504233Z",
    "type": "agent.error",
    "error": {
      "message": "Request 1 contains no native message.tool_calls.",
      "code": "MODEL_STREAM_FAILED",
      "recoverable": true,
      "details": {
        "name": "AssertionError"
      }
    }
  }
]
```

### Closed inference ledger and permanent launch guard

Exact durable pre-dispatch ledger:

```jsonl
{"number":1,"atMs":51.929394,"bodyBytes":6950,"bodySha256":"7911c07015364054175b611453bf277acca22e73b3498c16aa4039f3f98eebe8","status":"dispatch-attempt-counted-before-fetch","maximum":2}
```

**Actual 1 / maximum 2**. Request 2 not sent; request 3 forbidden; retries **0**. No alternate candidate/model/control or post-failure prompt tuning. Launch lock, ledger, raw/request/full evidence and rejected diff are read-only. Permanent lock SHA-256 `2aab356517f57c616be2cfae5a9b66ba12c818fe2d8f8b1ef196df3348222953`; ledger SHA-256 `e612da04664b07962347b192f9c51f3ba1cdabc1d0111ca07f741cde05793d9a`; full evidence SHA-256 `2867b175ea3f6d818a146c2af1b2453cabb21876ea4e87fe65feb7c5209f8185`. Helpers/inputs were frozen before live output and remain byte-identical. Budget permanently closed, even though one request remains unused.

### Frozen artifact identities

All 37 frozen artifacts still match their plan hashes after restoration; the archived candidate remains evidence, not production.

| Artifact | SHA-256 |
| --- | --- |
| `/tmp/phase198/harness-syntax.js` | `d36718f06ecd7033caab14d0819b1848e85719754fcbeb5988dcc001f5fec0db` |
| `/tmp/phase198/syntax-check.log` | `4588c97b657b4f08b5820d5b51b1861b35c2e9e4a73101b702e2bf8f88b1585d` |
| `/tmp/phase198/capture-summary.json` | `7619b88e4faa785f1f8131353777ae1dc29b2296c25734c9fba11e84b924b60e` |
| `/tmp/phase198/frozen-input-1.json` | `68d905651e5991c695887ee31b0457bc95d746bbb76515371f67b132ae5acf1a` |
| `/tmp/phase198/frozen-request-1.json` | `7911c07015364054175b611453bf277acca22e73b3498c16aa4039f3f98eebe8` |
| `/tmp/phase198/capture.log` | `7619b88e4faa785f1f8131353777ae1dc29b2296c25734c9fba11e84b924b60e` |
| `/tmp/phase198/pre-validation.json` | `d6716e8f459e2b1e7641ab494c679dd22589a6b2c7348293b4190a1b76d49f61` |
| `/tmp/phase198/pre-release-check.log` | `5e7b2abc771b7d87832fd9af7a742c8995e96ee78e749336a7dd96aa5d1f062c` |
| `/tmp/phase198/pre-smoke-build.log` | `92cdaad5b739f1353302363e1a245275943e1eb0c7d1ce82d54db22a2fc3aa05` |
| `/tmp/phase198/pre-build-windows.log` | `235bbe17c1edc93b6697750e94dbd1900fcf61defb01efc42ac769d10b5f50c8` |
| `/tmp/phase198/pre-build-linux.log` | `aa67a1aa4a412f9e2a51efc094af03d524830f2a57d830dc117b66cff57f0756` |
| `/tmp/phase198/pre-typecheck.log` | `0a7cbec9e31e5ab1dc3f62bf0e9994201b491a121c31235f27316f5151281817` |
| `/tmp/phase198/pre-format.log` | `b639d33a3e38ae59952d82020ac4bc7abbbbf74b4614000067fb94051c1d91d6` |
| `/tmp/phase198/pre-diff-check.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/phase198/pre-full.log` | `245382a0e7201bcbb432477c8655db43b7430e37aa9518f1c3b18ef6e8053ff3` |
| `/tmp/phase198/pre-focused.log` | `326b5c063ac459358ed1361a0a2c81ebbc0f508a5996dd1586a6e45b89aec853` |
| `/tmp/phase198/provider-identity.json` | `e233ba0eabed1a4b0d2951cc33283936f84474602b8d7115dc474f9f8ba3aefb` |
| `/tmp/phase198/provider-tags.json` | `f50c00ab1a94e927b74e67610ac2cf4bc5d5cd19d411d48026996b7fed2afdd8` |
| `/tmp/phase198/provider-show.json` | `f4e2dbe14565594a406a48ea0edcc8a1b3c105ffcfaa401474e9025f5d61d2fb` |
| `/tmp/phase198/provider-version.json` | `2657f6fff8018900025e47485e719c930017826b790e73ae28087cdcd93fe50e` |
| `/tmp/phase198/semantic-review.json` | `2d9ddfc2e70862452750795f8eaa8801f589c70e6a9b1b66eac73fa3b68b458b` |
| `/tmp/phase198/docs__ARCHITECTURE.md.baseline` | `be5039ce1edd9e13b7229d08a493d79264812fc2a3d6e67b59bbee0b37df470a` |
| `/tmp/phase198/src__infrastructure__model__InstructionSurface.test.ts.baseline` | `07daa442581e1e113a898f6a0a5e2882888ad27452b2a8c3e23a7acf5e87d45a` |
| `/tmp/phase198/src__composition__config.test.ts.baseline` | `ff75407e455dc6cac34fffcbe6a5c4842ac309e91e964f6bd3b0685aa0d6925e` |
| `/tmp/phase198/src__composition__config.ts.baseline` | `2301084a6e4981d0a4f837765f71f804c0b61263700e84c0c9061bdf229ad0b4` |
| `/tmp/phase198/baseline-wire-tools.json` | `7667de266447b3882652731e64b98fa87071a7b8bd7b98e25c75df29c791da10` |
| `/tmp/phase198/baseline-tools.json` | `f84801a5ccdf6bbe2d0c83db6e5fe25c82c7d617a28af83a0b53d80165068e95` |
| `/tmp/phase198/candidate-system.txt` | `e3c983bb6b25ba2961ac6eb22d42bb08648e3a912b9507bcce0f1a3083973cfe` |
| `/tmp/phase198/old-system.txt` | `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc` |
| `/tmp/phase198/baseline.json` | `c729504d1dc16295ac140cc2a090a72a236c772cc95801cf20a74b1ab6e36441` |
| `/tmp/phase198-audit.ts` | `5f281d612790e8e6ce364e306bcf663ccbb0d5ba7ec407d573ba2382bf80e5ac` |
| `/tmp/phase198-common.ts` | `642c944ef737da6b689a049d541e14aaab4880ab75b6085cdcf9f83310415b88` |
| `/tmp/phase198-capture.ts` | `983e9a5823191936b369ce875e51819147867e2fb5690ce4f47d3752f94c3137` |
| `/tmp/phase198-preflight.ts` | `97cecfa9feb0fe7c5b1aefd9290bd8dbb8befc53540b749fbafc979e3af72dd6` |
| `/tmp/phase198-live.ts` | `f9451fec6df3618352f32bba528d543e9ac5ca856affdb4d0f412e75455a14be` |
| `/tmp/phase198-freeze.py` | `76e90d643a0aec33dce81a88f9dfd9de1c9e04d3dcd0de52b79ac8fb02ac14f7` |
| `/tmp/phase198/workspace/native-tool-acceptance.txt` | `77891fa2f61656eb1ebf99a64616a1e6c9d9a25d716a7c9b447f9f1daf0c4bd6` |

## Final restored-state deterministic validation

All required gates rerun against the exact restored Phase 19.7 repository, exit 0. Same focused scope as pre-live; no test addition, production modification, dependency or lockfile change remains.

| Gate | Final result | Log |
| --- | --- | --- |
| bun test [same 10 focused suites] | pass, exit 0; 194 tests / 0 fail / 1710 assertions / 10 files | `/tmp/phase198/final-focused.log` |
| bun test | pass, exit 0; 1134 tests / 0 fail / 8238 assertions / 63 files | `/tmp/phase198/final-full.log` |
| bun run typecheck | pass, exit 0 | `/tmp/phase198/final-typecheck.log` |
| bun run format:check | pass, exit 0 | `/tmp/phase198/final-format.log` |
| git diff --check | pass, exit 0 | `/tmp/phase198/final-diff-check.log` |
| bun run build:linux | pass, exit 0 | `/tmp/phase198/final-build-linux.log` |
| bun run build:windows | pass, exit 0 | `/tmp/phase198/final-build-windows.log` |
| bun run smoke:build | pass, exit 0 | `/tmp/phase198/final-smoke-build.log` |
| bun run release:check | pass, exit 0; 1134 tests / 0 fail / 8238 assertions / 63 files | `/tmp/phase198/final-release-check.log` |

Final exact artifact state (all generated/ignored, no repository source impact):

| Artifact | Bytes | SHA-256 | Prompt identity |
| --- | --- | --- | --- |
| `dist/codesh` | 101906400 | `f390a60ac5df179baf98784f0a5c3a3c30cdbe1a770185dc421c89ba64155c1b` | exact restored prompt present; rejected candidate absent |
| `dist/codesh.exe` | 107569664 | `77a451436b15398e33814edd215100aeca5e97c3ff4a1954f66ca645142cc965` | exact restored prompt present; rejected candidate absent |
| `dist/rg` | 5728032 | `193906679498de4d939345b937fa24e0e69a03c244bd70c859f5e41232713f21` | unchanged packaged ripgrep |
| `dist/rg.exe` | 5429760 | `f9dde63498b3193f098355dbec97af99dc4f6b8fa0df5ed04114a03012c042cb` | unchanged packaged ripgrep |

Linux packaged runtime/startup/resume/ripgrep smoke and ELF/PE artifact checks pass. Windows is cross-build/artifact evidence only; native Windows runtime was not run. Final validation snapshot `/tmp/phase198/final-validation.json`. Source/test bytes all equal baseline across **237 tracked files**; historical records, .env bytes and **50 prior Phase 19.7 artifacts** unchanged. All **37 frozen acceptance artifacts** unchanged. Final HEAD `60b400629389a8fbef5b1135c696261af21345a2`; tracked diff, source diff and index diff empty. No staging or commit.

Exact final repository status:

```text
?? docs/progress/phase-19.8-progress.md
```

Protected runtime boundaries remain unchanged: ModelPort/ModelChatInput, provider adapter/HTTP/parser, orchestration, ToolRunner, registry/tool schemas, read_file/run_process contracts, process observations, ContextBuilder/context limits, reducer/canonical persistence, retrieval/memory, model selection and approval/process policy. No regex/JSON-from-content/ARGS/XML/provider-token fallback execution. Only provider-native structured fields may propose execution; prose has zero authority. No runtime semantic validator.

## Final report answers

1. **Baseline:** clean HEAD `60b400629389a8fbef5b1135c696261af21345a2`, Bun 1.4.3, 1390-byte production system hash `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc`.
2. **Candidate:** exact supplied **1584-byte** string, hash `e3c983bb6b25ba2961ac6eb22d42bb08648e3a912b9507bcce0f1a3083973cfe`. Implemented once only in `src/composition/config.ts`; necessary config/instruction test expectations updated. All three restored exactly after failure; no production path retained.
3. **Semantic preservation:** all **28 protected meanings passed** preimplementation direct review and candidate deterministic assertions. Interpretation caveats recorded above; no required semantic missing. This is contract evidence, not universal model adherence.
4. **Deterministic verification:** all pre-live and restored-state focused/full/type/format/diff/Linux/Windows/smoke/release gates passed; exact counts above.
5. **Frozen live acceptance:** Ollama 0.40.2 / ministral-3:14b, unchanged digest/template/profile/options, **all 10 real tools**, real production loop/registry/runner/context/canonical stores, **maximum 2 inference requests**.
6. **Request 1:** **no native read_file**. Structured arguments **none**; ordinary pseudo-call text only.
7. **Tool execution:** **not reached**. Preparations, read execution and canonical requested/started/completed lifecycle **0**; no tool result delivered.
8. **Request 2:** **not sent**. No proof returned; no retry after first-request failure.
9. **Inference accounting:** **1 actual / maximum 2**, retries **0**, budget closed.
10. **Security:** pseudo-call prose never executed; unchanged structured-only parser/authority; no fallback.
11. **Final decision:** **REVERTED**. Candidate passed deterministic contract but failed the predefined live criterion. This one result does not establish statistical or universal model compatibility.
12. **Final production state:** exact Phase 19.7 **1390-byte** system hash `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc` restored; **production/source/test diff empty**. Only this progress record is new.
13. **Closure:** **Phase 19 native-tool adherence investigation is CLOSED.** No Phase 19.9 is permitted by this plan. No further Phase 19 prompt diagnostic/tuning/candidate is allowed. Different-model/provider-policy/tool-capability/prompt-architecture work requires a separate future major phase and new product requirement.

## Final summary table

| Item | Final value |
| --- | --- |
| old production system hash | `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc` |
| candidate system bytes/hash | 1584 / `e3c983bb6b25ba2961ac6eb22d42bb08648e3a912b9507bcce0f1a3083973cfe` |
| deterministic semantic contract | pass, all 28 meanings |
| focused tests | pre-live 194 pass / 1716 assertions; final 194 pass / 1710 assertions; 0 fail |
| full tests | pre-live 1134 pass / 8244 assertions; final 1134 pass / 8238 assertions; 0 fail |
| typecheck | pass, pre-live and final |
| format | pass, pre-live and final; 183 files, no fixes |
| Linux build | pass, pre-live and final |
| Windows cross-build | pass, pre-live and final; native runtime unrun |
| build smoke | pass, pre-live and final |
| release check | pass, pre-live and final |
| provider/model drift | no |
| production tool count | 10 |
| request 1 native read_file | no |
| read_file normal execution | no; 0 preparations/executions |
| request 2 exact proof | no; request 2 not sent |
| provider inference requests | 1 actual / maximum 2; permanently closed |
| retries | 0 |
| textual fallback parser | no |
| final decision | REVERTED |
| final prompt hash | `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc` |
| production source changes retained | none; exact baseline bytes restored |
| Phase 19 investigation closed | yes |
| further Phase 19 diagnostic allowed | no |
| commit | none |

Process completion (`verified`) means the authorized one-candidate phase, acceptance failure, restoration, evidence and final verification are complete; it does not mean the rejected candidate was accepted. Exactly one final implementation outcome is checked: **reverted**.
