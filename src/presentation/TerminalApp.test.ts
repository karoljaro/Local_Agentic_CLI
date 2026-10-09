import { SYNTHETIC_MODEL } from '@/test-support/modelFixtures';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, spyOn, test } from 'bun:test';
import {
	CodeRenderable,
	MarkdownRenderable,
	SyntaxStyle,
	TextAttributes,
	TextRenderable,
	TreeSitterClient,
	type Renderable,
} from '@opentui/core';
import { createTestRenderer, MockTreeSitterClient } from '@opentui/core/testing';
import { asSessionId, asToolCallId } from '@/domain/Ids';
import { createDeferred } from '@/test-support/createDeferred';
import { FakeTerminalRuntime } from '@/test-support/FakeTerminalRuntime';
import {
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
	toolCallRequestedEvent,
	toolCallCompletedEvent,
	toolCallFailedEvent,
} from '@/test-support/AgentEventFixtures';
import { TerminalApp } from './TerminalApp';

const markdownFragments = [
	'#',
	'#',
	' Thi',
	's is a Markdown heading',
	'\n\n',
	'*',
	'*',
	'bold',
	'*',
	'*',
	' and _',
	'italic',
	'_',
	'\n\n',
	'-',
	' item',
	'\n- ',
	'second',
	'\n\n',
	'`',
	'`',
	'`ts\n',
	'const answer = 42;\n',
	'`',
	'`',
	'`',
];

const parsers: MockTreeSitterClient[] = [];
afterEach(async () => {
	await Promise.all(parsers.splice(0).map((parser) => parser.destroy()));
});

async function setup(runtime = new FakeTerminalRuntime(), initialMode: 'new' | 'resume' = 'new') {
	const native = await createTestRenderer({
		width: 80,
		height: 24,
		screenMode: 'alternate-screen',
		exitOnCtrlC: false,
		exitSignals: [],
		autoFocus: false,
		useThread: false,
		kittyKeyboard: true,
	});
	const parser = new MockTreeSitterClient();
	parsers.push(parser);
	const app = new TerminalApp(native.renderer, runtime, initialMode, parser);
	await app.ready;
	await native.renderOnce();
	return { ...native, app, runtime, parser };
}

async function settle(ui: Awaited<ReturnType<typeof setup>>) {
	for (let pass = 0; pass < 6; pass++) {
		ui.parser.resolveAllHighlightOnce();
		await Promise.resolve();
		await ui.renderOnce();
	}
}

test('Core starts with focused native composer, edits and submits once with structural prompt distinction', async () => {
	const ui = await setup();
	try {
		expect(ui.app.composer.focused).toBe(true);
		await ui.mockInput.typeText('Refacto');
		ui.mockInput.pressArrow('left');
		ui.mockInput.pressBackspace();
		await ui.mockInput.typeText('t');
		ui.mockInput.pressKey('e', { ctrl: true });
		await ui.mockInput.typeText('r');
		ui.mockInput.pressEnter();
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(ui.runtime.turns).toHaveLength(1);
		expect(ui.runtime.turns[0]?.prompt).toBe('Refactor');
		expect(ui.app.composer.plainText).toBe('');
		const frame = ui.captureCharFrame();
		expect(frame).toContain('› Refactor');
		expect(frame).toContain('A readable answer.');
		expect(frame).not.toContain('You:');
		expect(frame).not.toContain('Assistant:');
	} finally {
		await ui.app.shutdown();
	}
});

test('native composer preserves pasted multiline text and supports explicit newline without submission', async () => {
	const ui = await setup();
	try {
		await ui.mockInput.typeText('first');
		ui.mockInput.pressEnter({ shift: true });
		await ui.mockInput.pasteBracketedText('second\r\nthird');
		expect(ui.runtime.turns).toHaveLength(0);
		expect(ui.app.composer.plainText).toBe('first\nsecond\nthird');
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(ui.runtime.turns[0]?.prompt).toBe('first\nsecond\nthird');
	} finally {
		await ui.app.shutdown();
	}
});

