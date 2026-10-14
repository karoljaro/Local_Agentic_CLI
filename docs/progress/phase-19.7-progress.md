# Phase 19.7 — final native-tool adherence decision

## Status

Current status: **verified** — D1/D2 native, C1/C2 textual pseudo-call, no provider failures: **Outcome A**. Exactly four requests; live budget permanently closed; zero tool execution. All four requests were frozen before inference. Focused tests, typecheck, formatting, historical/frozen/raw/mapped evidence, document checks and repository byte-integrity review pass. Phase 19.7 is the final diagnostic phase; exactly one Phase 19.8 implementation/acceptance is allowed. No required Phase 19.7 work remains.

- [x] not started
- [x] audit complete
- [x] requests frozen
- [x] live comparison complete
- [x] decision reached
- [x] verified
- [ ] blocked

## Baseline

- Starting HEAD: `c5797a4b9e69e0304386929e35a5c9c830b28de3`; Bun **1.4.3**; Linux, workspace `/home/karoljaron/Projects/Local_Agentic_CLI`.
- Starting tracked `git diff`, `git diff --stat` and index diff: **empty**. Starting status was `?? docs/progress/phase-19.6-progress.md`; this existing untracked historical record remains read-only. No staging or commit.
- Authoritative records read: [Phase 19.6](phase-19.6-progress.md), [Phase 19.5](phase-19.5-progress.md), [Phase 19.4](phase-19.4-progress.md), [Phase 19.3](phase-19.3-progress.md), [Phase 19.2](phase-19.2-progress.md). Historical observations reused without rerun or rescoring. Prior prompt-isolation directions are superseded by this phase's hard final stop.
- No applicable ancestor/workspace/docs `AGENTS.md`; no sub-agents requested or spawned.
- `/tmp/phase197-baseline-integrity.json` protects **235 tracked files**, **95 production TypeScript files**, **33 historical progress records** (including untracked Phase 19.6), `.env` and **92 prior Phase 19.5/19.6 helper/evidence artifacts**. Current HEAD and all Phase 19.6 baseline/source/environment bytes are exact. Prior frozen plan/provider/live-evidence hashes match its authoritative record and guard.
- Focused deterministic baseline: **108 pass, 0 fail, 1005 assertions, 5 files, 112 ms**, exit 0; `/tmp/phase197-baseline-focused.log`. Mocked provider responses only. Native mapping, pseudo-call non-execution, instruction/tool/configuration identities pass; no generic regression gap and no repository test additions.

Focused scope before and after live:

```text
bun test src/infrastructure/model/OllamaModelAdapter.test.ts src/infrastructure/model/InstructionSurface.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/application/use-cases/RunAgentTurnNativeTools.test.ts src/composition/config.test.ts
```

### Environment integrity — no drift from Phase 19.6

Read-only `/api/version`, `/api/tags`, `/api/show` captures are preserved at `/tmp/phase197-provider-{version,tags,show}.json`. Selected tag and complete show response equal the hash-verified Phase 19.6 identity; `/tmp/phase197-provider-identity.json`.

- Ollama **0.40.2**, base URL `http://localhost:11434`; candidate **ministral-3:14b** only.
- Exact digest `129e04c05b562f6e6ea7ec07ef0b0a61ef1aeaedb91ac524e67a1672eba7bb36`.
- Template **3414 UTF-8 bytes**, SHA-256 `aa65b5aebf89e7dfb3aa05af9220299a7e1cebe3ab97daae3c2e259acbdf278c`.
- Capabilities `["completion", "vision", "tools"]`; exact parameter metadata `temperature                    0.15`. No temperature/sampler override.
- Complete Modelfile/model_info/template/parameters/selected tag metadata equal Phase 19.6: family `mistral3`, families `["mistral3", "clip"]`, `Q4_K_M`, displayed `13.9B`, parameter count `13506073600`, advertised model context `262144`, tag size `9082557469` and modified timestamp unchanged.
- Isolated candidate selection in disposable harness; config-derived current production system and effective chat configuration match. Context/output **16384/4096**, keep_alive **0**, `stream: true`, `truncate: false`, `shift: false`. No format, tool_choice, function_call, required_tools, temperature, seed, sampling, reasoning or template override; environment/preferences/model selection unchanged.
- Unchanged **OllamaModelAdapter → OllamaHttpClient → readOllamaChatStream**, with a host-only byte tap. Adapter/transport/parser/source bytes match Phase 19.6. No activation/unload, embedding, retrieval or memory inference.
- Curl metadata access passed. Bun's sandboxed metadata-only `/api/version` preflight failed `ECONNREFUSED`; the same metadata verification with approved outside-sandbox access passed. Both sent **zero inference**. Logs `/tmp/phase197-bun-metadata-preflight.log` and `/tmp/phase197-bun-metadata-preflight-outside.log`. Live uses that established outside-sandbox access.

| Artifact | UTF-8 bytes | SHA-256 |
| --- | --- | --- |
| current production system | 1390 | `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc` |
| production read_file generic definition | 717 | `4050d9c7d7569c116d05311f513a51b19fd6cedb964471b0c8bcb9c2f776c9bc` |
| read_file schema | 499 | `db50a0d44325d0f927cdd580dc7886ff5292eecdb18516dc3957b2bfa456098c` |
| read_file wire function | 748 | `2ad18509a7682736490b03dda7f418a4ac69ffca73b491c390e53883b9aa3d22` |
| single wire tool array | 750 | `d7382d3f27a729c39fc26bf897fcb7322ed5e9f521760543dfcc400b350de8fd` |

### Historical C/D identities — reused, not rerun or rescored

Recovered directly from Phase 19.3's **exact serialized C/D body fences** (lines 110/116) and its separate body hash table (lines 97/98). Their framing newlines are explicitly presentation-only in that record; bodies have no final newline. Extracted bytes match the recorded hashes. Original Phase 19.3 `/tmp` captures are unavailable, so the authoritative complete document bytes are used, without manual reconstruction or semantic-JSON substitution.

