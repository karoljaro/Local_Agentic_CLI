# Phase 18.5 — structured session-memory model capability qualification

## Status

verified

Status vocabulary: not started, in progress, blocked, qualification complete, verified, inconclusive. Historical records are read-only. No delegation or commit. Phase 18.4's final contract/corpus/baseline and Phase 18.3 lifecycle remain authoritative. The fixed evaluation, evidence review and required checks are verified; the capability qualification is **Outcome C — inconclusive**. Verified execution does not imply successful extraction in every case. No required phase work remains.

The initial candidate gate correctly stopped this phase with zero inference because the existing .env set TEST_MODEL=qwen3.5:9b. Three consecutive checks confirmed that block. The user then explicitly selected **gemma4:12b** for the disposable evaluation. Only the evaluation process receives **TEST_MODEL=gemma4:12b**; no environment file, selected application model, preference or default is changed. The candidate gate is now satisfied.

## Baseline

- Starting and resumed HEAD: `238038239dadc790e5b1c86a62fac2114d9b5165` (completed Phase 18.4 commit).
- Initial git status/diff: empty. Resume status: only this existing untracked progress record; tracked and staged diff empty.
- Bun: **1.4.3**.
- Initial shell-exported TEST_MODEL: unset; Bun-loaded .env: qwen3.5:9b. Disposable explicit override: **gemma4:12b**, confirmed by Bun.env and existing requireLiveTestModel(). OLLAMA_MODEL remains unset.
- Provider: http://localhost:11434. Exact installed candidate: **gemma4:12b**, **11.9B**, **Q4_K_M**, **8021618941 bytes**, modified **2026-10-09T13:46:13.711291008+02:00**, predating this phase.
- Frozen qwen baseline source: [Phase 18.4 final live evidence](phase-18.4-progress.md), A–F; zero baseline reruns and no rescoring.
- Production semantic deadline: **10000 ms**, unchanged. Evaluation-only service deadline: **30000 ms per case**.
- Semantic output cap: **1024**, context **16384**, ordinary output **4096**. Exact semantic profile **16384/min(1024, configured output)**.
- OLLAMA_KEEP_ALIVE="0", serialized keep_alive:0, unchanged. Read/publication I/O bounds: 1000 ms each.
- Instruction SHA-256: `c151069875f441e574ddf172857dc9b7675cf24b8b2833277397ed0657deac03` (2180 characters, no trailing newline).
- Response-schema SHA-256: `623ac4855fe9441e0ad141596f08870006ce8a0c439e99796f3e82dcef978f3e` (1956-character JSON.stringify representation).
- Required Phase 18.4, 18.3, 18.2 and 18 records read. Earlier Phase 17/18.1/16/15.5 consulted only for protected boundaries. No applicable AGENTS.md.

Initial read-only catalog evidence remains /tmp/phase-18.5-preflight.json. Candidate-specific gate uses **readConfig → OllamaModelCatalog → OllamaHttpClient** with only GET /api/tags allowed and a 5000 ms abort bound. Sandboxed candidate read at 2026-10-11T18:47:30.272Z failed ECONNREFUSED with zero inference; identical approved localhost read succeeded **2026-10-11T18:47:39.641Z → 18:47:39.644Z**, **3.042656 ms**, confirming one exact installed match and effective TEST_MODEL=gemma4:12b. Evidence: /tmp/phase-18.5-candidate-preflight.ts and /tmp/phase-18.5-candidate-preflight.json. Catalog latency is not semantic latency. No activation, unload, download, embedding, qwen or ministral inference occurred.

## Frozen contract verification

All **210 tracked files**, including **105 production/configuration files**, match starting HEAD byte-for-byte. All historical records are unchanged. Production instruction equals the exact Phase 18.4 final instruction and all six final saved captures. Production Zod-derived schema hash, nullable required goal and valid empty changes are unchanged. Evidence: /tmp/phase-18.5-integrity.py, /tmp/phase-18.5-integrity.json and the focused deterministic checks below.

Actual candidate request capture completed **before live inference** using **config → SessionMemoryService (default production 10000 ms deadline) → ModelSessionMemoryUpdater → observing ModelPort → OllamaModelAdapter serialization → mocked fetch**. Six requests, **zero inference**. Saved /tmp/phase-18.5-capture.json. Every provider body is deeply identical to its Phase 18.4 final counterpart after replacing **only model** with gemma4:12b. Same instruction, schema/format, previous memory, evidence and message IDs, no tools, num_ctx:16384, num_predict:1024, keep_alive:0, stream:true, truncate:false, shift:false, no sampler or reasoning additions.

Six-case dry-run restored each exact source-valid prerequisite document/events through production provenance validation and applied the original expected fixture delta through the production updater/schema/host/atomic store using mocked responses. **Six accepted fixture transitions, zero inference, canonical events unchanged**. These are evaluator checks, never candidate successes. Evidence: /tmp/phase-18.5-dry-run.json and /tmp/phase-18.5-candidate-request-review.json.

Frozen evaluation harness /tmp/phase-18.5-eval.ts SHA-256: `e792c827be72debd4417ca24fd2a272a13c603e75d19ac3c94245c2a7cda3786`.
Candidate capture SHA-256: `1606d2c344d72440009049b77e963dec31566698ccc01243c621468b3339d31a`.
Instruction/schema hashes match above for all six actual serializations. All six live dispatches equal their candidate captures, independently verified after evaluation. No harness or production edits followed live behavior; the pre-inference harness hash remains exact.

Only model identity and the **evaluation-only SessionMemoryService deadline** differ from Phase 18.4 production. Host application, strict Zod validation, exact quote origin, source roles, provenance, model/updater/session fencing, atomic rejection and atomic publication stay unchanged. Origin checks do not establish semantic entailment; no entailment guard or selective application is added.

Phase 18.3 opportunistic owner, interactive priority, cancellation/supersession, one unresolved updater invocation, zero semantic backlog, Conversation release and runtime disposal remain unchanged. The controlled diagnostic directly awaits finish, as Phase 18.4 did. Phase 17 exact retrieval/0.65/top8/max3/fallback and Phase 18.1 nine-tool preparation/recovery/approval behavior stay unchanged.

## Frozen corpus

