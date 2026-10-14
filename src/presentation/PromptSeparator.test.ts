import { afterEach, expect, test } from 'bun:test';
import { BoxRenderable, MarkdownRenderable, RGBA, type Renderable } from '@opentui/core';
import { createTestRenderer, MockTreeSitterClient } from '@opentui/core/testing';
import type { AgentEvent } from '@/domain/AgentEvent';
import { asSessionId } from '@/domain/Ids';
import {
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
	toolCallRequestedEvent,
	toolCallStartedEvent,
} from '@/test-support/AgentEventFixtures';
import { createDeferred } from '@/test-support/createDeferred';
import { FakeTerminalRuntime } from '@/test-support/FakeTerminalRuntime';
import { TerminalApp } from './TerminalApp';

// Input and highlighting are fixtures; layout, hit testing and scrolling use the native renderer.
const active: { app: TerminalApp; parser: MockTreeSitterClient; release: (() => void)[] }[] = [];
afterEach(async () => {
	for (const ui of active.splice(0)) {
		for (const release of ui.release) release();
		await ui.app.shutdown();
		await ui.parser.destroy();
	}
});

async function setup(width = 80, height = 40, runtime = new FakeTerminalRuntime()) {
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
	const parser = new MockTreeSitterClient();
	const copies: string[] = [];
	const app = new TerminalApp(native.renderer, runtime, 'new', parser, {
		writeText: async (text) => {
			copies.push(text);
			throw new Error('Prompt separators must not write the clipboard');
		},
		dispose: async () => {},
	});
	const release: (() => void)[] = [];
	active.push({ app, parser, release });
	await app.ready;
	const ui = { ...native, app, parser, runtime, release, copies };
	await settle(ui);
	return ui;
}
type UI = Awaited<ReturnType<typeof setup>>;

async function settle(ui: UI) {
	for (let pass = 0; pass < 6; pass++) {
		ui.parser.resolveAllHighlightOnce();
		await Promise.resolve();
		await ui.renderOnce();
	}
}

async function waitFor(condition: () => boolean) {
	const deadline = Date.now() + 2000;
	while (!condition()) {
		if (Date.now() >= deadline) throw new Error('Prompt separator condition timed out');
		await Bun.sleep(1);
	}
}

function crop(ui: UI, node: Renderable) {
	return ui
		.captureCharFrame()
		.split('\n')
		.slice(node.y, node.y + node.height)
		.map((row) => row.slice(node.x, node.x + node.width));
}
const transcriptFrame = (ui: UI) => crop(ui, ui.app.transcript.viewport).join('\n');
const separatorRows = (ui: UI) =>
	crop(ui, ui.app.transcript.viewport).filter((row) => /^─+$/.test(row));
const bottom = (ui: UI) => ui.app.transcript.scrollHeight - ui.app.transcript.viewport.height;
const entries = (ui: UI) =>
	ui.app.transcript.getChildren().filter((node) => node.id.startsWith('entry:'));
const borderedEntries = (ui: UI) =>
	entries(ui).filter((node) => node instanceof BoxRenderable && node.border !== false);
const entry = (ui: UI, event: AgentEvent) =>
	ui.app.transcript.findDescendantById(`entry:${event.id}`)!;

