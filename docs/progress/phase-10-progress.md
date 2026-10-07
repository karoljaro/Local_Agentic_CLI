# Phase 10 implementation progress

## Status

verified

## Baseline

- Started on 2026-10-07 at HEAD `d0e8a56cba585f3c366175ae009025de990ea37d`.
- Starting `git status --short --untracked-files=all`: empty. Starting `git diff --name-only`: empty. No pre-existing changes.
- Ignored local state discovered during final filesystem review: `.agent/sessions` contains two historical event files (directory timestamps June 2026), and empty `src/ui_old` exists (July 2026 timestamp). Neither was created/changed by Phase 10. Retain both and the original ui_old exclusion; no ignored session/build files are included in the diff.
- Phases 1–9 are present in HEAD: `a2d94c7`, `6003da8`, `7c6fac6`, `96cd718`, `46ed7d1`, `d1e953a`, `15100ff`, `257dcf2`, `d0e8a56`. All nine ancestor checks passed; all nine progress records report verified.
- Read the architecture audit, primary execution plan, and every Phase 1–9 record before implementation. No applicable AGENTS.md found in the workspace or ancestors.
- Execution contract: Phase 10 of `docs/plans/simplification-refactor-plan.md`, with the user's explicit native Temporal and retained Ink/devtools decisions taking precedence over section 6. Audit, plan, and Phase 1–9 records are protected inputs. No commit requested.
- Bun: `1.4.2` (`744846f84`), executable `/home/karoljaron/.bun/bin/bun`. Installed `@types/bun` / `bun-types`: `1.3.14`; TypeScript: `7.0.2`.
- Baseline `bun run release:check > /tmp/phase-10-baseline-release.log 2>&1`: passed, exit 0. Formatting checked 125 files; typecheck passed; 440 tests / 34 files / 3984 assertions / zero failures; Linux and Windows builds and existing packaged smoke passed. Four outputs: `dist/codesh`, `dist/rg`, `dist/codesh.exe`, `dist/rg.exe`. Ignored dist output is excluded from changes. Smoke does not establish interactive agent or native Windows execution.
- This record was created before source, tests, configuration, dependency, lockfile, or script edits.

## Phase 10 candidate inventory

This inventory was recorded before code changes. Final corrections/dispositions are included explicitly below, including the failed ui_old absence gate discovered during scope review. Paths are repository-relative unless explicitly identified as installed dependency paths.

