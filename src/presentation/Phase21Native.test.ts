import { afterEach, expect, spyOn, test } from 'bun:test';
import {
	CliRenderEvents,
	TextRenderable,
	type ClipboardWriteResult,
	type Renderable,
} from '@opentui/core';
import { createTestRenderer, MockTreeSitterClient } from '@opentui/core/testing';
import { asSessionId } from '@/domain/Ids';
import { FakeTerminalRuntime } from '@/test-support/FakeTerminalRuntime';
import { createDeferred } from '@/test-support/createDeferred';
import { assistantToolCallsCompletedEvent } from '@/test-support/AgentEventFixtures';
import { TerminalApp } from './TerminalApp';
import type { CopyClipboard } from './clipboard';

const written: ClipboardWriteResult = {
	host: { status: 'written' },
	terminal: { status: 'not-attempted', capability: 'unknown' },
};
const active: Array<{ app: TerminalApp; parser: MockTreeSitterClient }> = [];
afterEach(async () => {
	for (const ui of active.splice(0)) {
		await ui.app.shutdown();
		await ui.parser.destroy();
	}
});

async function setup(runtime = new FakeTerminalRuntime(), kittyKeyboard = true) {
	const native = await createTestRenderer({
		width: 60,
		height: 24,
		screenMode: 'alternate-screen',
		exitOnCtrlC: false,
		exitSignals: [],
		autoFocus: false,
		useThread: false,
		kittyKeyboard,
	});
	const copies: string[] = [];
	const signals: AbortSignal[] = [];
	const clipboard: CopyClipboard = {
		writeText: async (text, options) => {
			copies.push(text);
			signals.push(options.signal!);
			return written;
		},
		dispose: async () => {},
	};
	const parser = new MockTreeSitterClient();
	const app = new TerminalApp(native.renderer, runtime, 'new', parser, clipboard);
	active.push({ app, parser });
	await app.ready;
	const ui = { ...native, app, parser, runtime, clipboard, copies, signals };
	await settle(ui);
	return ui;
}
type UI = Awaited<ReturnType<typeof setup>>;
async function settle(ui: { parser: MockTreeSitterClient; renderOnce: () => Promise<void> }) {
	for (let i = 0; i < 6; i++) {
		ui.parser.resolveAllHighlightOnce();
		await Promise.resolve();
		await ui.renderOnce();
	}
}
const nodes = (root: Renderable): Renderable[] => [root, ...root.getChildren().flatMap(nodes)];
const node = (ui: UI, id: string) => nodes(ui.renderer.root).find((node) => node.id === id)!;
const feedback = (ui: UI) => (node(ui, 'ui-feedback') as TextRenderable).plainText;

test('model list immediately loads, deduplicates refresh, errors use modal, close restores draft and refresh recovers', async () => {
	const ui = await setup();
	const list = createDeferred<void>();
	const signals: AbortSignal[] = [];
	let count = 0;
	ui.runtime.listModels = async (signal?: AbortSignal) => {
		count++;
		signals.push(signal!);
		await list.promise;
		throw new Error('network unavailable');
	};
	await ui.mockInput.typeText('preserved draft');
	ui.mockInput.pressKey('F2');
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Fetching available models…');
	ui.mockInput.pressKey('r');
	ui.mockInput.pressKey('r');
	await settle(ui);
	expect(count).toBe(1);
	list.resolve();
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Could not load models');
	expect(ui.captureCharFrame()).toContain('network unavailable');
	expect(ui.app.conversation.history).toEqual([]);
	ui.mockInput.pressEscape();
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('model-choices');
	ui.runtime.listModels = async () => ui.runtime.models;
	ui.mockInput.pressKey('r');
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('other-model');
	ui.mockInput.pressEscape();
	expect(ui.app.composer.focused).toBe(true);
	expect(ui.app.composer.plainText).toBe('preserved draft');
});

test('closing/reopening a loading model picker suppresses stale success/error and shutdown aborts pending refresh', async () => {
	const ui = await setup();
	const first = createDeferred<void>();
	const second = createDeferred<void>();
	const signals: AbortSignal[] = [];
	let index = 0;
	ui.runtime.listModels = async (signal?: AbortSignal) => {
		signals.push(signal!);
		if (++index === 1) {
			await first.promise;
			throw new Error('obsolete');
		}
		await second.promise;
		return [{ name: 'fresh' }];
	};
	ui.mockInput.pressKey('F2');
	ui.mockInput.pressEscape();
	ui.mockInput.pressKey('F2');
	expect(signals[0]?.aborted).toBe(true);
	first.resolve();
	await settle(ui);
	expect(ui.captureCharFrame()).not.toContain('obsolete');
	second.resolve();
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('fresh');
	const last = createDeferred<void>();
	ui.runtime.listModels = async (signal?: AbortSignal) => {
		signals.push(signal!);
		await last.promise;
		return [];
	};
	ui.mockInput.pressKey('r');
	const close = ui.app.shutdown();
	expect(signals.at(-1)?.aborted).toBe(true);
	last.resolve();
	await close;
	expect(ui.renderer.listenerCount(CliRenderEvents.SELECTION)).toBe(0);
});

