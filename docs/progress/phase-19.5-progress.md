# Phase 19.5 — historical base-system binary clause isolation

## Status

Current status: **verified** — G/H each emitted only textual pseudo-call prose, no native calls; exactly two requests, zero execution, Outcome D. All required focused/type/format/document/evidence/byte-integrity checks pass. This verifies the bounded diagnostic, not reliable production adherence or completion of the requested read.

- [x] not started — this record was created before inference
- [x] audit complete
- [x] historical split verified
- [x] requests frozen
- [x] live qualification complete
- [x] verified
- [ ] inconclusive
- [ ] blocked

## Baseline

- Starting HEAD: `21bbe841178b58fb230eb9641c82ece61ee61a64`.
- Starting git status, tracked diff/stat and index diff: empty.
- Bun `1.4.3`; candidate `ministral-3:14b` only.
- Authoritative records read: [Phase 19.4](phase-19.4-progress.md), [Phase 19.3](phase-19.3-progress.md), [Phase 19.2](phase-19.2-progress.md), [Phase 19.1](phase-19.1-progress.md). They remain read-only.
- Baseline byte manifest: `/tmp/phase195-baseline-integrity.json`; all 234 tracked files, 95 production TypeScript files (excluding tests/test-support), 31 historical progress records and `.env` are protected. `git diff 216aa083af2a16fa8f6f2b1df595daa11fbca7a1 HEAD -- src` is empty: all source/test bytes also match the Phase 19.4 starting revision.
- No applicable ancestor/workspace `AGENTS.md`; no delegation or sub-agents.
- Read-only provider version/tags/show match Phase 19.4: Ollama `0.40.2`; candidate digest `129e04c05b562f6e6ea7ec07ef0b0a61ef1aeaedb91ac524e67a1672eba7bb36`; template 3414 bytes, SHA-256 `aa65b5aebf89e7dfb3aa05af9220299a7e1cebe3ab97daae3c2e259acbdf278c`; capabilities `["completion", "vision", "tools"]`; parameter metadata `temperature 0.15`.
- Earlier `/tmp/phase194-*` artifacts are absent in this environment. Exact E/F body bytes were extracted from the authoritative record and verified against their recorded SHA-256 values; no earlier condition is rerun or rescored. Current recorded metadata identities, including tag/details relevant to Phase 19.2, pass. No claim of comparison to unavailable complete historical show bytes is made.
- Frozen E: minimal explicit system → native `read_file`, arguments `{"path":"native-tool-proof.txt"}`, ordinary content empty. Body SHA-256 `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c`.
- Frozen F: full historical base → no native call; ordinary content `read_file[ARGS]{"path": "native-tool-proof.txt"}`. Body SHA-256 `8164f1dcd86584ee1490cfa451ec15f32f44a3a49838fb95c1f9aa5464274b10`.
- Frozen C/D remain unchanged historical observations. No production source, test, prompt, tool, parser, model-selection or provider changes are authorized. No commit.

### Production identities — verified before freezing

| Artifact | UTF-8 bytes | SHA-256 |
| --- | --- | --- |
| current production system | 1390 | `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc` |
| production read_file generic definition | 717 | `4050d9c7d7569c116d05311f513a51b19fd6cedb964471b0c8bcb9c2f776c9bc` |
| read_file schema | 499 | `db50a0d44325d0f927cdd580dc7886ff5292eecdb18516dc3957b2bfa456098c` |
| read_file wire function | 748 | `2ad18509a7682736490b03dda7f418a4ac69ffca73b491c390e53883b9aa3d22` |
| single wire tool array | 750 | `d7382d3f27a729c39fc26bf897fcb7322ed5e9f521760543dfcc400b350de8fd` |

Effective chat configuration equals Phase 19.4: isolated candidate selection only in the disposable harness; unchanged default system, base URL `http://localhost:11434`, context/output **16384/4096**, keep_alive **0**, `stream: true`, `truncate: false`, `shift: false`. Complete selected tag/show metadata are captured now and must match again at launch, before G/H and at close. Provider version/digest/template/capabilities/parameters, model family/size/quantization/context metadata match historical recorded identities. No activation/unload, embedding, memory or retrieval is invoked. No sampler, temperature, reasoning, template, format or tool-choice equivalent is sent.

## Historical split

Read-only `git show 97962a5d53c137b329a770f000bac108e61fa271:src/composition/config.ts` recovered the single unescaped historical SYSTEM_PROMPT literal. `/tmp/phase195-audit.py` extracted it programmatically and saved source and exact strings without newlines. No checkout or manual prompt reconstruction.

Historical source: 2224 bytes; git blob `c61901f0bda817f6ed3c3614d58e43bd06575e5d`; source SHA-256 `b89268177272f261a56b3e3ab8a1bdcd900dbd91c393f79205026ba99558c4fe`.

| String | UTF-8 bytes | SHA-256 |
| --- | --- | --- |
| historical full | 394 | `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597` |
| G, sentences 1–3 | 143 | `b173d1f5b44f38ea3392341476ec7e85d94e77c1119d45d363b0e7d20e125484` |
| H, sentences 4–6 | 250 | `eafdd504dde4124d6e048e688ea915c59839d2dc7dfc67130cdff582b112df53` |
| reconstructed G + ASCII space + H | 394 | `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597` |

