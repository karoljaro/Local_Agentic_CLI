# Phase 14 — model-facing tool surface

## Status

verified — required deterministic gates, local-model smoke and final diff review complete.

## Baseline

- Starting HEAD: `de43524ccace3fe89d2bd1bc605538d26b5d15d2`.
- Starting `git status --short --untracked-files=all` and `git diff --name-only`: empty; clean workspace.
- Bun: `1.4.2`.
- `bun run release:check`: format and typecheck passed; 438 tests passed, 2 failed (440 total, 4,830 assertions, 28 files). Existing failures: ToolRunner parses/selects once; LocalToolRegistry raw normalized invocation. Builds/smoke were not reached. Focused diagnosis pending.
- No applicable AGENTS.md found.

## Current tool inventory

The following baseline inventory is retained as the audit record; the actual final inventory is in **Final tool contract** below. All definitions originate in `src/infrastructure/tools/providers/`, registered by `src/composition/factories/createLocalToolExecutor.ts`. `LocalToolRegistry` converts Zod schemas and binds parsed inputs once; raw execute prepares/validates too. Model transport uses `toOllamaTool`, which omits internal approval/cache metadata.

| Tool | Purpose / description chars | Input | Output | Approval / metadata | Provider / boundary / tests / limitations |
| --- | --- | --- | --- | --- | --- |
| list_files | Recursive discovery; 221 | optional path | files[], truncated | read; deduplicate | ListFilesProvider → WorkspaceFilePort → NodeWorkspaceFileSystem; containment/policy; executor/FS tests; no depth, directory entries or pattern |
| read_file | Bounded UTF-8 read; 408 | path, optional startLine/startOffset/endLine | path, content, line metadata, truncated, nextRead? | read; always fresh | ReadFileProvider → FS; byte cap, realpath/policy; executor continuation tests; UTF-16 cursor/CRLF contract |
| search_file | Literal content alternatives; 163 | query (pipe-separated) | returnedMatches, returnedFiles, matches[{path,line,text}], truncated | read; deduplicate | SearchFileProvider → WorkspaceSearchPort → RipgrepSearch; fixed executable/options, two bounded env-policy branches, timeout/cancellation; search tests; name ambiguous, literal pipe unavailable |
| create_file | New UTF-8 file; 93 | path, content | path, created | mutation; approval; invalidates | CreateFileProvider → FS; wx no overwrite, size/policy/realpath; executor/FS tests; parent must exist, direct write may leave partial file after failure |
| edit_file | One exact replacement; 100 | path, oldText, newText | path, replaced, matchCount | mutation; approval; invalidates | EditFileProvider → EditWorkspaceFile → FS; unique match, literal replacement, expected content, temp+rename; use-case/FS/executor tests; one edit/call |

## Capability matrix

| Capability | Baseline | Decision |
| --- | --- | --- |
| Read / line range / lossless continuation | read_file | Preserve Phase 1 behavior |
| One-level directory inspection / project tree | Recursive files only | list_directory: typed entries, default one level, max depth 5 |
| Find filenames / patterns | Unfiltered listing | find_files: bounded glob path discovery |
| Search contents | search_file | search_text: literal single-line query, no hidden alternatives |
| Nested file creation | Missing parents fail | One obvious safe create call required |
| Multiple exact edits | One per call | edit_file: 1–50 unique nonoverlapping edits, one atomic final write |
| Full-file replacement | No explicit tool | replace_file: mandatory read version, existing files only |
| Empty-directory create | None | Deferred: nested create covers coding scaffolds |
| Move / rename | None | move_file: no overwrite, regular files only |
| Delete | None | delete_path: file or empty directory, never recursive |

## Model ergonomics audit

Baseline read descriptions dominated prompt overhead. Listing claimed name discovery without a name filter and always scanned recursively. `search_file` actually searched contents, split pipes, and could not search a literal pipe naturally. The final surface separates directory inspection, filename discovery and content search. Defaults are cheap; simple scalar inputs and one bounded edit array avoid modes/unions. Read cursor guarantees remain intact with a shorter operational description; only nextRead denotes remaining forward content. Create/edit/replace clearly mean new file/exact regions/whole existing file. Move and deletion are deliberately bounded verbs, with no force/recursive options. Errors state the next useful action rather than hidden implementation details.

