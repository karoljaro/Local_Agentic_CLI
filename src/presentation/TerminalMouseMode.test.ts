import { afterEach, expect, spyOn, test } from 'bun:test';
import {
	TextRenderable,
	resolveRenderLib,
	type KeyEvent,
	type Renderable,
	type SelectRenderable,
	type ScrollBoxRenderable,
} from '@opentui/core';
import { createTestRenderer, MockTreeSitterClient } from '@opentui/core/testing';
import { asToolCallId } from '@/domain/Ids';
import { createDeferred } from '@/test-support/createDeferred';
import { FakeTerminalRuntime } from '@/test-support/FakeTerminalRuntime';
import { TerminalApp } from './TerminalApp';
import type { CopyClipboard } from './clipboard';

const active: Array<{ app: TerminalApp; parser: MockTreeSitterClient }> = [];
afterEach(async () => {
	for (const ui of active.splice(0)) {
		await ui.app.shutdown();
		await ui.parser.destroy();
	}
});
async function setup(
	options: {
		runtime?: FakeTerminalRuntime;
		initialMode?: 'new' | 'resume';
		kittyKeyboard?: boolean;
		otherModifiersMode?: boolean;
		useMouse?: boolean;
	} = {},
) {
	const runtime = options.runtime ?? new FakeTerminalRuntime();
	const native = await createTestRenderer({
		width: 70,
		height: 24,
		screenMode: 'alternate-screen',
		useThread: false,
		exitOnCtrlC: false,
		exitSignals: [],
		autoFocus: false,
		useMouse: options.useMouse ?? true,
		kittyKeyboard: options.kittyKeyboard ?? true,
		otherModifiersMode: options.otherModifiersMode ?? false,
	});
	const copies: string[] = [];
	const keys: Array<Pick<KeyEvent, 'name' | 'ctrl' | 'shift' | 'source'>> = [];
	native.renderer.keyInput.on('keypress', (key) =>
		keys.push({ name: key.name, ctrl: key.ctrl, shift: key.shift, source: key.source }),
	);
	const clipboard: CopyClipboard = {
		writeText: async (text) => {
			copies.push(text);
			return {
				host: { status: 'written' },
				terminal: { status: 'not-attempted', capability: 'unknown' },
			};
		},
		dispose: async () => {},
	};
	const parser = new MockTreeSitterClient();
	const app = new TerminalApp(
		native.renderer,
		runtime,
		options.initialMode ?? 'new',
		parser,
		clipboard,
	);
	active.push({ app, parser });
	await app.ready;
	const ui = { ...native, app, parser, runtime, clipboard, copies, keys };
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
const node = (ui: UI, id: string) => nodes(ui.renderer.root).find((child) => child.id === id)!;

test('chat enables native reporting even on an existing mouse-disabled renderer; copying stays terminal-owned', async () => {
	const enable = spyOn(resolveRenderLib(), 'enableMouse');
	try {
		const ui = await setup({ useMouse: false });
		expect(enable).toHaveBeenCalled();
		expect(ui.renderer.useMouse).toBe(true);
		ui.runtime.complete(ui.app.conversation.sessionId, 'Hold Shift to select in Ptyxis');
		await settle(ui);
		expect(ui.renderer.hasSelection).toBe(false);
		expect(ui.app.composer.focused).toBe(true);
		expect(ui.app.composer.plainText).toBe('');
		expect(ui.copies).toEqual([]);
		expect(ui.captureCharFrame()).toContain('Hold Shift to select in Ptyxis');
	} finally {
		enable.mockRestore();
	}
});

for (const initialMode of ['new', 'resume'] as const)
	test(`native mouse API transitions around model/session views (startup=${initialMode})`, async () => {
		const enable = spyOn(resolveRenderLib(), 'enableMouse');
		const disable = spyOn(resolveRenderLib(), 'disableMouse');
		try {
			const ui = await setup({ initialMode });
			if (initialMode === 'resume') {
				expect(ui.renderer.useMouse).toBe(true);
				ui.mockInput.pressEscape();
			}
			expect(ui.renderer.useMouse).toBe(true);
			await ui.mockInput.typeText('preserved draft');
			for (const key of ['F2', 'F3']) {
				ui.mockInput.pressKey(key);
				await settle(ui);
				expect(ui.renderer.useMouse).toBe(true);
				expect(enable).toHaveBeenCalled();
				const title = nodes(ui.renderer.root).find(
					(child) =>
						child instanceof TextRenderable &&
						child.plainText === (key === 'F2' ? 'Choose a model' : 'Resume a session'),
				) as TextRenderable;
				await ui.mockMouse.drag(title.x, title.y, title.x + title.width - 1, title.y);
				expect(ui.renderer.hasSelection).toBe(true);
				ui.mockInput.pressEscape();
				await settle(ui);
				expect(ui.renderer.useMouse).toBe(true);
				expect(ui.renderer.hasSelection).toBe(false);
				expect(disable).toHaveBeenCalled();
				expect(ui.app.composer.focused).toBe(true);
				expect(ui.app.composer.plainText).toBe('preserved draft');
			}
		} finally {
			enable.mockRestore();
			disable.mockRestore();
		}
	});

test('model option wheel/click applies the selection then returns to interactive chat', async () => {
	const ui = await setup();
	ui.mockInput.pressKey('F2');
	await settle(ui);
	const choices = node(ui, 'model-choices') as SelectRenderable;
	await ui.mockMouse.scroll(choices.x + 3, choices.y, 'down');
	expect(choices.getSelectedIndex()).toBe(1);
	await ui.mockMouse.click(choices.x + 3, choices.y + 1);
	await settle(ui);
	expect(ui.runtime.getModelName()).toBe('other-model');
	expect(ui.renderer.useMouse).toBe(true);
	expect(ui.app.composer.focused).toBe(true);
	ui.mockInput.pressKey('F3');
	await settle(ui);
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.renderer.useMouse).toBe(true);
	expect(ui.app.composer.focused).toBe(true);
});

