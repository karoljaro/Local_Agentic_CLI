import { afterEach, expect, test } from 'bun:test';
import { InputRenderable, SelectRenderable, TextRenderable, type Renderable } from '@opentui/core';
import { createTestRenderer, MockTreeSitterClient } from '@opentui/core/testing';
import { SettingsService } from '@/application/services/SettingsService';
import { SETTINGS_DEFAULTS } from '@/domain/UserSettings';
import { FakeTerminalRuntime } from '@/test-support/FakeTerminalRuntime';
import { createDeferred } from '@/test-support/createDeferred';
import { asSessionId } from '@/domain/Ids';
import { TerminalApp } from './TerminalApp';

const active: { app: TerminalApp; parser: MockTreeSitterClient }[] = [];
afterEach(async () => {
	for (const ui of active.splice(0)) {
		await ui.app.shutdown();
		await ui.parser.destroy();
	}
});
async function setup(runtime = new FakeTerminalRuntime(), waitReady = true) {
	const native = await createTestRenderer({
		width: 72,
		height: 24,
		screenMode: 'alternate-screen',
		exitOnCtrlC: false,
		exitSignals: [],
		autoFocus: false,
		useThread: false,
		kittyKeyboard: true,
	});
	const parser = new MockTreeSitterClient();
	const app = new TerminalApp(native.renderer, runtime, 'new', parser, {
		writeText: async () => ({
			host: { status: 'written' },
			terminal: { status: 'not-attempted', capability: 'unknown' },
		}),
		dispose: async () => {},
	});
	active.push({ app, parser });
	if (waitReady) await app.ready;
	const ui = { ...native, app, parser, runtime };
	await settle(ui);
	return ui;
}
type UI = Awaited<ReturnType<typeof setup>>;
async function settle(ui: { parser: MockTreeSitterClient; renderOnce: () => Promise<void> }) {
	for (let i = 0; i < 8; i++) {
		ui.parser.resolveAllHighlightOnce();
		await Promise.resolve();
		await ui.renderOnce();
	}
}
const nodes = (root: Renderable): Renderable[] => [root, ...root.getChildren().flatMap(nodes)];
const node = (ui: UI, id: string) => nodes(ui.renderer.root).find((child) => child.id === id);
const choices = (ui: UI) => node(ui, 'settings-choices') as SelectRenderable;
const details = (ui: UI) => (node(ui, 'settings-details') as TextRenderable).plainText;
async function open(ui: UI) {
	ui.app.composer.setText('/settings');
	ui.mockInput.pressEnter();
	await settle(ui);
}
async function edit(ui: UI, index: number) {
	choices(ui).setSelectedIndex(index);
	ui.mockInput.pressEnter();
	await settle(ui);
}
async function replace(ui: UI, text: string) {
	(node(ui, 'settings-editor') as InputRenderable).value = '';
	await ui.mockInput.typeText(text);
}