Pairwise review: list_directory versus find_files is tree inspection versus matching file paths; find_files versus search_text is paths versus contents; read_file returns content at a known path; create_file refuses existing files; edit_file changes exact unique regions; replace_file requires a read version for whole-file replacement. Move/delete cannot be substitutes for text mutation. No ordinary intent has multiple equivalent modes or aliases. Historical labels remain only for replay/presentation. Independent reviewers audited API definitions, filesystem semantics, lifecycle, and model workflows; root selected/integrated the final contracts.

## Proposed final tool surface

Root decision recorded before broad implementation: nine orthogonal tools. Every path is workspace-relative. All mutations require existing ToolRunner approval, never deduplicate, and invalidate discovery/search references when execution starts (including failed attempts that can leave parents). Reads do not require approval.

| Proposed tool | Purpose | Input | Output | Kind / approval | Replaces / adds |
| --- | --- | --- | --- | --- | --- |
| list_directory | Inspect one directory or a bounded tree | path? (root), depth? (1; max 5) | path, entries[{path,type}], truncated | read; dedup | Replaces recursive-only list_files with cheap typed inspection |
| find_files | Find filenames or glob-matched paths | pattern, path? (root) | files[], truncated | read; dedup | Adds explicit path finding; glob syntax limited to *, **, ? |
| search_text | Find literal text inside workspace files | query | returnedMatches, returnedFiles, matches, truncated | read; dedup | Renames search_file; removes implicit pipe alternative syntax and trim |
| read_file | Read bounded text/ranges and continue exactly | path, startLine?, startOffset?, endLine? | existing read shape plus version | read; fresh | Keeps exact Phase 1 continuation; adds version for guarded replacement |
| create_file | Create a new text file and safe missing parents | path, content | path, created | mutation; approval | Adds one-call nested create; exclusive complete publication |
| edit_file | Apply multiple unique exact edits atomically | path, edits[{oldText,newText}] (1–50) | path, changed, editsApplied | mutation; approval | Replaces single-edit schema; all matches use original content and overlaps reject |
| replace_file | Replace all content of an existing text file | path, content, expectedVersion | path, changed | mutation; approval | Adds explicit full replacement, including existing empty files; version comes from read_file |
| move_file | Move/rename one regular file without overwrite | source, destination | source, destination, moved | mutation; approval | Adds bounded refactors; missing destination parents allowed |
| delete_path | Delete one file or empty directory | path | path, type, deleted | mutation; approval | Adds obsolete-file and empty-directory cleanup; no recursive flag |

Rejected candidates: shell/process/network/git/package tools (explicitly excluded); apply_patch/custom patch language (higher parser/model complexity than structured edits); create_directory (nested create covers coding scaffolds; empty directories do not justify another model tool); directory move (portable exclusive rename unavailable; protected subtree and symlink traversal substantially increase scope); recursive deletion/force (unnecessary destructive surface). No aliases for renamed tools: persisted tool names/results are opaque and replay without registry lookup. Historical records will not be rewritten.

## Safety contract

Preserve workspace-relative paths, normalized lexical containment and realpath containment; protected directories `node_modules`, `.git`, `.agent` in every segment; `.env*` directories denied, only exact `.env.dev`, `.env.development`, `.env.example` files allowed. Add lexical policy checks as well as canonical checks to close protected aliases. Preserve read/write bytes, bounded discovery/search, cancellation cleanup and truthful lifecycle. ToolRunner owns approval, events, dedup and invalidation. No model-facing shell, command, arbitrary executable, git, package-manager or network tool.

