# Local Agentic CLI

<img width="1571" height="818" alt="obraz" src="https://github.com/user-attachments/assets/317d8f06-5a94-4e8f-8c9d-b1b49c59c889" />

<br>
<br>

> [!NOTE]
> Status: work in progress. At this stage, the project behaves more like a local terminal chatbot. The session layer and foundation for future tools are being built, but there are no tools yet and no full agentic behavior yet.

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
- basic domain, application, port, and infrastructure layers,
- tests for config, sessions, reducer, context builder, Ollama adapter, and runtime helpers.

Not implemented yet:

- model-executed tools,
- tool call approval flow,
- real agentic loop,
- file operations driven by the model,
- history pagination,
- final UI.

## How It Works

The conversation is stored as JSONL events. Each session has its own directory:

```text
.agent/sessions/<session-id>/events.jsonl
```

The chat currently restores only these event types:

- `prompt.submitted`
- `assistant.message.completed`

Other event types already exist in the domain mainly as preparation for future tools and error handling.

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

## Next Direction

The current priority is closing the session and simple chat flow. The next larger stage is tools: ports, tool implementations, tool call handling, and only after that a more complete agentic mode.
