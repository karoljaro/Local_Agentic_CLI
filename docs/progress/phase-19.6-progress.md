# Phase 19.6 — bounded native-tool adherence replication

## Status

Current status: **verified** — E2/G2/H2 each emitted only textual pseudo-call content; exactly three requests, zero execution, Outcome B. All required focused/type/format/document/evidence/byte-integrity checks pass. This verifies the bounded diagnostic; E's prior native control did not replicate. This record was created before inference.

- [x] not started
- [x] audit complete
- [x] historical request identities verified
- [x] replication requests frozen
- [x] live replication complete
- [x] verified
- [ ] inconclusive
- [ ] blocked

## Baseline

- Starting HEAD: `c5797a4b9e69e0304386929e35a5c9c830b28de3`.
- Starting git status, tracked diff/stat and index diff: empty. No staging or commit.
- Bun `1.4.3`; candidate **ministral-3:14b** only.
- Authoritative records read: [Phase 19.5](phase-19.5-progress.md), [Phase 19.4](phase-19.4-progress.md), [Phase 19.3](phase-19.3-progress.md), [Phase 19.2](phase-19.2-progress.md). Historical observations and records are read-only; E/G/H are reused without rerun or rescoring.
- No applicable ancestor/workspace/docs `AGENTS.md`; no delegation or sub-agents.
- Byte manifest `/tmp/phase196-baseline-integrity.json`: **235 tracked files**, **95 production TypeScript files**, **32 historical progress records**, `.env` and **41 available prior Phase 19.5 helper/evidence files**. It was taken after creating only this new untracked record; starting clean status was independently captured first. All tracked source/test bytes equal Phase 19.5 starting HEAD: `git diff 21bbe841178b58fb230eb9641c82ece61ee61a64 HEAD -- src` is empty.
- Historical Phase 19.5 plan/provider/evidence artifacts match the hashes in its authoritative document. Their bytes are protected throughout this phase. Available E/G/H temporary bodies also equal the bodies recovered from the documents.
- Focused deterministic baseline: **108 pass, 0 fail, 1005 assertions, 5 files, 113 ms**, exit 0; `/tmp/phase196-baseline-focused.log`. All provider responses mocked. Native mapping, pseudo-call non-execution, production tool/instruction surface and configuration identities pass. No generic regression gap found; no test changes.

Focused command:

```text
bun test src/infrastructure/model/OllamaModelAdapter.test.ts src/infrastructure/model/InstructionSurface.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/application/use-cases/RunAgentTurnNativeTools.test.ts src/composition/config.test.ts
```

### Environment integrity

Read-only `/api/version`, `/api/tags` and `/api/show` verify **no drift** from Phase 19.5 before freezing. Complete selected tag and complete show response equal its preserved, hash-verified capture.

- Ollama **0.40.2**, base URL `http://localhost:11434`.
- Candidate digest `129e04c05b562f6e6ea7ec07ef0b0a61ef1aeaedb91ac524e67a1672eba7bb36`.
- Template **3414 UTF-8 bytes**, SHA-256 `aa65b5aebf89e7dfb3aa05af9220299a7e1cebe3ab97daae3c2e259acbdf278c`.
- Capabilities `["completion", "vision", "tools"]`; exact parameter metadata `temperature                    0.15`. No sampler/temperature override.
- Model family `mistral3`, families `["mistral3", "clip"]`, quantization `Q4_K_M`, displayed parameter size `13.9B`, parameter count `13506073600`, model context `262144`, tag size `9082557469` and modified timestamp remain identical. Complete Modelfile/model_info/template/parameters/tag metadata also match.
- Effective chat configuration matches Phase 19.5: isolated candidate selection inside the disposable harness; context/output **16384/4096**, keep_alive **0**, `stream: true`, `truncate: false`, `shift: false`. No format/tool-choice/function-call/required-tools, seed, sampling, reasoning or template override.
- Curl metadata access succeeded. Bun's sandboxed metadata-only `/api/version` preflight failed `ECONNREFUSED` and sent **zero inference**. The same check outside the sandbox passed HTTP 200 / `0.40.2`; live transport uses this access, as in prior phases. This is a transport preflight, not an inference retry.
- Production adapter/HTTP transport/parser remain byte-identical. The harness uses unchanged `OllamaModelAdapter` → `OllamaHttpClient` → `readOllamaChatStream`, with a host-only raw-byte tap. No activation/unload, embedding, retrieval or memory inference.

| Artifact | UTF-8 bytes | SHA-256 |
| --- | --- | --- |
| current production system | 1390 | `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc` |
| production read_file generic definition | 717 | `4050d9c7d7569c116d05311f513a51b19fd6cedb964471b0c8bcb9c2f776c9bc` |
| read_file schema | 499 | `db50a0d44325d0f927cdd580dc7886ff5292eecdb18516dc3957b2bfa456098c` |
| read_file wire function | 748 | `2ad18509a7682736490b03dda7f418a4ac69ffca73b491c390e53883b9aa3d22` |
| single wire tool array | 750 | `d7382d3f27a729c39fc26bf897fcb7322ed5e9f521760543dfcc400b350de8fd` |

## Replication design

Exactly **one new replicate per condition**, fixed **E2 → G2 → H2**. Hard maximum and intended total **3 provider inference requests**. Per-request timeout **60000 ms**; aggregate timeout **190000 ms**. All frozen conditions run if the aggregate bound permits, independent of the preceding classification. No deadline extension, retry, duplicate, continuation, post-tool result round, adaptive fourth condition, alternate prompt/model or download.

E2 replicates Phase 19.4 E; G2/H2 replicate Phase 19.5 G/H. This phase compares the frozen historical observations only and performs no further clause isolation or prompt tuning.

### Historical source recovery

Read-only `git show 97962a5d53c137b329a770f000bac108e61fa271:src/composition/config.ts` recovers the single unescaped historical `SYSTEM_PROMPT` literal. Python recovery and Bun input construction independently read this history; no checkout or manual reconstruction.

Historical source **2224 bytes**, git blob `c61901f0bda817f6ed3c3614d58e43bd06575e5d`, SHA-256 `b89268177272f261a56b3e3ab8a1bdcd900dbd91c393f79205026ba99558c4fe`. Full historical system **394 bytes**, SHA-256 `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597`.

As in Phase 19.5, split immediately after source-derived `Use known paths directly.`, at byte offset **143**, discard exactly the one ASCII space (`20`), and retain the remaining **250** bytes. Six sentences, three per half; independent sentence joining agrees. **G + " " + H equals the full historical string byte-for-byte.**

