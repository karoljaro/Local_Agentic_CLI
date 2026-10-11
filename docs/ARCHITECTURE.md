# Architecture

Local Agentic CLI is currently a small local coding-agent MVP. The architecture is close to clean architecture: domain and application code define behavior and contracts, while infrastructure adapts those contracts to Bun, Ollama, JSONL files, ripgrep, and the local file system.

The project should stay simple. Add new layers only when they remove real duplication or make an existing boundary clearer.

## Layers

### Domain

`src/domain` contains pure types and state shapes:

- `AgentEvent` for durable JSONL session events;
- `AgentState` for rebuilt session state;
- `ModelMessage` for messages sent to the model;
- `Tool` for model-visible tool definitions and tool calls;
- branded ids in `Ids`.

Domain code should not import infrastructure, Bun APIs, React, Ollama, file-system APIs, or process state.

### Application

`src/application` contains ports, services, and use-cases.

Important pieces:

- ports such as `ModelPort`, `SessionStorePort`, `ToolExecutorPort`, `WorkspaceFilePort`, and `WorkspaceSearchPort`;
- `AgentLoop`, exported through the existing `RunAgentTurn` use-case name, for model rounds, context, streaming, and stop conditions;
- `ToolRunner` for tool preparation, approval, execution, per-turn deduplication, and tool lifecycle events;
- `ContextBuilder`, which compiles exact current/history messages and optional derived notes within the configured context/output/safety budget;
- `SessionMemoryService` and `ModelSessionMemoryUpdater`, which maintain optional derived session state through exact event projection and bounded semantic deltas;
- `InMemoryAgentMetrics`, which retains bounded resource summaries for the latest completed turns;
- `SessionReducer`, which rebuilds chat/model state from durable events;
- `EditWorkspaceFile`, which owns exact-match batch validation and optimistic concurrency policy.

Application code should depend on ports and domain types, not concrete adapters.

### Infrastructure

`src/infrastructure` contains concrete adapters:

- `OllamaModelAdapter` for Ollama chat/tool-call streaming;
- `JsonlSessionStore` for `.agent/sessions/<session-id>/events.jsonl`;
- `NodeWorkspaceFileSystem` for workspace file access;
- `RipgrepSearch` for content search;
- `LocalToolRegistry` and local tool definitions for model-visible workspace tools.

Read-only tools run automatically. Mutating tools require approval:

- read-only: `list_directory`, `find_files`, `read_file`, `search_text`;
- mutating: `create_file`, `edit_file`, `replace_file`, `move_file`, `delete_path`.

Each local tool owns one strict Zod input schema, its bound execution function, and approval/cache
metadata. The registry generates the model JSON Schema from that schema. A complete model-call
batch is prepared once before execution: provider selection and input parsing happen once, and
execution uses the prepared function without another lookup. Raw public execution also validates.
`ToolRunner` owns approval, cancellation, lifecycle persistence, and result references; providers
never request approval. Results enter model context only after a completed or failed event.

`list_directory` defaults to one level, permits depth 1–5, and returns bounded typed entries.
`find_files` performs bounded path discovery with `*`, `**`, and `?` glob matching.
`search_text` accepts literal single-line text and uses a fixed ripgrep binary/options; incremental NDJSON parsing,
result limits, timeout, and process cleanup remain inside the search adapter.
`read_file` preserves bounded lines/characters and exact UTF-16 `nextRead` continuation. Its
content version is a SHA-256 digest of decoded text, required for whole-file replacement.
Repeated listing, finding, and searching in one turn reuse persisted result references;
`read_file` always executes again. Approved mutation attempts clear those references before
execution, including failures that may have created parent directories.

