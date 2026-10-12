# Phase 19.3 — native tool context isolation

## Status

Current status: **verified** — frozen C emitted only pseudo-call text; frozen D emitted a native read_file call; exactly two requests, zero execution, Outcome B. All required focused/documentation/integrity gates pass. This verifies the bounded diagnostic, not reliable production adherence or execution of the requested read.

- [x] not started — record created before inference
- [x] audit complete
- [x] requests frozen
- [x] live qualification complete
- [x] verified
- [ ] inconclusive
- [ ] blocked

## Baseline

- Starting HEAD: `c1c64f2f8be825245f45e066e345a0e49f3d5dde`.
- Starting `git status --short --untracked-files=all`, `git diff`, and `git diff --stat`: empty.
- Bun `1.4.3`; Linux; workspace `/home/karoljaron/Projects/Local_Agentic_CLI`.
- Exactly one candidate: `ministral-3:14b`. No download, model switch, or alternate model.
- No applicable ancestor/workspace `AGENTS.md`. No sub-agents requested or spawned. Historical records and artifacts are read-only; no commit authorized.
- Authoritative records read: [Phase 19.2](phase-19.2-progress.md), [Phase 19.1](phase-19.1-progress.md), [Phase 19](phase-19-progress.md). Their protected Phase 18.1/16/15.5 boundaries remain authoritative; this measurement invokes no orchestration, preparation, selection, compiler, or execution path requiring a change.
- Integrity manifest `/tmp/phase193-baseline-integrity.json`: **232 tracked files**, **95 production TypeScript files**, **29 historical progress records**, `.env`, and nine historical evidence captures. All 95 production files are additionally byte-identical to Phase 19.2's starting HEAD `7509a285d9ae7ae56b0e95def3cf915506e655ef`; `/tmp/phase193-source-identity.json`.
- Production count **10**: `list_directory`, `find_files`, `read_file`, `search_text`, `create_file`, `edit_file`, `replace_file`, `move_file`, `delete_path`, `run_process`. C/D each expose only the real `read_file` entry taken from this registry; no cloned synthetic tool or definition edits.
- Effective current chat configuration equals Phase 19.2: model explicitly selected only inside the harness; production default system, context/output `16384/4096`, keep-alive `0`, streaming, `truncate: false`, `shift: false`. `.env`, preferences, selected application model, packages and installed model files are untouched.
- Initial host-only capture assertion compared the old harness's omitted optional embedding configuration against current environment. Before freezing or inference it was narrowed to all chat-affecting fields. Embeddings/retrieval/memory are never invoked. This was a deterministic audit correction, **zero inference**, with no request/prompt/tool change.
- Baseline focused command below: **108 pass, 0 fail, 1,005 assertions, 5 files, 115 ms**, `/tmp/phase193-baseline-focused.log`. Native mapping and pseudo-call negatives pass.
- Starting provider inference count **0**; hard maximum **2**, one C and one D. No A/B rerun, retry, continuation, tool-result round, or alternate prompt.

Exact UTF-8 identities (`SHA-256` over strings/`JSON.stringify` with production property ordering):

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| production default system | 1390 | `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc` |
| read_file generic definition | 717 | `4050d9c7d7569c116d05311f513a51b19fd6cedb964471b0c8bcb9c2f776c9bc` |
| read_file parameters/schema | 499 | `db50a0d44325d0f927cdd580dc7886ff5292eecdb18516dc3957b2bfa456098c` |
| read_file wire function | 748 | `2ad18509a7682736490b03dda7f418a4ac69ffca73b491c390e53883b9aa3d22` |
| single wire tool array | 750 | `d7382d3f27a729c39fc26bf897fcb7322ed5e9f521760543dfcc400b350de8fd` |
| all ten generic definitions | 5132 | `f84801a5ccdf6bbe2d0c83db6e5fe25c82c7d617a28af83a0b53d80165068e95` |
| all ten wire definitions | 5043 | `7667de266447b3882652731e64b98fa87071a7b8bd7b98e25c75df29c791da10` |
| frozen user message | 114 | `5b1eee3bc7307290be03bfb0172cdfb3413cd5395b342c037c78c22b4cde5800` |

The `read_file` definition equals the current ten-tool surface entry and Phase 19.2 A's wire entry byte-for-byte. Its schema hash equals Phase 19.2's frozen per-tool hash. Current system equals both Phase 19.2 A and Phase 19.1 final, with no shortening or override.

