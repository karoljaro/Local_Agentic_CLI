# Phase 20 — Workspace Changes and Diff Review

## Baseline and scope

- Baseline HEAD: `60b400629389a8fbef5b1135c696261af21345a2`.
- Baseline working tree: dirty only because of the pre-existing untracked
  `docs/progress/phase-19.8-progress.md`; preserve that file.
- Phase 19 is closed. No inference, model qualification, prompt changes, new model
  tools, session events, Git writes, dependencies, or commits belong to this phase.
- No applicable `AGENTS.md` files were found in the workspace or its ancestors.
- Relevant audit: `TerminalApp`, slash-command registry, existing native pickers,
  presentation runtime/composition, workspace path, cancellation helpers, direct
  process lifecycle conventions, native renderer tests, and package build gates.

## Design choice

- Add `/changes` to the existing slash-command registry. Open a dedicated native
  OpenTUI modal screen through the established modal lifecycle; preserve normal
  chat keybindings, transcript, model indicators, approvals, and session resume.
- Use a narrow typed `WorkspaceChangesPort`, wired in composition to a dedicated
  Git adapter. The UI never receives arbitrary argv or process handles. This is
  user-facing inspection and does not use `run_process`, `ToolRunner`, or inference.
- Read NUL-delimited porcelain status; preserve staged and unstaged columns and
  raw path identity separately from escaped display text.
- Discover from the configured workspace, restrict status with a literal `.`
  pathspec, and validate all returned paths against the workspace prefix. Diffs
  receive only validated workspace-relative paths as distinct argv after `--`.
  Unsupported layouts must fail closed instead of widening the scope.
- Operations are user initiated; cancellation and request identity fence obsolete
  refresh/selection responses. No background polling or persistent Git records.

## Implementation progress

- Implemented the typed port and composition wiring, NUL status parser, bounded fixed-operation
  Git process adapter, dedicated native view and fenced presentation state.
- `/changes` reuses command suggestions and modal focus/cleanup. Chat streaming, approvals,
  session events, model indicators and the ten production tools remain unchanged.
- Native renderer tests caught and resolved loading-focus loss and narrow-terminal feedback
  clipping; diffs use a single bounded styled text node with native vertical scrolling.
- A concurrent external commit advanced HEAD to `37c883d36082ea381cc0ccde0b5637b4aaa402f1`
  during work. The pre-existing Phase 19.8 file is now tracked; this phase did not modify it
  or create that commit. Initial baseline remains recorded above.

## UI behavior and Git execution constraints

- List: ↑/↓, PageUp/PageDown and Home/End select; Enter opens the selected diff.
  First column staged, second unstaged; `·` is unchanged and `??` untracked.
- Diff: Tab switches staged/unstaged when both exist; arrows/page/home/end scroll.
  Esc returns to files, then chat. R refreshes status, retaining selected path if present.
- Loading, clean, unavailable Git, non-repository, bounded errors, untracked, binary,
  empty/stale and truncated previews have explicit feedback.
- Direct argv only: `rev-parse`, a names-only filter configuration query, `status`,
  `diff` and `diff --cached`. Literal pathspecs and `--` separate filenames from options.
  No pager, shell, TTY, optional index writes, fsmonitor, external diff, textconv,
  lazy fetch/network, Git writes, hooks, inference, model approval or polling.
- Configured content filters fail closed before content inspection: bypassing them could
  misreport a clean filtered file. No configured content commands are executed.
- Workspace scoping uses canonical root containment, literal `.` status scope, independent
  path-prefix validation and component checks before diff. Worktrees are supported;
  outside entries/cross-boundary rename pairs are omitted with a notice.
- Exact caps: 5,000 ms per child; 500 ms TERM grace plus 2,000 ms hard-kill settlement;
  1,000 ms post-exit pipe deadline; 524,288-byte status, 131,072-byte diff,
  4,096-byte stderr, 16,384-byte metadata; 1,000 entries and 128 filter names.
  Rendering caps one preview at 131,072 UTF-8 bytes / 2,000 lines/style chunks;
  one raw plus one rendered preview is retained without caching. At most three sequential
  commands per operation. All caps/truncation are explicit in the architecture document.
- Every supersession/leave aborts its request; controller identity and closed-state checks
  suppress late results. Shutdown awaits outstanding inspection cleanup before renderer teardown.

## Tests and validation