| Candidate / declaration | Relevant references and verification | Authorization | Disposition |
| --- | --- | --- | --- |
| `CompletedAssistant`, `src/presentation/types.ts:52` | Exact dead-symbol search finds only declaration; `EventId` is used only in that alias in this file. No imports, dispatches, or test consumers anywhere in src/scripts/entrypoint. | Explicit Phase 10 type deletion. | remove alias and its import |
| `session.load-started`, `presentationReducer.ts:8,30` | Only action union and reducer branch match; no dispatch or test action. Actual loading begins in createChatState/session.changed; session.loaded and session.load-failed remain active. | Explicit Phase 10 dead action deletion. | remove member/branch; preserve all tests |
| `streamContent` | No src match; removed by Phase 7. | Confirm absence; do not recreate. | preserve absence |
| `ListedSessionEvent` | No src match; removed with listing wrapper by Phase 4. | Confirm absence; do not recreate. | preserve absence |
| `BunWithUuidV7`, `BunUuidV7IdGenerator.ts:13,35` | Only declaration and private cast. Installed `node_modules/.bun/bun-types@1.3.14/node_modules/bun-types/bun.d.ts:9314` declares randomUUIDv7 with optional encoding/timestamp, returning string for zero arguments. Branding methods and generator port remain. | Explicit installed-type gate passed. | simplify to direct Bun.randomUUIDv7 |
| `src/ui_old`, `tsconfig.json:39` | Scripts/package/build inputs contain no ui_old reference; build uses index.tsx, no generator creates it. Initial compound-command absence result was misread because a later successful command masked its exit. Final independent `test ! -e src/ui_old` exits 1; ls/stat confirms a pre-existing empty ignored directory (July timestamp). | Conditional absence gate fails; directory exists even though empty. | preserve original exclusion and .gitignore |
| Production defaults, `config.ts`, `ContextBuilder.ts`, `OllamaModelAdapter.ts` | Config owns localhost:11434, gemma4:12b-it-qat, 120_000; constructors duplicate them. createRuntime and OllamaModelRuntime already pass all resolved values. Test-only omitted arguments need explicit fixtures. | Explicit Phase 10 single-owner contract. | simplify constructors/fixtures |
| Base-URL defaults, `ollama/OllamaHttpClient.ts:20`, `OllamaModelCatalog.ts:12` | Both repeat localhost:11434. Production adapter/catalog and runtime callers already pass explicit URLs; three catalog tests omit it. No other callers. | Same explicitly required default-ownership item: infrastructure constructors must not own a second production default. No HTTP/parser boundary removal. | simplify signatures; explicit catalog fixtures |
| Compile duplication, `scripts/build-artifact.ts` | buildLinux/buildWindows duplicate mkdir, Bun.build(shared + target/outfile), log unsuccessful result, process.exit(1). Entrypoints import wrappers; release tests validate artifacts. | Explicit Phase 10 private helper. | simplify compile internals only |
| `*_TOOL_NAME`, five provider modules | Exact src/scripts/index search finds each declaration and one same-file name property: LIST_FILES/list_files, READ_FILE/read_file, SEARCH_FILE/search_file, CREATE_FILE/create_file, EDIT_FILE/edit_file. Factory/tests import tool factories only; no barrel/re-export/dynamic consumer. | Conditional reference gate passed. | make all five private; preserve constants/values |
| `TemporalClock`, `runtime/TemporalClock.ts` | One production constructor in createRuntime; dedicated clock test. Only clock imports Temporal; current clock has a polyfill import and undefined guard/commented Date fallback. ClockPort/ISODateTime/event consumers accept branded ISO strings. | Explicit user override requires retained modern clock. | preserve clock using direct global Temporal; remove guard/TODO/comment |
| `temporal-polyfill`, package.json/bun.lock | Sole production import in clock; lock also lists temporal-spec and temporal-utils. Native Bun exact `Temporal.Now.instant().toString()` succeeds with 9 fractional digits (`2026-10-07T15:50:40.420584284Z`); Instant.from round-trip equals original instant. TypeScript platform lib.esnext.temporal.d.ts provides global namespace/Now.instant and ESNext includes it. | Sole authorized dependency removal; runtime/type gate. | remove through Bun package-manager workflow |
| Legacy replay, `SessionReducer.ts` | pendingLegacyToolCalls, requested path, applyTerminalToolCall and appendLegacyToolCallMessages handle old pairs/orphans. Reducer durable/unfinished/orphan cases; SessionService real JSONL restart test; RunAgentTurn legacy/orphan and interrupted-prefix cases inspected. | Explicitly no removal authority. Producer reachability cannot prove old persisted data irrelevant. | preserve |
| `forceRefresh`, `OllamaModelRuntime.ts` | RuntimeListModelsOptions flag, cache/in-flight bypass, createRuntime second listModels argument; both model-runtime force-refresh and composition refresh tests. | Explicitly preserve tested runtime capability. | preserve; future product/API decision |
| `ListedModel.modifiedAt` / `sizeBytes`, ModelCatalogPort.ts | Catalog toListedModel parses modified_at/size and catalog test asserts fields. Runtime returns catalog values; presentation consumes ListedModel for selection/details but currently renders other fields. No dedicated diagnostic formatting; supported public runtime metadata remains available. | Explicitly preserve parser/type contract. | preserve; coordinated parser/type/API decision required |
| `react-devtools-core`, package.json devDependencies | Installed Ink package declares optional peer; build/reconciler.js resolves it and conditionally imports devtools for DEV=true; build/devtools.js imports it. No direct project import is insufficient evidence. | Explicit retain dependency with Ink. | preserve; reassess together with future TUI/Ink architecture |
| Metrics / getAgentMetrics | AgentMetricsPort, InMemoryAgentMetrics/snapshot, composition getter, RunAgentTurn recordModelRequestMetric, ToolRunner recordToolExecution. Metrics tests cover aggregation/bounds; loop/runner tests cover thrown diagnostics and failure isolation; runtime test checks getter. | Explicitly preserve diagnostic API/collection. | preserve; future coherent product decision |
| Smoke coverage, `scripts/smoke-build.ts` | CLI runs with ignored stdin (terminal guard); separately executes packaged rg --version and fixed-string search. Release artifact validation checks ELF/MZ/mode. | Explicit preserve script and report limitations. | preserve; stronger interactive harness deferred |
| Audit read_file continuation concern | Phase 1 nextRead/startOffset provider and public-tool reconstruction/long-line tests remain; Phase 9 retains them. | Already fixed, outside final cleanup. | preserve behavior and regressions |