`create_file` safely creates missing parents and publishes completed content without overwrite.
`edit_file` validates 1–50 unique, nonoverlapping exact matches against the original contents and
performs one final write. Edit strings remain literal after JSON/schema decoding.
Edits and replacements whose resulting contents equal the original return `changed: false`
without a write; the edit count describes validated replacements.
`replace_file` requires a matching read version; edits and replacements also check for changes
between their internal read and write, then publish through a same-directory temporary file and
atomic rename. These checks do not promise protection from every external race or crash durability.
`move_file` handles regular files with exclusive hard-link creation followed by source unlink;
it refuses overwrite and is not an atomic two-name transaction. `delete_path` uses unlink or rmdir
and accepts only files or empty directories. Move/delete reject symlinks and the workspace root.
Empty newly created parents can remain after failure or cancellation; source-unlink failure can
leave both move paths. Completed creates report any leftover temporary file in `warnings`;
failed writes retain their original cause and identify any failed cleanup. Temporary paths are
owned through exclusive FileHandles and only owned files are cleaned. Cancellation is checked
between preparation steps, while filesystem commit
and cleanup already started are awaited before reporting their actual outcome.

All workspace tools enforce lexical and realpath containment and the protected-path/env policy in
the filesystem/search adapters. No model-facing shell, process, git, package-manager, arbitrary
network, directory-move, or recursive-delete capability is registered.

### Composition

`src/composition` wires the runtime:

- config reading and validation;
- clock and id generator;
- Ollama model adapter;
- JSONL session store;
- local tool registry factory;
- runtime methods used by the UI.

This layer is the right place for dependency wiring. The project does not need a DI container for the current scope.

`runtime.getAgentMetrics(sessionId?)` exposes diagnostics for the latest 100 completed turns. Each
summary includes model round count, total/max serialized model-input characters, and total/max tool
output characters and execution time, globally and per tool. Request size is measured before Ollama
mapping and excludes `AbortSignal`; tool time excludes approval wait. Metrics are process-local,
are not appended to session JSONL, and diagnostic failures are isolated from agent behavior.

### Presentation

The terminal UI starts at `index.ts` and `src/presentation/start.ts`. It uses OpenTUI Core directly.
`Conversation` owns presentation-side runtime subscriptions and turn/session lifetimes;
`TerminalApp` owns native renderables and temporary interactions. The presentation layer:

- maps durable engine events into completed transcript/tool rows;
- keeps the current response in a separate 32 ms batching buffer;
- appends stable committed renderables so model deltas update only the live response;
- uses native textarea, Select focus, ScrollBox sticky following and viewport culling;
- owns temporary model/session pickers, approvals and one focus-aware global key listener;
- defines slash-command metadata once and separates parsing from command effects;
- renders concise approval requests and forwards only the decision to the engine;
- uses native Markdown rendering and destroys the renderer after pending runtime/picker IO settles.

The composition runtime publishes a durable event only after its JSONL append succeeds. Presentation
subscribes with an explicit cleanup function. Tool execution, model/provider access, session policy,
approval consequences, and durable state remain outside presentation. No React or Ink renderer remains.

## Runtime Data

Session data is stored under the workspace where the CLI is started:

```text
.agent/sessions/<session-id>/events.jsonl
```

The current durable events are:

- `prompt.submitted`;
- `assistant.message.completed`;
- `assistant.tool_calls.completed`;
- `tool.call.requested`;
- `tool.call.started`;
- `tool.call.completed`;
- `tool.call.failed`;
- `agent.error`.

Streaming deltas are runtime-only and are not persisted as durable events. Tool-enabled rounds yield
their text immediately; `assistant.tool_calls.completed` is the boundary between an intermediate
assistant response and the next model round.

`SessionService` reads and validates a session JSONL file on first access in a runtime, then keeps
its events and incrementally reduced state in memory. The transcript loader and `AgentLoop`
share that instance. Appends are serialized and written to JSONL before the cached
events and state are updated. A new process always rebuilds the cache from JSONL.

Tool-calling model responses are persisted as one `assistant.tool_calls.completed` event before
tool execution starts. The event keeps the assistant content and the complete tool-call batch, so
rebuilding a finished session produces the same model context as the live agent loop. Incomplete
batches are excluded from rebuilt model messages until every call has a completed or failed event.
Historical tool names and results remain opaque persisted data; replay does not resolve or execute
them through the current registry, so renamed tools require no model-visible aliases.

## Semantic Session Memory Contract

Semantic session memory is an optional best-effort optimization: bounded derived working state for
the current session. Supporting this feature means the application can attempt, validate and
persist semantic deltas safely; it does not certify every selected model's semantic reliability.