Exact existing /tmp/phase-18.4-corpus.json reused without reconstruction or modification. Frozen **2026-10-11T18:11:31.885Z**, SHA-256 **`f8365b9f552401fd3d810b4464e3dbd014595901e4d51acea755b21fdfa8abeb`**.

All six previous memories, evidence and expected deltas equal the authoritative record's JSON; exact expectation prose matches. Full session IDs, previous/current events, prerequisite documents and keys match the saved Phase 18.4 final capture. Historical corpus modelName remains qwen3.5:9b; this is fixture metadata and is never used to construct an inference adapter. Each case restores independently; candidate success in earlier cases cannot change later fixtures.

| Case | Frozen expectation (summary; original text/state unchanged) |
| --- | --- |
| A | Establish local notes-index/search CLI goal; no invented choice, restriction or completion. Grounded implementation pending is allowed. |
| B | goal:null; preserve objective and add explicit pending indexing integration tests. |
| C | User-sourced SQLite decision; preserve goal/pending without restatement; exclude unaccepted Redis proposal. |
| D | Add persistent terminal-UI constraint and missing-fixture problem under indexing-integration-tests; preserve goal/SQLite/pending. |
| E | Remove terminal-ui; same-key metadata-store becomes PostgreSQL; preserve goal/pending/problem. |
| F | Meaningful completed indexing-integration-tests clears matching pending/problem; preserve goal/PostgreSQL. Explicit removals plus completion are acceptable but redundant. |

Scoring remains applied semantic state with accepted equivalents. Categories: correct, acceptable equivalent, false positive, false negative, wrong category, redundant operation, invalid evidence, atomic rejection, schema failure, output-limit failure, timeout. No exact wording requirement, fake percentage or stochastic-output test.

Precommitted limits: **one gemma4:12b candidate**, **six cases A–F**, **one inference each**, **zero retries**, **zero qwen/ministral requests**, **30000 ms per case**, one **190000 ms aggregate wall-clock AbortSignal**, external hard process limit **195 seconds** plus 2-second termination grace. Exclusive /tmp/phase-18.5-live-started.json guard prevents a second evaluation. All inference bodies are restricted to gemma4:12b and checked before dispatch. No warm/cold matrix, seeds, prompt variants, output-budget changes, sampler/reasoning additions or downloads.

## Candidate live evidence

One frozen live invocation, exit 0. Started **2026-10-11T18:52:49.657Z**, ended **2026-10-11T18:54:20.808Z**, aggregate **91151.070405 ms**, within 190000 ms aggregate and 195-second external bounds. Exactly **six gemma4:12b inference requests**, one per A–F, **zero retries**, **zero qwen/ministral inference**, **zero downloads**. No diagnostic timeout or provider transport failure. All six produced provider terminal frames: two stop and four length. No new request followed this run.

```bash
timeout --signal=TERM --kill-after=2s 195s env TEST_MODEL=gemma4:12b bun run --tsconfig-override /home/karoljaron/Projects/Local_Agentic_CLI/tsconfig.json /tmp/phase-18.5-eval.ts live > /tmp/phase-18.5-live.log 2>&1
```

Approved localhost execution used the reviewed harness and exclusive /tmp/phase-18.5-live-started.json guard. No sandboxed live inference was attempted first. Read-only preflight access failures are not evaluation attempts/retries. Evidence: /tmp/phase-18.5-eval.ts, /tmp/phase-18.5-live.log, /tmp/phase-18.5-live-started.json, /tmp/phase-18.5-live-result.json and six atomic artifacts under the recorded /tmp directories. Live result SHA-256: `6465b8a8b4319251cfe7f3e727bb601746a6ea344b38583ea5521b55f39ea0e7`. Harness/corpus/source hashes remain frozen.

Two schema-valid deltas (A/F), both host-accepted under the diagnostic deadline; **four total accepted operations** (A goal + F completed/removals), **zero rejected parsed operations**, **zero atomic rejections**. B–E have no parsed delta, so their untrusted fragments are not counted as host-rejected operations. Their application failure is output-limit failure, not a fabricated schema/host rejection or timeout. No parsed schema failure occurred. All four preserve exact previous semantic state through the existing failed fallback.

All six resulting documents were independently read and resumed through the production exact-prefix/provenance validation with no updater/provider available; resulting state matched, canonical events unchanged, **zero verification inference**. /tmp/phase-18.5-final-review.ts and /tmp/phase-18.5-final-review.json. Failed B–E updater metadata retains prior fixture model qwen3.5:9b with status failed: this is the frozen prerequisite origin label preserved by host fallback, **not qwen execution**. All actual wire bodies and provider terminal identities are gemma4:12b.

Scoring below is the frozen Phase 18.4 applied-state method. Accepted semantic equivalents do not require literal expected text. Updater latency covers production preflight, provider stream and bounded JSON/schema parsing; finish includes host validation/fallback/atomic publication and harness observation overhead. <=10 seconds uses updater settlement, exactly as the baseline. Production acceptance additionally requires host-valid completion and assumes no interactive supersession; it does not establish semantic entailment and is not a second 10-second run. All six observed results exceed 10000 ms, so **zero production-acceptable cases** irrespective of semantic quality.

| Case | Updater status | Host result | Accepted / rejected ops | Semantic/applied classification | Updater ms | Finish ms | <=10s | Production-acceptable |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| A | fulfilled | accepted | 1 / 0 | correct | 24801.276 | 24811.546 | no | no |
| B | rejected | updater failure | 0 / 0 | output-limit failure; pending false negative in fallback | 14562.873 | 14563.465 | no | no |
| C | rejected | updater failure | 0 / 0 | output-limit failure; decision false negative in fallback | 13502.741 | 13503.551 | no | no |
| D | rejected | updater failure | 0 / 0 | output-limit failure; constraint and problem false negatives in fallback | 13788.758 | 13789.579 | no | no |
| E | rejected | updater failure | 0 / 0 | output-limit failure; revoked constraint and superseded decision retained | 14088.855 | 14089.624 | no | no |
| F | fulfilled | accepted | 3 / 0 | acceptable equivalent; two redundant operations | 10377.718 | 10378.439 | no | no |

Residency was not queried; no resident/warm-state conclusion is made. Existing provider terminal load/generation metadata is included below as observation only. Keep-alive remains 0; no retention experiment.

### A — raw candidate result and applied state

