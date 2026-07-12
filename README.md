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
- model picker with `/model` and direct switching with `/model <name>`
- current model and workspace path shown under the input
- resume session picker with `New chat`
- persisted sessions in `.agent/sessions/<session-id>/events.jsonl`
- loading previous chat messages when continuing a session
- tool calling through Ollama
- multi-step tool loop with an iteration limit
- per-turn deduplication for repeated `list_files` and `search_file` calls
- one Zod-backed registry for tool schemas, validation, execution, approval, and cache policy
- workspace tools:
  - `list_files`
  - `search_file`
  - `read_file`
  - `create_file`
  - `edit_file`
- approval prompt before mutating tools
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
-> model may request list_files/search_file/read_file/create_file/edit_file
-> CLI executes safe read/list/search tools automatically
-> CLI asks for approval before create_file/edit_file
-> approved edits are applied to workspace files
-> events are persisted to the current session
-> model returns the final answer
```

If a mutating tool is denied, the turn ends immediately. This prevents the model from repeatedly requesting the same change until the tool iteration limit is reached.

## Tools

### `list_files`

Recursively lists file paths in the current workspace, or under an optional relative path:

```ts
{
  path?: string;
}
```

Use it to discover project structure. It is not a content search tool.

### `search_file`

Searches the current workspace with ripgrep and returns a bounded list of paths, line numbers, and text excerpts. The result contains `returnedMatches`, `returnedFiles`, and `truncated`. Ripgrep output is parsed incrementally and the process is stopped after one match beyond the configured limit. Common internal directories such as `.git`, `.agent`, and `node_modules` are ignored.

### `read_file`

Reads a bounded range from a UTF-8 file in the current workspace:

```ts
{
  path: string;
  startLine?: number;
  endLine?: number;
}
```

The default output is limited to 400 lines and 20,000 characters. Results include `startLine`, `endLine`, `totalLines`, and `truncated`, allowing the model to continue from the next range. Paths outside the workspace are rejected.

### `create_file`

Creates a new UTF-8 file in an existing workspace directory:

```ts
{
  path: string;
  content: string;
}
```

The tool fails if the file already exists. `create_file` requires interactive approval.

### `edit_file`

Replaces exact text in a UTF-8 file:

```ts
{
  path: string;
  oldText: string;
  newText: string;
}
```

The edit is applied only when `oldText` appears exactly once. `oldText` and `newText` are used exactly as decoded from the model's JSON arguments; literal sequences such as `\\n` are not converted into line breaks.

`edit_file` requires interactive approval. Press `y` to approve, `n` or `Esc` to deny.

## Architecture

The short architecture note is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The active roadmap is currently kept in [ROADMAP.md](ROADMAP.md).

## Sessions

Each session is stored as JSONL:

```text
.agent/sessions/<session-id>/events.jsonl
```

Persisted events include:

- `prompt.submitted`
- `assistant.message.completed`
- `assistant.tool_calls.completed`
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

The build output is placed in `dist`:

- Linux x64: `codesh` and `rg`
- Windows x64: `codesh.exe` and `rg.exe`

Keep each CLI executable together with its matching ripgrep binary.

To run the built CLI from any folder, add the `dist` directory to your shell `PATH`:

```bash
echo 'export PATH="$PATH:/home/karoljaron/Projects/Local_Agentic_CLI/dist"' >> ~/.bashrc
source ~/.bashrc
```

After that, open any workspace folder and run:

```bash
codesh
```

By default, `codesh` starts a new chat session. To open the session picker and continue an existing session, run:

```bash
codesh resume
```

The CLI uses the current terminal directory as the workspace, so file tools operate on the folder where `codesh` is started.

## Configuration

Configuration is read from environment variables. A `.env` file can be used.

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:12b-it-qat
SYSTEM_PROMPT=You are a local coding agent.
MAX_CONTEXT_CHARACTERS=120000
```

Defaults are defined in `src/composition/config.ts`.

`MAX_CONTEXT_CHARACTERS` limits serialized model messages. The current turn is always kept intact; older complete turns are removed from oldest to newest when the limit is reached.

The default model is still configured in code for now. It should move to user settings once settings exist.

## CLI Commands

Inside the chat:

```text
/model
/model <ollama-model-name>
/resume
```

`/model` opens the local Ollama model picker. `/model <name>` switches the model directly for subsequent turns. `/resume` opens the session picker.

## Tests

Run all tests:

```bash
bun test
```

Type check:

```bash
bun run typecheck
```

Build check:

```bash
bun run build
```

Run the full local check:

```bash
bun run check
```

## Next Steps

Likely next work:

- show tool events in the UI
- add a guarded `run_command` tool with an allowlist
- show a compact diff before edit approval
- move model defaults into settings