- Final focused run: **92 passed, 0 failed, 1,511 assertions across 10 files**. Covers parser,
  direct argv and literal paths, resource caps, missing Git/non-repository/failures,
  timeout/abort/escalation/pipe closure, state supersession, staged switching, native
  keyboard/focus/scroll/resize, existing chat/modal guards and composition regressions.
- Four real-Git integration tests passed in disposable directories. Verified ordinary
  repositories, newline/Unicode/option-like names, staged and unstaged contents, deletion,
  rename, binary/empty/large diffs, nested scope, linked worktrees and non-repositories.
  Configured helper marker stayed absent; index bytes were unchanged by inspection.
- Initial implementation failures were corrected before this focused pass: unsupported
  `--no-stat`, native loading focus, and a test deferred-helper misuse.
- Final per-file checks ensure an unstaged staged-rename/copy preview cannot include
  source-file changes and a +/- source line mentioning binary output is not misclassified.
- Initial full gates passed (1,185 tests / 8,524 assertions, typecheck, format, Linux build,
  Windows cross-build, smoke and release); final gates are being rerun after those two fixes.
- Final standalone gates passed: `bun test` **1,186 passed / 0 failed / 8,528 assertions
  across 70 files**, `bun run typecheck`, `bun run format:check`, `bun run build:linux`,
  `bun run build:windows`, `bun run smoke:build` and `git diff --check`.
- Final `bun run release:check` passed, repeating format/typecheck, all 1,186 tests,
  both artifact builds and build smoke on the final implementation.
- Read-only live adapter smoke in the actual configured workspace returned all 26 current
  changed entries without truncation and a 3,422-byte unstaged `TerminalApp.ts` diff containing
  the new entry point. No model call or project Git mutation was made.

## Files changed

- Boundary/infrastructure: `src/application/ports/WorkspaceChangesPort.ts`;
  `src/infrastructure/git/{BoundedGitProcess,GitWorkspaceChanges,parseStatus,limits}.ts`,
  their three unit test files and `GitWorkspaceChanges.integration.test.ts`.
- Native UI/state/display: `src/presentation/{WorkspaceChangesView,types,TerminalApp}.ts`,
  `state/WorkspaceChangesState.ts`, `formatters/workspaceChanges.ts`, `commands/commands.ts`,
  and corresponding view/state/formatter/command tests.
- Composition/fixtures: `src/composition/createRuntime.ts`,
  `src/test-support/FakeTerminalRuntime.ts`, `src/presentation/Conversation.test.ts`,
  `src/application/use-cases/RunAgentTurnMemory.test.ts`. The latter two changes only provide
  the added presentation dependency in existing fake runtime fixtures.
- Documentation: `README.md`, `docs/ARCHITECTURE.md`, this progress document.
- Total: 26 Phase 20 files (10 modified tracked files, 16 new files). No dependencies,
  production model tools, engine/session contracts, or existing Phase 19 documents changed.

## Known limitations and final validation

- Submodule changes are excluded; symlink diff paths, non-UTF-8 paths/text, configured
  content filters and unverifiable layouts report limitations. Old Git without
  `--no-lazy-fetch` reports a bounded error.
- Snapshots are non-atomic; external edits can make an entry stale. No OS filesystem or
  concurrent-configuration isolation is claimed. No untracked-file content preview.
- Native Windows runtime has not been exercised. A cross-build is artifact evidence only.

| Final gate | Result |
| --- | --- |
| Focused tests | 92 passed, 0 failed; 1,511 assertions / 10 files |
| Disposable real Git integration | 4 passed, included in focused/full runs |
| `bun test` | 1,186 passed, 0 failed; 8,528 assertions / 70 files |
| `bun run typecheck` | Passed |
| `bun run format:check` | Passed; 198 files checked |
| `bun run build:linux` | Passed |
| `bun run build:windows` | Passed cross-build; native Windows runtime unverified |
| `bun run smoke:build` | Passed |
| `bun run release:check` | Passed, including repeated complete gates |
| `git diff --check` | Passed |

Final HEAD remains `37c883d36082ea381cc0ccde0b5637b4aaa402f1` after the external document-only
commit described above. Final working tree contains only the 26 Phase 20 files listed here:
10 modified tracked files and 16 untracked new files, all unstaged. No commit was created by
this phase. Implementation and requested production validation are complete within the
documented limitations. Phase 20 ends here; Phase 20.1 was not started.
