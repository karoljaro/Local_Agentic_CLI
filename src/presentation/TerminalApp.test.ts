import { afterEach, expect, test } from 'bun:test';
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

test('session picker previews without activation; navigation/select resumes durable history and model', async () => {
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
		expect(runtime.switches).toEqual(['saved-model']);
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
		expect(runtime.getModelName()).toBe('test-model');
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