for (const mode of [
	'content',
	'native-tools',
	'empty',
	'failure',
	'timeout',
	'session',
	'shutdown',
] as const)
	test(`first-response waiting follows meaningful lifecycle: ${mode}`, async () => {
		const ui = await setup();
		const release = createDeferred<void>();
		const done = createDeferred<void>();
		let input: Parameters<FakeTerminalRuntime['runTurn']>[0] | undefined;
		ui.runtime.script = async function* (turn) {
			input = turn;
			await release.promise;
			if (mode === 'content') yield { contentDelta: 'first response' };
			else if (mode === 'native-tools') turn.onResponseStarted?.();
			else if (mode === 'failure' || mode === 'timeout')
				throw new Error(mode === 'timeout' ? 'Provider timed out' : 'Provider failed');
			if (mode === 'content' || mode === 'native-tools') await done.promise;
		};
		await ui.mockInput.typeText('question');
		ui.mockInput.pressEnter();
		await settle(ui);
		expect(ui.captureCharFrame()).toContain('Waiting for model…');
		expect(ui.app.conversation.waitingForResponse).toBe(true);
		if (mode === 'session') await ui.app.conversation.selectSession(asSessionId('next'));
		if (mode === 'shutdown') {
			const close = ui.app.shutdown();
			release.resolve();
			done.resolve();
			await close;
			expect(ui.app.conversation.waitingForResponse).toBe(false);
			return;
		}
		release.resolve();
		await settle(ui);
		expect(ui.captureCharFrame()).not.toContain('Waiting for model…');
		if (mode === 'content' || mode === 'native-tools')
			expect(ui.captureCharFrame()).toContain('Working…');
		if (mode === 'failure' || mode === 'timeout') {
			expect(node(ui, 'error-dialog')).toBeUndefined();
			expect(ui.app.conversation.history.at(-1)?.kind).toBe('error');
		}
		if (mode === 'session') {
			input?.onResponseStarted?.();
			expect(ui.app.conversation.waitingForResponse).toBe(false);
		}
		done.resolve();
		await settle(ui);
	});

test('durable native tool completion also stops waiting without manufacturing text or new events', async () => {
	const ui = await setup();
	const release = createDeferred<void>();
	ui.runtime.script = async function* () {
		await release.promise;
	};
	await ui.mockInput.typeText('tools');
	ui.mockInput.pressEnter();
	await settle(ui);
	ui.runtime.commit(
		assistantToolCallsCompletedEvent({
			sessionId: ui.app.conversation.sessionId,
			id: ui.runtime.nextId(),
			content: '',
		}),
	);
	await settle(ui);
	expect(ui.app.conversation.waitingForResponse).toBe(false);
	expect(ui.captureCharFrame()).not.toContain('Waiting for model');
	expect(ui.app.conversation.liveContent).toBe('');
	release.resolve();
	await settle(ui);
});

test('long error dialog scrolls at narrow size, survives resize, copies bounded safe details and restores picker focus', async () => {
	const ui = await setup();
	ui.runtime.listModels = async () => {
		throw new Error(
			Array.from({ length: 80 }, (_, i) => `diagnostic ${i}`).join('\n') +
				'\nAPI_KEY=hidden\n\x1b[2Jtail',
		);
	};
	ui.mockInput.pressKey('F2');
	await settle(ui);
	ui.resize(26, 10);
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Could not load');
	ui.resize(26, 6);
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Could not load');
	expect(ui.captureSpans().rows).toBe(6);
	ui.resize(26, 10);
	await settle(ui);
	const scroll = node(ui, 'error-details-scroll') as import('@opentui/core').ScrollBoxRenderable;
	ui.mockInput.pressKey('END');
	await settle(ui);
	expect(scroll.scrollTop).toBeGreaterThan(0);
	expect(ui.captureCharFrame()).toContain('tail');
	ui.resize(48, 14);
	await settle(ui);
	ui.mockInput.pressKey('c');
	await settle(ui);
	expect(ui.copies[0]).toContain('diagnostic 79');
	expect(ui.copies[0]).toContain('[redacted]');
	expect(ui.copies[0]).not.toContain('hidden');
	expect(ui.copies[0]).not.toContain('\x1b');
	expect(ui.captureCharFrame()).toContain('Copied to clipboard');
	ui.mockInput.pressEnter();
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('model-choices');
	ui.mockInput.pressEscape();
	expect(ui.app.composer.focused).toBe(true);
});