test('slash suggestions navigate and Tab completes; model picker selects and restores composer focus', async () => {
	const ui = await setup();
	try {
		await ui.mockInput.typeText('/');
		ui.mockInput.pressArrow('down');
		ui.mockInput.pressTab();
		expect(ui.app.composer.plainText).toBe('/resume');
		ui.mockInput.pressEscape();
		ui.app.composer.clear();
		await ui.mockInput.typeText('/model');
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(ui.app.composer.focused).toBe(false);
		expect(ui.captureCharFrame()).toContain('other-model');
		ui.mockInput.pressArrow('down');
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(ui.runtime.switches).toEqual(['other-model']);
		expect(ui.app.composer.focused).toBe(true);
		expect(ui.captureCharFrame()).toContain('other-model');
	} finally {
		await ui.app.shutdown();
	}
});

test('session picker previews without activation; navigation/select resumes durable history while retaining runtime model', async () => {
	const runtime = new FakeTerminalRuntime();
	const sessionId = asSessionId('saved-session');
	const events = [
		promptSubmittedEvent({ sessionId, prompt: 'Fix the session cache', modelName: 'saved-model' }),
		assistantMessageCompletedEvent({ sessionId, content: 'Previously committed answer.' }),
	];
	runtime.events.set(sessionId, events);
	const ui = await setup(runtime, 'resume');
	try {
		await settle(ui);
		expect(runtime.previews).toEqual([sessionId]);
		expect(runtime.activations).not.toContain(sessionId);
		expect(ui.captureCharFrame()).toContain('Fix the session cache');
		ui.mockInput.pressArrow('down');
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(runtime.activations).toContain(sessionId);
		expect(runtime.switches).toEqual([]);
		expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
		expect(runtime.events.get(sessionId)).toEqual(events);
		expect(ui.captureCharFrame()).toContain('Previously committed answer.');
		expect(ui.app.composer.focused).toBe(true);
		ui.mockInput.pressKey('F3');
		await settle(ui);
		ui.mockInput.pressEscape();
		expect(ui.app.conversation.sessionId).toBe(sessionId);
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		await ui.app.shutdown();
	}
});

test.each([
	true,
	false,
])('approval action/target is focused; %s decision clears it and restores focus', async (allow) => {
	const ui = await setup();
	try {
		const decision = ui.runtime.approval(
			{
				sessionId: ui.app.conversation.sessionId,
				toolCallId: asToolCallId('approval'),
				toolName: 'edit_file',
				toolInput: { path: 'src/cache.ts', oldText: 'old', newText: 'new' },
			},
			{},
		);
		await settle(ui);
		expect(ui.captureCharFrame()).toContain('src/cache.ts');
		expect(ui.app.composer.focused).toBe(false);
		ui.mockInput.pressKey(allow ? 'y' : 'n');
		expect(await decision).toBe(allow);
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		await ui.app.shutdown();
	}
});

test('approval Enter defaults deny; Escape denies, abort removes prompt and stale input cannot allow', async () => {
	const ui = await setup();
	try {
		const request = {
			sessionId: ui.app.conversation.sessionId,
			toolCallId: asToolCallId('same-id'),
			toolName: 'create_file',
			toolInput: { path: 'new.ts' },
		};
		const first = ui.runtime.approval(request, {});
		ui.mockInput.pressEnter();
		expect(await first).toBe(false);
		const second = ui.runtime.approval(request, {});
		ui.mockInput.pressEscape();
		expect(await second).toBe(false);
		const controller = new AbortController();
		const cancelled = ui.runtime.approval(request, { signal: controller.signal });
		const rejected = cancelled.catch((error: unknown) => error);
		controller.abort();
		ui.mockInput.pressKey('y');
		expect(await rejected).toHaveProperty('name', 'AbortError');
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		await ui.app.shutdown();
	}
});