test('one muted separator follows the complete multiline prompt; tools and Markdown share the response area', async () => {
	const ui = await setup();
	const sessionId = ui.app.conversation.sessionId;
	const prompt = promptSubmittedEvent({ sessionId, prompt: '# Request\n\n**literal**\nlast line' });
	const tool = toolCallCompletedEvent({ sessionId });
	const answer = assistantMessageCompletedEvent({ sessionId, content: '## Answer\n\n**Done**.' });
	for (const event of [
		prompt,
		toolCallRequestedEvent({ sessionId }),
		toolCallStartedEvent({ sessionId }),
		tool,
		answer,
	])
		ui.runtime.commit(event);
	await settle(ui);
	const user = entry(ui, prompt);
	const rows = crop(ui, user);
	expect(rows.map((row) => row.trimEnd())).toEqual([
		'› # Request',
		'',
		'  **literal**',
		'  last line',
		'─'.repeat(user.width),
	]);
	expect(separatorRows(ui)).toEqual(['─'.repeat(ui.app.transcript.viewport.width)]);
	const separatorY = user.y + user.height - 1;
	const spans = ui
		.captureSpans()
		.lines[separatorY]!.spans.filter((span) => span.text.includes('─'));
	expect(spans.map((span) => span.text).join('')).toBe('─'.repeat(user.width));
	expect(spans.every((span) => span.fg.equals(RGBA.fromHex('#888888')))).toBe(true);
	expect(entry(ui, tool).y).toBe(separatorY + 1);
	expect(entry(ui, answer).y).toBe(entry(ui, tool).y + entry(ui, tool).height + 1);
	expect(entry(ui, answer).getChildren()[0]).toBeInstanceOf(MarkdownRenderable);
	expect(transcriptFrame(ui)).toContain('• Read file · README.md');
	expect(transcriptFrame(ui)).toContain('**Done**.');
	expect(transcriptFrame(ui)).not.toMatch(/\b(User|Assistant|Model):/);
	expect(borderedEntries(ui).map((node) => node.id)).toEqual([user.id]);
	expect(ui.app.conversation.history.map((item) => item.kind)).toEqual([
		'user',
		'tool',
		'assistant',
	]);
	expect(ui.runtime.events.get(sessionId)![0]).toEqual(prompt);
});

test('stream fragments, tool rounds and duplicate completion keep one stable prompt separator', async () => {
	const ui = await setup();
	const fragments = ['#', ' Heading\n\n', '**', 'bold', '**'];
	const received = fragments.map(() => createDeferred<void>());
	const releases = fragments.map(() => createDeferred<void>());
	const finalReceived = createDeferred<void>();
	const finish = createDeferred<void>();
	ui.release.push(...releases.map((release) => () => release.resolve()), () => finish.resolve());
	ui.runtime.script = async function* (input) {
		for (const [index, contentDelta] of fragments.entries()) {
			yield { contentDelta };
			received[index]!.resolve();
			await releases[index]!.promise;
		}
		ui.runtime.commit(
			assistantToolCallsCompletedEvent({ sessionId: input.sessionId, content: fragments.join('') }),
		);
		ui.runtime.commit(toolCallRequestedEvent({ sessionId: input.sessionId }));
		ui.runtime.commit(toolCallStartedEvent({ sessionId: input.sessionId }));
		ui.runtime.commit(toolCallCompletedEvent({ sessionId: input.sessionId }));
		yield { contentDelta: 'Final **answer**.' };
		finalReceived.resolve();
		await finish.promise;
		ui.runtime.complete(input.sessionId, 'Final **answer**.');
	};
	ui.app.composer.setText('Inspect\nthen answer');
	ui.mockInput.pressEnter();
	await received[0]!.promise;
	const user = entries(ui)[0]!;
	const live = ui.app.transcript.findDescendantById('live-output');
	let content = '';
	for (const [index, fragment] of fragments.entries()) {
		await received[index]!.promise;
		content += fragment;
		await waitFor(() => ui.app.conversation.liveContent === content);
		await settle(ui);
		expect(entries(ui).map((node) => node.id)).toEqual([user.id]);
		expect(entries(ui)[0] === user).toBe(true);
		expect(separatorRows(ui)).toHaveLength(1);
		expect(borderedEntries(ui).map((node) => node.id)).toEqual([user.id]);
		expect(ui.app.transcript.findDescendantById('live-output')).toBe(live);
		expect(crop(ui, user).at(-1)).toBe('─'.repeat(user.width));
		releases[index]!.resolve();
	}
	await finalReceived.promise;
	await waitFor(() => ui.app.conversation.liveContent === 'Final **answer**.');
	await settle(ui);
	expect(ui.app.conversation.history.map((item) => item.kind)).toEqual([
		'user',
		'assistant',
		'tool',
	]);
	expect(separatorRows(ui)).toHaveLength(1);
	expect(borderedEntries(ui).map((node) => node.id)).toEqual([user.id]);
	finish.resolve();
	await waitFor(() => !ui.app.conversation.running);
	const events = ui.runtime.events.get(ui.app.conversation.sessionId)!;
	const snapshot = structuredClone(events);
	for (const event of events) for (const listener of ui.runtime.listeners) listener(event);
	await settle(ui);
	expect(ui.app.conversation.history.map((item) => item.kind)).toEqual([
		'user',
		'assistant',
		'tool',
		'assistant',
	]);
	expect(separatorRows(ui)).toHaveLength(1);
	expect(borderedEntries(ui).map((node) => node.id)).toEqual([user.id]);
	expect(transcriptFrame(ui)).toContain('Final **answer**.');
	expect(ui.app.conversation.liveContent).toBe('');
	expect(ui.runtime.events.get(ui.app.conversation.sessionId)).toEqual(snapshot);
});

