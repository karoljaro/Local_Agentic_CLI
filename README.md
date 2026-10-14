# Local Agentic CLI

<img width="2172" height="724" alt="ChatGPT Image 10 cze 2026, 21_30_29" src="https://github.com/user-attachments/assets/541a568d-bf91-4940-aba0-077aa6ccb202" />


<br>
<br>

> [!NOTE]
> This CLI is intentionally in a simple MVP state. It does not include extra UI polish, rich tool timelines, approval diff previews, or settings yet. The focus is the simplest working local agent loop.

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
- terminal-native mouse text selection and clipboard copying with Ctrl+Shift+C
- model-list/selection feedback, first-response waiting and readable operation error dialogs
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
  - `run_process` for one approved foreground process with direct argv and bounded output
- approval prompt before mutating file tools and every process invocation
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
-> CLI asks for approval before each mutation or process invocation
-> approved file changes or foreground processes execute
-> events are persisted to the current session
-> model returns the final answer
```

If a tool requiring approval is denied, the turn ends immediately. This prevents the model from repeatedly requesting the same action until the tool iteration limit is reached.

The model chooses proportionate verification for material changes using commands supported by
project/user evidence. Every check needs normal process approval; non-zero exits may justify a
relevant bounded repair. There is no automatic test runner. Completion must state the actual
verification scope, including checks not run or blocked and repairs not reverified.
See the [verification contract](docs/ARCHITECTURE.md#verification-and-repair-behavior).

## Tools

File-tool paths and process cwd are relative to the workspace root. The ten tools include
one generic process primitive; prefer the dedicated file tools for inspection and editing.

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
| `run_process` | `program`, `args?`, `cwd?`, `timeoutMs?` | Runs one approved foreground process directly with argv; returns bounded stdout/stderr and exit status. |

`run_process` defaults to `args: []`, `cwd: "."`, and a 60,000 ms timeout (allowed range
1,000–300,000 ms). It has no implicit shell, interactive stdin, TTY, environment overrides or
background option. Bare executables use inherited PATH; explicit executable paths must be
workspace-relative. Cwd and path-like executables are checked for lexical and symlink escapes
immediately before spawn. A non-zero exit is a normal process result; an executable that cannot
start produces a recoverable tool failure. Timeout terminates the owned child; turn cancellation
stops it and preserves the existing abort behavior. Neither outcome automatically retries.
Both output pipes continue draining after the fixed 8,192 UTF-8-byte retained text cap per stream;
truncated results preserve head/tail text and report observed bytes and truncation flags.

**Process execution is approved local code execution, not a sandbox.** An approved program can
read or modify files outside the workspace, access the network, launch interpreters and spawn
descendants. Cwd containment does not confine those effects. Only the directly spawned child is
owned; no process-tree containment is promised. See the [process contract](docs/ARCHITECTURE.md#foreground-process-contract)
for termination and path-race limits.

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

All five file mutation tools and every `run_process` invocation require interactive approval. Use the arrow keys and Enter, press `y` to
approve, or press `n`/`Esc` to deny. Deny is selected by default. Press `d` to toggle full input details.
Process requests show the complete prepared program/args/cwd/timeout JSON by default; PageUp/PageDown
scroll the details. That JSON is the execution authority; no displayed shell command is executed.

File tools reject workspace escapes and protected paths, including `.git`, `.agent`, `node_modules`,
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

Use `/settings` to inspect, edit, validate and save preferences inside OpenTUI. A clean installation
starts with built-in defaults and requires no `.env` or available Ollama server to edit settings.
Use ↑/↓ to select, Enter to edit and confirm a save, Esc to cancel/back, and R to prepare a reset
of the selected setting to its built-in default. Reset still requires Enter; there is no Reset All.
PgUp/PgDn scroll the selected setting's details. Mouse clicks select/edit while the modal is open;
closing it restores the chat's terminal-native selection. Unsaved text is retained when an error
dialog or model/session activity occurs. Opening Settings does not cancel active generation.

| Setting | First-run default | Application rule |
| --- | --- | --- |
| Ollama server URL | `http://localhost:11434` | Saved for restart; current endpoint displayed separately |
| Default model | Automatic, no forced model | Existing picker; persisted only after confirmed selection; R clears startup preference on restart |
| Keep alive | `0`, unload after request | Next provider request; choices include 5m, 30m, indefinite (`-1`) and provider default |
| Context window | 16,384 tokens | Next new turn, with one immutable budget across its requests/tool continuations |
| Max output tokens | 4,096 tokens | Next new turn, including output reservation in ContextBuilder |