test('streaming is visible before completion and durable output renders once', async () => {
	const runtime = new FakeTerminalRuntime();
	const release = createDeferred<void>();
	runtime.script = async function* (input) {
		yield { contentDelta: 'Live answer before completion.' };
		await release.promise;
		runtime.complete(input.sessionId, 'Live answer before completion.');
	};
	const ui = await setup(runtime);
	try {
		await ui.mockInput.typeText('Ask');
		ui.mockInput.pressEnter();
		await new Promise((resolve) => setTimeout(resolve, 40));
		await settle(ui);
		expect(ui.app.conversation.running).toBe(true);
		expect(ui.captureCharFrame()).toContain('Live answer before completion.');
		release.resolve();
		await settle(ui);
		expect(ui.captureCharFrame().match(/Live answer before completion\./g)).toHaveLength(1);
	} finally {
		release.resolve();
		await ui.app.shutdown();
	}
});

test('native unconcealed Markdown changes frozen emphasis/fence frames that Text keeps stable', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'codesh-live-markdown-'));
	const real = new TreeSitterClient({ dataPath: directory });
	const syntax = SyntaxStyle.fromStyles({
		default: { fg: '#ffffff' },
		'markup.heading': { bold: true },
		'markup.strong': { bold: true },
		'markup.italic': { italic: true },
	});
	try {
		await real.initialize();
		for (const width of [74, 26]) {
			for (const mode of ['text', 'markdown'] as const) {
				const native = await createTestRenderer({ width, height: 40, useThread: false });
				const parser = new MockTreeSitterClient();
				const highlight = spyOn(parser, 'highlightOnce');
				const live =
					mode === 'text'
						? new TextRenderable(native.renderer, {
								id: 'live-output',
								width: '100%',
								content: '',
								wrapMode: 'word',
							})
						: new MarkdownRenderable(native.renderer, {
								id: 'live-output',
								width: '100%',
								content: '',
								syntaxStyle: syntax,
								streaming: true,
								conceal: false,
								concealCode: false,
								tableOptions: { style: 'columns' },
								treeSitterClient: parser,
							});
				native.renderer.root.add(live);
				const crop = () =>
					native
						.captureCharFrame()
						.split('\n')
						.slice(live.y, live.y + live.height)
						.map((row) => row.slice(live.x, live.x + live.width).trimEnd())
						.join('\n')
						.trimEnd();
				let content = '';
				const textChanges: number[] = [];
				const heightChanges: number[] = [];
				try {
					for (const [stage, fragment] of markdownFragments.entries()) {
						content += fragment;
						live.content = content;
						await native.renderOnce();
						const preview = crop();
						const previewHeight = live.height;
						const pending: Promise<void>[] = [];
						const collect = (node: Renderable) => {
							if (node instanceof CodeRenderable) pending.push(node.highlightingDone);
							for (const child of node.getChildren()) collect(child);
						};
						collect(live);
						for (const [source, filetype] of highlight.mock.calls) {
							const result = await real.highlightOnce(source, filetype);
							expect(result.error).toBeUndefined();
							expect(result.warning).toBeUndefined();
							parser.setMockResult(result);
							parser.resolveHighlightOnce(0);
						}
						if (mode === 'text') expect(highlight).not.toHaveBeenCalled();
						highlight.mockClear();
						await Promise.all(pending);
						await native.renderOnce();
						const settled = crop();
						const height = live.height;
						if (preview !== settled) textChanges.push(stage);
						if (previewHeight !== height) heightChanges.push(stage);
						if (mode === 'text' && width === 74) expect(settled).toBe(content.trimEnd());
						if (mode === 'markdown' && stage === 12) {
							expect(preview).toContain('**bold** and *italic*');
							expect(settled).toContain('**bold** and _italic_');
							const spans = native.captureSpans().lines.flatMap((line) => line.spans);
							expect(
								spans.find((span) => span.text === '**bold**')!.attributes & TextAttributes.BOLD,
							).toBeTruthy();
							expect(
								spans.find((span) => span.text === '_italic_')!.attributes & TextAttributes.ITALIC,
							).toBeTruthy();
						}
						if (mode === 'markdown' && stage === 22) {
							expect(preview).not.toContain('const answer = 42;');
							expect(settled).toContain('const answer = 42;');
						}
						await native.renderOnce();
						expect(crop()).toBe(settled);
						expect(live.height).toBe(height);
						expect(native.renderer.root.getChildren()).toEqual([live]);
					}
					if (mode === 'text') {
						expect(textChanges).toEqual([]);
						expect(heightChanges).toEqual([]);
					} else {
						expect(textChanges).toEqual([12, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25]);
						expect(heightChanges).toEqual([16, 23, 25]);
					}
				} finally {
					parser.resolveAllHighlightOnce();
					native.renderer.destroy();
					highlight.mockRestore();
					await parser.destroy();
				}
			}
		}
	} finally {
		syntax.destroy();
		await real.destroy();
		await rm(directory, { recursive: true, force: true });
	}
});

