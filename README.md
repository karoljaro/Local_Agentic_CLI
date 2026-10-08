# Local Agentic CLI

<img width="2172" height="724" alt="ChatGPT Image 10 cze 2026, 21_30_29" src="https://github.com/user-attachments/assets/541a568d-bf91-4940-aba0-077aa6ccb202" />


<br>
<br>

> [!NOTE]
> This CLI is intentionally in a simple MVP state. It does not include extra UI polish, rich tool timelines, diff previews, or settings yet. The focus is the simplest working local agent loop.

Local Agentic CLI is a local terminal coding agent for Ollama models. It is an MVP focused on a simple working loop: chat with a local model, let the model inspect the current workspace, approve file edits, and persist the session as JSONL events.

This project is intentionally small. The current goal is a practical local agentic CLI, not a full Codex replacement or a large framework.

## Current State

Implemented:

- OpenTUI Core terminal UI with a conversation-first layout and native scrolling
- Ollama chat integration with batched real-time streaming across model/tool rounds
- stable, readable conversation history with Markdown rendering
- slash-command menu with keyboard filtering and selection
- model picker with `/model` and direct switching with `/model <name>`
- focused model and resume pickers that preserve the prompt draft on cancellation
- subtle current model and session context above the conversation
- `Ctrl+C` cancels an active response and exits the CLI when no response is running
- resume session picker with `New session`, last activity, and prompt preview
- persisted sessions in `.agent/sessions/<session-id>/events.jsonl`
- loading previous chat messages when continuing a session
- tool calling through Ollama
- multi-step tool loop with an iteration limit
- per-turn deduplication for repeated directory listing, file discovery, and content searches
- one Zod-backed registry for tool schemas, validation, execution, approval, and cache policy
- bounded in-memory diagnostics for model rounds, request sizes, and tool time/output sizes
- workspace tools:
  - `list_directory`, `find_files`, `read_file`, `search_text`
  - `create_file`, `edit_file`, `replace_file`, `move_file`, `delete_path`
- approval prompt before mutating tools
- concise live tool status and persisted tool success/failure rows
- path safety checks for file tools
- tests for config, sessions, runtime, Ollama adapter, tools, and agent turn flow

Not implemented yet:

- diff preview before edit approval
- settings screen or persistent model configuration

## Agent Loop

The current MVP loop is:

```text
user prompt
-> model may request bounded workspace tools
-> CLI executes read/list/find/search tools automatically
-> CLI asks for approval before each mutation
-> approved changes are applied to workspace files
-> events are persisted to the current session
-> model returns the final answer
```

If a mutating tool is denied, the turn ends immediately. This prevents the model from repeatedly requesting the same change until the tool iteration limit is reached.

## Tools

Every path is relative to the workspace root. The model has bounded file tools and no shell,
command, git, package-manager, or arbitrary network tool.

| Tool | Input | Behavior |
| --- | --- | --- |
| `list_directory` | `path?`, `depth?` | Lists typed file/directory entries; one level by default, at most five levels. |
| `find_files` | `pattern`, `path?` | Finds files with bounded `*`, `**`, and `?` globs. A pattern without `/` matches basenames; with `/`, paths relative to the selected directory. |
| `read_file` | `path`, `startLine?`, `endLine?`, `startOffset?` | Reads bounded UTF-8 text, with exact continuation and a content `version`. |
| `search_text` | `query` | Searches literal single-line text and returns bounded paths, line numbers, and excerpts. Pipes and spaces remain literal. |
| `create_file` | `path`, `content` | Creates a new file, including safe missing parent directories; refuses an existing target. |
| `edit_file` | `path`, `edits` | Applies 1–50 exact replacements to one existing file in one write. |
| `replace_file` | `path`, `content`, `expectedVersion` | Replaces an existing file only if its version matches a previous read. |
| `move_file` | `source`, `destination` | Moves one regular file, creating safe destination parents and refusing overwrite. |
| `delete_path` | `path` | Deletes one file or empty directory; never deletes recursively. |

