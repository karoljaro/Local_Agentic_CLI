# Phase 9 implementation progress

## Status

verified

## Baseline

- Started on 2026-10-07 at HEAD `257dcf26d4ada28a5e8e811fe35ee779257fcdd1`.
- Starting `git status --short`: empty. Starting `git diff --name-only`: empty. No pre-existing worktree changes.
- Phases 1–8 are present in HEAD: `a2d94c7`, `6003da8`, `7c6fac6`, `96cd718`, `46ed7d1`, `d1e953a`, `15100ff`, `257dcf2`. All eight records report verified status.
- Read the architecture audit, primary execution contract (`docs/plans/simplification-refactor-plan.md`), and all eight prior progress records. No applicable AGENTS.md found in the workspace or its ancestors.
- Created this record before source or test changes. Audit, plan, Phase 1–8 records, package and lockfile are protected inputs. No commit requested.
- Baseline `bun run release:check > /tmp/phase-9-baseline-release.log 2>&1`: passed, exit 0; 411 tests / 34 files / 3803 assertions, typecheck/format, Linux/Windows builds and existing packaged smoke. Ignored dist output is excluded. Smoke covers artifact/terminal-guard/packaged-rg checks, not an interactive agent or native Windows execution.

## Workspace policy before Phase 9

- `NodeWorkspaceFileSystem.ts:50 / EXCLUDED_DIRECTORIES` declares a mutable module-local Set with `node_modules`, `.git`, `.agent`. Line 51 / `SAFE_ENV_FILES` declares `.env.dev`, `.env.development`, `.env.example` in another local Set.
- `RipgrepSearch.ts:63 / EXCLUDED_GLOBS` separately declares `!**/node_modules/**`, `!**/.git/**`, `!**/.agent/**`. Line 64 / `SAFE_ENV_GLOBS` separately declares `**/.env.development`, `**/.env.dev`, `**/.env.example`, in that order. These six names are duplicated policy data; path/glob translation is adapter-specific.
- Filesystem `shouldSkipDirectoryName` checks protected-directory membership OR `name.startsWith('.env')`, including safe-env names when used as directories. `shouldSkipFileName` blocks `.env*` files unless their exact basename is in SAFE_ENV_FILES. `shouldSkipDirectoryPath` checks all segments; `shouldSkipFilePath` checks directory segments separately from the final filename. `splitPath` handles both slash forms. These predicates must remain local and unchanged.
- Filesystem resolves/normalizes paths relative to the real workspace root, rejects absolute/blank/outside paths, and checks realpath containment. Existing-file access checks canonical relative-path policy and byte limits; creation checks policy before and after resolving the real parent. Recursive listing checks entry names and canonical paths, skips escapes, tracks visited directories/seen files, sorts entries and bounds results.
- Filesystem retains symlink containment, stale expected-content checks, temporary wx writes/rename/cleanup, wx create, content byte limits, and cooperative cancellation around its safe mutation boundary.
- Ripgrep broad search uses `['!**/.env*', ...EXCLUDED_GLOBS]`; safe-env search uses `[...SAFE_ENV_GLOBS, ...EXCLUDED_GLOBS]`. Only these exact safe basenames are positive globs; no safe-name suffix wildcard. Filesystem's prohibition on `.env*` directories/path segments and ripgrep's glob matching are intentionally separate rules.
- Call chain: public tool `search_file` → SearchFileProvider → `RipgrepSearch.search` → `searchWithRipgrep` → two `runRipgrep` calls → injected runner (default `runRipgrepCommand`). The method is only a forwarding layer; helper owns query alternatives/dedup, common options/signal, Promise.allSettled, failure choice and final combination.
- Both branches start in normal-then-safe order, with the same patterns/root/timeout/maxMatches/text bound/signal. Each branch stops after observing one match beyond its limit. All settlements are awaited; independent failure outranks abort. Final results flatten branch arrays, sort by path/line/text with existing compareMatches, slice to maxMatches, count returned files and combine truncation flags. Matches are not deduplicated. Process kill/drain/exit/listener/reader cleanup and timeout-versus-limit distinctions live in useful lower-level helpers.

## Work completed