### Role and Authority

Durable canonical JSONL and `SessionReducer` own conversation history. The filesystem owns current
file contents. Derived notes in `.agent/session-memory/<session-id>.json` may improve continuity;
current user instructions, workspace/tool evidence and conflicting exact history override them.
Exact file activity and application failures are projected from committed events, separately from
model interpretations of goals, decisions, constraints and task state.

The compiler reserves mandatory system/tools/exact active history/output/safety before admitting
bounded notes. It then includes the exact previous whole turn when it fits and Phase 17's exact
retrieved older turns where available; unavailable retrieval uses Phase 16 recency fallback.
This precedence and exactness are application contracts, not guarantees about a model's next answer.

### Mechanical Provider Capability

A mechanically compatible `ModelPort` honors the updater's structured response request, configured
context/output profile, cancellation signal and terminal stream semantics. Inability to honor a
request must surface as an optional-operation failure. `ModelChatInput.responseSchema?` permits
ordinary chat to omit structured output; it is not a capability declaration or negotiated flag.
There is no new capability API. The sole concrete production adapter maps the supplied schema to
Ollama `format`, forwards cancellation, bounds structured transport and requires provider completion.

Schema transport support says nothing about semantic suitability. The host cannot detect native
grammar enforcement: if a future port ignores the schema, malformed/nonconforming output fails
validation, while a conforming result still faces all independent host checks. A stream that lacks
clean completion or does not settle is rejected/bounded by the optional deadline. An ignoring port
cannot publish a cancelled result or accumulate optional requests, although host cancellation does
not prove remote compute has stopped. A capability bit would not establish any of these guarantees.

### Semantic Model Suitability

"Semantic-memory capable" as a model judgment means a model/configuration follows the generic
delta contract reliably enough for operational use, within the configured output/deadline envelope.
It is an empirical behavioral judgment, independent of model name, family, parameter count or
ability to emit schema-valid JSON. A suitable extractor should generally:

- return `goal:null` for an unchanged goal and establish an initial goal only when none exists;
  replace the high-level objective only with explicit current user evidence;
- emit minimal changes without restating unchanged state; record settled choices as decisions,
  persistent user restrictions as constraints, and exclude unaccepted proposals;
- reuse existing semantic keys, with one coherent operation per category/key target and the same
  task identity across pending, completed and semantic problems;
- capture multiple independent durable changes in one turn, including a persistent restriction
  and unresolved blocker; a blocker belonging to an existing task must reuse that task's key;
- represent replacement by one same-key upsert and revocation by an existing-key removal;
  remove+upsert of the same category/key conflicts, and unrelated problems require their own
  resolution evidence;
- represent explicit pending/problem transitions and meaningful completion; a completed upsert
  clears matching pending/semantic problems, while pending/problem upserts reopen completed work;
  a successful tool or response alone does not establish completion;
- cite current evidence that actually supports each operation, respect source roles and host-owned
  state, and finish bounded structured output within the existing request envelope.

Compound changes and coherent reversal remain capability requirements even when a qualification
fails them. They do not license prompt tuning, fuzzy host key merging or partial delta acceptance.

### Individual Update Acceptance

An accepted update is one particular delta that passes the entire runtime boundary:

1. A durable normal final response and matching current user/final message evidence permit the
   optional attempt. Oversized evidence or a request that cannot fit its budget fails safely.
   Failed/denied/interrupted turns permit deterministic maintenance only.
2. The updater finishes cleanly with `stop`, no tool calls or other finish reason, bounded response
   text, valid JSON and the strict version-1 delta schema. Missing terminal completion, output-limit
   results and partial fragments cannot be repaired, retried or partially applied.
3. The host independently parses the delta and validates exact current quote/ID origin, unambiguous
   sources, roles and goal rules. Goal/constraints require user evidence; initial cannot overwrite
   an existing goal. Assistant decisions require confirmed turn mutation and no unresolved turn
   failures; assistant completion requires no unresolved turn failures. Source role sets the stored
   basis. Duplicate category/key operations, reserved `tool-`/`agent-` keys and edits to deterministic
   problems reject the whole delta; file observations are outside the semantic delta schema.