Discovery and search results expose `truncated` when their configured limits are reached. Listing
returns `entries` with a `type`; filename discovery returns `files`; content search returns
`matches` plus `returnedMatches` and `returnedFiles`. Narrow a discovery request when truncated.

`read_file` defaults to at most 400 lines and 20,000 UTF-16 characters per result. Lines are
one-based and an `endLine` is inclusive. When `nextRead` is present, pass that object unchanged to
`read_file` to continue from the first unreturned character, including long lines and CRLF content.
Only `nextRead` means forward content remains; `truncated` can also describe a selected line range.
Do not combine `startLine` and `startOffset`. The returned `version` is a SHA-256 digest of decoded
content for `replace_file`; a stale version fails without overwriting the newer contents.

Nested creation requires one call:

```json
{
  "path": "src/features/auth/services/AuthService.ts",
  "content": "export class AuthService {}\n"
}
```

For `edit_file`, each edit has `oldText` and `newText`. Every `oldText` must match exactly once in
the original file, and edit ranges must not overlap. All edits validate before the final write;
missing, ambiguous, or overlapping text leaves file contents unchanged. Replacement strings are
literal JSON-decoded text; sequences such as `\\n` are not interpreted again.
Edits and whole-file replacements return `changed: false` and skip the write when the resulting
contents equal the existing file. `editsApplied` counts validated exact replacements.

All five mutation tools require interactive approval. Use the arrow keys and Enter, press `y` to
approve, or press `n`/`Esc` to deny. Deny is selected by default. Press `d` to toggle full input details.

Tools reject workspace escapes and protected paths, including `.git`, `.agent`, `node_modules`,
and secret `.env*` files. The allowed env files are `.env.dev`, `.env.development`, and `.env.example`.
Moves and deletions refuse symlinks. Text reads and writes respect the configured byte limit.

Creation publishes completed file contents exclusively; edits and replacements publish through
an atomic rename. Missing parent directories can remain after failed or cancelled creation/moves.
If a completed create cannot remove its temporary file, the result includes a relative-path cleanup warning.
A move uses an exclusive link followed by source removal, so both names can remain if removal
fails; it is not an atomic two-name transaction. Cancellation is checked before filesystem commit;
a commit already in progress is awaited and recorded truthfully.

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

The chat UI restores user, assistant, error, and concise tool lifecycle information. Large raw tool
inputs and outputs remain in the durable event log but are not printed into the default transcript.

JSONL remains the source of truth. During one process, each active session is read and validated once; successful appends update an in-memory incremental state after the durable write completes. Restarting the CLI rebuilds that state from JSONL.

## Requirements

- Bun 1.3 or newer (development and builds)
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
bun install --frozen-lockfile --os '*' --cpu x64
bun run build
```

The install flags include OpenTUI's Windows x64 native dependency for cross-compilation from Linux.
A normal host-only install is sufficient for development and a matching host build. Repeat the
cross-platform install after dependency changes before building both release targets.

The build output is placed in `dist`:

- Linux x64: `codesh` and `rg`
- Windows x64: `codesh.exe` and `rg.exe`

The `codesh` executables are standalone. Keep each executable together with its matching ripgrep
binary; no project checkout or `node_modules` directory is required at runtime. Bun embeds OpenTUI's
native library, parser worker and bundled grammar assets. The Linux artifact targets glibc.

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

`F2` and `F3` also open the model and session pickers. Enter submits a prompt; Shift+Enter or Ctrl+J
inserts a newline. Escape closes a picker, denies approval, or cancels the active response. PageUp
and PageDown scroll the conversation; Ctrl+Home and Ctrl+End jump to its ends. Scrolling upward
pauses automatic following until you return to the bottom. Ctrl+C cancels an active response and
exits when idle or when an approval is open.

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

Run the complete automated release gate:

```bash
bun run release:check
```

The release gate formats and type-checks the project, runs the complete test suite, builds Linux
and Windows artifacts, validates their ELF/PE formats and Linux executable bits, then copies the
native artifact pair outside the repository. The isolated smoke test starts both new and resume CLI
modes and verifies ripgrep with a real search. It does not require a running Ollama instance.

## Next Steps

Likely next work:

- show a compact diff before edit approval
- move model defaults into settings
