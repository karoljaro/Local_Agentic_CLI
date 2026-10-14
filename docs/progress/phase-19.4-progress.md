# Phase 19.4 — system-instruction ergonomics isolation

## Status

Current status: **verified** — E emitted native read_file, F emitted only pseudo-call prose; exactly two requests, zero execution, Outcome C. All required focused/type/format/document/integrity gates pass. This verifies the bounded diagnostic, not reliable production adherence or eventual task correctness.

- [x] not started — record created before inference
- [x] audit complete
- [x] requests frozen
- [x] live qualification complete
- [x] verified
- [ ] inconclusive
- [ ] blocked

## Baseline

- Starting HEAD: `216aa083af2a16fa8f6f2b1df595daa11fbca7a1`.
- Starting git status, tracked diff/stat and index diff: empty.
- Bun: `1.4.3`; candidate: `ministral-3:14b` only.
- Baseline byte-integrity manifest: `/tmp/phase194-baseline-integrity.json`, created before this record.
- Authoritative records: [Phase 19.3](phase-19.3-progress.md), [Phase 19.2](phase-19.2-progress.md), [Phase 19.1](phase-19.1-progress.md), [Phase 19](phase-19-progress.md). Historical records and evidence remain read-only.
- Frozen historical C: current production system + exact production read_file, no native field, ordinary content exactly `read_file[ARGS]{"path": "native-tool-proof.txt"}`.
- Frozen historical D: no application system + the same read_file, native `read_file` with arguments `{"path":"native-tool-proof.txt"}`, ordinary content empty.
- C/D will not be rerun or rescored. Production source changes, tool execution and commits are prohibited.
- No applicable ancestor/workspace `AGENTS.md`; no delegation requested or sub-agents spawned.
- Manifest protects **233 tracked files**, **95 production TypeScript files**, **30 historical progress records**, `.env` and **83 historical evidence/helper artifacts**. All 95 production source files also equal the Phase 19.3 starting manifest byte-for-byte.
- Effective chat configuration equals Phase 19.3: isolated candidate selection in the harness; unchanged default system, base URL `http://localhost:11434`, context/output **16384/4096**, keep-alive **0**, streaming, `truncate: false`, `shift: false`. Optional embeddings, retrieval, memory, activation and unload are never invoked. Environment and model preferences remain untouched.

### Environment identities — verified no drift before freezing

Read-only `/api/version`, `/api/tags`, `/api/show` captured in `/tmp/phase194-provider-{version,tags,show}.json`. Exact parsed version, selected tag and complete show response equal Phase 19.3; `/tmp/phase194-provider-identity.json`.

- Ollama **0.40.2**.
- Model **ministral-3:14b**, digest `129e04c05b562f6e6ea7ec07ef0b0a61ef1aeaedb91ac524e67a1672eba7bb36`.
- Template **3414 UTF-8 bytes**, SHA-256 `aa65b5aebf89e7dfb3aa05af9220299a7e1cebe3ab97daae3c2e259acbdf278c`.
- Tag/show capabilities `["completion", "vision", "tools"]`; unchanged parameters `temperature 0.15`. No sampler/temperature override.
- Provider-owned installed parser/template mechanics remain Phase 19.2's authoritative audit; no provider files are edited. Launch and post-live metadata must match the frozen identity.

| Artifact | UTF-8 bytes | SHA-256 |
| --- | --- | --- |
| current production system | 1390 | `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc` |
| historical base system | 394 | `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597` |
| E minimal system | 26 | `a57b125ef84ed22f78c1fa20f293b0b217d3e4b9581bb869870a22d32618f03b` |
| production read_file generic definition | 717 | `4050d9c7d7569c116d05311f513a51b19fd6cedb964471b0c8bcb9c2f776c9bc` |
| read_file schema | 499 | `db50a0d44325d0f927cdd580dc7886ff5292eecdb18516dc3957b2bfa456098c` |
| read_file wire function | 748 | `2ad18509a7682736490b03dda7f418a4ac69ffca73b491c390e53883b9aa3d22` |
| single wire tool array | 750 | `d7382d3f27a729c39fc26bf897fcb7322ed5e9f521760543dfcc400b350de8fd` |
| shared user | 114 | `5b1eee3bc7307290be03bfb0172cdfb3413cd5395b342c037c78c22b4cde5800` |

### Phase 19.3 frozen C/D references — reused without rerun or rescoring

