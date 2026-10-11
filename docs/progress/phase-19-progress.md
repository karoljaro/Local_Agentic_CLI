# Phase 19 — safe foreground process execution foundation

## Status

Current status: **verified**.

- [x] not started — baseline captured before implementation
- [x] audit complete
- [x] implementation in progress
- [x] deterministic validation complete — focused and full gates pass
- [x] live/local smoke complete — six approved harmless cases, zero inference
- [x] verified — all Phase 19 gates complete
- [ ] blocked

## Baseline

- Starting HEAD: `c0f2168dc3ce07f637a77efcae9976094f79defc`.
- Starting `git status --short --untracked-files=all`: empty (clean).
- Starting `git diff`: empty.
- Bun: `1.4.3`; Linux host. Native Windows runtime availability not established.
- Exact current tool list (9): `list_directory`, `find_files`, `read_file`,
  `search_text`, `create_file`, `edit_file`, `replace_file`, `move_file`,
  `delete_path`.
- `LocalToolRegistry` generates JSON Schema from strict Zod schemas. `defineLocalTool`
  parses once, binds its own parsed values and exposes a separate cloned serializable
  projection. `ToolRunner.prepareToolCalls` checks the whole batch before assigning
  IDs, publishing events, approval or execution.
- Execution is sequential. Requested event → explicit approval → started event →
  bound execute → completed/failed event. Missing approval handler defaults to deny.
- Denial publishes `TOOL_APPROVAL_DENIED`, closes siblings with `TOOL_BATCH_CANCELLED`
  and ends the turn. Schema errors are typed `ToolInputValidationError` / batch errors;
  `RunAgentTurn` persists invalid-call feedback and permits model correction within its
  existing iteration limit. Ordinary execution exceptions become `TOOL_FAILED` and
  model-visible error messages; persistence failures remain terminal.
- The current turn `AbortSignal` reaches approval and bound execution unchanged.
  `AbortError` propagates without a normal completion or `TOOL_FAILED`; filesystem
  commits already in flight retain their existing await-and-record semantics.
- Baseline serialized definitions: 4,430 characters / UTF-8 bytes, SHA-256
  `7fe844ddeadf547472c7cfdccdd3807921664abec8ecdb80b67fe5b3eedd6fca`.
- Baseline actual Ollama tool surface: 4,367 characters / UTF-8 bytes, SHA-256
  `763434a6c9ae85d0a096037f2128af6a337d817db689440b52c05d8a6a3a5dd6`.
  Complete nine-tool definitions captured in `/tmp/phase19-baseline-tools.json`.
- Focused baseline: `bun test src/infrastructure/tools src/infrastructure/file-system
  src/application/services/ToolRunner.test.ts
  src/application/use-cases/RunAgentTurnToolRecovery.test.ts` — **247 pass, 0 fail,
  2,429 assertions, 9 files**.

## Process execution audit

Answers established before changing production code:

1. A `RunProcessProvider` belongs beside the nine local tools; a narrow
   `ProcessRunnerPort` / `BunProcessRunner` belongs in the existing application-port /
   infrastructure-adapter boundary. Composition registers only one additional tool.
   No changes are needed to the agent loop, ModelPort, runner, reducer or context compiler.
2. No generic OS/process port exists. `RipgrepSearch.runRipgrepCommand` and build/smoke
   scripts already use direct `Bun.spawn`, but are purpose-specific; reuse Bun, not
   ripgrep's unbounded stderr reader or its search-consumer protocol.
3. `ToolRunner.executeToolCalls` executes prepared calls sequentially, with no process pool.
4. The complete batch passes synchronous preparation first. Each requested event is
   persisted, then approval is awaited and checked against cancellation, then started
   is persisted and cancellation checked again, then bound execution runs.
5. Denial is a failed tool event with `TOOL_APPROVAL_DENIED` and a model tool error
   message; siblings are cancelled and the turn ends without another model round.
6. Executor exceptions become existing `TOOL_FAILED` events and reduced model-visible
   tool errors. An executor `AbortError` propagates. Storage/reduction failures retain
   their terminal semantics.
7. The interactive turn's `options.signal` is passed to prepared execution. The new
   adapter must stop/reap its child and throw `AbortError`, never a successful result.
8. Zod parses into separate values; raw input and the serializable projection cannot
   alter the bound execution values. The projection itself is ordinarily mutable.
   Freeze the new process projection (including args) and prepared authority without
   changing any existing tool's behavior.