Frozen expectation: Establish the local notes-index/search CLI goal. No invented decisions, restrictions or completion. A pending implementation item is acceptable only if grounded in the explicit objective and not-started evidence.

Classification: **correct**. One initial user-sourced objective; changes empty. Applied memory exactly matches the frozen expected state. Completion is outside production 10000 ms.

Start/end: **2026-10-11T18:52:49.661Z → 2026-10-11T18:53:14.462Z**. Updater **fulfilled**; host **accepted**; updater error `None`; host error `None`. Timing **24801.275529 ms** updater / **24811.545752 ms** finish; **<=10s no; production-acceptable no**. Semantically correct: yes.

Exact reused current evidence:

```json
[
  {
    "messageId": "p184-user-A",
    "role": "user",
    "text": "Build a local CLI that indexes project notes and lets me search them."
  },
  {
    "messageId": "p184-assistant-A",
    "role": "assistant",
    "text": "I understand the project objective. Implementation has not started."
  }
]
```

Exact raw structured provider text (JSON string, including invalid/incomplete text; never repaired):

```json
"{\"version\":1,\"goal\":{\"mode\":\"initial\",\"text\":\"Build a local CLI that indexes project notes and lets me search them.\",\"evidence\":{\"messageId\":\"p184-user-A\",\"quote\":\"Build a local CLI that indexes project notes and lets me search them.\"}},\"changes\":[]}"
```

Actual returned/parsed structured delta (null means none):

```json
{
  "version": 1,
  "goal": {
    "mode": "initial",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "evidence": {
      "messageId": "p184-user-A",
      "quote": "Build a local CLI that indexes project notes and lets me search them."
    }
  },
  "changes": []
}
```

Accepted operations: all goal plus changes in the actual delta above, **1**. Rejected operations: **0**. No partial acceptance.

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p184-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [],
  "problems": []
}
```

Exact persisted boundary/updater metadata:

```json
{
  "source": {
    "eventCount": 2,
    "lastEventId": "p184-event-A-assistant",
    "digest": "652bf49cdbc960dbd7d88f5c7463ad52d951af64ba449540ee4ffc9587275579"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "gemma4:12b",
    "status": "updated"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 0,
    "observedEvents": 2
  }
}
```

Provider terminal metadata (duration fields in nanoseconds; diagnostic observations):

```json
{
  "model": "gemma4:12b",
  "created_at": "2026-10-11T18:53:14.457750036Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 24794042390,
  "load_duration": 22449685284,
  "prompt_eval_count": 1044,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 832136000,
  "eval_count": 165,
  "eval_duration": 1500052000
}
```

### B — raw candidate result and applied state

Frozen expectation: Preserve goal with goal:null. Add explicit pending indexing integration tests; no completion or replacement goal.

Classification: **output-limit failure; pending false negative in fallback**. Length-ended untrusted text repeatedly emits the existing goal as initial and quotes the old objective as if it appeared in p184-user-B. It is absent from current evidence. Text also begins a pending item using indexing-tests, but no complete delta exists. The updater rejects the unclean finish before JSON/schema/host application; prior goal remains and no pending tests are added. No fragment is repaired or counted as an operation.

Start/end: **2026-10-11T18:53:14.475Z → 2026-10-11T18:53:29.038Z**. Updater **rejected**; host **updater failure**; updater error `Error: Memory extraction did not finish cleanly.`; host error `None`. Timing **14562.873256 ms** updater / **14563.464753 ms** finish; **<=10s no; production-acceptable no**. Semantically correct: no expected applied transition; completed semantic output unavailable.

Exact reused current evidence:

```json
[
  {
    "messageId": "p184-user-B",
    "role": "user",
    "text": "Now add integration tests for the indexing path."
  },
  {
    "messageId": "p184-assistant-B",
    "role": "assistant",
    "text": "Integration tests for the indexing path remain pending; I have not completed them."
  }
]
```

Exact raw structured provider text (JSON string, including invalid/incomplete text; never repaired):

```json
"{\"version\":1,\"goal\":{\"mode\":\"initial\",\"text\":\"Build a local CLI that indexes project notes and lets me search them.\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Build a local CLI that indexes project notes and lets me search them.\"}}},\"changes\":[{\"operation\":\"upsert\",\"category\":\"pending\",\"key\":\"indexing-tests\",\"text\":\"Add integration tests for the indexing path\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Now add integration tests for the indexing path.\"}}]}```json{\"version\":1,\"goal\":{\"mode\":\"initial\",\"text\":\"Build a local CLI that indexes project notes and lets me search them.\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Build a local CLI that indexes project notes and lets me search them.\"}}},\"changes\":[{\"operation\":\"upsert\",\"category\":\"pending\",\"key\":\"indexing-tests\",\"text\":\"Add integration tests for the indexing path\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Now add integration tests for the indexing path.\"}}]}``````json{\"version\":1,\"goal\":{\"mode\":\"initial\",\"text\":\"Build a local CLI that indexes project notes and lets me search them.\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Build a local CLI that indexes project notes and lets me search them.\"}}},\"changes\":[{\"operation\":\"upsert\",\"category\":\"pending\",\"key\":\"indexing-tests\",\"text\":\"Add integration tests for the indexing path\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Now add integration tests for the indexing path.\"}}]}``````json{\"version\":1,\"goal\":{\"mode\":\"initial\",\"text\":\"Build a local CLI that indexes project notes and lets me search them.\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Build a local CLI that indexes project notes and lets me search them.\"}}},\"changes\":[{\"operation\":\"upsert\",\"category\":\"pending\",\"key\":\"indexing-tests\",\"text\":\"Add integration tests for the indexing path\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Now add integration tests for the indexing path.\"}}]}``````json{\"version\":1,\"goal\":{\"mode\":\"initial\",\"text\":\"Build a local CLI that indexes project notes and lets me search them.\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Build a local CLI that indexes project notes and lets me search them.\"}}},\"changes\":[{\"operation\":\"upsert\",\"category\":\"pending\",\"key\":\"indexing-tests\",\"text\":\"Add integration tests for the indexing path\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Now add integration tests for the indexing path.\"}}]}``````json{\"version\":1,\"goal\":{\"mode\":\"initial\",\"text\":\"Build a local CLI that indexes project notes and lets me search them.\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Build a local CLI that indexes project notes and lets me search them.\"}}},\"changes\":[{\"operation\":\"upsert\",\"category\":\"pending\",\"key\":\"indexing-tests\",\"text\":\"Add integration tests for the indexing path\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Now add integration tests for the indexing path.\"}}]}``````json{\"version\":1,\"goal\":{\"mode\":\"initial\",\"text\":\"Build a local CLI that indexes project notes and lets me search them.\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Build a local CLI that indexes project notes and lets me search them.\"}}},\"changes\":[{\"operation\":\"upsert\",\"category\":\"pending\",\"key\":\"indexing-tests\",\"text\":\"Add integration tests for the indexing path\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Now add integration tests for the indexing path.\"}}]}``````json{\"version"
```

Actual returned/parsed structured delta (null means none):

```json
null
```

Accepted/rejected parsed operations: **0 / 0**. Host delta/evidence validation was not invoked; nonempty raw fragments are untrusted observations.

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p184-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [],
  "problems": []
}
```