Nested parents are validated/created segment by segment, including canonical containment. Safe in-workspace symlink parents for create remain supported; escaping/protected aliases reject. Move/delete reject symlinks in their path chains and workspace roots. Create uses completed same-directory temporary content + exclusive hard-link publication, so a failed write cannot expose a partial target. Empty parents can remain after failure/cancel; this is intentionally not a transaction. Completed creates return a warning identifying any temp file whose cleanup failed; failed writes preserve their primary cause and identify failed cleanup remnants. Temporary files are held through exclusive owned FileHandles while writing; unowned collision files are never removed. Already absent cleanup paths are success, not false remnant warnings. Move uses exclusive hard-link + unlink, never overwrites a destination; it is not an atomic two-name transaction and both names can remain if source unlink fails. Already removed move sources count as success; other removal failures explicitly ask checking both paths. Delete is one unlink/rmdir; directories must be empty. Existing-file replacements retain temp+rename atomic publication and optimistic stale-content checks; external races after preflight and crash durability are not claimed. Cancellation is checked before/between preparation steps; once a filesystem commit begins, await its real outcome and cleanup before honoring abort. Native Windows names additionally reject ADS/device/trailing-dot/space aliases, with protected-name/glob case folding only on Windows.

## Implementation checkpoints

1. Baseline inspected; parallel model API, filesystem and lifecycle/test audits started. This record created before changing implementation.
2. Audits completed. Confirmed lexical protected-symlink bypass and `.env*` directory search mismatch; both will be tightened to the existing Phase 9 policy. Baseline failures are Bun 1.4.2 `spyOn` incompatibility with Zod accessor `parse`; update tests to count schema transforms without changing production parsing. Final proposal recorded above; coordinated filesystem, lifecycle/integration and definition/documentation ownership before edits.
3. Registry now declares the nine proposed tools. Removed obsolete ListFilesProvider/SearchFileProvider definitions. Added concise simple provider schemas, version-guarded replace, multi-edit validation against original content with overlap/ambiguity rejection, literal content search, and separate prepared call-data projection. Existing edit cancellation/literal/stale checks pass: 12 tests, 21 assertions. Current docs and approval labels updated by API workstream; filesystem and integration work ongoing.
4. Root edit/preparation/search focused tests: 39 pass, 0 fail, 87 assertions across 3 files. API/documentation/formatter targeted tests: 19 pass, 0 fail, 122 assertions across 3 files. Interim definitions: 9 tools, 4,639 characters (single-line search validation still to be measured). Ollama executable present; initial permitted local-service query found no server, then user started Ollama; smoke preparation continues.
5. Search now explicitly validates single-line literal queries and preserves excerpt whitespace (strips only the line terminator). Safe-env branches exclude `.env*` directories after positive include globs. Ollama lists installed `gemma4:12b-it-qat` and `llama3.2:1b-instruct-q4_K_M`; no download. Prepared a bounded smoke script in `/tmp` using production OllamaModelAdapter/definitions and an isolated fixture; execution waits for filesystem integration. Interim typecheck errors are incomplete parallel FS work plus two optional-path spreads, which were fixed.
6. Independent root-code review complete. No additional concrete issues after clarifying single-line search and returning `changed: false` without writes for identical edit/replacement content. Added overlap, duplicate/missing edit, original-coordinate/literal and no-op tests; use-case gate 20 pass/39 assertions. New prepared replacement race/cancellation gate 2 pass/5 assertions. Lifecycle + RunAgentTurn gate 91 pass/741 assertions; parse/select-once baseline assertions now compatible with Bun 1.4.2. API footprint now 4,676 characters (9 tools); description limits and no excessive tool inputs pass. Production workflow tests include late approval cancellation, failed-create discovery invalidation, during-commit cancellation, stale/no-op replacement, historical replay and protected/symlink attempts; complete run awaits adapter integration.
7. Filesystem adapter integrated: all expanded port methods available, baseline FS tests migrated (51/51 pass), typecheck passes. Complete focused tool/runner/turn/use-case/filesystem gate: 262 pass, 0 fail, 2,466 assertions across 10 files. Discovery now skips symlinks and uses a 10,000-entry traversal/100-level find budget; model paths use portable `/` separators. Detailed FS mutation failure/cancellation/alias coverage and independent review continue. Local Ollama smoke initially hit sandbox socket denial, then requested the required permitted retry.
8. Interim full `bun test`: 480 pass, 0 fail, 5,296 assertions, 33 files. Root review found glob-regex backtracking risk; filesystem owner is replacing the matcher before final validation. Search query now rejects NUL as well as CR/LF before argv construction. Real long-line search/read continuation and no-op replacement regressions pass. Local capable-model smoke is running with bounded request/round timeouts; no model compliance is being counted as correctness evidence.
9. Glob matching changed to finite-state bounded matching (no regex backtracking), and native filesystem errors normalize to relative paths. Interim Linux build and artifact smoke passed. Windows build found missing already-locked optional `@opentui/core-win32-x64@0.5.14`; restoring locked platform dependencies with frozen lockfile/ignored scripts before retry. No dependency manifest/version change is intended. Local model selected list_directory then read_file naturally so far.
10. Frozen optional-platform install completed; Windows build and artifact smoke now pass. `package.json` and `bun.lock` have no diff. Windows-only ripgrep glob case folding aligns protected/env policy; Linux matching remains exact. Independent matcher review caught a Unicode literal mismatch (UTF-16 pattern tokens versus codepoint iteration); filesystem owner is fixing and adding regressions. Model naturally selected a two-edit batch and completed the first workflow. Final definitions are 4,679 characters after rejecting null queries; full detailed FS test gate remains pending.
11. Local model smoke PASSED on installed `gemma4:12b-it-qat` using production OllamaModelAdapter and tool definitions in an isolated temporary workspace. Natural calls: list_directory(depth 2) → read_file → edit_file(two edits), then create_file(several missing parents) → move_file. Two fixture prompts, seven model rounds, five tool calls, no tool failures; exact final file contents and source disappearance independently checked. No extra directory-creation ceremony or schema confusion observed. Script/result trace are temporary `/tmp/phase14-model-smoke.ts` and `/tmp/phase14-model-smoke-result.json`; fixture cleaned. Mutations auto-approved only in this disposable diagnostic harness; production ToolRunner approval remains tested separately. Optional 1B-model diagnostic skipped; no model downloaded.
12. Expanded safety review covers Unicode glob literals, Windows case/path aliases, exclusive-publication races and cleanup failures. Root selected optional create warnings when publication succeeds but temp cleanup fails; failed publication retains its original cause and reports any cleanup remnant. Public invalid-batch test verifies missing/ambiguous/overlapping multi-edits preserve the entire file. Directory listing/glob tests now cover cheap depth, exact truncation, no-match work/depth budget and symlink omission. Final filesystem test expansion, final gates and whole-diff review remain.
13. Filesystem work complete: 95 tests/457 assertions passed before final root move edge. Exclusive owned FileHandles preserve write safety and cleanup ownership; successful create warnings, combined error causes and ENOENT cleanup correctness are covered. Windows simulated platform guards reject ADS/device/trailing-dot/space aliases before filesystem work; native Windows execution is not available here. Final root review treats already-removed move source as success and requests checking both paths on other source-removal failures, rather than overclaiming surviving paths. Current documentation now records cleanup warnings. Status changed to implementation complete; remaining work is final validation/review.
14. Final validation PASSED: typecheck, 527 full tests, 309 focused tests, formatting (120 files), Linux and Windows builds, artifact smoke, and release:check (same 527 tests plus builds/smoke). Entire source/provider/test/documentation diff reviewed, including new files; targeted structural searches confirmed obsolete providers/schemas/port methods are absent and the factory contains exactly nine tools. Protected tuples unchanged; fixed ripgrep remains the only tool-internal subprocess and accepts no executable/command input. No dependency diff, generated dist/.agent changes, unrelated TUI redesign or application/session/model rewrite. No commit created. Status verified only after these gates passed.

