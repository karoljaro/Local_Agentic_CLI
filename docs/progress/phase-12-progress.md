# Phase 12 implementation progress

## Status

verified

## Scope and baseline

- Focused fix for the live OpenTUI streaming glyph/word jumping reported after verified Phase 11. No TUI redesign, runtime architecture migration, dependency change, or commit is authorized by this phase.
- Started 2026-10-07 at HEAD `401b4960c2d508f51cb59cf7cd3ddcd30a01d80c`; `git status --short --untracked-files=all` was empty. No applicable workspace/ancestor AGENTS.md found.
- Read [verified Phase 11](phase-11-progress.md) as the protected architecture/validation reference. Phase 1–11 history will remain unchanged.
- This record was created before implementation. Investigation and validation run in one agent; requested reasoning level is Max.
- Preserve OpenTUI Core 0.5.14, append-only stable committed nodes, independent live ownership, 32 ms StreamBuffer, native ScrollBox sticky scrolling/culling, event-ID/turn/session fencing, and existing keyboard/focus/UX.

## Investigation

- Inspected `TerminalApp.ts`, `Conversation.ts`, `TranscriptLog.ts`, their tests, `StreamBuffer.ts`/tests, and `scripts/opentui-artifact.test.ts`. Before the fix, the production live owner was one constructor-created `MarkdownRenderable` (`live-output`) inside one persistent `live-round` Box. Each live notification only assigns `live.content` and visibility, then returns; historical nodes are not rebuilt. No key/id or outer renderable replacement occurs per flush.
- Inspected installed Core **0.5.14** declarations and original sources from its package source maps: `Markdown.ts`, `markdown-parser.ts`, `Code.ts`, `Text.ts`, `TextBufferRenderable.ts`, test renderer and mock client. Official references: [Markdown](https://opentui.com/docs/components/markdown/), [Text](https://opentui.com/docs/components/text/), [testing](https://opentui.com/docs/core-concepts/testing/). Installed version is authoritative for this defect; current docs are supporting API references.
- `MarkdownRenderable.content` synchronously calls `updateBlocks` → `parseMarkdownIncremental` → Marked lexing of the unstable tail (two trailing tokens in streaming mode). Native child Code renderables subsequently run asynchronous Tree-sitter highlighting and conceal delimiters. `createInitialStyledText` produces an immediate Marked preview; `CodeRenderable.content`/`updateStreamingPreview` replaces its native text buffer with that preview, and `startHighlight` later replaces it with highlighted/concealed chunks. Snapshot IDs reject obsolete highlight results, so this is not a demonstrated stale-result overwrite.
- Native `updateBlocks` reuses compatible block children and destroys/replaces a child when its parsed block type changes. Outer application-owned identity is independent of that native reconciliation. The reproduced heading movement happens even with the same native Code child, so child replacement is not necessary for this defect.
- `Conversation` constructs one `StreamBuffer(32)` and one buffer listener. The buffer has at most one pending timer. Runtime subscription replacement unsubscribes its predecessor and fences session/turn identity. Durable event IDs are checked before resetting live output. Completion flush/reset and durable entry notification execute synchronously with no await between them; live is hidden before the committed presentation node is attached. The runtime already persisted the authoritative event. No duplicate live/durable ownership was found in this path.
- Before implementation, focused baseline passed **62 tests / 0 failures / 273 assertions / 5 files**: TerminalApp, Conversation, TranscriptLog, StreamBuffer and native artifact tests. Log: `/tmp/phase-12-focused-baseline.log`.

### Native isolation before implementation

- Scratch reproduction `/tmp/phase-12-native-repro.ts` uses official `createTestRenderer`, `MockTreeSitterClient`, and highlight captures produced by a real initialized `TreeSitterClient`. Resolves the official pending highlight promise explicitly; no sleep or assumed worker duration. Compares Markdown with concealment, Markdown with concealment disabled, and native Text for identical successive content snapshots. Logs: `/tmp/phase-12-native-repro.log` (80 columns), `/tmp/phase-12-native-repro-narrow.log` (26 columns).
- Heading snapshots grow through `#`, `##`, `## Thi`, the full heading, newline, then `**`, `**bold`, `**bold**` after a blank line. At `## Thi`, native Markdown's pending frame contains `## Thi` and its highlighted frame contains `Thi`. At the full heading, pending frame contains `## This is a Markdown heading`; highlighted frame contains `This is a Markdown heading`. Subsequent nonempty deltas restore the heading markers in the preview and conceal them again after highlighting, even though the heading has already been parsed previously.
- At 26 columns, that same snapshot has **2 rows before highlighting and 1 row after**; after adding emphasis it has **4 rows before and 3 after**. The unchanged heading is rewrapped/repositioned solely by the preview/highlight transition. Outer Markdown and the heading's native Code child stay identical throughout this reproduction. Captured settled frames contain no residual duplicate heading; native framebuffer corruption is not established or needed to explain the reproduced word movement.
- With concealment disabled, relevant pending/highlighted text and heights agree. With Markdown replaced by native Text, relevant frames also agree, including literal completed `**bold**`; Text issues no parser/highlighter work. Ordinary newline growth changes Text height once as expected. These comparisons isolate Markdown interpretation/concealment, rather than changing StreamBuffer cadence or ScrollBox behavior.
- A separate ordinary-prose run (`/tmp/phase-12-native-repro-prose.log`) has matching pending/highlighted text and heights for Markdown, Markdown without concealment, and Text. The defect requires the changing Markdown representation in this fixture; ordinary text alone does not reproduce it.

### Bun event-loop starvation check

- User requested this additional contributing-cause check during validation. `/tmp/phase-12-event-loop-repro.ts` runs the **same 26 fragments** through the original HEAD TerminalApp and the fixed TerminalApp, official native test renderer, and `FakeTerminalRuntime`. The original module is copied to `/tmp` with only import paths expanded; no behavioral changes. No HTTP/Ollama, tools, persistence IO, artificial CPU workload, or new workers/thread separation. Both retain the actual 32 ms StreamBuffer. Native rendering runs with `useThread: false`; OpenTUI's existing real Tree-sitter client is initialized/warmed before measurement.
- Each fragment is gated by consumption and the actual live-content predicate; native highlight completion is awaited explicitly. A 5 ms heartbeat measures excess interval gap (`max(0, actual gap − 5 ms)`) throughout streaming and final commit. This is diagnostic evidence, not a timing threshold imposed on CI.

| Path | Samples | Mean drift | p95 drift | Maximum drift | Drift ≥32 ms | Preview/highlight text transitions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original live Markdown | 178 | 0.384 ms | 1.660 ms | 10.102 ms | 0 | 20 |
| Fixed live Text | 171 | 0.189 ms | 0.875 ms | 3.413 ms | 0 | 0 |

- Both runs keep the same live owner; every fixed-path pending and settled frame is literal. Original content changes representation even while that particular snapshot is frozen and the loop remains responsive. **Event-loop starvation is ruled out as a material cause of this controlled reproduction.** No event-loop scheduling, worker, or thread change is warranted. This does not claim arbitrary unrelated workloads can never block Bun.
- Exact summaries/frames and final native Markdown frames: `/tmp/phase-12-event-loop-results.json`; summary `/tmp/phase-12-event-loop-repro.log`. Measured streaming-plus-commit duration was 961.833 ms original / 890.710 ms fixed; these observations are not a benchmark claim.

## Proven cause and fix

**Proven cause:** live uncommitted assistant content enters native Markdown parsing on every buffered update. Core 0.5.14 alternates between its immediate Marked preview and asynchronous Tree-sitter concealed representation. Even a previously complete heading temporarily regains its delimiters on a later delta. That shifts glyph positions and can change wrapping/layout height twice for one snapshot. The stable outer renderable does not prevent its native text buffer from being replaced twice. Incomplete inline syntax also changes interpretation as delimiters arrive.

Chosen narrow fix: one persistent native `TextRenderable` for literal live content, keeping native `MarkdownRenderable` for committed assistant entries. Preserve the 32 ms buffer, all committed node ownership, event/selection/turn fencing, native scrolling/culling, focus/keyboard behavior, colors and other UX. No upstream/native-cell patch, incremental parser, redraw workaround or dependency change is justified by the evidence.

- Changed only the live field/constructor in `TerminalApp.ts`: native Text, word wrapping, existing foreground/width/id/region. Removed live-only Markdown syntax/streaming/table/parser options. `appendEntry` still constructs native Markdown for assistant entries, including preserved partials after errors/cancellation. No production Conversation/TranscriptLog/StreamBuffer change.
- Added one controller regression and one real native renderer regression. The native case failed on the original implementation at the live Text contract before applying the fix (`/tmp/phase-12-regression-before-fix.log`); initial fixed run passed **1 test / 0 failures / 332 assertions** (`/tmp/phase-12-regression-after-fix.log`). Final strengthened coverage is included in the focused/full results below.
- The final native test exercises 26 gated heading, strong/emphasis, list and TypeScript fence fragments through the production app with a scripted runtime, real Core renderer and real Tree-sitter parser. Checks one persistent live owner, exact literal native buffer and relevant captured frame contents on two renders per snapshot, unchanged height without a delta, stable historical parent/Markdown child references, no live highlight requests and one runtime subscriber. Final authoritative content differs from the draft, clears/hides live while the iterator is still active, appears in one native Markdown entry, survives duplicate event delivery/finalization, and renders concealed headings/emphasis/fences after awaiting official highlight promises. Frame checks crop the live node's actual geometry rather than hard-coding a screen layout.
- Controller coverage checks live-only notifications/history references through syntax-boundary flushes, clearing before authoritative entry notification, event-ID deduplication and iterator finalization. Existing session/turn fencing, subsequent rounds, error/cancellation, sticky scrolling/culling, focus, keyboard and artifact tests remain intact.

## Source TUI scripted reproduction

- Executed the actual `bun .../index.ts` source entrypoint and production runtime in a **90×40 tmux PTY**, cwd `/tmp/phase-12-source-workspace`. Endpoint `/tmp/phase-12-scripted-endpoint.ts` emits the exact same 26 fragments over Ollama-compatible NDJSON, using file gates rather than time-based emission. XDG parser/config paths and durable `.agent` session data are isolated under `/tmp`.
- The endpoint's loopback listen needed sandbox escalation (initial `EPERM`). The first attempt closed its idle gated HTTP stream before any fragment; the fixture was restarted with `idleTimeout: 0` for held responses. No product timeout or buffering change. The completed rerun is the evidence reported here.
- For every stage, released one fragment, waited for the actual terminal transcript to match the cumulative literal source, and saved the frame. All **26 live frames** matched exactly, including literal `##`, `**bold**`, `_italic_`, lists and incomplete/complete fences. Heading markers stayed present throughout live updates; no mixed, duplicate or stale words appeared in those captured frames.
- Released final completion and waited for actual formatted output: exactly one heading, `bold and italic`, both list entries and `const answer = 42;`, with heading/emphasis/fence syntax concealed and no live duplicate. One durable assistant event contains the full authoritative source. Saved frames: `/tmp/phase-12-source-frames/stage-00.txt` through `stage-25.txt` and `committed.txt`; raw terminal output: `/tmp/phase-12-source-terminal.raw`.
- Idle Ctrl+C exited **0** and exact `stty -g` comparison reported **terminal=restored** (`/tmp/phase-12-source-terminal.log`). Scripted endpoint stopped; dedicated tmux session exited. This phase uses reproducible scripted output, not a nondeterministic real-model response.

## Validation

All commands below passed with exit **0** against the final production/test changes. Progress documentation was completed afterward.

| Command | Exact result | Log |
| --- | --- | --- |
| `bun test src/presentation/TerminalApp.test.ts src/presentation/Conversation.test.ts src/presentation/TranscriptLog.test.ts src/presentation/state/StreamBuffer.test.ts scripts/opentui-artifact.test.ts` | **64 passed / 0 failed / 702 assertions / 5 files** | `/tmp/phase-12-focused-tests.log` |
| `bun run typecheck` | Passed | `/tmp/phase-12-typecheck.log` |
| `bun test` | **439 passed / 0 failed / 4332 assertions / 28 files** | `/tmp/phase-12-full-tests.log` |
| `bun run format:check` | **110 files checked; no fixes** | `/tmp/phase-12-format-check.log` |
| `bun run build:linux` | Passed | `/tmp/phase-12-build-linux.log` |
| `bun run build:windows` | Passed | `/tmp/phase-12-build-windows.log` |
| `bun run smoke:build` | Passed | `/tmp/phase-12-smoke.log` |
| `bun run release:check` | Passed: **439 passed / 0 failed / 4332 assertions / 28 test files**, **110 format-checked files**, typecheck, Linux/Windows build-all and isolated smoke | `/tmp/phase-12-release-check.log` |

- Focused file counts: **20 TerminalApp**, **37 Conversation**, **4 TranscriptLog**, **2 StreamBuffer**, **1 native artifact**. Native regression includes the real parser; existing isolated compiled artifact still verifies embedded native library, worker, Markdown/TypeScript grammar/highlighting and final concealed Markdown without external assets. Artifact implementation unchanged.
- Deterministic/controller/native gates passed before completed source-PTY reproduction. No required gate is deferred. No dependency installation/update was needed.

## Diff review and limitations

- Reviewed the complete production/controller-test/native-test diff and this new record. `git diff --check` passed. `git diff --stat`: **3 tracked files, 229 insertions / 7 deletions**; this progress record is the sole intentional untracked file.
- Scope: `TerminalApp.ts`, `TerminalApp.test.ts`, `Conversation.test.ts`, `docs/progress/phase-12-progress.md`. Application/domain/composition/infrastructure implementations, all Phase 1–11 progress records, dependency manifest/lock, build scripts, ScrollBox configuration, StreamBuffer cadence and UX controls have no diff. No generated `.agent`/dist artifact is included. No staging or commit.
- Performance remains live-only native buffer replacement at 32 ms cadence, append-only stable historical nodes and native sticky scrolling/culling. Tests assert historical renderable identity during every delta. No O(history × tokens) transformation, renderer-wide refresh, screen clear, transcript remount, viewport-culling change, sleep-based workaround, custom parser or framebuffer logic.
- Intended UX: literal Markdown while streaming, then one transition into native formatted Markdown after authoritative completion. Normal word wrapping/newline growth and bottom-follow can move rows; asynchronous parser-driven live reinterpretation is removed.
- Limits: Linux native tests/source PTY were executed; Windows was cross-built and artifact/smoke checked, not run in a Windows console. Event-loop evidence covers this exact scripted workload, not arbitrary expensive unrelated work. Captured terminal/native frames establish this regression's rendering contract; no terminal-specific native framebuffer corruption was independently demonstrated.
