# Phase 18.6 — final cross-model structured session-memory qualification

## Status

verified

Status vocabulary: not started, in progress, blocked, qualification complete, verified, inconclusive. This record was created before live evaluation. Historical progress records are read-only. This is the final model qualification: one explicitly selected ministral-3:14b candidate, exactly A–F once each, no retries, no fourth model, no prompt tuning, no production changes and no commit.

Qualification, evidence reconciliation and required final deterministic checks are complete. **Outcome A — model capability is strongly implicated**, with D/E failures and production timing limits explicitly retained. Verified execution does not imply universally correct semantic extraction. No required phase work remains.

## Baseline

- Starting HEAD: `1262975b6f35a17055e8ddc5a91d5a9df712c1d0`.
- Starting git status, tracked/staged diff and diff stat: empty; clean checkout.
- Bun: **1.4.3**.
- Authoritative baselines: Phase 18.4 qwen3.5:9b and Phase 18.5 gemma4:12b; zero previous-model reruns or rescoring.
- Disposable candidate: **ministral-3:14b**, explicitly selected by the user. Shell-exported TEST_MODEL is unset; existing .env already names ministral-3:14b. Bun-loaded requireLiveTestModel() and an explicit identical process override both confirm ministral-3:14b. OLLAMA_MODEL is unset. No .env/default/preference modification.
- Candidate gate passed before inference: exactly one installed ministral-3:14b, **13.9B / Q4_K_M / 9082557469 bytes**, modified **2026-10-09T17:34:40.236928052+02:00**, predating this phase. Production readConfig → OllamaModelCatalog → OllamaHttpClient, only GET /api/tags with 5000 ms bound. Sandboxed read at 2026-10-11T19:10:53.312Z failed ECONNREFUSED (zero inference); identical approved read succeeded **2026-10-11T19:11:07.162Z → 19:11:07.165Z**, 3.290435 ms. Full installed catalog and metadata: /tmp/phase-18.6-candidate-preflight.json; failed read preserved separately. No download, activation, unload, embedding or residency request.
- Production semantic deadline: **10000 ms** unchanged. Diagnostic evaluation: **30000 ms per case**, single **190000 ms aggregate** and **195-second external** limit plus 2-second termination grace, as the previous phase used.
- Semantic output cap **1024**, context **16384**, normal output **4096**, effective OLLAMA_KEEP_ALIVE **"0"** / serialized keep_alive **0**, all verified frozen. Read/publication I/O bounds remain 1000 ms.
- Expected instruction SHA-256: `c151069875f441e574ddf172857dc9b7675cf24b8b2833277397ed0657deac03`.
- Expected response-schema SHA-256: `623ac4855fe9441e0ad141596f08870006ce8a0c439e99796f3e82dcef978f3e`.
- Exact existing /tmp/phase-18.4-corpus.json is present; measured SHA-256: `f8365b9f552401fd3d810b4464e3dbd014595901e4d51acea755b21fdfa8abeb` (matches frozen digest).

## Frozen contract verification

All **211 tracked files** match starting HEAD byte-for-byte; all **105 production/configuration files** additionally match the saved Phase 18.5 source hashes. Historical records are unchanged. Production instruction equals the full Phase 18.4 final Proposed correction and every Phase 18.4 final capture: **2180 characters**, instruction hash above. Production Zod-derived response schema is **1956 JSON.stringify characters**, exact schema hash above. No instruction/schema/settings/host/provenance/key/evidence/completion/goal/category change.

Six actual candidate requests captured before inference through **config → SessionMemoryService (default 10000 ms) → ModelSessionMemoryUpdater → observing ModelPort → OllamaModelAdapter serialization → mocked fetch**. **Six mocked requests, zero inference**. Every complete body equals both Phase 18.5 and final Phase 18.4 captures after replacing only model with ministral-3:14b. ModelPort messages including IDs, schema, evidence, compact previous memory and profile equal Phase 18.5. No tools, sampler or reasoning settings; num_ctx:16384, num_predict:1024, keep_alive:0, stream:true, truncate:false, shift:false. Diagnostic service deadline is outside the provider body. Independent review: /tmp/phase-18.6-candidate-request-review.json; capture: /tmp/phase-18.6-capture.json.

Frozen before inference: harness /tmp/phase-18.6-eval.ts SHA-256 **`2a034d9594556803ed5aa05bc5d877e1d85b5120a942b358351f46afe4ca760f`**; candidate capture SHA-256 **`8d5d89ff598d457a226ecd172eacc6026f879ee2a8d05d4fc25b7a5a08818303`**. Phase 18.5 comparison capture hash **`1606d2c344d72440009049b77e963dec31566698ccc01243c621468b3339d31a`**. Temporary harness changes are candidate assertions, artifact names and an additional identical-body comparison with Gemma; no inference behavior adaptation.

The exact Phase 18.5 focused deterministic scope passed before inference: **345 pass, 0 fail, 1577 assertions, 17 files**, Bun 1141 ms. Typecheck passed. Logs: /tmp/phase-18.6-before-live-focused.log and /tmp/phase-18.6-before-live-typecheck.log. Atomic host rejection, origin validation, provenance, keyed transitions, opportunistic ownership, post-answer release, interactive priority, cancellation/supersession, one unresolved semantic call, zero backlog, prefix/session/model/updater fencing and runtime disposal remain intact. Phase 17 embeddings/retrieval/index/0.65/top8/max3/deadline and Phase 18.1 nine tools/ToolRunner/recovery/mutation/approvals remain unchanged. The diagnostic may directly await finish; production remains opportunistic.

Full Phase 18.4, 18.5, 18.3, 18.2 and 18 records read; earlier records consulted only for protected boundaries. No applicable AGENTS.md. No deterministic implementation bug was discovered. Integrity evidence: /tmp/phase-18.6-integrity.py and /tmp/phase-18.6-integrity.json.

## Frozen corpus verification

Exact existing read-only corpus reused without reconstruction or edits. Frozen **2026-10-11T18:11:31.885Z**, digest above. All six previous memories, evidence, expected transitions and exact expectation prose equal the Phase 18.4 record. Full source-valid previous documents/events, current events, session IDs, fixture keys and evidence IDs also equal both saved historical captures. Historical corpus modelName qwen3.5:9b is fixture origin metadata and never selects an adapter. Cases restore independently; earlier candidate results cannot affect later prerequisites.

