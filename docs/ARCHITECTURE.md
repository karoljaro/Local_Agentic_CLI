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
- `ContextBuilder`, which keeps the current turn and the newest complete historical turns within a configured character budget;
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

`SessionStateCache` reads and validates a session JSONL file on first access in a runtime, then keeps
its events and incrementally reduced state in memory. The transcript loader and `AgentLoop`
share that instance. Appends are serialized and written to JSONL before the cached
events and state are updated. A new process always rebuilds the cache from JSONL.

Tool-calling model responses are persisted as one `assistant.tool_calls.completed` event before
tool execution starts. The event keeps the assistant content and the complete tool-call batch, so
rebuilding a finished session produces the same model context as the live agent loop. Incomplete
batches are excluded from rebuilt model messages until every call has a completed or failed event.
Historical tool names and results remain opaque persisted data; replay does not resolve or execute
them through the current registry, so renamed tools require no model-visible aliases.

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