Exact persisted boundary/updater metadata:

```json
{
  "source": {
    "eventCount": 4,
    "lastEventId": "p184-event-B-assistant",
    "digest": "f7c1bb1e9cd7f93bbd475fc5f447c07d0ca6b272a194cb3c952a057f2105cc68"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "qwen3.5:9b",
    "status": "failed"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 2,
    "observedEvents": 4,
    "lastFailure": "semantic-update-failed"
  }
}
```

Provider terminal metadata (duration fields in nanoseconds; diagnostic observations):

```json
{
  "model": "gemma4:12b",
  "created_at": "2026-10-11T18:53:29.037913329Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "length",
  "total_duration": 14559774854,
  "load_duration": 5520849229,
  "prompt_eval_count": 1058,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 671179000,
  "eval_count": 1024,
  "eval_duration": 8362758000
}
```

### C — raw candidate result and applied state

Frozen expectation: Preserve goal and pending, with no restatement. Add user-sourced SQLite metadata decision; no constraint for the choice, no settled Redis proposal.

Classification: **output-limit failure; decision false negative in fallback**. Length-ended untrusted text reissues the existing goal as initial with an old-objective quote absent from current evidence. A SQLite decisions entry begins, then repeated JSON/fence text exhausts output. Redis is absent from the observed raw text and applied state. No validated decision or goal operation exists; fixture pending and goal remain unchanged.

Start/end: **2026-10-11T18:53:29.040Z → 2026-10-11T18:53:42.543Z**. Updater **rejected**; host **updater failure**; updater error `Error: Memory extraction did not finish cleanly.`; host error `None`. Timing **13502.740999 ms** updater / **13503.550741 ms** finish; **<=10s no; production-acceptable no**. Semantically correct: no expected applied transition; completed semantic output unavailable.

Exact reused current evidence:

```json
[
  {
    "messageId": "p184-user-C",
    "role": "user",
    "text": "Use SQLite for metadata instead of PostgreSQL."
  },
  {
    "messageId": "p184-assistant-C",
    "role": "assistant",
    "text": "I suggest caching search results in Redis. This is only a proposal; you have not accepted it."
  }
]
```

Exact raw structured provider text (JSON string, including invalid/incomplete text; never repaired):

```json
"{\"version\":1,\"goal\":{\"mode\":\"initial\",\"text\":\"Build a local CLI that indexes project notes and lets me search them.\",\"evidence\":{\"messageId\":\"p184-user-C\",\"quote\":\"Build a local CLI that indexes project notes and lets me search them.\"}}},\"changes\":[{\"operation\":\"upsert\",\"category\":\"decisions\",\"key\":\"metadata-database\",\"text\":\"Use SQLite for metadata instead of PostgreSQL.\",\"evidence\":{\"messageId\":\"p184-user-C\",\"quote\":\"Use SQLite for metadata instead of PostgreSQL.\"}}]}_```json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json_json"
```

Actual returned/parsed structured delta (null means none):

```json
null
```

Accepted/rejected parsed operations: **0 / 0**. Host delta/evidence validation was not invoked; nonempty raw fragments are untrusted observations.

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p184-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p184-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": []
}
```

Exact persisted boundary/updater metadata:

```json
{
  "source": {
    "eventCount": 6,
    "lastEventId": "p184-event-C-assistant",
    "digest": "356806d0163f7a7beb215ce86ac33e296c40ddf2a6e837df97014f2306f9ce3b"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "qwen3.5:9b",
    "status": "failed"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 4,
    "observedEvents": 6,
    "lastFailure": "semantic-update-failed"
  }
}
```

Provider terminal metadata (duration fields in nanoseconds; diagnostic observations):

```json
{
  "model": "gemma4:12b",
  "created_at": "2026-10-11T18:53:42.543216262Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "length",
  "total_duration": 13501984172,
  "load_duration": 4174706483,
  "prompt_eval_count": 1087,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 655395000,
  "eval_count": 1024,
  "eval_duration": 8666447000
}
```

### D — raw candidate result and applied state

Frozen expectation: Preserve goal/SQLite/pending without restatement. Add user-sourced persistent terminal-UI constraint and missing-fixture unresolved problem under indexing-integration-tests.

Classification: **output-limit failure; constraint and problem false negatives in fallback**. Only an incomplete prefix exists: goal:null and the beginning of a constraints upsert under terminal-ui. No full restriction or blocker operation is returned. Existing SQLite/pending survive; the expected restriction and missing-fixture problem are not added. This does not reproduce qwen D's accepted non-entailing SQLite operation, but it also does not establish successful candidate handling.

Start/end: **2026-10-11T18:53:42.545Z → 2026-10-11T18:53:56.334Z**. Updater **rejected**; host **updater failure**; updater error `Error: Memory extraction did not finish cleanly.`; host error `None`. Timing **13788.757994 ms** updater / **13789.578750 ms** finish; **<=10s no; production-acceptable no**. Semantically correct: no expected applied transition; completed semantic output unavailable.

Exact reused current evidence:

```json
[
  {
    "messageId": "p184-user-D",
    "role": "user",
    "text": "Do not change the terminal UI while doing this. The indexing integration tests are still pending because the test fixture is missing; this blocker is unresolved."
  },
  {
    "messageId": "p184-assistant-D",
    "role": "assistant",
    "text": "The missing fixture blocks the indexing integration tests; they remain pending."
  }
]
```