### Provider identity — no drift

Read-only `/api/version`, `/api/tags`, `/api/show` before freezing; raw captures `/tmp/phase193-provider-{version,tags,show}.json`; comparison `/tmp/phase193-provider-identity.json`.

- Ollama **0.40.2**.
- Exact digest `129e04c05b562f6e6ea7ec07ef0b0a61ef1aeaedb91ac524e67a1672eba7bb36`.
- Template **3414 bytes**, SHA-256 `aa65b5aebf89e7dfb3aa05af9220299a7e1cebe3ab97daae3c2e259acbdf278c`.
- Capabilities in both tags/show: `["completion", "vision", "tools"]`.
- Parameters unchanged: `temperature 0.15`; no sampler override. Selected tag metadata, model info, Modelfile, capabilities, parameters and exact template equal Phase 19.2 captures.
- Installed provider parser/template behavior and Phase 19.2's supported API audit remain authoritative; no repeated full source/manifest audit, format, `tool_choice`, `function_call`, `required_tools`, reasoning or provider-template override.
- Curl metadata captures succeeded. Bun's inside-sandbox localhost preflight failed `ECONNREFUSED`; the same read-only check outside the sandbox returned HTTP 200 / `0.40.2`. **Zero inference** in both checks. Live transport requires that same outside-sandbox localhost access.
- Harness rechecks version/digest/template/capabilities/parameters immediately before dispatch and after the two conditions. Any identity mismatch stops before inference; post-live identity drift prevents a responsible diagnostic conclusion.

### Frozen Phase 19.2 A/B evidence — reused, never rerun or rescored

[Phase 19.2](phase-19.2-progress.md) remains verified, with **Outcome C — application-context adherence issue remains plausible**. Generic native serialization/mapping/parser behavior is mechanically correct; native provider calls are supported; no mapping/parser bug or required tool-choice field was found. Pseudo-call prose is non-executable. These conclusions are preserved.

| Scenario | Frozen condition | Frozen result | Frozen counts |
| --- | --- | --- | --- |
| 19.2 A | production system + all 10 real tools | no native field; ordinary `read_file[ARGS]{"path": "native-tool-proof.txt"}` | stop; 1,249 prompt / 15 output; 15 raw frames |
| 19.2 B | no system + one synthetic `lookup_private_value` | real native `lookup_private_value` with `{"key":"proof"}`; ordinary content empty | stop; 674 prompt / 14 output; 2 raw frames |

Frozen A request `/tmp/phase192-request-A.json`: SHA-256 `2405db6a434a33da0953222e8bca80793c75b117117e6ccec00a6cb692c30bb4`; raw `/tmp/phase192-provider-request-1.ndjson`: `87723f646b0cd4578a3007f94c450de71f3f277312f2140a76f8a8777501e3ca`.

Frozen B request `/tmp/phase192-request-B.json`: SHA-256 `3c2ece1cecdea4caacb0c4cd2ead4dfed42b16425fcf1d0db694f6f1c211931d`; raw `/tmp/phase192-provider-request-2.ndjson`: `12cd679e0606b393ea6d644711ba251936ac4861c5b435554cb6365c16321cb3`.

Complete historical live evidence `/tmp/phase192-live-evidence.json`: SHA-256 `305025558d21cfcf79a0af52b9c7d943992f90f0c103d80c7e98d478f9573db7`. Phase 19.1 captured default remains exact. All historical artifacts are protected by the starting integrity manifest.

## Isolation design

- **C:** exact production default system, then the frozen user message; exact real production `read_file` only.
- **D:** the same frozen user message; no application system-role message, including no empty system string; the same exact real `read_file` only.
- Shared model/profile/provider options and property ordering: exactly equal. C's body equals Phase 19.2 A after replacing its ten-tool array with its existing `read_file` entry. D's body equals C after removal of `/messages/0`.
- The only intentional ModelPort/message-level difference is application system-message presence. Absence naturally permits the installed template's fallback; no provider fallback replacement is fabricated.
- User wording is exactly Phase 19.2 A's, identical in C/D:

```text
Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess.
```

Disposable `/tmp/phase193-live-*` workspace owns `native-tool-proof.txt`, containing fixed host-only `NATIVE_TOOL_PROOF_731942` (no newline), preserving Phase 19.2's task fixture. Both bodies are asserted to omit this value, tool examples, `[ARGS]`, textual syntax, and experiment hints. No application tool reads the file or returns it to the model. Only host-side initial/final integrity is observed.

