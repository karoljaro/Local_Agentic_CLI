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
- `SessionReducer`, which rebuilds chat/model state from durable events;
- `EditWorkspaceFile`, which owns exact-match replacement and optimistic concurrency policy.

Application code should depend on ports and domain types, not concrete adapters.

### Infrastructure

`src/infrastructure` contains concrete adapters:

- `OllamaModelAdapter` for Ollama chat/tool-call streaming;
- `JsonlSessionStore` for `.agent/sessions/<session-id>/events.jsonl`;
- `NodeWorkspaceFileSystem` for workspace file access;
- `RipgrepSearch` for content search;
- `LocalToolRegistry` and local tool definitions for model-visible workspace tools.

Read-only tools run automatically. Mutating tools currently require approval:

- read-only: `list_files`, `search_file`, `read_file`;
- mutating: `create_file`, `edit_file`.

Tool results are atomic: a tool call is validated, executed, and only then appended to model context as a complete result.
Each local tool owns one Zod input schema, its execution function, and approval/cache metadata. The registry generates the JSON Schema sent to Ollama from that same input schema and prepares every complete tool-call batch before execution starts.
`read_file` bounds each result by line count and character count, returning range metadata for continuation.
`search_file` parses ripgrep NDJSON incrementally and stops the process after detecting that the bounded result is truncated.
Repeated `list_files` and `search_file` calls within one turn reuse the earlier result through a short persisted tool-call reference. `read_file` is always executed again, and successful workspace mutations clear the references.
`edit_file` applies `oldText` and `newText` exactly after JSON/schema parsing. It does not reinterpret literal escaped line-break sequences.

### Composition

`src/composition` wires the runtime:

- config reading and validation;
- clock and id generator;
- Ollama model adapter;
- JSONL session store;
- local tool registry factory;
- runtime methods used by the UI.

This layer is the right place for dependency wiring. The project does not need a DI container for the current scope.

### Presentation

The terminal UI currently lives in `src/App.tsx`, `src/Markdown.tsx`, and `src/presentation/hooks`.

The UI is intentionally simple:

- session picker;
- chat-like transcript;
- streaming final responses;
- model switching with `/model`;
- approval prompt for mutating tools.

Stage 4 may move presentation files under a clearer `src/presentation` structure.

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

Streaming deltas are runtime-only and are not persisted as durable events.

`SessionStateCache` reads and validates a session JSONL file on first access in a runtime, then keeps
its events and incrementally reduced state in memory. The transcript loader and `AgentLoop`
share that instance. Appends are serialized and written to JSONL before the cached
events and state are updated. A new process always rebuilds the cache from JSONL.

Tool-calling model responses are persisted as one `assistant.tool_calls.completed` event before
tool execution starts. The event keeps the assistant content and the complete tool-call batch, so
rebuilding a finished session produces the same model context as the live agent loop. Incomplete
batches are excluded from rebuilt model messages until every call has a completed or failed event.

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

- command execution;
- long-running background tasks;
- remote providers beyond Ollama;
- persistent settings UI;
- rich tool timeline UI;
- diff preview before approval.