## Work completed

- Captured baseline, confirmed all phase ancestors, read required documents, inspected every candidate, and created this record before implementation.
- `presentation/types.ts / CompletedAssistant`: removed unreferenced alias and its sole EventId import. `presentationReducer.ts / session.load-started`: removed unused union member and unreachable branch; all reducer tests retained. Explicit Phase 10 deletions; targeted reducer/typecheck cover remaining contracts.
- `tsconfig.json`: initial exclusion removal was reverted during final scope review because independent filesystem checking confirms the directory exists. Final file is byte-identical to HEAD. Compiler options/path aliases/include semantics/exclusions and .gitignore are unchanged. No directory deleted; conditional cleanup is explicitly gated.
- `BunUuidV7IdGenerator.ts / nextId`: removed locally recreated type/cast; direct Bun.randomUUIDv7 uses installed optional-argument overload. Branding/interface/injection remain; existing UUID test/typecheck pass.
- `ContextBuilder.ts`: maxContextCharacters is required and assigned directly; removed duplicate 120_000 constant. `OllamaModelAdapter.ts`: baseUrl/modelName are required; removed duplicate production literals. `OllamaModelCatalog.ts` and `OllamaHttpClient.ts`: baseUrl is required because both also owned a duplicate production URL. All production callers already supplied config values. This is the explicit single-owner contract, not an HTTP/catalog redesign.
- Constructor fixtures: ContextBuilder.test.ts, RunAgentTurn.test.ts (including fresh replay options/harness), App.test.tsx, useChatSession.test.tsx, OllamaModelAdapter.test.ts, and OllamaModelCatalog.test.ts now supply explicit independent values. No composition-default imports added and no old assertion removed.
- `config.test.ts`: added two all-blank normalization cases and one complete explicit override case. `createRuntime.test.ts`: added unset/blank/explicit resolved configuration cases checking catalog/chat URL, model, system prompt, keep_alive and pre-append context-budget rejection. Test helper accepts a fixture config. `OllamaModelAdapter.test.ts`: added whitespace-omitted and trimmed-duration keep-alive cases; existing omitted/numeric/unload cases retained. Authorized focused default-contract verification.
- `TemporalClock.ts`: retained class/ClockPort/ISO branding and exact Now.instant().toString operation, now global. Removed polyfill import, obsolete TODO, undefined guard and commented Date fallback. No compatibility branch or precision normalization introduced.
- `bun remove temporal-polyfill`: passed, exit 0; package.json loses only that dependency. Bun regenerated bun.lock, removing root entry and temporal-polyfill/temporal-spec/temporal-utils records only. No other dependency/version/script changed.
- `TemporalClock.test.ts`: kept real native runtime ISO case; added global Now.instant spy with an exact nine-digit instant and mixed millisecond/nanosecond JSONL reload, summary and reducer replay assertions. No new clock abstraction/schema.
- `scripts/build-artifact.ts`: duplicated mkdir/Bun.build/log/exit internals moved to one private compile(target: Bun.Build.CompileTarget, outfile: string). Both exported wrappers retain matching rg copying, exact targets/filenames and Linux chmod. All six build/release/smoke entrypoint files remain untouched.
- Five provider *_TOOL_NAME declarations are now module-private. Constants, exact names, factories, registry/schema/metadata/execution are unchanged. Local-only reference gate passed; registry suite/typecheck pass.

## Production defaults contract

