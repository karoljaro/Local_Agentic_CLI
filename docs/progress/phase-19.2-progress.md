# Phase 19.2 — native tool-call adherence qualification

## Status

Current status: **verified** — complete diagnostic evidence and all required documentation/test-only gates pass. Exactly two requests: A emitted only pseudo-call content; pre-frozen B emitted a real native call. Final classification is Outcome C. This verifies the diagnostic/mechanical contract, not reliable production-scenario adherence; no required phase work remains.

- [x] not started
- [x] audit complete
- [x] mechanical contract verified
- [x] live qualification complete
- [x] verified
- [ ] blocked
- [ ] inconclusive

## Baseline

- Starting HEAD: `7509a285d9ae7ae56b0e95def3cf915506e655ef`.
- Starting `git status --short --untracked-files=all`, `git diff`, and `git diff --stat`: empty.
- Bun: `1.4.3`; Linux; working directory `/home/karoljaron/Projects/Local_Agentic_CLI`.
- Candidate/test model: `ministral-3:14b` only. Effective configuration/hashes and focused baseline are below; current ModelPort native types, exact request mapping, and response/finish/ID behavior are documented in the completed Native tool pipeline audit.
- No applicable ancestor/workspace `AGENTS.md` found.
- Historical records are read-only. No commit is authorized.
- Starting provider inference count: **0**. Final count: **2**, equal to the hard phase limit, including any post-tool continuation. Read-only provider metadata and mocked request captures do not perform inference.
- `.env` has `TEST_MODEL=ministral-3:14b`, `OLLAMA_BASE_URL=http://localhost:11434`, context/output `16384/4096`; no active `OLLAMA_MODEL`, `SYSTEM_PROMPT`, or keep-alive override. Qualification explicitly selects the candidate in an isolated harness with `readConfig({ OLLAMA_MODEL: 'ministral-3:14b' })`, preserving the production default system/profile/keep-alive (`0`) without changing environment files or preferences.
- Focused deterministic baseline: **380 pass, 0 fail, 3,837 assertions, 17 files**, exit 0, 460 ms; `/tmp/phase192-baseline-focused.log`. Exact scope is recorded under Deterministic verification.
- Baseline integrity manifest: `/tmp/phase192-baseline-integrity.json`, all 230 tracked files, including 95 production TypeScript files and 28 historical progress records.
- Current effective default system: **1,390 UTF-8 bytes**, SHA-256 `8bd1f648d88ea54aba122a5a63e3f438188c749aa9f2e0a597ec73197dc106bc`, exactly equal to the captured Phase 19.1 final default. Current generic ten-tool JSON: **5,132 bytes**, SHA-256 `f84801a5ccdf6bbe2d0c83db6e5fe25c82c7d617a28af83a0b53d80165068e95`; wire tools: **5,043 bytes**, SHA-256 `7667de266447b3882652731e64b98fa87071a7b8bd7b98e25c75df29c791da10`. Sizes are serialization bytes, not tokenizer counts. Exact full definitions equal the prior capture byte-for-byte.

## Phase 19.1 failure

Authoritative prior evidence is preserved without rerunning or reinterpreting the attempt:

- Candidate: `ministral-3:14b`.
- Exactly one provider inference request; clean stop.
- 1,269 prompt tokens / 13 output tokens.
- Zero native tool calls, approvals, process calls, and edits.
- Exact assistant content:

```text
read_file[ARGS]{"path": "arithmetic.js"}
```

- No retry, prompt variant, parser workaround, or alternate model.
- This proves native-tool adherence failure in that one scenario; it does not by itself identify serialization, parsing, template, capability, or stochastic behavior as the cause.
- Existing `/tmp/phase191-live-evidence.json` is available and read-only; SHA-256 `778a7a229f1e611893e866f0aae32ce6951ba783877a4b88cf15393d568eca58`. Its sole captured ModelPort request contains all ten definitions and the Phase 19.1 final production default system, with context/output `16384/4096`. Its tool JSON hash is exactly `f84801a5ccdf6bbe2d0c83db6e5fe25c82c7d617a28af83a0b53d80165068e95`. This is a ModelPort-level capture, not a raw HTTP-body/raw-provider capture; adapter output cannot be retroactively claimed observed. The historical harness calls the production adapter directly with that input.

## Provider/model capability audit

Read-only local `/api/version`, `/api/tags`, and `/api/show` completed before inference. Complete raw replies: `/tmp/phase192-provider-{version,tags,show}.json`.

