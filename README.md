# Local Agentic CLI
<img width="2172" height="724" alt="ChatGPT Image 10 cze 2026, 21_30_29" src="https://github.com/user-attachments/assets/541a568d-bf91-4940-aba0-077aa6ccb202" />


<br>
<br>

> [!NOTE]
> Status: work in progress. At this stage, the project is still close to a local terminal chatbot, but the first tool-calling slice is now in place. It supports a minimal `read_file` tool through Ollama tool calls, without approval flow, patching, or a full agentic loop yet.

Local Agentic CLI is an experimental CLI for working with local AI models. The long-term goal is to provide a simple terminal-based local agent, but the current focus is a stable MVP: chat with a model through Ollama, persist sessions, and continue previous conversations.

## Current State

Currently implemented:

- terminal UI built with Ink,
- streamed responses from Ollama,
- env-based configuration,
- session picker on startup,
- `New chat` option,
- session event persistence in JSONL,
- saved session listing,
- loading previous session history into the chat,
- first model-executed tool: `read_file`,
- tool call events persisted in the session log,
- basic domain, application, port, and infrastructure layers,
- tests for config, sessions, reducer, context builder, Ollama adapter, and runtime helpers.

Not implemented yet:

- tool call approval flow,
- multi-step agentic loop,
- write/edit file operations driven by the model,
- `search_code`, `git_diff`, and `apply_patch` tools,
- history pagination,
- final UI.

  
### Screenshot of the program

<img width="1418" height="1003" alt="obraz" src="https://github.com/user-attachments/assets/ee71aa7a-8fe8-45ae-8624-5ad28c4568e0" />

## How It Works

The conversation is stored as JSONL events. Each session has its own directory:

```text
.agent/sessions/<session-id>/events.jsonl
```

The chat currently restores only these event types:

- `prompt.submitted`
- `assistant.message.completed`

Tool-related events are also persisted when the model requests a tool:

- `tool.call.requested`
- `tool.call.started`
- `tool.call.completed`
- `tool.call.failed`

## Running

Requirements:

- Bun
- running Ollama
- a pulled model matching the configured model name

Start Ollama:

```bash
ollama serve
```

Start the CLI:

```bash
bun run start
```

On startup, the app shows a temporary session picker:

- `New chat` creates a new session,
- choosing an existing session loads previous messages and continues that chat.

## Configuration

Configuration is read from env. You can use a `.env` file.

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:12b-it-qat
SYSTEM_PROMPT=You are a local coding agent.
```

Default values are defined in `src/composition/config.ts`.

## Tests

```bash
bun test
```

Type checking:

```bash
bun run tsc --noEmit
```

## Tools

The first tool is `read_file`. It reads UTF-8 files from the current workspace and blocks paths outside the workspace.

Tool calling currently uses a simple one-iteration flow:

```text
user prompt
-> model may request a tool
-> CLI executes the tool
-> tool result is sent back to the model
-> model returns the final answer
```

## Next Direction

The next larger stage is expanding tools: `search_code`, `git_diff`, approval flow, patch handling, and only after that a more complete agentic mode.
