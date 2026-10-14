import { afterEach, expect, test } from 'bun:test';
import { type ScrollBoxRenderable, type Renderable } from '@opentui/core';
import { createTestRenderer, MockTreeSitterClient } from '@opentui/core/testing';
import { asToolCallId } from '@/domain/Ids';
import { FakeTerminalRuntime } from '@/test-support/FakeTerminalRuntime';
import { createDeferred } from '@/test-support/createDeferred';
import { TerminalApp } from './TerminalApp';

// SGR input is simulated; layout, hit testing, capture and scrolling use the native renderer.
// A real terminal's Shift-selection and clipboard shortcut require a manual check.
const active: { app: TerminalApp; parser: MockTreeSitterClient; release: (() => void)[] }[] = [];
afterEach(async () => {
	for (const ui of active.splice(0)) {
		for (const release of ui.release) release();
		await ui.app.shutdown();
		await ui.parser.destroy();
	}
});

async function setup(width = 70, height = 24) {
	const native = await createTestRenderer({
		width,
		height,
		screenMode: 'alternate-screen',
		useThread: false,
		exitOnCtrlC: false,
		exitSignals: [],
		autoFocus: false,
		kittyKeyboard: true,
	});
	const runtime = new FakeTerminalRuntime();
	const parser = new MockTreeSitterClient();
	const app = new TerminalApp(native.renderer, runtime, 'new', parser, {
		writeText: async () => {
			throw new Error('Chat scrolling must not write the clipboard');
		},
		dispose: async () => {},
	});
	const release: (() => void)[] = [];
	active.push({ app, parser, release });
	await app.ready;
	const ui = { ...native, runtime, parser, app, release };
	await settle(ui);
	return ui;
}
type UI = Awaited<ReturnType<typeof setup>>;

async function settle(ui: UI) {
	for (let i = 0; i < 6; i++) {
		ui.parser.resolveAllHighlightOnce();
		await Promise.resolve();
		await ui.renderOnce();
	}
}
async function history(ui: UI) {
	for (let i = 0; i < 80; i++)
		ui.runtime.complete(ui.app.conversation.sessionId, `History message ${i}`);
	await settle(ui);
}
const bottom = (ui: UI) => ui.app.transcript.scrollHeight - ui.app.transcript.viewport.height;
const historyFrame = (ui: UI) => {
	const view = ui.app.transcript.viewport;
	return ui
		.captureCharFrame()
		.split('\n')
		.slice(view.y, view.y + view.height)
		.map((row) => row.slice(view.x, view.x + view.width))
		.join('\n');
};
async function wheel(ui: UI, direction: 'up' | 'down') {
	const view = ui.app.transcript.viewport;
	await ui.mockMouse.scroll(view.x + 4, view.y + 2, direction);
	await settle(ui);
}

test('chat scrollbar appears for overflowing history; wheel events change the rendered viewport in both directions', async () => {
	const ui = await setup();
	expect(ui.app.transcript.verticalScrollBar.visible).toBe(false);
	await history(ui);
	expect(ui.renderer.useMouse).toBe(true);
	expect(ui.app.transcript.verticalScrollBar.visible).toBe(true);
	expect(ui.app.transcript.horizontalScrollBar.visible).toBe(false);
	expect(ui.app.transcript.scrollTop).toBe(bottom(ui));
	expect(historyFrame(ui)).toContain('History message 79');
	const frame = historyFrame(ui);
	await wheel(ui, 'up');
	const older = ui.app.transcript.scrollTop;
	expect(older).toBeLessThan(bottom(ui));
	expect(historyFrame(ui)).not.toBe(frame);
	expect(ui.app.transcript.content.translateY).toBe(-older);
	await wheel(ui, 'down');
	expect(ui.app.transcript.scrollTop).toBeGreaterThan(older);
	expect(ui.app.composer.focused).toBe(true);
});