Programmatic byte equality passes: `G.encode() + b' ' + H.encode() == historicalBytes`. Exact strings and split evidence: `/tmp/phase195-historical-split.json`; their full text is retained below.

### Exact recovered full string

```text
Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly. Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work.
```

### Exact G string — sentences 1–3

```text
Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly.
```

### Exact H string — sentences 4–6

```text
Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work.
```

Fence newlines are presentation only; each saved string is one message without a newline, label, prefix, suffix or normalized spacing. Split byte offset **143**, separator hex **20**; **143 + 1 + 250 = 394**. Both Python recovery and the Bun capture independently re-extract the authoritative source and assert exact byte reconstruction before use. The full string also equals the cryptographically verified Phase 19.4 F wire-system content.

## Frozen requests

Freeze timestamp: `2026-10-14T09:30:03.002199+00:00`. **Zero real inference**; two mocked request serializations through unchanged production `OllamaModelAdapter` → `OllamaHttpClient`. Both complete bodies were saved before inference.

| Condition | Body UTF-8 bytes | SHA-256 |
| --- | --- | --- |
| G | 1223 | `ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e` |
| H | 1330 | `d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3` |

Machine-generated structural diff, identical for wire bodies and ModelPort inputs:

```json
[{"op":"replace","path":"/messages/0/content","oldValue":"Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly.","value":"Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work."}]
```

Replacing only `/messages/0/content` in G yields H byte-for-byte. Each G/H body equals both frozen Phase 19.4 E/F bodies after replacing only their system content. User equality, exact read_file equality, non-message provider-option equality and input-profile equality pass; top-level key order is `model`, `messages`, `keep_alive`, `tools`, `stream`, `options`, `truncate`, `shift`. Exactly one tool is exposed. No `format`, `tool_choice`, `function_call`, `required_tools`, temperature/sampler/reasoning/template override.

Shared user (114 bytes, SHA-256 `5b1eee3bc7307290be03bfb0172cdfb3413cd5395b342c037c78c22b4cde5800`):

```text
Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess.
```

### Exact serialized G body