Exact raw structured provider text (JSON string, including invalid/incomplete text; never repaired):

```json
"{\"version\":1,\"goal\":null,\"changes\":[{\"operation\":\"upsert\",\"category\":\"constraints\",\"key\":\"terminal-ui\",\""
```

Actual returned/parsed structured delta (null means none):

```json
null
```

Accepted/rejected parsed operations: **0 / 0**. Host delta/evidence validation was not invoked; nonempty raw fragments are untrusted observations.

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p184-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [
    {
      "key": "metadata-store",
      "text": "Use SQLite for metadata.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p184-user-C"
      ],
      "sourceEventIds": [],
      "revision": 6
    }
  ],
  "constraints": [],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p184-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": []
}
```

Exact persisted boundary/updater metadata:

```json
{
  "source": {
    "eventCount": 8,
    "lastEventId": "p184-event-D-assistant",
    "digest": "8de3285b93e5687315e7026e75be22e3a85d711f7b6da9903c96c3c3ca8b0879"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "qwen3.5:9b",
    "status": "failed"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 6,
    "observedEvents": 8,
    "lastFailure": "semantic-update-failed"
  }
}
```

Provider terminal metadata (duration fields in nanoseconds; diagnostic observations):

```json
{
  "model": "gemma4:12b",
  "created_at": "2026-10-11T18:53:56.334587585Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "length",
  "total_duration": 13788057223,
  "load_duration": 4167521580,
  "prompt_eval_count": 1121,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 678153000,
  "eval_count": 1024,
  "eval_duration": 8937074000
}
```

### E — raw candidate result and applied state

Frozen expectation: Preserve goal/pending/problem without restatement. Remove terminal-ui constraint; upsert metadata-store as user-sourced PostgreSQL, leaving exactly one active metadata choice.

Classification: **output-limit failure; revoked constraint and superseded decision retained**. Incomplete text begins a same-key PostgreSQL decision using assistant evidence, then starts terminal-ui removal. No validated delta exists and host role/mutation guards are not reached. Fixture SQLite and the revoked restriction remain, along with pending/problem. No correct candidate reversal can be credited from this prefix.

Start/end: **2026-10-11T18:53:56.338Z → 2026-10-11T18:54:10.427Z**. Updater **rejected**; host **updater failure**; updater error `Error: Memory extraction did not finish cleanly.`; host error `None`. Timing **14088.855047 ms** updater / **14089.623751 ms** finish; **<=10s no; production-acceptable no**. Semantically correct: no expected applied transition; completed semantic output unavailable.

Exact reused current evidence:

```json
[
  {
    "messageId": "p184-user-E",
    "role": "user",
    "text": "You can change the terminal UI now. Actually, use PostgreSQL instead of SQLite."
  },
  {
    "messageId": "p184-assistant-E",
    "role": "assistant",
    "text": "The earlier terminal UI restriction is revoked, and PostgreSQL is now the metadata choice."
  }
]
```

Exact raw structured provider text (JSON string, including invalid/incomplete text; never repaired):

```json
"{\"version\":1,\"goal\":null,\"changes\":[{\"operation\":\"upsert\",\"category\":\"decisions\",\"key\":\"metadata-store\",\"text\":\"Use PostgreSQL for metadata.\",\"evidence\":{\"messageId\":\"p184-assistant-E\",\"quote\":\"PostgreSQL is now the metadata choice.\"}},{\"operation\":\"remove\",\"category\":\"constraints\",\"key\":\"terminal-ui"
```

Actual returned/parsed structured delta (null means none):

```json
null
```

Accepted/rejected parsed operations: **0 / 0**. Host delta/evidence validation was not invoked; nonempty raw fragments are untrusted observations.

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p184-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [
    {
      "key": "metadata-store",
      "text": "Use SQLite for metadata.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p184-user-C"
      ],
      "sourceEventIds": [],
      "revision": 6
    }
  ],
  "constraints": [
    {
      "key": "terminal-ui",
      "text": "Do not change the terminal UI.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p184-user-D"
      ],
      "sourceEventIds": [],
      "revision": 8
    }
  ],
  "files": [],
  "completed": [],
  "pending": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p184-user-B"
      ],
      "sourceEventIds": [],
      "revision": 4
    }
  ],
  "problems": [
    {
      "key": "indexing-integration-tests",
      "text": "Indexing integration tests blocked by missing test fixture.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p184-user-D"
      ],
      "sourceEventIds": [],
      "revision": 8
    }
  ]
}
```

Exact persisted boundary/updater metadata:

```json
{
  "source": {
    "eventCount": 10,
    "lastEventId": "p184-event-E-assistant",
    "digest": "38fbe96986d460e0dc82ad76dbfddab1b3602d55430aaf00103b1d9decfca97e"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "qwen3.5:9b",
    "status": "failed"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 8,
    "observedEvents": 10,
    "lastFailure": "semantic-update-failed"
  }
}
```

Provider terminal metadata (duration fields in nanoseconds; diagnostic observations):

```json
{
  "model": "gemma4:12b",
  "created_at": "2026-10-11T18:54:10.426990638Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "length",
  "total_duration": 14088203026,
  "load_duration": 4188837829,
  "prompt_eval_count": 1159,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 697962000,
  "eval_count": 1024,
  "eval_duration": 9196096000
}
```

### F — raw candidate result and applied state

Frozen expectation: Preserve goal/PostgreSQL without restatement. Upsert meaningful completed indexing-integration-tests; host clears matching pending and semantic problem. Equivalent explicit removals plus completion are semantically acceptable but redundant.

Classification: **acceptable equivalent; two redundant operations**. goal:null preserves the objective. A completed upsert uses the exact existing indexing-integration-tests key and current user completion evidence; the host clears matching pending/problem. Two subsequent explicit removals are valid and accepted but redundant because the completed upsert already clears both categories. The completed text retains the task label "Add integration tests for the indexing path."; completed category/key establishes the task transition, an accepted semantic equivalent under the frozen wording-independent scorer. Existing PostgreSQL and goal remain byte-equivalent. Every quote exists and supports its operation. Completion remains outside production by 377.718 ms.