test('resumed history, duplicate events and repeated session reconstruction yield one separator per prompt', async () => {
	const ui = await setup();
	const sessionId = asSessionId('saved-separators');
	const prompt = promptSubmittedEvent({ sessionId, prompt: 'Saved prompt\nsecond line' });
	const pending = promptSubmittedEvent({ sessionId, id: ui.runtime.nextId(), prompt: 'Follow up' });
	const saved = [
		prompt,
		prompt,
		assistantToolCallsCompletedEvent({ sessionId, content: 'Inspecting the file.' }),
		toolCallRequestedEvent({ sessionId }),
		toolCallStartedEvent({ sessionId }),
		toolCallCompletedEvent({ sessionId }),
		assistantMessageCompletedEvent({ sessionId, content: 'Saved **answer**.' }),
		pending,
	];
	ui.runtime.events.set(sessionId, saved);
	const snapshot = structuredClone(saved);
	for (let load = 0; load < 3; load++) {
		await ui.app.conversation.selectSession(sessionId);
		for (const event of saved) for (const listener of ui.runtime.listeners) listener(event);
		await settle(ui);
		expect(separatorRows(ui)).toHaveLength(2);
		expect(borderedEntries(ui).map((node) => node.id)).toEqual([
			`entry:${prompt.id}`,
			`entry:${pending.id}`,
		]);
		expect(entries(ui)).toHaveLength(5);
		expect(transcriptFrame(ui).match(/Saved prompt/g)).toHaveLength(1);
		expect(transcriptFrame(ui)).toContain('Saved **answer**.');
		expect(crop(ui, entry(ui, pending)).at(-1)).toBe('─'.repeat(entry(ui, pending).width));
		expect(ui.runtime.events.get(sessionId)).toEqual(snapshot);
		await ui.app.conversation.selectSession(ui.runtime.createSessionId());
		await settle(ui);
		expect(entries(ui)).toHaveLength(0);
		expect(separatorRows(ui)).toEqual([]);
	}
});

for (const width of [26, 12]) {
	test(`wrapped prompts keep the separator below all text and within the viewport at ${width} columns`, async () => {
		const ui = await setup(width);
		const prompt = 'Wrap this long prompt safely\nKeep **literal** Markdown';
		ui.runtime.script = async function* (input) {
			ui.runtime.complete(input.sessionId, '## Result\n\n- first item\n- second item\n\n`ok`');
		};
		ui.app.composer.setText(prompt);
		ui.mockInput.pressEnter();
		await settle(ui);
		const user = entries(ui)[0]!;
		const text = user.getChildren()[1]!;
		expect(crop(ui, text).join('').replace(/\s/g, '')).toBe(prompt.replace(/\s/g, ''));
		expect(crop(ui, user).filter((row) => row.includes('›'))).toHaveLength(1);
		expect(user.y + user.height - 1).toBe(text.y + text.height);
		expect(separatorRows(ui)).toEqual(['─'.repeat(ui.app.transcript.viewport.width)]);
		expect(ui.app.transcript.horizontalScrollBar.visible).toBe(false);
		expect(ui.app.transcript.scrollLeft).toBe(0);
		ui.resize(width + 4, 40);
		await settle(ui);
		expect(borderedEntries(ui).map((node) => node.id)).toEqual([user.id]);
		expect(separatorRows(ui)).toEqual(['─'.repeat(ui.app.transcript.viewport.width)]);
		expect(user.y + user.height - 1).toBe(text.y + text.height);
	});
}