## Model-definition footprint

Actual production serialization: `JSON.stringify(createLocalToolExecutor().listTools().map(toOllamaTool))`.

| Tool | Serialized characters | Description characters |
| --- | --- | --- |
| list_files | 508 | 221 |
| read_file | 1,207 | 408 |
| search_file | 425 | 163 |
| create_file | 464 | 93 |
| edit_file | 648 | 100 |
| Total (5 tools, including separators) | 3,258 | 985 |

Final production definition measurement (same serializer, including array separators):

| Tool | Serialized characters | Description characters | Schema characters |
| --- | --- | --- | --- |
| list_directory | 476 | 181 | 208 |
| find_files | 541 | 159 | 299 |
| read_file | 856 | 204 | 570 |
| search_text | 481 | 148 | 249 |
| create_file | 343 | 101 | 158 |
| edit_file | 647 | 143 | 422 |
| replace_file | 542 | 171 | 286 |
| move_file | 422 | 156 | 184 |
| delete_path | 361 | 157 | 120 |
| Total (9 tools) | 4,679 | 1,420 | 2,496 |

Count: 5 → 9 (+80%); serialized size: 3,258 → 4,679 (+1,421 / +43.6%). The read definition fell from 1,207 to 856; create from 464 to 343. Average definition size fell from 652 to 520 characters while adding four independent capabilities. Descriptions are operational, with no repeated path property prose or embedded tool manual. Targeted tests guard exact registry names/required fields, no deprecated modes/force/recursive/command inputs, ≤230-character tool descriptions, ≤140-character schema descriptions, and a 6,500-character aggregate ceiling with maintenance headroom. New tools justify their footprint through separate caller intents; minimizing count alone was rejected.