| System | UTF-8 bytes | SHA-256 |
| --- | --- | --- |
| E2 | 26 | `a57b125ef84ed22f78c1fa20f293b0b217d3e4b9581bb869870a22d32618f03b` |
| G2 | 143 | `b173d1f5b44f38ea3392341476ec7e85d94e77c1119d45d363b0e7d20e125484` |
| H2 | 250 | `eafdd504dde4124d6e048e688ea915c59839d2dc7dfc67130cdff582b112df53` |

### Exact E2 system — minimal explicit, exact historical E

```text
Follow the user's request.
```

### Exact G2 system — historical sentences 1–3, source-derived

```text
Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly.
```

### Exact H2 system — historical sentences 4–6, source-derived

```text
Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work.
```

Each system is one message without a newline or extra whitespace. Fence newlines are presentation only. G2/H2 are derived programmatically and asserted against the recovered history and the historical request bodies before use.

Shared user, exactly **114 bytes**, SHA-256 `5b1eee3bc7307290be03bfb0172cdfb3413cd5395b342c037c78c22b4cde5800`:

```text
Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess.
```

Each exposes exactly **one tool**, the current real production `read_file` definition with its original description and schema. Generic/schema/wire identities match Phase 19.5. No synthetic tool or other production tool is exposed.

Host-only disposable fixture `native-tool-proof.txt` contains exactly `NATIVE_TOOL_PROOF_731942`, without newline. The value is asserted absent from every provider body/system/user/tool. Only the host checks initial/final file integrity; no application tool reads or mutates it.

## Frozen requests

Historical bytes were extracted from the exact serialized body fences in Phase 19.4/19.5; expected hashes were independently recovered from their request tables and verified against the extracted bytes. Available original temporary bodies also match exactly. No semantic-JSON-only comparison.

Three mocked serializations through the unchanged production adapter/HTTP path reconstruct E2/G2/H2; **zero real inference**. `Buffer.equals` proves each new body equals its corresponding historical bytes. Host-owned ModelPort message IDs differ by phase but are excluded by unchanged production serialization. No timestamp or diagnostic metadata occurs in any provider body.

| Body | UTF-8 bytes | SHA-256 | Historical byte equality |
| --- | --- | --- | --- |
| historical E | 1106 | `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c` | authoritative reference |
| E2 | 1106 | `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c` | exact E bytes |
| historical G | 1223 | `ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e` | authoritative reference |
| G2 | 1223 | `ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e` | exact G bytes |
| historical H | 1330 | `d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3` | authoritative reference |
| H2 | 1330 | `d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3` | exact H bytes |

All three pairwise wire-body and ModelPort input comparisons show exactly one replaced field: `/messages/0/content`. Replacing only that field yields the other body byte-for-byte. Shared user/tool/profile/provider fields and property ordering are identical.

Top-level serialized key order: `model`, `messages`, `keep_alive`, `tools`, `stream`, `options`, `truncate`, `shift`. No extra field is permitted. Exact minified body files have no final newline; fence newlines below are presentation only.

### Exact serialized E2 body