Exact JSON.stringify-equivalent serialized body hashes from the independent pre-inference review (only model differs from each Phase 18.5 request):

| Case | Candidate body SHA-256 |
| --- | --- |
| A | `eb1d2e4dc9a9612e8250f0e9cd2ca579ba46258c630fab22b7454a4b86996a3b` |
| B | `eb1767da5e5573a8c46c102d57bd79084a09a34cca33b9ab0ba7396a569d5650` |
| C | `6cafd795b3eda83acb0d491d974c426fc8bb5fa8ba4b4d9b45d5a80501a9b37c` |
| D | `f37eda6837d40cb70b8d79b89a7d63f5c5b93b76cc43231fc73b3ab9ef0dcfae` |
| E | `d41cc0a9c0a634177d6fe4801e9ceca4a351acac4a44edb23ba0c93d8376717a` |
| F | `2f67746c1dfec95a3b3d4dfeb4213b5b7c5f7b0ab35005b505bbf1ba477dd964` |

Six-case dry-run restored exact prerequisites through production provenance and applied the original expected deltas through production schema/host/atomic persistence with mocked responses: **six accepted fixture transitions, zero inference**, unchanged canonical events. These are evaluator checks, never candidate successes. /tmp/phase-18.6-dry-run.json.

Scoring is the unchanged applied-state method: correct, acceptable equivalent, false positive, false negative, wrong category, redundant operation, invalid evidence, unsupported evidence meaning, atomic rejection, schema failure, output-limit failure, timeout. No wording equality requirement or new success metric. Goal/keys/revocation/completion/evidence expectations are frozen; incomplete fragments do not count as operations.

## Candidate evidence

Single reviewed live process, exit 0. Started **2026-10-11T19:12:45.191Z**, ended **2026-10-11T19:14:22.689Z**, aggregate **97497.385428 ms**, within the single 190000 ms aggregate and 195-second external bound. Exactly **six ministral-3:14b inference requests**, one per A–F; **zero retries, Qwen/Gemma/alternate requests, downloads, prompt variants or budget experiments**. All six provider terminals are stop; no output-limit, diagnostic timeout, transport or parsed-schema failure. Live evaluation is permanently closed after F. No further live request was made.

```bash
timeout --signal=TERM --kill-after=2s 195s env TEST_MODEL=ministral-3:14b bun run --tsconfig-override /home/karoljaron/Projects/Local_Agentic_CLI/tsconfig.json /tmp/phase-18.6-eval.ts live > /tmp/phase-18.6-live.log 2>&1
```

Approved localhost execution used the pre-reviewed harness and exclusive /tmp/phase-18.6-live-started.json guard. No sandboxed live attempt preceded it; the earlier failed GET catalog check is not an inference retry. Only controlled fixtures and actual derived atomic stores under /tmp were used; no application session/preference/workspace state was written. Exact live result /tmp/phase-18.6-live-result.json SHA-256 **`3ae81eaa747ac600abf43e959353475a680a2e5bc38e57762794d5962e1a1fc0`**; frozen harness hash above remains exact. Six live wire bodies equal both historical captures after only model substitution. All six persisted documents independently resume through production exact-prefix/provenance validation with no updater/provider and zero inference; canonical events unchanged. /tmp/phase-18.6-final-review.ts and /tmp/phase-18.6-final-review.json.

**Six completed schema-valid deltas**, **five host-accepted**, **one atomic rejection (E)**; **seven accepted operations, four rejected operations**, no selective application. Full applied-state semantic transitions valid in **four cases A/B/C/F**. D is host-accepted but fails frozen semantic expectations. E retains the exact previous semantic state through atomic fallback. The original prerequisite model origin qwen3.5:9b retained in E failed metadata is fixture provenance, never Qwen inference.

Updater latency measures production preflight, provider stream and bounded parsing; finish adds host validation/fallback/compaction/atomic publication and observation overhead. <=10s uses observed updater settlement, as the frozen baseline. Final production-acceptable requires a completed host-valid, semantically valid applied transition within 10000 ms, assuming no supersession; this is observation, not a second 10-second run. The inherited harness field named productionAcceptance checks **host validity + timing only**. It is true in B/C/D; final frozen semantic scoring excludes **D** because the required restriction and matching task identity are absent. That raw harness flag is preserved unchanged and is not counted as semantic production success. The frozen Qwen/Gemma scores are never rescored.

| Case | Updater | Host | Accepted / rejected ops | Applied semantic classification | Updater ms | Finish ms | <=10s | Production-acceptable |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| A | fulfilled | accepted | 1 / 0 | correct | 29031.071 | 29033.778 | no | no |
| B | fulfilled | accepted | 1 / 0 | acceptable equivalent | 9012.967 | 9013.891 | yes | yes |
| C | fulfilled | accepted | 1 / 0 | acceptable equivalent | 8564.408 | 8565.119 | yes | yes |
| D | fulfilled | accepted | 1 / 0 | false negative | 9193.117 | 9193.861 | yes | no |
| E | fulfilled | atomic rejection | 0 / 4 | atomic rejection; unsupported evidence meaning | 22754.610 | 22755.332 | no | no |
| F | fulfilled | accepted | 3 / 0 | acceptable equivalent; two redundant operations | 18921.607 | 18922.402 | no | no |

No residency query or retention experiment occurred. Provider load/generation metadata below is an observation only, not a warm-state or keep-alive recommendation.

### A — raw provider result and applied state

Frozen expectation: Establish the local notes-index/search CLI goal. No invented decisions, restrictions or completion. A pending implementation item is acceptable only if grounded in the explicit objective and not-started evidence.

Classification: **correct**. One initial user-sourced high-level goal because previous goal is null. Exact current user quote supports it. No invented durable state, empty changes. Applied memory equals the frozen expected state. Semantically correct but too slow for production.