test('error action Tab/Enter copies, reports clipboard failure inside dialog, prevents draft leakage and preserves first duplicate', async () => {
	const ui = await setup();
	await ui.mockInput.typeText('draft');
	ui.runtime.listModels = async () => {
		throw new Error('first failure');
	};
	ui.mockInput.pressKey('F2');
	await settle(ui);
	const dialog = node(ui, 'error-dialog');
	ui.runtime.switchModel = async () => {
		throw new Error('second failure');
	};
	await ui.app.conversation.switchModel('other');
	await settle(ui);
	expect(node(ui, 'error-dialog')).toBe(dialog);
	expect(ui.captureCharFrame()).not.toContain('second failure');
	const write = spyOn(ui.clipboard, 'writeText').mockRejectedValue(new Error('copy refused'));
	ui.mockInput.pressTab();
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('copy refused');
	await ui.mockInput.typeText('zzz');
	expect(ui.app.composer.plainText).toBe('draft');
	ui.mockInput.pressEscape();
	ui.mockInput.pressEscape();
	expect(ui.app.composer.focused).toBe(true);
	write.mockRestore();
});

test('expected model-list cancellation is silent and equivalent session-list failure reuses error dialog', async () => {
	const ui = await setup();
	ui.runtime.listModels = async () => {
		throw new DOMException('Cancelled', 'AbortError');
	};
	ui.mockInput.pressKey('F2');
	await settle(ui);
	expect(node(ui, 'error-dialog')).toBeUndefined();
	ui.mockInput.pressEscape();
	ui.runtime.listSessions = async () => {
		throw new Error('session storage unavailable');
	};
	ui.mockInput.pressKey('F3');
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Could not load sessions');
	ui.mockInput.pressEnter();
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('session-choices');
});

test('late first-response observation from a replaced turn cannot hide the new turn waiting state', async () => {
	const ui = await setup();
	const release = createDeferred<void>();
	ui.runtime.script = async function* () {
		await release.promise;
	};
	ui.app.conversation.submit('old question');
	await settle(ui);
	await ui.app.conversation.selectSession(asSessionId('new'));
	ui.app.conversation.submit('new question');
	await settle(ui);
	ui.runtime.turns[0]?.onResponseStarted?.();
	expect(ui.app.conversation.waitingForResponse).toBe(true);
	ui.runtime.turns[1]?.onResponseStarted?.();
	expect(ui.app.conversation.waitingForResponse).toBe(false);
	release.resolve();
	await settle(ui);
});

test('explicit error-detail feedback expires and shutdown clears its timer and clipboard ownership', async () => {
	const ui = await setup();
	ui.runtime.listModels = async () => {
		throw new Error('details to copy');
	};
	ui.mockInput.pressKey('F2');
	await settle(ui);
	const timers = spyOn(globalThis, 'setTimeout');
	const clears = spyOn(globalThis, 'clearTimeout');
	const dispose = spyOn(ui.clipboard, 'dispose');
	try {
		ui.mockInput.pressKey('c');
		await settle(ui);
		const first = timers.mock.calls.findIndex((args) => args[1] === 3000);
		expect(first).toBeGreaterThanOrEqual(0);
		const handle = timers.mock.results[first]?.value as ReturnType<typeof setTimeout>;
		const callback = timers.mock.calls[first]?.[0] as () => void;
		clearTimeout(handle);
		callback();
		expect(feedback(ui)).toBe('');
		ui.mockInput.pressKey('c');
		await settle(ui);
		const lastIndex = timers.mock.calls.findLastIndex((args) => args[1] === 3000);
		const last = timers.mock.results[lastIndex]?.value;
		await ui.app.shutdown();
		expect(clears.mock.calls.some((args) => args[0] === last)).toBe(true);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(ui.renderer.useMouse).toBe(false);
	} finally {
		timers.mockRestore();
		clears.mockRestore();
		dispose.mockRestore();
	}
});

test('renderer destruction aborts an owned details clipboard request and fences late success', async () => {
	const ui = await setup();
	const pending = createDeferred<ClipboardWriteResult>();
	ui.runtime.listModels = async () => {
		throw new Error('shutdown details');
	};
	ui.mockInput.pressKey('F2');
	await settle(ui);
	let signal: AbortSignal | undefined;
	const write = spyOn(ui.clipboard, 'writeText').mockImplementation(async (_text, options) => {
		signal = options.signal;
		return pending.promise;
	});
	ui.mockInput.pressKey('c');
	ui.renderer.destroy();
	expect(signal?.aborted).toBe(true);
	pending.resolve(written);
	await ui.app.closed;
	expect(ui.renderer.useMouse).toBe(false);
	write.mockRestore();
});
