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
- settings screen

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
- an installed local model for inference (the CLI can start before any model is installed)

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
# Optional explicit override; use a name from the installed-model picker:
# OLLAMA_MODEL=<installed-model-name>
# Optional override; leave unset to keep the built-in tool autonomy and recovery guidance:
# SYSTEM_PROMPT=Use workspace-relative paths.
MODEL_CONTEXT_TOKENS=16384
MODEL_MAX_OUTPUT_TOKENS=4096
# Optional; independently installed embedding model for current-session history:
# HISTORY_EMBEDDING_MODEL=<installed-embedding-model>
```

Defaults are defined in `src/composition/config.ts`.

Leave `SYSTEM_PROMPT` unset or blank to use the built-in guidance for workspace-relative paths, autonomous tool choices, safe recovery and user-visible clarification. A nonblank value replaces that guidance.

`MODEL_CONTEXT_TOKENS` sets the total model window; `MODEL_MAX_OUTPUT_TOKENS` reserves the
maximum generation space. Both must be positive integers, with output smaller than the window.
The defaults reserve 4,096 of 16,384 tokens for output. The 12,288-token theoretical input ceiling
also leaves a 1,024-token safety allowance, so estimated input must fit within 11,264 tokens.
Every Ollama inference request explicitly sends these context/output limits; daemon defaults
and Modelfiles do not define the application budget.

The bounded Context Compiler includes the system instruction, all nine tools, messages and
structured calls/results. Its conservative estimate uses model-visible serialized UTF-8 structures:
one estimated token per three ASCII bytes, one per non-ASCII byte, plus framing allowances.
These are estimates, not exact model tokenizer counts. Safety is `max(128, ceil(total / 16))`
tokens; unusual model templates/tokenizers may still exceed estimates.

The entire current user turn stays exact across tool rounds. When semantic retrieval is unavailable,
previous turns are retained as a contiguous recent window, newest first, then sent chronologically.
If the next older complete turn does not fit, selection stops; its calls/results drop together.
Durable events and resumed transcripts remain complete. An oversized active request fails before
model invocation instead of truncating user text or tool results or reducing the output reservation.
The former `MAX_CONTEXT_CHARACTERS` setting is removed; migrate to
these two token settings rather than converting its character value.

The Ollama adapter requests no input truncation or context shifting. A reported `length` finish
raises an incomplete-response error through existing presentation and does not store a clean final
answer or execute partial tool calls. Missing/unknown provider finish metadata cannot prove why
a response stopped; prompt/output usage, when reported, is diagnostic only.

Semantic history retrieval is optional. Set `HISTORY_EMBEDDING_MODEL` to an already installed Ollama
embedding model; it is independent of `OLLAMA_MODEL`, `TEST_MODEL` and the chat model preference. No
embedding model is selected or downloaded automatically. With retrieval available, each request
keeps the active turn exact, the immediately previous complete turn exact when it fits, and at most
three relevant older complete turns. Old candidates must meet cosine similarity 0.65; unused input
budget stays unused. All selected content uses the same 16384-token window, 4096-token output
reservation and default 1024-token safety allowance. Token counts remain estimates.

The disposable index lives under `.agent/history-index/<session-id>.bin`, contains vectors and
source metadata rather than another transcript, and is rebuilt from reducer-owned durable JSONL
history when deleted, corrupt or incompatible. Only the selected session is searched. Newly
completed turns are embedded incrementally; verified prefixes survive provider failures or rebuild
timeouts. Unset configuration, provider/cache errors or embedding timeout fall back to Phase 16's
recent whole-turn context without affecting durable history or ordinary chat. Caller cancellation
still stops the turn. No retrieval panel or assistant-output diagnostics are added.

Compact working memory keeps the current session's goal, settled decisions, persistent constraints,
important file activity, completed/pending tasks and unresolved problems available beyond recent
turns. It is derived state, separate from retrieval and canonical history. Successful tool events
provide exact file observations; one optional structured operation after a normal completed turn
uses the currently selected chat model for semantic updates. It adds at most one model request,
with a 10-second deadline and up to 1024 output tokens. Failure never invalidates the completed
answer. Denied, failed, interrupted and cancelled turns do not produce semantic completion updates.

Memory lives in versioned atomic JSON at `.agent/session-memory/<session-id>.json`, with bounded
collections and stable durable message/event provenance. It stores no file contents or transcript.
Deleting/corrupting it leaves chat/history intact; exact activity can rebuild from events, while
semantic notes become available again after a subsequent successful update. Semantic regeneration
is not deterministic. No cross-session memory, background summarizer, new workspace tool or memory
UI is added.

The compiler appends one compact notes section to its single configured system message. Its entire
cost is charged to the existing context estimate, capped at 1200 estimated tokens (less for small
profiles), after mandatory system/tools/current turn/output/safety and before previous/retrieved
turns. Whole lower-priority notes drop when necessary. Current user instructions, workspace/tool
evidence and conflicting exact history override stale notes; filesystem tools remain authoritative
for file contents. Retrieval still supplies exact historical detail even when memory cites its source.

Search text is a bounded deterministic projection of conversation text and tool/path/query metadata;
raw old tool results and large mutation bodies are excluded from embeddings. Retrieved payloads are
the original complete turns, including original tool results. Historical file contents may be stale:
use current workspace tools for current file truth. Oversized retrieved turns are skipped whole.
Similarity quality depends on the chosen embedding model; replacing a mutable model tag at the same
dimension requires deleting the derived index to force rebuilding. Summaries, structured session
memory and cross-session personal memory remain outside Phase 17.

`OLLAMA_MODEL` is optional; unset or blank means no explicit model configuration. An installed
explicit model wins over remembered preference. If it is unavailable, the CLI starts with a clear
error and `/model` recovery; choosing another model affects this runtime without changing the
external configuration. The next launch checks the explicit override again.

Without an explicit override, startup uses the last successfully selected model if still installed,
then the sole installed model. Multiple installed models require `/model`; zero installed models
leave inference unavailable until you install and select one. Startup only discovers availability;
it does not load or unload a model. Model-specific failures include `/model` recovery guidance;
service, transport and permission failures retain their actual cause.

Successful manual selection confirms provider activation, updates the header, and remembers the
choice in `.agent/model-preference.json` as `{"lastSelectedModel":"<identifier>"}`. This small
application preference is shared by sessions in the workspace. Writes use a temporary file and
atomic rename; missing/corrupt preferences are ignored. A preference-write failure warns while
keeping successful runtime activation. If activation fails after unloading the previous model,
the header shows no selected model and the attempted choice is not remembered.

Resuming a session retains the current runtime model selection. Historical model IDs in session
events remain unchanged, even when those models are no longer installed.

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

Ordinary tests use the shared synthetic `test-model` fixture with deterministic fakes/mocks.
They require neither Ollama nor `TEST_MODEL`, and setting `TEST_MODEL` does not change them.
For the optional single local model lifecycle smoke, configure an installed model explicitly:

```bash
TEST_MODEL=qwen3.5:9b bun run scripts/smoke-model.ts
```

The smoke prints the resolved model, discovers availability, checks unavailable-model recovery
and remembered selection after restart in a disposable workspace, and times out after 20 seconds.
Unset `TEST_MODEL` skips with `No live test model configured. Set TEST_MODEL=<installed-model>.`
It never downloads models or uses a hidden model-name/ordering fallback. Provider failure or an
unavailable configured test model is reported as a failed smoke without retries.

The optional context smoke uses one isolated read-only tool workflow and a 45-second aggregate
deadline, with the default 16,384/4,096 profile and all nine definitions:

```bash
TEST_MODEL=qwen3.5:9b bun run scripts/smoke-context.ts
```

It reports estimated request budgets and provider-reported usage separately. An unset or
uninstalled `TEST_MODEL` skips; timeout/provider failure stops the sequence without retry or
downloads. Deterministic tests remain the release authority.

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
- add a settings UI if needed