- Ollama version: **0.40.2**.
- Exact installed tag: `ministral-3:14b`; selected digest `129e04c05b562f6e6ea7ec07ef0b0a61ef1aeaedb91ac524e67a1672eba7bb36`, runner `llamacpp`, format `gguf`, modified `2026-10-09T17:34:40.236928052+02:00`, size 9,082,557,469 bytes.
- Advertised capabilities in both tags/show: **`["completion", "vision", "tools"]`**. No separate `chat` capability string is supplied; completion plus chat-role template is the relevant chat evidence. Tools advertisement establishes advertised mechanical capability, not behavioral reliability.
- Family `mistral3`, families `["mistral3", "clip"]`, displayed parameter size `13.9B`, quantization `Q4_K_M`; model metadata parameter count `13,506,073,600` plus vision projector `438,963,200`. Advertised model context 262,144 does not change the application profile.
- Model parameters: `temperature 0.15`; no explicit stop parameter appears in the metadata. EOS token ID 2; template emits `</s>` after completed assistant history. No temperature/stop override will be added.
- Template: 3,414 bytes, SHA-256 `aa65b5aebf89e7dfb3aa05af9220299a7e1cebe3ab97daae3c2e259acbdf278c`. The provider's fallback system block is guarded by absence of any system message; the application's explicit default system suppresses it. Tools are inserted once beside the last user message using `[AVAILABLE_TOOLS]`; native assistant history uses `[TOOL_CALLS]`, function name, `[ARGS]`, arguments, then `</s>`. Tool results use `[TOOL_RESULTS]`. These are provider-owned template tokens, not application instructions or execution authority.
- Read-only installed selected-manifest/config inspection confirms **`parser: "ministral"`**; `/tmp/phase192-installed-manifest-config.json`. No model blob, template, Modelfile, installation, tag, or preference is changed.
- Version-matched primary source: [Ollama v0.40.2 API types](https://github.com/ollama/ollama/blob/v0.40.2/api/types.go), [chat routes](https://github.com/ollama/ollama/blob/v0.40.2/server/routes.go), [Ministral parser](https://github.com/ollama/ollama/blob/v0.40.2/model/parsers/ministral.go), and [documented tool calling](https://docs.ollama.com/capabilities/tool-calling). Read-only source snapshots reside at `/tmp/phase192-ollama-{types,routes,ministral-parser}.go`.
- The version-matched Ministral parser enters tool-name/arguments states only after the `[TOOL_CALLS]` marker. Without that marker, `name[ARGS]...` stays content. It decodes complete arguments to a JSON object, assigns function indexes, and the server adds provider IDs before emitting `message.tool_calls`; content can coexist with calls. **Inference:** missing or unrecognized tool-start encoding explains the shape of the old result, but its pre-parser tokens were not captured, so the exact model/runner cause is not proven by source inspection alone. New raw HTTP evidence will distinguish application parsing from provider output.

## Native tool pipeline audit

Completed before implementation. Read authoritative Phase 19.1, 19, 18.7, and 18.1; consulted Phase 16 finish/context boundaries and Phase 15.5 selection. Inspected ports/types, adapter/HTTP/mapper/stream, ContextBuilder, RunAgentTurn, ToolRunner, LocalToolRegistry/LocalTool, production factory/providers/schemas, reducer/service, configuration, catalog/runtime/selection, and instruction/contract/recovery tests.

1. **Native ModelPort representation:** `ModelStreamChunk.toolCalls?: ModelToolCall[]`, each `{ id?: ToolCallId, name: string, arguments: unknown }`. `contentDelta` is independent text. Assistant history has `toolCalls`; tool results have `toolCallId`, `toolName`, and canonical JSON content.
2. **Exact wire tool structure:** each generic definition maps once to `{ "type": "function", "function": { "name": ..., "description": ..., "parameters": <JSON Schema object> } }` inside top-level `tools`. Approval/cache flags are internal and excluded. Registry derives parameters from strict Zod schemas, removes `$schema`, supplies `required: []` where needed, and clones nested definitions.
3. **Attachment each round:** RunAgentTurn obtains production tools once from ToolRunner and supplies them to ContextBuilder preflight and every agent model round. The final ModelPort input includes the same nonempty definitions; adapter includes them each request. Optional memory's no-tools calls are distinct and excluded from this qualification.
4. **No duplicate definitions:** names/descriptions/parameters appear once inside each `function`; they are not manually inserted as instructions. Context has exactly one system message. Provider rendering of the tools is the provider's responsibility.
5. **Provider tool-choice field:** none.
6. **Is one required?** No. Version-matched `ChatRequest` and documented native `/api/chat` examples use `tools`; no `tool_choice`, `function_call`, or `required_tools` field exists in that supported contract. No field invention or coercion is justified.
7. **Actual streamed shape:** NDJSON `message.tool_calls: [{ id?: string, function: { index: number, name: string, arguments: object } }]`, with independent `message.content`, `done`, optional `done_reason` and final counters. Each native field contains complete calls, not OpenAI-style name/argument fragment deltas. Multiple complete calls/chunks are supported.
8. **Parser mechanics:** streaming UTF-8 decoder buffers across transport boundaries, parses each nonblank NDJSON line plus final non-newline frame, maps only `message.tool_calls`, and requires at least one provider `done: true`. Empty/absent content defaults to `''`; tool-only chunks survive filtering. Terminal calls are mapped before terminal metadata; no content recovery parser exists.
9. **Content plus call:** supported independently in mapper, stream filtering, and agent accumulation; assistant tool event retains ordinary content alongside structured calls.
10. **Arguments:** local provider API emits JSON objects (ordered-map marshaling), which remain untrusted `unknown` until schema preparation. Existing adapter compatibility also decodes a JSON string only inside native `function.arguments`; invalid JSON throws. This tolerance is not evidence that the installed provider emits string arguments and never applies to assistant text.
11. **Valid native call dropped/converted?** No generic failure found for the supported complete-call shape. Shape/name/argument failures reject; native calls are never converted to content. Index metadata is not execution authority. The source does not combine arbitrary text into tools.
12. **Finish behavior:** `stop` → `stop`, `length` → `length`, `tool_calls` → `tool`, other explicit reasons → `unknown`; missing remains absent. Stop/tool/unknown/absent reasons do not discard calls. Phase 16 deliberately rejects the entire response on `length`, incomplete stream, provider error, or cancellation before execution; this is truthful completion/safety, not an adherence bug.
13. **IDs:** Ollama optional provider IDs/indexes are not transported into canonical authority. After whole-batch preparation, ToolRunner generates fresh host IDs even if ModelPort supplied IDs, and uses those consistently across assistant/request/start/completed/result/replay records. Native assistant history serializes function name/arguments and tool result `tool_name`; the installed template never reads tool IDs. Optional API ID support does not require an application change for this local contract. ID lifecycle will be asserted deterministically.
14. **Textual syntax teaching:** production default instructions/descriptions and production-code scan contain no `[ARGS]`, XML pseudo-call, textual function-call encoding, or provider-specific encoding examples. `[ARGS]` occurs in installed provider template/source and historical generated text. Neither is executable application input.
15. **Old ten-tool request:** yes at the captured ModelPort boundary; all exact names and generic hash confirmed in the preserved prior artifact. Old final raw HTTP body is unavailable, so wire inclusion is proven through the unchanged serialization and new mock capture, not invented historical raw evidence.
16. **Effective old/default system:** prior captured system equals the Phase 19.1 final production default; not an override. New capture will assert default equality and hash before inference. The provider fallback system is not active with this explicit system message.

**Production decision before implementation:** no proven generic mapping bug; no production source or prompt/tool-description change. Add only focused deterministic coverage and this record. Full-batch Zod preparation, fresh host IDs, normal conditional approval, prepared execution, canonical events/results, and ordinary next round remain authoritative. `read_file` requires no approval in the production registry; recording zero approvals for a normal read is expected. A deterministic test may require approval on its prepared read fixture to verify the existing gate without altering the model-visible ten-tool surface.

### Exact production request capture — zero inference

`bun /tmp/phase192-capture.ts > /tmp/phase192-capture.log 2>&1` completed with two **mock transport** requests and **zero real provider inferences**, using production config → SessionService/Reducer → ContextBuilder → RunAgentTurn → ModelPort → OllamaModelAdapter → OllamaHttpClient serialization. The first capture is production A with all real ten definitions; the second is optional synthetic provider diagnostic B through the same adapter. Neither executes a tool. Temporary capture directory removed.

- Exact minified final A body: `/tmp/phase192-request-A.json`, **6,763 bytes**, SHA-256 `2405db6a434a33da0953222e8bca80793c75b117117e6ccec00a6cb692c30bb4`.
- Exact ModelPort A input (including host-owned message ID): `/tmp/phase192-production-input.json`, SHA-256 `ba45e6fc6ed5901787e5bc09f3b7a473ba79cdec156bc2ede8ee1de1449c83cd`.
- Wire messages: exactly `{ role: "system", content: <unchanged production default above> }`, followed by `{ role: "user", content: "Use the workspace read_file tool to read native-tool-proof.txt, then return its exact full contents. Do not guess." }`. No fixture content, memory/retrieved history, template examples, or harness explanation is delivered to the model.
- Top-level keys, in serializer order: `model`, `messages`, `keep_alive`, `tools`, `stream`, `options`, `truncate`, `shift`.
- Model `ministral-3:14b`; `keep_alive: 0`; `stream: true`; `options: { num_ctx: 16384, num_predict: 4096 }`; `truncate: false`; `shift: false`. No `format`, `tool_choice`, `function_call`, `required_tools`, temperature override, or provider template field.
- Every function has exactly `name`, `description`, `parameters`, each once in the native definition; each outer tool has exactly `type: "function"` and `function`. No internal approval/cache fields leak. Aggregate identities above are asserted against historical evidence before capture publication.
- Complete bodies, wire messages/tools/options, per-tool definition/schema/wire hashes and sizes: `/tmp/phase192-capture-summary.json`. Capture harness SHA-256 `d4d87db2d4dec4706e52b836ce68e551a30105ae059c1a3fc47dcfdb9d536f70`.

Exact individual schema hashes (`SHA-256(JSON.stringify(parameters))`), frozen pre-live:

| Tool | Schema SHA-256 |
| --- | --- |
| list_directory | `6107be7ae0c26c67d2598096f39eb0418bde8a6e0ebda99e0c2b2a7979d69f6d` |
| find_files | `577b0d2135d3bc2d32ba2cf72e7e9266a5d3d46a7aab0a8e1657c7b57adb4f22` |
| read_file | `db50a0d44325d0f927cdd580dc7886ff5292eecdb18516dc3957b2bfa456098c` |
| search_text | `bbd8b572d548748fb45f442adbec3f560bb98eec2ffea4c1aaf4db9c5cf75a8d` |
| create_file | `dd5a48072472aca00a70cd1fc604809e9539259b0ac06b137a2ce05cc639fa1f` |
| edit_file | `52d703c57f5913bc0f5c56bbcbbf947aa0b98e3d8c20d648195bfad146acd481` |
| replace_file | `4752594636fe7ceaf9b287f8a4e6c0475a14249d64ccc9a2e3d34a518144dc62` |
| move_file | `8657e87045a6f06a98e473fbc1fd3d02c394aeb41aebd8240753f38fcf9c77e7` |
| delete_path | `bbb7ada971ff12a41d371da7e5976897964f89729692c7361b9e7006a4c2d4e6` |
| run_process | `e9fc2022aa8cf96e521ba612b3da2ed5eb6ac65219d7b9666bd6ab1f01710711` |

## Deterministic verification

Baseline command, before any test changes (all inference/network responses are mocked/scripted):

```text
bun test src/infrastructure/model/OllamaModelAdapter.test.ts src/infrastructure/model/InstructionSurface.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/infrastructure/tools/LocalToolExecutor.test.ts src/application/use-cases/RunAgentTurn.test.ts src/application/use-cases/RunAgentTurnToolRecovery.test.ts src/application/use-cases/RunAgentTurnProcessRecovery.test.ts src/application/use-cases/RunAgentTurnVerification.test.ts src/application/services/ToolRunner.test.ts src/application/services/ContextBuilder.test.ts src/application/services/ContextBuilderProcess.test.ts src/application/services/SessionReducer.test.ts src/application/services/ModelSelection.test.ts src/composition/model/OllamaModelRuntime.test.ts src/infrastructure/model/OllamaModelCatalog.test.ts src/composition/config.test.ts src/test-support/modelFixtures.test.ts
```

Added deterministic coverage only:

- `src/infrastructure/model/OllamaModelAdapter.test.ts`: five tests covering absent/empty/ordinary content plus native calls with object arguments and real optional ID/index fields; multiple complete calls in several frames, UTF-8/JSON byte fragmentation and final non-newline frame; existing native-field JSON-string compatibility explicitly labeled adapter-only, not a claim about installed provider output. Existing malformed JSON, incomplete/error/cancellation, tool request/history mapping and finish/usage tests remain passing.
- New `src/application/use-cases/RunAgentTurnNativeTools.test.ts`: seven tests through the production adapter, ContextBuilder, RunAgentTurn, real LocalToolRegistry/providers, ToolRunner, SessionService/Reducer and filesystem with mocked provider transport. Two native read workflows (unchanged production non-approval read and fixture-required approval) assert exactly one preparation, prepared bound execution, normalized arguments, fresh consistent host IDs, canonical output, all ten tools/system on both requests, assistant content plus native history, and ordinary next round. Legacy direct `execute` throws if used, proving no bypass. Native invalid-schema batch rejects both siblings before approval/execution; unknown native tool and `length` finish remain terminal/non-executable. Two exact `[ARGS]`/JSON-looking prose fixtures create only prompt and ordinary assistant completion, with zero preparation/tool events/approvals/executions.
- Provider fixtures use complete native fields from the version-matched contract, not token-level text recovery or invented argument-fragment protocols. Adversarial unknown/schema inputs verify application safety even if a provider supplies them; the installed parser itself also checks tool names.

New adapter/pipeline scope: **64 pass, 0 fail, 228 assertions, 2 files**, exit 0, 76 ms; `/tmp/phase192-new-regressions.log`.

Final focused command is the baseline command above plus `src/application/use-cases/RunAgentTurnNativeTools.test.ts`: **392 pass, 0 fail, 3,922 assertions, 18 files**, exit 0, 442 ms; `/tmp/phase192-focused-final.log`.

Pre-live validation: `bun run typecheck` pass (`/tmp/phase192-typecheck.log`); `bun run format:check` pass, **183 files**, no fixes (`/tmp/phase192-format.log`); `git diff --check` pass. Reviewed complete adapter-test diff and new pipeline suite. All 95 production files and 28 historical records remain unchanged; only the existing adapter test differs among baseline tracked files. No source/test change in response to live behavior is planned.

## Live qualification

### Frozen qualification plan — before any inference

Frozen plan `/tmp/phase192-frozen-plan.json`, SHA-256 `3d992b28ae179d02433807624ad14853305c28efca2e1c431677883eed3df0a7`; reviewed live harness `/tmp/phase192-live.ts`, SHA-256 `3c631fa63669a5b1bdfe5cc9d85c934179c63ee090dd53db78651ec9999d44d4`. Syntax-only Bun bundle check passed; no model execution. No source/test/prompt change is permitted in response to output.

**A:** disposable workspace owns `native-tool-proof.txt` containing host-only `NATIVE_TOOL_PROOF_731942` (no newline). File value is absent from the exact user/system messages and all first-request data. Uses the captured production prompt, default instructions, profile and all ten tools, normal schema preparation, ToolRunner/event/result/next-round path. Read-only harness guard permits only the expected schema-valid complete-file read; unexpected calls reject after real preparation and before events/approval/execution. The guard does not change tool definitions, interpret text, alter the native channel, or affect expected read execution. Production read requires no approval; approval callback is available through the unchanged conditional path. No optional memory extraction/retrieval/activation/unload inference is scheduled.

**B, frozen before A:** exact body `/tmp/phase192-request-B.json`, **555 bytes**, SHA-256 `3c2ece1cecdea4caacb0c4cd2ead4dfed42b16425fcf1d0db694f6f1c211931d`; input `/tmp/phase192-diagnostic-input.json`, SHA-256 `34364f735cbc1500979d235fbd411db8e140fba6f0beb450f9a563e7dcea6a70`. Same adapter/transport/parser, candidate, keep-alive/profile/stream settings. No filesystem/tool execution or subsequent request. Exactly one user message and one native synthetic function; no system prompt or textual syntax examples:

```json
{
  "messages": [{ "role": "user", "content": "Use lookup_private_value to read the private value for key proof. The value is unavailable without this function." }],
  "tools": [{ "type": "function", "function": {
    "name": "lookup_private_value",
    "description": "Read a private value available only through this function.",
    "parameters": { "type": "object", "properties": { "key": { "type": "string" } }, "required": ["key"], "additionalProperties": false }
  } }]
}
```

The displayed B excerpt omits only the shared model/stream/options/keep-alive/truncate/shift fields recorded above; the hashed artifact is the exact full adapter body.

**Accounting frozen:** at most **2 provider requests total**, checked before dispatch and durably counted. An exclusive one-shot launch marker forbids rerunning the harness after interruption/failure. First A/B live wire bodies must equal their frozen captures byte-for-byte. If A requests a native call, request 2 belongs to its normal continuation and B is forbidden. Only completed A with zero native calls can use request 2 for frozen B. No request 3, equivalent production retry, prompt variant, alternate model, download, or temperature sweep. Per-request timeout 60,000 ms, aggregate 150,000 ms. Every raw response byte/chunk, provider frame, mapped chunk, request/input, preparation, event, approval, execution/result and final response is saved to `/tmp/phase192-live-evidence.json`, with separate `/tmp/phase192-provider-request-N.ndjson` and trace log.

Read-only Bun localhost preflight could not connect inside the sandbox (`ECONNREFUSED`); the same `/api/version` check outside the sandbox returned HTTP 200 / `0.40.2`. This was metadata only, zero inference. The reviewed harness ran once with authorized outside-sandbox localhost transport. This is not a model/prompt retry.

### Actual A — no native call

Executed `bun /tmp/phase192-live.ts > /tmp/phase192-live.log 2>&1` once; harness exit 0 reports diagnostic completion, not success of the file-read task. Qualification started `2026-10-12T17:35:28.159Z`, finished `2026-10-12T17:35:37.859Z`; **9,699.123 ms** total.

- A used exactly **one** provider inference. Actual request body equals frozen production A byte-for-byte; HTTP 200. All ten native tools and unchanged production default/profile were present.
- **15 raw transport chunks / 15 NDJSON frames / 2,221 raw bytes**, exact artifact `/tmp/phase192-provider-request-1.ndjson`, SHA-256 `87723f646b0cd4578a3007f94c450de71f3f277312f2140a76f8a8777501e3ca`. Complete byte chunks (base64 and timing), frames, mapped deltas and input are in the evidence artifact.
- Fourteen content frames, exact deltas in order: `"read"`, `"_"`, `"file"`, `"[ARGS]"`, `"{\""`, `"path"`, `"\":"`, `" \""`, `"native"`, `"-tool"`, `"-pro"`, `"of"`, `".txt"`, `"\"}"`. The fifteenth frame contains empty content and terminal metadata, not a native call.
- Provider clean `done: true`, `done_reason: "stop"`; **1,249 prompt tokens / 15 output tokens**, no cached prompt tokens. Provider total duration 5,001,686,037 ns; load 3,481,669,036 ns. Harness A duration **5,009.245 ms**. Token counts are provider-reported diagnostics, not compiler estimates.
- Raw provider frames contain **zero `message.tool_calls`**, and the production adapter maps zero native calls. Thus the application parser did not lose a native call in A.
- Exact complete ordinary content / final canonical assistant response:

```text
read_file[ARGS]{"path": "native-tool-proof.txt"}
```

- Requested tool name/arguments: **none in the native channel**. The string above is not a request. Preparation count 0, `tool.call.requested` 0, approval 0, execution 0, process calls 0, model edits 0.
- Events: only `prompt.submitted` and `assistant.message.completed`. No actual returned tool/file content; the distinctive value was not obtained or returned. No next production model request occurred. The file stayed exactly `NATIVE_TOOL_PROOF_731942`, and the disposable workspace was removed after qualification.
- Scoring: **native production read failed**, not A1. This is a new minimal scenario; the old arithmetic scenario was not rerun.

### Actual frozen B — native capability observed

Because completed A had zero native calls, the pre-authorized frozen B used the one remaining provider request. It is not an equivalent production retry or post-result prompt variant.

- Actual B request body equals its pre-A capture byte-for-byte; same installed candidate/adapter/settings; HTTP 200.
- **2 raw transport chunks / 2 NDJSON frames / 583 bytes**, exact artifact `/tmp/phase192-provider-request-2.ndjson`, SHA-256 `12cd679e0606b393ea6d644711ba251936ac4861c5b435554cb6365c16321cb3`.
- First actual provider frame (complete native call, nonterminal):

```json
{"model":"ministral-3:14b","created_at":"2026-10-12T17:35:37.810593264Z","message":{"role":"assistant","content":"","tool_calls":[{"id":"call_x4txpna1","function":{"index":0,"name":"lookup_private_value","arguments":{"key":"proof"}}}]},"done":false}
```

- The next frame has empty content, clean `done: true`, `done_reason: "stop"`, **674 prompt tokens / 14 output tokens**, zero cached tokens, provider total duration 4,683,598,840 ns and load 3,550,510,277 ns. Harness B duration **4,684.456 ms**.
- The production response parser yields `{ contentDelta: "", toolCalls: [{ name: "lookup_private_value", arguments: { key: "proof" } }] }` followed by the terminal stop/usage chunk. Provider ID/index are optional provider metadata; existing mapping leaves canonical ID generation to ToolRunner when an actual application invocation is prepared. B performs no such invocation.
- Ordinary assistant content is exactly empty. **One native provider call**, correctly observed through the existing adapter; zero B approvals, tool executions, filesystem effects, continuation, or extra inference. No function result was fabricated.

### Closed inference ledger

| Provider request | Frozen purpose | Native channel | Follow-up |
| --- | --- | --- | --- |
| 1 | A, full production read | none; ordinary pseudo-call content | A ends; no tool result or production continuation |
| 2 | B, optional isolated provider capability | one `lookup_private_value({ key: "proof" })` | none; diagnostic only, no execution |

**Total 2 / hard maximum 2**. Live qualification is closed. Retries 0, production prompt variants 0, alternate models 0, model downloads 0. B was defined/captured before A and is the sole specified diagnostic distinction. No prompt, schema, sampler, provider template, model identity, or production behavior was changed after output.

Complete live evidence `/tmp/phase192-live-evidence.json`, SHA-256 `305025558d21cfcf79a0af52b9c7d943992f90f0c103d80c7e98d478f9573db7`; readable extraction `/tmp/phase192-live-summary.json`; trace `/tmp/phase192-live.log`; exclusive launch marker `/tmp/phase192-live-once.lock`. Raw artifacts contain the exact request bodies and provider chunks, not reconstructed tool execution. Frozen capture/plan/harness hashes and historical Phase 19.1 artifact hash are unchanged after live execution.

## Root-cause classification

**Outcome C — application-context adherence issue remains plausible.**

The application native mapping/preparation/runner/event pipeline is deterministically correct; A's valid unchanged ten-tool request produces no native provider field, while the same installed model/provider/adapter produces a native call for pre-frozen B. Basic provider/model native-tool capability and actual adapter consumption are therefore observed. A's failure occurs before application native parsing/preparation; no generic production mapping bug is established.

The A/B difference leaves the production default instruction, ten-tool surface, schema complexity, request length, provider fallback-system difference (B has no explicit system), and stochastic model choice as unresolved contextual variables. These were the frozen diagnostic conditions, not tuned experiments. Evidence does **not** isolate any one instruction/description/tool as defective, prove the template universally unsupported, or certify reliable native agent adherence. The model-specific internal missing/unrecognized marker explanation is consistent with provider parser/template source, but raw pre-parser tokens remain unavailable. No narrower behavioral/template claim can be responsibly made from this bounded evidence.

This is a completed diagnostic with an evidence-based contextual discrepancy, not authorization to tune production. Normal chat suitability, semantic-memory suitability, and native coding-agent adherence remain separate. Future context ergonomics/capability policy would need a separate phase/decision; there is no default-model switch, rejection, allowlist, score, or qualification registry.

## Production changes

**Production source changes: none.** No native/tool-choice mapping fix was justified. No textual tool-call parser/fallback, regex/XML/JSON-content recovery, model-specific production branch, prompt/tool-description tuning, additional tool, default-model switch, capability registry, sampler override, or provider/model modification.

Exact repository changed-file inventory (four, unstaged):

```text
docs/progress/phase-19.2-progress.md                       new; auditable phase evidence
docs/ARCHITECTURE.md                                      modified; four-line provider-neutral native authority invariant
src/infrastructure/model/OllamaModelAdapter.test.ts        modified; five focused adapter regressions
src/application/use-cases/RunAgentTurnNativeTools.test.ts  new; seven pipeline/security regressions
```

Architecture previously documented preparation/approval but did not explicitly state that tool-looking assistant text cannot propose execution. The added concise invariant describes existing behavior only; concrete Ministral/A/B results remain solely in this progress record. No implementation detail or new product flow is introduced.

Protected behavior remains unchanged: Phase 19.1 verification/repair guidance, ProcessObservation and twelve-round bound; Phase 19 exact tool surface/direct argv/approval/timeout/cancellation/output contract; Phase 18.1 Zod/complete-batch/prepared execution/recovery; Phase 18.7 optional best-effort memory; Phase 17 retrieval; Phase 16 compiler/profile/estimator; Phase 15.5 selection/preferences/historical identity. No live process call occurred. No package, lockfile, environment, model preference, index, staging, or commit change. Disposable evidence/harnesses remain outside the repository.

## Final validation and review

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused baseline, before test changes | PASS: 380 tests, 0 fail, 3,837 assertions, 17 files | `/tmp/phase192-baseline-focused.log` |
| New adapter/native pipeline scope | PASS: 64 tests, 0 fail, 228 assertions, 2 files | `/tmp/phase192-new-regressions.log` |
| Final focused native/provider/agent/approval/context/instruction/selection/Phase 19.1 scope | PASS: 392 tests, 0 fail, 3,922 assertions, 18 files | `/tmp/phase192-focused-final.log`; baseline command plus new native suite |
| `bun run typecheck` | PASS, exit 0 | `/tmp/phase192-typecheck.log` |
| `bun run format:check` | PASS: 183 files, no fixes, exit 0 | `/tmp/phase192-format.log`, `/tmp/phase192-final-format.log` |
| Production request / optional B capture | PASS: exact bodies frozen, zero inference | `/tmp/phase192-capture-summary.json` |
| Live inference accounting | PASS: exactly 2 provider requests; A fails native adherence, B succeeds native capability | `/tmp/phase192-live-evidence.json` and exact raw NDJSON artifacts |
| Production/historical integrity; whitespace; final HEAD/index/status | PASS: 95 production files and 28 historical records unchanged; exact four-file inventory, no staging/commit | `/tmp/phase192-final-review.json` |

Final structural review `/tmp/phase192-final-review.py` passes: actual A/B bodies exactly equal frozen captures, each raw native/content field matches adapter output, the proof is absent from A's request, all ten individual schema hashes match the record, frozen plan/harness/test/prior evidence hashes remain unchanged, the workspace is removed, and the one-shot marker persists. All 228 other baseline tracked files are byte-unchanged; only architecture and the existing adapter test differ. No source/test edits followed live output.

`git diff --check` passes. New progress and native-test files pass `git diff --no-index --check /dev/null <path>` with no diagnostics (exit 1 denotes the expected new-file difference), plus explicit UTF-8/final-newline/trailing-whitespace checks. Local Markdown links resolve; complete tracked diff and new files were reviewed. Static production scan finds no pseudo-call syntax/parser, model-name capability registry, or model-specific tool qualification branches.

Final `git diff --stat`: **2 tracked files, 117 insertions**, excluding the two new files. `git status --short --untracked-files=all` contains exactly the four paths above. HEAD remains `7509a285d9ae7ae56b0e95def3cf915506e655ef`; index empty; commit none. The final record-only status/evidence update receives repeated lightweight integrity/whitespace checks without more inference or repeated passing expensive gates.

No full-suite/release/Linux/Windows/build smoke rerun: this phase has no production source changes, and the required focused/type/format/whitespace/document/integrity checks apply. The syntax-only disposable harness bundle check is not a production release/build gate. No current Windows runtime claim is made.

## Final summary

| Item | Final value |
| --- | --- |
| candidate | `ministral-3:14b` |
| old Phase 19.1 attempt rerun | no |
| tool count | 10 |
| tool surface changed | no; byte-identical |
| native tools in request | yes; exact production HTTP capture and live body equality |
| provider advertises tool capability | `["completion", "vision", "tools"]` |
| model/template tool evidence | selected `ministral` parser; native B call observed; A returned content only |
| native response parser | verified deterministically and against actual B native frame |
| synthetic native read pipeline | pass; production read plus fixture-required approval, prepared execution/events/result/next round |
| pseudo-call text executes | no |
| production scenario A native call | no; exact pseudo-call retained as ordinary content |
| diagnostic B used | yes; one native `lookup_private_value`, no execution |
| total inference requests | 2 / maximum 2; one A, one frozen B |
| prompt variants | 0; optional diagnostic frozen before A |
| retries | 0 |
| alternate models | 0 |
| downloads | 0 model downloads; read-only provider source/metadata audit only |
| textual fallback parser | no |
| model-specific production logic | none |
| root-cause outcome | **C — application-context adherence issue remains plausible** |
| production source changes | none; only two tests and two documentation paths |
| Phase 19.1 changes | none |
| Phase 19 changes | none |
| semantic memory changes | none |
| model-selection changes | none |
| commit | none |