for (const [width, height] of [
	[70, 24],
	[32, 12],
]) {
	test(`native scrollbar track clicks and captured thumb drags move chat (${width}x${height})`, async () => {
		const ui = await setup(width, height);
		await history(ui);
		ui.app.composer.setText('preserved draft');
		const track = ui.app.transcript.verticalScrollBar.slider;
		expect(track.x).toBe(ui.app.transcript.viewport.x + ui.app.transcript.viewport.width);
		expect(track.width).toBeGreaterThan(0);
		expect(track.height).toBeGreaterThan(2);
		const thumbColumn = ui
			.captureCharFrame()
			.split('\n')
			.slice(track.y, track.y + track.height)
			.map((row) => row[track.x])
			.join('');
		expect(thumbColumn).toMatch(/[█▀▄]/);
		await ui.mockMouse.click(track.x, track.y);
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(0);
		expect(historyFrame(ui)).toContain('History message 0');
		await ui.mockMouse.click(track.x, track.y + Math.floor(track.height / 2));
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBeGreaterThan(0);
		expect(ui.app.transcript.scrollTop).toBeLessThan(bottom(ui));
		expect(historyFrame(ui)).not.toContain('History message 0');
		ui.mockInput.pressKey('HOME', { ctrl: true });
		await settle(ui);
		await ui.mockMouse.pressDown(track.x, track.y);
		await ui.mockMouse.moveTo(track.x, track.y + 1);
		await settle(ui);
		const moved = ui.app.transcript.scrollTop;
		// Capture must continue when the pointer leaves the scrollbar and after another frame.
		await ui.mockMouse.moveTo(track.x - 5, track.y + track.height + 1);
		await ui.mockMouse.release(track.x - 5, track.y + track.height + 1);
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBeGreaterThan(moved);
		expect(ui.app.transcript.scrollTop).toBe(bottom(ui));
		expect(historyFrame(ui)).toContain('History message 79');
		await ui.mockMouse.drag(track.x, track.y + track.height - 1, track.x, track.y);
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(0);
		expect(historyFrame(ui)).toContain('History message 0');
		expect(ui.app.composer.focused).toBe(true);
		expect(ui.app.composer.plainText).toBe('preserved draft');
		expect(ui.runtime.turns).toEqual([]);
	});
}

test('keyboard pages and ends preserve the composer; wheel-scrolled older messages stay visible across new output and resize', async () => {
	const ui = await setup();
	await history(ui);
	ui.app.composer.setText('draft');
	ui.mockInput.pressKey('\x1b[5~');
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBe(bottom(ui) - ui.app.transcript.viewport.height);
	ui.mockInput.pressKey('\x1b[6~');
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBe(bottom(ui));
	ui.mockInput.pressKey('HOME', { ctrl: true });
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBe(0);
	ui.mockInput.pressKey('END', { ctrl: true });
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBe(bottom(ui));
	await wheel(ui, 'up');
	await wheel(ui, 'up');
	const older = ui.app.transcript.scrollTop;
	const frame = historyFrame(ui);
	ui.runtime.complete(ui.app.conversation.sessionId, 'New message while reading history');
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBe(older);
	expect(historyFrame(ui)).toBe(frame);
	ui.resize(70, 20);
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBe(older);
	expect(historyFrame(ui)).not.toContain('New message while reading history');
	ui.mockInput.pressKey('END', { ctrl: true });
	await settle(ui);
	ui.runtime.complete(ui.app.conversation.sessionId, 'Following the newest output');
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBe(bottom(ui));
	expect(historyFrame(ui)).toContain('Following the newest output');
	expect(ui.app.composer.plainText).toBe('draft');
	expect(ui.app.composer.focused).toBe(true);
});

test('stream growth follows the tail until wheel scrolling up; completing the stream preserves older messages and all scroll controls', async () => {
	const ui = await setup();
	await history(ui);
	const next = createDeferred<void>();
	const finish = createDeferred<void>();
	ui.release.push(
		() => next.resolve(),
		() => finish.resolve(),
	);
	const first = Array.from({ length: 35 }, (_, i) => `Stream A ${i}\n`).join('');
	const second = Array.from({ length: 35 }, (_, i) => `Stream B ${i}\n`).join('');
	ui.runtime.script = async function* (input) {
		yield { contentDelta: first };
		await next.promise;
		yield { contentDelta: second };
		await finish.promise;
		ui.runtime.complete(input.sessionId, first + second);
	};
	ui.app.composer.setText('Stream a long response');
	ui.mockInput.pressEnter();
	await Bun.sleep(45);
	await settle(ui);
	expect(ui.app.conversation.running).toBe(true);
	expect(historyFrame(ui)).toContain('Stream A 34');
	expect(ui.app.transcript.scrollTop).toBe(bottom(ui));
	for (let i = 0; i < 50; i++) await wheel(ui, 'up');
	const older = ui.app.transcript.scrollTop;
	const frame = historyFrame(ui);
	expect(frame).toContain('History message');
	next.resolve();
	await Bun.sleep(45);
	await settle(ui);
	expect(ui.app.conversation.liveContent).toContain('Stream B 34');
	expect(ui.app.transcript.scrollTop).toBe(older);
	expect(historyFrame(ui)).toBe(frame);
	finish.resolve();
	await settle(ui);
	expect(ui.app.conversation.running).toBe(false);
	expect(ui.app.transcript.scrollTop).toBe(older);
	expect(historyFrame(ui)).not.toContain('Stream B 34');
	ui.mockInput.pressKey('END', { ctrl: true });
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBe(bottom(ui));
	expect(historyFrame(ui)).toContain('Stream B 34');
	await wheel(ui, 'up');
	expect(ui.app.transcript.scrollTop).toBeLessThan(bottom(ui));
	const track = ui.app.transcript.verticalScrollBar.slider;
	await ui.mockMouse.click(track.x, track.y);
	await settle(ui);
	expect(ui.app.transcript.scrollTop).toBe(0);
	expect(historyFrame(ui)).toContain('History message 0');
	expect(ui.app.composer.focused).toBe(true);
});