4. The compact candidate document passes strict schema and current-session/prefix provenance
   validation. Updater version and originating model metadata are recorded; the selected model is
   checked before/after extraction. Session identity, activation generation, exact prefix and operation
   cancellation still fence publication, including selection changes and disposal. Atomic publication
   must succeed before owned in-memory semantic replacement; one invalid operation rejects all.

Existing bounds remain: production extraction **10000 ms**, output **min(1024, configured output)**,
response **16000 characters**, user/final evidence **6000/2000 characters**, at most **12 changes**,
and separate read/publication caller bounds of **1000 ms**. `OLLAMA_KEEP_ALIVE` remains **0** by
default; this policy adds no configuration or changes to extraction instructions/schema/settings.
Writes stay ordered after caller timeout. An OS rename already dispatched cannot be rolled back;
it may finish only as an artifact labeled with its original valid prefix, never as a newer result.

**Origin validation is not semantic entailment.** An exact source quote and valid role/provenance
are necessary but do not prove that natural-language evidence supports the proposed meaning,
that a choice was accepted, or that all durable changes were extracted. The extractor is expected
to supply that support. Update acceptance does not qualify the model or certify semantic truth;
there is no entailment checker or second-model verifier.

### Failure and Fallback

Timeout, output limit, malformed/schema-invalid output, evidence/host rejection, provider inability
and publication failure are nonfatal to the completed conversation. No failed semantic delta is
partially applied. Previous valid semantic notes plus current exact deterministic observations
remain available; existing internal failure diagnostics may record the unsuccessful attempt.
Cancelled, superseded and disposed operations discard late extraction rather than publish it.

Missing, corrupt, incompatible, foreign or invalid-provenance memory yields no semantic notes;
canonical events rebuild deterministic observations without inference or semantic backfill. Empty
memory contributes no system section. The next turn uses exact canonical active/current history,
budgeted previous/retrieved history and any still-valid prior notes without waiting for freshness.
Canonical storage/model/context errors retain their ordinary behavior; semantic fallback does not
hide them. Losing optional updates on exit cannot lose the committed answer.

Phase 18.3 ownership remains: immediate turn release after canonical completion, interactive
priority through cancellation, one unresolved updater invocation, zero semantic backlog and immediate
disposal without flushing inference. An unresolved raw call suppresses later optional extraction
until it settles; this is resource containment, not a failure-count circuit breaker.

### Model Selection and Qualification

Any otherwise selectable installed model remains usable for normal chat when semantic suitability
is unknown or weak. The updater opportunistically uses that same selected `ModelPort`.
Semantic-quality/validation failures do not reject or replace the model, change its preference or
rewrite historical model IDs. Actual model disappearance/provider model-not-found retains the
independent Phase 15.5 availability behavior: selection may clear, without automatic replacement.

Offline qualification can inform operator/user model choice. It is bounded evidence about a
model/configuration, not an official support grant or persistent quality score. Production chooses
best effort with independent per-update validation: no hardcoded allowlist, qualification registry,
dynamic circuit breaker, automatic default change, hidden replacement or dedicated memory model.
No capability UI, telemetry framework, entailment subsystem or background worker is required.

## Current Boundaries

Keep these boundaries stable while adding features:

- model providers implement `ModelPort`;
- session persistence implements `SessionStorePort`;
- workspace file access implements `WorkspaceFilePort`;
- workspace search implements `WorkspaceSearchPort`;
- local model tools are exposed through `ToolExecutorPort`.

New tools should usually be added by:

1. reusing a port directly, or adding an application use-case only when the operation has real policy;
2. defining one local tool with its Zod input schema, metadata, and execution function;
3. registering it in the local tool factory;
4. adding focused schema and execution tests.

Input schemas do not replace filesystem safety. Workspace adapters still enforce path containment, symlink handling, file-size limits, and write concurrency rules.

## Intentional Non-Goals For MVP

Not part of the current stable base:

- long-running background tasks;
- remote providers beyond Ollama;
- persistent settings UI;
- rich tool timeline UI;
- diff preview before approval.