Start/end: **2026-10-11T19:12:45.195Z → 2026-10-11T19:13:14.226Z**. Updater **fulfilled**, error `None`. Host **accepted**, error `None`. Accepted/rejected operations **1 / 0**. Updater **29031.071085 ms**, finish **29033.778040 ms**; <=10s **no**; semantic validity **yes**; production-acceptable **no**. Atomic artifact directory: `/tmp/phase-18.6-live-A-XLNRrZ`.

Exact frozen current evidence:

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

Exact raw structured provider output (JSON string; preserved without repair):

```json
"{\"version\":1,\"goal\":{\"mode\":\"initial\",\"text\":\"Build a local CLI that indexes project notes and lets me search them.\",\"evidence\":{\"messageId\":\"p184-user-A\",\"quote\":\"Build a local CLI that indexes project notes and lets me search them.\"}},\"changes\":[]}"
```

Actual parsed/returned delta:

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

Resulting persisted SessionMemory:

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

Exact persisted boundary/updater/diagnostics:

```json
{
  "source": {
    "eventCount": 2,
    "lastEventId": "p184-event-A-assistant",
    "digest": "652bf49cdbc960dbd7d88f5c7463ad52d951af64ba449540ee4ffc9587275579"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "ministral-3:14b",
    "status": "updated"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 0,
    "observedEvents": 2
  }
}
```

Provider terminal metadata (duration fields in nanoseconds):

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-11T19:13:14.225459294Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 29027674969,
  "load_duration": 24236954237,
  "prompt_eval_count": 1132,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 967505000,
  "eval_count": 64,
  "eval_duration": 3816580000
}
```

### B — raw provider result and applied state

Frozen expectation: Preserve goal with goal:null. Add explicit pending indexing integration tests; no completion or replacement goal.

Classification: **acceptable equivalent**. Minimal goal:null plus one explicit pending task. integration-tests-indexing is an acceptable new identity because no pending task existed in B; the task text is a supported equivalent. Goal retained exactly; no completion. Independent fixtures mean this new key is not substituted into later cases. This does not certify end-to-end stability of self-generated task keys.

Start/end: **2026-10-11T19:13:14.230Z → 2026-10-11T19:13:23.243Z**. Updater **fulfilled**, error `None`. Host **accepted**, error `None`. Accepted/rejected operations **1 / 0**. Updater **9012.966505 ms**, finish **9013.891014 ms**; <=10s **yes**; semantic validity **yes**; production-acceptable **yes**. Atomic artifact directory: `/tmp/phase-18.6-live-B-6tHrDN`.

Exact frozen current evidence:

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

Exact raw structured provider output (JSON string; preserved without repair):

```json
"{\"version\":1,\"goal\":null,\"changes\":[{\"operation\":\"upsert\",\"category\":\"pending\",\"key\":\"integration-tests-indexing\",\"text\":\"Add integration tests for the indexing path\",\"evidence\":{\"messageId\":\"p184-user-B\",\"quote\":\"Now add integration tests for the indexing path.\"}}]}"
```

Actual parsed/returned delta:

```json
{
  "version": 1,
  "goal": null,
  "changes": [
    {
      "operation": "upsert",
      "category": "pending",
      "key": "integration-tests-indexing",
      "text": "Add integration tests for the indexing path",
      "evidence": {
        "messageId": "p184-user-B",
        "quote": "Now add integration tests for the indexing path."
      }
    }
  ]
}
```

Resulting persisted SessionMemory:

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
      "key": "integration-tests-indexing",
      "text": "Add integration tests for the indexing path",
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

Exact persisted boundary/updater/diagnostics:

```json
{
  "source": {
    "eventCount": 4,
    "lastEventId": "p184-event-B-assistant",
    "digest": "f7c1bb1e9cd7f93bbd475fc5f447c07d0ca6b272a194cb3c952a057f2105cc68"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "ministral-3:14b",
    "status": "updated"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 2,
    "observedEvents": 4
  }
}
```

Provider terminal metadata (duration fields in nanoseconds):

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-11T19:13:23.242884987Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 9011431235,
  "load_duration": 4228563544,
  "prompt_eval_count": 1147,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 906422000,
  "eval_count": 65,
  "eval_duration": 3871098000
}
```

### C — raw provider result and applied state

Frozen expectation: Preserve goal and pending, with no restatement. Add user-sourced SQLite metadata decision; no constraint for the choice, no settled Redis proposal.

Classification: **acceptable equivalent**. goal:null, user-sourced SQLite under decisions, with the supporting exact current user quote. database is an acceptable new semantic identity because no metadata decision existed in C, as permitted by the frozen wording-independent method. Redis absent from both full raw output and applied state; no proposal promoted. Existing goal/pending retained exactly.

Start/end: **2026-10-11T19:13:23.246Z → 2026-10-11T19:13:31.810Z**. Updater **fulfilled**, error `None`. Host **accepted**, error `None`. Accepted/rejected operations **1 / 0**. Updater **8564.408312 ms**, finish **8565.118570 ms**; <=10s **yes**; semantic validity **yes**; production-acceptable **yes**. Atomic artifact directory: `/tmp/phase-18.6-live-C-I2H9z6`.

Exact frozen current evidence:

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

Exact raw structured provider output (JSON string; preserved without repair):

```json
"{\"version\":1,\"goal\":null,\"changes\":[{\"operation\":\"upsert\",\"category\":\"decisions\",\"key\":\"database\",\"text\":\"Use SQLite for metadata storage.\",\"evidence\":{\"messageId\":\"p184-user-C\",\"quote\":\"Use SQLite for metadata instead of PostgreSQL.\"}}]}"
```

Actual parsed/returned delta:

```json
{
  "version": 1,
  "goal": null,
  "changes": [
    {
      "operation": "upsert",
      "category": "decisions",
      "key": "database",
      "text": "Use SQLite for metadata storage.",
      "evidence": {
        "messageId": "p184-user-C",
        "quote": "Use SQLite for metadata instead of PostgreSQL."
      }
    }
  ]
}
```

Resulting persisted SessionMemory:

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
      "key": "database",
      "text": "Use SQLite for metadata storage.",
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

Exact persisted boundary/updater/diagnostics:

