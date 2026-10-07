# Phase 13 live Markdown experiment

## Status

verified

## Baseline

- Started 2026-10-07 at HEAD `0e49787c7014b3e05ec8c0afc46aac7e18cf7eb7`.
- Initial `git status --short --untracked-files=all`, `git diff --stat`, and `git diff --name-only` were empty. No pre-existing changes or applicable workspace/ancestor AGENTS.md.
- Installed and declared OpenTUI Core version: **0.5.14**. No dependency change made.
- Read Phase 11 and Phase 12 progress history. Phase 12 is verified: one persistent live Text owner, independently appended committed native Markdown, 32 ms StreamBuffer, event-ID/turn/session fencing, native sticky scrolling/culling, existing keyboard/focus behavior. Concealed live Markdown alternated between immediate preview and asynchronous highlighted representations; controlled event-loop starvation was ruled out. Unconcealed native Markdown matched relevant text/heights in the smaller isolation probe.
- This file was created before experiment implementation. Investigation is performed by one agent using the requested Max reasoning; no commit is authorized.
- Focused baseline `bun test src/presentation/TerminalApp.test.ts src/presentation/Conversation.test.ts src/presentation/TranscriptLog.test.ts src/presentation/state/StreamBuffer.test.ts scripts/opentui-artifact.test.ts`: **64 passed / 0 failed / 702 assertions / 5 files**, exit 0; `/tmp/phase-13-focused-baseline.log`.

## Experiment

- Inspected installed declarations, implementation/parser/highlighting source and Phase 12 reproduction before choosing exact supported live options.
- Compared the identical Phase 12 26-fragment workload through Text and unconcealed Markdown, preserving the production 32 ms buffer, viewport, fixture and completion sequence. The focused native candidate failed before any production adoption.
- No hybrid parser, worker/thread change, parser patch, remount, redraw workaround, timing change, history rebuild or unrelated UI change was introduced.
- Installed `renderables/Markdown.d.ts` and source maps confirm **`conceal: false`** controls markers in Markdown text blocks. **`concealCode: false`** (already the default) controls concealment inside native fenced-code children; it does not preserve the fence lines. Defaults are `conceal: true`, `concealCode: false`, `streaming: false`, and `internalBlockMode: 'coalesced'`.
- Candidate scratch copy `/tmp/phase-13-TerminalApp-candidate.ts` changes only the live field/constructor: native Markdown with `id: 'live-output'`, `width: '100%'`, empty initial content, existing `syntaxStyle`/foreground, `streaming: true`, `conceal: false`, `concealCode: false`, `tableOptions: { style: 'columns' }`, and the existing injected client when provided. All production code is still unchanged.
- Inspected original `Markdown.ts`, `Code.ts`, `markdown-parser.ts`, official mock/test renderer, and Phase 12 scratch/native/event-loop/NDJSON fixtures. Source-map excerpts are in `/tmp/phase-13-opentui-source`. Native coalesced Markdown still runs Marked previews and asynchronous Tree-sitter highlighting with concealment disabled; previews normalize inline delimiters and the parser extracts fence bodies into separate Code children. The deterministic and actual source-TUI evidence below confirm those behaviors.

## Comparison