```json
{"model":"ministral-3:14b","messages":[{"role":"system","content":"Follow the user's request."},{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

### Exact serialized G2 body

```json
{"model":"ministral-3:14b","messages":[{"role":"system","content":"Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly."},{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

### Exact serialized H2 body

```json
{"model":"ministral-3:14b","messages":[{"role":"system","content":"Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work."},{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

### Frozen harness, guard and ledger

Freeze timestamp **2026-10-14T09:53:19.977659+00:00**. Plan SHA-256 `a663c7cff603c011a858ad5bd972174cf34e28e3e509f7340e166287d3d07a43`; launch-guard SHA-256 `9d1cd44cd3d045fd8f2f84acb41c81b4d680275b5defedb628a983c5a77cb05c`. **32 artifacts**, the plan and guard are read-only. Disposable syntax-only Bun bundle passes; this is not release/build validation.

Permanent one-shot guard `/tmp/phase196-launch-guard.json` anchors frozen plan/harness hashes and E2/G2/H2 order/budget. The harness exclusively creates and fsyncs `/tmp/phase196-live-once.lock` before any dispatch, retaining it after completion/failure. A second launch is forbidden. Durable `/tmp/phase196-inference-ledger.jsonl` was created empty and fsynced before launch; each request was appended and fsynced **before real fetch**. Dispatch count, order, exact body bytes/hash and maximum 3 were checked before every actual HTTP request.

Repository/environment/history/frozen hashes are checked at launch, before each dispatch and at close; complete selected provider tag/show identities must remain equal. No post-output request or harness edit is allowed.

The raw transport tap retains every already-received chunk unchanged; `highWaterMark: 0` prevents diagnostic read-ahead. At the first mapped provider-native call, save raw bytes, raw `message.tool_calls` and mapped name/arguments, abort and break immediately as established in Phases 19.3–19.5. No tool execution, result or continuation. Terminal metadata not naturally received stays **unavailable**. Incorrect/malformed native values remain evidence; no normalization or repair by the harness.

Classification is based on raw provider native fields: **native**, **textual pseudo-call**, **ordinary non-tool** or **provider failure**. Host-only pseudo-call shape classification never supplies execution authority or repairs content. Provider errors/incomplete streams/timeouts are not coerced into non-native behavior.

| Frozen artifact | SHA-256 |
| --- | --- |
| `/tmp/phase196-audit.py` | `14595ca318872cd696758504495d5ad288df7b4cabf17cc40e18b4a652a4f8aa` |
| `/tmp/phase196-prepare.py` | `847242d2e33227f1271a14c17e2c5d8668bc6512c28ddf1e4115fc2d22c08196` |
| `/tmp/phase196-common.ts` | `f73c2d3c8ae247c55409ef7232ee24d81602478239fe129ee94fbae8d8b3a931` |
| `/tmp/phase196-capture.ts` | `4d87946d9e5462caed7fe7f9be5431c621dda186dbefd59db653f52643abf162` |
| `/tmp/phase196-live.ts` | `bf5a8a75e10171ba590737a01529f83e4901f893054b773cd7234e6c093b15eb` |
| `/tmp/phase196-freeze.py` | `375465afecbb9cb15ab914373d0bc2a743458ed086655d15ed8d31cc30592996` |
| `/tmp/phase196-baseline-integrity.json` | `54560227eff8c9eba00f0627738aa3cd291b710b45fb54689916f69dd284a2d4` |
| `/tmp/phase196-historical-config.ts` | `b89268177272f261a56b3e3ab8a1bdcd900dbd91c393f79205026ba99558c4fe` |
| `/tmp/phase196-historical-system.txt` | `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597` |
| `/tmp/phase196-historical-split.json` | `deb802a1b558b7417fce245b969fc131e30d46c342f4eaf0e1080eba553fc204` |
| `/tmp/phase196-historical-request-identities.json` | `2e9ff023a27f73031163869549b9f938d90978798ac254d269d9b90cc0c8fa4b` |
| `/tmp/phase196-system-E2.txt` | `a57b125ef84ed22f78c1fa20f293b0b217d3e4b9581bb869870a22d32618f03b` |
| `/tmp/phase196-system-G2.txt` | `b173d1f5b44f38ea3392341476ec7e85d94e77c1119d45d363b0e7d20e125484` |
| `/tmp/phase196-system-H2.txt` | `eafdd504dde4124d6e048e688ea915c59839d2dc7dfc67130cdff582b112df53` |
| `/tmp/phase196-reference-E-body.json` | `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c` |
| `/tmp/phase196-reference-G-body.json` | `ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e` |
| `/tmp/phase196-reference-H-body.json` | `d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3` |
| `/tmp/phase196-provider-version.json` | `2657f6fff8018900025e47485e719c930017826b790e73ae28087cdcd93fe50e` |
| `/tmp/phase196-provider-tags.json` | `f50c00ab1a94e927b74e67610ac2cf4bc5d5cd19d411d48026996b7fed2afdd8` |
| `/tmp/phase196-provider-show.json` | `f4e2dbe14565594a406a48ea0edcc8a1b3c105ffcfaa401474e9025f5d61d2fb` |
| `/tmp/phase196-provider-identity.json` | `236b40f8bf9f18169e28482fa1a3edef5dfd343fb322be77461cfdd19d390d78` |
| `/tmp/phase196-input-E2.json` | `fa73095e9740105500ffd6639e9ffd3a24a1a39d4b03dfd07197475d9e242378` |
| `/tmp/phase196-input-G2.json` | `921652d7f4b51d8801f9179ead63ba1cd914e38720e0edac4b7c52ebccc8e00b` |
| `/tmp/phase196-input-H2.json` | `02c713e357d275060f7d9cf728e5f7f12359f8859ccd5828125c5f98d8157cb0` |
| `/tmp/phase196-request-E2.json` | `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c` |
| `/tmp/phase196-request-G2.json` | `ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e` |
| `/tmp/phase196-request-H2.json` | `d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3` |
| `/tmp/phase196-capture-summary.json` | `fc1af6a1a0215ad1ddaad843c27348caa16ead06585b646ec3b31f23714e8ff3` |
| `/tmp/phase196-baseline-focused.log` | `b59cb296c457cdfdc242ef25992c9591df465ae7ffb3cab74944b22c50fcf221` |
| `/tmp/phase196-capture.log` | `e482d6564f4ff0fbd34eeefd27b9f07791114fc39397ffb93dfd2e60fe7b45ad` |
| `/tmp/phase196-syntax-check.log` | `ee98c04484f7f81c417b80caeab95f5530bba1a3c21247ff84f0bb9c68e6bfa5` |
| `/tmp/phase196-bun-metadata-preflight.log` | `375d28b159c4ed5ca45ba20eae9aef491d5d0538460e30afa85de5849ea99748` |

## Live replication

The frozen harness launched **once** with authorized outside-sandbox localhost transport:

```text
bun /tmp/phase196-live.ts > /tmp/phase196-live.log 2>&1
```

Started `2026-10-14T10:00:30.597Z`, finished `2026-10-14T10:00:44.727Z`; aggregate host duration **14130.739334 ms**, below 190000 ms. Exit 0 denotes diagnostic completion. Exactly **3 provider inference requests**, fixed **E2 → G2 → H2**, exactly one each. The budget is **permanently closed**; no retry, continuation or further inference.

Provider version/selected tag/complete show/template/capabilities/parameters match at launch, before E2/G2/H2 and at close. Repository/environment/history/frozen hashes match before every dispatch and at close. All submitted bodies equal their frozen and historical bytes. No harness/request edit followed output.

Host-only fixture initial/final **24 bytes**, SHA-256 `12e44b4e02d60b29f6f3f1ab60015f9e6c1ad64bb2e1ff356aae77e82ce9c775`; exact value unchanged, absent from all requests. Disposable workspace removed. Live approvals **0**, ToolRunner calls **0**, application read_file/tool executions **0**, application-tool filesystem reads **0**, mutations **0**, run_process **0**. Host fixture setup/removal and evidence writes are outside the repository and are not application tool effects. No tool result or distinctive file value was returned to the provider.

### E2 — textual pseudo-call

- Classification **textual pseudo-call (non-native)**; status `completed`; exactly **one** inference; HTTP **200**.
- Submitted request SHA-256 `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c`; byte-identical to frozen E2 and historical E.
- Host request duration **4739.799121 ms**, below 60000 ms; no timeout/extension.
- Raw transport **15 chunks / 15 NDJSON frames / 2219 bytes**; mapped **15 chunks**.
- Raw native calls **0**, mapped native calls **0**; every raw frame lacks `message.tool_calls`. No malformed frame, transport/parser error or incomplete stream. Native name/structured arguments: **none**.
- Raw artifact `/tmp/phase196-provider-E2.ndjson`, SHA-256 `de9a340d5dae65308d8287e3bab6be2a221504d5aa1cef2ab96efeb37613ce8f`.
- Exact ordinary content, identical in raw frames and mapped deltas:

```text
read_file[ARGS]{"path": "native-tool-proof.txt"}
```

This pseudo-call is ordinary assistant text with **zero execution authority**. No content extraction/repair, tool preparation, approval, execution or continuation occurs. The unchanged production parser yields fourteen ordinary deltas and one terminal stop/usage chunk; no native field was lost.

#### Exact raw transport chunks

Each base64 entry preserves the original real-fetch reader bytes forwarded unchanged into the production parser. Times are milliseconds from harness start; concatenated decoded chunks equal the raw NDJSON bytes. Zero diagnostic read-ahead.

| Chunk | At ms | Bytes | Base64 |
| --- | --- | --- | --- |
| 1 | 4006.126512 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM0LjYwMjM1NzMxMloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicmVhZCJ9LCJkb25lIjpmYWxzZX0K` |
| 2 | 4062.4552360000002 | 131 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM0LjY1OTQ4MDg2WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJfIn0sImRvbmUiOmZhbHNlfQo=` |
| 3 | 4119.825821 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM0LjcxNjkwODc4MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiZmlsZSJ9LCJkb25lIjpmYWxzZX0K` |
| 4 | 4176.119226000001 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM0Ljc3MzIyMjU3N1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiW0FSR1NdIn0sImRvbmUiOmZhbHNlfQo=` |
| 5 | 4230.2167340000005 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM0LjgyNzMwMDI5NFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoie1wiIn0sImRvbmUiOmZhbHNlfQo=` |
| 6 | 4284.219318 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM0Ljg4MTMxMzg5MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicGF0aCJ9LCJkb25lIjpmYWxzZX0K` |
| 7 | 4338.864887000001 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM0LjkzNTk0OTMxOVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCI6In0sImRvbmUiOmZhbHNlfQo=` |
| 8 | 4394.858298 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM0Ljk5MTk0NzMzOFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIFwiIn0sImRvbmUiOmZhbHNlfQo=` |
| 9 | 4448.284585 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM1LjA0NTM4NTQ3NFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoibmF0aXZlIn0sImRvbmUiOmZhbHNlfQo=` |
| 10 | 4501.5509250000005 | 136 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM1LjA5ODY0NjEyMloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXRvb2wifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 11 | 4556.029030000001 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM1LjE1MzA4NjI1NVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXBybyJ9LCJkb25lIjpmYWxzZX0K` |
| 12 | 4611.646923 | 133 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM1LjIwODcxNTM4N1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoib2YifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 13 | 4665.478271 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM1LjI2MjU2NTc0OVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLnR4dCJ9LCJkb25lIjpmYWxzZX0K` |
| 14 | 4718.475724 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM1LjMxNTU2NTc3NFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCJ9In0sImRvbmUiOmZhbHNlfQo=` |
| 15 | 4772.376663 | 334 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM1LjM2OTQ2MTI4NVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIn0sImRvbmUiOnRydWUsImRvbmVfcmVhc29uIjoic3RvcCIsInRvdGFsX2R1cmF0aW9uIjo0NzI4MDU0MjQxLCJsb2FkX2R1cmF0aW9uIjozNjk5MDQ0MTE1LCJwcm9tcHRfZXZhbF9jb3VudCI6MTc4LCJwcm9tcHRfZXZhbF9jYWNoZWRfY291bnQiOjAsInByb21wdF9ldmFsX2R1cmF0aW9uIjoyNjAxMDM5OTksImV2YWxfY291bnQiOjE1LCJldmFsX2R1cmF0aW9uIjo3NjcwMTUwMDB9Cg==` |

#### Every received NDJSON frame — exact raw UTF-8

```jsonl
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:34.602357312Z","message":{"role":"assistant","content":"read"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:34.65948086Z","message":{"role":"assistant","content":"_"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:34.716908782Z","message":{"role":"assistant","content":"file"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:34.773222577Z","message":{"role":"assistant","content":"[ARGS]"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:34.827300294Z","message":{"role":"assistant","content":"{\""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:34.881313892Z","message":{"role":"assistant","content":"path"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:34.935949319Z","message":{"role":"assistant","content":"\":"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:34.991947338Z","message":{"role":"assistant","content":" \""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:35.045385474Z","message":{"role":"assistant","content":"native"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:35.098646122Z","message":{"role":"assistant","content":"-tool"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:35.153086255Z","message":{"role":"assistant","content":"-pro"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:35.208715387Z","message":{"role":"assistant","content":"of"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:35.262565749Z","message":{"role":"assistant","content":".txt"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:35.315565774Z","message":{"role":"assistant","content":"\"}"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:35.369461285Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":4728054241,"load_duration":3699044115,"prompt_eval_count":178,"prompt_eval_cached_count":0,"prompt_eval_duration":260103999,"eval_count":15,"eval_duration":767015000}
```

The raw artifact includes its actual final newline. Every frame is retained without repair; no frame was synthesized.

#### Exact mapped ModelStreamChunk sequence

`chunk` is unchanged production parser output; `atMs` is host observation timing.

```json
[
  {
    "atMs": 4006.548719,
    "chunk": {
      "contentDelta": "read"
    }
  },
  {
    "atMs": 4062.8526079999997,
    "chunk": {
      "contentDelta": "_"
    }
  },
  {
    "atMs": 4120.068727000001,
    "chunk": {
      "contentDelta": "file"
    }
  },
  {
    "atMs": 4176.353233000001,
    "chunk": {
      "contentDelta": "[ARGS]"
    }
  },
  {
    "atMs": 4230.620932000001,
    "chunk": {
      "contentDelta": "{\""
    }
  },
  {
    "atMs": 4284.584893,
    "chunk": {
      "contentDelta": "path"
    }
  },
  {
    "atMs": 4339.172682,
    "chunk": {
      "contentDelta": "\":"
    }
  },
  {
    "atMs": 4395.142929000001,
    "chunk": {
      "contentDelta": " \""
    }
  },
  {
    "atMs": 4448.602414,
    "chunk": {
      "contentDelta": "native"
    }
  },
  {
    "atMs": 4501.837273,
    "chunk": {
      "contentDelta": "-tool"
    }
  },
  {
    "atMs": 4556.410283,
    "chunk": {
      "contentDelta": "-pro"
    }
  },
  {
    "atMs": 4611.942218,
    "chunk": {
      "contentDelta": "of"
    }
  },
  {
    "atMs": 4665.815836000001,
    "chunk": {
      "contentDelta": ".txt"
    }
  },
  {
    "atMs": 4718.830764,
    "chunk": {
      "contentDelta": "\"}"
    }
  },
  {
    "atMs": 4772.692403,
    "chunk": {
      "contentDelta": "",
      "finishReason": "stop",
      "usage": {
        "promptTokens": 178,
        "outputTokens": 15
      }
    }
  }
]
```

#### Naturally received terminal metadata and counters

Clean `done: true`, `done_reason: "stop"`; **178 prompt tokens / 15 output tokens**, **0 cached prompt tokens**. Provider total duration **4728054241 ns** (4728.054241 ms); all exact load/prompt/eval duration fields are in the naturally received terminal frame:

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-14T10:00:35.369461285Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 4728054241,
  "load_duration": 3699044115,
  "prompt_eval_count": 178,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 260103999,
  "eval_count": 15,
  "eval_duration": 767015000
}
```

No native-emission stop occurred, so terminal metadata was naturally available. No extra read/request for metrics.

### G2 — textual pseudo-call

- Classification **textual pseudo-call (non-native)**; status `completed`; exactly **one** inference; HTTP **200**.
- Submitted request SHA-256 `ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e`; byte-identical to frozen G2 and historical G.
- Host request duration **4777.352076000001 ms**, below 60000 ms; no timeout/extension.
- Raw transport **15 chunks / 15 NDJSON frames / 2218 bytes**; mapped **15 chunks**.
- Raw native calls **0**, mapped native calls **0**; every raw frame lacks `message.tool_calls`. No malformed frame, transport/parser error or incomplete stream. Native name/structured arguments: **none**.
- Raw artifact `/tmp/phase196-provider-G2.ndjson`, SHA-256 `1442b3e65f988ce2a0649b546469234bedf2c84f06367571ac56da9d798833a1`.
- Exact ordinary content, identical in raw frames and mapped deltas:

```text
read_file[ARGS]{"path": "native-tool-proof.txt"}
```

This pseudo-call is ordinary assistant text with **zero execution authority**. No content extraction/repair, tool preparation, approval, execution or continuation occurs. The unchanged production parser yields fourteen ordinary deltas and one terminal stop/usage chunk; no native field was lost.

#### Exact raw transport chunks

Each base64 entry preserves the original real-fetch reader bytes forwarded unchanged into the production parser. Times are milliseconds from harness start; concatenated decoded chunks equal the raw NDJSON bytes. Zero diagnostic read-ahead.

| Chunk | At ms | Bytes | Base64 |
| --- | --- | --- | --- |
| 1 | 8809.963955 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5LjQwNjI0MTk5NloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicmVhZCJ9LCJkb25lIjpmYWxzZX0K` |
| 2 | 8865.957811999999 | 131 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5LjQ2MzA0MTIzWiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJfIn0sImRvbmUiOmZhbHNlfQo=` |
| 3 | 8921.147739 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5LjUxODIwNzE5N1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiZmlsZSJ9LCJkb25lIjpmYWxzZX0K` |
| 4 | 8975.369599 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5LjU3MjQ2MjU5MVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiW0FSR1NdIn0sImRvbmUiOmZhbHNlfQo=` |
| 5 | 9028.667658999999 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5LjYyNTc2NjMzM1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoie1wiIn0sImRvbmUiOmZhbHNlfQo=` |
| 6 | 9083.653446 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5LjY4MDc1MTc2MVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicGF0aCJ9LCJkb25lIjpmYWxzZX0K` |
| 7 | 9140.525242 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5LjczNzYyMTIwM1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCI6In0sImRvbmUiOmZhbHNlfQo=` |
| 8 | 9195.338808999999 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5Ljc5MjQzNDc1OFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIFwiIn0sImRvbmUiOmZhbHNlfQo=` |
| 9 | 9249.916381 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5Ljg0NzAwNzgzN1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoibmF0aXZlIn0sImRvbmUiOmZhbHNlfQo=` |
| 10 | 9304.234633999999 | 136 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5LjkwMTMxNzg1NVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXRvb2wifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 11 | 9357.851859 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjM5Ljk1NDk0NDg0NFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXBybyJ9LCJkb25lIjpmYWxzZX0K` |
| 12 | 9411.815833999999 | 132 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQwLjAwODkxNDY2WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJvZiJ9LCJkb25lIjpmYWxzZX0K` |
| 13 | 9464.889712999999 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQwLjA2MTk4NjMxMloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLnR4dCJ9LCJkb25lIjpmYWxzZX0K` |
| 14 | 9519.029827999999 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQwLjExNjEzMDI1MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCJ9In0sImRvbmUiOmZhbHNlfQo=` |
| 15 | 9573.224862 | 334 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQwLjE2OTk1ODI4MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIn0sImRvbmUiOnRydWUsImRvbmVfcmVhc29uIjoic3RvcCIsInRvdGFsX2R1cmF0aW9uIjo0NzY0NTc2MDQ5LCJsb2FkX2R1cmF0aW9uIjozNzU2NTAwOTI4LCJwcm9tcHRfZXZhbF9jb3VudCI6MTk4LCJwcm9tcHRfZXZhbF9jYWNoZWRfY291bnQiOjAsInByb21wdF9ldmFsX2R1cmF0aW9uIjoyNDI1NTcwMDAsImV2YWxfY291bnQiOjE1LCJldmFsX2R1cmF0aW9uIjo3NjM2MTEwMDB9Cg==` |

#### Every received NDJSON frame — exact raw UTF-8

```jsonl
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.406241996Z","message":{"role":"assistant","content":"read"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.46304123Z","message":{"role":"assistant","content":"_"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.518207197Z","message":{"role":"assistant","content":"file"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.572462591Z","message":{"role":"assistant","content":"[ARGS]"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.625766333Z","message":{"role":"assistant","content":"{\""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.680751761Z","message":{"role":"assistant","content":"path"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.737621203Z","message":{"role":"assistant","content":"\":"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.792434758Z","message":{"role":"assistant","content":" \""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.847007837Z","message":{"role":"assistant","content":"native"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.901317855Z","message":{"role":"assistant","content":"-tool"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:39.954944844Z","message":{"role":"assistant","content":"-pro"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:40.00891466Z","message":{"role":"assistant","content":"of"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:40.061986312Z","message":{"role":"assistant","content":".txt"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:40.116130252Z","message":{"role":"assistant","content":"\"}"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:40.169958282Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":4764576049,"load_duration":3756500928,"prompt_eval_count":198,"prompt_eval_cached_count":0,"prompt_eval_duration":242557000,"eval_count":15,"eval_duration":763611000}
```

The raw artifact includes its actual final newline. Every frame is retained without repair; no frame was synthesized.

#### Exact mapped ModelStreamChunk sequence

`chunk` is unchanged production parser output; `atMs` is host observation timing.

```json
[
  {
    "atMs": 8810.612815999999,
    "chunk": {
      "contentDelta": "read"
    }
  },
  {
    "atMs": 8866.601752999999,
    "chunk": {
      "contentDelta": "_"
    }
  },
  {
    "atMs": 8921.739803999999,
    "chunk": {
      "contentDelta": "file"
    }
  },
  {
    "atMs": 8975.896621,
    "chunk": {
      "contentDelta": "[ARGS]"
    }
  },
  {
    "atMs": 9029.045702,
    "chunk": {
      "contentDelta": "{\""
    }
  },
  {
    "atMs": 9084.038669,
    "chunk": {
      "contentDelta": "path"
    }
  },
  {
    "atMs": 9140.910147999999,
    "chunk": {
      "contentDelta": "\":"
    }
  },
  {
    "atMs": 9195.91449,
    "chunk": {
      "contentDelta": " \""
    }
  },
  {
    "atMs": 9250.489959999999,
    "chunk": {
      "contentDelta": "native"
    }
  },
  {
    "atMs": 9304.747706,
    "chunk": {
      "contentDelta": "-tool"
    }
  },
  {
    "atMs": 9358.256325999999,
    "chunk": {
      "contentDelta": "-pro"
    }
  },
  {
    "atMs": 9412.363961,
    "chunk": {
      "contentDelta": "of"
    }
  },
  {
    "atMs": 9465.355770999999,
    "chunk": {
      "contentDelta": ".txt"
    }
  },
  {
    "atMs": 9519.481401,
    "chunk": {
      "contentDelta": "\"}"
    }
  },
  {
    "atMs": 9573.588999,
    "chunk": {
      "contentDelta": "",
      "finishReason": "stop",
      "usage": {
        "promptTokens": 198,
        "outputTokens": 15
      }
    }
  }
]
```

#### Naturally received terminal metadata and counters

Clean `done: true`, `done_reason: "stop"`; **198 prompt tokens / 15 output tokens**, **0 cached prompt tokens**. Provider total duration **4764576049 ns** (4764.576049 ms); all exact load/prompt/eval duration fields are in the naturally received terminal frame:

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-14T10:00:40.169958282Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 4764576049,
  "load_duration": 3756500928,
  "prompt_eval_count": 198,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 242557000,
  "eval_count": 15,
  "eval_duration": 763611000
}
```

No native-emission stop occurred, so terminal metadata was naturally available. No extra read/request for metrics.

### H2 — textual pseudo-call

- Classification **textual pseudo-call (non-native)**; status `completed`; exactly **one** inference; HTTP **200**.
- Submitted request SHA-256 `d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3`; byte-identical to frozen H2 and historical H.
- Host request duration **4502.863277999999 ms**, below 60000 ms; no timeout/extension.
- Raw transport **15 chunks / 15 NDJSON frames / 2218 bytes**; mapped **15 chunks**.
- Raw native calls **0**, mapped native calls **0**; every raw frame lacks `message.tool_calls`. No malformed frame, transport/parser error or incomplete stream. Native name/structured arguments: **none**.
- Raw artifact `/tmp/phase196-provider-H2.ndjson`, SHA-256 `51ab801348ddd12bb38163af17fe8c5f560c932019508ca32401cde75d9e5957`.
- Exact ordinary content, identical in raw frames and mapped deltas:

```text
read_file[ARGS]{"path": "native-tool-proof.txt"}
```

This pseudo-call is ordinary assistant text with **zero execution authority**. No content extraction/repair, tool preparation, approval, execution or continuation occurs. The unchanged production parser yields fourteen ordinary deltas and one terminal stop/usage chunk; no native field was lost.

#### Exact raw transport chunks

Each base64 entry preserves the original real-fetch reader bytes forwarded unchanged into the production parser. Times are milliseconds from harness start; concatenated decoded chunks equal the raw NDJSON bytes. Zero diagnostic read-ahead.

| Chunk | At ms | Bytes | Base64 |
| --- | --- | --- | --- |
| 1 | 13362.55105 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQzLjk1ODc2MjY4N1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicmVhZCJ9LCJkb25lIjpmYWxzZX0K` |
| 2 | 13418.780232 | 132 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjAxNTg4MjA5MVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXyJ9LCJkb25lIjpmYWxzZX0K` |
| 3 | 13475.149693 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjA3MjIxMjI5WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJmaWxlIn0sImRvbmUiOmZhbHNlfQo=` |
| 4 | 13526.999808999999 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjEyNDA4Njc2OFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiW0FSR1NdIn0sImRvbmUiOmZhbHNlfQo=` |
| 5 | 13577.866651999999 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjE3NDk1MTQ5MVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoie1wiIn0sImRvbmUiOmZhbHNlfQo=` |
| 6 | 13629.98062 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjIyNzA3ODQyN1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicGF0aCJ9LCJkb25lIjpmYWxzZX0K` |
| 7 | 13682.403542999999 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjI3OTQ3MDMwMVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCI6In0sImRvbmUiOmZhbHNlfQo=` |
| 8 | 13739.445044999999 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjMzNjUzMzcyNloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIFwiIn0sImRvbmUiOmZhbHNlfQo=` |
| 9 | 13793.965892 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjM5MTA1MjUwM1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoibmF0aXZlIn0sImRvbmUiOmZhbHNlfQo=` |
| 10 | 13848.908399 | 136 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjQ0NTk5MDMwNFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXRvb2wifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 11 | 13901.386972999999 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjQ5ODQ2NDU5MVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXBybyJ9LCJkb25lIjpmYWxzZX0K` |
| 12 | 13951.681948 | 133 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjU0ODc4MDEyOFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoib2YifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 13 | 14002.305493 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjU5OTM4MTIzNFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLnR4dCJ9LCJkb25lIjpmYWxzZX0K` |
| 14 | 14052.734182 | 133 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjY0OTgxNTI1WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJcIn0ifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 15 | 14103.307893 | 334 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjAwOjQ0LjcwMDM2MzE4MVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIn0sImRvbmUiOnRydWUsImRvbmVfcmVhc29uIjoic3RvcCIsInRvdGFsX2R1cmF0aW9uIjo0NDg5ODgzMTI3LCJsb2FkX2R1cmF0aW9uIjozNTAzODU5MzMxLCJwcm9tcHRfZXZhbF9jb3VudCI6MjE4LCJwcm9tcHRfZXZhbF9jYWNoZWRfY291bnQiOjAsInByb21wdF9ldmFsX2R1cmF0aW9uIjoyNDI1MzcwMDAsImV2YWxfY291bnQiOjE1LCJldmFsX2R1cmF0aW9uIjo3NDE0MTEwMDB9Cg==` |

#### Every received NDJSON frame — exact raw UTF-8

```jsonl
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:43.958762687Z","message":{"role":"assistant","content":"read"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.015882091Z","message":{"role":"assistant","content":"_"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.07221229Z","message":{"role":"assistant","content":"file"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.124086768Z","message":{"role":"assistant","content":"[ARGS]"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.174951491Z","message":{"role":"assistant","content":"{\""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.227078427Z","message":{"role":"assistant","content":"path"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.279470301Z","message":{"role":"assistant","content":"\":"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.336533726Z","message":{"role":"assistant","content":" \""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.391052503Z","message":{"role":"assistant","content":"native"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.445990304Z","message":{"role":"assistant","content":"-tool"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.498464591Z","message":{"role":"assistant","content":"-pro"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.548780128Z","message":{"role":"assistant","content":"of"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.599381234Z","message":{"role":"assistant","content":".txt"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.64981525Z","message":{"role":"assistant","content":"\"}"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:00:44.700363181Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":4489883127,"load_duration":3503859331,"prompt_eval_count":218,"prompt_eval_cached_count":0,"prompt_eval_duration":242537000,"eval_count":15,"eval_duration":741411000}
```

The raw artifact includes its actual final newline. Every frame is retained without repair; no frame was synthesized.

#### Exact mapped ModelStreamChunk sequence

`chunk` is unchanged production parser output; `atMs` is host observation timing.

```json
[
  {
    "atMs": 13363.349968999999,
    "chunk": {
      "contentDelta": "read"
    }
  },
  {
    "atMs": 13419.379442,
    "chunk": {
      "contentDelta": "_"
    }
  },
  {
    "atMs": 13475.848318999999,
    "chunk": {
      "contentDelta": "file"
    }
  },
  {
    "atMs": 13527.642924,
    "chunk": {
      "contentDelta": "[ARGS]"
    }
  },
  {
    "atMs": 13578.624424,
    "chunk": {
      "contentDelta": "{\""
    }
  },
  {
    "atMs": 13630.717380999999,
    "chunk": {
      "contentDelta": "path"
    }
  },
  {
    "atMs": 13683.14302,
    "chunk": {
      "contentDelta": "\":"
    }
  },
  {
    "atMs": 13740.118054999999,
    "chunk": {
      "contentDelta": " \""
    }
  },
  {
    "atMs": 13794.620946,
    "chunk": {
      "contentDelta": "native"
    }
  },
  {
    "atMs": 13849.634606,
    "chunk": {
      "contentDelta": "-tool"
    }
  },
  {
    "atMs": 13902.021577,
    "chunk": {
      "contentDelta": "-pro"
    }
  },
  {
    "atMs": 13952.225891999999,
    "chunk": {
      "contentDelta": "of"
    }
  },
  {
    "atMs": 14003.000418,
    "chunk": {
      "contentDelta": ".txt"
    }
  },
  {
    "atMs": 14053.294592999999,
    "chunk": {
      "contentDelta": "\"}"
    }
  },
  {
    "atMs": 14103.826151,
    "chunk": {
      "contentDelta": "",
      "finishReason": "stop",
      "usage": {
        "promptTokens": 218,
        "outputTokens": 15
      }
    }
  }
]
```

#### Naturally received terminal metadata and counters

Clean `done: true`, `done_reason: "stop"`; **218 prompt tokens / 15 output tokens**, **0 cached prompt tokens**. Provider total duration **4489883127 ns** (4489.883127 ms); all exact load/prompt/eval duration fields are in the naturally received terminal frame:

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-14T10:00:44.700363181Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 4489883127,
  "load_duration": 3503859331,
  "prompt_eval_count": 218,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 242537000,
  "eval_count": 15,
  "eval_duration": 741411000
}
```

No native-emission stop occurred, so terminal metadata was naturally available. No extra read/request for metrics.

### Closed inference accounting

Durable pre-dispatch ledger, exact bytes:

```jsonl
{"number":1,"condition":"E2","atMs":43.892337999999995,"bodySha256":"d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c","status":"dispatch-attempt-counted-before-fetch"}
{"number":2,"condition":"G2","atMs":4807.773171000001,"bodySha256":"ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e","status":"dispatch-attempt-counted-before-fetch"}
{"number":3,"condition":"H2","atMs":9612.858385,"bodySha256":"d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3","status":"dispatch-attempt-counted-before-fetch"}
```

| Request | Frozen condition | Raw / mapped native calls | Ordinary content | End |
| --- | --- | --- | --- | --- |
| 1 | E2 | 0 / 0 | `read_file[ARGS]{"path": "native-tool-proof.txt"}` | clean stop |
| 2 | G2 | 0 / 0 | `read_file[ARGS]{"path": "native-tool-proof.txt"}` | clean stop |
| 3 | H2 | 0 / 0 | `read_file[ARGS]{"path": "native-tool-proof.txt"}` | clean stop |

Total **3 / maximum 3**; no request 4 is permitted. Retries **0**, continuations **0**, post-tool rounds **0**, extra conditions **0**, alternate models **0**, downloads **0**; prompt variants **only frozen E2/G2/H2**. Historical E/G/H are reused without rerun/rescoring. Read-only provider metadata and mocked captures are not inference; no activation/unload/embedding/retrieval/memory call occurred.

Permanent launch lock `/tmp/phase196-live-once.lock` remains, SHA-256 `148015ad75eab3de0dd4a0a2add0acaa72b8ebfd0ca5d312939de7ec37d15f5f`. Ledger `/tmp/phase196-inference-ledger.jsonl`, SHA-256 `9352217087347ff04058c5d1ca33fc3429e5b30d8065efde678cc6be2f367293`. Complete evidence `/tmp/phase196-live-evidence.json`, SHA-256 `7d7f3a4db747c24f86dc2a687216e5c5e1c208892ec860a493020fa34452a083`; trace `/tmp/phase196-live.log`. Exact bodies, transport bytes, every frame, native-field absence, all mapped chunks and naturally available timing/counters are retained both here and in artifacts.

## Repeatability analysis

Historical E/G/H observations remain frozen and are not rescored. Exactly one new replicate each under byte-identical provider request bodies and unchanged environment identities.

| Condition | Historical result | Replicate result | Replicated? |
| --- | --- | --- | --- |
| E → E2 | native | non-native textual pseudo-call | no |
| G → G2 | non-native pseudo-call | non-native textual pseudo-call | yes |
| H → H2 | non-native pseudo-call | non-native textual pseudo-call | yes |

Historical E's expected native `read_file({"path":"native-tool-proof.txt"})` and empty ordinary content did **not replicate**. E2 returned only `read_file[ARGS]{"path": "native-tool-proof.txt"}`. Historical G/H's exact pseudo-call content each **replicated once**. Thus the prior overall E-native/G-non-native/H-non-native qualitative pattern did **not** repeat.

Timing observations, without rescoring or inferring timing causality:

| Condition | Frozen historical host ms | Replicate host ms |
| --- | --- | --- |
| E → E2 | 4381.517801 | 4739.799121 |
| G → G2 | 23936.653383 | 4777.352076000001 |
| H → H2 | 4882.610412 | 4502.863277999999 |

Phase 19.5's longer G latency is not reproduced here; duration alone does not localize a sentence or explain native adherence. Provider settings/deadlines were unchanged. One replication per condition remains a bounded engineering diagnostic: no success percentages or statistical-significance claim.

## Interpretation

**Pattern 2 — minimal control E2 is non-native. Outcome B — stochastic native adherence materially implicated.**

The prior positive minimal-control E did not replicate despite byte-identical request conditions and unchanged provider/model/template/tool identities. The diagnostic control itself is **unstable across two observations**. G/H's pseudo-call behavior replicated once, but E's instability prevents treating the historical failing halves as a stable causal localization. Single-sample sentence bisection is therefore not a responsible next step. Stochastic adherence is materially implicated; no deterministic failure, universally defective sentence or reliable production adherence is proved.

**Exactly one next direction: stop clause isolation and design a small repeated-measures adherence qualification.** This direction is selected for future work only; no design implementation, extra sample, prompt tuning or sentence isolation is performed now.

## Production impact

Production source changes: **none**. Sole repository change: this new progress record. All 235 tracked files, 95 production sources, 32 historical progress records, `.env`, 41 prior artifacts and 32 frozen artifacts remain byte-identical. No current system, verification/repair guidance, ContextBuilder, ProcessObservation, read_file description/schema, adapter/parser/transport, LocalToolRegistry, ToolRunner, run_process, provider/model parameters or model-selection change. No durable architecture change. No staging or commit.

Protected contracts remain authoritative: Phase 19.5 G/H; Phase 19.4 E/F; Phase 19.3 C/D; Phase 19.2 native/parser/security; Phase 19.1 verification/repair; Phase 19 process contract; Phase 18.1 preparation/recovery/approval; Phase 18.7 memory policy; Phase 17 retrieval; Phase 16 profile; Phase 15.5 selection. Tool-looking assistant prose remains ordinary content; only structured provider `message.tool_calls` can propose execution, and this diagnostic executes neither channel.

## Final validation

| Gate | Result | Evidence |
| --- | --- | --- |
| Pre-live focused native/mapping/pseudo-call/instruction/tool/config | PASS: 108 tests, 0 fail, 1005 assertions, 5 files, 113 ms | `/tmp/phase196-baseline-focused.log` |
| Same focused scope after live | PASS: 108 tests, 0 fail, 1005 assertions, 5 files, 259 ms | `/tmp/phase196-focused-final.log` |
| `bun run typecheck` | PASS, exit 0 | `/tmp/phase196-typecheck.log` |
| `bun run format:check` | PASS, exit 0; 183 files, no fixes | `/tmp/phase196-format.log` |
| Exact historical source/split/request recovery | PASS: full 394-byte source; 143/250-byte halves; all three authoritative bodies/hash tables and available temporary copies equal | audit/recovery/capture artifacts |
| Frozen E2/G2/H2 production serialization | PASS: exact byte equality to E/G/H; only system content differs; all shared fields unchanged; zero inference before freeze | `/tmp/phase196-capture-summary.json` and frozen plan |
| Launch/before-E2/before-G2/before-H2/close identities | PASS: complete selected tag/show/provider/template/read_file/system unchanged | `/tmp/phase196-live-evidence.json` |
| Exact embedded raw/base64/frame/mapped/terminal evidence | PASS: all 45 received frames, all 45 byte chunks, all 45 mapped chunks and naturally received terminal fields match saved artifacts | `/tmp/phase196-final-review.py`, `/tmp/phase196-final-review.json` |
| Offline production parser replay | PASS: all three saved raw byte sequences reproduce exact mapped chunks with zero native calls and zero inference | `/tmp/phase196-replay.ts`, `/tmp/phase196-replay-review.json` |
| Closed budget/order/one-shot guard/ledger/fixture | PASS: exactly one E2, G2, H2; 3/3 requests; zero retries/continuations/execution; fixture unchanged and removed; permanent lock retained | ledger, guard and live evidence |
| Repository/environment/history/prior/frozen byte integrity | PASS: 235 tracked files, 95 production sources, 32 historical records, `.env`, 41 prior artifacts and 32 frozen artifacts exact | baseline manifest and final review |
| UTF-8/whitespace/final newline/local links/git checks | PASS: explicit checks; `git diff --check`; explicit new-file whitespace check has no diagnostics | final review |

Complete record reviewed, including exact source-derived systems, historical/new request hashes and bytes, frozen order/options/guard/ledger, every received raw transport chunk and NDJSON frame, complete mapped sequence, naturally received counters/durations, qualitative comparison, Outcome B and its sole future direction. No frozen helper/input/source/test changes followed live output.

Final tracked `git diff` / `git diff --stat`: **empty**; the sole change is this new unstaged record. Explicit new-file diff-stat reports one added progress record. Exact `git status --short --untracked-files=all`:

```text
?? docs/progress/phase-19.6-progress.md
```

HEAD remains `c5797a4b9e69e0304386929e35a5c9c830b28de3`; index diff empty; staging and commit none. `git diff --check` and `git diff --no-index --check /dev/null docs/progress/phase-19.6-progress.md` have no whitespace diagnostics (exit 1 for the new-file check denotes the expected added-file difference). UTF-8, final newline, trailing-whitespace and local-link checks pass. The final status/validation-only update receives repeated lightweight evidence/integrity/document checks without more inference or unnecessary repetition of passing expensive gates.

No full release/Linux/Windows/smoke build was run for this progress-record-only diagnostic. The disposable syntax bundle is not production release/build validation; no current Windows-runtime claim.

## Final summary

| Item | Final value |
| --- | --- |
| candidate | `ministral-3:14b` |
| provider/model drift | no |
| historical E request hash | `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c` |
| E2 request hash | `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c` |
| historical G request hash | `ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e` |
| G2 request hash | `ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e` |
| historical H request hash | `d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3` |
| H2 request hash | `d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3` |
| all replication bodies byte-identical | yes |
| E2 native | no; zero raw / mapped |
| G2 native | no; zero raw / mapped |
| H2 native | no; zero raw / mapped |
| E2 ordinary content | `read_file[ARGS]{"path": "native-tool-proof.txt"}` |
| G2 ordinary content | `read_file[ARGS]{"path": "native-tool-proof.txt"}` |
| H2 ordinary content | `read_file[ARGS]{"path": "native-tool-proof.txt"}` |
| total inference requests | exactly 3 / maximum 3; closed |
| retries | 0 |
| continuations | 0 |
| tool execution | 0; approvals / ToolRunner / application read_file / mutations / run_process also 0 |
| prompt variants | only frozen E2/G2/H2 |
| alternate models | 0 |
| downloads | 0 |
| textual fallback parser | no |
| replication outcome | **B — stochastic native adherence materially implicated** |
| next direction | **stop clause isolation and design a small repeated-measures adherence qualification**; future only |
| production source changes | none |
| current system changes | none |
| model-selection changes | none |
| commit | none |