Fixed order **C then D**. Per-request timeout **60,000 ms**, one aggregate **130,000 ms**. Each frozen condition is dispatched once even if the other fails, provided the aggregate bound permits. Zero retries, extensions, third requests, or additional variants.

At the first mapped native call, record the chunk, abort and break immediately. Raw capture forwards unchanged received bytes into the existing parser and uses zero stream read-ahead. No further raw read, tool invocation, approval, result, or model round is requested. Native observations are scored on the raw `message.tool_calls` field, without argument repairs; any parser error is retained. If terminal metadata was not already received before this required stop, it is explicitly unavailable rather than reconstructed. Non-native requests consume the normal stream to completion/error/timeout.

## Frozen request captures

Freeze timestamp: `2026-10-12T17:54:34.491011+00:00`. Real inference **0**, two mocked capture requests through production `OllamaModelAdapter` → `OllamaHttpClient` serialization. No ContextBuilder requirement or synthetic provider protocol; real ModelPort types and adapter parser are used. Syntax-only disposable Bun bundle passed; this is not a release/build gate.

| Condition | Exact body bytes | Exact body SHA-256 |
| --- | --- | --- |
| C | 2470 | `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4` |
| D | 1049 | `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7` |

Structural proof in `/tmp/phase193-capture-summary.json`:

```json
[{"op":"remove","path":"/messages/0"}]
```

Applying this removal to either the C wire body or its frozen ModelPort input yields D exactly. Assertions prove one C system message, no D system message, one identical real tool each, byte-identical user, equal non-message fields, unchanged profile/keep-alive/stream/truncate/shift, absent format/choice/sampler/reasoning overrides, exact production/default/historical identities, and no hidden proof value. All assertions pass before inference.

Shared top-level serializer order: `model`, `messages`, `keep_alive`, `tools`, `stream`, `options`, `truncate`, `shift`. The bodies below are the exact minified bytes saved without a final newline; Markdown fence newlines are presentation only.

### Exact serialized C body