| Historical condition | Bytes | SHA-256 | Frozen outcome |
| --- | --- | --- | --- |
| C | 2470 | `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4` | textual pseudo-call; zero native; `read_file[ARGS]{"path": "native-tool-proof.txt"}` |
| D | 1049 | `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7` | native `read_file({"path":"native-tool-proof.txt"})`; one native; ordinary content empty |

## Decision design

Exactly four new emission-only provider requests, in fixed order **D1 → C1 → C2 → D2**. Candidate: **ministral-3:14b** only. D has no application system message; C has the exact config-derived current production system. Shared exact user, exact production `read_file`, adapter/parser and provider options. No retries, continuations, post-tool rounds, tool execution, alternate conditions or fifth request.

- **Outcome A:** D1 and D2 native, C1 and C2 non-native, no provider failure. One Phase 19.8 production-system redesign/acceptance is allowed: one coherent prompt revision retaining required safety/verification semantics, deterministic regressions and one bounded acceptance qualification, then accept or revert/close. No diagnostic bisection.
- **Outcome B:** either D non-native or either C native, with no provider failure preventing interpretation. Close the Phase 19 adherence investigation; no Phase 19.8. Treat model/provider native adherence as unreliable under bounded evidence.
- **Outcome C:** any request unclassifiable because of provider/transport/incomplete-stream/timeout failure. Close the investigation as operationally inconclusive; no retry or further Phase 19.x diagnostic.

Four observations are qualitative engineering evidence, not a statistical benchmark. No significance or universal reliability claims. The historical Phase 19.3 C/D observations are reused without rerun or rescoring.

After this phase there is no clause/tool-description/schema/template/order isolation, Phase 19.7.x or extra replication. Any future model-capability/product-policy work requires a separate major phase and distinct product requirement.

### Exact shared task and measurement boundaries

Shared user is exactly **114 UTF-8 bytes**, SHA-256 `5b1eee3bc7307290be03bfb0172cdfb3413cd5395b342c037c78c22b4cde5800`:

```text
Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess.
```

C: exact **1390-byte config-derived current production system**, no shortening, normalization, added wording or examples. D: no system role/message, including no empty or replacement system. Exactly one unchanged production `read_file` from the real registry; no other/synthetic tool.

Host-only disposable `/tmp/phase197-workspace-*` fixture `native-tool-proof.txt` will contain exactly `NATIVE_TOOL_PROOF_731942`, without newline. Its value is asserted absent from every frozen body. Only host setup/final-integrity checks; no application tool execution.

Per-request deadline **60000 ms**, aggregate deadline **250000 ms**, fixed before inference. Every slot is attempted once if the aggregate deadline permits, regardless of prior output. Failures are recorded without repair/retry/replacement; no deadline extension or extra round.

At first mapped provider-native call, preserve every already-received raw byte, exact raw `message.tool_calls` field and mapped name/arguments, abort and break immediately, following the established diagnostic rule. No preparation, approval, execution, tool result or continuation. Incorrect/malformed raw arguments remain unchanged evidence. Terminal/counter metadata not naturally received remains unavailable; intentional native-stop cancellation is not a provider failure.

Per-request classification: **native** (raw provider native call), **textual pseudo-call** (no native field, tool-like assistant text), **ordinary non-tool** (no native field/tool-like prose), **provider failure** (transport/provider/incomplete/timeout prevents interpretation). Host-only shape classification confers no authority and never repairs/executes content. Expected native call is `read_file` with `{"path":"native-tool-proof.txt"}`; actual output is retained exactly.

## Frozen request bodies

Four mocked serializations through unchanged production adapter/HTTP serialization sent **zero real inference**. Exact `Buffer.equals` checks prove all new C/D bodies equal recovered historical bytes; repeated wire bodies **and ModelPort inputs** are identical. Host-owned message ID is the same for all slots and excluded by production serialization. No request-specific field, timestamp, seed or diagnostic text appears on wire.

Removing only `/messages/0` from C yields D **byte-for-byte**; the same removal in its ModelPort input yields D exactly. User/tool/options/property order are identical.

| Frozen request | System | Bytes | SHA-256 | Historical byte equality |
| --- | --- | --- | --- | --- |
| D1 | none | 1049 | `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7` | exact D bytes |
| C1 | exact current production | 2470 | `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4` | exact C bytes |
| C2 | exact current production | 2470 | `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4` | exact C bytes |
| D2 | none | 1049 | `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7` | exact D bytes |

**D1 == D2; C1 == C2**, exact bytes. Top-level serialized order: `model`, `messages`, `keep_alive`, `tools`, `stream`, `options`, `truncate`, `shift`; no extra field. Bodies have no final newline; fence framing newlines below are presentation only.

### Exact serialized D body — D1 / D2