## Validation

All final commands exited 0. Complete logs were retained in `/tmp/phase14-final-{test,focused,release}.log` during the run; those are diagnostics, not repository artifacts.

| Command / check | Final result |
| --- | --- |
| bun run typecheck | pass |
| bun test | 527 pass, 0 fail; 5,551 assertions; 33 files |
| bun run format:check | pass; 120 files; no fixes |
| bun run build:linux | pass; ELF artifact and bundled Linux ripgrep |
| bun run build:windows | pass; PE artifact and bundled Windows ripgrep |
| bun run smoke:build | pass; artifact validation, isolated Linux executable startup/new+resume, real bundled ripgrep search |
| bun run release:check | pass; formatting/typecheck + same 527 pass/0 fail/5,551 assertions/33 files + both builds/artifact smoke |
| bun test src/infrastructure/tools src/application/services/ToolRunner.test.ts src/application/use-cases/RunAgentTurn.test.ts src/application/use-cases/file-operations src/infrastructure/file-system | 309 pass, 0 fail; 2,841 assertions; 10 files |
| Local-model smoke: bun run /tmp/phase14-model-smoke.ts gemma4:12b-it-qat | pass; 2 prompts, 7 model rounds, 5 natural tool calls; exact fixture outcomes independently checked |
| Independent finite-state glob/reference comparison | 1,244,039 ASCII/Unicode cases; zero mismatches; supplemental diagnostic |
| git diff --check | pass |
| git diff --stat / git status --short --untracked-files=all | reviewed; only intended tooling tests/source/current docs/progress |
| Exact obsolete provider/schema/port search | no matches; old tool names only in historical/test fixtures and presentation labels |
| git diff --name-only -- package.json bun.lock / git ls-files dist .agent | empty |

Baseline failures and environmental recovery are retained above: two Bun/Zod accessor-spy tests were repaired; Windows optional native dependency was restored using `bun install --frozen-lockfile --ignore-scripts --os='*' --cpu=x64`, without manifest/lock changes. Localhost access required the permitted sandbox retry. Windows was cross-built and path guards tested with simulated platform semantics; native Windows execution was not claimed.

## Final tool contract

Final surface below. Execution/cancellation/approval metadata is not sent in model schemas. All schemas are strict objects; mutations require approval and never deduplicate. Every changed path in results is workspace-relative with `/` separators.

| Tool | Purpose | Input complexity | Output | Approval | Notes |
| --- | --- | --- | --- | --- | --- |
| list_directory | Inspect a directory/tree | 2 optional scalars: path, depth | path, entries[{path,type}], truncated | none | root/depth 1 defaults; max depth 5; dedup |
| find_files | Find file names/paths | pattern + optional path | files[], truncated | none | *, **, ? only; basename versus scoped-path matching; dedup |
| read_file | Read text/ranges/continuation | path + 3 optional scalars | path, content, startLine, endLine, totalLines, truncated, nextRead?, version | none | UTF-16 exact continuation unchanged; fresh every call |
| search_text | Find text in files | query | returnedMatches, returnedFiles, matches[{path,line,text}], truncated | none | literal single-line text; spaces/pipes preserved; no NUL; dedup |
| create_file | New file with missing parents | path, content | path, created: true, warnings? | required | exclusive completed publication; optional temp-cleanup warning |
| edit_file | Batch exact replacements | path, edits array (1–50 simple pairs) | path, changed, editsApplied | required | original coordinates; unique/nonoverlap; one final write; identical content skips write |
| replace_file | Guarded whole-file replacement | path, content, expectedVersion | path, changed | required | existing file only; SHA-256 version from read; identical content skips write |
| move_file | Move/rename regular file | source, destination | source, destination, moved: true | required | no overwrite; safe missing parents; no symlinks/directories |
| delete_path | File/empty-directory deletion | path | path, type, deleted: true | required | no recursive/force flag; no symlinks/root |