```json
{"model":"ministral-3:14b","messages":[{"role":"system","content":"Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly. Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work. Respect user/repository command restrictions and required checks. Verify material changes with bounded proportionate run_process checks from instructions/configuration/CI or user/prior successful commands; reuse known commands. Tiny text edits or unavailable/disproportionate checks may remain unverified. Read exit status/stdout/stderr: non-zero exits are diagnostic results, not tool failures. Repair only evidenced failures relevant to requested work; inspect narrowly if uncertain. Reverify repairs when useful. Stop when failure persists without new evidence, fixes are speculative/unrelated or broaden scope, execution is denied/unavailable, or timeout/output prevents safe progress. No automatic dependency installation, downloads or network recovery. Never claim checks passed or failures fixed without current-task tool or trustworthy user evidence; edits alone prove neither. Report verified scope and failed/unrun/blocked/inconclusive checks; disclose repairs without re-verification."},{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

### Exact serialized D body

```json
{"model":"ministral-3:14b","messages":[{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

### Frozen artifacts and harness

| Path | SHA-256 |
| --- | --- |
| `/tmp/phase193-request-C.json` | `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4` |
| `/tmp/phase193-request-D.json` | `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7` |
| `/tmp/phase193-input-C.json` | `d3ee5073aab9891ac40fa2d7d29fd4841cde7c3ff140728372616f58bdcee48c` |
| `/tmp/phase193-input-D.json` | `ec94328ee934cbadd0726a529ece87bd619bd29b7133ef5da8c17921d5a170ec` |
| `/tmp/phase193-live.ts` | `26f2489691486dc649d0f8a1de7c0422f2ae08b573e5976795a0544c6838be2e` |
| `/tmp/phase193-capture.ts` | `d0a5738159c54f244967f373d3101d5b0ae7294e52535e067ea6a4e89936a247` |
| `/tmp/phase193-provider-identity.json` | `08a976664cd02a4e85d56c96a06818e3e151bb2712ebe06a16708cba20d5bbc3` |
| `/tmp/phase193-baseline-integrity.json` | `d086e61a3fd0f03f835516b346c388960e4a8aed0cd12864261a071904b592dd` |
| `/tmp/phase193-capture-summary.json` | `4bb61ede7f29955a636e673eef46f9a1ba97e4f5e1ec6d0627ebbbaae1a46c56` |
| `/tmp/phase193-frozen-plan.json` | `7f5381614637cc00204ff25c8b73bd436f4fa3fdddc003699a8179c885c554d5` |

All artifacts/inputs/body hashes are checked at launch; repository baseline bytes are checked before every dispatch. Live harness `/tmp/phase193-live.ts` has a hard pre-dispatch cap and durably records attempted requests before HTTP transport. Exclusive permanent `/tmp/phase193-live-once.lock` prevents a second launch, including after interruption. Harness and frozen captures are not modified after live output. They remain outside the repository.

## Deterministic verification

Focused pre-live and post-live scope (all provider responses mocked; no live tools/processes/model inference in this scope beyond existing deterministic fixture behavior):

```text
bun test src/infrastructure/model/OllamaModelAdapter.test.ts src/infrastructure/model/InstructionSurface.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/application/use-cases/RunAgentTurnNativeTools.test.ts src/composition/config.test.ts
```

Covers Phase 19.2 native and pseudo-call negative regressions, instruction/ten-tool integrity, read schema, and config defaults. Production adapter/HTTP/stream/mapper bytes match Phase 19.2; exact hashes are in `/tmp/phase193-source-identity.json`. No new runtime tests or test-source edits are necessary; freezing invariants are asserted deterministically in the disposable helper.

## Live evidence

The frozen harness ran **once** with authorized outside-sandbox localhost access:

```text
bun /tmp/phase193-live.ts > /tmp/phase193-live.log 2>&1
```

Started `2026-10-12T17:57:26.509Z`, finished `2026-10-12T17:57:36.835Z`; total live duration **10325.432158 ms**, within the 130,000 ms aggregate bound. Exit 0 means diagnostic completion. **Exactly 2 provider inference requests**, one C and one D; the budget is permanently closed. Metadata reads are not inference; no activation/unload, memory/embedding, retry, third request, continuation, or post-tool round.

Launch/post-live identity matches the frozen provider identity and Phase 19.2: version `0.40.2`, exact model digest/template hash/capabilities/parameters unchanged. Both requests equal their frozen bodies. All 232 baseline tracked files and `.env` passed byte-integrity checks before each dispatch and at live close.

Disposable proof file remained exactly `NATIVE_TOOL_PROOF_731942`; workspace was removed. It was absent from both requests, never read through ToolRunner, and never delivered as a tool result. Live approvals **0**, tool execution **0**, ToolRunner file reads **0**, mutations **0**, `run_process` calls **0**. Event/orchestration behavior is not under test here; Phase 19.2's verified pipeline remains authoritative.

### Scenario C — textual pseudo-call

- Status: `completed`; inference requests **1**; native raw calls **0**, mapped calls **0**.
- Actual request body equals `/tmp/phase193-request-C.json` byte-for-byte; SHA-256 `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4`.
- Host request duration **4910.576799 ms**; raw transport **15 chunks / 15 NDJSON frames / 2218 bytes**; mapped **15 chunks**.
- Raw artifact `/tmp/phase193-provider-C.ndjson`, SHA-256 `ede6e4dbc734bb4c8885c070e00643e6c4d15b7b7fd45fcca9cdc24d7d25a370`; no malformed raw frame or transport/parser error observed.

Completed HTTP 200 stream; every raw frame lacks `message.tool_calls`. The unchanged parser emits fourteen ordinary content deltas followed by a terminal stop/usage chunk. Raw content and concatenated mapped content match exactly; no native call was dropped. Exact pseudo-call content remains non-executable:

```text
read_file[ARGS]{"path": "native-tool-proof.txt"}
```

Native name/structured arguments: **none**; textual JSON is not execution authority.

#### Exact raw transport chunks

These base64 entries preserve every byte returned by the real fetch body reader before completion/cancellation. Times are milliseconds from live harness start. Concatenating decoded entries reproduces the exact raw NDJSON artifact and hash; none is derived from mapped output.

| Chunk | At ms | Bytes | Base64 |
| --- | --- | --- | --- |
| 1 | 4087.842228 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMwLjU5NjkzMTY5WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJyZWFkIn0sImRvbmUiOmZhbHNlfQo=` |
| 2 | 4149.288747 | 132 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMwLjY1OTE1OTcwOFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXyJ9LCJkb25lIjpmYWxzZX0K` |
| 3 | 4209.514856 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMwLjcxOTMzMzk4NVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiZmlsZSJ9LCJkb25lIjpmYWxzZX0K` |
| 4 | 4267.786814 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMwLjc3NzY1NjAzNFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiW0FSR1NdIn0sImRvbmUiOmZhbHNlfQo=` |
| 5 | 4326.269090 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMwLjgzNjE0MzAzOFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoie1wiIn0sImRvbmUiOmZhbHNlfQo=` |
| 6 | 4386.931863 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMwLjg5NjgxNzU4M1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicGF0aCJ9LCJkb25lIjpmYWxzZX0K` |
| 7 | 4444.746096 | 133 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMwLjk1NDYxNDAxWiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJcIjoifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 8 | 4502.634947 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMxLjAxMjQ0NjAzNVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIFwiIn0sImRvbmUiOmZhbHNlfQo=` |
| 9 | 4563.335691 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMxLjA3MzIwNjgyMVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoibmF0aXZlIn0sImRvbmUiOmZhbHNlfQo=` |
| 10 | 4620.969456 | 136 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMxLjEzMDgzMjcyNVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXRvb2wifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 11 | 4678.933487 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMxLjE4ODgwMjI0MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXBybyJ9LCJkb25lIjpmYWxzZX0K` |
| 12 | 4737.104387 | 133 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMxLjI0Njk3NTk0NloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoib2YifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 13 | 4796.234501 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMxLjMwNjEwNjY2OFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLnR4dCJ9LCJkb25lIjpmYWxzZX0K` |
| 14 | 4855.622451 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMxLjM2NTQ5NTcxMVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCJ9In0sImRvbmUiOmZhbHNlfQo=` |
| 15 | 4914.403421 | 334 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjMxLjQyNDI2OTgwNFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIn0sImRvbmUiOnRydWUsImRvbmVfcmVhc29uIjoic3RvcCIsInRvdGFsX2R1cmF0aW9uIjo0OTA0NjYzMTYzLCJsb2FkX2R1cmF0aW9uIjozNzI0NzE5OTQ2LCJwcm9tcHRfZXZhbF9jb3VudCI6NDM1LCJwcm9tcHRfZXZhbF9jYWNoZWRfY291bnQiOjAsInByb21wdF9ldmFsX2R1cmF0aW9uIjozNDk3NzcwMDAsImV2YWxfY291bnQiOjE1LCJldmFsX2R1cmF0aW9uIjo4MjcxNzkwMDB9Cg==` |

#### Every observed NDJSON frame — exact raw bytes decoded as UTF-8

```jsonl
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:30.59693169Z","message":{"role":"assistant","content":"read"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:30.659159708Z","message":{"role":"assistant","content":"_"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:30.719333985Z","message":{"role":"assistant","content":"file"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:30.777656034Z","message":{"role":"assistant","content":"[ARGS]"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:30.836143038Z","message":{"role":"assistant","content":"{\""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:30.896817583Z","message":{"role":"assistant","content":"path"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:30.95461401Z","message":{"role":"assistant","content":"\":"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:31.012446035Z","message":{"role":"assistant","content":" \""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:31.073206821Z","message":{"role":"assistant","content":"native"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:31.130832725Z","message":{"role":"assistant","content":"-tool"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:31.188802242Z","message":{"role":"assistant","content":"-pro"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:31.246975946Z","message":{"role":"assistant","content":"of"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:31.306106668Z","message":{"role":"assistant","content":".txt"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:31.365495711Z","message":{"role":"assistant","content":"\"}"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:31.424269804Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":4904663163,"load_duration":3724719946,"prompt_eval_count":435,"prompt_eval_cached_count":0,"prompt_eval_duration":349777000,"eval_count":15,"eval_duration":827179000}
```

The raw artifact retains its actual final newline; no provider frame was manufactured after cancellation.

#### Exact mapped ModelStreamChunk sequence

`chunk` is the unchanged parser output; `atMs` records observation timing.

```json
[
  {
    "atMs": 4088.289248,
    "chunk": {
      "contentDelta": "read"
    }
  },
  {
    "atMs": 4149.44926,
    "chunk": {
      "contentDelta": "_"
    }
  },
  {
    "atMs": 4209.707561,
    "chunk": {
      "contentDelta": "file"
    }
  },
  {
    "atMs": 4267.998303,
    "chunk": {
      "contentDelta": "[ARGS]"
    }
  },
  {
    "atMs": 4326.466489,
    "chunk": {
      "contentDelta": "{\""
    }
  },
  {
    "atMs": 4387.093157,
    "chunk": {
      "contentDelta": "path"
    }
  },
  {
    "atMs": 4444.9869739999995,
    "chunk": {
      "contentDelta": "\":"
    }
  },
  {
    "atMs": 4502.938695,
    "chunk": {
      "contentDelta": " \""
    }
  },
  {
    "atMs": 4563.559458,
    "chunk": {
      "contentDelta": "native"
    }
  },
  {
    "atMs": 4621.197828,
    "chunk": {
      "contentDelta": "-tool"
    }
  },
  {
    "atMs": 4679.158268,
    "chunk": {
      "contentDelta": "-pro"
    }
  },
  {
    "atMs": 4737.324879,
    "chunk": {
      "contentDelta": "of"
    }
  },
  {
    "atMs": 4796.46171,
    "chunk": {
      "contentDelta": ".txt"
    }
  },
  {
    "atMs": 4855.903749,
    "chunk": {
      "contentDelta": "\"}"
    }
  },
  {
    "atMs": 4914.654176,
    "chunk": {
      "contentDelta": "",
      "finishReason": "stop",
      "usage": {
        "promptTokens": 435,
        "outputTokens": 15
      }
    }
  }
]
```

#### Terminal frame and counters

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-12T17:57:31.424269804Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 4904663163,
  "load_duration": 3724719946,
  "prompt_eval_count": 435,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 349777000,
  "eval_count": 15,
  "eval_duration": 827179000
}
```
### Scenario D — native

- Status: `native-emission-stop`; inference requests **1**; native raw calls **1**, mapped calls **1**.
- Actual request body equals `/tmp/phase193-request-D.json` byte-for-byte; SHA-256 `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7`.
- Host request duration **5406.610646 ms**; raw transport **1 chunks / 1 NDJSON frames / 256 bytes**; mapped **1 chunks**.
- Raw artifact `/tmp/phase193-provider-D.ndjson`, SHA-256 `53fdcb5021201a0d313d7f4d6c899aec1a0660fd45c5fccaa46f68453dd955d1`; no malformed raw frame or transport/parser error observed.

HTTP 200; first raw frame contains one real provider-native call, and the unchanged parser maps it once. Expected tool name `read_file` and exact structured arguments `{"path":"native-tool-proof.txt"}` both match; no normalization/repair by this harness. Content alongside the call is exactly empty. Provider ID `call_7uhijzix`/index `0` remain raw provider metadata; the existing mapper supplies name/arguments without generating a host execution ID.

The request was immediately aborted and reader cancelled after this mapped chunk. This is the frozen native-emission stopping rule, **not provider failure**; native emission is observed. No ToolRunner, tool execution, result, continuation, or follow-up read occurred.

#### Exact raw transport chunks

These base64 entries preserve every byte returned by the real fetch body reader before completion/cancellation. Times are milliseconds from live harness start. Concatenating decoded entries reproduces the exact raw NDJSON artifact and hash; none is derived from mapped output.

| Chunk | At ms | Bytes | Base64 |
| --- | --- | --- | --- |
| 1 | 10320.653114 | 256 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE3OjU3OjM2LjgyOTk4MzkzMloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIiwidG9vbF9jYWxscyI6W3siaWQiOiJjYWxsXzd1aGlqeml4IiwiZnVuY3Rpb24iOnsiaW5kZXgiOjAsIm5hbWUiOiJyZWFkX2ZpbGUiLCJhcmd1bWVudHMiOnsicGF0aCI6Im5hdGl2ZS10b29sLXByb29mLnR4dCJ9fX1dfSwiZG9uZSI6ZmFsc2V9Cg==` |

#### Every observed NDJSON frame — exact raw bytes decoded as UTF-8

```jsonl
{"model":"ministral-3:14b","created_at":"2026-10-12T17:57:36.829983932Z","message":{"role":"assistant","content":"","tool_calls":[{"id":"call_7uhijzix","function":{"index":0,"name":"read_file","arguments":{"path":"native-tool-proof.txt"}}}]},"done":false}
```

The raw artifact retains its actual final newline; no provider frame was manufactured after cancellation.

#### Exact mapped ModelStreamChunk sequence

`chunk` is the unchanged parser output; `atMs` records observation timing.

```json
[
  {
    "atMs": 10321.149455,
    "chunk": {
      "contentDelta": "",
      "toolCalls": [
        {
          "name": "read_file",
          "arguments": {
            "path": "native-tool-proof.txt"
          }
        }
      ]
    }
  }
]
```

#### Terminal frame and counters

Not received before the intentional native-emission stop. `done_reason`, prompt/eval counts, provider total/load/eval durations, and terminal mapped metadata are **unavailable**, not zero. No additional stream read/request was made to obtain them.

### Closed inference ledger

| Request | Frozen condition | Native channel | Ordinary content | End |
| --- | --- | --- | --- | --- |
| 1 | C: production system + real read_file only | absent | exact pseudo-call above | clean provider stop, no execution |
| 2 | D: no system + identical real read_file | one expected native read_file | empty | intentional abort at first native emission, no execution |

Total **2 / maximum 2**; retries **0**, continuation requests **0**, post-tool model rounds **0**, alternate prompt variants **0**, alternate models **0**, downloads **0**. The C/D distinction is the precommitted isolation, not a post-output variant.

Complete evidence `/tmp/phase193-live-evidence.json`, SHA-256 `88ff6d768da2b1050984171e7482202a3999cac0e4458bc927d980e9b9942702`; extracted summary `/tmp/phase193-live-summary.json`, trace `/tmp/phase193-live.log`, permanent launch marker `/tmp/phase193-live-once.lock`. All exact frozen bodies, transport byte chunks, raw lines/frames, mapped chunks, identity observations, stop behavior, timing and file integrity are retained. Frozen harness/plan/captures and Phase 19.1/19.2 evidence remain unchanged after live output.

## Interpretation

**Pattern 2 — C non-native, D native. Outcome B — system-message effect strongly implicated.**

Under otherwise byte-identical one-real-tool conditions, application system-message presence is strongly associated with the observed native-adherence failure. C still emits a textual pseudo-call after removing nine tools; D proves this exact real `read_file` definition can yield a native call through the same provider/adapter/parser without an application system message.

This identifies no particular sentence as wrong and does not prove that every system message or every run fails. The installed provider fallback naturally differs when the application system message is absent; this is an intended part of the presence/absence variable. Two single samples cannot separate system wording, template fallback interaction, or stochastic adherence, and do not certify reliable production behavior. No ten-tool limit is inferred. Phase 19.2 A/B and their Outcome C remain unchanged; the new phase contributes the specified C/D association.

**Exactly one recommended next direction: system-instruction ergonomics isolation.** It is not implemented or run in this phase. No prompt sentence, tool description/schema, parser, adapter or model selection was changed after observing output.

### Final four-point comparison

| Scenario | System | Tool surface | Native call | Ordinary content | Interpretation |
| --- | --- | --- | --- | --- | --- |
| 19.2 A | production | 10 production tools | frozen: no | frozen: `read_file[ARGS]{"path": "native-tool-proof.txt"}` | frozen failure; Phase 19.2 Outcome C preserved |
| 19.2 B | none | 1 synthetic tool | frozen: yes, lookup_private_value({"key":"proof"}) | frozen: empty | frozen native capability evidence |
| 19.3 C | production | 1 real read_file | measured: no | measured: `read_file[ARGS]{"path": "native-tool-proof.txt"}` | textual pseudo-call under one-tool production-system condition |
| 19.3 D | none | 1 real read_file | measured: yes, read_file({"path":"native-tool-proof.txt"}) | measured: empty | native emission; Pattern 2 / new Outcome B |

A/B are reused, not rerun/rescored. C is exactly A after reducing only the tool array; D is exactly C after removing only the system message. No returned tools were executed.

## Production impact

**Production source changes: none.** Actual repository change: this progress record only. Prompt/descriptions/schemas/adapter/parser/tool count/ContextBuilder/ToolRunner/registry/model selection remain byte-unchanged. Architecture, tests, history, `.env`, preferences, packages, model files, Modelfile and template remain unchanged. Live approvals, tool execution, ToolRunner reads, mutations and `run_process` calls: zero.

Textual `read_file[ARGS]{...}` and other tool-looking assistant content remain ordinary non-executable text. Only native `message.tool_calls` can propose execution; this harness executes neither native nor textual output. No fallback parser or provider-template decoding in application code. No durable architecture change is warranted by contextual single-run evidence. No commit or staging.

## Final validation

| Gate | Final result | Evidence |
| --- | --- | --- |
| Focused native/parser/pseudo-call/instruction/tool/config baseline | PASS: 108 tests, 0 fail, 1,005 assertions, 5 files; 115 ms | `/tmp/phase193-baseline-focused.log` |
| Same focused scope after live | PASS: 108 tests, 0 fail, 1,005 assertions, 5 files; 217 ms | `/tmp/phase193-focused-final.log` |
| `bun run typecheck` | PASS, exit 0 | `/tmp/phase193-typecheck.log` |
| `bun run format:check` | PASS, exit 0; 183 files, no fixes | `/tmp/phase193-format.log` |
| `git diff --check` | PASS, no diagnostics | direct check and final review |
| Progress-file whitespace / UTF-8 / final newline / local links | PASS; `git diff --no-index --check /dev/null docs/progress/phase-19.3-progress.md` has no diagnostics (exit 1 is expected new-file difference) | `/tmp/phase193-final-review.py`, `/tmp/phase193-final-review.json` |
| C/D frozen bodies / tools / user / options / system-only diff | PASS; live bodies exactly frozen; C equals frozen A with only its read_file entry; D equals C without system | capture summary and final review |
| Raw bytes / every observed frame / mapped sequence / terminal availability | PASS; base64 reproduces raw artifacts; raw content/native fields match mapped output; D terminal correctly unavailable after immediate native stop | full live evidence, this record, final review |
| Provider/model/template identity | PASS; no drift from Phase 19.2 before or after live | provider identity and launch/post-live evidence |
| Inference cap / one-shot lock / zero execution / disposable workspace | PASS; exactly C + D, 2 requests, no retry/result/continuation; lock retained; workspace removed | closed ledger and final review |
| Source/history/environment/frozen-artifact integrity; HEAD/index/status | PASS; all 232 tracked files, 95 production sources, 29 historical progress records, `.env`, nine historical captures and all frozen hashes unchanged | baseline integrity, source identity, final review |

Complete progress content reviewed, including exact serialized bodies, 16 observed provider frames, all 16 transport chunks and all 16 mapped chunks. The final review rechecks all embedded raw/base64/mapped evidence, structural equality, unchanged frozen plan/harness, history and actual status. The live harness contains no ToolRunner or execution/preparation/activation/unload invocation. No source/test edit followed live output.

Final `git diff --stat` and tracked `git diff`: empty, because the sole change is the new unstaged progress file. Exact final `git status --short --untracked-files=all`:

```text
?? docs/progress/phase-19.3-progress.md
```

HEAD remains `c1c64f2f8be825245f45e066e345a0e49f3d5dde`; index empty; no staging or commit. No durable architecture or runtime-test change. Full-suite/Linux/Windows/release/build-smoke gates were not run for this progress-record-only diagnostic; no release or current Windows-runtime claim is made. Final record-only updates receive lightweight integrity/whitespace/status review without further inference or unnecessary repeat gates.

## Final summary

| Item | Final value |
| --- | --- |
| candidate | `ministral-3:14b` |
| provider/model drift | no; provider/model/template/tool/system identities match Phase 19.2 |
| C system | exact production default |
| D system | none; no empty system message |
| C/D user prompt identical | yes; also exact frozen Phase 19.2 A user prompt |
| C/D tool definition identical | yes; exact generic/wire/schema identity |
| tool used | exact production `read_file` definition |
| C native call | no; raw and mapped native counts zero |
| D native call | yes; one raw and one mapped `read_file` |
| C pseudo-call | `read_file[ARGS]{"path": "native-tool-proof.txt"}`; ordinary non-executable content |
| D pseudo-call | none; ordinary content empty |
| native structured arguments | D: `{"path":"native-tool-proof.txt"}`; no repair |
| D terminal metadata | unavailable after required immediate native-emission stop; not reconstructed |
| total inference requests | 2 / maximum 2; one C, one D; closed |
| retries | 0 |
| continuation / post-tool requests | 0 |
| prompt variants | 0 beyond the two precommitted system-presence conditions |
| alternate models | 0 |
| downloads | 0 |
| tool execution | 0; approvals / ToolRunner reads / mutations / run_process calls also 0 |
| textual fallback parser | no |
| tool_choice / equivalent | absent |
| root-cause outcome | **B — system-message effect strongly implicated** |
| next direction | **system-instruction ergonomics isolation**; not implemented |
| production source changes | none; repository change is this progress record only |
| Phase 19.2 changes | none; A/B reused without rerun or rescoring |
| Phase 19.1 changes | none |
| model selection changes | none |
| commit | none |
