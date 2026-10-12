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
- `ContextBuilder`, which compiles current/history messages, request-only process observations and optional derived notes within the configured context/output/safety budget;
- `SessionMemoryService` and `ModelSessionMemoryUpdater`, which maintain optional derived session state through exact event projection and bounded semantic deltas;
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
- `BunProcessRunner` for one owned foreground child behind `ProcessRunnerPort`.

Read-only tools run automatically. Mutating tools require approval:

- read-only: `list_directory`, `find_files`, `read_file`, `search_text`;
- mutating: `create_file`, `edit_file`, `replace_file`, `move_file`, `delete_path`.
- process: `run_process` always requires approval, without command classifications.

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

All nine file tools retain lexical/realpath containment and the protected-path/env policy in
the filesystem/search adapters. The tenth tool is `run_process`; no shell tool, git-specific tool,
package installation tool, network policy engine, background job or TTY capability is registered.

### Foreground process contract

`RunProcessProvider` defines one strict Zod schema and registers through `LocalToolRegistry`:

```ts
run_process({ program, args = [], cwd = '.', timeoutMs = 60_000 })
```

Only `program` is required; unknown fields are rejected. Program is nonempty (no whitespace-only
names), at most 1,024 UTF-8 bytes. Args remain literal strings, including empty strings and spaces:
at most 128 args, 8,192 UTF-8 bytes each, 32,768 UTF-8 bytes total. Program/args/cwd reject NUL.
Cwd is at most 4,096 UTF-8 bytes. Timeout is an integer from 1,000 through 300,000 ms.
Schema parsing/preparation performs no filesystem IO, process discovery or process launch.

Preparation binds normalized values separately from raw model input and freezes the serializable
process projection, its args and prepared execution authority. Complete-batch preparation must
succeed before any IDs/events/approval/execution, using the existing Phase 18.1 boundary.
`ToolRunner` executes calls sequentially. Every invocation persists requested, awaits explicit
approval of the exact prepared program/args/cwd/timeout, checks cancellation, persists started,
checks cancellation again and invokes the bound execution. Missing approval defaults to deny;
denial launches zero processes, reports `TOOL_APPROVAL_DENIED`, cancels siblings and ends the turn.
Processes are not deduplicated. An approved attempt clears file discovery/search result references
because processes may mutate files, including when they eventually fail. There is no expectedVersion,
workspace scan, rollback or automatic retry for process effects.

`BunProcessRunner` invokes `Bun.spawn({ cmd: [program, ...args], cwd, stdin: 'ignore',
stdout: 'pipe', stderr: 'pipe' })` directly. There is no shell wrapper, shell parser, command DSL
or execution of display strings. `&&`, `;`, `|`, `>` and other shell-looking syntax remain argv
content unless the explicitly approved program interprets it. Environment is inherited and never
included in approval or output. No model-controlled spawn options, stdin contents, env overrides,
TTY, detached mode, PID handle or later process-management tool is exposed.

Bare executable names use the runtime's inherited PATH without a preliminary `which` process.
Path-like programs must be workspace-relative; absolute POSIX/Windows/drive-relative paths are
rejected. `workspacePaths` extracts the existing filesystem relative-path and lexical containment
policy for reuse, without weakening protected file-tool checks. `/` separators are required on
both platforms. Process cwd and explicit executable paths use this shared policy plus realpath
containment and a directory/file stat check. Internal symlinks are allowed if their canonical
targets remain within the workspace (including `node_modules/.bin` executables). Explicit
executable paths resolve from the workspace root, independently of cwd. Prepared cwd is the
normalized relative path returned in results, even when an internal symlink resolves elsewhere
inside the workspace. Final resolution and spawn are synchronous with no intervening await,
rejecting disappearing paths and symlink escapes introduced during approval. Pathname checks
cannot atomically eliminate a concurrent external OS replacement inside the final check/spawn
gap; there is no directory-handle spawn primitive or filesystem isolation promised here.

The adapter owns timeout and abort separately. Timeout marks `timedOut: true`, requests SIGTERM,
continues draining both pipes, escalates to SIGKILL after 500 ms if the owned child has not settled,
and allows a further 2,000 ms for settlement. It reports runtime-provided exitCode/signalCode only
after exit and observation settle. If termination still cannot be observed, it repeats the supported
hard kill and reports a truthful execution failure rather than a fabricated completed result.
Windows signal/termination behavior is delegated to Bun's platform implementation; a reported
signal may be null. Linux runtime evidence does not prove native Windows behavior.