test('Markdown boundary deltas stay literal in one stable live Text owner until native Markdown commit', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'codesh-streaming-render-'));
	const parser = new TreeSitterClient({ dataPath: directory });
	const highlight = spyOn(parser, 'highlightOnce');
	const native = await createTestRenderer({
		width: 80,
		height: 40,
		screenMode: 'alternate-screen',
		exitOnCtrlC: false,
		exitSignals: [],
		autoFocus: false,
		useThread: false,
	});
	const runtime = new FakeTerminalRuntime();
	const fragments = markdownFragments;
	const received = fragments.map(() => createDeferred<void>());
	const releases = fragments.map(() => createDeferred<void>());
	runtime.script = async function* () {
		for (const [index, fragment] of fragments.entries()) {
			yield { contentDelta: fragment };
			received[index]!.resolve();
			await releases[index]!.promise;
		}
	};
	const app = new TerminalApp(native.renderer, runtime, 'new', parser);
	const waitFor = async (condition: () => boolean) => {
		const deadline = Date.now() + 2000;
		while (!condition()) {
			if (Date.now() >= deadline) throw new Error('Live rendering condition timed out');
			await Bun.sleep(1);
		}
	};
	try {
		await parser.initialize();
		await app.ready;
		runtime.complete(app.conversation.sessionId, 'Historical answer stays.');
		await native.renderOnce();
		const historical = app.transcript.getChildren()[0]!;
		const historicalMarkdown = historical.getChildren()[0]!;
		expect(historicalMarkdown).toBeInstanceOf(MarkdownRenderable);
		await (historicalMarkdown.getChildren()[0] as CodeRenderable).highlightingDone;
		highlight.mockClear();
		app.conversation.submit('Stream Markdown boundaries');
		await received[0]!.promise;
		const committed = app.transcript.getChildren().filter((node) => node.id.startsWith('entry:'));
		const liveRegion = app.transcript.findDescendantById('live-round')!;
		const live = liveRegion.getChildren()[0]!;
		expect(live instanceof TextRenderable).toBe(true);
		const text = live as TextRenderable;
		let content = '';
		for (const [index, fragment] of fragments.entries()) {
			await received[index]!.promise;
			content += fragment;
			await waitFor(() => app.conversation.liveContent === content);
			await native.renderOnce();
			expect(text.plainText).toBe(content);
			expect(liveRegion.visible).toBe(true);
			expect(liveRegion.getChildren()).toHaveLength(1);
			expect(liveRegion.getChildren()[0]).toBe(live);
			expect(app.transcript.findDescendantById('live-output')).toBe(live);
			expect(app.transcript.getChildren().filter((node) => node.id === 'live-round')).toHaveLength(
				1,
			);
			const entries = app.transcript.getChildren().filter((node) => node.id.startsWith('entry:'));
			expect(entries).toHaveLength(committed.length);
			expect(entries.every((node, entryIndex) => node === committed[entryIndex])).toBe(true);
			expect(historical.getChildren()[0]).toBe(historicalMarkdown);
			expect(highlight).not.toHaveBeenCalled();
			expect(runtime.listeners.size).toBe(1);
			const liveFrame = () =>
				native
					.captureCharFrame()
					.split('\n')
					.slice(text.y, text.y + text.height)
					.map((row) => row.slice(text.x, text.x + text.width).trimEnd())
					.join('\n')
					.trimEnd();
			expect(liveFrame()).toBe(content.trimEnd());
			const height = text.height;
			await native.renderOnce();
			expect(liveFrame()).toBe(content.trimEnd());
			expect(text.height).toBe(height);
			if (index < fragments.length - 1) releases[index]!.resolve();
		}
		const authoritative = `${content}\n\nAuthoritative final text.`;
		const event = runtime.complete(app.conversation.sessionId, authoritative);
		expect(app.conversation.running).toBe(true);
		expect(app.conversation.liveContent).toBe('');
		expect(text.plainText).toBe('');
		expect(liveRegion.visible).toBe(false);
		const finalNode = app.transcript.findDescendantById(`entry:${event.id}`)!;
		const markdown = finalNode.getChildren()[0] as MarkdownRenderable;
		expect(markdown).toBeInstanceOf(MarkdownRenderable);
		expect(markdown.content).toBe(authoritative);
		expect(markdown.streaming).toBe(false);
		runtime.commit(event);
		expect(app.transcript.getChildren().filter((node) => node.id === finalNode.id)).toEqual([
			finalNode,
		]);
		await native.renderOnce();
		const pending: Promise<void>[] = [];
		const collectHighlights = (node: Renderable) => {
			if (node instanceof CodeRenderable) pending.push(node.highlightingDone);
			for (const child of node.getChildren()) collectHighlights(child);
		};
		collectHighlights(markdown);
		await Promise.all(pending);
		await native.renderOnce();
		const frame = native.captureCharFrame();
		expect(frame.match(/This is a Markdown heading/g)).toHaveLength(1);
		expect(frame).not.toContain('## This');
		expect(frame).toContain('bold and italic');
		expect(frame).not.toContain('**bold**');
		expect(frame).not.toContain('_italic_');
		expect(frame).toContain('const answer = 42;');
		expect(frame).not.toContain('```');
		expect(frame).toContain('Authoritative final text.');
		releases.at(-1)!.resolve();
		await waitFor(() => !app.conversation.running);
		expect(app.transcript.findDescendantById('live-output')).toBe(live);
		expect(app.transcript.getChildren().filter((node) => node.id === finalNode.id)).toEqual([
			finalNode,
		]);
	} finally {
		for (const release of releases) release.resolve();
		await app.shutdown();
		highlight.mockRestore();
		await parser.destroy();
		await rm(directory, { recursive: true, force: true });
	}
});