Final ownership: readConfig alone retains production `http://localhost:11434`, `gemma4:12b-it-qat`, and `120_000`. createRuntime passes systemPrompt/MAX_CONTEXT_CHARACTERS to ContextBuilder; OllamaModelRuntime passes resolved URL/name/keep-alive to the adapter and URL to catalog; adapter/catalog pass URL to HTTP client. URL, model-name and context-budget arguments are required. Tests supply independent fixture values, including fixture-only 120_000 budgets. Keep-alive remains optional in the adapter; omitted/blank adapter value omits keep_alive, numeric strings normalize to numbers, duration strings remain strings. readConfig's existing default keep-alive `0` and whitespace normalization/error behavior remain. No cross-layer defaults import/service. Focused config/composition/adapter assertions pass.

## Temporal contract

Final direct implementation: `asISODateTime(Temporal.Now.instant().toString())`. Retain ClockPort/injection/branding, UTC ISO string output and native precision; no Date conversion, feature detection, fallback, dynamic import, or compatibility wrapper. Native default serialization preserves available fractional precision (up to nanoseconds); it does not force a fixed number of trailing digits. Exact 123456789 nanoseconds survives branding, JSONL and summary/replay. JSONL schema/order/replay remain unchanged. Only temporal-polyfill and its two exclusive transitive packages are removed. Global ESNext typing/typecheck and actual post-removal clock runtime operation pass; no active src/scripts/package or lock references remain.

## Build contract

Final private compile helper accepts target/outfile, creates dist and awaits Bun.build with shared index.tsx/minify:true/sourcemap:false. Wrappers remain public and platform-specific: Linux target bun-linux-x64 → dist/codesh, linux x64 rg → dist/rg, chmod both 0755; Windows target bun-windows-x64 → dist/codesh.exe, win32 x64 rg → dist/rg.exe. Unsuccessful build results still console.error(...result.logs) and process.exit(1); rejected build/filesystem promises propagate. No stdout/stderr capture/suppression added. No entrypoint/package script/release naming change. Separate builds, release signatures, exact packaged rg byte comparisons and subprocess failure injection all passed. Both wrappers stop before packaging on unsuccessful/rejected compile; stderr and exit 1 are preserved.

## Section-6 verification outcomes

All required searches were repeated after implementation, and remaining matches were inspected. This table supplies the final decisions; the inventory supplies declaration/reference detail.

| Item | Verification | Final disposition |
| --- | --- | --- |
| Legacy replay | SessionReducer requested/pendingLegacyToolCalls/appendLegacyToolCallMessages and terminal paths inspected. Existing legacy pairs, orphan result, unfinished batch, real JSONL restart and new-turn replay tests pass in the final suite. Current producers cannot establish that historical JSONL is irrelevant. | preserve |
| forceRefresh | Final source search retains options, cache/in-flight bypass, runtime delegate and both refresh tests. Full suite executes those tests. No product/API removal decision exists. | preserve tested runtime capability |
| ListedModel metadata | Final modifiedAt/sizeBytes/ListedModel search confirms port, catalog parser/map/test, runtime API and presentation selection types. UI currently uses other details, but parser emits supported metadata and tests require it. | preserve parser/type contract |
| *_TOOL_NAME exports | Final search has exactly five private declarations and their five local name-property uses. Factory/registry tests use tool factories, no external constant import/re-export/dynamic consumer. Exact schemas/names pass registry tests. | private where local: all five; no names/constants removed |
| react-devtools-core | Package and lock retain it; installed Ink optional peer and DEV=true resolver/import/devtools module inspected. No DEV server workflow performed, and none is needed for the explicit preservation decision. | preserve; reassess with future TUI/Ink decision |
| Metrics/getAgentMetrics | Final diagnostic search retains port, collector/snapshot, model/tool recording, getter/re-export, metrics aggregation/bounds and runner/loop failure-isolation cases. Final full suite passes them. | preserve diagnostic API and collection |
| TemporalClock | Native Now.instant/toString checked before/after removal; installed ESNext global types and final typecheck pass; actual native ISO and exact 9-digit JSONL/summary/replay test pass. Final production path is only direct global Temporal. | preserve using native/global Temporal |
| temporal-polyfill | Zero src/scripts/package matches; separate lock inspection confirms no root/package entry or exclusive spec/utils nodes. Bun remove regenerated lock; semantic comparison proves every unrelated node identical. | remove |
| Smoke coverage | Unchanged ignored-stdin CLI path reaches terminal guard; packaged rg version/search demonstrates binary availability. Artifact validation establishes ELF/PE shape/mode. Cross-build does not establish Windows behavior. | preserve script; interactive/native limitations recorded |