- `/tmp/phase-13-native-compare.ts` runs the same 26 Phase 12 fragments through the current production Text app and a scratch copy changing only the live constructor. Identical FakeTerminalRuntime, actual 32 ms Conversation/StreamBuffer, 40-row viewport, completion sequence and native renderer at **80 and 32 columns** (live content width 74 and 26). Uses the official MockTreeSitterClient to gate completion, fed actual captures from one initialized real TreeSitterClient. No product sleeps, parser modification or new worker is introduced. Logs `/tmp/phase-13-native-compare.log`; all frames/styles and summary `/tmp/phase-13-native-results.json`.
- At **both widths**: Text has **0/26 pending-to-settled text changes and 0/26 height changes**, and **0 live highlight requests**. Candidate has **12/26 text changes**, **3/26 height changes**, and **24 live highlight requests**. Candidate failure stages (zero-based) for text: **12, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25**; height: **16, 23, 25**. All unchanged third frames/heights agree after settlement; that does not remove the preceding asynchronous changes.
- Complete `_italic_` becomes `*italic*` in the native Marked preview, then returns to `_italic_` after real highlighting, including on later unrelated list/fence deltas. The settled heading keeps `##`; disabling concealment removes the specific heading-marker regression but does not make the whole stream stable.
- At `- item\n- ` (stage 16), unchanged candidate height drops **7→6** rows at 80 columns (**8→7** at 32). On code-body arrival (stage 22), the candidate initially displays the old body, then shows `const answer = 42;` after highlighting. Partial closing fences become visible code-body backticks asynchronously; stage 23 height grows **8→9** (**9→10** narrow), and stage 25 completion drops **9→8** (**10→9** narrow). Opening/final closing fences are stripped by native block extraction regardless of conceal settings.
- Both paths retain one live owner, identical historical parent/Markdown/Code references and one runtime subscriber for every fragment. No stale/duplicate words were observed in the settled crops. Both clear/hide live before exactly one authoritative committed Markdown entry (content deliberately differs from draft), use default committed `conceal: true`/`streaming: false`, conceal heading/strong/emphasis/fences, and survive duplicate durable delivery and iterator finalization without duplication.
- Native captured style spans with the existing production syntax show **bold and italic live styling** for complete inline syntax, including visible delimiters. **Headings are not visually differentiated** in this candidate (heading spans have attributes 0). The TypeScript code line also has no differentiated attributes under the existing minimal syntax style. Visible inline delimiters themselves remain readable, but changing emphasis delimiters and delayed/incomplete fence bodies are confusing and fail stability before any UX improvement could justify adoption.
- First scratch run failed because the `/tmp` candidate's package-relative Core import resolved a second module identity; explicit imports of the same installed module fixed the harness. The failed run is not candidate-rendering evidence. No production change or OpenTUI patch was needed.
- Actual source TUI runs used the same isolated **90×40 tmux PTY**, prompt, production runtime/bootstrap and file-gated Ollama-compatible NDJSON endpoint `/tmp/phase-13-scripted-endpoint.ts` (copied from Phase 12 with only temporary directory/model names changed). Baseline ran the real `index.ts`; candidate ran an exact scratch copy of `index.ts`/`start.ts` importing the live-only candidate. Production files were never edited. Real native Tree-sitter client, normal renderer scheduling and 32 ms buffer remain in use. Loopback listen required sandbox escalation after `EPERM`; observation loops only gate fixture input and do not change product timing.
- **26 baseline source frames** match cumulative literal text, with stable visible heading/strong/emphasis/list/fence delimiters. **26 candidate settled source frames** match the native candidate's settled result. Polling settled frames alone misses short previews: captured actual terminal output conclusively shows `*italic*`, then `_` writes at row 9/columns 18 and 25, then repeated `*`/`_` replacements at those same coordinates on later deltas. The row 9/column 18 write sequence is **eight `*→_` pairs**. This is the original class of asynchronous representation change in the actual source TUI, despite heading `##` remaining visible. No overlap/duplicate words were observed in the settled crops; absence of other transient artifacts is not claimed.
- Source ANSI captures corroborate bold (`SGR 1`) and italic (`SGR 3`) with visible delimiters. Heading and TypeScript body have the same default foreground/no added attributes as Text. List markers stay literal. Native code extraction removes opening/complete closing fences; partial closing backticks appear/disappear in code text. Existing visible inline markers are acceptable, but their repeated replacement and incomplete-code interpretation fail the stable/readable live UX requirement.
- Both source runs finish with exactly one formatted heading/emphasis/list/code answer, concealed syntax, no live duplicate, and one durable `assistant.message.completed` event containing identical full source. Both idle Ctrl+C exits report **exit=0 terminal=restored**. Endpoint and dedicated tmux server stopped. Frames/ANSI: `/tmp/phase-13-source-frames/{text,markdown}/stage-00.txt` through `stage-25.txt`, `committed.txt`, and selected `.ansi` files; raw streams `/tmp/phase-13-source-{text,markdown}-terminal.raw`; observations `/tmp/phase-13-source-observations.json`; summary/durable evidence `/tmp/phase-13-source-evidence.json`. Runtime/parser data remains isolated under `/tmp/phase-13-source-{text,markdown}`.
- Performance architecture is unchanged in both scratch copies: one live owner, one subscription, 32 ms buffering, stable append-only history and native culling/sticky scrolling. Candidate adds native incremental parsing, block reconciliation, styled-buffer replacement and **24 live highlight requests** for this workload versus Text's **0**. No extra client per fragment, history traversal/rebuild, renderer-wide refresh, new application worker/thread, custom parser or workaround. Additional native work is recorded without a timing benchmark claim. Selected production path adds **zero work**.