- Captured clean baseline, confirmed prior phases, read required inputs, inspected both adapters and their safety/cancellation/public-tool tests, and created this record before implementation (requirements 23, persistent record).
- `NodeWorkspaceFileSystem.test.ts / workspace policy`: added 24 cases covering nested protected directories, root/nested access to all three safe basenames, root/nested denial of five secret variants, and `.env*` directory segments (including all three safe names used as directories). Read/write/create and recursive/direct listing decisions are checked; blocked mutations preserve contents and create no files. Original symlink/atomic/cancellation tests remain unchanged (requirements 4, 13–15, 19).
- `RipgrepSearch.test.ts`: added exact generated-command assertions (normal then safe branch, all globs, deduplicated query alternatives, root/timeout/same signal), independent per-branch/combined bounds with reversed completion, text truncation, and path/line/text ordering without match deduplication. Existing Phase 2 cleanup tests remain unchanged (requirements 6–8, 10–12, 16).
- `LocalToolExecutor.test.ts`: added one real-rg public search fixture with normal source, all safe basenames at root/nested levels, three nested protected directories each containing normal and safe-env files, and root/nested secret/safe-prefix-suffix variants. Exact seven allowed ordered matches assert blocked content is absent and wildcard access is not broadened (requirements 13–17, 20–21).
- `workspacePolicy.ts / PROTECTED_DIRECTORIES, SAFE_ENV_BASENAMES`: added the sole production declarations as readonly literal tuples, with exactly the existing six names and no path/glob/predicate logic (requirements 1–2, 18).
- `NodeWorkspaceFileSystem.ts / EXCLUDED_DIRECTORIES, SAFE_ENV_FILES`: replaced hardcoded Set inputs with shared tuples; `Set<string>` keeps efficient arbitrary-string membership tests. Skip predicates and all IO/safety code are unchanged (requirements 2–5, 19).
- `RipgrepSearch.ts / EXCLUDED_GLOBS, SAFE_ENV_GLOBS`: maps shared names locally to existing negative directory globs and exact positive basename globs, preserving argument order. Broad `.env*` exclusion remains local (requirements 2, 6–8, 12).
- `RipgrepSearch.search`: now owns the original searchWithRipgrep orchestration body; deleted that forwarding symbol. Injected/default runner, two concurrent ordered branches, all-settled failure/abort handling, sorting/bounds and lower-level helpers remain (requirements 9–12).
- `NodeWorkspaceFileSystem.test.ts / readonly tuples`: added one structural typecheck/runtime-data case. Conditional types reject mutable array declarations at compilation; exact values and independently mutable local Set copies are asserted. No shared Set or production freezing added (requirement 18).

## Shared policy contract

- Single declaration site: `src/infrastructure/file-system/workspacePolicy.ts`. `PROTECTED_DIRECTORIES = ['node_modules', '.git', '.agent'] as const`; `SAFE_ENV_BASENAMES = ['.env.development', '.env.dev', '.env.example'] as const`. Types are readonly literal tuples, with no shared mutable Set, functions, path/glob syntax or runtime freeze.
- Filesystem derives private module-local `new Set<string>(PROTECTED_DIRECTORIES)` and `new Set<string>(SAFE_ENV_BASENAMES)`; consumers receive no global mutable policy representation.
- Ripgrep derives `PROTECTED_DIRECTORIES.map(name => '!**/' + name + '/**')` and `SAFE_ENV_BASENAMES.map(name => '**/' + name)` locally. Generated argv stays byte-for-byte equal to the pre-refactor oracle, including safe-env ordering. No trailing wildcard is added to safe basenames.

## Filesystem enforcement contract

All existing skip predicates, `.env*` directory/path-segment handling, normalization, lexical/realpath containment, symlink safety, stale checks, byte limits, atomic write/create, temporary cleanup and cooperative cancellation remain owned by NodeWorkspaceFileSystem. Only Set inputs change.

## Ripgrep enforcement contract

All glob syntax, broad `.env*` exclusion, safe-env inclusion, two bounded branches, query parsing, injected runner, result parsing/sorting/limits, failure/timeout handling and Phase 2 child/stream/listener cleanup remain owned by RipgrepSearch. Only glob inputs and the forwarding layer change. Final flow: public search_file → unchanged provider/registry preparation → RipgrepSearch.search → two runRipgrep calls → injected/default runner → existing parse/cleanup helpers → all-settled failure selection → combined path/line/text sort → combined limit/output. No replacement forwarding helper exists.

## Tests / validation