```json
{"model":"ministral-3:14b","messages":[{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

### Exact serialized C body — C1 / C2

```json
{"model":"ministral-3:14b","messages":[{"role":"system","content":"Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly. Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work. Respect user/repository command restrictions and required checks. Verify material changes with bounded proportionate run_process checks from instructions/configuration/CI or user/prior successful commands; reuse known commands. Tiny text edits or unavailable/disproportionate checks may remain unverified. Read exit status/stdout/stderr: non-zero exits are diagnostic results, not tool failures. Repair only evidenced failures relevant to requested work; inspect narrowly if uncertain. Reverify repairs when useful. Stop when failure persists without new evidence, fixes are speculative/unrelated or broaden scope, execution is denied/unavailable, or timeout/output prevents safe progress. No automatic dependency installation, downloads or network recovery. Never claim checks passed or failures fixed without current-task tool or trustworthy user evidence; edits alone prove neither. Report verified scope and failed/unrun/blocked/inconclusive checks; disclose repairs without re-verification."},{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

### Freeze, one-launch guard and durable ledger

Freeze timestamp **2026-10-14T10:30:46.918727+00:00**; plan SHA-256 `6d4c18e0b8d5a71a9e1e9ad255048e821fdae7656101befc171834d863e31ef7`; guard SHA-256 `43a8b15056e2c50aaa9404ab556ce369d6b61680acb3cdbb4293b83949da79e1`. **30 artifacts**, plan and guard are read-only. Disposable syntax-only Bun bundle passed; it is not a release/build validation.

`/tmp/phase197-launch-guard.json` anchors all frozen hashes, exact order and maximum **4**. Harness exclusively creates/fsyncs permanent `/tmp/phase197-live-once.lock` before dispatch; second launch forbidden even after failure/interruption. Empty `/tmp/phase197-inference-ledger.jsonl` was created and fsynced before launch. Each attempt is durably appended/fsynced **before real fetch**; cap/order/exact body/hash checked before every dispatch. No retries or hidden inference endpoints.

Repository, history, environment and frozen hashes rechecked at launch, before each request and at close; complete selected provider tag/show identities must remain equal. Raw tap forwards unchanged byte chunks with `highWaterMark: 0`; no diagnostic read-ahead. Frozen helpers/inputs cannot be edited after output.

| Frozen artifact | SHA-256 |
| --- | --- |
| `/tmp/phase197-audit.py` | `1b2520d661a776ae3732da449e56e8e0f902878f50ab381faf56dffdae474e6d` |
| `/tmp/phase197-prepare.py` | `6a5f479370350468d54f8a3941bfeea4e04c074e5a3df6c8e082bc081a4df295` |
| `/tmp/phase197-common.ts` | `f1779978b65a6b276434470903de276c085bd6458044e75f76a6cac7aeef9d6e` |
| `/tmp/phase197-capture.ts` | `5a638d5df8eca67b86ee6c9bcd66db62c6c3902f69896f8a3ee84caece31465b` |
| `/tmp/phase197-live.ts` | `d22494cbb07605e5c5f01eebee4582b01a5d75168dbc6e46b256ee0f5244f473` |
| `/tmp/phase197-preflight.ts` | `3a60082983451c825a9ea704ca31c32cd12c7a8cefa8c19e1b053d6df3ed2cb5` |
| `/tmp/phase197-freeze.py` | `ea0ac9cc62c5e3af4ff5944d94664b179dd0675bd59a96c842016d070c58d8ae` |
| `/tmp/phase197-update-pre.py` | `5940e5a1e6337ae64781cb3fb924e7cf539e590dabaa6aaed96f1e860a4538b7` |
| `/tmp/phase197-baseline-integrity.json` | `c9c103afe9ac15ca6847b99aff60eb41b3fe1491619cd2b57726f32d19577a2e` |
| `/tmp/phase197-historical-request-identities.json` | `7d59766754cca9a2fba58369ecbffb9585e50e9ce84a91f53338d9340ea94b73` |
| `/tmp/phase197-reference-C-body.json` | `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4` |
| `/tmp/phase197-reference-D-body.json` | `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7` |
| `/tmp/phase197-provider-version.json` | `2657f6fff8018900025e47485e719c930017826b790e73ae28087cdcd93fe50e` |
| `/tmp/phase197-provider-tags.json` | `f50c00ab1a94e927b74e67610ac2cf4bc5d5cd19d411d48026996b7fed2afdd8` |
| `/tmp/phase197-provider-show.json` | `f4e2dbe14565594a406a48ea0edcc8a1b3c105ffcfaa401474e9025f5d61d2fb` |
| `/tmp/phase197-provider-identity.json` | `0ea61adc6786b624a6d4387efee0ae20586fac2ead495050bed8ea81db9dfe13` |
| `/tmp/phase197-input-D1.json` | `1a9495cd0c05fdd895f6edc60127919168b19ebbcc5c22feaa0def29ce18fc66` |
| `/tmp/phase197-input-C1.json` | `246002d2bd8bb8b155c20f1f43aec00ab6a2448d8100964ca72689918b320e70` |
| `/tmp/phase197-input-C2.json` | `246002d2bd8bb8b155c20f1f43aec00ab6a2448d8100964ca72689918b320e70` |
| `/tmp/phase197-input-D2.json` | `1a9495cd0c05fdd895f6edc60127919168b19ebbcc5c22feaa0def29ce18fc66` |
| `/tmp/phase197-request-D1.json` | `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7` |
| `/tmp/phase197-request-C1.json` | `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4` |
| `/tmp/phase197-request-C2.json` | `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4` |
| `/tmp/phase197-request-D2.json` | `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7` |
| `/tmp/phase197-capture-summary.json` | `3e2f53d31afec7845ea29db9bd5cffa024af50d26a216ed068166bad68f3d7aa` |
| `/tmp/phase197-baseline-focused.log` | `c08ba9f7822cec77133921e069105808c8a77ed9b03ca7616e2411f97a1225be` |
| `/tmp/phase197-capture.log` | `8f184522426bbc554093bf44769aa4eb083aed60852efa0abfd67aa439cd1a7b` |
| `/tmp/phase197-syntax-check.log` | `2881bbb66015327c732d6e9695c4ae4ff5faf91efb4cb42ff5b286767149f15c` |
| `/tmp/phase197-bun-metadata-preflight.log` | `7ee8876788855722d1a314d08874e0a1ad2a321e493ef1b7b0fe966d8f704508` |
| `/tmp/phase197-bun-metadata-preflight-outside.log` | `c424351704276ec343c16300980e90addb07adae64cdf0c48063ee3eeb43e727` |

## Live evidence

The frozen harness launched **once**, with approved outside-sandbox localhost access:

```text
bun /tmp/phase197-live.ts > /tmp/phase197-live.log 2>&1
```

Started **2026-10-14T10:31:05.100Z**, finished **2026-10-14T10:31:25.397Z**; host duration **20296.336357 ms**, within the frozen 250000 ms aggregate bound. Exit 0. **Exactly four provider inference requests**, fixed **D1 → C1 → C2 → D2**, one dispatch each. Maximum **4**; the budget is permanently closed. Metadata reads, mocked serializations and offline replays are not inference. No activation/unload, other inference endpoint, retry, continuation, tool-result round or fifth request.

Provider identity passed at launch, immediately before each dispatch and at close: Ollama **0.40.2**, exact candidate digest/template/capabilities/parameters, complete selected tag and show unchanged. All repository/history/environment/frozen bytes matched before every dispatch and at close.

Fixture **24 bytes**, SHA-256 `12e44b4e02d60b29f6f3f1ab60015f9e6c1ad64bb2e1ff356aae77e82ce9c775`, exact fixed content without newline before/after. Proof value absent from every request; no application tool read it or supplied a result. Disposable workspace removed. Native preparations/approvals/executions, ToolRunner calls, application filesystem reads/mutations and run_process: **zero**. Textual pseudo-calls: **zero execution authority**, **zero execution**.

| Request | System | Result | Native calls | Ordinary content |
| --- | --- | --- | --- | --- |
| D1 | none | native | 1 raw / 1 mapped | empty (`""`) |
| C1 | current production | textual pseudo-call | 0 raw / 0 mapped | `read_file[ARGS]{"path": "native-tool-proof.txt"}` |
| C2 | current production | textual pseudo-call | 0 raw / 0 mapped | `read_file[ARGS]{"path": "native-tool-proof.txt"}` |
| D2 | none | native | 1 raw / 1 mapped | empty (`""`) |

### Durable inference ledger — append/fsync before real fetch

```json
{"number":1,"condition":"D1","atMs":45.190690999999994,"bodySha256":"fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7","status":"dispatch-attempt-counted-before-fetch"}
{"number":2,"condition":"C1","atMs":5203.252393999999,"bodySha256":"b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4","status":"dispatch-attempt-counted-before-fetch"}
{"number":3,"condition":"C2","atMs":10147.408489000001,"bodySha256":"b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4","status":"dispatch-attempt-counted-before-fetch"}
{"number":4,"condition":"D2","atMs":15080.303268,"bodySha256":"fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7","status":"dispatch-attempt-counted-before-fetch"}
```

### D1 — native

- Request: **1049 UTF-8 bytes**, SHA-256 `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7`; exact submitted body equals its frozen and historical D bytes above.
- HTTP **200**, status `native-emission-stop`; **5133.755758 ms** host duration. Native count **1 raw / 1 mapped**.
- Raw transport: **1 chunks**, **1 NDJSON frames**, **256 bytes**; mapped **1 ModelStreamChunks**. Artifact `/tmp/phase197-provider-D1.ndjson`, SHA-256 `85e225ea59ed82f5545c10b67094ded0d7fa7181d68341da44cb58afe263db48`. All received bytes/frames are retained; no malformed frame or provider error; no deadline fired.
- Exact ordinary assistant content: `""`. Raw and mapped content agree.
- Actual exact native name `read_file`, arguments `{"path":"native-tool-proof.txt"}`; expected name/arguments match. Provider ID `call_pfycro97` and index **0** preserved in raw evidence; normal mapper returns name/arguments. No harness normalization/repair.
- Intentional immediate first-native abort/break; cancellation `AbortError` with message `Frozen diagnostic stops on native emission.` is expected control flow, not a provider failure. No terminal frame or prompt/output counters naturally received; **unavailable**, never reconstructed or fetched later.

Exact raw native field:

```json
[{"id":"call_pfycro97","function":{"index":0,"name":"read_file","arguments":{"path":"native-tool-proof.txt"}}}]
```

Exact mapped native call:

```json
[{"name":"read_file","arguments":{"path":"native-tool-proof.txt"}}]
```

Every raw transport chunk, exact bytes as base64 with original byte count and host-relative arrival time:

```json
[
  {
    "atMs": 5164.7071559999995,
    "bytes": 256,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjEwLjI2MzcyNDkyN1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIiwidG9vbF9jYWxscyI6W3siaWQiOiJjYWxsX3BmeWNybzk3IiwiZnVuY3Rpb24iOnsiaW5kZXgiOjAsIm5hbWUiOiJyZWFkX2ZpbGUiLCJhcmd1bWVudHMiOnsicGF0aCI6Im5hdGl2ZS10b29sLXByb29mLnR4dCJ9fX1dfSwiZG9uZSI6ZmFsc2V9Cg=="
  }
]
```

Every observed NDJSON frame, exact raw bytes rendered as UTF-8 (final newline belongs to transport):

```json
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:10.263724927Z","message":{"role":"assistant","content":"","tool_calls":[{"id":"call_pfycro97","function":{"index":0,"name":"read_file","arguments":{"path":"native-tool-proof.txt"}}}]},"done":false}
```

Complete mapped ModelStreamChunk sequence and original host-relative observation times:

```json
[
  {
    "atMs": 5165.563902999999,
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

### C1 — textual pseudo-call

- Request: **2470 UTF-8 bytes**, SHA-256 `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4`; exact submitted body equals its frozen and historical C bytes above.
- HTTP **200**, status `completed`; **4910.968352 ms** host duration. Native count **0 raw / 0 mapped**.
- Raw transport: **15 chunks**, **15 NDJSON frames**, **2219 bytes**; mapped **15 ModelStreamChunks**. Artifact `/tmp/phase197-provider-C1.ndjson`, SHA-256 `b1216ef704a87161ddc47aee00b30e46a77031cae054b0e2c1cbc8593155b75d`. All received bytes/frames are retained; no malformed frame or provider error; no deadline fired.
- Exact ordinary assistant content: `"read_file[ARGS]{\"path\": \"native-tool-proof.txt\"}"`. Raw and mapped content agree.
- Naturally completed terminal: `done: true`, `done_reason: stop`; prompt/output **435/15**, cached prompt **0**. Raw provider duration counters retained in terminal frame below; not compared as another investigative variable.
- No raw `message.tool_calls` field in any observed frame. Tool-shaped `read_file[ARGS]...` is ordinary content; no preparation, approval, execution or fallback parsing.

Every raw transport chunk, exact bytes as base64 with original byte count and host-relative arrival time:

```json
[
  {
    "atMs": 9319.348289,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0LjQxOTQ3MDg2OFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicmVhZCJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 9377.482303,
    "bytes": 132,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0LjQ3ODEzMjI1OVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXyJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 9434.641726,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0LjUzNTI4NDIzMVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiZmlsZSJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 9490.879579,
    "bytes": 137,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0LjU5MTUzODE1M1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiW0FSR1NdIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 9545.541231000001,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0LjY0NjIwMjA1OVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoie1wiIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 9600.32356,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0LjcwMDk4NzQ5MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicGF0aCJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 9657.447558,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0Ljc1ODExNDMyNVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCI6In0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 9712.198899,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0LjgxMjg2MjUxMVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIFwiIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 9766.872506,
    "bytes": 137,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0Ljg2NzUyMzQyN1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoibmF0aXZlIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 9822.794307,
    "bytes": 136,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0LjkyMzQ1ODc4M1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXRvb2wifSwiZG9uZSI6ZmFsc2V9Cg=="
  },
  {
    "atMs": 9877.905392,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE0Ljk3ODU3MzIxWiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiItcHJvIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 9933.532458,
    "bytes": 133,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE1LjAzNDE5MjAzNFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoib2YifSwiZG9uZSI6ZmFsc2V9Cg=="
  },
  {
    "atMs": 9989.817287,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE1LjA5MDQ1MTg0OFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLnR4dCJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 10044.787022,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE1LjE0NTQ0ODE4NVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCJ9In0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 10102.050022000001,
    "bytes": 334,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE1LjIwMjY4ODk5M1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIn0sImRvbmUiOnRydWUsImRvbmVfcmVhc29uIjoic3RvcCIsInRvdGFsX2R1cmF0aW9uIjo0ODk3NTk3MTY4LCJsb2FkX2R1cmF0aW9uIjozNzcyNjQ4NDE4LCJwcm9tcHRfZXZhbF9jb3VudCI6NDM1LCJwcm9tcHRfZXZhbF9jYWNoZWRfY291bnQiOjAsInByb21wdF9ldmFsX2R1cmF0aW9uIjozMzkyNzMwMDAsImV2YWxfY291bnQiOjE1LCJldmFsX2R1cmF0aW9uIjo3ODMxMTUwMDB9Cg=="
  }
]
```

Every observed NDJSON frame, exact raw bytes rendered as UTF-8 (final newline belongs to transport):

```json
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.419470868Z","message":{"role":"assistant","content":"read"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.478132259Z","message":{"role":"assistant","content":"_"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.535284231Z","message":{"role":"assistant","content":"file"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.591538153Z","message":{"role":"assistant","content":"[ARGS]"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.646202059Z","message":{"role":"assistant","content":"{\""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.700987492Z","message":{"role":"assistant","content":"path"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.758114325Z","message":{"role":"assistant","content":"\":"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.812862511Z","message":{"role":"assistant","content":" \""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.867523427Z","message":{"role":"assistant","content":"native"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.923458783Z","message":{"role":"assistant","content":"-tool"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:14.97857321Z","message":{"role":"assistant","content":"-pro"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:15.034192034Z","message":{"role":"assistant","content":"of"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:15.090451848Z","message":{"role":"assistant","content":".txt"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:15.145448185Z","message":{"role":"assistant","content":"\"}"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:15.202688993Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":4897597168,"load_duration":3772648418,"prompt_eval_count":435,"prompt_eval_cached_count":0,"prompt_eval_duration":339273000,"eval_count":15,"eval_duration":783115000}
```

Complete mapped ModelStreamChunk sequence and original host-relative observation times:

```json
[
  {
    "atMs": 9319.908507,
    "chunk": {
      "contentDelta": "read"
    }
  },
  {
    "atMs": 9377.917345,
    "chunk": {
      "contentDelta": "_"
    }
  },
  {
    "atMs": 9435.078536,
    "chunk": {
      "contentDelta": "file"
    }
  },
  {
    "atMs": 9491.407022000001,
    "chunk": {
      "contentDelta": "[ARGS]"
    }
  },
  {
    "atMs": 9546.064489,
    "chunk": {
      "contentDelta": "{\""
    }
  },
  {
    "atMs": 9600.828315,
    "chunk": {
      "contentDelta": "path"
    }
  },
  {
    "atMs": 9658.002105,
    "chunk": {
      "contentDelta": "\":"
    }
  },
  {
    "atMs": 9712.733507,
    "chunk": {
      "contentDelta": " \""
    }
  },
  {
    "atMs": 9767.357088,
    "chunk": {
      "contentDelta": "native"
    }
  },
  {
    "atMs": 9823.276513,
    "chunk": {
      "contentDelta": "-tool"
    }
  },
  {
    "atMs": 9878.407414000001,
    "chunk": {
      "contentDelta": "-pro"
    }
  },
  {
    "atMs": 9934.081575,
    "chunk": {
      "contentDelta": "of"
    }
  },
  {
    "atMs": 9990.265009,
    "chunk": {
      "contentDelta": ".txt"
    }
  },
  {
    "atMs": 10045.238723,
    "chunk": {
      "contentDelta": "\"}"
    }
  },
  {
    "atMs": 10102.48906,
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

### C2 — textual pseudo-call

- Request: **2470 UTF-8 bytes**, SHA-256 `b20f6c4aa408fdcb7aab19b2ee23aa7cbc58db6b405c57991d5b7cc1a46e68c4`; exact submitted body equals its frozen and historical C bytes above.
- HTTP **200**, status `completed`; **4909.679915999999 ms** host duration. Native count **0 raw / 0 mapped**.
- Raw transport: **15 chunks**, **15 NDJSON frames**, **2217 bytes**; mapped **15 ModelStreamChunks**. Artifact `/tmp/phase197-provider-C2.ndjson`, SHA-256 `ed441fff0236972d04856a11f436442cd7dfde330a51f0b2378e85949abdcf8e`. All received bytes/frames are retained; no malformed frame or provider error; no deadline fired.
- Exact ordinary assistant content: `"read_file[ARGS]{\"path\": \"native-tool-proof.txt\"}"`. Raw and mapped content agree.
- Naturally completed terminal: `done: true`, `done_reason: stop`; prompt/output **435/15**, cached prompt **0**. Raw provider duration counters retained in terminal frame below; not compared as another investigative variable.
- No raw `message.tool_calls` field in any observed frame. Tool-shaped `read_file[ARGS]...` is ordinary content; no preparation, approval, execution or fallback parsing.

Every raw transport chunk, exact bytes as base64 with original byte count and host-relative arrival time:

```json
[
  {
    "atMs": 14259.074475000001,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5LjM1ODk2NDUwNloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicmVhZCJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 14317.488739,
    "bytes": 132,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5LjQxODExMTkyNVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXyJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 14374.304741,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5LjQ3NDkzODcwOFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiZmlsZSJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 14430.287961,
    "bytes": 137,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5LjUzMDkzMDM1NloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiW0FSR1NdIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 14486.328194,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5LjU4Njk5MjA0M1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoie1wiIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 14540.953043000001,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5LjY0MTYyNDUyMloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicGF0aCJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 14596.313952,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5LjY5Njk3NjE0OVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCI6In0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 14651.210548000001,
    "bytes": 133,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5Ljc1MTg4MjE0WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiIgXCIifSwiZG9uZSI6ZmFsc2V9Cg=="
  },
  {
    "atMs": 14707.622132,
    "bytes": 137,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5LjgwODI3NTExNVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoibmF0aXZlIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 14762.741871,
    "bytes": 136,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5Ljg2MzQxMDgzNFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXRvb2wifSwiZG9uZSI6ZmFsc2V9Cg=="
  },
  {
    "atMs": 14818.485127,
    "bytes": 134,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5LjkxOTEzNjcxWiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiItcHJvIn0sImRvbmUiOmZhbHNlfQo="
  },
  {
    "atMs": 14874.527744,
    "bytes": 133,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjE5Ljk3NTE0ODcyOFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoib2YifSwiZG9uZSI6ZmFsc2V9Cg=="
  },
  {
    "atMs": 14929.657822000001,
    "bytes": 135,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjIwLjAzMDMyNTAzM1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLnR4dCJ9LCJkb25lIjpmYWxzZX0K"
  },
  {
    "atMs": 14985.148963,
    "bytes": 133,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjIwLjA4NTgwMjI1WiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiJcIn0ifSwiZG9uZSI6ZmFsc2V9Cg=="
  },
  {
    "atMs": 15041.208503,
    "bytes": 334,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjIwLjE0MTg0OTk4NVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIn0sImRvbmUiOnRydWUsImRvbmVfcmVhc29uIjoic3RvcCIsInRvdGFsX2R1cmF0aW9uIjo0ODkzMDgzNzExLCJsb2FkX2R1cmF0aW9uIjozNzY3OTY3NjI3LCJwcm9tcHRfZXZhbF9jb3VudCI6NDM1LCJwcm9tcHRfZXZhbF9jYWNoZWRfY291bnQiOjAsInByb21wdF9ldmFsX2R1cmF0aW9uIjozMzk4NDkwMDAsImV2YWxfY291bnQiOjE1LCJldmFsX2R1cmF0aW9uIjo3ODI3NzEwMDB9Cg=="
  }
]
```

Every observed NDJSON frame, exact raw bytes rendered as UTF-8 (final newline belongs to transport):

```json
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.358964506Z","message":{"role":"assistant","content":"read"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.418111925Z","message":{"role":"assistant","content":"_"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.474938708Z","message":{"role":"assistant","content":"file"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.530930356Z","message":{"role":"assistant","content":"[ARGS]"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.586992043Z","message":{"role":"assistant","content":"{\""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.641624522Z","message":{"role":"assistant","content":"path"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.696976149Z","message":{"role":"assistant","content":"\":"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.75188214Z","message":{"role":"assistant","content":" \""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.808275115Z","message":{"role":"assistant","content":"native"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.863410834Z","message":{"role":"assistant","content":"-tool"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.91913671Z","message":{"role":"assistant","content":"-pro"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:19.975148728Z","message":{"role":"assistant","content":"of"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:20.030325033Z","message":{"role":"assistant","content":".txt"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:20.08580225Z","message":{"role":"assistant","content":"\"}"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:20.141849985Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":4893083711,"load_duration":3767967627,"prompt_eval_count":435,"prompt_eval_cached_count":0,"prompt_eval_duration":339849000,"eval_count":15,"eval_duration":782771000}
```

Complete mapped ModelStreamChunk sequence and original host-relative observation times:

```json
[
  {
    "atMs": 14259.688830000001,
    "chunk": {
      "contentDelta": "read"
    }
  },
  {
    "atMs": 14318.164130000001,
    "chunk": {
      "contentDelta": "_"
    }
  },
  {
    "atMs": 14374.932132,
    "chunk": {
      "contentDelta": "file"
    }
  },
  {
    "atMs": 14431.001898,
    "chunk": {
      "contentDelta": "[ARGS]"
    }
  },
  {
    "atMs": 14486.972204,
    "chunk": {
      "contentDelta": "{\""
    }
  },
  {
    "atMs": 14541.61211,
    "chunk": {
      "contentDelta": "path"
    }
  },
  {
    "atMs": 14597.025391000001,
    "chunk": {
      "contentDelta": "\":"
    }
  },
  {
    "atMs": 14651.896501000001,
    "chunk": {
      "contentDelta": " \""
    }
  },
  {
    "atMs": 14708.195316000001,
    "chunk": {
      "contentDelta": "native"
    }
  },
  {
    "atMs": 14763.333395,
    "chunk": {
      "contentDelta": "-tool"
    }
  },
  {
    "atMs": 14819.225286,
    "chunk": {
      "contentDelta": "-pro"
    }
  },
  {
    "atMs": 14875.185544,
    "chunk": {
      "contentDelta": "of"
    }
  },
  {
    "atMs": 14930.228341,
    "chunk": {
      "contentDelta": ".txt"
    }
  },
  {
    "atMs": 14985.814399,
    "chunk": {
      "contentDelta": "\"}"
    }
  },
  {
    "atMs": 15041.684863,
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

### D2 — native

- Request: **1049 UTF-8 bytes**, SHA-256 `fdfe426ee6b06e720d193eda10a5ef98cda527f6b97dfe38b6e6923d95ded1b7`; exact submitted body equals its frozen and historical D bytes above.
- HTTP **200**, status `native-emission-stop`; **5202.778763999999 ms** host duration. Native count **1 raw / 1 mapped**.
- Raw transport: **1 chunks**, **1 NDJSON frames**, **256 bytes**; mapped **1 ModelStreamChunks**. Artifact `/tmp/phase197-provider-D2.ndjson`, SHA-256 `4bad3943a01b7c2edac121e4115c1c8d97e41c3416669b74365709c8ed66755b`. All received bytes/frames are retained; no malformed frame or provider error; no deadline fired.
- Exact ordinary assistant content: `""`. Raw and mapped content agree.
- Actual exact native name `read_file`, arguments `{"path":"native-tool-proof.txt"}`; expected name/arguments match. Provider ID `call_rsrqnogz` and index **0** preserved in raw evidence; normal mapper returns name/arguments. No harness normalization/repair.
- Intentional immediate first-native abort/break; cancellation `AbortError` with message `Frozen diagnostic stops on native emission.` is expected control flow, not a provider failure. No terminal frame or prompt/output counters naturally received; **unavailable**, never reconstructed or fetched later.

Exact raw native field:

```json
[{"id":"call_rsrqnogz","function":{"index":0,"name":"read_file","arguments":{"path":"native-tool-proof.txt"}}}]
```

Exact mapped native call:

```json
[{"name":"read_file","arguments":{"path":"native-tool-proof.txt"}}]
```

Every raw transport chunk, exact bytes as base64 with original byte count and host-relative arrival time:

```json
[
  {
    "atMs": 20267.793691,
    "bytes": 256,
    "base64": "eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDEwOjMxOjI1LjM2NzM5MDU1NloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIiwidG9vbF9jYWxscyI6W3siaWQiOiJjYWxsX3JzcnFub2d6IiwiZnVuY3Rpb24iOnsiaW5kZXgiOjAsIm5hbWUiOiJyZWFkX2ZpbGUiLCJhcmd1bWVudHMiOnsicGF0aCI6Im5hdGl2ZS10b29sLXByb29mLnR4dCJ9fX1dfSwiZG9uZSI6ZmFsc2V9Cg=="
  }
]
```

Every observed NDJSON frame, exact raw bytes rendered as UTF-8 (final newline belongs to transport):

```json
{"model":"ministral-3:14b","created_at":"2026-10-14T10:31:25.367390556Z","message":{"role":"assistant","content":"","tool_calls":[{"id":"call_rsrqnogz","function":{"index":0,"name":"read_file","arguments":{"path":"native-tool-proof.txt"}}}]},"done":false}
```

Complete mapped ModelStreamChunk sequence and original host-relative observation times:

```json
[
  {
    "atMs": 20268.659682,
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

### Evidence preservation

Complete `/tmp/phase197-live-evidence.json`, SHA-256 `c0fb451268acc21236087a780ae5830315678c79db64100cc25c50f8d19929ee`, contains submitted bodies, transport headers/chunks, exact raw lines and parsed frames, mapped sequence, raw/mapped native fields, naturally received terminal metadata, stop/cancellation details, timing, identity checks, ledger, execution counters and fixture integrity. Ledger SHA-256 `c7a491c5323aa76e3ef59ce5ff803b8b2c6194e9886ad9cdf0cf978552cfa1cf`; permanent launch-lock SHA-256 `6514eb2bca335314955d870114c5f6e7c86356f6e91aa773596dc9d55e70677b`. Evidence/raw/ledger/lock/log files made read-only after harness completion; frozen helpers remain unchanged. Full raw chunk/frame/mapped evidence is also embedded above for durable audit after `/tmp` cleanup.

Offline replay through the unchanged production adapter/parser reproduced **all 32 mapped chunks**, including both exact native calls and both exact pseudo-call strings, from the original 32 saved byte chunks. **Zero live inference**. `/tmp/phase197-replay.ts` and `/tmp/phase197-replay-review.json`. No textual-to-tool recovery or argument repair.

## Product decision

**Outcome A — production system degradation is actionable.** The predeclared authoritative new pattern is **D1 native, C1 non-native, C2 non-native, D2 native**, with **zero provider failures**. Every Outcome A condition holds. C1/C2 are specifically textual pseudo-calls; neither contains native fields.

**Answer to the product question: yes, the current production system showed a repeatable native-tool adherence disadvantage against the no-application-system baseline in this bounded comparison.** The exact D baseline reproduced native emission twice; the exact current C system reproduced non-native behavior twice, under identical remaining request conditions and unchanged identities. This is an actionable separation under the predeclared engineering rule and justifies one coherent production prompt revision. Historical Phase 19.3 D-native/C-pseudo-call supports the prior association; the four new observations are authoritative.

Phase 19.6's stochastic-adherence conclusion remains valid historical evidence. This final comparison neither identifies a defective sentence nor establishes deterministic model behavior, statistical significance, universal prompt behavior or a reliability percentage. The runtime/native serialization/parser/execution pipeline remains mechanically correct; no application parsing/execution defect is inferred. Only native emission was measured; no requested read/task completion or revised-prompt acceptance was tested.

**Project action: create Phase 19.8 implementation/acceptance.** This is the sole allowed next phase. Phase 19.7 makes no prompt revision and creates no Phase 19.8 file or implementation; those belong to that separately scoped successor.

Phase 19.8 must make **one coherent production-system revision**, retain required safety/verification semantics, preserve native-only tool authority, run deterministic regressions and **one bounded acceptance qualification**, then **accept the revision or revert/close**. No textual-call parser hack, extra diagnostic bisection or acceptance replication branch.

**Hard stop enforced:** Phase 19.7 diagnostics are complete and its live budget is permanently closed. No further clause/tool-description/schema/template-token/order isolation, Phase 19.7.x, extra replication round or diagnostic Phase 19.8 branch. The adherence investigation is not yet marked closed because Outcome A allows the single implementation/acceptance successor; after that successor, accept or revert/close. Future capability/product-policy work requires a distinct major phase and product requirement.

| Item | Final value |
| --- | --- |
| candidate | ministral-3:14b |
| D historical body equality | yes |
| C historical body equality | yes |
| D1 == D2 | yes |
| C1 == C2 | yes |
| D1 native | yes |
| C1 native | no |
| C2 native | no |
| D2 native | yes |
| provider failures | 0 |
| total inference requests | 4 / maximum 4; permanently closed |
| retries | 0 |
| continuations | 0 |
| tool execution | 0 |
| textual fallback parser | no |
| decision outcome | A |
| Phase 19.8 allowed | yes; one implementation/acceptance only |
| adherence investigation closed | no; diagnostics stopped, sole implementation/acceptance successor allowed |
| production source changes | none |
| commit | none |

## Production impact

**Production impact: none.** Only new repository file: `docs/progress/phase-19.7-progress.md`. Existing untracked `docs/progress/phase-19.6-progress.md` preserved byte-for-byte. All 235 tracked files, 95 production TypeScript files, 33 historical progress records, `.env`, 92 prior artifacts and 30 frozen artifacts remain exact; no source/test/configuration/environment/preferences/model installation change, staging or commit.

Unchanged: config.ts/current system prompt, safety/verification guidance, tool descriptions/schemas, Ollama adapter/HTTP/parser, ContextBuilder, ProcessObservation, ToolRunner, LocalToolRegistry, model selection and run_process. No download, alternate model, sampler/seed/template option, provider-token decoder, regex recovery or JSON-from-content parser. Host-only pseudo-call shape classification is solely evidence labeling and provides zero execution authority.

Security invariant: textual `read_file[ARGS]{"path":"..."}` remains ordinary assistant content; only native provider `message.tool_calls` can propose execution. The diagnostic prepares/approves/executes neither native nor textual output. Application execution counters are all zero. Existing mechanical regressions pass; no runtime change is required by Phase 19.7.

## Final validation

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused deterministic pre-live | PASS: 108 tests, 0 fail, 1005 assertions, 5 files, 112 ms | `/tmp/phase197-baseline-focused.log` |
| Same focused scope post-live | PASS: 108 tests, 0 fail, 1005 assertions, 5 files, 192 ms | `/tmp/phase197-focused-final.log` |
| `bun run typecheck` | PASS, exit 0 | `/tmp/phase197-typecheck.log` |
| `bun run format:check` | PASS, exit 0; 183 files, no fixes | `/tmp/phase197-format.log` |
| Historical bodies / frozen repeats / current system/read_file | PASS: exact hash-verified document bytes, production serialization, C1==C2, D1==D2, C minus system equals D | audit/capture/frozen plan and final review |
| Offline production parser replay | PASS: all four saved original chunk sequences reproduce all 32 mapped chunks, zero inference | `/tmp/phase197-replay-review.json` |
| Provider/model/template identities | PASS: complete selected tag/show equal Phase 19.6 before freeze, at launch, before every dispatch and at close | provider identity/full live evidence |
| Four-slot cap/order / no execution / fixture | PASS: D1→C1→C2→D2, exactly 4/4, permanent lock/closed budget, zero retries/continuations/tools, fixture unchanged and removed | durable ledger/guard/live evidence |
| Raw/base64/frame/mapped/terminal evidence | PASS: all 32 received byte chunks, 32 frames and 32 mapped chunks embedded exactly; two actual native fields, two naturally received terminals, native-stop metrics correctly unavailable | `/tmp/phase197-final-review.py`, `/tmp/phase197-final-review.json` |
| Repository/history/environment/prior/frozen byte integrity | PASS: 235 tracked files, 95 production sources, 33 historical progress records, `.env`, 92 prior artifacts and 30 frozen artifacts exact | baseline manifest and final review |
| `git diff --check`, progress UTF-8/whitespace/final newline/local links and final status | PASS: no diagnostics; explicit new-file diff check exit 1 means expected added file, not whitespace error | final review |

Complete record reviewed, including recovered/frozen exact bodies, predeclared order and decision rule, durable ledger, all received raw bytes/base64/frames, complete mapped sequence, exact native arguments, naturally received metadata, intentional native-stop cancellation, Outcome A and its sole allowed successor. Final review independently verifies embedded evidence against preserved captures; no helper/source/test/input change followed live output.

Final tracked `git diff`, `git diff --stat` and index diff are **empty**. Exact final `git status --short --untracked-files=all`:

```text
?? docs/progress/phase-19.6-progress.md
?? docs/progress/phase-19.7-progress.md
```

Phase 19.6 was already untracked at baseline and remains byte-identical. Phase 19.7 is the sole new repository file. HEAD remains `c5797a4b9e69e0304386929e35a5c9c830b28de3`; no staging or commit. All requested Phase 19.7 completion criteria are satisfied. Project action remains **create Phase 19.8 implementation/acceptance**, with no further diagnostics and no production change in 19.7.

No full Linux/Windows/release/smoke build for this record-only diagnostic. Disposable syntax bundling is not release validation. Final status/validation-only document edits receive lightweight evidence/byte/whitespace/status rechecks without further inference or repeating passing source gates.