The audit read_file continuation concern was already addressed by Phase 1: final public-tool nextRead/startOffset reconstruction tests (including long lines/UTF-16/CRLF) pass; old outputs remain opaque/replayable. The later-round streaming, literal edits, approval cancellation and truthful persistence regressions also pass. No later compatibility removal is authorized.

## Tests / validation

- Baseline release:check: passed (counts/log above).
- Pre-edit native runtime sanity: passed, exit 0; exact Now.instant/toString plus nanosecond Instant round-trip using the project Bun executable.
- `bun remove temporal-polyfill > /tmp/phase-10-remove-temporal.log 2>&1`: passed, exit 0; normal Bun package-manager lockfile regeneration. No network retry or dependency update needed.
- Scoped `bunx biome format --write` on the 24 deliberately changed TS/TSX/tsconfig files: passed, exit 0; four files formatted. Follow-up formatting on the two fixture corrections: passed, no fixes.
- Initial exact targeted command: 139 pass / 2 fail / 8 files / 1637 assertions (`/tmp/phase-10-targeted.log`). Two independent fresh-replay fixture options still omitted budgets. Initial typecheck identified those and a strict branded toBe expectation (`/tmp/phase-10-typecheck.log`). Corrected explicit fixture budgets and branded expected value; no production/type strictness change.
- Exact plan targeted command after correction: passed, exit 0; 141 tests / 8 files / 1683 assertions / zero failures (`/tmp/phase-10-final-targeted.log`).
- Clock/session/catalog/registry command: `bun test src/infrastructure/runtime/TemporalClock.test.ts src/application/services/SessionReducer.test.ts src/application/services/SessionService.test.ts src/infrastructure/persistence/JsonlSessionStore.test.ts src/presentation/state/sessionSummary.test.ts src/infrastructure/model/OllamaModelCatalog.test.ts src/infrastructure/tools/LocalToolExecutor.test.ts`: passed, exit 0; 108 tests / 7 files / 1423 assertions (`/tmp/phase-10-clock-session-registry.log`). Final branded expectation correction is type-only and also passed in full/final gates.
- `bun run typecheck > /tmp/phase-10-final-typecheck.log 2>&1`: passed, exit 0, with polyfill removed and direct global Temporal.
- Post-removal native sanity through imported TemporalClock: passed, exit 0; exact native operation and Instant.from(timestamp).epochNanoseconds succeeded with nanosecond output. Required temporal-polyfill search under src/scripts/package returns no matches (expected rg exit 1); separate lock search also has no temporal-polyfill/spec/utils.
- Initial full suite: passed, exit 0; 449 tests / 34 files / 4016 assertions, zero failures (`/tmp/phase-10-final-full-suite.log`). Format check: passed, 125 files (`/tmp/phase-10-final-format.log`). Separate platform builds and smoke: passed, exit 0 (`/tmp/phase-10-final-linux.log`, `/tmp/phase-10-final-windows.log`, `/tmp/phase-10-final-smoke.log`).
- First post-implementation release:check passed (`/tmp/phase-10-final-release.log`), then the independent filesystem/scope audit identified the initial ui_old gate mistake. Restored the original exclusion and reran release:check successfully on the final configuration (`/tmp/phase-10-final-release-restored-exclusion.log`). Earlier check success is not used to justify removing the exclusion.

Final deterministic gates (all exit 0 unless an expected search/fault exit is specified):