9. `NodeWorkspaceFileSystem.resolveWorkspaceTarget` already has relative-path,
   Windows-path and lexical containment policy; `isPathInside` and realpath checks
   provide confinement validation. Extract those exact pure path primitives for both
   consumers, preserving protected file-tool policy separately. Processes must support
   workspace executables under `node_modules/.bin`; cwd/executable containment does
   not apply the file-tool protected-directory filter. Revalidate synchronously right
   before `Bun.spawn`, with no intervening await, to reject changes made during approval.
   Pathname APIs cannot provide an atomic defense against a concurrent external OS
   path swap inside the final check/spawn gap; document this existing-style race limit.
10. Production count/list assumptions occur in `ToolDefinitions.test.ts`,
    `LocalToolExecutor.test.ts`, `InstructionSurface.test.ts`,
    `ContextBuilder.test.ts`, `ContextBuilderRetrieval.test.ts`,
    `ContextBuilderMemory.test.ts`, `createRuntime.test.ts`,
    `createRuntimeRetrieval.test.ts`, `createRuntimeMemory.test.ts`, and the optional
    `scripts/smoke-context.ts` text. Full validation also identified the count assertions
    in `RunAgentTurnRetrieval.test.ts` / `RunAgentTurnMemory.test.ts`; these only change
    9 → 10. Local test registries of nine file tools stay nine.
    Preserve the existing nine-schema hash by hashing the original nine definitions.
11. Canonical results are JSON in `tool.call.completed`, reduced/replayed without
    executing tools. `projectHistoryTurn` ignores tool bodies and includes only tool
    names and existing path/query keys. `SessionMemoryService` extracts semantic
    evidence solely from user/assistant text and recognizes explicit file-tool output
    fields; process stdout/stderr are not evidence or new memory categories. Its
    canonical prefix digest still hashes events through the existing generic path.

Additional inspection: all file providers, Phase 18.1 recovery tests, `createRuntime`,
`RunAgentTurn`, `SessionService`/`SessionReducer`, ContextBuilder/estimator, history
projection, memory service/updater, ApprovalPrompt, README/ARCHITECTURE and release
artifact scripts. No applicable AGENTS.md was found in the workspace or its ancestors.
The approval renderer already supports full structured JSON; show those details by
default for process requests so program/argv/cwd/timeout are reviewable.