```json
{
  "source": {
    "eventCount": 6,
    "lastEventId": "p184-event-C-assistant",
    "digest": "356806d0163f7a7beb215ce86ac33e296c40ddf2a6e837df97014f2306f9ce3b"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "ministral-3:14b",
    "status": "updated"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 4,
    "observedEvents": 6
  }
}
```

Provider terminal metadata (duration fields in nanoseconds):

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-11T19:13:31.81038209Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 8563502461,
  "load_duration": 3977561380,
  "prompt_eval_count": 1182,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 913589000,
  "eval_count": 63,
  "eval_duration": 3667782000
}
```

### D — raw provider result and applied state

Frozen expectation: Preserve goal/SQLite/pending without restatement. Add user-sourced persistent terminal-UI constraint and missing-fixture unresolved problem under indexing-integration-tests.

Classification: **false negative**. Only a supported missing-fixture problems upsert is returned. Persistent terminal-UI constraint is omitted. The blocker uses missing-test-fixture instead of existing pending task identity indexing-integration-tests, violating the same-task-key instruction and preventing automatic matching completion clearing for this state. The expected same-key blocker is absent; a genuine blocker is present under a separate key. No SQLite restatement, unsupported accepted claim or goal reissue. Host accepts this origin-valid delta within 10 seconds, but the full frozen transition is semantically invalid and therefore production-acceptable is no.

Start/end: **2026-10-11T19:13:31.813Z → 2026-10-11T19:13:41.006Z**. Updater **fulfilled**, error `None`. Host **accepted**, error `None`. Accepted/rejected operations **1 / 0**. Updater **9193.117211 ms**, finish **9193.860849 ms**; <=10s **yes**; semantic validity **no**; production-acceptable **no**. Atomic artifact directory: `/tmp/phase-18.6-live-D-4TBU6t`.

Exact frozen current evidence:

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

Exact raw structured provider output (JSON string; preserved without repair):

```json
"{\"version\":1,\"goal\":null,\"changes\":[{\"operation\":\"upsert\",\"category\":\"problems\",\"key\":\"missing-test-fixture\",\"text\":\"Test fixture for indexing integration tests is missing.\",\"evidence\":{\"messageId\":\"p184-user-D\",\"quote\":\"the test fixture is missing; this blocker is unresolved.\"}}]}"
```

Actual parsed/returned delta:

```json
{
  "version": 1,
  "goal": null,
  "changes": [
    {
      "operation": "upsert",
      "category": "problems",
      "key": "missing-test-fixture",
      "text": "Test fixture for indexing integration tests is missing.",
      "evidence": {
        "messageId": "p184-user-D",
        "quote": "the test fixture is missing; this blocker is unresolved."
      }
    }
  ]
}
```

Resulting persisted SessionMemory:

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
  "problems": [
    {
      "key": "missing-test-fixture",
      "text": "Test fixture for indexing integration tests is missing.",
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

Exact persisted boundary/updater/diagnostics:

```json
{
  "source": {
    "eventCount": 8,
    "lastEventId": "p184-event-D-assistant",
    "digest": "8de3285b93e5687315e7026e75be22e3a85d711f7b6da9903c96c3c3ca8b0879"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "ministral-3:14b",
    "status": "updated"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 6,
    "observedEvents": 8
  }
}
```

Provider terminal metadata (duration fields in nanoseconds):

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-11T19:13:41.006043034Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 9192230492,
  "load_duration": 4078791364,
  "prompt_eval_count": 1220,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 947653000,
  "eval_count": 71,
  "eval_duration": 4160287000
}
```

### E — raw provider result and applied state

Frozen expectation: Preserve goal/pending/problem without restatement. Remove terminal-ui constraint; upsert metadata-store as user-sourced PostgreSQL, leaving exactly one active metadata choice.

Classification: **atomic rejection; unsupported evidence meaning**. Complete schema-valid goal:null delta requests terminal-ui removal, metadata-store removal, metadata-store PostgreSQL upsert, and an unsupported indexing-integration-tests problem removal. Remove + upsert duplicate decisions:metadata-store; host throws Error: Conflicting operations. at the third operation, rejecting all four atomically. Current assistant quote for problem removal exists exactly but says only that the restriction is revoked and PostgreSQL is chosen; it does not resolve the fixture blocker. That fourth operation never reaches host validation because of the earlier duplicate-key rejection. No fabricated quote. SQLite and revoked terminal-ui remain in fallback; PostgreSQL is not added, pending/problem preserved. No contradictory SQLite+PostgreSQL pair is accepted and no partial revocation is published.

Start/end: **2026-10-11T19:13:41.008Z → 2026-10-11T19:14:03.763Z**. Updater **fulfilled**, error `None`. Host **atomic rejection**, error `Error: Conflicting operations.`. Accepted/rejected operations **0 / 4**. Updater **22754.609929 ms**, finish **22755.331623 ms**; <=10s **no**; semantic validity **no**; production-acceptable **no**. Atomic artifact directory: `/tmp/phase-18.6-live-E-SGkv6z`.

Exact frozen current evidence:

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

Exact raw structured provider output (JSON string; preserved without repair):

```json
"{\n  \"version\": 1,\n  \"goal\": null,\n  \"changes\": [\n    {\n      \"operation\": \"remove\",\n      \"category\": \"constraints\",\n      \"key\": \"terminal-ui\",\n      \"evidence\": {\n        \"messageId\": \"p184-user-E\",\n        \"quote\": \"You can change the terminal UI now.\"\n      }\n    },\n    {\n      \"operation\": \"remove\",\n      \"category\": \"decisions\",\n      \"key\": \"metadata-store\",\n      \"evidence\": {\n        \"messageId\": \"p184-user-E\",\n        \"quote\": \"use PostgreSQL instead of SQLite.\"\n      }\n    },\n    {\n      \"operation\": \"upsert\",\n      \"category\": \"decisions\",\n      \"key\": \"metadata-store\",\n      \"text\": \"Use PostgreSQL for metadata.\",\n      \"evidence\": {\n        \"messageId\": \"p184-user-E\",\n        \"quote\": \"use PostgreSQL instead of SQLite.\"\n      }\n    },\n    {\n      \"operation\": \"remove\",\n      \"category\": \"problems\",\n      \"key\": \"indexing-integration-tests\",\n      \"evidence\": {\n        \"messageId\": \"p184-assistant-E\",\n        \"quote\": \"The earlier terminal UI restriction is revoked, and PostgreSQL is now the metadata choice.\"\n      }\n    }\n  ]\n}"
```