- Baseline `bun run release:check`: passed as recorded above; no pre-existing failures.
- Before production changes, exact plan targeted command passed: 128 tests / 3 files / 1375 assertions / zero failures (`/tmp/phase-9-policy-before.log`). `bun run typecheck` passed (`/tmp/phase-9-policy-before-typecheck.log`). All new behavioral cases pass on HEAD adapters, establishing preserved decisions/commands/order/bounds; this is a data refactor, not a behavior fix.
- Initial implementation exact targeted command passed: 129 tests / 3 files / 1381 assertions / zero failures (`/tmp/phase-9-initial-targeted.log`); `bun run typecheck` passed (`/tmp/phase-9-initial-typecheck.log`). All original cancellation/symlink/atomic and Phase 1/6 public tool cases are retained.
- Scoped `bunx biome format --write src/infrastructure/file-system/workspacePolicy.ts src/infrastructure/file-system/NodeWorkspaceFileSystem.ts src/infrastructure/file-system/NodeWorkspaceFileSystem.test.ts src/infrastructure/tools/ripgrep/RipgrepSearch.ts src/infrastructure/tools/ripgrep/RipgrepSearch.test.ts src/infrastructure/tools/LocalToolExecutor.test.ts`: passed; only six deliberately changed/new TypeScript files were eligible (`/tmp/phase-9-scoped-format.log`).

Final validation on final formatted source:

| Command / inspection | Result | Evidence / notes |
| --- | --- | --- |
| `bun test src/infrastructure/file-system/NodeWorkspaceFileSystem.test.ts src/infrastructure/tools/ripgrep/RipgrepSearch.test.ts src/infrastructure/tools/LocalToolExecutor.test.ts` | Passed: 129 tests / 3 files / 1381 assertions / zero failures | `/tmp/phase-9-final-targeted.log`; exact Phase 9 command, original filesystem/process/public-tool regressions unchanged. |
| `bun run typecheck` | Passed, exit 0 | `/tmp/phase-9-final-typecheck.log`; includes readonly structural guarantees. |
| `bun test` | Passed: 440 tests / 34 files / 3984 assertions / zero failures | `/tmp/phase-9-final-full-suite.log`; all Phases 1–8 regression coverage retained. |
| `bun run format:check` | Passed, exit 0; 125 files checked, no fixes | `/tmp/phase-9-final-format.log`. |
| `bun run build` | Passed, exit 0 | `/tmp/phase-9-final-build.log`; existing Linux/Windows build targets, ignored dist output excluded. |
| `bun run smoke:build` | Passed, exit 0 | `/tmp/phase-9-final-smoke.log`; existing artifact/terminal-guard/packaged-rg checks, no interactive/native Windows runtime claim. |
| `git diff --check`, `git diff --stat`, `git status --short --untracked-files=all` | Passed / inspected | Five tracked changes (405 insertions / 75 deletions), plus new shared module and this record only. |
| Complete Phase 9 diff, both new files and final record | Reviewed | Data-only tuples, local translations, relocated orchestration, meaningful independent behavioral/argv oracles; no broader production refactor. |
| HEAD-relative exact scope/protected-input/original-test comparison | Passed | `/tmp/phase-9-scope-check.log`; unchanged HEAD, all eight phase ancestors; audit/plan/Phase 1–8/package/bun.lock/tsconfig/context/session/runner/preparation files byte-identical to HEAD. Filesystem differs only by import/Set inputs. Ripgrep orchestration equals old body after indentation/one Biome line-wrap normalization; every lower-level helper is byte-identical. Every original targeted test is byte-identical after removing new cases/import amendments. No generated artifact or .agent path included. |
| Literal policy/forwarding inventory under `src`, `scripts`, `index.tsx`, excluding tests | Passed / classified | One production declaration site for all six names; no searchWithRipgrep symbol or hardcoded adapter lists/globs remain. Classification below. |

Deterministic test inventory relative to starting HEAD:

| File / group | Before | Added | Final | Main evidence |
| --- | ---: | ---: | ---: | --- |
| `NodeWorkspaceFileSystem.test.ts` | 26 | 25 | 51 | Readonly tuples; three nested protected directories; six safe root/nested files; ten secret root/nested files; five .env directory/path-segment cases. All original safety/cancellation tests unchanged. |
| `RipgrepSearch.test.ts` | 16 | 3 | 19 | Exact generated commands/globs/options/order; both branch bounds/text bound/combined limit; path/line/text sorting and duplicate preservation. All seven Phase 2 cleanup cases retained unchanged. |
| `LocalToolExecutor.test.ts` | 58 | 1 | 59 | Real public search through existing safe raw execution/preparation: seven allowed files returned; twelve nested protected files and sixteen unsafe env files absent. All prior Phase 1/2/6 tests unchanged. |
| Targeted total | 100 | 29 | 129 | The 28 behavioral cases pass on original production; the added shared readonly contract passes after implementation. |
| Full suite | 411 | 29 | 440 | No tests removed or weakened. |