```json
{"model":"ministral-3:14b","messages":[{"role":"system","content":"Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly."},{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

### Exact serialized H body

```json
{"model":"ministral-3:14b","messages":[{"role":"system","content":"Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work."},{"role":"user","content":"Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess."}],"keep_alive":0,"tools":[{"type":"function","function":{"name":"read_file","description":"Read current UTF-8 text or a line range. Pass nextRead unchanged for lossless continuation; only nextRead means more remains. Line metadata may describe partial lines.","parameters":{"type":"object","properties":{"path":{"type":"string","minLength":1},"startLine":{"description":"One-based; default 1. Cannot accompany startOffset.","type":"integer","minimum":1,"maximum":9007199254740991},"startOffset":{"description":"Zero-based UTF-16 cursor.","type":"integer","minimum":0,"maximum":9007199254740991},"endLine":{"description":"Inclusive; excludes the following newline.","type":"integer","minimum":1,"maximum":9007199254740991}},"required":["path"],"additionalProperties":false}}}],"stream":true,"options":{"num_ctx":16384,"num_predict":4096},"truncate":false,"shift":false}
```

Both minified body files have no final newline. Their exact bytes, including the unmodified production definition, are presented above; fence newlines are not part of the requests. Disposable host-only `native-tool-proof.txt` contains `NATIVE_TOOL_PROOF_731942` without a newline. The value is asserted absent from both bodies, all system/user content and the tool definition. The host alone checks fixture integrity; no application tool reads it.

### Frozen harness and exclusive launch guard

Fixed order **G first, H second**; **60000 ms per request**, **130000 ms aggregate**, matching Phase 19.4. H runs regardless of G classification if the aggregate bound permits. No deadline extension, retry, third condition, continuation or result round.

At the first mapped native call, retain exact already-received bytes/raw native field and mapped name/arguments, abort and break immediately. `highWaterMark: 0` prevents diagnostic transport read-ahead. The unchanged production parser receives original byte chunks. There is no tool preparation, approval, execution or continuation path. Terminal metadata not naturally received at that stop remains **unavailable**; no extra read for metrics.

Frozen plan SHA-256 `f9001c58b990d3e09365bfe7c1433ab3d08a8553a4c3ba974c41c55aa0813a0b`; launch guard SHA-256 `7c11947402893e021b3809a7737a0de670eee7106cb71deb33acd95c89e36a93`. Plan/guard and all 25 artifacts are read-only. The permanent exclusive `/tmp/phase195-live-once.lock` prevents another launch, including after failure/interruption. `/tmp/phase195-inference-ledger.jsonl` is written and fsynced before every actual HTTP dispatch. The transport checks exact frozen bodies/order and hard maximum two before calling real fetch. All tracked/environment bytes and all frozen artifact hashes are checked before each dispatch and at close.

| Frozen artifact | SHA-256 |
| --- | --- |
| `/tmp/phase195-audit.py` | `5ebca48efefb68261e2dd2190a87c3e93c6cbedcedd5aa2fa9749e66678a3bd3` |
| `/tmp/phase195-common.ts` | `aeb96c74a9efcf56074247c6efc349e07d074f7973105bc665ff82bc6558347f` |
| `/tmp/phase195-capture.ts` | `8860098eac65f7a541a317ed6c8d1e9ab8e7cdf1220102baa27720c25d31a070` |
| `/tmp/phase195-live.ts` | `4c10da093eaa56af5423e15928fb84c235a0487c6ef63f08f14bfc3a03afaf73` |
| `/tmp/phase195-freeze.py` | `dc08db1e0df5d79cca043a5ae3cb5d3d8436490bc00f411cf7239bf2311b6169` |
| `/tmp/phase195-baseline-integrity.json` | `e29f7f6825c75f2a3530c79d7d05ac3464a8962819085f06bc09046770759100` |
| `/tmp/phase195-historical-config.ts` | `b89268177272f261a56b3e3ab8a1bdcd900dbd91c393f79205026ba99558c4fe` |
| `/tmp/phase195-historical-system.txt` | `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597` |
| `/tmp/phase195-historical-split.json` | `6db63faaa2823911d98375b7215dc3ff7b7d524ede0113a4fbed912cc89ab9cc` |
| `/tmp/phase195-system-G.txt` | `b173d1f5b44f38ea3392341476ec7e85d94e77c1119d45d363b0e7d20e125484` |
| `/tmp/phase195-system-H.txt` | `eafdd504dde4124d6e048e688ea915c59839d2dc7dfc67130cdff582b112df53` |
| `/tmp/phase195-reference-E-body.json` | `d4ccfcec046637eddfc75632c05fea8a147899590f21323c39110c797808fa9c` |
| `/tmp/phase195-reference-F-body.json` | `8164f1dcd86584ee1490cfa451ec15f32f44a3a49838fb95c1f9aa5464274b10` |
| `/tmp/phase195-provider-version.json` | `2657f6fff8018900025e47485e719c930017826b790e73ae28087cdcd93fe50e` |
| `/tmp/phase195-provider-tags.json` | `f50c00ab1a94e927b74e67610ac2cf4bc5d5cd19d411d48026996b7fed2afdd8` |
| `/tmp/phase195-provider-show.json` | `f4e2dbe14565594a406a48ea0edcc8a1b3c105ffcfaa401474e9025f5d61d2fb` |
| `/tmp/phase195-provider-identity.json` | `d60302b790458ebdc579a3f34a0c0f390e1a5d73e38fe233a2271bdd90b21706` |
| `/tmp/phase195-input-G.json` | `93f203b946933ddd7c87ea104d460ab16f9e5a61d84b53993d8f5c91123b3a07` |
| `/tmp/phase195-input-H.json` | `cab63a5904affe15d5b0d08cfc1f41060ada6727a6a16980444eb79da302961f` |
| `/tmp/phase195-request-G.json` | `ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e` |
| `/tmp/phase195-request-H.json` | `d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3` |
| `/tmp/phase195-capture-summary.json` | `d66a09dcdd1b050fd7c0a055a8046f635537727c8388e581b03b951fb46c179f` |
| `/tmp/phase195-baseline-focused.log` | `cb22418052b176b8318444694cf6de0e85e8fc6a709499c329adda870dcda843` |
| `/tmp/phase195-capture.log` | `8803b4e255db0ba7ca278ce75dedf74b2377b6d006034e1abf8cac626f600932` |
| `/tmp/phase195-syntax-check.log` | `3d04d82f136eef4fbb3f833ac2dae6ddd88f0213b60c029e747492bf3840f4b9` |

## Deterministic validation before inference

```text
bun test src/infrastructure/model/OllamaModelAdapter.test.ts src/infrastructure/model/InstructionSurface.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/application/use-cases/RunAgentTurnNativeTools.test.ts src/composition/config.test.ts
```

**108 pass / 0 fail / 1005 assertions / 5 files / 256 ms**, exit 0; `/tmp/phase195-baseline-focused.log`. This mocked-provider scope verifies native mapping, pseudo-call negative behavior, instruction/config identity and exact production tool surface. Disposable Python/Bun checks additionally verify historical recovery, six sentences/three-sentence halves, full byte reconstruction and request-only system-content difference. No generic regression gap; no repository test change. Syntax-only disposable Bun bundle passed; no release/build validation claim.

Read-only curl version/tags/show succeeded. Bun inside-sandbox localhost preflight returned `ECONNREFUSED`; the same read-only Bun version check with outside-sandbox transport returned HTTP 200 / `0.40.2`. Both were metadata only, **zero inference**. The reviewed frozen live harness requires that same localhost access. This is a transport boundary, not provider/model behavior, and no inference retry is involved.

## Live evidence

The reviewed frozen harness launched **once** with authorized outside-sandbox localhost transport:

```text
bun /tmp/phase195-live.ts > /tmp/phase195-live.log 2>&1
```

Started `2026-10-14T09:31:50.422Z`, finished `2026-10-14T09:32:19.317Z`; aggregate host duration **28895.421977 ms**, within 130000 ms. Harness exit 0 denotes completion of the diagnostic, not success of the file-read task. **Exactly two provider inference requests: one G followed by one H. Budget permanently closed.** Read-only GET/version/tags and POST/show are metadata, not inference. No previous-phase condition, activation/unload, embedding or optional-memory inference.

Launch, before-G, before-H and post-live metadata equal the frozen selected tag and complete show response: version/model digest/template/capabilities/parameter identities remain unchanged. Both exact submitted bodies equal their pre-inference captures. Repository/environment and all frozen artifact bytes pass before each dispatch and at close. No adaptive request, prompt or harness change.

Disposable proof file: **24 bytes**, initial/final SHA-256 `12e44b4e02d60b29f6f3f1ab60015f9e6c1ad64bb2e1ff356aae77e82ce9c775`, content exactly `NATIVE_TOOL_PROOF_731942` without newline. The host checked integrity before/after; proof value absent from both requests and never returned to the model. Disposable workspace removed. Approvals **0**, ToolRunner calls **0**, tool executions **0**, application-tool filesystem reads **0**, mutations **0**, run_process **0**. The live harness invokes only production definition listing and adapter streaming.

### Scenario G — textual pseudo-call

- Classification **textual pseudo-call**; status `completed`; exactly **one** inference request; HTTP **200**.
- Submitted body SHA-256 `ca10699f24674d5dda5b32980cd34a439ef15f38de1f09ee3ef0ec1649dcbf1e`, exact equality to frozen body.
- Host request duration **23936.653383 ms**, below 60000 ms.
- Raw transport **15 chunks / 15 NDJSON frames / 2223 bytes**; mapped **15 chunks**.
- Native calls **0 raw / 0 mapped**; every raw frame lacks `message.tool_calls`. No malformed frame, transport/parser error, incomplete stream or timeout.
- Raw artifact `/tmp/phase195-provider-G.ndjson`, SHA-256 `e44c347d83450f6ebf059cf329b12a6a92a53536f1ef449ab8c9ecfda4475ace`.
- Exact ordinary content: `"read_file[ARGS]{\"path\": \"native-tool-proof.txt\"}"`. Raw and concatenated mapped content agree exactly.

Complete pseudo-call prose:

```text
read_file[ARGS]{"path": "native-tool-proof.txt"}
```

Native function name and structured arguments: **none**. The JSON-looking text has **zero execution authority**; it cannot prepare, request approval or execute a tool. Only structured provider `message.tool_calls` can propose application execution, and this phase executes neither channel. The unchanged parser yields fourteen ordinary content deltas and one terminal stop/usage chunk; no native field was lost.

#### Exact raw transport chunks

Each base64 entry preserves original bytes returned by the real fetch reader and forwarded unchanged into the production parser. Timing is milliseconds from harness start. Decoded concatenation equals the raw NDJSON artifact; zero diagnostic read-ahead.

| Chunk | At ms | Bytes | Base64 |
| --- | --- | --- | --- |
| 1 | 21522.470583 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjExLjk0MTQ4NDQ4N1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicmVhZCJ9LCJkb25lIjpmYWxzZX0K` |
| 2 | 23240.663841999998 | 132 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjEzLjY2MjUzNzExOVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXyJ9LCJkb25lIjpmYWxzZX0K` |
| 3 | 23296.607068999998 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjEzLjcxODU0OTIxNloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiZmlsZSJ9LCJkb25lIjpmYWxzZX0K` |
| 4 | 23352.382943999997 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjEzLjc3NDM0NTE3NFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiW0FSR1NdIn0sImRvbmUiOmZhbHNlfQo=` |
| 5 | 23407.314472 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjEzLjgyOTI2NzU3MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoie1wiIn0sImRvbmUiOmZhbHNlfQo=` |
| 6 | 23461.799861 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjEzLjg4Mzc1MzMwNVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicGF0aCJ9LCJkb25lIjpmYWxzZX0K` |
| 7 | 23518.347198 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjEzLjk0MDMwMTY4NVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCI6In0sImRvbmUiOmZhbHNlfQo=` |
| 8 | 23573.064327 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjEzLjk5NTAxMjA5OFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIFwiIn0sImRvbmUiOmZhbHNlfQo=` |
| 9 | 23627.312244999997 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE0LjA0OTI3MDg2NFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoibmF0aXZlIn0sImRvbmUiOmZhbHNlfQo=` |
| 10 | 23683.343466 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE0LjEwNTMwMzQzWiIsIm1lc3NhZ2UiOnsicm9sZSI6ImFzc2lzdGFudCIsImNvbnRlbnQiOiItdG9vbCJ9LCJkb25lIjpmYWxzZX0K` |
| 11 | 23747.188249 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE0LjE2OTE0MzgyOVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXBybyJ9LCJkb25lIjpmYWxzZX0K` |
| 12 | 23801.671916 | 133 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE0LjIyMzYxNTAxNFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoib2YifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 13 | 23857.162684 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE0LjI3OTEwMjYwNVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLnR4dCJ9LCJkb25lIjpmYWxzZX0K` |
| 14 | 23911.576359 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE0LjMzMzUyMzcyNloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCJ9In0sImRvbmUiOmZhbHNlfQo=` |
| 15 | 23966.121879 | 338 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE0LjM4ODA4MTAyOFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIn0sImRvbmUiOnRydWUsImRvbmVfcmVhc29uIjoic3RvcCIsInRvdGFsX2R1cmF0aW9uIjoyMzkyNTE1ODU4NiwibG9hZF9kdXJhdGlvbiI6MzY4MTEzMTAyNCwicHJvbXB0X2V2YWxfY291bnQiOjE5OCwicHJvbXB0X2V2YWxfY2FjaGVkX2NvdW50IjowLCJwcm9tcHRfZXZhbF9kdXJhdGlvbiI6MTc3OTMyMzMwMDAsImV2YWxfY291bnQiOjE1LCJldmFsX2R1cmF0aW9uIjoyNDQ2NTUwMDAwfQo=` |

#### Every received NDJSON frame — exact raw UTF-8

```jsonl
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:11.941484487Z","message":{"role":"assistant","content":"read"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:13.662537119Z","message":{"role":"assistant","content":"_"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:13.718549216Z","message":{"role":"assistant","content":"file"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:13.774345174Z","message":{"role":"assistant","content":"[ARGS]"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:13.829267572Z","message":{"role":"assistant","content":"{\""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:13.883753305Z","message":{"role":"assistant","content":"path"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:13.940301685Z","message":{"role":"assistant","content":"\":"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:13.995012098Z","message":{"role":"assistant","content":" \""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:14.049270864Z","message":{"role":"assistant","content":"native"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:14.10530343Z","message":{"role":"assistant","content":"-tool"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:14.169143829Z","message":{"role":"assistant","content":"-pro"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:14.223615014Z","message":{"role":"assistant","content":"of"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:14.279102605Z","message":{"role":"assistant","content":".txt"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:14.333523726Z","message":{"role":"assistant","content":"\"}"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:14.388081028Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":23925158586,"load_duration":3681131024,"prompt_eval_count":198,"prompt_eval_cached_count":0,"prompt_eval_duration":17793233000,"eval_count":15,"eval_duration":2446550000}
```

The raw file includes its actual final newline. No provider frame was manufactured or repaired.

#### Exact mapped ModelStreamChunk sequence

`chunk` is unchanged production parser output; `atMs` records host observation timing.

```json
[
  {
    "atMs": 21522.998102999998,
    "chunk": {
      "contentDelta": "read"
    }
  },
  {
    "atMs": 23241.074026,
    "chunk": {
      "contentDelta": "_"
    }
  },
  {
    "atMs": 23296.928956,
    "chunk": {
      "contentDelta": "file"
    }
  },
  {
    "atMs": 23352.656103999998,
    "chunk": {
      "contentDelta": "[ARGS]"
    }
  },
  {
    "atMs": 23407.703274,
    "chunk": {
      "contentDelta": "{\""
    }
  },
  {
    "atMs": 23462.162913,
    "chunk": {
      "contentDelta": "path"
    }
  },
  {
    "atMs": 23518.691905,
    "chunk": {
      "contentDelta": "\":"
    }
  },
  {
    "atMs": 23573.390019,
    "chunk": {
      "contentDelta": " \""
    }
  },
  {
    "atMs": 23627.646052,
    "chunk": {
      "contentDelta": "native"
    }
  },
  {
    "atMs": 23683.673061999998,
    "chunk": {
      "contentDelta": "-tool"
    }
  },
  {
    "atMs": 23747.478316999997,
    "chunk": {
      "contentDelta": "-pro"
    }
  },
  {
    "atMs": 23802.04425,
    "chunk": {
      "contentDelta": "of"
    }
  },
  {
    "atMs": 23857.517390999998,
    "chunk": {
      "contentDelta": ".txt"
    }
  },
  {
    "atMs": 23911.929764999997,
    "chunk": {
      "contentDelta": "\"}"
    }
  },
  {
    "atMs": 23966.450885,
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

#### Naturally observed terminal metadata and counters

Clean `done: true`, `done_reason: "stop"`; **198 prompt tokens / 15 output tokens**, **0 cached prompt tokens**. Complete naturally received terminal frame:

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-14T09:32:14.388081028Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 23925158586,
  "load_duration": 3681131024,
  "prompt_eval_count": 198,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 17793233000,
  "eval_count": 15,
  "eval_duration": 2446550000
}
```

No native-stop truncation occurred for this condition; both terminal metadata and mapped usage were naturally observed. Provider duration fields are nanoseconds; host wall-clock durations above are milliseconds. No extra read/request for metrics.

### Scenario H — textual pseudo-call

- Classification **textual pseudo-call**; status `completed`; exactly **one** inference request; HTTP **200**.
- Submitted body SHA-256 `d4074898b0fdbbb5efc0c1cf5d7ae67a86bc7afa2991d57a160a6c4d1595d5a3`, exact equality to frozen body.
- Host request duration **4882.610412 ms**, below 60000 ms.
- Raw transport **15 chunks / 15 NDJSON frames / 2220 bytes**; mapped **15 chunks**.
- Native calls **0 raw / 0 mapped**; every raw frame lacks `message.tool_calls`. No malformed frame, transport/parser error, incomplete stream or timeout.
- Raw artifact `/tmp/phase195-provider-H.ndjson`, SHA-256 `e9a56018c2500b5b7778e3405ffaa8e73c11acb1c559f4dd52403969e4b12ee5`.
- Exact ordinary content: `"read_file[ARGS]{\"path\": \"native-tool-proof.txt\"}"`. Raw and concatenated mapped content agree exactly.

Complete pseudo-call prose:

```text
read_file[ARGS]{"path": "native-tool-proof.txt"}
```

Native function name and structured arguments: **none**. The JSON-looking text has **zero execution authority**; it cannot prepare, request approval or execute a tool. Only structured provider `message.tool_calls` can propose application execution, and this phase executes neither channel. The unchanged parser yields fourteen ordinary content deltas and one terminal stop/usage chunk; no native field was lost.

#### Exact raw transport chunks

Each base64 entry preserves original bytes returned by the real fetch reader and forwarded unchanged into the production parser. Timing is milliseconds from harness start. Decoded concatenation equals the raw NDJSON artifact; zero diagnostic read-ahead.

| Chunk | At ms | Bytes | Base64 |
| --- | --- | --- | --- |
| 1 | 28095.817737999998 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE4LjUxNzA2MDk4NFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicmVhZCJ9LCJkb25lIjpmYWxzZX0K` |
| 2 | 28153.315809 | 132 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE4LjU3NTI3MDMxNVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXyJ9LCJkb25lIjpmYWxzZX0K` |
| 3 | 28209.664635999998 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE4LjYzMTU5MjQ0MVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiZmlsZSJ9LCJkb25lIjpmYWxzZX0K` |
| 4 | 28265.513205 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE4LjY4NzQ2NDAzNFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiW0FSR1NdIn0sImRvbmUiOmZhbHNlfQo=` |
| 5 | 28321.239170999997 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE4Ljc0MzE5MTY3NFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoie1wiIn0sImRvbmUiOmZhbHNlfQo=` |
| 6 | 28375.863543 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE4Ljc5NzgxNzY2MVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoicGF0aCJ9LCJkb25lIjpmYWxzZX0K` |
| 7 | 28430.123168 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE4Ljg1MjA3NTE0OVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCI6In0sImRvbmUiOmZhbHNlfQo=` |
| 8 | 28485.650191999997 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE4LjkwNzYwNTMyNFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIFwiIn0sImRvbmUiOmZhbHNlfQo=` |
| 9 | 28539.933929 | 137 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE4Ljk2MTg5MTk3MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoibmF0aXZlIn0sImRvbmUiOmZhbHNlfQo=` |
| 10 | 28594.254488 | 136 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE5LjAxNjIwNTgzN1oiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXRvb2wifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 11 | 28650.416536999997 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE5LjA3MjM3MDMzOFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLXBybyJ9LCJkb25lIjpmYWxzZX0K` |
| 12 | 28705.071794 | 133 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE5LjEyNzAyNzUwOVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50Ijoib2YifSwiZG9uZSI6ZmFsc2V9Cg==` |
| 13 | 28761.933645999998 | 135 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE5LjE4Mzg0MzYwOFoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiLnR4dCJ9LCJkb25lIjpmYWxzZX0K` |
| 14 | 28817.581075 | 134 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE5LjIzOTUzNjQ5NVoiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiXCJ9In0sImRvbmUiOmZhbHNlfQo=` |
| 15 | 28871.908992999997 | 334 | `eyJtb2RlbCI6Im1pbmlzdHJhbC0zOjE0YiIsImNyZWF0ZWRfYXQiOiIyMDI2LTEwLTE0VDA5OjMyOjE5LjI5Mzg2ODM3MloiLCJtZXNzYWdlIjp7InJvbGUiOiJhc3Npc3RhbnQiLCJjb250ZW50IjoiIn0sImRvbmUiOnRydWUsImRvbmVfcmVhc29uIjoic3RvcCIsInRvdGFsX2R1cmF0aW9uIjo0ODcwMzg1NTI2LCJsb2FkX2R1cmF0aW9uIjozODM3NzM1NzE3LCJwcm9tcHRfZXZhbF9jb3VudCI6MjE4LCJwcm9tcHRfZXZhbF9jYWNoZWRfY291bnQiOjAsInByb21wdF9ldmFsX2R1cmF0aW9uIjoyNTM5NDMwMDAsImV2YWxfY291bnQiOjE1LCJldmFsX2R1cmF0aW9uIjo3NzY2OTYwMDB9Cg==` |

#### Every received NDJSON frame — exact raw UTF-8

```jsonl
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:18.517060984Z","message":{"role":"assistant","content":"read"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:18.575270315Z","message":{"role":"assistant","content":"_"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:18.631592441Z","message":{"role":"assistant","content":"file"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:18.687464034Z","message":{"role":"assistant","content":"[ARGS]"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:18.743191674Z","message":{"role":"assistant","content":"{\""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:18.797817661Z","message":{"role":"assistant","content":"path"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:18.852075149Z","message":{"role":"assistant","content":"\":"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:18.907605324Z","message":{"role":"assistant","content":" \""},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:18.961891972Z","message":{"role":"assistant","content":"native"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:19.016205837Z","message":{"role":"assistant","content":"-tool"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:19.072370338Z","message":{"role":"assistant","content":"-pro"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:19.127027509Z","message":{"role":"assistant","content":"of"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:19.183843608Z","message":{"role":"assistant","content":".txt"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:19.239536495Z","message":{"role":"assistant","content":"\"}"},"done":false}
{"model":"ministral-3:14b","created_at":"2026-10-14T09:32:19.293868372Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":4870385526,"load_duration":3837735717,"prompt_eval_count":218,"prompt_eval_cached_count":0,"prompt_eval_duration":253943000,"eval_count":15,"eval_duration":776696000}
```

The raw file includes its actual final newline. No provider frame was manufactured or repaired.

#### Exact mapped ModelStreamChunk sequence

`chunk` is unchanged production parser output; `atMs` records host observation timing.

```json
[
  {
    "atMs": 28096.483516,
    "chunk": {
      "contentDelta": "read"
    }
  },
  {
    "atMs": 28153.899697999997,
    "chunk": {
      "contentDelta": "_"
    }
  },
  {
    "atMs": 28210.245910999998,
    "chunk": {
      "contentDelta": "file"
    }
  },
  {
    "atMs": 28266.081147999997,
    "chunk": {
      "contentDelta": "[ARGS]"
    }
  },
  {
    "atMs": 28321.814124999997,
    "chunk": {
      "contentDelta": "{\""
    }
  },
  {
    "atMs": 28376.451579,
    "chunk": {
      "contentDelta": "path"
    }
  },
  {
    "atMs": 28430.728833999998,
    "chunk": {
      "contentDelta": "\":"
    }
  },
  {
    "atMs": 28486.224338,
    "chunk": {
      "contentDelta": " \""
    }
  },
  {
    "atMs": 28540.450779,
    "chunk": {
      "contentDelta": "native"
    }
  },
  {
    "atMs": 28594.833921999998,
    "chunk": {
      "contentDelta": "-tool"
    }
  },
  {
    "atMs": 28650.958511999997,
    "chunk": {
      "contentDelta": "-pro"
    }
  },
  {
    "atMs": 28705.643851,
    "chunk": {
      "contentDelta": "of"
    }
  },
  {
    "atMs": 28762.486408,
    "chunk": {
      "contentDelta": ".txt"
    }
  },
  {
    "atMs": 28818.211077,
    "chunk": {
      "contentDelta": "\"}"
    }
  },
  {
    "atMs": 28872.290821,
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

#### Naturally observed terminal metadata and counters

Clean `done: true`, `done_reason: "stop"`; **218 prompt tokens / 15 output tokens**, **0 cached prompt tokens**. Complete naturally received terminal frame:

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-14T09:32:19.293868372Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 4870385526,
  "load_duration": 3837735717,
  "prompt_eval_count": 218,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 253943000,
  "eval_count": 15,
  "eval_duration": 776696000
}
```

No native-stop truncation occurred for this condition; both terminal metadata and mapped usage were naturally observed. Provider duration fields are nanoseconds; host wall-clock durations above are milliseconds. No extra read/request for metrics.

### Closed inference ledger

| Request | Frozen condition | Native channel | Ordinary content | End |
| --- | --- | --- | --- | --- |
| 1 | G: historical first half + exact read_file | none | `read_file[ARGS]{"path": "native-tool-proof.txt"}` | clean stop; no execution |
| 2 | H: historical second half + exact read_file | none | `read_file[ARGS]{"path": "native-tool-proof.txt"}` | clean stop; no execution |

Total **2 / maximum 2**, fixed G then H, exactly one each. Retries **0**, continuations **0**, post-tool rounds **0**, extra conditions **0**, alternate models **0**, downloads **0**; prompt variants **only frozen G/H**. E/F and C/D are reused historical observations, never rerun or rescored. Durable pre-dispatch ledger and exclusive launch marker remain; the inference budget cannot be reopened.

Complete evidence `/tmp/phase195-live-evidence.json`, SHA-256 `3abb53ab8d6a6c232437018cef9a14d72e897c156a74454838f92fc314c0d58f`; trace `/tmp/phase195-live.log`; exclusive permanent marker `/tmp/phase195-live-once.lock`; fsynced ledger `/tmp/phase195-inference-ledger.jsonl`. Exact bodies/raw byte chunks/every frame/native fields/mapped sequence/timing/counters are retained in this record and artifacts. Historical observations remain in their unchanged authoritative records.

## Interpretation

**Pattern 4 — G non-native, H non-native. Outcome D — multiple base groups / stochastic adherence remain plausible.**

Both exact historical halves independently reproduced textual pseudo-call behavior under this bounded observation, while frozen minimal explicit E emitted native read_file and full historical F was non-native. More than one clause group may independently destabilize adherence, or stochastic variation may be significant. This result associates non-native behavior with both groups in these samples; it does not concentrate the failure in one half, identify an individual sentence, or demonstrate that only the combined prompt can reproduce failure.

G and H are each **one bounded sample**; E/F remain single frozen historical observations. No deterministic model bug, universally failing sentence, reliable production adherence or eventual task correctness is claimed. No repair, parser fallback or production tuning follows emission-only evidence.

**Exactly one next direction: bounded replication.** It is selected only; not implemented or run. No further inference in this phase.

### Final comparison

| Scenario | System content | Native call | Ordinary content | Meaning |
| --- | --- | --- | --- | --- |
| 19.4 E | minimal explicit | frozen: yes, read_file | frozen: empty | historical native emission |
| 19.4 F | full historical base | frozen: no | frozen: `read_file[ARGS]{"path": "native-tool-proof.txt"}` | historical non-native behavior |
| 19.5 G | sentences 1–3 | measured: no | measured: `read_file[ARGS]{"path": "native-tool-proof.txt"}` | new first-half non-native observation |
| 19.5 H | sentences 4–6 | measured: no | measured: `read_file[ARGS]{"path": "native-tool-proof.txt"}` | new second-half non-native observation |

## Production impact

**Production impact: none.** Sole repository change: `docs/progress/phase-19.5-progress.md`. All 234 baseline tracked files, 95 production TypeScript files, 31 historical progress records and `.env` remain byte-identical. No source/test/durable architecture change; no new provider-neutral invariant requiring durable documentation.

Current 1390-byte system and verification/repair guidance, config.ts, ContextBuilder, ProcessObservation, read_file description/schema, Ollama adapter/HTTP/parser, ToolRunner, LocalToolRegistry, run_process and model selection remain unchanged. Provider template/Modelfile/model files/stop tokens/parameters are untouched. No model-specific branch, format/tool-choice equivalent, textual fallback parser, download, installation, staging or commit. Host fixture setup/removal and temporary evidence artifacts are outside the repository and are not application mutations.

Protected contracts remain authoritative: Phase 19.4 E/F; Phase 19.3 C/D; Phase 19.2 native parser/security; Phase 19.1 verification/repair; Phase 19 direct argv/process bounds; Phase 18.1 preparation/recovery/approval; Phase 18.7 memory policy; Phase 17 retrieval; Phase 16 profile; Phase 15.5 model selection. No prior phase observation is rescaled, rescored or replaced.

## Final validation

| Gate | Result | Evidence |
| --- | --- | --- |
| Pre-live focused native/adapter/pseudo-call/instruction/tools/config | PASS: 108 tests / 0 fail / 1005 assertions / 5 files / 256 ms | `/tmp/phase195-baseline-focused.log` |
| Same focused scope after live | PASS: 108 tests / 0 fail / 1005 assertions / 5 files / 218 ms | `/tmp/phase195-focused-final.log` |
| `bun run typecheck` | PASS, exit 0 | `/tmp/phase195-typecheck.log` |
| `bun run format:check` | PASS, exit 0; 183 files, no fixes | `/tmp/phase195-format.log` |
| `git diff --check` | PASS, no diagnostics | direct check; final review repeats |
| Historical recovery/split/reconstruction and exact request difference | PASS, pre-live Python/Bun assertions | historical-split and capture-summary artifacts |
| Launch/before-G/before-H/post-live environment and frozen bytes | PASS, no drift | live evidence |
| Final embedded evidence/UTF-8/newline/whitespace/local links | PASS: exact bodies, all 30 raw/base64 frames and all 30 mapped chunks; explicit document checks | `/tmp/phase195-final-review.py`, `/tmp/phase195-final-review.json` |
| Repository/environment/history/frozen-artifact byte integrity | PASS: 234 tracked files, 95 production sources, 31 historical records, `.env` and 25 frozen artifacts exact | final review and baseline/frozen manifests |
| Closed inference budget/fixture/launch guard/HEAD/index/status | PASS: one G + one H; 2/2 requests; zero execution/retry/continuation; fixture removed; permanent guard retained; no staging/commit | live evidence, durable ledger and final review |

No full release/Linux/Windows/smoke build was run for this progress-record-only diagnostic. The disposable syntax bundle is not a production release gate. Only this record changed after passing post-live focused/type/format checks; final document/evidence updates receive explicit lightweight review.

Complete record reviewed: exact source-derived strings, request bodies and single-field diff, all raw transport base64 chunks, every received NDJSON frame, mapped sequence, naturally observed terminal/usage metadata, closed ledger, frozen hashes and final repository state. Final review checks embedded evidence against the captures, verifies raw and mapped ordinary content/native-field absence, and proves the fixture was removed and the one-shot guard retained. No frozen harness/input/source/test changes followed output.

Final tracked `git diff` / `git diff --stat`: **empty**, because the sole change is the new unstaged record. Explicit new-file diff-stat reports one added progress record. Exact `git status --short --untracked-files=all`:

```text
?? docs/progress/phase-19.5-progress.md
```

HEAD remains `21bbe841178b58fb230eb9641c82ece61ee61a64`; index diff empty; no commit or staging. `git diff --check` and explicit `git diff --no-index --check /dev/null docs/progress/phase-19.5-progress.md` have no whitespace diagnostics (exit 1 for the latter denotes the expected new-file difference). UTF-8, final newline, trailing-whitespace and local-link checks pass. All baseline tracked source/history/environment bytes and frozen artifacts remain exact after the final status-only documentation update.

## Final summary

| Item | Final value |
| --- | --- |
| candidate | `ministral-3:14b` |
| provider/model drift | no; version/digest/template/capabilities/parameters/read_file/system unchanged |
| historical full bytes | 394 |
| historical full hash | `96dcf486d7c0644c2e9a3032796195b3425eed69230684e3afdb1863cb689597` |
| G bytes/hash | 143 / `b173d1f5b44f38ea3392341476ec7e85d94e77c1119d45d363b0e7d20e125484` |
| H bytes/hash | 250 / `eafdd504dde4124d6e048e688ea915c59839d2dc7dfc67130cdff582b112df53` |
| reconstruction exact | yes; G + one ASCII space + H equals full source bytes |
| G native call | no; 0 raw / 0 mapped |
| H native call | no; 0 raw / 0 mapped |
| G pseudo-call | `read_file[ARGS]{"path": "native-tool-proof.txt"}`; ordinary non-executable text |
| H pseudo-call | `read_file[ARGS]{"path": "native-tool-proof.txt"}`; ordinary non-executable text |
| total inference requests | exactly 2 / maximum 2; one G then one H; closed |
| retries | 0 |
| continuations | 0 |
| tool execution | 0; approvals/ToolRunner/application-tool reads/mutations/run_process also 0 |
| prompt variants | only frozen G/H |
| alternate models | 0 |
| downloads | 0 |
| textual fallback parser | no |
| root-cause outcome | **D — multiple base groups / stochastic adherence remain plausible** |
| next direction | **bounded replication**; not implemented |
| production source changes | none |
| current system changes | none |
| model-selection changes | none |
| commit | none |