test('long history uses native sticky scrolling; upward scroll stays put during output and bottom resumes follow', async () => {
	const ui = await setup();
	try {
		for (let index = 0; index < 100; index++)
			ui.runtime.complete(ui.app.conversation.sessionId, `History line ${index}`);
		await settle(ui);
		expect(ui.captureCharFrame()).toContain('History line 99');
		ui.mockInput.pressKey('\u001b[5~');
		await settle(ui);
		const top = ui.app.transcript.scrollTop;
		expect(top).toBeLessThan(ui.app.transcript.scrollHeight - ui.app.transcript.viewport.height);
		ui.runtime.complete(ui.app.conversation.sessionId, 'New output while reading above');
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(top);
		expect(ui.captureCharFrame()).not.toContain('New output while reading above');
		ui.mockInput.pressKey('END', { ctrl: true });
		await settle(ui);
		ui.runtime.complete(ui.app.conversation.sessionId, 'Output after bottom-follow resumes');
		await settle(ui);
		expect(ui.captureCharFrame()).toContain('Output after bottom-follow resumes');
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		await ui.app.shutdown();
	}
});

test('resize remains usable in conversation, model/session picker and approval; cleanup detaches resources', async () => {
	const ui = await setup();
	try {
		ui.resize(32, 12);
		await settle(ui);
		expect(ui.app.composer.width).toBeGreaterThan(0);
		for (const key of ['F2', 'F3']) {
			ui.mockInput.pressKey(key);
			await settle(ui);
			ui.resize(26, 10);
			await settle(ui);
			expect(ui.captureCharFrame()).toContain('Esc');
			ui.mockInput.pressEscape();
			expect(ui.app.composer.focused).toBe(true);
		}
		const approval = ui.runtime.approval(
			{
				sessionId: ui.app.conversation.sessionId,
				toolCallId: asToolCallId('resize'),
				toolName: 'edit_file',
				toolInput: { path: 'cache.ts' },
			},
			{},
		);
		ui.resize(30, 12);
		await settle(ui);
		expect(ui.captureCharFrame()).toContain('cache.ts');
		ui.mockInput.pressEscape();
		expect(await approval).toBe(false);
		await ui.app.shutdown();
		expect(ui.runtime.listeners.size).toBe(0);
		expect(ui.renderer.isDestroyed).toBe(true);
		expect(
			await ui.runtime.approval(
				{
					sessionId: ui.app.conversation.sessionId,
					toolCallId: asToolCallId('after'),
					toolName: 'edit_file',
					toolInput: {},
				},
				{},
			),
		).toBe(false);
	} finally {
		await ui.app.shutdown();
	}
});