test('/settings opens native configuration without model discovery, navigates and restores composer/mouse mode', async () => {
	const ui = await setup();
	let discovery = 0;
	ui.runtime.listModels = async () => {
		discovery++;
		throw new Error('offline');
	};
	expect(ui.renderer.useMouse).toBe(true);
	await open(ui);
	expect(ui.captureCharFrame()).toContain('Settings');
	expect(ui.captureCharFrame()).toContain('http://localhost:11434');
	expect(ui.captureCharFrame()).not.toMatch(/Test Model|Temperature|Theme/);
	expect(discovery).toBe(0);
	expect(ui.renderer.useMouse).toBe(true);
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('settings-choices');
	ui.mockInput.pressArrow('down');
	expect(choices(ui).getSelectedIndex()).toBe(1);
	ui.mockInput.pressKey('END');
	expect(choices(ui).getSelectedIndex()).toBe(4);
	ui.mockInput.pressKey('HOME');
	expect(choices(ui).getSelectedIndex()).toBe(0);
	ui.mockInput.pressEscape();
	expect(ui.app.composer.focused).toBe(true);
	expect(ui.renderer.useMouse).toBe(true);
	expect(ui.runtime.turns).toEqual([]);
	expect(ui.app.conversation.history).toEqual([]);
});
test('endpoint text edits are explicitly saved, show pending restart/effective values, and reopen consistently', async () => {
	const ui = await setup();
	await open(ui);
	await edit(ui, 0);
	expect((node(ui, 'settings-editor') as InputRenderable).value).toBe(
		SETTINGS_DEFAULTS.ollamaBaseUrl,
	);
	await replace(ui, 'https://remote.example/ollama');
	expect(ui.runtime.settingsStore.document).toBeUndefined();
	ui.mockInput.pressEnter();
	await ui.runtime.settings.whenIdle();
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Saved · Restart required');
	expect(details(ui)).toContain('Currently effective: http://localhost:11434');
	expect(details(ui)).toContain('Saved preference: https://remote.example/ollama');
	ui.mockInput.pressEscape();
	await open(ui);
	expect(details(ui)).toContain('https://remote.example/ollama');
});
test('unsafe URL input and numeric/budget errors remain inline, preserving edit and previous value', async () => {
	const ui = await setup();
	await open(ui);
	await edit(ui, 0);
	await replace(ui, 'http://user:password@example.com?secret=yes');
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(details(ui)).toContain('without credentials');
	expect(node(ui, 'error-dialog')).toBeUndefined();
	expect(ui.runtime.settings.getSnapshot().saved.ollamaBaseUrl).toBe(
		SETTINGS_DEFAULTS.ollamaBaseUrl,
	);
	ui.mockInput.pressEscape();
	await edit(ui, 4);
	await replace(ui, '2.3');
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(details(ui)).toContain('positive whole number');
	await replace(ui, '12288');
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(details(ui)).toContain('input tokens');
	expect(ui.runtime.settings.getSnapshot().saved.maxOutputTokens).toBe(4096);
	expect(node(ui, 'settings-editor')).toBeDefined();
});
test('cancel text edit restores list focus and keeps prior preferences', async () => {
	const ui = await setup();
	await open(ui);
	await edit(ui, 0);
	await replace(ui, 'https://unsaved.example');
	ui.mockInput.pressEscape();
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('settings-choices');
	expect(ui.runtime.settingsStore.document).toBeUndefined();
	expect(ui.captureCharFrame()).not.toContain('unsaved.example');
	ui.mockInput.pressEscape();
	expect(ui.renderer.useMouse).toBe(true);
});
test('valid numeric edits/save and selected-setting reset keep the model and other preferences', async () => {
	const ui = await setup();
	await ui.runtime.settings.writeLastSelectedModel('test-model');
	await open(ui);
	await edit(ui, 4);
	await replace(ui, '2048');
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Saved · Next turn');
	expect(ui.runtime.settings.getSnapshot().effective.maxOutputTokens).toBe(2048);
	ui.mockInput.pressKey('r');
	await settle(ui);
	expect((node(ui, 'settings-editor') as InputRenderable).value).toBe('4096');
	expect(ui.runtime.settings.getSnapshot().saved.maxOutputTokens).toBe(2048);
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.runtime.settings.getSnapshot().effective.maxOutputTokens).toBe(4096);
	expect(await ui.runtime.settings.readLastSelectedModel()).toBe('test-model');
});
test('keep alive uses a confirmed selector and model reset restores automatic startup without altering current model', async () => {
	const ui = await setup();
	await ui.runtime.settings.writeLastSelectedModel('test-model');
	await open(ui);
	await edit(ui, 2);
	ui.mockInput.pressArrow('down');
	expect(ui.runtime.settings.getSnapshot().saved.keepAlive).toBe('0');
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.runtime.settings.getSnapshot().effective.keepAlive).toBe('5m');
	expect(ui.captureCharFrame()).toContain('Next provider request');
	choices(ui).setSelectedIndex(1);
	ui.mockInput.pressKey('r');
	await settle(ui);
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.runtime.settings.getSnapshot().saved.lastSelectedModel).toBeNull();
	expect(ui.runtime.getModelName()).toBe('test-model');
	expect(ui.captureCharFrame()).toContain('Restart required');
	expect(details(ui)).toContain('Currently effective: test-model');
});
test('persistence failure uses the existing Error Dialog, restores edit focus and permits retry', async () => {
	const ui = await setup();
	await open(ui);
	await edit(ui, 4);
	await replace(ui, '2048');
	const original = ui.runtime.settingsStore.update.bind(ui.runtime.settingsStore);
	ui.runtime.settingsStore.update = async () => {
		throw new Error('EACCES API_KEY=hidden\x1b[2J');
	};
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Could not save settings');
	expect(ui.captureCharFrame()).not.toContain('hidden');
	expect(ui.runtime.settings.getSnapshot().effective.maxOutputTokens).toBe(4096);
	ui.mockInput.pressEscape();
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('settings-editor');
	ui.runtime.settingsStore.update = original;
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.runtime.settings.getSnapshot().effective.maxOutputTokens).toBe(2048);
	expect(ui.renderer.useMouse).toBe(true);
});
test('startup malformed configuration is reported and cannot be destructively reset', async () => {
	const runtime = new FakeTerminalRuntime();
	runtime.settings = new SettingsService(runtime.settingsStore, {
		problem: 'Malformed settings JSON. Original preserved.',
	});
	const ui = await setup(runtime);
	expect(node(ui, 'error-dialog')).toBeDefined();
	ui.mockInput.pressEscape();
	await open(ui);
	expect(ui.captureCharFrame()).toContain('read-only');
	ui.mockInput.pressKey('r');
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Could not edit settings');
	expect(runtime.settingsStore.document).toBeUndefined();
});
test('overlapping save attempts deduplicate; cancellation keeps edit input and rejects stale write', async () => {
	const ui = await setup();
	await open(ui);
	await edit(ui, 4);
	await replace(ui, '2048');
	const gate = createDeferred<void>();
	let writes = 0;
	let signal: AbortSignal | undefined;
	const original = ui.runtime.settingsStore.update.bind(ui.runtime.settingsStore);
	ui.runtime.settingsStore.update = async (change, request) => {
		writes++;
		signal = request;
		await gate.promise;
		return original(change, request);
	};
	ui.mockInput.pressEnter();
	ui.mockInput.pressEnter();
	ui.mockInput.pressArrow('down');
	await settle(ui);
	expect(writes).toBe(1);
	expect(ui.captureCharFrame()).toContain('Saving settings');
	ui.mockInput.pressEscape();
	expect(signal?.aborted).toBe(true);
	gate.resolve();
	await settle(ui);
	expect(ui.runtime.settings.getSnapshot().saved.maxOutputTokens).toBe(4096);
	expect(node(ui, 'error-dialog')).toBeUndefined();
	expect((node(ui, 'settings-editor') as InputRenderable).value).toBe('2048');
	ui.mockInput.pressEscape();
	ui.mockInput.pressEscape();
	expect(ui.renderer.useMouse).toBe(true);
});
test('shutdown cancels pending settings save and waits for it without late UI/persistence publication', async () => {
	const ui = await setup();
	await open(ui);
	await edit(ui, 4);
	await replace(ui, '2048');
	const gate = createDeferred<void>();
	let signal: AbortSignal | undefined;
	const original = ui.runtime.settingsStore.update.bind(ui.runtime.settingsStore);
	ui.runtime.settingsStore.update = async (change, request) => {
		signal = request;
		await gate.promise;
		return original(change, request);
	};
	ui.mockInput.pressEnter();
	await settle(ui);
	const closing = ui.app.shutdown();
	expect(signal?.aborted).toBe(true);
	gate.resolve();
	await closing;
	expect(ui.runtime.settingsStore.document).toBeUndefined();
	expect(ui.renderer.useMouse).toBe(false);
});
test('Settings model workflow reuses picker, retains confirmed model while pending, and synchronizes both surfaces', async () => {
	const ui = await setup();
	await ui.runtime.settings.writeLastSelectedModel('test-model');
	await open(ui);
	await edit(ui, 1);
	expect(node(ui, 'model-picker')).toBeDefined();
	const models = node(ui, 'model-choices') as SelectRenderable;
	const gate = createDeferred<void>();
	ui.runtime.switchModel = async (name) => {
		await gate.promise;
		ui.runtime.model = name;
		await ui.runtime.settings.writeLastSelectedModel(name);
		return name;
	};
	models.setSelectedIndex(1);
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Applying model selection');
	expect(ui.runtime.settings.getSnapshot().saved.lastSelectedModel).toBe('test-model');
	gate.resolve();
	await settle(ui);
	expect(node(ui, 'model-picker')).toBeUndefined();
	expect(node(ui, 'settings-view')).toBeDefined();
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('settings-choices');
	expect(details(ui)).toContain('Currently effective: other-model');
	expect(ui.runtime.settings.getSnapshot().saved.lastSelectedModel).toBe('other-model');
	ui.mockInput.pressEscape();
	ui.mockInput.pressKey('F2');
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('other-model · current');
	ui.mockInput.pressEscape();
	await open(ui);
	choices(ui).setSelectedIndex(1);
	expect(details(ui)).toContain('other-model');
});
test('failed activation reconciles actual selection and preserves remembered model; unavailable list is recoverable', async () => {
	const ui = await setup();
	await ui.runtime.settings.writeLastSelectedModel('test-model');
	await open(ui);
	await edit(ui, 1);
	ui.runtime.switchModel = async () => {
		ui.runtime.model = undefined;
		throw new Error('activation failed');
	};
	(node(ui, 'model-choices') as SelectRenderable).setSelectedIndex(1);
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Could not select model');
	expect(ui.runtime.settings.getSnapshot().saved.lastSelectedModel).toBe('test-model');
	ui.mockInput.pressEscape();
	ui.mockInput.pressEscape();
	expect(details(ui)).toContain('None confirmed');
	ui.runtime.listModels = async () => {
		throw new Error('provider offline');
	};
	await edit(ui, 1);
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Could not load models');
	ui.mockInput.pressEscape();
	ui.mockInput.pressEscape();
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('settings-choices');
	expect(ui.renderer.useMouse).toBe(true);
	ui.mockInput.pressEscape();
	expect(ui.renderer.useMouse).toBe(true);
});
test('closing nested model discovery suppresses stale results and restores Settings then interactive chat', async () => {
	const ui = await setup();
	await open(ui);
	const gate = createDeferred<void>();
	let signal: AbortSignal | undefined;
	ui.runtime.listModels = async (request?: AbortSignal) => {
		signal = request;
		await gate.promise;
		throw new Error('obsolete discovery');
	};
	await edit(ui, 1);
	ui.mockInput.pressEscape();
	expect(signal?.aborted).toBe(true);
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('settings-choices');
	ui.mockInput.pressEscape();
	gate.resolve();
	await settle(ui);
	expect(node(ui, 'error-dialog')).toBeUndefined();
	expect(ui.renderer.useMouse).toBe(true);
});
test('Settings opens during pending startup discovery and active generation without cancelling either', async () => {
	const runtime = new FakeTerminalRuntime();
	const discovery = createDeferred<void>();
	runtime.initializeModels = async () => {
		await discovery.promise;
		return runtime.getModelSelection();
	};
	const ui = await setup(runtime, false);
	await open(ui);
	expect(node(ui, 'settings-view')).toBeDefined();
	discovery.resolve();
	await ui.app.ready;
	ui.mockInput.pressEscape();
	const generation = createDeferred<void>();
	let signal: AbortSignal | undefined;
	runtime.script = async function* (input) {
		signal = input.signal;
		await generation.promise;
		yield { contentDelta: 'finished' };
	};
	await ui.mockInput.typeText('question');
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.app.conversation.running).toBe(true);
	await open(ui);
	expect(signal?.aborted).toBe(false);
	ui.mockInput.pressEscape();
	expect(signal?.aborted).toBe(false);
	generation.resolve();
	await settle(ui);
	expect(ui.app.conversation.running).toBe(false);
});
test('unsaved editor input survives session metadata changes and F2/F3 cannot discard it', async () => {
	const ui = await setup();
	await open(ui);
	await edit(ui, 0);
	await replace(ui, 'https://unsaved.example');
	ui.mockInput.pressKey('F2');
	ui.mockInput.pressKey('F3');
	expect(node(ui, 'model-picker')).toBeUndefined();
	await ui.app.conversation.selectSession(asSessionId('changed-session'));
	await settle(ui);
	expect((node(ui, 'settings-editor') as InputRenderable).value).toBe('https://unsaved.example');
	expect(ui.runtime.settingsStore.document).toBeUndefined();
});
test('narrow terminal keeps active navigation/edit controls visible and restores mouse reporting on final closure', async () => {
	const ui = await setup();
	await open(ui);
	ui.resize(26, 6);
	await settle(ui);
	expect(ui.captureSpans().rows).toBe(6);
	ui.mockInput.pressKey('END');
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Max output');
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(node(ui, 'settings-editor')?.focused).toBe(true);
	expect(ui.captureCharFrame()).toContain('4096');
	ui.mockInput.pressEscape();
	ui.resize(72, 24);
	await settle(ui);
	const input = choices(ui);
	await ui.mockMouse.click(input.x + 2, input.y);
	await settle(ui);
	expect(node(ui, 'settings-editor')).toBeDefined();
	ui.mockInput.pressEscape();
	ui.mockInput.pressEscape();
	expect(ui.renderer.useMouse).toBe(true);
	expect(ui.app.composer.focused).toBe(true);
});