Start/end: **2026-10-11T18:54:10.429Z → 2026-10-11T18:54:20.807Z**. Updater **fulfilled**; host **accepted**; updater error `None`; host error `None`. Timing **10377.717576 ms** updater / **10378.439058 ms** finish; **<=10s no; production-acceptable no**. Semantically correct: yes.

Exact reused current evidence:

```json
[
  {
    "messageId": "p184-user-F",
    "role": "user",
    "text": "The indexing integration tests are completed and passing now. The missing fixture blocker is resolved."
  },
  {
    "messageId": "p184-assistant-F",
    "role": "assistant",
    "text": "The indexing integration tests are complete and the missing fixture blocker is resolved."
  }
]
```

Exact raw structured provider text (JSON string, including invalid/incomplete text; never repaired):

```json
"{\"version\":1,\"goal\":null,\"changes\":[{\"operation\":\"upsert\",\"category\":\"completed\",\"key\":\"indexing-integration-tests\",\"text\":\"Add integration tests for the indexing path.\",\"evidence\":{\"messageId\":\"p184-user-F\",\"quote\":\"The indexing integration tests are completed and passing now.\"}},{\"operation\":\"remove\",\"category\":\"pending\",\"key\":\"indexing-integration-tests\",\"evidence\":{\"messageId\":\"p184-user-F\",\"quote\":\"The indexing integration tests are completed and passing now.\"}},{\"operation\":\"remove\",\"category\":\"problems\",\"key\":\"indexing-integration-tests\",\"evidence\":{\"messageId\":\"p184-user-F\",\"quote\":\"The missing fixture blocker is resolved.\"}}]}"
```

Actual returned/parsed structured delta (null means none):

```json
{
  "version": 1,
  "goal": null,
  "changes": [
    {
      "operation": "upsert",
      "category": "completed",
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "evidence": {
        "messageId": "p184-user-F",
        "quote": "The indexing integration tests are completed and passing now."
      }
    },
    {
      "operation": "remove",
      "category": "pending",
      "key": "indexing-integration-tests",
      "evidence": {
        "messageId": "p184-user-F",
        "quote": "The indexing integration tests are completed and passing now."
      }
    },
    {
      "operation": "remove",
      "category": "problems",
      "key": "indexing-integration-tests",
      "evidence": {
        "messageId": "p184-user-F",
        "quote": "The missing fixture blocker is resolved."
      }
    }
  ]
}
```

Accepted operations: all changes in the actual delta above, **3**. Rejected operations: **0**. No partial acceptance.

Resulting persisted/applied SessionMemory:

```json
{
  "goal": {
    "key": "goal",
    "text": "Build a local CLI that indexes project notes and lets me search them.",
    "basis": "user-sourced",
    "sourceMessageIds": [
      "p184-user-A"
    ],
    "sourceEventIds": [],
    "revision": 2
  },
  "decisions": [
    {
      "key": "metadata-store",
      "text": "Use PostgreSQL for metadata.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p184-user-E"
      ],
      "sourceEventIds": [],
      "revision": 10
    }
  ],
  "constraints": [],
  "files": [],
  "completed": [
    {
      "key": "indexing-integration-tests",
      "text": "Add integration tests for the indexing path.",
      "basis": "user-sourced",
      "sourceMessageIds": [
        "p184-user-F"
      ],
      "sourceEventIds": [],
      "revision": 12
    }
  ],
  "pending": [],
  "problems": []
}
```

Exact persisted boundary/updater metadata:

```json
{
  "source": {
    "eventCount": 12,
    "lastEventId": "p184-event-F-assistant",
    "digest": "8213f08494207d73edb870dc074a71aa6bd9bb42e75bc1f8ee71af3826b23630"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "gemma4:12b",
    "status": "updated"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 10,
    "observedEvents": 12
  }
}
```

Provider terminal metadata (duration fields in nanoseconds; diagnostic observations):

```json
{
  "model": "gemma4:12b",
  "created_at": "2026-10-11T18:54:20.806308657Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 10376111820,
  "load_duration": 4212620772,
  "prompt_eval_count": 1136,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 674547000,
  "eval_count": 600,
  "eval_duration": 5483017000
}
```

## Comparison

The qwen3.5:9b column and baseline timings below are frozen Phase 18.4 evidence, never rerun/rescored. Four output-limit failures limit candidate semantic comparison. A reproduces correct initial establishment outside production time; F supplies a valid completion that qwen F failed to publish. B–E fail extraction, leaving the original prerequisite state. No single accuracy percentage is calculated.

| Case | qwen3.5:9b frozen outcome | gemma4:12b | Candidate <=10s | Candidate production-acceptable |
| --- | --- | --- | --- | --- |
| A | Correct initial goal, too slow | Correct initial goal, too slow | no | no |
| B | Output-limit failure; pending absent | Output-limit failure; pending absent | no | no |
| C | Correct raw decision category/Redis excluded; existing goal reissued as initial; atomic rejection | Output-limit failure; no validated delta; repeated existing goal/fabricated current quote visible in raw text | no | no |
| D | Redundant, non-entailing SQLite operation accepted; restriction/problem absent | Output-limit failure; starts restriction prefix, no validated restriction/problem | no | no |
| E | Output-limit failure; revoked restriction/old choice retained | Output-limit failure; same stale restriction/old choice retained | no | no |
| F | Existing goal as initial/fabricated quote; atomic rejection; completed absent and stale pending/problem | goal:null; accepted completed task clears pending/problem; two redundant removals | no | no |

| Case | Frozen qwen updater / finish ms | Frozen qwen <=10s | Frozen qwen production-acceptable | Candidate updater / finish ms |
| --- | ---: | --- | --- | ---: |
| A | 15382.434 / 15385.087 | no | no | 24801.276 / 24811.546 |
| B | 18423.574 / 18424.382 | no | no | 14562.873 / 14563.465 |
| C | 10282.360 / 10283.814 | no | no | 13502.741 / 13503.551 |
| D | 10099.028 / 10099.889 | no | no | 13788.758 / 13789.579 |
| E | 17918.211 / 17918.999 | no | no | 14088.855 / 14089.624 |
| F | 7759.579 / 7760.232 | yes | no | 10377.718 / 10378.439 |

### Critical semantic checks