| Command / inspection | Result | Evidence / limits |
| --- | --- | --- |
| `bun test src/presentation/state/presentationReducer.test.ts src/infrastructure/runtime/BunUuidV7IdGenerator.test.ts src/composition/config.test.ts src/composition/createRuntime.test.ts src/application/services/ContextBuilder.test.ts src/application/use-cases/RunAgentTurn.test.ts src/infrastructure/model/OllamaModelAdapter.test.ts scripts/release-artifacts.test.ts` | 141 tests / 8 files / 1683 assertions / zero failures | `/tmp/phase-10-final-targeted.log`; exact Phase 10 command. Final gate runs every case again after the original exclusion is restored. |
| Clock/session/catalog/registry command written above | 108 tests / 7 files / 1423 assertions / zero failures | `/tmp/phase-10-clock-session-registry.log`; native clock, timestamps, legacy/atomic replay, real JSONL, summaries, metadata, provider visibility. |
| `bun run typecheck` | Passed | `/tmp/phase-10-final-typecheck.log`; final release repeats with original tsconfig restored. Global Temporal typing, required constructor options and UUID overload all compile. |
| `bun test` | 449 tests / 34 files / 4016 assertions / zero failures | `/tmp/phase-10-final-full-suite.log`; final release repeats every test on final configuration. |
| `bun run format:check` | 125 files, no fixes | `/tmp/phase-10-final-format.log`; final release repeats it. |
| `bun run build:linux` | Linux codesh/rg produced | `/tmp/phase-10-final-linux.log`; chmod 0755 and correct ELF/x64 artifacts inspected. |
| `bun run build:windows` | Windows codesh.exe/rg.exe produced | `/tmp/phase-10-final-windows.log`; correct PE32+/x64 artifacts inspected; cross-build only. |
| `bun run smoke:build` | Passed | `/tmp/phase-10-final-smoke.log`; copied packaged Linux rg version/search and CLI/resume terminal-guard exits only. |
| Disposable subprocess build failure injection | Four expected exit-1 cases passed | `/tmp/phase-10-build-failure-check.log`; linux/windows × unsuccessful-result/rejected-promise, exact target/outfile, stderr retained, no rg copy. Temporary fixture under /tmp; no repository test/script added. |
| `file`, `stat`, `validateReleaseArtifacts`, exact rg byte comparison | Passed | codesh/rg ELF x64; codesh.exe/rg.exe PE32+ x64; matching package binPathFor sources. Details below. Binary search found no temporal-polyfill marker (expected rg exit 1), complementing absent source import/lock graph. |
| `bun run release:check` after restoring exclusion | Passed: 449 tests / 34 files / 4016 assertions; 125 formatted files; typecheck; both builds; smoke | `/tmp/phase-10-final-release-restored-exclusion.log`; final combined 10-phase automated gate, exit 0. |
| Structural searches required by goal and plan | Passed / all remaining matches classified | Dead-symbol and obsolete ownership searches have zero src matches. Five private tool constants + five uses remain. Metrics/refresh/catalog matches are intentional; Temporal clock/global API/tests/composition remain, polyfill absent. Production default literals occur only in config.ts. ui_old exists so exclusion retained. One Bun.build call/private helper, two platform wrappers. |
| `git diff --check`, `git diff --stat`, `git status --short --untracked-files=all`, complete diff/new-file review | Passed / reviewed | 25 tracked modified files, 254 insertions / 95 deletions; this record is the only untracked file. No deleted files, no staged changes or new commit. |
| Exact scope/protected-input/package/lock semantic comparisons | Passed | `/tmp/phase-10-scope-check.log`; exact 25-path whitelist + record, 32 protected source/input/entrypoint files byte-identical to HEAD including original tsconfig, every unrelated package/lock node unchanged. No .agent/dist path included, no folder moves/unrelated formatting. |

Inspected output artifacts (bytes / filesystem mode): `dist/codesh` 82,302,432 / 0755; `dist/rg` 5,728,032 / 0755; `dist/codesh.exe` 87,075,328 / 0755 on this host; `dist/rg.exe` 5,429,760 / 0644. Windows artifacts have no Linux chmod requirement; their modes are not Windows execution evidence. Final combined gate rebuilds the same four filenames and reruns release validation/smoke.

Test inventory (parameterized executed cases counted separately):

| File / group | Before | Added | Final |
| --- | ---: | ---: | ---: |
| config.test.ts | 3 | 3 | 6 |
| createRuntime.test.ts | 7 | 3 | 10 |
| OllamaModelAdapter.test.ts | 18 | 2 | 20 |
| TemporalClock.test.ts | 1 | 1 | 2 |
| Full suite | 440 | 9 | 449 |