test('later rounds remain live beside compact tool history and committed rounds appear once', async () => {
	const runtime = new FakeTerminalRuntime();
	const release = createDeferred<void>();
	runtime.script = async function* (input) {
		yield { contentDelta: 'I will inspect the cache.' };
		runtime.commit(
			assistantToolCallsCompletedEvent({
				sessionId: input.sessionId,
				content: 'I will inspect the cache.',
			}),
		);
		runtime.commit(
			toolCallRequestedEvent({ sessionId: input.sessionId, toolInput: { path: 'cache.ts' } }),
		);
		runtime.commit(toolCallCompletedEvent({ sessionId: input.sessionId }));
		runtime.commit(
			toolCallFailedEvent({
				sessionId: input.sessionId,
				toolCallId: asToolCallId('failed-edit'),
				toolName: 'edit_file',
				error: { message: 'Permission denied' },
			}),
		);
		yield { contentDelta: 'The next round is already visible.' };
		await release.promise;
		runtime.complete(input.sessionId, 'The next round is already visible.');
	};
	const ui = await setup(runtime);
	try {
		await ui.mockInput.typeText('Inspect');
		ui.mockInput.pressEnter();
		await new Promise((resolve) => setTimeout(resolve, 40));
		await settle(ui);
		const frame = ui.captureCharFrame();
		expect(ui.app.conversation.running).toBe(true);
		expect(frame).toContain('The next round is already visible.');
		expect(frame).toContain('• Read file · cache.ts');
		expect(frame).toContain('× Edit file · Permission denied');
		release.resolve();
		await settle(ui);
		expect(ui.captureCharFrame().match(/I will inspect the cache\./g)).toHaveLength(1);
		expect(ui.captureCharFrame().match(/The next round is already visible\./g)).toHaveLength(1);
	} finally {
		release.resolve();
		await ui.app.shutdown();
	}
});