for (const [width, height] of [
	[70, 24],
	[26, 12],
] as const) {
	test(`separated turns preserve native wheel, scrollbar, sticky follow and copy shortcuts (${width}x${height})`, async () => {
		const ui = await setup(width, height);
		const sessionId = asSessionId('scroll-separators');
		const history = Array.from({ length: 40 }, (_, index) => [
			promptSubmittedEvent({
				sessionId,
				id: ui.runtime.nextId(),
				prompt: `History prompt ${index}`,
			}),
			assistantMessageCompletedEvent({
				sessionId,
				id: ui.runtime.nextId(),
				content: `History answer ${index}`,
			}),
		]).flat();
		ui.runtime.events.set(sessionId, history);
		await ui.app.conversation.selectSession(sessionId);
		await settle(ui);
		expect(borderedEntries(ui)).toHaveLength(40);
		expect(ui.app.transcript.scrollTop).toBe(bottom(ui));
		expect(transcriptFrame(ui)).toContain('History answer 39');
		expect(ui.app.transcript.verticalScrollBar.visible).toBe(true);
		expect(ui.app.transcript.horizontalScrollBar.visible).toBe(false);
		ui.mockInput.pressKey('HOME', { ctrl: true });
		await settle(ui);
		const firstPrompt = entry(ui, history[0]!);
		await ui.mockMouse.click(firstPrompt.x + 3, firstPrompt.y + firstPrompt.height - 1);
		ui.mockInput.pressKey('c', { ctrl: true, shift: true });
		await settle(ui);
		expect(ui.renderer.useMouse).toBe(true);
		expect(ui.app.composer.focused).toBe(true);
		expect(ui.runtime.listeners.size).toBe(1);
		expect(ui.copies).toEqual([]);
		await ui.mockMouse.scroll(firstPrompt.x + 3, firstPrompt.y, 'down');
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBeGreaterThan(0);
		const older = ui.app.transcript.scrollTop;
		const frame = transcriptFrame(ui);
		const next = createDeferred<void>();
		const finish = createDeferred<void>();
		ui.release.push(
			() => next.resolve(),
			() => finish.resolve(),
		);
		const first = Array.from({ length: 20 }, (_, index) => `Stream A ${index}\n`).join('');
		const second = Array.from({ length: 20 }, (_, index) => `Stream B ${index}\n`).join('');
		ui.runtime.script = async function* (input) {
			yield { contentDelta: first };
			await next.promise;
			yield { contentDelta: second };
			await finish.promise;
			ui.runtime.complete(input.sessionId, first + second);
		};
		ui.app.composer.setText('Stream the response');
		ui.mockInput.pressEnter();
		await waitFor(() => ui.app.conversation.liveContent === first);
		await settle(ui);
		expect(borderedEntries(ui)).toHaveLength(41);
		expect(ui.app.transcript.scrollTop).toBe(older);
		expect(transcriptFrame(ui)).toBe(frame);
		ui.mockInput.pressKey('END', { ctrl: true });
		await settle(ui);
		next.resolve();
		await waitFor(() => ui.app.conversation.liveContent === first + second);
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(bottom(ui));
		expect(transcriptFrame(ui)).toContain('Stream B 19');
		const viewport = ui.app.transcript.viewport;
		await ui.mockMouse.scroll(viewport.x + 3, viewport.y + 2, 'up');
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBeLessThan(bottom(ui));
		const track = ui.app.transcript.verticalScrollBar.slider;
		await ui.mockMouse.click(track.x, track.y);
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(0);
		const historyFrame = transcriptFrame(ui);
		finish.resolve();
		await waitFor(() => !ui.app.conversation.running);
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(0);
		expect(transcriptFrame(ui)).toBe(historyFrame);
		expect(borderedEntries(ui)).toHaveLength(41);
		ui.resize(width, height - 2);
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(0);
		ui.app.composer.setText('preserved draft');
		ui.mockInput.pressKey('END', { ctrl: true });
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(bottom(ui));
		expect(transcriptFrame(ui)).toContain('Stream B 19');
		await ui.mockMouse.drag(track.x, track.y + track.height - 1, track.x, track.y);
		await settle(ui);
		expect(ui.app.transcript.scrollTop).toBe(0);
		expect(transcriptFrame(ui)).toContain('History prompt 0');
		expect(ui.app.composer.plainText).toBe('preserved draft');
		expect(ui.app.composer.focused).toBe(true);
		expect(ui.copies).toEqual([]);
	});
}