All original tests/assertions remain; fixture-only constructor amendments preserve earlier phase coverage. No tests were added for deleting dead types/actions. Nine new cases address default ownership/normalization/keep-alive and precision through persistence, where existing coverage was insufficient.

## Interactive / external validation limits

- After deterministic automation, used the same project Bun/readConfig to query configured Ollama `/api/tags` with a five-second bound. It failed with `ConnectionRefused` at `http://localhost:11434/api/tags` (exit 1, `/tmp/phase-10-ollama-preflight.log`). An Ollama CLI executable is installed, but the configured service is unavailable; installed-model suitability could not be established.
- Consequently source PTY prompt/search/read/approval/cancellation/resume/model-switch and packaged Linux agent-mediated search/resume were not performed. No service was started, model downloaded/unloaded, or source-checkout session created. Existing deterministic mock/real-workspace/process tests remain the regression evidence; smoke is not promoted to interactive coverage.
- Native Windows execution is unavailable on this Linux host. Windows cross-compilation and PE inspection pass; Windows native Temporal/TUI/rg execution remains external release validation.
- A live DEV=true devtools-server workflow was not performed; the explicit decision is to retain its dependency and Ink together. A future TUI assessment should evaluate that workflow alongside architecture/maintenance concerns.

## Final whole-project Definition of Done assessment

| Requirement | Final assessment / evidence |
| --- | --- |
| All 10 phases completed or explicitly gated | Yes. Phases 1–9 verified records/ancestors remain; Phase 10 deterministic gates pass. ui_old removal is gated because an ignored directory exists; exclusion preserved. |
| All confirmed correctness regressions pass | Yes. Final full/release logs include literal replacement, lossless cursor reconstruction, late approval after abort, successful mutation plus failed append, second-round visible streaming and independent storage-error display. |
| Simplified runtime API | Yes. Direct callable Runtime/derived PresentationRuntime remain; obsolete controller/listing wrappers and aliases absent. |
| One SessionService owns commits/state/publication | Yes. One production construction in createRuntime; durable-first/observer-isolation/ordering tests pass. |
| Selected cache bounded | Yes. One selectedSession/reducer; switching eviction and queue cleanup tests pass. |
| Previews retain no model reducers | Yes. Uncached readPreviewEvents path and many-preview isolation tests pass. |
| Reducer is sole history assembler | Yes. RunAgentTurn reads state then ContextBuilder.build for each request; old currentMessages/toolMessages paths absent. SessionReducer retained unchanged. |
| Live/replay equivalence proven | Yes. Fresh service/JSONL checks at actual request boundaries, normalized multi-call/ref/failed-result/denial/truncation cases all pass. |
| Incomplete batches excluded | Yes. Reducer, SessionService real restart and fresh prompt after interrupted JSONL cases pass. |
| Prepared tool validates/selects once | Yes. One inputSchema.parse/bound execution path; runner executes prepared function; one-parse/selection and whole-batch-invalid cases pass. |
| Every presentation model round streams | Yes. Controlled visible-later-round and three-round hook cases pass before final completion; durable redelivery/partial/cleanup coverage retained. |
| Context sizing avoids growing-array serialization | Yes. Phase 8 fit-local measured groups remain; exact reference/count/boundary tests pass. |
| Shared workspace data, local enforcement | Yes. readonly tuples/shared values, filesystem canonical-path/symlink/atomic checks and bounded rg branch/glob/process enforcement remain; safety tests pass. |
| Native Temporal without compatibility code | Yes. Direct global Now.instant().toString, type/runtime/precision tests pass; dependency/guard/fallback absent. |
| Confirmed dead code/local duplication removed | Yes. CompletedAssistant/EventId import, session.load-started, Bun UUID cast, duplicated defaults and duplicated compile internals removed; five exports narrowed. Conditional exclusion is preserved for the failed absence gate. |
| Compatibility paths retained | Yes. Legacy pairs/orphans/opaque outputs and historical JSONL schema/replay remain; no session rewrite. |
| Deferred items explicit | Yes. Section-6 table records preservation/visibility/Temporal decisions; product/TUI/external work listed below. |
| Final automated gate passes | Yes. Final restored-configuration release:check exits 0 with all constituents passing. |
| Unavailable external checks identified | Yes. Ollama connection refused; interactive source/package workflows, native Windows and live devtools workflow unperformed. These are optional external gaps, not implementation blockers. |
| No unrelated scope changes | Yes. Exact whitelist/protected-file/lock checks and complete diff review pass; no extra dependency, architecture, formatting, folder or product changes. |