test('confirmed model with a persistence warning opens Error Dialog and keeps saved/current identities distinct', async () => {
	const ui = await setup();
	await ui.runtime.settings.writeLastSelectedModel('test-model');
	await open(ui);
	await edit(ui, 1);
	ui.runtime.switchModel = async (name) => {
		ui.runtime.model = name;
		return name;
	};
	ui.runtime.getModelSelection = () => ({
		status: 'selected',
		modelName: ui.runtime.model!,
		warning: 'Model selected, but could not remember the preference: permission denied',
	});
	(node(ui, 'model-choices') as SelectRenderable).setSelectedIndex(1);
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Could not save model preference');
	ui.mockInput.pressEscape();
	expect(details(ui)).toContain('Saved preference: test-model');
	expect(details(ui)).toContain('Currently effective: other-model');
	expect(ui.renderer.currentFocusedRenderable?.id).toBe('settings-choices');
});
test('narrow inline validation remains visible and details can be scrolled with keyboard', async () => {
	const ui = await setup();
	await open(ui);
	await edit(ui, 0);
	ui.resize(26, 6);
	await settle(ui);
	await replace(ui, 'ftp://host');
	ui.mockInput.pressEnter();
	await settle(ui);
	expect(ui.captureCharFrame()).toContain('Validation:');
	ui.mockInput.pressKey('PAGEDOWN');
	await settle(ui);
	expect(ui.captureSpans().rows).toBe(6);
	ui.mockInput.pressEscape();
	ui.mockInput.pressEscape();
	expect(ui.renderer.useMouse).toBe(true);
});