Runtime reference checked: [Bun child-process documentation](https://bun.sh/docs/runtime/child-process)
confirms argv spawning, null stdin, separate pipe streams, inherited environment,
exitCode/signalCode and kill signals. Implementation will explicitly own timeout and
abort cleanup rather than infer timeout from a kill/exit code.

Chosen bounds before implementation: 60,000 ms default, 1,000–300,000 ms timeout;
program 1,024 UTF-8 bytes, 128 args, each arg 8,192 UTF-8 bytes and all args together
32,768 UTF-8 bytes; cwd 4,096 UTF-8 bytes. Fixed retained text cap 8,192 UTF-8 bytes
per stream, head/tail including the truncation marker. No dependency is necessary.

## Contract

Strict input: `{ program: string, args?: string[], cwd?: string, timeoutMs?: number }`.
Unknown options reject. Defaults are materialized into the prepared/approved projection:
args `[]`, cwd `.` and timeout `60000`. Timeout integer range is `1000..300000`.
Program is nonempty/no whitespace-only, at most 1,024 UTF-8 bytes. Args: at most 128,
each at most 8,192 UTF-8 bytes and at most 32,768 UTF-8 bytes total. Cwd: at most
4,096 UTF-8 bytes. NUL rejects in all strings. Args are never trimmed/interpreted.
Shared workspace normalization applies to cwd and path-like program; normalized
explicit executables retain `./` so a root file never silently becomes a PATH lookup.
Absolute executable paths reject; bare names use inherited PATH after approval.

Result fields exactly: `program`, `args`, `cwd`, `exitCode`, `signal`, `timedOut`,
`durationMs`, `stdout`, `stderr`, `stdoutBytes`, `stderrBytes`, `stdoutTruncated`,
`stderrTruncated`. ExitCode/signal are actual nullable Bun observations. Non-zero
exits are normal results. Spawn/path/observation exceptions use existing `TOOL_FAILED`;
denial uses existing `TOOL_APPROVAL_DENIED`; cancellation throws existing `AbortError`.
No retries, hidden fallback/discovery process, shell command string, env serialization,
stdin payload, TTY or detached option exists.

All process calls require the existing explicit approval after complete-batch preparation.
The new projection/args/prepared authority are frozen, and execution binds separate
parsed values. Runtime argv, directory/file stat and lexical/realpath checks run after
approval immediately before direct spawn, with no intervening await.

## Safety boundaries

`run_process` will be approved local code execution, **not a sandbox**. Workspace
cwd and direct argv do not confine subprocess filesystem/network access,
descendants or intentionally approved arbitrary code. No command allowlist or
shell/interpreter denylist is present.

- Only the direct Bun child is owned. Timeout/abort sends SIGTERM, escalates to
  SIGKILL after 500 ms, and allows 2,000 further ms for settlement. Unsupported/
  unobservable termination reports a failure, repeats hard kill and never fabricates
  a result; uninterruptible OS processes cannot be guaranteed to exit by user-space code.
- Descendants are not contained/killed as a tree. Inherited pipes receive 1,000 ms
  after direct-child exit to close; otherwise readers close and observation fails.
- Inside-workspace symlinks are allowed; escaping canonical targets reject. File-tool
  protected-path rules are unchanged, while explicit process paths can use project
  executables such as `node_modules/.bin`. This is containment checking, not confinement.
- Final synchronous checks reject swaps made during approval. They cannot provide
  atomic protection from concurrent external OS changes during the check/spawn gap.
- Both streams always drain separately. Each retains fixed raw head 2,048 bytes plus
  tail ring 6,144 bytes. Final text cap is 8,192 UTF-8 bytes, inclusive of the 28-byte
  marker `\n[... output truncated ...]\n`: up to 2,048 head + 6,116 tail text bytes.
  Partial valid UTF-8 boundary characters are omitted; invalid output uses replacement.
  Replacement expansion is capped too. Counters count observed raw bytes, not text.
- Bounded output does not guarantee all accumulated mandatory active history fits
  every context profile. A deterministic test proves two 8,100-byte non-ASCII streams
  overflow the existing 16,384/4,096 profile. The unchanged compiler throws
  `ContextBudgetExceededError`; no context limits or truncation semantics change.
  This finding was reported during implementation before any compiler redesign.

## Implementation

- Narrow `ProcessRunnerPort`, strict `RunProcessProvider` and direct `BunProcessRunner`.
- Fixed-memory `BoundedProcessOutput` (separate stdout/stderr head/tail rings).
- `workspacePaths` extracts the existing pure filesystem path rules; the filesystem
  adapter imports those exact helpers, retaining all file protection/version semantics.
- Factory appends `run_process` as tool 10; no agent-loop/ModelPort/ToolRunner/reducer/
  context/retrieval/memory/model-selection production changes.
- Existing approval UI shows full prepared process JSON by default. Existing generic
  details scrolling and default denial remain; a formatter label names the process tool.
- Production-count assertions/text become ten. Both the Phase 14 schema/lifecycle hash
  and complete Phase 18 nine-tool definition hash are asserted for the original nine.
- Focused tests cover schema/prepared authority, byte retention, real child execution,
  approval/batch/cancellation/replay and generic scripted model recovery. The disposable
  helper and `scripts/smoke-process.ts` require no external command behavior or inference.
- Durable README/ARCHITECTURE document direct argv, approvals, failure/lifecycle/output,
  path checking and precise non-sandbox boundaries.
- No dependencies added; `package.json`/lockfile unchanged. No commit created.
- Serialized ten-tool definitions: 5,132 characters/UTF-8 bytes (delta **+702**).
  Actual Ollama ten-tool surface: 5,043 characters/UTF-8 bytes (delta **+676**).
  Both remain under the existing 6,000-character contract; all descriptions remain
  within existing individual limits. No prompt edits or budget increases.

## Validation

Intermediate deterministic evidence:

- Schema + retention: **62 pass, 0 fail**, 154 assertions (2 files).
- Real Bun adapter: **16 pass, 0 fail**, 62 assertions (1 file). This includes stdout/
  stderr/nonzero, literal argv with no side-effect files, copied workspace executable,
  correct cwd, stdin EOF/no TTY, binary decoding, 1,048,584 bytes on each stream,
  timeout/reaping, real SIGTERM resistance → SIGKILL, abort/listener cleanup,
  path disappearance/symlink swaps and bounded inherited-pipe observation.
- ToolRunner/replay + definitions: **18 pass, 0 fail**, 171 assertions (2 files).
- Context/recovery scope: **80 pass, 0 fail**, 379 assertions (5 files), including
  Phase 18.1 unchanged tests and five new scripted process recovery cases.
- Native TUI suite: **26 pass, 0 fail**, 1,015 assertions (1 file), including visible
  exact process JSON and default denial.

Final focused/full checks and separate harmless local smoke are recorded below.
Model inference requests: **0** (scripted ModelPort fixtures only).

The first aggregate focused run found one stale nine-name expectation in
`LocalToolExecutor.test.ts` (340 pass / 1 fail). It was updated only to append
`run_process`; no existing file-tool expectation changed. `InstructionSurface.test.ts`
likewise appends only the tenth name to its HTTP schema contract.

Final focused command:

```text
bun test src/infrastructure/process src/infrastructure/tools
  src/infrastructure/file-system src/application/services/ToolRunner.test.ts
  src/application/services/RunProcessTool.test.ts
  src/application/use-cases/RunAgentTurnToolRecovery.test.ts
  src/application/use-cases/RunAgentTurnProcessRecovery.test.ts
  src/infrastructure/model/InstructionSurface.test.ts
```

**349 pass, 0 fail, 3,328 assertions, 15 files (7.50 s)**. Full output:
`/tmp/phase19-focused-final.log`. Added edge evidence includes lexical traversal
that cannot re-enter a synthetic root name, a real executable text file with no
shebang receiving a start failure without shell fallback/side effects, a pipe failure
settling the child, and a simulated unobservable termination reporting bounded failure
after repeated supported hard-kill attempts rather than an invented timeout result.

`bun run typecheck`: pass. `bun run format:check`: pass, 179 files, no fixes.

Separate local smoke: `bun run scripts/smoke-process.ts` — **PASS**, Linux, six
explicitly approved invocations through `ToolRunner` → production registry/provider →
actual `BunProcessRunner`, no model/HTTP inference. Log: `/tmp/phase19-local-smoke.log`.
Every invocation uses bare `bun` with argv `["process-helper.js", mode, ...literalArgs]`,
cwd `.`, timeout 2,000 ms (timeout case uses 1,000 ms). A disposable `/tmp` workspace
owns the helper and is removed afterwards. Modes:

| Mode | Helper behavior | Observed outcome |
| --- | --- | --- |
| success | Write `stdout ok\n`, exit 0 | exit 0; stdout 10 bytes |
| failure | Write stdout/stderr, set exit 7 | normal result; each stream 15 bytes |
| argv | JSON-encode exact args | all four `&&`, `;`, `|`, `>` strings literal; no side-effect file |
| large | Alternate 64 × 16,384 bytes on both pipes, `HEAD`/`TAIL` | each observed 1,048,584 bytes; each retained 8,192, truncated; exit 0 |
| wait/timeout | Print `ready\n`, keep alive | timedOut true; signal SIGTERM, exitCode null; settled output 6 bytes |
| wait/cancel | Same helper; AbortSignal at 100 ms | AbortError; no normal tool result published |

No repository mutations, package installs, network commands or destructive helper behavior.
Linux `build:linux`: pass. Windows `build:windows`: pass (cross-build only).
The first full suite run found exactly two stale nine-tool count assertions (1,083 pass /
2 fail), in existing retrieval/memory integration tests. Both now assert 10 without
changing budgets, projections, memory or lifecycle. The final full rerun passed.

### Final validation gates

| Gate | Final outcome | Evidence |
| --- | --- | --- |
| focused process/tool/filesystem/recovery scope | PASS: 349 tests, 0 fail, 3,328 assertions, 15 files | `/tmp/phase19-focused-final.log` |
| `bun run typecheck` | PASS, exit 0 | direct run and repeated by release check |
| `bun test` | PASS: 1,085 tests, 0 fail, 7,770 assertions, 60 files, 10.58 s | `/tmp/phase19-full-test-final.log` |
| `bun run format:check` | PASS: 179 files, no fixes, exit 0 | direct run and repeated by release check |
| `bun run build:linux` | PASS, exit 0 | `/tmp/phase19-build-linux.log` |
| `bun run build:windows` | PASS, exit 0 (Linux cross-build) | `/tmp/phase19-build-windows.log` |
| `bun run smoke:build` | PASS, exit 0 | `/tmp/phase19-smoke-build.log` |
| `bun run release:check` | PASS, exit 0; format + types + 1,085 tests + both builds + build smoke | `/tmp/phase19-release-check.log`; repeated test run 10.51 s |
| `git diff --check` | PASS, no output | final repository check |
| `git diff --stat` | 19 tracked files, 212 insertions, 56 deletions | new untracked files listed separately below |
| `git status --short --untracked-files=all` | 19 modified + 13 new files; all unstaged | exact inventory below |

Release artifact review: `dist` contains exactly `codesh`, `codesh.exe`, `rg`, `rg.exe`.
Existing smoke validates ELF/PE signatures, Linux executable permissions, packaged ripgrep
version/search and disposable startup/resume. Both compiled `codesh` binaries contain
`run_process` and `Process termination did not settle` code strings, confirming the new
adapter is reachable in the compiled runtime. Bun/Node built-ins supply process execution;
existing Zod/OpenTUI/ripgrep packaging remains intact. No shell binary, external process
helper, runtime package or new release artifact was added. **Native Windows runtime
verification was not performed**; Linux cross-build and PE validation are not runtime proof.

## Final state

Final HEAD remains `c0f2168dc3ce07f637a77efcae9976094f79defc`. No commit, staging,
package/lockfile change, dependency installation, model inference or benchmark was performed.
All modifications are the Phase 19 implementation, tests, smoke and documentation.

Exact final model-visible tool list (10): `list_directory`, `find_files`, `read_file`,
`search_text`, `create_file`, `edit_file`, `replace_file`, `move_file`, `delete_path`,
`run_process`. Direct comparison against the pre-implementation capture confirms the
first nine entire definitions are byte-for-byte identical. Final complete definition
SHA-256: `f84801a5ccdf6bbe2d0c83db6e5fe25c82c7d617a28af83a0b53d80165068e95`.

Protected architecture/regression review:

- Nine existing definitions/semantics and filesystem mutation version contracts remain
  intact; filesystem production diff is extraction/import of identical path checks only.
- Phase 18.1 complete-batch preparation, typed correction feedback, denial, executor
  failures and cancellation remain generic and unchanged.
- ModelPort, RunAgentTurn, ToolRunner, SessionService/Reducer and canonical event schema
  have no production changes; processes use the existing event/recovery/replay path.
- Phase 16 compiler/limits, Phase 17 projection/retrieval, Phase 18 memory schema/prompt,
  Phase 18.3 lifecycle, Phase 18.7 best-effort policy and Phase 15.5 model selection have
  no production changes. Only production tool-count expectations change in their tests.
- No auto test/fix/retest strategy, system-prompt rewrite, shell DSL/tool, command
  allowlist, interpreter denylist, background jobs, TTY, git-specific architecture,
  package installation, network policy, model-specific behavior or global mutex was added.

### Exact changed-file inventory

Production source (9):

```text
src/application/ports/ProcessRunnerPort.ts                         new
src/composition/factories/createLocalToolExecutor.ts               modified
src/infrastructure/file-system/NodeWorkspaceFileSystem.ts          modified
src/infrastructure/file-system/workspacePaths.ts                  new
src/infrastructure/process/BoundedProcessOutput.ts                new
src/infrastructure/process/BunProcessRunner.ts                    new
src/infrastructure/tools/providers/RunProcessProvider.ts           new
src/presentation/ApprovalPrompt.ts                                modified
src/presentation/formatters/tool.ts                               modified
```

Documentation (3):

```text
README.md                                                        modified
docs/ARCHITECTURE.md                                              modified
docs/progress/phase-19-progress.md                                new
```

Validation scripts/helper (3):

```text
scripts/smoke-context.ts                                          modified (tool-count text only; not run)
scripts/smoke-process.ts                                          new
src/test-support/processFixture.ts                               new
```

Tests (17):

```text
src/application/services/ContextBuilder.test.ts                   modified (count/text only)
src/application/services/ContextBuilderMemory.test.ts             modified (count/text only)
src/application/services/ContextBuilderRetrieval.test.ts          modified (count/text only)
src/application/services/RunProcessTool.test.ts                    new
src/application/use-cases/RunAgentTurnMemory.test.ts               modified (count only)
src/application/use-cases/RunAgentTurnProcessRecovery.test.ts      new
src/application/use-cases/RunAgentTurnRetrieval.test.ts            modified (count only)
src/composition/createRuntime.test.ts                             modified (count only)
src/composition/createRuntimeMemory.test.ts                       modified (count only)
src/composition/createRuntimeRetrieval.test.ts                    modified (count only)
src/infrastructure/model/InstructionSurface.test.ts               modified (name/count text only)
src/infrastructure/process/BoundedProcessOutput.test.ts           new
src/infrastructure/process/BunProcessRunner.test.ts               new
src/infrastructure/tools/LocalToolExecutor.test.ts                 modified (tenth name only)
src/infrastructure/tools/ToolDefinitions.test.ts                   modified (tenth contract/original-nine hash checks)
src/infrastructure/tools/providers/RunProcessProvider.test.ts     new
src/presentation/TerminalApp.test.ts                              modified (process approval test)
```

Total: **32 changed files**, 19 tracked modifications and 13 new untracked files.
`git diff --stat` deliberately excludes untracked files; the inventory accounts for them.