Model selection waits until the current turn/session discovery finishes. It reuses `/model`,
does not download/preload models and does not prove VRAM residency. Retention controls ordinary
requests, including bounded memory extraction; explicit switching still unloads the old model
with zero retention, and explicit activation uses the provider's load behavior. Existing valid
legacy retention durations are preserved and selectable as the current duration. Theme and General
sections are omitted: rendering already follows terminal colors, with no application theme switch;
operational prompts, retrieval setup and internal limits are outside user Settings.

Preferences use one human-readable, versioned `settings.json`:

- Linux: `$XDG_CONFIG_HOME/codesh/settings.json`, falling back to `~/.config/codesh/settings.json`.
- Windows: `%APPDATA%\codesh\settings.json` (fallback: the user's `AppData\Roaming`).
- macOS: `~/Library/Application Support/codesh/settings.json`.

For example, the complete default document is:

```json
{
  "version": 1,
  "preferences": {
    "ollamaBaseUrl": "http://localhost:11434",
    "lastSelectedModel": null,
    "keepAlive": "0",
    "contextWindowTokens": 16384,
    "maxOutputTokens": 4096
  }
}
```

The file can be read/edited without launching Codesh; restart after manual edits. Missing fields
use built-in defaults. Unknown fields, unsupported versions, malformed JSON and invalid combinations
are reported through the Error Dialog, with original bytes preserved and saving disabled until the
file is repaired and Codesh restarted. Writes are limited to 16 KiB, use private files/directories
where supported and replace the file atomically after validation. Conflicting saves within Codesh
serialize; another process's active lock reports a retryable error. After a terminated process,
remove a leftover `settings.json.lock` and matching `.tmp` files only after all Codesh processes
exit. Cancellation before replacement preserves the previous document; a replacement already
committed remains saved. Hardware/power-loss durability is not guaranteed.

Production precedence is saved preferences → legacy fallbacks on a missing file → built-in defaults.
For first-run compatibility only, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_KEEP_ALIVE`,
`MODEL_CONTEXT_TOKENS` and `MODEL_MAX_OUTPUT_TOKENS` can seed preferences when there is no settings
file. Bun's existing environment/`.env` loading remains; Codesh does not edit environment variables.
Once a settings file exists, these legacy variables are ignored, including stale or invalid values;
missing JSON fields use defaults. A save materializes all supported preferences, so a stale `.env`
cannot undo a saved value or reset. The legacy workspace `.agent/model-preference.json` takes
precedence over a legacy `OLLAMA_MODEL`, migrates deterministically when no settings file exists,
and is archived as `.agent/model-preference.json.migrated` only after a confirmed settings write.
Later startups use the shared application preference rather than importing another workspace's file.
Migration failure preserves the old file and remembered selection and reports the failure; a retry
through Settings can persist those values. Invalid legacy env is reported and can also be replaced
through Settings. An existing archive is preserved; archive failure leaves the old file inactive.

`SYSTEM_PROMPT` and `HISTORY_EMBEDDING_MODEL` remain explicit operational/development environment
configuration, separate from preferences. Leave `SYSTEM_PROMPT` unset/blank for the unchanged built-in
tool/recovery/verification guidance; a nonblank value replaces it. `TEST_MODEL` remains solely for
optional development smoke scripts, is never imported or exposed, and is never a production default.
Any model tag that the server lists can still be selected normally.

Built-in preference defaults and shared validation are defined in `src/domain/UserSettings.ts`.
Context accepts 8,192–1,048,576 tokens; output accepts 1–262,144. Both must be integers and leave
at least 4,096 input tokens after output and the internal safety allowance (more if operational
instructions/tools require it). Unsupported model context capabilities may still fail at the provider;
these are application bounds, not promises about installed models or GPU memory.
The defaults reserve 4,096 of 16,384 tokens for output. The 12,288-token theoretical input ceiling
also leaves a 1,024-token safety allowance, so estimated input must fit within 11,264 tokens.
Every Ollama inference request explicitly sends these context/output limits; daemon defaults
and Modelfiles do not define the application budget.

The bounded Context Compiler includes the system instruction, all ten tools, messages and
structured calls/results. Its conservative estimate uses model-visible serialized UTF-8 structures:
one estimated token per three ASCII bytes, one per non-ASCII byte, plus framing allowances.
These are estimates, not exact model tokenizer counts. Safety is `max(128, ceil(total / 16))`
tokens; unusual model templates/tokenizers may still exceed estimates.

The current user/tool chain stays complete across tool rounds; large process observations use a
deterministic context-only head/tail projection (1,024 UTF-8 bytes per stream), with status, original
byte counts and separate truncation flags. Canonical process results retain up to 8,192 bytes per
stream. When semantic retrieval is unavailable,
previous turns are retained as a contiguous recent window, newest first, then sent chronologically.
If the next older complete turn does not fit, selection stops; its calls/results drop together.
Durable events and resumed transcripts remain complete. An oversized active request fails before
model invocation without reducing the output reservation or rewriting other mandatory content.
The former `MAX_CONTEXT_CHARACTERS` setting is removed; migrate to
these two token settings rather than converting its character value.

The Ollama adapter requests no input truncation or context shifting. A reported `length` finish
raises an incomplete-response error through existing presentation and does not store a clean final
answer or execute partial tool calls. Missing/unknown provider finish metadata cannot prove why
a response stopped; prompt/output usage, when reported, is diagnostic only.

Semantic history retrieval is optional. Set `HISTORY_EMBEDDING_MODEL` to an already installed Ollama
embedding model; it is independent of `OLLAMA_MODEL`, `TEST_MODEL` and the chat model preference. No
embedding model is selected or downloaded automatically. With retrieval available, each request
keeps the active chain, the immediately previous complete turn when it fits, and at most
three relevant older complete turns. Old candidates must meet cosine similarity 0.65; unused input
budget stays unused. All selected content uses the same 16384-token window, 4096-token output
reservation and default 1024-token safety allowance. The same process-observation projection
applies to selected history; other payloads remain exact. Token counts remain estimates.

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
The turn releases after its canonical answer is committed, without waiting for semantic maintenance.
The next interactive turn, session/model change or shutdown cancels pending optional work. At most
one semantic invocation can remain unresolved; if cancellation is ignored, later extraction is skipped
until it settles. Valid idle updates publish atomically. Pending derived updates may be lost at exit;
the next turn uses prior published notes and exact history without waiting for memory freshness.

Memory lives in versioned atomic JSON at `.agent/session-memory/<session-id>.json`, with bounded
collections and stable durable message/event provenance. It stores no file contents or transcript.
Deleting/corrupting it leaves chat/history intact; exact activity can rebuild from events, while
semantic notes become available again after a subsequent successful update. Semantic regeneration
is not deterministic. No cross-session memory, whole-history summarizer, new workspace tool or memory
UI is added.

Semantic suitability is a behavioral property of the selected model/configuration, independent of
structured-output transport support. Unknown or weak suitability does not prevent normal chat;
each delta is validated independently, with no model allowlist or hidden replacement. See the
[semantic session-memory capability and acceptance contract](docs/ARCHITECTURE.md#semantic-session-memory-contract).

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

Startup uses the shared last successfully selected model if still installed,
then the sole installed model. Multiple installed models require `/model`; zero installed models
leave inference unavailable until you install and select one. Startup only discovers availability;
it does not load or unload a model. Model-specific failures include `/model` recovery guidance;
service, transport and permission failures retain their actual cause.

Successful manual selection confirms provider activation, updates the header, and remembers the
choice as `preferences.lastSelectedModel` in the same `settings.json` used by `/settings`.
This application preference is shared by workspaces and sessions; Settings displays both the saved
startup choice and the currently confirmed runtime model. A preference-write failure opens the
Error Dialog while keeping successful runtime activation. If activation fails after unloading the previous model,
the header shows no selected model and the attempted choice is not remembered.

Resuming a session retains the current runtime model selection. Historical model IDs in session
events remain unchanged, even when those models are no longer installed.

## CLI Commands

Inside the chat:

```text
/model
/model <ollama-model-name>
/resume
/changes
/settings
```

`/model` opens the local Ollama model picker. `/model <name>` switches the model directly for subsequent turns. `/resume` opens the session picker. `/settings` opens persistent application preferences and uses the same model-selection workflow.

In normal chat, drag without Shift to select visible text using your terminal's own highlight.
In Fedora/Ptyxis, Ctrl+Shift+C uses the terminal's native Copy action. Codesh leaves mouse
reporting off in chat and ignores a distinguishable forwarded Ctrl+Shift+C event, so it cannot
cancel/exit or enter the editor. Ordinary Ctrl+C retains its cancel/exit behavior. If a terminal
sends identical Ctrl+C bytes for both shortcuts, Codesh cannot distinguish them; keep the
terminal's native Copy binding configured. The obsolete `/copy` command has been removed
because Codesh cannot inspect a terminal-owned selection.

Mouse reporting is enabled for model/session pickers, approvals, error dialogs and Workspace
Changes, then disabled when returning to chat. Mouse-wheel handling in chat belongs to the
terminal; in an alternate screen it may scroll locally or send ordinary arrow keys according
to terminal settings. Use PageUp/PageDown and Ctrl+Home/End to scroll Codesh's conversation
history. Up/Down retain composer/menu navigation. Native copying follows the terminal's
selection/wrapping rules and does not generate application clipboard feedback or chat events.

The model picker shows “Fetching available models…” and supports R to refresh. Changing a
model shows “Applying model selection…” during the existing asynchronous operation, retaining
the previous confirmed name until it settles. “Waiting for model…” appears after submitting a
prompt, then gives way to the usual response/tool presentation when content or native tool
activity begins. These labels do not claim a cold start or GPU residency; selection uses the
existing provider activation policy without additional warmup requests.

Model discovery/selection and session-picker failures open a readable error dialog. Use ↑/↓,
PageUp/PageDown, Home/End or the mouse wheel to inspect wrapped details; C copies the safe
diagnostic text. Tab selects Close or Copy details, then Enter activates it;
the actions also accept mouse clicks. Esc closes the dialog and restores the previous focus
and draft. Long details have an explicit truncation marker. Close the dialog, then press R in
the model picker for a user-initiated refresh. Explicit Copy details uses OpenTUI's native host
clipboard (Linux Wayland/X11, macOS, Windows where supported), with OSC 52 fallback. Host
success reports “Copied to clipboard”; OSC 52 reports an unconfirmed send. Ordinary agent/tool
errors remain in chat.

`/changes` opens **Workspace Changes** while chat is idle. The list shows current Git changes
inside the workspace: the first status column is staged, the second is unstaged, `·` means no
change in that column, and `??` means untracked. These are read-only snapshots of the workspace,
with no attribution to a particular agent turn.

Use ↑/↓, PageUp/PageDown, or Home/End to choose a file, then Enter to inspect its unified diff.
Tab switches staged/unstaged when both exist; ↑/↓, PageUp/PageDown, and Home/End scroll the diff.
R refreshes status and returns to the list, preserving the selected path if it still exists.
Esc returns from the diff to the list, then to chat. Existing chat shortcuts are unchanged.
Untracked files have no Git diff yet; binary and empty diffs show an explanation.

Git must be available on PATH and support `--no-lazy-fetch`. Missing Git, non-repositories, and
inspection errors leave chat usable. Lists stop at 1,000 entries; diff previews stop at 128 KiB
or 2,000 lines and clearly show when incomplete. Each Git process has a 5-second timeout.
Submodule changes, symlink diff paths, non-UTF-8 names/text, and repositories with configured
content filters are unsupported; the view reports limitations instead of running configured
commands or broadening the workspace scope.

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