Turn/tool AbortSignal triggers the same owned-child cleanup promptly, awaits settlement and throws
the existing `AbortError`. It never becomes `timedOut: true` or publishes a stale completed result.
There is no guarantee of descendant termination. Descendants can inherit pipe handles; after
the direct child's exit, the adapter allows 1,000 ms for pipes to close, then cancels its readers
and reports an observation failure if they remain open. This keeps inherited pipes from holding
foreground observation indefinitely without claiming ownership of descendants.

Exit 0 and non-zero exits are normal results. Spawn failures (ENOENT, permission/OS errors),
missing/non-directory cwd, escaping paths and runtime observation failures use existing
`TOOL_FAILED` events and model-visible recovery. No fake exit code 127, fallback executable or
automatic retry is introduced. OS errors retain their code and approved relative input, avoiding
absolute workspace-root leakage from internal diagnostics.

The stable result is:

```ts
{
  program, args, cwd, exitCode, signal, timedOut, durationMs,
  stdout, stderr, stdoutTruncated, stderrTruncated, stdoutBytes, stderrBytes
}
```

ExitCode and signal are nullable runtime observations. Duration uses `performance.now()` and is
nonnegative. Separate stdout/stderr capture does not reconstruct global interleaving. Each pipe
drains continuously into a fixed 2,048-byte head plus 6,144-byte tail ring, never an unbounded full
buffer. Complete valid text at or below 8,192 UTF-8 bytes is returned unchanged. Larger output
returns the first up-to-2,048 decoded UTF-8 bytes, `\n[... output truncated ...]\n`, and the last
up-to-6,116 decoded UTF-8 bytes (the 28-byte marker counts inside the 8,192-byte text cap).
Partial valid UTF-8 characters at slice boundaries are omitted; invalid sequences decode with
replacement. Replacement expansion is capped as well, even when raw bytes were below the cap.
Truncation flags describe lost retained observation; counters always count actual observed
process bytes, independently of decoding or retention. Hitting retention caps never stops pipe reads.

Only bounded results enter the normal `tool.call.completed` JSONL event/reducer/replay path;
no terminal database or raw output log exists. Replay requires no process launch or external output.
ContextBuilder applies the request-only projection described below. Phase 16 budgeting remains
unchanged: arbitrary large user/file content, exact call arguments, repeated process observations
or small custom profiles can still overflow mandatory history. The existing
`ContextBudgetExceededError` reports that limit without enlarging context. Phase 17 search
projection still excludes raw tool bodies (only generic tool names flow
through), and Phase 18 semantic evidence/schema/file projection never ingest process stdout/stderr.
No semantic-memory lifecycle, opportunistic scheduling or model-selection policy changes apply.

**This is approved local code execution, not a sandbox.** The guarantees are exact prepared argv,
explicit approval, no implicit shell, checked workspace cwd/explicit paths, bounded observation and
owned-child timeout/cancellation cleanup, and no model-controlled env/stdin/TTY/background options.
The process still runs with the user's OS permissions: filesystem/network confinement, descendant
containment, read-only purity and protection from intentionally approved malicious executables
are not guaranteed. Explicit shells, language runtimes and package scripts may execute arbitrary
code. No command allowlist, shell/interpreter denylist, automatic package installation, privilege
injection or project-specific verification policy is added.

### Verification and repair behavior

Verification belongs to the model. The default system guidance asks it to verify material changes
with a relevant, reasonably bounded non-interactive command when workspace/conversation evidence
supports one. Focused tests, typechecks, build/check, formatter/linter checks and project scripts
are verification classes, not an executable matrix. Instructions, existing configuration/scripts,
CI, explicit user commands and successful commands in the current task ground command choice.
Known commands and paths need no rediscovery; existing file/search tools suffice for inspection.
User/repository requirements, prescribed scope/order and explicit command restrictions take precedence.