test.each([
	'error',
	'cancel',
] as const)('native transcript keeps partial output once after %s', async (outcome) => {
	const runtime = new FakeTerminalRuntime();
	const release = createDeferred<void>();
	runtime.script = async function* (input) {
		yield { contentDelta: 'Readable partial output.' };
		await release.promise;
		if (input.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
		throw new Error('Model connection lost');
	};
	const ui = await setup(runtime);
	try {
		await ui.mockInput.typeText('Ask');
		ui.mockInput.pressEnter();
		await settle(ui);
		if (outcome === 'cancel') ui.mockInput.pressEscape();
		release.resolve();
		await settle(ui);
		const frame = ui.captureCharFrame();
		expect(frame.match(/Readable partial output\./g)).toHaveLength(1);
		expect(frame).toContain(
			outcome === 'cancel' ? 'The response was cancelled.' : 'Model connection lost',
		);
		expect(ui.app.conversation.running).toBe(false);
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		release.resolve();
		await ui.app.shutdown();
	}
});

test('legacy durable history without model metadata renders prose and orphan tool results', async () => {
	const runtime = new FakeTerminalRuntime();
	const sessionId = asSessionId('legacy');
	runtime.events.set(sessionId, [
		promptSubmittedEvent({ sessionId, prompt: 'Legacy prompt' }),
		toolCallCompletedEvent({ sessionId, toolName: 'read_file' }),
		assistantMessageCompletedEvent({ sessionId, content: 'Legacy answer with code.' }),
	]);
	const ui = await setup(runtime);
	try {
		await ui.app.conversation.selectSession(sessionId);
		await settle(ui);
		const frame = ui.captureCharFrame();
		expect(frame).toContain('› Legacy prompt');
		expect(frame).toContain('• Read file');
		expect(frame).toContain('Legacy answer with code.');
		expect(runtime.switches).toHaveLength(0);
	} finally {
		await ui.app.shutdown();
	}
});

test('model picker failure displays the runtime error and keeps the previous model', async () => {
	const runtime = new FakeTerminalRuntime();
	runtime.switchModel = async () => {
		throw new Error('Unload failed');
	};
	const ui = await setup(runtime);
	try {
		ui.mockInput.pressKey('F2');
		await settle(ui);
		ui.mockInput.pressArrow('down');
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
		expect(ui.captureCharFrame()).toContain('Unload failed');
		expect(ui.app.composer.focused).toBe(false);
		ui.mockInput.pressEscape();
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		await ui.app.shutdown();
	}
});

test('session picker detaches active work and late old output cannot replace the selected transcript', async () => {
	const runtime = new FakeTerminalRuntime();
	const release = createDeferred<void>();
	const saved = asSessionId('saved');
	runtime.events.set(saved, [
		assistantMessageCompletedEvent({ sessionId: saved, content: 'Selected durable history.' }),
	]);
	runtime.script = async function* (input) {
		yield { contentDelta: 'Old partial' };
		await release.promise;
		runtime.complete(input.sessionId, 'Late old answer');
		yield { contentDelta: 'Late old delta' };
	};
	const ui = await setup(runtime);
	try {
		await ui.mockInput.typeText('Start');
		ui.mockInput.pressEnter();
		await settle(ui);
		ui.mockInput.pressKey('F3');
		await settle(ui);
		ui.mockInput.pressArrow('down');
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(ui.runtime.turns[0]?.signal?.aborted).toBe(true);
		release.resolve();
		await settle(ui);
		expect(ui.app.conversation.sessionId).toBe(saved);
		expect(ui.captureCharFrame()).toContain('Selected durable history.');
		expect(ui.captureCharFrame()).not.toContain('Late old');
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		release.resolve();
		await ui.app.shutdown();
	}
});

test('Ctrl+C during pending approval rejects the request and destroys the renderer exactly once', async () => {
	const ui = await setup();
	const request = {
		sessionId: ui.app.conversation.sessionId,
		toolCallId: asToolCallId('exit-approval'),
		toolName: 'edit_file',
		toolInput: { path: 'cache.ts' },
	};
	const rejected = ui.runtime.approval(request, {}).catch((error: unknown) => error);
	ui.mockInput.pressKey('c', { ctrl: true });
	await ui.app.closed;
	expect(await rejected).toHaveProperty('name', 'AbortError');
	expect(ui.renderer.isDestroyed).toBe(true);
	expect(ui.runtime.listeners.size).toBe(0);
	await ui.app.shutdown();
});

test.each([
	'sessions',
	'models',
] as const)('shutdown awaits pending %s picker reads while fencing late results', async (kind) => {
	const runtime = new FakeTerminalRuntime();
	const release = createDeferred<void>();
	const started = createDeferred<void>();
	let signal: AbortSignal | undefined;
	if (kind === 'sessions') {
		runtime.events.set(asSessionId('saved'), []);
		runtime.readSessionPreviewEvents = async () => {
			started.resolve();
			await release.promise;
			return [];
		};
	} else {
		runtime.listModels = async (request?: AbortSignal) => {
			signal = request;
			started.resolve();
			await release.promise;
			return runtime.models;
		};
	}
	const ui = await setup(runtime);
	try {
		ui.mockInput.pressKey(kind === 'sessions' ? 'F3' : 'F2');
		await started.promise;
		let closed = false;
		const shutdown = ui.app.shutdown().then(() => {
			closed = true;
		});
		await Promise.resolve();
		expect(closed).toBe(false);
		expect(ui.renderer.isDestroyed).toBe(false);
		expect(runtime.listeners.size).toBe(0);
		if (kind === 'models') expect(signal?.aborted).toBe(true);
		release.resolve();
		await shutdown;
		expect(ui.renderer.isDestroyed).toBe(true);
	} finally {
		release.resolve();
		await ui.app.shutdown();
	}
});

test('selection-required header and startup notice direct to the existing picker, and successful selection updates the header', async () => {
	const runtime = new FakeTerminalRuntime();
	runtime.model = undefined;
	const ui = await setup(runtime);
	try {
		expect(ui.captureCharFrame()).toContain('No model selected · /model');
		expect(ui.captureCharFrame()).toContain('Use /model to choose one.');
		ui.mockInput.pressKey('F2');
		await settle(ui);
		expect(ui.captureCharFrame()).toContain(SYNTHETIC_MODEL);
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
		expect(headerContent(ui.app)).toContain(SYNTHETIC_MODEL);
		expect(headerContent(ui.app)).not.toContain('No model selected');
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		await ui.app.shutdown();
	}
});

test('picker refresh detects a disappeared current selection, clears the header and allows recovery', async () => {
	const runtime = new FakeTerminalRuntime();
	const ui = await setup(runtime);
	let refresh = false;
	runtime.listModels = async (_signal?: AbortSignal, options?: { forceRefresh?: boolean }) => {
		refresh = options?.forceRefresh === true;
		runtime.model = undefined;
		return [{ name: 'other-model' }];
	};
	try {
		ui.mockInput.pressKey('F2');
		await settle(ui);
		expect(refresh).toBe(true);
		expect(headerContent(ui.app)).toContain('No model selected');
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(runtime.model).toBe('other-model');
		expect(headerContent(ui.app)).toContain('other-model');
	} finally {
		await ui.app.shutdown();
	}
});

test('failed activation clears an unloaded old selection, shows the real error, and the picker can recover', async () => {
	const runtime = new FakeTerminalRuntime();
	const ui = await setup(runtime);
	let fail = true;
	runtime.switchModel = async (name) => {
		runtime.model = undefined;
		if (fail)
			throw new Error('Model activation failed. Use /model to choose another installed model.');
		runtime.model = name;
		return name;
	};
	try {
		ui.mockInput.pressKey('F2');
		await settle(ui);
		ui.mockInput.pressArrow('down');
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(headerContent(ui.app)).toContain('No model selected');
		expect(ui.app.conversation.history.at(-1)?.content).toContain(
			'Model activation failed. Use /model',
		);
		expect(
			ui.app.conversation.history.some((entry) => entry.content.startsWith('Model switched')),
		).toBe(false);
		expect(ui.app.composer.focused).toBe(false);
		ui.mockInput.pressEscape();
		ui.mockInput.pressKey('F2');
		await settle(ui);
		fail = false;
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
		expect(headerContent(ui.app)).toContain(SYNTHETIC_MODEL);
		expect(ui.app.composer.focused).toBe(true);
	} finally {
		await ui.app.shutdown();
	}
});

test('header cannot claim the candidate during pending activation', async () => {
	const runtime = new FakeTerminalRuntime();
	const pending = createDeferred<string>();
	runtime.switchModel = async (name) => {
		runtime.model = undefined;
		await pending.promise;
		runtime.model = name;
		return name;
	};
	const ui = await setup(runtime);
	try {
		ui.mockInput.pressKey('F2');
		await settle(ui);
		ui.mockInput.pressArrow('down');
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(headerContent(ui.app)).toContain('Switching model…');
		expect(headerContent(ui.app)).not.toContain('other-model');
		pending.resolve('other-model');
		await settle(ui);
		expect(headerContent(ui.app)).toContain('other-model');
	} finally {
		pending.resolve('other-model');
		await ui.app.shutdown();
	}
});

// The full-screen picker covers the header, so inspect its existing text node while open.
const headerContent = (app: TerminalApp): string =>
	(app as unknown as { model: TextRenderable }).model.content.chunks
		.map((chunk) => chunk.text)
		.join('');