## Decision

**Retain plain Text live.** The exact required native workload disproves equivalent pending/settled stability even with both conceal flags disabled, and the actual source TUI confirms repeated emphasis-marker replacement. Inline styling improves, but headings/code are not visibly improved by the existing configuration and syntax-incomplete code remains awkward. All adoption criteria must pass; native/source stability fail. Production remains `TextRenderable live → MarkdownRenderable committed`. No hybrid/parser/style workaround is added. This rejected experiment is a verified Phase 13 outcome; all required gates pass.

## Validation

- Added one native A/B regression in `TerminalApp.test.ts`, sharing the unchanged 26-fragment fixture with the existing production regression. Actual native Text/Markdown at matching live widths **74 and 26**, official gated mock plus real highlights, checks every frozen preview/settled/third frame, height and persistent root identity; asserts the observed 12 text/3 height changes, complete bold/italic styling and delayed code-body arrival. Existing production test still proves actual buffering, history identity, one subscriber, authoritative commit/deduplication and no live parsing. Conversation/StreamBuffer and artifact tests are unchanged.
- Candidate-specific `bun test src/presentation/TerminalApp.test.ts -t 'native unconcealed'`: **1 passed / 0 failed / 506 assertions / 20 filtered / 1 file**, exit 0; `/tmp/phase-13-candidate-regression.log`.
- Final focused `bun test src/presentation/TerminalApp.test.ts src/presentation/Conversation.test.ts src/presentation/TranscriptLog.test.ts src/presentation/state/StreamBuffer.test.ts scripts/opentui-artifact.test.ts`: **65 passed / 0 failed / 1208 assertions / 5 files**, exit 0; `/tmp/phase-13-focused-tests.log`. File counts: **21 TerminalApp, 37 Conversation, 4 TranscriptLog, 2 StreamBuffer, 1 artifact**.

All commands below passed with exit **0** against the final test changes. This record was completed afterward.

| Command | Exact result | Log |
| --- | --- | --- |
| `bun run typecheck` | Passed | `/tmp/phase-13-typecheck.log` |
| `bun test` | **440 passed / 0 failed / 4838 assertions / 28 files** | `/tmp/phase-13-full-tests.log` |
| `bun run format:check` | **110 files checked; no fixes** | `/tmp/phase-13-format-check.log` |
| `bun run build:linux` | Passed | `/tmp/phase-13-build-linux.log` |
| `bun run build:windows` | Passed | `/tmp/phase-13-build-windows.log` |
| `bun run smoke:build` | Passed | `/tmp/phase-13-smoke.log` |
| `bun run release:check` | Passed: **440 passed / 0 failed / 4838 assertions / 28 test files**, **110 format-checked files**, typecheck, Linux/Windows build-all and isolated smoke | `/tmp/phase-13-release-check.log` |

- Final review inspected the complete native-test diff and this record. `git diff --check` passed. `git diff --stat`: **1 tracked file, 150 insertions / 28 deletions**; the new progress record is the sole intentional untracked file. The 28 deletions move the exact unchanged fixture into a shared constant; no existing regression assertion was removed.
- Scope is only `src/presentation/TerminalApp.test.ts` and `docs/progress/phase-13-progress.md`. No production presentation/application/runtime/domain/infrastructure/composition changes, worker/thread changes, dependency/build-script changes, UI redesign or Phase 1–12 progress modifications. No generated `.agent`/dist artifact is included. HEAD remains `0e49787c7014b3e05ec8c0afc46aac7e18cf7eb7`; no staging or commit.
- Final `git status --short --untracked-files=all`:

```text
 M src/presentation/TerminalApp.test.ts
?? docs/progress/phase-13-progress.md
```

- Limits: actual native/source TUI behavior verified on Linux; Windows cross-build/smoke passed, with no native Windows console run claimed. Evidence applies to installed Core 0.5.14 and the exact required workload/configuration. A future Core change can prompt reevaluation; this phase does not implement stable-prefix parsing or other future alternatives. All required Phase 13 work is complete.