Actual parsed/returned delta:

```json
{
  "version": 1,
  "goal": null,
  "changes": [
    {
      "operation": "remove",
      "category": "constraints",
      "key": "terminal-ui",
      "evidence": {
        "messageId": "p184-user-E",
        "quote": "You can change the terminal UI now."
      }
    },
    {
      "operation": "remove",
      "category": "decisions",
      "key": "metadata-store",
      "evidence": {
        "messageId": "p184-user-E",
        "quote": "use PostgreSQL instead of SQLite."
      }
    },
    {
      "operation": "upsert",
      "category": "decisions",
      "key": "metadata-store",
      "text": "Use PostgreSQL for metadata.",
      "evidence": {
        "messageId": "p184-user-E",
        "quote": "use PostgreSQL instead of SQLite."
      }
    },
    {
      "operation": "remove",
      "category": "problems",
      "key": "indexing-integration-tests",
      "evidence": {
        "messageId": "p184-assistant-E",
        "quote": "The earlier terminal UI restriction is revoked, and PostgreSQL is now the metadata choice."
      }
    }
  ]
}
```

Resulting persisted SessionMemory:

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

Exact persisted boundary/updater/diagnostics:

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

Provider terminal metadata (duration fields in nanoseconds):

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-11T19:14:03.762851324Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 22753370070,
  "load_duration": 3965704873,
  "prompt_eval_count": 1270,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 937810000,
  "eval_count": 295,
  "eval_duration": 17844214000
}
```

### F — raw provider result and applied state

Frozen expectation: Preserve goal/PostgreSQL without restatement. Upsert meaningful completed indexing-integration-tests; host clears matching pending and semantic problem. Equivalent explicit removals plus completion are semantically acceptable but redundant.

Classification: **acceptable equivalent; two redundant operations**. goal:null; same-key pending/problem removals followed by meaningful completed indexing-integration-tests upsert. The completed category/key and supported task text establish completion; matching pending/problem clear and PostgreSQL/goal remain byte-equivalent. Explicit removals are acceptable but redundant relative to the completed upsert, even though emitted before it. The completion quote supports the completed-task transition and its matching problem removal under the frozen completion semantics. No invented or non-entailing accepted operation. Correct completion occurs outside production timing.

Start/end: **2026-10-11T19:14:03.766Z → 2026-10-11T19:14:22.687Z**. Updater **fulfilled**, error `None`. Host **accepted**, error `None`. Accepted/rejected operations **3 / 0**. Updater **18921.607279 ms**, finish **18922.401871 ms**; <=10s **no**; semantic validity **yes**; production-acceptable **no**. Atomic artifact directory: `/tmp/phase-18.6-live-F-YmDGW8`.

Exact frozen current evidence:

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

Exact raw structured provider output (JSON string; preserved without repair):

```json
"{\n  \"version\": 1,\n  \"goal\": null,\n  \"changes\": [\n    {\n      \"operation\": \"remove\",\n      \"category\": \"pending\",\n      \"key\": \"indexing-integration-tests\",\n      \"evidence\": {\n        \"messageId\": \"p184-user-F\",\n        \"quote\": \"The indexing integration tests are completed and passing now.\"\n      }\n    },\n    {\n      \"operation\": \"remove\",\n      \"category\": \"problems\",\n      \"key\": \"indexing-integration-tests\",\n      \"evidence\": {\n        \"messageId\": \"p184-user-F\",\n        \"quote\": \"The indexing integration tests are completed and passing now.\"\n      }\n    },\n    {\n      \"operation\": \"upsert\",\n      \"category\": \"completed\",\n      \"key\": \"indexing-integration-tests\",\n      \"text\": \"Added and passed integration tests for the indexing path.\",\n      \"evidence\": {\n        \"messageId\": \"p184-user-F\",\n        \"quote\": \"The indexing integration tests are completed and passing now.\"\n      }\n    }\n  ]\n}"
```

Actual parsed/returned delta:

```json
{
  "version": 1,
  "goal": null,
  "changes": [
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
        "quote": "The indexing integration tests are completed and passing now."
      }
    },
    {
      "operation": "upsert",
      "category": "completed",
      "key": "indexing-integration-tests",
      "text": "Added and passed integration tests for the indexing path.",
      "evidence": {
        "messageId": "p184-user-F",
        "quote": "The indexing integration tests are completed and passing now."
      }
    }
  ]
}
```

Resulting persisted SessionMemory:

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
      "text": "Added and passed integration tests for the indexing path.",
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

Exact persisted boundary/updater/diagnostics:

```json
{
  "source": {
    "eventCount": 12,
    "lastEventId": "p184-event-F-assistant",
    "digest": "8213f08494207d73edb870dc074a71aa6bd9bb42e75bc1f8ee71af3826b23630"
  },
  "updater": {
    "version": "structured-delta-v1",
    "model": "ministral-3:14b",
    "status": "updated"
  },
  "diagnostics": {
    "semanticAttempts": 1,
    "resumeEvents": 10,
    "observedEvents": 12
  }
}
```

Provider terminal metadata (duration fields in nanoseconds):

```json
{
  "model": "ministral-3:14b",
  "created_at": "2026-10-11T19:14:22.687460658Z",
  "message": {
    "role": "assistant",
    "content": ""
  },
  "done": true,
  "done_reason": "stop",
  "total_duration": 18920749700,
  "load_duration": 3925427254,
  "prompt_eval_count": 1243,
  "prompt_eval_cached_count": 0,
  "prompt_eval_duration": 932705000,
  "eval_count": 235,
  "eval_duration": 14056856000
}
```

## Three-model comparison

Qwen is the exact final Phase 18.4 A–F baseline; Gemma is the exact Phase 18.5 A–F baseline. No earlier Phase 18.2/18.4 pre-correction output substitutes for these final baselines. No previous model was rerun or rescored. Phase 18.5's **Outcome C — inconclusive** is its historical conclusion; Phase 18.6 uses the new four-outcome definitions in the user request. This is a direct observation comparison, not a statistical leaderboard.

| Case | qwen3.5:9b | gemma4:12b | ministral-3:14b | Ministral <=10s | Ministral production-acceptable |
| --- | --- | --- | --- | --- | --- |
| A | Correct initial goal, >10s | Correct initial goal, too slow | Correct initial goal, 29031.071 ms | no | no |
| B | Output-limit failure; pending absent | Output-limit failure; pending absent | goal:null + pending; accepted equivalent, 9012.967 ms | yes | yes |
| C | SQLite correctly decisions/Redis excluded; existing goal reissued as initial; entire delta rejected atomically | Output-limit failure; raw fragment repeats existing goal with invalid current quote | goal:null; accepted SQLite decision/Redis excluded; pending preserved, 8564.408 ms | yes | yes |
| D | Redundant SQLite decision with unsupported current evidence accepted; required constraint/problem omitted | Output-limit failure; plausible constraint prefix, no complete delta | Supported blocker recorded under separate key; required restriction absent, 9193.117 ms; full transition invalid | yes | no |
| E | Output-limit failure; reversal unapplied; old restriction/SQLite retained | Output-limit failure; reversal unapplied; old restriction/SQLite retained | Complete delta, duplicate decision target and unsupported blocker removal; atomic rejection, 22754.610 ms; old restriction/SQLite retained | no | no |
| F | Existing goal reissued as initial with invalid evidence; completion absent; atomic rejection | Accepted completion equivalent; goal:null, completed recorded, pending/problem cleared, PostgreSQL preserved; two removals redundant | Accepted completion equivalent; goal:null, completed recorded, pending/problem cleared, PostgreSQL preserved; two removals redundant; 18921.607 ms | no | no |

| Failure class | Qwen | Gemma | Ministral |
| --- | --- | --- | --- |
| unchanged goal reissued | C/F completed deltas; rejected | B/C unvalidated length-ended fragments | 0; B–F all completed goal:null |
| wrong decision/constraint category | 0 in frozen final C; SQLite correctly decisions | 0 observed in C prefix; completed C unavailable | 0; C decisions correct; D restriction omitted |
| unaccepted proposal promoted | 0 in C raw/applied | 0 in C raw/applied; no completed C | 0; full accepted C excludes Redis |
| unsupported evidence meaning | D accepted SQLite claim; C rejected goal claim | 0 accepted; B/C invalid quotes in fragments; E incomplete attribution issue | 0 accepted; 1 generated E blocker removal, rejected/unreached after conflict |
| reversal failed | E output-limit failure | E output-limit failure | E complete delta rejected for duplicate decisions:metadata-store |
| completion failed | F atomic rejection; no completed | 0 semantically; accepted F too slow | 0 semantically; accepted F too slow |
| output-limit exhaustion | 2: B/E, eval_count 1024 | 4: B/C/D/E, eval_count 1024 | 0; all six stop, counts 64/65/63/71/295/235 |
| <=10 s valid result | 0; F <=10s but invalid | 0; no case <=10s | 2: B/C; D <=10s but invalid |
| production-acceptable result | 0 | 0 | 2: B/C |

### Evidence-quality audit

**Seven accepted operations with semantically supporting exact current evidence; zero accepted operations with origin-valid but non-entailing evidence; zero invalid/fabricated quotes; zero invalid claims in incomplete output** (all six completed). Supported accepted operations are A goal (1), B pending (1), C decision (1), D blocker (1), F removals/completion (3). D's omission/identity error does not make its actual blocker claim non-entailing. F's completed-task evidence supports automatic same-key semantic problem clearing under the frozen contract; the explicit removal is redundant, not fabricated.

**One non-entailing generated E operation**, removing the tests problem with assistant evidence only about UI permission/database choice. Its quote exists exactly but does not support resolution. It is inside a parsed delta rejected atomically for an earlier duplicate decisions key; the host never validates this fourth operation. None is accepted. This is distinct from incomplete-output claims (0 for Ministral) and from nonexistent quotes (0). Do not infer an entailment guarantee from the seven accepted examples. The host still establishes origin rather than semantic meaning; no entailment checker or selective application is added.

Frozen Qwen D is the recorded accepted non-entailing operation; frozen Qwen C's unrelated goal evidence and F's absent quote are rejected. Frozen Gemma A/F accepted operations all have supporting evidence (4); B/C have apparent invalid goal quotes in unvalidated output, and E's incomplete attribution is uncredited. These distinctions preserve the authoritative baseline wording and do not rescore either model.

### Output-limit audit

| Model | Terminal reasons A–F | eval_count A–F | 1024 exhausted / output-limit failures |
| --- | --- | --- | --- |
| qwen3.5:9b (frozen) | stop / length / stop / stop / length / stop | 460 / 1024 / 504 / 483 / 1024 / 335 | 2: B/E |
| gemma4:12b (frozen) | stop / length / length / length / length / stop | 165 / 1024 / 1024 / 1024 / 1024 / 600 | 4: B/C/D/E |
| ministral-3:14b | stop / stop / stop / stop / stop / stop | 64 / 65 / 63 / 71 / 295 / 235 | 0 |

Every terminal reason/count is retained above or in its read-only baseline record. The same 1024 cap produced bounded final JSON in all Ministral cases. No malformed fragment, hidden reasoning, partial output or cap increase was credited as a success. This observation substantially reduces the prior generation-protocol pathology for this candidate; it neither identifies its provider-internal cause nor certifies other model families.

### Timing audit

Timing and semantic state remain separate axes. **Three Ministral cases <=10s (B/C/D)**, **four fully valid semantic transitions (A/B/C/F)**, **two production-acceptable cases (B/C)**. A/F are semantically valid but too slow. D is fast and host-accepted but incomplete/wrong task identity. E is complete structured output but rejected and too slow. No 10-second replay was performed. Production still remains 10000 ms.

A terminal frame reports 24236.954237 ms loading out of 29027.674969 ms provider total. Other candidate terminal load times are about 3925–4229 ms; E/F generation takes 17844.214 / 14056.856 ms. These existing terminal observations explain parts of measured latency; residency was not queried and no warm/cold or retention conclusion is drawn.

## Architectural decision

**Outcome A — model capability is strongly implicated.** Ministral materially succeeds on **B** (minimal subordinate pending), **C** (settled decision/proposal separation with no goal reissue), and **F** (meaningful same-key completion and clearing), where the recorded Qwen/Gemma evidence was limited or failed. All five follow-ups return goal:null, all six finish structured output well below 1024, and all accepted claims have supporting evidence. This satisfies several predeclared Outcome A indicators under the exact generic frozen contract. The existing architecture demonstrably can perform these transitions without a family-specific prompt or host workaround. Prior failures therefore cannot responsibly be treated as proof that those transition semantics are inherently unworkable in this architecture.

The conclusion is limited. **D still fails the combined restriction/blocker/task-key expectation**, and **E still fails actual reversal**. Across three models no complete D or E transition was applied. Qwen/Gemma E never produced completed deltas, while Ministral E produces a concrete duplicate-target violation plus a non-entailing problem removal; their common stale result has different observed mechanisms. Missing restriction, identity mistakes and conflicting operations remain real extractor-contract limitations. They do not establish a host validation bug or justify accepting part of E. Four isolated semantic successes and two production-acceptable observations do not certify universal correctness, full lifecycle coverage, end-to-end self-generated key stability or adequate production reliability.

Outcome B is not the primary conclusion because repeated goals and completion failure do not persist in the completed Ministral follow-ups, and several critical transitions now succeed. Outcome C is not dominant across all three because Ministral completes all six bounded deltas with zero exhaustion. Outcome D is unnecessary because six completed comparable outputs and concrete successful/failed transitions provide enough evidence for the limited A conclusion. No statistical superiority or universal model-capability claim is made.

**Exactly one primary next direction: Direction 1 — current design retained.** Keep the generic architecture and document capability expectations around minimal deltas, unchanged-goal nulls, stable task keys, one operation per target, complete reversal, evidence meaning and bounded final structure. Any later model-selection guidance is a separate investigation; do not automatically change the selected/default model. D/E remain explicit unresolved acceptance requirements in that future work. This phase implements no redesign, classifier, provider protocol change, entailment guard, default-model change or prompt tuning. Final model qualification is closed: no fourth model, second Ministral run or failed-case rerun is recommended.

## Final state

Qualification and verification complete. Production remains unchanged. Only docs/progress/phase-18.6-progress.md is added in the repository; all artifacts/harness/scoring are under /tmp. Starting/final HEAD remains **1262975b6f35a17055e8ddc5a91d5a9df712c1d0**. Historical records and all **211 tracked files** are byte-equal, including **105 production/configuration files** also unchanged from Phase 18.5, and all **13 baseline .env/application-state files** retain their hashes. Empty tracked/index diff. No staging or commit. No production or frozen harness change followed live output; only this record and disposable evidence-review scripts changed after F. No inference followed F.

### Requested final answers

1. **Candidate integrity:** ministral-3:14b was already installed beforehand, exactly one catalog match, and was used exclusively for all six inference requests. .env already named it; the explicit identical override was disposable. Zero downloads or previous/alternate-model requests.
2. **Contract integrity:** exact Phase 18.4 final instruction/schema/corpus, host, evidence/provenance, context/settings/output cap/deadline/keep-alive verified unchanged. Only candidate model identity and the outside-body diagnostic service deadline differ from production. Every actual request matches the before-inference capture.
3. **A–F results:** A correct 29031.071 / 29033.778 ms; B accepted pending equivalent 9012.967 / 9013.891; C accepted SQLite decision equivalent 8564.408 / 8565.119; D required constraint and same-key blocker expectation fail 9193.117 / 9193.861; E atomic reversal rejection 22754.610 / 22755.332; F accepted completion equivalent 18921.607 / 18922.402. Times are updater / finish; complete raw/delta/state/error evidence above.
4. **Goal behavior:** no existing goals repeated. A establishes initial; all B–F goal:null and existing goal retained. No false operational replacement.
5. **Decision / constraint:** C correctly classifies and applies SQLite as decisions. D does not add the terminal-UI constraint; it records a supported blocker using a separate task key and therefore fails the complete expectation. No non-entailing SQLite restatement.
6. **Proposal exclusion:** Redis excluded from the full completed C response and applied state.
7. **Reversal:** E fails: same decisions:metadata-store target removed and upserted, atomic conflict. Terminal-ui/SQLite remain, PostgreSQL not applied, goal/pending/problem preserved. An unrelated problem removal is additionally unsupported and never reached by host validation.
8. **Completion:** F creates completed indexing-integration-tests, clears matching pending/problem and preserves PostgreSQL/goal; two explicit removals are acceptable but redundant. This correct diagnostic result exceeds production timing.
9. **Evidence entailment:** zero accepted non-entailing operations, seven accepted supporting operations, zero fabricated quotes, zero incomplete-output claims. One non-entailing E problem removal is generated inside the rejected delta. Host origin checks remain distinct from entailment.
10. **Output budget:** Qwen 2, Gemma 4, Ministral 0 output-limit failures; fixed 1024 unchanged. All six Ministral terminals stop, eval_count 64/65/63/71/295/235.
11. **Timing:** three Ministral cases settle <=10s (B/C/D), four are fully semantically valid (A/B/C/F), two satisfy both and would be production-acceptable (B/C). D is fast but semantically invalid; A/F correct but slow. No production replay.
12. **Three-model conclusion:** Phase 18.6 **Outcome A — model capability is strongly implicated**, limited to observed transitions; D/E and complete production reliability remain unqualified.
13. **Next architectural direction:** exactly one primary direction, **Direction 1 — current design retained**; document capability expectations, with any future model-selection guidance separate. No automatic default change, fourth model, rerun or redesign implementation.
14. **Production impact:** only this progress record added; no source/test/config/environment/history/preferences/lifecycle/retrieval/tools/model-specific/provider-specific production changes. No commit.

### Final summary table

| Item | Final value |
| --- | --- |
| qwen baseline source | [Phase 18.4](phase-18.4-progress.md), exact final A–F |
| gemma baseline source | [Phase 18.5](phase-18.5-progress.md), exact A–F; historical qualification C — inconclusive |
| previous-model reruns | 0; no rescoring |
| candidate | ministral-3:14b |
| installed beforehand | yes; exact one catalog match, dated 2026-10-09 |
| candidate inference requests | 6, maximum honored |
| attempts per case | 1 |
| retries | 0 |
| frozen cases | 6, exact A–F |
| production deadline | 10000 ms unchanged |
| evaluation deadline | 30000 ms per case; 190000 ms aggregate / 195 s external, run 97497.385428 ms |
| semantic output cap | 1024 unchanged |
| OLLAMA_KEEP_ALIVE | 0 unchanged |
| goal handling | A initial correct; B–F null, no unchanged goal reissue |
| decision handling | C correct accepted SQLite; E duplicate-target rejection |
| constraint handling | D omitted terminal-UI; E revocation unapplied |
| proposal exclusion | Redis excluded from full accepted C |
| reversal | E atomic rejection; stale restriction/SQLite retained |
| completion | F meaningful completed, pending/problem cleared, PostgreSQL retained; two redundant removals |
| unsupported accepted evidence | 0; 7 accepted supporting operations; 1 unsupported E removal generated but rejected/unreached |
| qwen output-limit failures | 2, frozen B/E |
| gemma output-limit failures | 4, frozen B/C/D/E |
| ministral output-limit failures | 0 measured; all six stop |
| ministral cases <=10s | 3: B/C/D |
| ministral semantically valid cases | 4: A/B/C/F |
| ministral production-acceptable cases | 2: B/C; D host/timing eligibility is not semantic success |
| three-model qualification | Outcome A — model capability is strongly implicated |
| recommended next direction | Direction 1 — current design retained; document capability expectations |
| production source changes | none |
| Phase 18.3 lifecycle changes | none |
| Phase 17 retrieval changes | none |
| Phase 18.1 tool changes | none |
| model-specific production logic | none |
| provider-specific production logic | none added |
| schema-valid / host-accepted deltas | 6 / 5; one atomic rejection |
| accepted / rejected operations | 7 / 4 |
| invalid/fabricated quotes | 0 |
| incomplete-output claims | 0 |
| verification inference | 0 |
| .env/default/preferences changes | none; 13 state-file hashes unchanged |
| prompt tuning / output-budget experiments | 0 / 0 |
| downloads / residency experiments | 0 / 0 |
| additional evaluation after F | 0; mandatory stopping rule honored |
| repository change | docs/progress/phase-18.6-progress.md only |
| staging / commit | none / none |

### Final validation

The required final checks use exactly the Phase 18.5 focused deterministic scope, not stochastic-output assertions. Full Linux/Windows/release gates are not rerun for this documentation-only qualification.

```bash
bun test src/application/services/SessionMemoryService.test.ts src/application/services/SessionMemoryLifecycle.test.ts src/application/services/ModelSessionMemoryUpdater.test.ts src/application/services/ContextBuilderMemory.test.ts src/application/use-cases/RunAgentTurnMemory.test.ts src/composition/createRuntimeMemory.test.ts src/infrastructure/persistence/JsonSessionMemoryStore.test.ts src/infrastructure/model/OllamaMemoryExtraction.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts src/composition/config.test.ts src/application/use-cases/RunAgentTurnToolRecovery.test.ts src/infrastructure/tools/ToolDefinitions.test.ts src/application/services/HistoryRetriever.test.ts src/application/services/ContextBuilderRetrieval.test.ts src/application/use-cases/RunAgentTurnRetrieval.test.ts src/composition/createRuntimeRetrieval.test.ts src/presentation/Conversation.test.ts > /tmp/phase-18.6-final-focused.log 2>&1
bun run typecheck > /tmp/phase-18.6-final-typecheck.log 2>&1
git diff --check
git diff --no-index --check /dev/null docs/progress/phase-18.6-progress.md
git status --short --untracked-files=all
```

| Check | Final result | Evidence |
| --- | --- | --- |
| Exact Phase 18.5 focused deterministic suite | **345 pass, 0 fail, 1577 assertions, 17 files**, exit 0, Bun 1134 ms | /tmp/phase-18.6-final-focused.log |
| bun run typecheck | pass, exit 0 | /tmp/phase-18.6-final-typecheck.log |
| Frozen source/record/corpus verification | 211 tracked files unchanged; 105 production/config files also equal Phase 18.5; exact instruction/schema/corpus hashes | /tmp/phase-18.6-integrity.json, /tmp/phase-18.6-final-integrity.log |
| Pre-inference actual request comparison | six mocked serializations; only model differs from Phase 18.4/18.5; zero inference | /tmp/phase-18.6-candidate-request-review.json |
| Prerequisite/expected-transition dry-run | six accepted fixture transitions; zero inference, canonical events unchanged | /tmp/phase-18.6-dry-run.json |
| Post-live request/document/resume audit | all six exact bodies/documents match; six production provenance resumes; canonical events unchanged; 13 state hashes unchanged; zero verification inference | /tmp/phase-18.6-final-review.json |
| Applied semantic scoring review | A/B/C/F valid; B/C production-acceptable; D omitted restriction/wrong task key; E atomic rejection; evidence entailment separately audited | /tmp/phase-18.6-scoring.json |
| Complete progress/evidence reconciliation | **36 JSON blocks** parse and equal all six current evidence/raw text/delta/state/boundary/terminal groups; frozen expectations and timing transcription exact; baseline terminal metadata faithful without rescoring | /tmp/phase-18.6-document-review.json |
| git diff --check | pass, exit 0, no diagnostics | final document review |
| New-record whitespace check | no diagnostics; no-index exit 1 means expected new-file difference | final document review |
| git status --short --untracked-files=all | exactly `?? docs/progress/phase-18.6-progress.md` | final document review |

Only the progress record changed after successful final tests/typecheck. Final document, source identity, whitespace and status checks were repeated after the status update; no additional tests, inference, full build/release gates or model evaluation were performed.