test('nested error dialog preserves interactive picker mouse mode; details wheel/click works and final closure restores chat', async () => {
	const ui = await setup();
	ui.runtime.listModels = async () => {
		throw new Error(Array.from({ length: 70 }, (_, i) => `detail ${i}`).join('\n'));
	};
	ui.mockInput.pressKey('F2');
	await settle(ui);
	expect(ui.renderer.useMouse).toBe(true);
	const details = node(ui, 'error-details-scroll') as ScrollBoxRenderable;
	await ui.mockMouse.scroll(details.x + 4, details.y + 2, 'down');
	await settle(ui);
	expect(details.scrollTop).toBeGreaterThan(0);
	const actions = node(ui, 'error-actions');
	await ui.mockMouse.click(actions.x + 4, actions.y + 1);
	await settle(ui);
	expect(ui.copies[0]).toContain('detail 69');
	await ui.mockMouse.click(actions.x + 4, actions.y);
	await settle(ui);
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('model-choices');
	expect(ui.renderer.useMouse).toBe(true);
	ui.mockInput.pressEscape();
	expect(ui.renderer.useMouse).toBe(true);
	expect(ui.app.composer.focused).toBe(true);
});

test('error directly over chat retains reporting and restores chat focus on close', async () => {
	const ui = await setup();
	ui.runtime.switchModel = async () => {
		throw new Error('could not apply selection');
	};
	await ui.mockInput.typeText('/model other-model');
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.renderer.useMouse).toBe(true);
	expect(node(ui, 'error-dialog')).toBeDefined();
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.renderer.useMouse).toBe(true);
	expect(ui.app.composer.focused).toBe(true);
});

for (const action of ['deny', 'abort'] as const)
	test(`approval retains mouse input and restores interactive chat after ${action}`, async () => {
		const ui = await setup();
		const controller = new AbortController();
		const decision = ui.runtime.approval(
			{
				sessionId: ui.app.conversation.sessionId,
				toolCallId: asToolCallId('mouse-approval'),
				toolName: 'create_file',
				toolInput: { path: 'example.ts' },
			},
			{ signal: controller.signal },
		);
		const result = decision.then(
			(allowed) => allowed,
			(error: Error) => error.name,
		);
		await settle(ui);
		expect(ui.renderer.useMouse).toBe(true);
		const target = node(ui, 'approval-choices');
		const mouse = spyOn(target, 'processMouseEvent');
		await ui.mockMouse.click(target.x + 3, target.y);
		expect(mouse).toHaveBeenCalled();
		mouse.mockRestore();
		if (action === 'abort') controller.abort();
		else ui.mockInput.pressEscape();
		expect(await result).toBe(action === 'abort' ? 'AbortError' : false);
		expect(ui.renderer.useMouse).toBe(true);
		expect(ui.app.composer.focused).toBe(true);
	});

test('Workspace Changes owns mouse scrolling until returning to chat; normal chat keeps keyboard history navigation', async () => {
	const ui = await setup();
	for (let i = 0; i < 35; i++)
		ui.runtime.complete(ui.app.conversation.sessionId, `chat message ${i}`);
	await settle(ui);
	const bottom = ui.app.transcript.scrollTop;
	await ui.mockMouse.scroll(10, 8, 'up');
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBeLessThan(bottom);
	ui.mockInput.pressKey('\x1b[5~');
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBeLessThan(bottom);
	ui.mockInput.pressKey('HOME', { ctrl: true });
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBe(0);
	ui.mockInput.pressKey('END', { ctrl: true });
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBeGreaterThan(0);
	ui.runtime.workspaceChanges = {
		status: async () => ({
			entries: [{ path: 'file.ts', staged: 'M', unstaged: null, untracked: false }],
			truncated: false,
		}),
		diff: async () => ({
			text: Array.from({ length: 90 }, (_, i) => `+line ${i}`).join('\n'),
			truncated: false,
		}),
	};
	await ui.mockInput.typeText('/changes');
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.renderer.useMouse).toBe(true);
	ui.mockInput.pressEnter();
	await settle(ui);
	const diff = node(ui, 'workspace-diff') as ScrollBoxRenderable;
	await ui.mockMouse.scroll(diff.x + 4, diff.y + 2, 'down');
	await settle(ui);
	expect(diff.scrollTop).toBeGreaterThan(0);
	ui.mockInput.pressEscape();
	expect(ui.renderer.useMouse).toBe(true);
	ui.mockInput.pressEscape();
	expect(ui.renderer.useMouse).toBe(true);
	await ui.mockInput.typeText('first');
	ui.mockInput.pressEnter({ shift: true });
	await ui.mockInput.typeText('second');
	ui.mockInput.pressArrow('up');
	ui.mockInput.pressKey('HOME');
	await ui.mockInput.typeText('edited ');
	expect(ui.app.composer.plainText).toBe('edited first\nsecond');
});