Before/after evidence: two adapter-owned protected declarations and two adapter-owned safe-env declarations become two canonical tuple exports in workspacePolicy.ts. Both generated commands exactly match the pre-refactor argv oracle, including ordering and broad `.env*` exclusion. Both before/after actual public searches return only `.env.dev`, `.env.development`, `.env.example`, their nested equivalents, and `src/visible.ts`, in that order; secret and protected content is absent. Filesystem safe basenames work as files but remain protected when used as directory segments. Per-branch limits and final sorting/slicing are unchanged; the third match triggers each branch's early stop, and no fourth line is consumed.

Remaining production literal classifications:

- `workspacePolicy.ts:1`: canonical protected-directory declaration (`node_modules`, `.git`, `.agent`).
- `workspacePolicy.ts:3`: canonical safe-env basename declaration (`.env.development`, `.env.dev`, `.env.example`).
- `JsonlSessionStore.ts:19 / '.agent/sessions'`: existing persistence location, not a duplicated workspace-access policy declaration; unchanged and outside Phase 9.
- `RunAgentTurn.ts:66 / this.dependencies.agentMetrics`: fixed-string search matches `.agent` inside a property access; no policy literal/declaration, unchanged.
- No other production occurrences in the inspected project source/scripts/entrypoint. Tests intentionally contain independent fixtures/expected names/globs. Documentation retains historical descriptions and the removed forwarding symbol as evidence.

## Deviations / discoveries

- Ripgrep's existing safe-env argument order differs from the filesystem Set's insertion order. Preserve the former in the shared tuple; this has no effect on filesystem membership.
- No blockers or plan deviations. Phase 10 cleanup (dead presentation types/actions, tsconfig exclusion, UUID typing, defaults, build helpers, provider exports, dependencies) remains deferred.
- Strict source comparison initially detected the formatter's line wrap of the existing truncation expression; normalizing that one wrap and relocated indentation proves the orchestration body is otherwise identical. No required deterministic check failed.
- No Ollama validation is needed. Disposable real-rg public-tool tests complement mock command tests; no repository .agent artifacts were created by this phase. Optional manual CLI/model verification was not performed. Deterministic adapter/public-tool fixtures are authoritative; packaged smoke retains its documented limits.
- Unresolved Phase 9 issues: none. No approval, dependency, external-service or platform blocker encountered.

## Remaining work

None for Phase 9.

## Final Phase 9 summary

- Status: verified against starting HEAD `257dcf26d4ada28a5e8e811fe35ee779257fcdd1`; all required deterministic validation passed.
- Added (2): `src/infrastructure/file-system/workspacePolicy.ts`; `docs/progress/phase-9-progress.md` (created before source/test changes).
- Changed (5): `src/infrastructure/file-system/NodeWorkspaceFileSystem.ts` and `.test.ts`; `src/infrastructure/tools/ripgrep/RipgrepSearch.ts` and `.test.ts`; `src/infrastructure/tools/LocalToolExecutor.test.ts`. Deleted files: none. No commit created.
- Removed four adapter-owned hardcoded policy declarations (protected Set/glob lists and safe-env Set/glob lists); retained their local structures derived from the two readonly tuples. Canonical protected names are exactly `node_modules`, `.git`, `.agent`; safe basenames are exactly `.env.dev`, `.env.development`, `.env.example`. No names added/removed or wildcard permission broadened.
- Filesystem continues its independent .env-directory/path-segment, canonical path, containment/symlink, expected-content, byte-limit, atomic write/create, temp cleanup and cooperative-cancellation rules. Its entire enforcement/IO body is unchanged.
- Ripgrep retains normal/safe searches, exact argv ordering, broad .env* exclusion/exact safe-env inclusion, injected runner, branch settlement/same signal, parsing, per-branch/final limits, path/line/text sorting, duplicate preservation, timeout/error distinctions and child/stream/listener cleanup. searchWithRipgrep is removed; its orchestration lives directly in search. Useful lower-level helpers remain unchanged.
- Added 29 focused deterministic cases; all original targeted tests unchanged. Behavioral and exact command cases passed before and after the refactor. Real disposable-workspace public search validates normal/safe availability and secret/nested-protected absence.
- Final targeted 129 tests and full 440 tests pass; typecheck, format check, Linux/Windows builds, packaged smoke, whitespace, complete diff/record review, literal inventory and protected-scope checks pass. Counts/evidence/limits above.
- Unresolved issues: none. No interactive agent/native Windows runtime claim. Audit, primary plan, Phase 1–8 records, package/lockfile, context/session/model/tool-preparation architecture and runtime/JSONL/schema/folder layout are unchanged. No generated build artifact or .agent path is included.
- Phase 10 was not started. No defaults/UUID/tsconfig/dependency/build-helper/provider-export/dead-code cleanup or unrelated refactor was undertaken.