| Frozen artifact | SHA-256 |
| --- | --- |
| `/tmp/phase193-request-C.json` | `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4` |
| `/tmp/phase193-request-D.json` | `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7` |
| `/tmp/phase193-provider-C.ndjson` | `ede6e4dbc734bb4c8885c070e00643e6c4d15b7b7fd45fcca9cdc24d7d25a370` |
| `/tmp/phase193-provider-D.ndjson` | `53fdcb5021201a0d313d7f4d6c899aec1a0660fd45c5fccaa46f68453dd955d1` |
| `/tmp/phase193-live-evidence.json` | `88ff6d768da2b1050984171e7482202a3999cac0e4458bc927d980e9b9942702` |

The preserved [Phase 19.3 live evidence](phase-19.3-progress.md#live-evidence) is authoritative. No new classification, provider read or metric collection for C/D.

## Historical system reconstruction

Read-only `git show 97962a5d53c137b329a770f000bac108e61fa271:src/composition/config.ts` recovered the original single SYSTEM_PROMPT string literal. `/tmp/phase194-audit.py` extracted it without manual reconstruction, verified the literal has no escapes or concatenation, and saved exact bytes without a newline in `/tmp/phase194-historical-system.txt`.

Verified historical length: **394 UTF-8 bytes**. SHA-256: `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597`.

Exact recovered instruction:

```text
Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly. Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work.
```

Fence newlines are presentation only. Recovery evidence: `/tmp/phase194-historical-config.ts` and `/tmp/phase194-historical-system-identity.json`. Historical git blob `c61901f0bda817f6ed3c3614d58e43bd06575e5d`; source file 2224 bytes, SHA-256 `b89268177272f261a56b3e3ab8a1bdcd900dbd91c393f79205026ba99558c4fe`; literal at source line 31. Independent equality to the original `/tmp/phase191-baseline-surface.json` system also passes. No checkout or repository mutation was used to read history.

## Isolation design

- E system: exactly `Follow the user's request.` (no extra whitespace/newline).
- F system: the exact recovered 394-byte historical default above.
- Shared user: `Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess.`
- Exactly one real production read_file tool in each condition; model/profile/options/adapter/transport/parser identical. Only system content differs.
- Fixed order E then F. Follow the Phase 19.3 first mapped native-call stop rule: capture the raw native field and mapped call, abort and stop reading immediately, execute nothing, supply no tool result, and issue no continuation. Terminal metadata unavailable at that stop will remain unavailable.
- Disposable host-only proof file: `native-tool-proof.txt`, exact unchanged value `NATIVE_TOOL_PROOF_731942` without newline. The value must be absent from both requests.

## Frozen request captures

Freeze timestamp: `2026-10-12T18:13:56.310Z`. **Zero real inference**; two mocked request captures through the unchanged production `OllamaModelAdapter` → `OllamaHttpClient`. No application execution path is invoked.

| Condition | Exact body bytes | SHA-256 |
| --- | --- | --- |
| E | 1106 | `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c` |
| F | 1474 | `8164f1dcd86584ee1490cfa451ec15f32f44a3a49838fb95c1f9aa5464274b10` |

Structural diff, for both the exact wire bodies and ModelPort inputs:

```json
[{"op":"replace","path":"/messages/0/content","value":"Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly. Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work."}]
```

Replacing only `/messages/0/content` in E yields F byte-for-byte. Each also equals frozen Phase 19.3 C after replacing only that field with its specified system. User and one-tool array equal both frozen C/D exactly. All non-message fields and the user message are identical. All pre-inference assertions pass: E exact sentence/no newline; F exact 394-byte historical hash; exact current system/read_file/profile identities; no host-only proof value; no format, tool-choice equivalents, sampler, temperature, reasoning or template overrides.

Shared serializer key order: `model`, `messages`, `keep_alive`, `tools`, `stream`, `options`, `truncate`, `shift`. Both exact minified body files have no final newline; fence newlines below are presentation only.

### Exact serialized E body

```json
{"model":"ministral-3:14b","messages":[{"role":"system","content":"Follow the user's request."},{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

### Exact serialized F body

```json
{"model":"ministral-3:14b","messages":[{"role":"system","content":"Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly. Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work."},{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

### Frozen harness, captures and guard

| Artifact | SHA-256 |
| --- | --- |
| `/tmp/phase194-request-E.json` | `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c` |
| `/tmp/phase194-request-F.json` | `8164f1dcd86584ee1490cfa451ec15f32f44a3a49838fb95c1f9aa5464274b10` |
| `/tmp/phase194-input-E.json` | `8133f50d9acbd6d535e553d4f7f204da7287cb65cec3fb64d80b35b81af8811f` |
| `/tmp/phase194-input-F.json` | `c1162e9c7dbede0beaa5b0088c97ce2dd75f92e803b1b225b10c2d2070a822b4` |
| `/tmp/phase194-live.ts` | `454403d723ebeb74863270d622e503f1c6af0273497ea5c657057ea20f26fb46` |
| `/tmp/phase194-capture.ts` | `2f2b7c402b614c4f507ae5ca7e8eca5e33f4880c17824fab96a7c29dee5bf510` |
| `/tmp/phase194-prepare.py` | `edb1fbd603500ee8e173f5da68c845431fc4b85e4f3d941d36f5844a3cf7e9a2` |
| `/tmp/phase194-audit.py` | `d5fa2876f3bbb1429717dd9fc35c1d2f28900ac7c598fb984388bf256207f841` |
| `/tmp/phase194-provider-identity.json` | `5a5fe7f180350566a79dac029a530c26fdcdf4b2cd87d7d638a24072024463b9` |
| `/tmp/phase194-provider-version.json` | `2657f6fff8018900025e47485e719c930017826b790e73ae28087cdcd93fe50e` |
| `/tmp/phase194-provider-tags.json` | `f50c00ab1a94e927b74e67610ac2cf4bc5d5cd19d411d48026996b7fed2afdd8` |
| `/tmp/phase194-provider-show.json` | `f4e2dbe14565594a406a48ea0edcc8a1b3c105ffcfaa401474e9025f5d61d2fb` |
| `/tmp/phase194-baseline-integrity.json` | `f74a9636490790ef010292d91e274163736a6b1e71fe85bbe5cfa87b03e06fc9` |
| `/tmp/phase194-historical-config.ts` | `b89268177272f261a56b3e3ab8a1bdcd900dbd91c393f79205026ba99558c4fe` |
| `/tmp/phase194-historical-system.txt` | `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597` |
| `/tmp/phase194-historical-system-identity.json` | `6dd32d6c84964c92d14a007092bf0c07cf1b3c5e565bef4039f525e720df4db3` |
| `/tmp/phase194-capture-summary.json` | `b9ea53fc42f9ade37be3ae5ffd90913f76e2f1285499de051011afc574625193` |
| `/tmp/phase194-frozen-plan.json` | `d8451b30c8b9a6de0e68666693a9e71a8cbfba57b80d4a4a29339437b49268fb` |
| `/tmp/phase194-launch-guard.json` | `e24a4f3c1914866a084bbdd61152667f4200724efad923c842b479eceec27905` |

Frozen harness `/tmp/phase194-live.ts` retains Phase 19.3's raw transport tap, unchanged parser and first mapped native-emission stopping rule. `highWaterMark: 0` prevents diagnostic read-ahead; only bytes returned to the production parser are captured. No extra read for terminal counters. The guard anchors plan/harness hashes and permits E/F once. Exclusive permanent `/tmp/phase194-live-once.lock` is created before dispatch; attempts are durably counted before calling the provider. A second launch is forbidden, including after failure/interruption. Captures/harness remain outside the repository and will not change after output.

Fixed order **E then F**; per-request timeout **60000 ms**, aggregate **130000 ms**. The other frozen condition is still dispatched if one fails and aggregate time permits. No retries, third request, continuation, post-tool round or adaptive condition. Repository/environment/historical/frozen hashes are rechecked before dispatch. Native emissions are recorded but never executed; fixture integrity is checked only by the host.

## Deterministic verification

Pre-live focused scope, all provider inference mocked:

```text
bun test src/infrastructure/model/OllamaModelAdapter.test.ts src/infrastructure/model/InstructionSurface.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/application/use-cases/RunAgentTurnNativeTools.test.ts src/composition/config.test.ts
```

**108 pass, 0 fail, 1005 assertions, 5 files, 122 ms**, exit 0; `/tmp/phase194-baseline-focused.log`. Covers native adapter mapping, pseudo-call security regression, exact tool definitions/instruction surface and configuration defaults/override behavior. Disposable freezing assertions additionally verify historical recovery and E/F-only system difference. No repository tests were added or changed; no generic regression gap was found. Disposable syntax-only Bun bundle passed; this is not release/build validation.

## Live evidence

The frozen harness executed **once** with authorized outside-sandbox localhost access, matching Phase 19.3's transport requirement:

```text
bun /tmp/phase194-live.ts > /tmp/phase194-live.log 2>&1
```

Started `2026-10-12T18:15:40.376Z`, finished `2026-10-12T18:15:49.190Z`; total host duration **8813.544645 ms**. Harness exit 0 denotes diagnostic completion; eventual read/task correctness is not scored. **Exactly two provider inference requests: one E, one F.** The inference budget is permanently closed. Metadata GET/version/tags and POST/show are read-only, not inference. No activation/unload, embeddings or optional-memory inference.

Launch and post-live version/model digest/template/capabilities/parameters match the frozen identities. Selected tag and complete show metadata also match before/after live. All baseline tracked/environment/historical bytes pass checks before each dispatch and at live close. Both submitted bodies equal their exact pre-inference captures. No request/harness change occurred after output.

Host-only proof file remained exactly `NATIVE_TOOL_PROOF_731942` without newline; host verified initial/final integrity and removed the disposable workspace. The proof is absent from both requests and never delivered to the model. Approvals **0**, ToolRunner calls **0**, tool executions **0**, application-tool filesystem reads **0**, mutations **0**, `run_process` calls **0**. The harness invokes only production tool-definition listing and adapter streaming.

### Scenario E — native

- Classification: **native**; status `native-emission-stop`; one inference request.
- HTTP 200; exact submitted body SHA-256 `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c`.
- Host request duration **4381.517801 ms**.
- Raw transport: **1 chunks / 1 NDJSON frames / 256 bytes**; mapped **1 chunks**.
- Native calls: **1 raw / 1 mapped**. No transport/parser error or malformed raw frame was observed.
- Raw artifact `/tmp/phase194-provider-E.ndjson`, SHA-256 `07556f5de13342cef5e7c55b48684f97db2ace116c0d7f89026fd16dd0417e7a`.
- Exact ordinary content: `""`; raw and mapped concatenated content agree exactly.

First real `message.tool_calls` contains `read_file` with exact structured arguments `{"path":"native-tool-proof.txt"}`. Provider ID `call_94khzkib`, function index `0` are retained in the raw frame. The unchanged mapper produces exactly `{ "contentDelta": "", "toolCalls": [{ "name": "read_file", "arguments": { "path": "native-tool-proof.txt" } }] }`. No argument repair, host ID generation or execution occurs.

After recording that mapped call, the frozen rule aborts and cancels the reader immediately. This intentional native-emission stop is classified **native**, not provider failure. No extra frame is read to obtain counters.

The raw transport evidence preserves the expected reader-cancellation exception exactly: `{"name":"AbortError","message":"Frozen diagnostic stops on native emission."}`. It is raised by the harness's recorded native-stop abort after successful emission; it does not prevent classification. No transport-read or parser error occurred.

#### Exact raw transport chunks

Each base64 entry preserves the original bytes returned by the real fetch reader and forwarded unchanged to the production parser; no read-ahead. Times are milliseconds from live harness start. Decoded concatenation equals the raw NDJSON artifact exactly.

| Chunk | At ms | Bytes | Base64 |
| --- | --- | --- | --- |
| 1 | 4384.317173 | 256 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ0Ljc1OTUwOTYxOVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIiwidG9vbF9jYWxscyI6W3siaWQiOiJjYWxsXzk0a2h6a2liIiwiZnVuY3Rpb24iOnsiaW5kZXgiOjAsIm5hbWUiOiJyZWFkX2ZpbGUiLCJhcmd1bWVudHMiOnsicGF0aCI6Im5hdGl2ZS10b29sLXByb29mLnR4dCJ9fX1dfSwiZG9uZSI6ZmFsc2V9Cg==` |

#### Every received NDJSON frame — exact raw UTF-8

```jsonl
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:44.759509619Z","message":{"role":"assistant","content":"","tool_calls":[{"id":"call_94khzkib","function":{"index":0,"name":"read_file","arguments":{"path":"native-tool-proof.txt"}}}]},"done":false}
```

The raw file retains its actual final newline. No frame is manufactured after cancellation.

#### Exact mapped ModelStreamChunk sequence

`chunk` is the unchanged parser output; `atMs` is observation timing.

```json
[
  {
    "atMs": 4385.116949,
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

#### Terminal metadata and counters

Not received before the required native-emission stop. Terminal frame, `done_reason`, prompt/eval counters and provider total/load/eval durations are **unavailable**, not zero. No extra stream read/request was made for metrics.

### Scenario F — textual pseudo-call

- Classification: **textual pseudo-call**; status `completed`; one inference request.
- HTTP 200; exact submitted body SHA-256 `8164f1dcd86584ee1490cfa451ec15f32f44a3a49838fb95c1f9aa5464274b10`.
- Host request duration **4424.735331 ms**.
- Raw transport: **15 chunks / 15 NDJSON frames / 2215 bytes**; mapped **15 chunks**.
- Native calls: **0 raw / 0 mapped**. No transport/parser error or malformed raw frame was observed.
- Raw artifact `/tmp/phase194-provider-F.ndjson`, SHA-256 `39f2051e9b0e6711174f1aad9bcc3981ca7ea9d0063ccce933d5e055b6c0829c`.
- Exact ordinary content: `"read_file[ARGS]{\"path\": \"native-tool-proof.txt\"}"`; raw and mapped concatenated content agree exactly.

Every raw frame lacks `message.tool_calls`; the unchanged parser yields fourteen ordinary content deltas followed by one terminal stop/usage chunk. No native call was lost in mapping. Exact complete pseudo-call:

```text
read_file[ARGS]{"path": "native-tool-proof.txt"}
```

Native function name/arguments: **none**. The textual JSON above is ordinary non-executable content and has zero authority to prepare, approve or execute a tool.

#### Exact raw transport chunks

Each base64 entry preserves the original bytes returned by the real fetch reader and forwarded unchanged to the production parser; no read-ahead. Times are milliseconds from live harness start. Decoded concatenation equals the raw NDJSON artifact exactly.

| Chunk | At ms | Bytes | Base64 |
| --- | --- | --- | --- |
| 1 | 8160.947079 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ4LjUzNzA4NzU1M1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicmVhZCJ9LCJkb25lIjpmYWxzZX0K` |
| 2 | 8208.929925 | 132 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ4LjU4NTQzNjM5MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXyJ9LCJkb25lIjpmYWxzZX0K` |
| 3 | 8256.497355 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ4LjYzMzAwNTkxN1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiZmlsZSJ9LCJkb25lIjpmYWxzZX0K` |
| 4 | 8302.617844 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ4LjY3OTE0NDg2N1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiW0FSR1NdIn0sImRvbmUiOmZhbHNlfQo=` |
| 5 | 8348.649732 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ4LjcyNTE4NTc4M1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoie1wiIn0sImRvbmUiOmZhbHNlfQo=` |
| 6 | 8394.307638 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ4Ljc3MDgzODA3MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicGF0aCJ9LCJkb25lIjpmYWxzZX0K` |
| 7 | 8440.815434 | 133 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ4LjgxNzMzMzM1WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJcIjoifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 8 | 8486.395504 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ4Ljg2MjkxNTI0MVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIFwiIn0sImRvbmUiOmZhbHNlfQo=` |
| 9 | 8532.818337 | 136 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ4LjkwOTMyOTY4WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJuYXRpdmUifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 10 | 8578.531267 | 136 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ4Ljk1NTA1MzEwOFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXRvb2wifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 11 | 8624.552514 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ5LjAwMTA5ODI3N1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXBybyJ9LCJkb25lIjpmYWxzZX0K` |
| 12 | 8670.525976 | 132 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ5LjA0NzA2OTY1WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJvZiJ9LCJkb25lIjpmYWxzZX0K` |
| 13 | 8716.687075 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ5LjA5MzIyMjQ0WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiIudHh0In0sImRvbmUiOmZhbHNlfQo=` |
| 14 | 8764.159449 | 133 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ5LjE0MDY5MTU3WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJcIn0ifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 15 | 8810.201557 | 334 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTEyVDE4OjE1OjQ5LjE4NjcyMzkzM1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIn0sImRvbmUiOnRydWUsImRvbmVfcmVhc29uIjoic3RvcCIsInRvdGFsX2R1cmF0aW9uIjo0NDE4NzA1MjgwLCJsb2FkX2R1cmF0aW9uIjozNTM5MDAyMTQ5LCJwcm9tcHRfZXZhbF9jb3VudCI6MjQ1LCJwcm9tcHRfZXZhbF9jYWNoZWRfY291bnQiOjAsInByb21wdF9ldmFsX2R1cmF0aW9uIjoyMjc1OTgwMDAsImV2YWxfY291bnQiOjE1LCJldmFsX2R1cmF0aW9uIjo2NDk1MTkwMDB9Cg==` |

#### Every received NDJSON frame — exact raw UTF-8

```jsonl
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:48.537087553Z","message":{"role":"assistant","content":"read"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:48.585436392Z","message":{"role":"assistant","content":"_"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:48.633005917Z","message":{"role":"assistant","content":"file"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:48.679144867Z","message":{"role":"assistant","content":"[ARGS]"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:48.725185783Z","message":{"role":"assistant","content":"{\""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:48.770838072Z","message":{"role":"assistant","content":"path"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:48.81733335Z","message":{"role":"assistant","content":"\":"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:48.862915241Z","message":{"role":"assistant","content":" \""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:48.90932968Z","message":{"role":"assistant","content":"native"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:48.955053108Z","message":{"role":"assistant","content":"-tool"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:49.001098277Z","message":{"role":"assistant","content":"-pro"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:49.04706965Z","message":{"role":"assistant","content":"of"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:49.09322244Z","message":{"role":"assistant","content":".txt"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:49.14069157Z","message":{"role":"assistant","content":"\"}"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-12T18:15:49.186723933Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":4418705280,"load_duration":3539002149,"prompt_eval_count":245,"prompt_eval_cached_count":0,"prompt_eval_duration":227598000,"eval_count":15,"eval_duration":649519000}
```

The raw file retains its actual final newline. No frame is manufactured after cancellation.

#### Exact mapped ModelStreamChunk sequence

`chunk` is the unchanged parser output; `atMs` is observation timing.

```json
[
  {
    "atMs": 8161.219556,
    "chunk": {
      "contentDelta": "read"
    }
  },
  {
    "atMs": 8209.130316,
    "chunk": {
      "contentDelta": "_"
    }
  },
  {
    "atMs": 8256.697489,
    "chunk": {
      "contentDelta": "file"
    }
  },
  {
    "atMs": 8302.85669,
    "chunk": {
      "contentDelta": "[ARGS]"
    }
  },
  {
    "atMs": 8348.898346,
    "chunk": {
      "contentDelta": "{\""
    }
  },
  {
    "atMs": 8394.524781,
    "chunk": {
      "contentDelta": "path"
    }
  },
  {
    "atMs": 8441.042951000001,
    "chunk": {
      "contentDelta": "\":"
    }
  },
  {
    "atMs": 8486.606129,
    "chunk": {
      "contentDelta": " \""
    }
  },
  {
    "atMs": 8533.053233,
    "chunk": {
      "contentDelta": "native"
    }
  },
  {
    "atMs": 8578.76823,
    "chunk": {
      "contentDelta": "-tool"
    }
  },
  {
    "atMs": 8624.787389000001,
    "chunk": {
      "contentDelta": "-pro"
    }
  },
  {
    "atMs": 8670.769186,
    "chunk": {
      "contentDelta": "of"
    }
  },
  {
    "atMs": 8716.929271,
    "chunk": {
      "contentDelta": ".txt"
    }
  },
  {
    "atMs": 8764.446773,
    "chunk": {
      "contentDelta": "\"}"
    }
  },
  {
    "atMs": 8810.477163,
    "chunk": {
      "contentDelta": "",
      "finishReason": "stop",
      "usage": {
        "promptTokens": 245,
        "outputTokens": 15
      }
    }
  }
]
```

#### Terminal metadata and counters

Naturally received clean `done: true`, `done_reason: "stop"`; **245 prompt tokens / 15 output tokens**, zero cached prompt tokens. Complete exact terminal frame:

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-12T18:15:49.186723933Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 4418705280,
  "load_duration": 3539002149,
  "prompt_eval_count": 245,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 227598000,
  "eval_count": 15,
  "eval_duration": 649519000
}
```

### Closed inference ledger

| Request | Frozen condition | Native channel | Ordinary content | End |
| --- | --- | --- | --- | --- |
| 1 | E: minimal explicit system + exact read_file | one expected native read_file | empty | immediate native-emission stop; no execution |
| 2 | F: exact historical 394-byte system + same read_file | none | exact pseudo-call above | clean stop; no execution |

Total **2 / maximum 2**. Retries **0**, continuations **0**, post-tool rounds **0**, alternate models **0**, downloads **0**, prompt variants **only pre-frozen E/F**, extra conditions **0**. C/D were reused from historical records without rerun or rescoring.

Complete evidence `/tmp/phase194-live-evidence.json`, SHA-256 `364b18e5eb28c8183e6b333f6d26f9c7b94d6dcde25195b2967732790db151e5`; trace `/tmp/phase194-live.log`; permanent exclusive launch marker `/tmp/phase194-live-once.lock`. Exact bodies/raw bytes/base64/frame lines/native fields/mapped sequence/timing/terminal availability/integrity and launch/post-live identities are retained in this record and artifacts.

## Interpretation

**Pattern 3: E native, F non-native; frozen D native, frozen C non-native. Outcome C — historical base-instruction content strongly implicated.**

A minimal explicit application system permitted native emission in E, so explicit-system presence/provider-fallback suppression alone is not sufficient to explain these observations. The historical 394-byte default produced only pseudo-call prose in F. The observed failure therefore predates the Phase 19.1 verification/repair addition and is associated with content in the historical base instruction. The addition is not required for the failure seen here; no individual base clause is isolated or declared defective.

Each live condition is **one bounded sample**. The result is controlled isolation, not a statistical benchmark or proof of guaranteed native adherence. Stochastic variability remains possible. No eventual task correctness, production acceptance, reliable model suitability or universal sentence-level claim is inferred from emission-only evidence.

**Exactly one next direction: base-system clause isolation.** It is not implemented or run in this phase. No fifth condition, replication, prompt variant, wording fix or production tuning follows this closed budget.

### Four-condition comparison

| Scenario | System | Tool | Native call | Ordinary content | Meaning |
| --- | --- | --- | --- | --- | --- |
| 19.3 C | current production 1390-byte | read_file | frozen: no | frozen: `read_file[ARGS]{"path": "native-tool-proof.txt"}` | historical complete-system failure |
| 19.3 D | none | read_file | frozen: yes, `read_file({"path":"native-tool-proof.txt"})` | frozen: empty | historical no-system native emission |
| 19.4 E | minimal explicit | read_file | measured: yes, `read_file({"path":"native-tool-proof.txt"})` | measured: empty | explicit system alone can preserve native emission |
| 19.4 F | historical 394-byte base | read_file | measured: no | measured: `read_file[ARGS]{"path": "native-tool-proof.txt"}` | base-instruction content associated with failure; Outcome C |

## Production impact

**Production impact: none.** Sole repository change: this new progress record. All 95 production TypeScript files and all 233 baseline tracked files remain byte-identical; all 30 historical progress records, 83 prior artifacts and `.env` remain exact. No source/test/durable architecture changes followed output.

Current system/verification guidance, read_file descriptions/schema, ContextBuilder, ProcessObservation, adapter/HTTP/parser, ToolRunner, LocalToolRegistry, run_process and model selection remain unchanged. Installed provider/template/Modelfile/model files are untouched. No provider-specific rendering, stop-token override, tool-choice equivalent, textual fallback parser, model-specific production branch, model switch, dependency installation, download, staging or commit.

Protected contracts remain authoritative: Phase 19.3 frozen C/D and production integrity; Phase 19.2 native serialization/parser/security; Phase 19.1 verification/repair/process-context projection; Phase 19 direct argv/approval/timeout/output/cancellation; Phase 18.1 preparation/recovery/approval; Phase 18.7 best-effort memory; Phase 17 retrieval; Phase 16 context limits; Phase 15.5 model selection. This emission-only harness invokes no tool preparation/approval/execution/result/continuation path. Assistant pseudo-call prose remains non-executable; only structured provider `message.tool_calls` may propose application execution.

## Final validation

| Gate | Final result | Evidence |
| --- | --- | --- |
| Focused native/adapter/pseudo-call/instruction/tool/config before live | PASS: 108 tests, 0 fail, 1005 assertions, 5 files; 122 ms | `/tmp/phase194-baseline-focused.log` |
| Same focused scope after live | PASS: 108 tests, 0 fail, 1005 assertions, 5 files; 196 ms | `/tmp/phase194-focused-final.log` |
| `bun run typecheck` | PASS, exit 0 | `/tmp/phase194-typecheck.log` |
| `bun run format:check` | PASS, exit 0; 183 files, no fixes | `/tmp/phase194-format.log` |
| `git diff --check` | PASS, no diagnostics | direct check and final review |
| New progress whitespace/UTF-8/final newline/local links | PASS; explicit checks and `git diff --no-index --check /dev/null docs/progress/phase-19.4-progress.md` has no diagnostics; exit 1 means the expected new-file difference | `/tmp/phase194-final-review.py`, `/tmp/phase194-final-review.json` |
| Exact historical system recovery and frozen E/F identity/structural diff | PASS: old 394 bytes/hash and independent Phase 19.1 capture; E exact 26-byte sentence; system content only differs | recovery/capture artifacts; pre-live and final review |
| Provider/model/template/current-system/read_file identity | PASS: no drift before freeze, at launch or post-live; complete selected tag/show equality | provider identity and live evidence |
| Raw byte chunks/every frame/mapped sequence/native fields/terminal availability | PASS: base64 reproduces artifacts; mapped content/native arguments match raw; E expected abort preserved and terminal unavailable; F naturally completed | full live evidence and final review |
| Closed inference ledger/one-shot guard/fixture/zero execution | PASS: exactly one E + one F, 2/2 requests; no retry/continuation/execution; unchanged fixture and workspace removed; permanent lock retained | live evidence, launch guard and final review |
| Repository/environment/history/frozen-artifact integrity/HEAD/index/status | PASS: all 233 tracked files, 95 production sources, 30 historical progress records, `.env`, 83 prior artifacts and 17 frozen plan artifacts exact; production equals Phase 19.3 | `/tmp/phase194-baseline-integrity.json`, `/tmp/phase194-final-review.json` |

Complete record reviewed, including both exact serialized bodies, 16 received raw frames, 16 transport chunks and 16 mapped chunks. Final review verifies embedded bytes/base64/mapped evidence against the captures, the historical reconstruction, frozen hashes, exact submitted bodies, expected native-stop AbortError, closed budget, fixture removal and actual repository state. No frozen helper, request, source or test changed after output.

Final tracked `git diff` / `git diff --stat`: **empty**; the only change is a new unstaged progress file. Exact `git status --short --untracked-files=all`:

```text
?? docs/progress/phase-19.4-progress.md
```

HEAD remains `216aa083af2a16fa8f6f2b1df595daa11fbca7a1`; index diff empty; no staging or commit. No full test suite, Linux/Windows build, smoke build or release check was rerun for this progress-record-only diagnostic. No release/current Windows-runtime claim. Final status/evidence-only documentation updates receive lightweight integrity/whitespace/status checks without further inference or unnecessary repetition of passing expensive gates.

## Final summary

| Item | Final value |
| --- | --- |
| candidate | `ministral-3:14b` |
| provider/model drift | no; version/digest/template/capabilities/parameters/current-system/read_file identities unchanged |
| current system hash | `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc` |
| historical base system bytes | 394 |
| historical base system hash | `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597` |
| E system | `Follow the user's request.` |
| F system | exact historical 394-byte base, recovered from Phase 19.1 starting revision; full string above |
| E/F user identical | yes; exact frozen Phase 19.3 user |
| E/F read_file identical | yes; generic/schema/wire bytes match each other and Phase 19.3 |
| E native call | yes; one raw / one mapped `read_file`, arguments `{"path":"native-tool-proof.txt"}` |
| F native call | no; zero raw / mapped |
| E pseudo-call | none; ordinary content empty |
| F pseudo-call | `read_file[ARGS]{"path": "native-tool-proof.txt"}`; ordinary non-executable content |
| total inference requests | exactly 2 / maximum 2; one E, one F; closed |
| retries | 0 |
| continuations | 0; post-tool rounds also 0 |
| tool execution | 0; approvals/ToolRunner calls/application-tool reads/mutations/run_process also 0 |
| prompt variants | only frozen E/F; no adaptive change |
| alternate models | 0 |
| downloads | 0 |
| textual fallback parser | no |
| root-cause outcome | **C — historical base-instruction content strongly implicated** |
| next direction | **base-system clause isolation**; not implemented |
| production source changes | none; sole repository change is this progress record |
| system prompt changes | none |
| Phase 19.3 changes | none; C/D reused without rerun/rescoring |
| model-selection changes | none |
| commit | none |