- **Goal:** A uses initial only with no goal and exact current user evidence. F uses goal:null and preserves the existing goal exactly. B/C raw length-ended text reissues the existing goal as initial and attributes its old quote to the current user ID; the quote is absent. These resemble qwen C/F failures, but no validated candidate operation or host rejection exists there. D/E prefixes use null; incomplete prefixes do not certify full goal handling. No candidate replacement goal is accepted.
- **Decision/constraint:** C raw prefix uses decisions for SQLite, as qwen C did, but no completed extraction is available. D starts a persistent constraints entry and does not emit qwen D's redundant SQLite claim; it still fails to establish the expected restriction/problem. E's incomplete assistant-sourced decision is not credited as correct user-choice attribution and is never evaluated by mutation/source guards. Existing choices in A/F are not redundantly restated.
- **Proposal exclusion:** Redis is absent from candidate C's complete observed raw stream and applied state. C lacks a schema-valid delta, so this is narrower than a successful full decision/proposal case. No proposal was promoted or accepted; no broad exclusion guarantee is claimed.
- **Pending/problem:** B fails to add pending work; D fails to add the blocker. C–E preserve seeded task identity by fallback, not fresh successful model extraction. F uses exactly indexing-integration-tests and clears its matching stale categories.
- **Reversal:** E does not return a complete valid delta. The revoked terminal-ui constraint and SQLite choice remain; current PostgreSQL reversal is unapplied. A correct candidate reversal is unestablished, as with frozen qwen E.
- **Completion:** F is an accepted semantic equivalent. Completed upsert records the meaningful user-confirmed task and automatically clears matching pending/problem; explicit subsequent removals are redundant. Existing goal/PostgreSQL are preserved. This is a specific improvement over qwen F, not proof of general superiority. Low-level-success completion guards remain protected by deterministic tests; no tools ran live.
- **Evidence:** all four returned/accepted A/F operations cite exact user quotes that semantically support their operations. **Zero unsupported operations among returned/accepted deltas**; **two invalid apparent goal-evidence claims in unvalidated B/C raw fragments**, not scored as accepted/rejected host operations. E's source/mutation issue remains an incomplete fragment. No origin-valid/non-entailing candidate operation like accepted qwen D was observed, but D never produced a complete delta, so entailment reliability cannot be established. Host still checks origin, not entailment; no new guard was added.
- **Output-limit/atomicity:** candidate B/C/D/E end with length/eval_count:1024 (4 failures), compared with qwen B/E (2). Four candidate failures reach no JSON/schema/host delta application. Parsed candidate schema failures, diagnostic timeouts and atomic rejections are all 0. A/F apply atomically. The unchanged host's rejection semantics were deterministically reverified; absence of a live atomic rejection is not a selective-application change.

## Deterministic validation

No production source or test changes; no stochastic-output tests. Before live, **345 pass, 0 fail, 1577 assertions, 17 files**, exit 0, Bun **1060 ms**; /tmp/phase-18.5-before-live-focused.log. After evaluation, the same focused suite passed **345 pass, 0 fail, 1577 assertions, 17 files**, exit 0, Bun **1208 ms**; /tmp/phase-18.5-final-focused.log. Initial blocked checkpoint had also passed this scope and typecheck; it is not counted as candidate extraction.

```bash
bun test src/application/services/SessionMemoryService.test.ts src/application/services/SessionMemoryLifecycle.test.ts src/application/services/ModelSessionMemoryUpdater.test.ts src/application/services/ContextBuilderMemory.test.ts src/application/use-cases/RunAgentTurnMemory.test.ts src/composition/createRuntimeMemory.test.ts src/infrastructure/persistence/JsonSessionMemoryStore.test.ts src/infrastructure/model/OllamaMemoryExtraction.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts src/composition/config.test.ts src/application/use-cases/RunAgentTurnToolRecovery.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/application/services/HistoryRetriever.test.ts src/application/services/ContextBuilderRetrieval.test.ts src/application/use-cases/RunAgentTurnRetrieval.test.ts src/composition/createRuntimeRetrieval.test.ts src/presentation/Conversation.test.ts > /tmp/phase-18.5-final-focused.log 2>&1
bun run typecheck > /tmp/phase-18.5-final-typecheck.log 2>&1
```

| Check | Final result | Evidence |
| --- | --- | --- |
| Focused deterministic scope | 345 pass, 0 fail, 1577 assertions, 17 files; exit 0 | /tmp/phase-18.5-final-focused.log |
| bun run typecheck | pass, exit 0 | /tmp/phase-18.5-final-typecheck.log |
| Frozen source/record/corpus identity | pass; 210 tracked files / 105 production/config files byte-equal, six exact fixtures match | /tmp/phase-18.5-integrity.json |
| Actual candidate request capture/review | six mocked requests, zero inference; only model differs | /tmp/phase-18.5-candidate-request-review.json |
| Fixture dry-run | six accepted fixture transitions, zero inference | /tmp/phase-18.5-dry-run.json |
| Post-live request/persisted-state/resume audit | six live bodies equal captures; six atomic artifacts resume; canonical events unchanged; zero inference | /tmp/phase-18.5-final-review.json |
| git diff --check | pass, exit 0 | final checkpoint |
| New-record whitespace | no diagnostics; no-index --check exits 1 for expected new-file difference | final checkpoint |
| git status --short --untracked-files=all | only this untracked progress record | final checkpoint |
| Document evidence reconciliation | all 36 JSON blocks match six exact live evidence groups; frozen baseline/candidate timing transcription matches | /tmp/phase-18.5-document-review.json |

These checks cover the frozen instruction/schema/null/empty/output bounds, strict atomic host validation, exact evidence/provenance, keyed reversal/completion, Phase 18.3 owner/cancellation/supersession/fencing/disposal/release, Phase 17 retrieval and Phase 18.1 tools. No deterministic implementation bug was exposed. Expensive full release/build gates were not rerun for this progress-document-only phase.

## Final qualification

**Outcome C — inconclusive capability comparison.** Four of six candidate cases exhausted the frozen 1024 output budget, leaving only A and F with completed semantic deltas. F's accepted completion is materially useful evidence for that single transition; it is insufficient to establish broad semantic superiority or to isolate the qwen failures primarily to model/run capability. B/C expose similar apparent initial-goal/evidence mistakes in unvalidated text, but D/E lack completed restriction/reversal output. This does not responsibly establish Outcome B's substantial shared completed semantic failures either. The evidence does not distinguish primary objective A versus B across the critical cases well enough. No prompt tuning, entailment redesign or automatic model recommendation follows.