Inspection/explanation, tiny text-only edits, unavailable meaningful verification or disproportionate
execution cost may finish unverified. There is no post-edit runner, command detector, required
process-before-final barrier, automatic retry or persisted verification-state subsystem. The ten
tool descriptions and Phase 19 execution semantics are unchanged. A nonblank system override still
replaces the default guidance.

Exit 0 establishes success of that exact command. Non-zero is a completed diagnostic observation,
not a tool infrastructure failure. The model examines exit/signal/timeout and stdout/stderr before
attributing a failure. Changed file/line/symbol, focused behavior or a direct consequence can support
repair. Untouched unrelated code, known baseline failures, missing services/toolchains or uncertain
attribution do not justify speculative edits. Inspect narrowly or report uncertainty. A concrete
relevant failure preventing requested completion and a supported corrective change permit bounded
repair, followed by useful re-verification.

Stop when the same failure persists without new evidence, the next fix is speculative/unrelated or
materially broadens scope, a prerequisite/command is missing, execution is denied, timeout has no
safe narrower check, output/context is insufficient, or genuine user input is needed. The unchanged
generic loop permits twelve model rounds and their requested batches, then reports
`TOOL_ITERATION_LIMIT_REACHED`; no repair-specific counter exists. Each further process is a
deliberate model call with fresh normal approval. Denial still terminates the turn; no alternate
hidden execution. No automatic dependency installation, downloads or network recovery.

Never claim a test, build, typecheck, lint, formatter or other command passed, or that a failure was
fixed, without actual current-task tool evidence or trustworthy user evidence. An edit alone proves
neither. Report the exact observed scope: narrow success cannot establish broad validation. Disclose
failed, partial, unrun, denied, unavailable, blocked or inconclusive checks, and a repair without
re-verification. No rigid final-answer template, natural-language validator or second model enforces
this contract. Deterministic scripted decisions verify runtime/evidence behavior; a real model's
adherence remains behavioral and the bounded live smoke is supplemental.

### Process observation context projection

The Phase 19 canonical result retains its original up-to-8,192 UTF-8 bytes per stream. Two maximum
non-ASCII streams can exceed the unchanged default estimated input allowance. ContextBuilder
therefore lazily projects only valid completed `run_process` observations in considered turns before
estimation/selection. Canonical JSONL, reducer content, approval authority and replay remain exact;
the same pure projection is recomputed after resume and for selected historical observations.
Errors and unrelated tool results are untouched. History beyond the budget cutoff is not serialized.

Model-facing text limits, inclusive of the marker, are **1,024 UTF-8 bytes each for stdout/stderr**,
**256 each for program/cwd**, and **512 for oversized args JSON preview**. Small fields stay exact;
args remain an array when its serialized UTF-8 size is at most 512 bytes, otherwise a bounded
equivalent `{ count, preview }`. Approved/canonical assistant-call argv stays exact. Identity-preview
compaction prevents duplicate large result metadata from consuming the observation allowance; it
does not expand the limits for large mandatory calls.

For a string exceeding its limit, retain the first `floor((limit - 40) / 2)` UTF-8 bytes and last
`limit - 40 - head` bytes around `\n[... context projection truncated ...]\n` (40 bytes).
Omit partial UTF-8 characters at boundaries. Phase 19's invalid UTF-8 replacements are already
decoded text; the projection preserves retained replacements and bounds their UTF-8 size. Streams
remain separate. Original exitCode/signal/timedOut/durationMs, stdoutBytes/stderrBytes and
stdoutTruncated/stderrTruncated remain visible. Additional context-only `contextProjection`
flags (`programTruncated`, `argsTruncated`, `cwdTruncated`, `stdoutTruncated`, `stderrTruncated`)
describe this second shortening layer, independently of execution retention. Entire small results
remain byte-identical and receive no redundant context flags.

Bounds were derived with Phase 16's existing conservative serialized UTF-8 estimator, including
nested JSON escaping. The default profile remains 16,384 total / 4,096 output / 1,024 safety,
allowing 11,264 estimated input tokens. A 2,048-byte stream cap can overflow ordinary mandatory
structure on control-character output; the chosen 1,024-byte cap and small identity bounds fit one
maximum retained observation alongside ordinary inspection/edit/call context. These estimates do
not claim exact tokenizer counts or safety for arbitrary accumulated turns/custom profiles.
Unrelated mandatory overflow still fails. Raw and projected process bodies never enter Phase 17
embedding/search projection or Phase 18 semantic-memory evidence; their contracts remain unchanged.

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