for (const modal of ['model', 'session', 'settings', 'approval', 'error', 'changes'] as const) {
	test(`${modal} owns mouse input while open; closing during a drag restores chat focus, position, wheel and scrollbar`, async () => {
		const ui = await setup();
		await history(ui);
		ui.mockInput.pressKey('HOME', { ctrl: true });
		await settle(ui);
		ui.mockInput.pressKey('\x1b[6~');
		await settle(ui);
		const older = ui.app.transcript.scrollTop;
		const frame = historyFrame(ui);
		let targetId: string;
		if (modal === 'model' || modal === 'session') {
			ui.mockInput.pressKey(modal === 'model' ? 'F2' : 'F3');
			targetId = modal === 'model' ? 'model-choices' : 'session-choices';
		} else if (modal === 'approval') {
			const controller = new AbortController();
			ui.release.push(() => controller.abort());
			void ui.runtime
				.approval(
					{
						sessionId: ui.app.conversation.sessionId,
						toolCallId: asToolCallId('scroll-approval'),
						toolName: 'create_file',
						toolInput: { path: 'example.ts' },
					},
					{ signal: controller.signal },
				)
				.catch(() => {});
			targetId = 'approval-choices';
		} else {
			if (modal === 'error') {
				ui.runtime.switchModel = async () => {
					throw new Error('selection failed');
				};
			} else if (modal === 'changes') {
				ui.runtime.workspaceChanges = {
					status: async () => ({
						entries: [{ path: 'file.ts', staged: 'M', unstaged: null, untracked: false }],
						truncated: false,
					}),
					diff: async () => ({
						text: Array.from({ length: 80 }, (_, i) => `+diff ${i}`).join('\n'),
						truncated: false,
					}),
				};
			}
			ui.app.composer.setText(modal === 'error' ? '/model other-model' : `/${modal}`);
			ui.mockInput.pressEnter();
			targetId =
				modal === 'settings'
					? 'settings-choices'
					: modal === 'error'
						? 'error-actions'
						: 'changed-files';
		}
		await settle(ui);
		expect(ui.renderer.useMouse).toBe(true);
		expect(ui.app.composer.focused).toBe(false);
		if (modal === 'changes') {
			ui.mockInput.pressEnter();
			await settle(ui);
			const diff = ui.renderer.root.findDescendantById('workspace-diff') as ScrollBoxRenderable;
			await ui.mockMouse.scroll(diff.x + 4, diff.y + 2, 'down');
			await settle(ui);
			expect(diff.scrollTop).toBeGreaterThan(0);
			expect(ui.app.transcript.scrollTop).toBe(older);
			ui.mockInput.pressEscape();
			await settle(ui);
		}
		const target = ui.renderer.root.findDescendantById(targetId) as Renderable;
		expect(target).toBeDefined();
		await ui.mockMouse.scroll(target.x + 1, target.y, 'down');
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(older);
		// Leave a live capture on the modal to exercise the public mouse-state reset on close.
		await ui.mockMouse.pressDown(target.x + 1, target.y);
		await ui.mockMouse.moveTo(target.x + 2, target.y);
		await settle(ui);
		ui.mockInput.pressEscape();
		await settle(ui);
		expect(ui.renderer.useMouse).toBe(true);
		expect(ui.app.composer.focused).toBe(true);
		expect(ui.app.transcript.scrollTop).toBe(older);
		expect(historyFrame(ui)).toBe(frame);
		const track = ui.app.transcript.verticalScrollBar.slider;
		await ui.mockMouse.click(track.x, track.y);
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(0);
		expect(historyFrame(ui)).toContain('History message 0');
		await wheel(ui, 'down');
		expect(ui.app.transcript.scrollTop).toBeGreaterThan(0);
		expect(ui.app.composer.focused).toBe(true);
	});
}