## Remaining work

- Future product/API decisions only: model-catalog refresh, metadata and diagnostic API/collection remain supported; legacy compatibility requires an explicit migration decision before any future removal. A stronger interactive smoke harness is a separate improvement.
- Future TUI/Ink architecture assessment should consider Ink and react-devtools-core together, including live DEV workflow. No new phase/architecture implementation was created here.
- Optional external validation: source and packaged Linux interactive Ollama workflows in disposable workspaces once a suitable service/model is available; native Windows package/Temporal/TUI/rg execution on Windows.

## Final architecture cleanup summary

- Status: verified. All required deterministic Phase 10 gates and the final combined project gate passed; no implementation blocker remains. All ten phases are complete with the ui_old absence gate explicitly retained.
- Added (1): `docs/progress/phase-10-progress.md`, created before implementation and maintained with pre-edit inventory, correction, decisions and verification evidence.
- Changed (25): `package.json`, `bun.lock`, `scripts/build-artifact.ts`; `src/application/services/ContextBuilder.ts` and `.test.ts`; `src/application/use-cases/RunAgentTurn.test.ts`; `src/composition/config.test.ts`, `src/composition/createRuntime.test.ts`; `src/infrastructure/model/OllamaModelAdapter.ts` and `.test.ts`, `OllamaModelCatalog.ts` and `.test.ts`, `ollama/OllamaHttpClient.ts`; `src/infrastructure/runtime/BunUuidV7IdGenerator.ts`, `TemporalClock.ts` and `.test.ts`; five `src/infrastructure/tools/providers/{ListFiles,ReadFile,SearchFile,CreateFile,EditFile}Provider.ts`; `src/presentation/types.ts`, `state/presentationReducer.ts`, `App.test.tsx`, `hooks/useChatSession.test.tsx`. Deleted files: none.
- Dead declarations removed: CompletedAssistant with unused EventId import, session.load-started union/branch, BunWithUuidV7 type/cast, duplicate ContextBuilder default constant. Already removed streamContent/ListedSessionEvent remain absent. Five tool-name exports become private while constants/names remain.
- Production defaults have one owner, unchanged readConfig. ContextBuilder and Ollama adapter/catalog/HTTP constructors require explicit values; composition already provides them. Fixtures supply independent values. Default values/blank normalization/errors/optional keep-alive remain green.
- TemporalClock remains injected and uses native/global Temporal directly with full native precision/UTC/ISO branding. Removed temporal-polyfill via Bun; lock drops only its root and three package records. No Date replacement, feature detection, fallback or new time dependency.
- One private compile helper removes Linux/Windows duplication. Public wrappers, exact targets/output names, matching packaged rg, Linux 0755, logging/error/exit behavior and all entrypoint contracts remain; both builds/artifact checks/failure injection/smoke pass.
- Retained: ui_old exclusion (directory exists), legacy replay/opaque outputs, forceRefresh, ListedModel metadata, metrics/getAgentMetrics, Ink/react-devtools-core, smoke script with accurate limitations, all useful model/tool/session/presentation/workspace/clock/ID boundaries and Phases 1–9 regression coverage.
- Final targeted 141, supplemental 108 and full/release 449 tests pass; final full/release has 4016 assertions / 34 files. Typecheck, formatting (125 files), Linux build, Windows cross-build, smoke, structural searches, whitespace, complete diff/record/scope/protected-input/lock checks pass.
- Unresolved external validation only: real source/packaged interactive Ollama workflows, native Windows execution, live DEV server workflow. No such pass is claimed. No source-checkout session or generated artifact is included.
- Audit, primary plan, Phase 1–9 records, tsconfig/compiler policy and build entrypoints are byte-identical to HEAD. No unrelated work beyond the approved final cleanup, no folder reorganization, no unrelated dependency update, no staging or commit.