`SessionService` reads and validates a session JSONL file on first access in a runtime, then keeps
its events and incrementally reduced state in memory. The transcript loader and `AgentLoop`
share that instance. Appends are serialized and written to JSONL before the cached
events and state are updated. A new process always rebuilds the cache from JSONL.

Tool-calling model responses are persisted as one `assistant.tool_calls.completed` event before
tool execution starts. The event keeps the assistant content and the complete tool-call batch, so
rebuilding a finished session produces the same model context as the live agent loop. Incomplete
batches are excluded from rebuilt model messages until every call has a completed or failed event.
Historical tool names and results remain opaque persisted data; replay does not resolve or execute
them through the current registry, so renamed tools require no model-visible aliases.

## Semantic Session Memory Contract

Semantic session memory is an optional best-effort optimization: bounded derived working state for
the current session. Supporting this feature means the application can attempt, validate and
persist semantic deltas safely; it does not certify every selected model's semantic reliability.

### Role and Authority

Durable canonical JSONL and `SessionReducer` own conversation history. The filesystem owns current
file contents. Derived notes in `.agent/session-memory/<session-id>.json` may improve continuity;
current user instructions, workspace/tool evidence and conflicting exact history override them.
Exact file activity and application failures are projected from committed events, separately from
model interpretations of goals, decisions, constraints and task state.

The compiler reserves mandatory system/tools/active chain/output/safety before admitting bounded
notes. It then includes the previous whole turn when it fits and Phase 17's retrieved older turns
where available; unavailable retrieval uses Phase 16 recency fallback. Process observations use
the request-only projection above; all other selected payloads stay exact. This precedence is an
application contract, not a guarantee about a model's next answer.

### Mechanical Provider Capability

A mechanically compatible `ModelPort` honors the updater's structured response request, configured
context/output profile, cancellation signal and terminal stream semantics. Inability to honor a
request must surface as an optional-operation failure. `ModelChatInput.responseSchema?` permits
ordinary chat to omit structured output; it is not a capability declaration or negotiated flag.
There is no new capability API. The sole concrete production adapter maps the supplied schema to
Ollama `format`, forwards cancellation, bounds structured transport and requires provider completion.

Schema transport support says nothing about semantic suitability. The host cannot detect native
grammar enforcement: if a future port ignores the schema, malformed/nonconforming output fails
validation, while a conforming result still faces all independent host checks. A stream that lacks
clean completion or does not settle is rejected/bounded by the optional deadline. An ignoring port
cannot publish a cancelled result or accumulate optional requests, although host cancellation does
not prove remote compute has stopped. A capability bit would not establish any of these guarantees.

### Semantic Model Suitability

"Semantic-memory capable" as a model judgment means a model/configuration follows the generic
delta contract reliably enough for operational use, within the configured output/deadline envelope.
It is an empirical behavioral judgment, independent of model name, family, parameter count or
ability to emit schema-valid JSON. A suitable extractor should generally:

- return `goal:null` for an unchanged goal and establish an initial goal only when none exists;
  replace the high-level objective only with explicit current user evidence;
- emit minimal changes without restating unchanged state; record settled choices as decisions,
  persistent user restrictions as constraints, and exclude unaccepted proposals;
- reuse existing semantic keys, with one coherent operation per category/key target and the same
  task identity across pending, completed and semantic problems;
- capture multiple independent durable changes in one turn, including a persistent restriction
  and unresolved blocker; a blocker belonging to an existing task must reuse that task's key;
- represent replacement by one same-key upsert and revocation by an existing-key removal;
  remove+upsert of the same category/key conflicts, and unrelated problems require their own
  resolution evidence;
- represent explicit pending/problem transitions and meaningful completion; a completed upsert
  clears matching pending/semantic problems, while pending/problem upserts reopen completed work;
  a successful tool or response alone does not establish completion;
- cite current evidence that actually supports each operation, respect source roles and host-owned
  state, and finish bounded structured output within the existing request envelope.

Compound changes and coherent reversal remain capability requirements even when a qualification
fails them. They do not license prompt tuning, fuzzy host key merging or partial delta acceptance.

