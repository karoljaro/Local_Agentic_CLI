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
- `RunAgentTurn`, which owns the agent loop;
- `ContextBuilder`, which builds model context from rebuilt session state;
- `SessionReducer`, which rebuilds chat/model state from durable events;
- file-operation use-cases for listing, reading, searching, creating, and editing workspace files.

Application code should depend on ports and domain types, not concrete adapters.

### Infrastructure

`src/infrastructure` contains concrete adapters:

- `OllamaModelAdapter` for Ollama chat/tool-call streaming;
- `JsonlSessionStore` for `.agent/sessions/<session-id>/events.jsonl`;
- `NodeWorkspaceFileSystem` for workspace file access;
- `RipgrepSearch` for content search;
- `LocalToolExecutor` and tool providers for model-visible workspace tools.

Read-only tools run automatically. Mutating tools currently require approval:

- read-only: `list_files`, `search_file`, `read_file`;
- mutating: `create_file`, `edit_file`.

Tool results are atomic: a tool call is validated, executed, and only then appended to model context as a complete result.

### Composition

`src/composition` wires the runtime:

- config reading and validation;
- clock and id generator;
- Ollama model adapter;
- JSONL session store;
- local tool executor factory;
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
- `tool.call.requested`;
- `tool.call.started`;
- `tool.call.completed`;
- `tool.call.failed`;
- `agent.error`.

Streaming deltas are runtime-only and are not persisted as durable events.

## Current Boundaries

Keep these boundaries stable while adding features:

- model providers implement `ModelPort`;
- session persistence implements `SessionStorePort`;
- workspace file access implements `WorkspaceFilePort`;
- workspace search implements `WorkspaceSearchPort`;
- local model tools are exposed through `ToolExecutorPort`.

New tools should usually be added by:

1. adding or reusing an application use-case;
2. adding an infrastructure provider for model input parsing and tool output;
3. registering the provider in `LocalToolExecutor`;
4. adding focused tests.

## Intentional Non-Goals For MVP

Not part of the current stable base:

- command execution;
- long-running background tasks;
- remote providers beyond Ollama;
- persistent settings UI;
- rich tool timeline UI;
- diff preview before approval.