Provider paths are `src/infrastructure/tools/providers/{ListDirectory,FindFiles,ReadFile,SearchText,CreateFile,EditFile,ReplaceFile,MoveFile,DeletePath}Provider.ts`. Discovery/read/create/replace/move/delete use WorkspaceFilePort → NodeWorkspaceFileSystem; edit adds EditWorkspaceFile; search uses WorkspaceSearchPort → RipgrepSearch. LocalToolRegistry/defineLocalTool parse and select once, bind execution, and copy serializable call projections; raw execution validates too. ToolRunner retains lifecycle ownership, awaits commit outcomes, fences cancelled approvals, and invalidates discovery at the start of approved mutation attempts.

Default text-file byte cap is 200,000; reads return at most 400 lines/20,000 UTF-16 units. Directory/finder result cap is 500, traversal cap 10,000 examined entries; finder depth cap 100. Search returns at most 50 matches/300-character excerpts with 5s per-branch timeout and awaited process cleanup. Discovery omits symlinks (including safe aliases); direct text access/create can resolve safe internal aliases canonically. Move/delete reject any symlink chain. Protected directory and env tuples are unchanged; lexical aliases, canonical aliases and env-directory search exclusions now consistently enforce them.

Model-visible failures distinguish not found, already exists, not a directory/file, protected/outside path, symlink rejection, stale version/content, missing/ambiguous/overlapping exact edits, invalid arguments, cancellation, unavailable/timed-out search, nonempty directory, cross-filesystem operation, and partial move cleanup. Model history receives compact error messages rather than stack traces. Ordinary mutation outputs omit file contents.

Capabilities added: bounded typed/shallow directory inspection, filename/path globs, one-call nested creation, atomic multi-edit, guarded full replacement (including empty files), non-overwriting file move, file/empty-directory delete. Removed: implicit pipe-alternative content-search language and recursive-only unfiltered listing default. Renamed: list_files → list_directory (typed inspection) + find_files (path discovery); search_file → search_text. Old provider files are removed; historical event names/results replay without execution aliases or migration.

Contract coverage: LocalToolExecutor, ToolDefinitions, LocalTool, Phase14ToolWorkflows, ReplaceFileProvider, ToolRunner, RunAgentTurn, EditWorkspaceFile, NodeWorkspaceFileSystem and RipgrepSearch tests; existing Phase 1 continuation fixtures retain exact long-line/CRLF/surrogate cursors. New public workflows cover discovery/read/edit, nested create, search/read continuation, failed-mutation invalidation, before/during mutation cancellation, protected/symlink attempts and historical replay.

## Remaining work

Only intentional future capabilities/limits remain:

- Directory moves and recursive deletion require a separate bounded subtree/no-clobber design; not exposed.
- Standalone empty-directory creation is omitted; coding scaffolds use nested create.
- Content search is literal single-line workspace-wide search; scoped/regex/multiline search is deferred. Globs support only *, **, ?; symlink discovery entries are omitted.
- Moves/create publication require filesystem hard-link support; cross-filesystem moves fail rather than copying/deleting with weaker semantics.
- Multi-file transactions, crash durability and protection against hostile concurrent host-filesystem changes are not promised. Existing-file stale checks are optimistic preflight checks.
- Native Windows runtime validation remains outside this Linux environment; Windows builds and deterministic platform guards passed.

Rejected alternatives remain recorded in the proposal. No Phase 14 implementation or required validation work remains. Shell/process/git/package/network tools are deliberately excluded.