### Individual Update Acceptance

An accepted update is one particular delta that passes the entire runtime boundary:

1. A durable normal final response and matching current user/final message evidence permit the
   optional attempt. Oversized evidence or a request that cannot fit its budget fails safely.
   Failed/denied/interrupted turns permit deterministic maintenance only.
2. The updater finishes cleanly with `stop`, no tool calls or other finish reason, bounded response
   text, valid JSON and the strict version-1 delta schema. Missing terminal completion, output-limit
   results and partial fragments cannot be repaired, retried or partially applied.
3. The host independently parses the delta and validates exact current quote/ID origin, unambiguous
   sources, roles and goal rules. Goal/constraints require user evidence; initial cannot overwrite
   an existing goal. Assistant decisions require confirmed turn mutation and no unresolved turn
   failures; assistant completion requires no unresolved turn failures. Source role sets the stored
   basis. Duplicate category/key operations, reserved `tool-`/`agent-` keys and edits to deterministic
   problems reject the whole delta; file observations are outside the semantic delta schema.
4. The compact candidate document passes strict schema and current-session/prefix provenance
   validation. Updater version and originating model metadata are recorded; the selected model is
   checked before/after extraction. Session identity, activation generation, exact prefix and operation
   cancellation still fence publication, including selection changes and disposal. Atomic publication
   must succeed before owned in-memory semantic replacement; one invalid operation rejects all.

Existing bounds remain: production extraction **10000 ms**, output **min(1024, configured output)**,
response **16000 characters**, user/final evidence **6000/2000 characters**, at most **12 changes**,
and separate read/publication caller bounds of **1000 ms**. `OLLAMA_KEEP_ALIVE` remains **0** by
default; this policy adds no configuration or changes to extraction instructions/schema/settings.
Writes stay ordered after caller timeout. An OS rename already dispatched cannot be rolled back;
it may finish only as an artifact labeled with its original valid prefix, never as a newer result.

**Origin validation is not semantic entailment.** An exact source quote and valid role/provenance
are necessary but do not prove that natural-language evidence supports the proposed meaning,
that a choice was accepted, or that all durable changes were extracted. The extractor is expected
to supply that support. Update acceptance does not qualify the model or certify semantic truth;
there is no entailment checker or second-model verifier.

### Failure and Fallback

Timeout, output limit, malformed/schema-invalid output, evidence/host rejection, provider inability
and publication failure are nonfatal to the completed conversation. No failed semantic delta is
partially applied. Previous valid semantic notes plus current exact deterministic observations
remain available; existing internal failure diagnostics may record the unsuccessful attempt.
Cancelled, superseded and disposed operations discard late extraction rather than publish it.

Missing, corrupt, incompatible, foreign or invalid-provenance memory yields no semantic notes;
canonical events rebuild deterministic observations without inference or semantic backfill. Empty
memory contributes no system section. The next turn uses the canonical active/current chain with
the request-only process projection, budgeted previous/retrieved history and any still-valid prior
notes without waiting for freshness.
Canonical storage/model/context errors retain their ordinary behavior; semantic fallback does not
hide them. Losing optional updates on exit cannot lose the committed answer.

Phase 18.3 ownership remains: immediate turn release after canonical completion, interactive
priority through cancellation, one unresolved updater invocation, zero semantic backlog and immediate
disposal without flushing inference. An unresolved raw call suppresses later optional extraction
until it settles; this is resource containment, not a failure-count circuit breaker.

### Model Selection and Qualification

Any otherwise selectable installed model remains usable for normal chat when semantic suitability
is unknown or weak. The updater opportunistically uses that same selected `ModelPort`.
Semantic-quality/validation failures do not reject or replace the model, change its preference or
rewrite historical model IDs. Actual model disappearance/provider model-not-found retains the
independent Phase 15.5 availability behavior: selection may clear, without automatic replacement.

Offline qualification can inform operator/user model choice. It is bounded evidence about a
model/configuration, not an official support grant or persistent quality score. Production chooses
best effort with independent per-update validation: no hardcoded allowlist, qualification registry,
dynamic circuit breaker, automatic default change, hidden replacement or dedicated memory model.
No capability UI, telemetry framework, entailment subsystem or background worker is required.

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