for (const protocol of ['kitty', 'modify-other-keys'] as const)
	test(`distinct Ctrl+Shift+C (${protocol}) is consumed without copy/cancel/exit, including uppercase normalization`, async () => {
		const ui = await setup({
			kittyKeyboard: protocol === 'kitty',
			otherModifiersMode: protocol === 'modify-other-keys',
		});
		await ui.mockInput.typeText('draft');
		for (const key of ['c', 'C']) {
			ui.mockInput.pressKey(key, { ctrl: true, shift: true });
			await settle(ui);
			expect(ui.keys.at(-1)?.ctrl).toBe(true);
			expect(ui.keys.at(-1)?.shift).toBe(true);
			expect(ui.renderer.isDestroyed).toBe(false);
			expect(ui.app.composer.plainText).toBe('draft');
			expect(ui.copies).toEqual([]);
			expect(ui.runtime.turns).toEqual([]);
		}
		ui.runtime.listModels = async () => {
			throw new Error('copy shortcut stays terminal-owned');
		};
		ui.mockInput.pressKey('F2');
		await settle(ui);
		ui.mockInput.pressKey('c', { ctrl: true, shift: true });
		await settle(ui);
		expect(ui.copies).toEqual([]);
		expect(node(ui, 'error-dialog')).toBeDefined();
		expect(ui.renderer.useMouse).toBe(true);
	});

test('ordinary Ctrl+C cancels active work and exits idle; indistinguishable legacy bytes retain that policy', async () => {
	const ui = await setup();
	const release = createDeferred<void>();
	ui.runtime.script = async function* (input) {
		await Promise.race([
			release.promise,
			new Promise<void>((resolve) =>
				input.signal?.addEventListener('abort', () => resolve(), { once: true }),
			),
		]);
		if (input.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
	};
	await ui.mockInput.typeText('question');
	ui.mockInput.pressEnter();
	await settle(ui);
	ui.mockInput.pressKey('c', { ctrl: true, shift: true });
	expect(ui.runtime.turns[0]?.signal?.aborted).toBe(false);
	ui.mockInput.pressKey('c', { ctrl: true });
	await settle(ui);
	expect(ui.runtime.turns[0]?.signal?.aborted).toBe(true);
	expect(ui.renderer.isDestroyed).toBe(false);
	ui.mockInput.pressKey('c', { ctrl: true });
	await ui.app.closed;
	expect(ui.renderer.isDestroyed).toBe(true);
	release.resolve();
	const legacy = await setup({ kittyKeyboard: false });
	legacy.mockInput.pressKey('c', { ctrl: true, shift: true });
	await legacy.app.closed;
	expect(legacy.keys.at(-1)).toMatchObject({ name: 'c', ctrl: true, shift: false, source: 'raw' });
	expect(legacy.renderer.isDestroyed).toBe(true);
	expect(legacy.copies).toEqual([]);
});

test('closing a fetching modal restores interactive chat immediately; late events and shutdown cannot reenable reporting', async () => {
	const ui = await setup();
	const pending = createDeferred<void>();
	let signal: AbortSignal | undefined;
	ui.runtime.listModels = async (request?: AbortSignal) => {
		signal = request;
		await pending.promise;
		throw new Error('late failure');
	};
	ui.mockInput.pressKey('F2');
	expect(ui.renderer.useMouse).toBe(true);
	ui.mockInput.pressEscape();
	expect(ui.renderer.useMouse).toBe(true);
	expect(signal?.aborted).toBe(true);
	pending.resolve();
	await settle(ui);
	expect(node(ui, 'error-dialog')).toBeUndefined();
	expect(ui.renderer.useMouse).toBe(true);
	ui.runtime.listModels = async () => ui.runtime.models;
	ui.mockInput.pressKey('F2');
	await settle(ui);
	expect(ui.renderer.useMouse).toBe(true);
	const enable = spyOn(resolveRenderLib(), 'enableMouse');
	try {
		await ui.app.shutdown();
		expect(ui.renderer.useMouse).toBe(false);
		expect(enable).not.toHaveBeenCalled();
		expect(ui.renderer.hasSelection).toBe(false);
		ui.mockInput.pressKey('F2');
		expect(ui.renderer.useMouse).toBe(false);
	} finally {
		enable.mockRestore();
	}
});
