import { expect, spyOn, test } from 'bun:test';
import { InputRenderable, SelectRenderable, type Renderable } from '@opentui/core';
import { createTestRenderer, MockTreeSitterClient } from '@opentui/core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConfiguredRuntime } from '@/composition/createConfiguredRuntime';
import { JsonSettingsStore } from '@/infrastructure/persistence/JsonSettingsStore';
import { SessionMemoryService } from '@/application/services/SessionMemoryService';
import { withMockedFetch } from '@/test-support/withMockedFetch';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { TerminalApp } from './TerminalApp';

test('native Settings/picker → disk → fresh production composition → real scripted request preserves targeted preferences', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'codesh-settings-ui-integration-'));
	const originalCwd = process.cwd();
	process.chdir(directory);
	const path = join(directory, 'config', 'settings.json');
	const parser = new MockTreeSitterClient();
	const finish = spyOn(SessionMemoryService.prototype, 'finish').mockResolvedValue(undefined);
	let app: TerminalApp | undefined;
	const options: { num_ctx: number; num_predict: number }[] = [];
	try {
		await withMockedFetch(
			async (url, init) => {
				if (String(url).endsWith('/api/tags'))
					return Response.json({ models: [{ name: 'installed' }, { name: 'chosen' }] });
				const body = JSON.parse(String(init?.body));
				if (!body.stream)
					return Response.json({
						model: body.model,
						done: true,
						done_reason: body.keep_alive === 0 ? 'unload' : 'load',
					});
				options.push(body.options);
				return new Response(
					'{"message":{"content":"scripted answer"},"done":true,"done_reason":"stop"}\n',
				);
			},
			async () => {
				const runtime = await createConfiguredRuntime({
					env: {},
					store: new JsonSettingsStore(path),
				});
				const ui = await createTestRenderer({
					width: 72,
					height: 24,
					autoFocus: false,
					useThread: false,
					exitOnCtrlC: false,
					exitSignals: [],
					screenMode: 'alternate-screen',
					kittyKeyboard: true,
				});
				app = new TerminalApp(ui.renderer, runtime, 'new', parser, {
					writeText: async () => ({
						host: { status: 'written' },
						terminal: { status: 'not-attempted', capability: 'unknown' },
					}),
					dispose: async () => {},
				});
				await app.ready;
				const children = (root: Renderable): Renderable[] => [
					root,
					...root.getChildren().flatMap(children),
				];
				const node = (id: string) => children(ui.renderer.root).find((child) => child.id === id)!;
				const settle = async () => {
					for (let i = 0; i < 8; i++) {
						parser.resolveAllHighlightOnce();
						await Promise.resolve();
						await ui.renderOnce();
					}
				};
				const open = async () => {
					app!.composer.setText('/settings');
					ui.mockInput.pressEnter();
					await settle();
				};
				const setNumber = async (index: number, value: string) => {
					(node('settings-choices') as SelectRenderable).setSelectedIndex(index);
					ui.mockInput.pressEnter();
					(node('settings-editor') as InputRenderable).value = value;
					ui.mockInput.pressEnter();
					await runtime.settings!.whenIdle();
					await settle();
					await ui.waitFor(() => !node('settings-editor'), { maxPasses: 256 });
				};
				await open();
				expect(ui.captureCharFrame()).toContain('16384');
				await setNumber(4, '2048');
				await setNumber(3, '8192');
				ui.mockInput.pressEscape();
				ui.mockInput.pressKey('F2');
				await settle();
				let switchWork: Promise<string> | undefined;
				const switchModel = runtime.switchModel;
				runtime.switchModel = (name, signal) => (switchWork = switchModel(name, signal));
				(node('model-choices') as SelectRenderable).setSelectedIndex(1);
				ui.mockInput.pressEnter();
				await switchWork;
				await settle();
				await open();
				(node('settings-choices') as SelectRenderable).setSelectedIndex(1);
				await settle();
				expect(ui.captureCharFrame()).toContain('chosen');
				expect(runtime.getModelName()).toBe('chosen');
				const bytes = await readFile(path, 'utf8');
				expect(JSON.parse(bytes).preferences).toMatchObject({
					lastSelectedModel: 'chosen',
					contextWindowTokens: 8192,
					maxOutputTokens: 2048,
				});
				ui.mockInput.pressEscape();
				await app!.shutdown();
				const fresh = await createConfiguredRuntime({
					env: { OLLAMA_MODEL: 'stale' },
					store: new JsonSettingsStore(path),
				});
				try {
					await fresh.initializeModels();
					expect(fresh.getModelName()).toBe('chosen');
					await collectAsyncIterable(
						fresh.runTurn({
							sessionId: fresh.createSessionId(),
							prompt: 'Verify the persisted budget',
						}),
					);
					expect(options).toEqual([{ num_ctx: 8192, num_predict: 2048 }]);
					expect(fresh.settings!.getSnapshot().effective.keepAlive).toBe('0');
					expect(await readFile(path, 'utf8')).toBe(bytes);
				} finally {
					fresh.dispose();
					await fresh.settings!.whenIdle();
				}
			},
		);
	} finally {
		await app?.shutdown();
		finish.mockRestore();
		await parser.destroy();
		process.chdir(originalCwd);
		await rm(directory, { recursive: true, force: true });
	}
});
