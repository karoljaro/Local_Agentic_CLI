# Local Agentic CLI

<img width="2172" height="724" alt="ChatGPT Image 10 cze 2026, 21_30_29" src="https://github.com/user-attachments/assets/541a568d-bf91-4940-aba0-077aa6ccb202" />


<br>
<br>

> [!NOTE]
> This CLI is intentionally in a simple MVP state. It does not include extra UI polish, rich tool timelines, diff previews, command execution, or settings yet. The focus is the simplest working local agent loop.

Local Agentic CLI is a local terminal coding agent for Ollama models. It is an MVP focused on a simple working loop: chat with a local model, let the model inspect the current workspace, approve file edits, and persist the session as JSONL events.

This project is intentionally small. The current goal is a practical local agentic CLI, not a full Codex replacement or a large framework.

## Current State

Implemented:

- Ink-based terminal UI
- Ollama chat integration with streaming final responses
- model switching from the CLI with `/model <name>`
- current model and workspace path shown under the input
- session picker with `New chat`
- persisted sessions in `.agent/sessions/<session-id>/events.jsonl`
- loading previous chat messages when continuing a session
- tool calling through Ollama
- multi-step tool loop with an iteration limit
- workspace tools:
  - `search_file`
  - `read_file`
  - `edit_file`
- approval prompt before `edit_file`
- path safety checks for file tools
- tests for config, sessions, runtime, Ollama adapter, tools, and agent turn flow

Not implemented yet:

- command execution tool
- visible tool event timeline in the UI
- diff preview before edit approval
- settings screen or persistent model configuration
- final UI polish

## Agent Loop

The current MVP loop is:

```text
user prompt
-> model may request search_file/read_file/edit_file
-> CLI executes safe read/search tools automatically
-> CLI asks for approval before edit_file
-> approved edits are applied to workspace files
-> events are persisted to the current session
-> model returns the final answer
```

If an edit is denied, the turn ends immediately. This prevents the model from repeatedly requesting the same edit until the tool iteration limit is reached.

## Tools

### `search_file`

Searches the current workspace with ripgrep and returns paths, line numbers, and text excerpts. It ignores common internal directories such as `.git`, `.agent`, and `node_modules`.

### `read_file`

Reads a UTF-8 file from the current workspace. It requires a relative path and rejects paths outside the workspace.

### `edit_file`

Replaces exact text in a UTF-8 file:

```ts
{
  path: string;
  oldText: string;
  newText: string;
}
```

The edit is applied only when `oldText` appears exactly once. The tool also normalizes escaped line breaks like `\\n` when models provide multiline edits as escaped text.

`edit_file` requires interactive approval. Press `y` to approve, `n` or `Esc` to deny.

## Sessions

Each session is stored as JSONL:

```text
.agent/sessions/<session-id>/events.jsonl
```

Persisted events include:

- `prompt.submitted`
- `assistant.message.completed`
- `tool.call.requested`
- `tool.call.started`
- `tool.call.completed`
- `tool.call.failed`
- `agent.error`

The chat UI currently restores user and assistant messages. Tool events are persisted, but they are not yet shown as a dedicated timeline in the UI.

## Requirements

- Bun
- Ollama
- a pulled local model matching the configured model name

Start Ollama:

```bash
ollama serve
```

Run the CLI in development:

```bash
bun run start
```

Build the CLI:

```bash
bun run build
```

The build output is placed in `dist/`.

## Configuration

Configuration is read from environment variables. A `.env` file can be used.

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:12b-it-qat
SYSTEM_PROMPT=You are a local coding agent.
```

Defaults are defined in `src/composition/config.ts`.

The default model is still configured in code for now. It should move to user settings once settings exist.

## CLI Commands

Inside the chat:

```text
/model
/model <ollama-model-name>
```

`/model` shows the current model. `/model <name>` switches the model for subsequent turns.

## Tests

Run all tests:

```bash
bun test
```

Type check:

```bash
bun run tsc --noEmit
```

Build check:

```bash
bun run build
```

## Next Steps

Likely next work:

- show tool events in the UI
- add a guarded `run_command` tool with an allowlist
- show a compact diff before edit approval
- move model defaults into settings