**Production viability is independently negative for this observed run:** zero cases settle inside 10000 ms, and zero would be production-accepted. A is semantically correct and F is an accepted equivalent despite missing that timing bound; B–E fail extraction under the diagnostic deadline because of output exhaustion. No production deadline or budget is raised to accommodate the candidate. A's terminal metadata reports 22449.685284 ms loading; this observation is not a residency experiment or justification to change keep-alive.

The requested final answers:

1. **Candidate:** exactly gemma4:12b; explicitly chosen by the user, effective only in the disposable process and already installed before the phase (11.9B/Q4_K_M/8021618941 bytes).
2. **Contract integrity:** only inference model identity and the evaluation-only service deadline differ. Instruction/schema/evidence/options/no-tools/keep-alive/truncate/shift/host/lifecycle are exact frozen equivalents, verified before and after live.
3. **A–F:** A correct; B–E output-limit failures and unchanged fallback; F accepted completion equivalent with two redundant removals. Raw outputs and all applied states above.
4. **Goal:** F fixes the qwen F goal reissue; B/C raw fragments still reissue existing goals with invalid current quotes. Candidate C lacks a validated comparison with qwen C.
5. **Decision/constraint:** no complete candidate C/D output, so category/restriction handling is unqualified. Candidate prefixes do not show SQLite as a constraint, but are not credited as successful deltas.
6. **Proposal:** Redis remains absent from C raw/applied state; full C decision/proposal success is unavailable.
7. **Reversal:** E fails output limit; revoked restriction/old choice are retained. Correct reversal is not established.
8. **Completion:** F records completed under the original key and clears matching pending/problem; goal/PostgreSQL preserved; two removals redundant.
9. **Evidence:** A/F returned operations all have semantically supporting exact current user evidence; no unsupported accepted operation. B/C raw goal quotes are absent from current evidence and never validated. Entailment subsystem unchanged/absent.
10. **Output limit:** four failures B/C/D/E at eval_count:1024; cap unchanged. No retry, recovery parsing or schema repair.
11. **Timing:** every per-case diagnostic updater/finish latency is above; all six <=10 seconds **no**, all production-acceptable **no**. F 10377.718 ms still misses the strict bound.
12. **Qualification:** C — inconclusive, due to four output-limit failures/only two completed semantic outputs; no statistical or universal model claim.
13. **Production impact:** none; only this record changed in the repository. No selection/preference/default/environment-file/model-specific/provider-specific/prompt/schema/tool/retrieval/lifecycle change. No commit.

### Final summary table

| Item | Final value |
| --- | --- |
| baseline model | qwen3.5:9b from Phase 18.4 |
| baseline rerun | no |
| candidate model | gemma4:12b |
| candidate installed beforehand | yes; exact installed catalog match predates phase |
| fixed cases | 6, exact frozen corpus |
| attempts per candidate case | 1 |
| candidate inference requests | 6, maximum honored |
| retries | 0 |
| evaluation deadline | 30000 ms diagnostic per case; 190000 ms aggregate / 195 s external, run 91151.070405 ms |
| production deadline | 10000 ms unchanged |
| semantic instruction | unchanged from Phase 18.4; exact hash |
| schema | unchanged; exact hash; nullable goal/empty changes |
| goal handling | A correct; F null/preserved vs qwen F failure; B/C raw invalid initial reissue, unvalidated |
| decision handling | C incomplete; existing F PostgreSQL preserved; no completed C/D comparison |
| constraint handling | D incomplete; E stale revoked restriction as qwen fallback |
| proposal exclusion | Redis absent C raw/state; C lacks complete delta |
| reversal | E output-limit failure; same stale restriction/SQLite fallback as qwen E |
| completion lifecycle | F correct applied equivalent; task clears pending/problem, two redundant removals; improves over qwen F |
| unsupported evidence operations | 0 in returned/accepted deltas; 2 apparent invalid goal-evidence claims in unvalidated B/C text; qwen D entailment boundary unchanged |
| output-limit failures | 4 (B/C/D/E), vs qwen 2 (B/E) |
| cases <=10s | 0, vs qwen 1 (F) |
| production-acceptable cases | 0, vs qwen 0 |
| qualification outcome | C — inconclusive capability comparison |
| production source changes | none |
| OLLAMA_KEEP_ALIVE | 0 unchanged |
| Phase 18.3 lifecycle changes | none |
| Phase 17 retrieval changes | none |
| Phase 18.1 tool changes | none |
| model-specific production logic | none |
| provider-specific production logic | none added |
| selected/default/persisted application model changes | none |
| TEST_MODEL persistence | disposable process override only; .env unchanged |
| qwen / ministral requests in this phase | 0 / 0 |
| downloads / sampler / reasoning additions | 0 / none / none |
| commit | none |

### Final structural review

No production source or harness change followed candidate output. Historical records and all tracked files match starting HEAD; canonical conversation/session/model preference/workspace state was not modified. Evaluation fixtures and raw evidence live only under /tmp. The phase created only docs/progress/phase-18.5-progress.md in the repository. Full raw output/parsed delta/state/terminal/timing/host evidence and frozen comparison are in this record; exact artifact hashes permit audit.

Final review: all **36 JSON blocks** parse and equal the six exact live evidence groups (current evidence, raw structured text, parsed delta, resulting memory, boundary/updater/diagnostics and terminal metadata). Original expectations and frozen qwen timings match; candidate timings match at the documented precision. Six live artifacts independently resume through production provenance/exact-prefix validation, with zero inference and unchanged canonical events. Source/corpus/harness hashes remain exact. Evidence: /tmp/phase-18.5-document-review.json and /tmp/phase-18.5-final-review.json.

git diff --check passes. git diff --no-index --check /dev/null docs/progress/phase-18.5-progress.md has no whitespace diagnostics (exit 1 is the expected new-file difference). git status --short --untracked-files=all contains only this record; tracked/index diff statistics are empty. Starting/final HEAD remains **238038239dadc790e5b1c86a62fac2114d9b5165**. No staging or commit. After successful post-evaluation focused tests/typecheck, only the progress record changed; final document/whitespace/status checks were repeated without additional inference, test reruns or full release/build gates.
