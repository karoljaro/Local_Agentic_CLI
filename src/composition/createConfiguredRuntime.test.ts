import { expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SETTINGS_DEFAULTS } from '@/domain/UserSettings';
import { JsonSettingsStore } from '@/infrastructure/persistence/JsonSettingsStore';
import { ModelSessionMemoryUpdater } from '@/application/services/ModelSessionMemoryUpdater';
import { SessionMemoryService } from '@/application/services/SessionMemoryService';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { createDeferred } from '@/test-support/createDeferred';
import { withMockedFetch } from '@/test-support/withMockedFetch';
import { createConfiguredRuntime } from './createConfiguredRuntime';
import type { Runtime } from './createRuntime';

const fixture = async (
	run: (f: {
		path: string;
		legacyPath: string;
		directory: string;
		create: (
			env?: Record<string, string | undefined>,
			store?: JsonSettingsStore,
		) => Promise<Runtime>;
	}) => Promise<void>,
) => {
	const directory = await fs.mkdtemp(join(tmpdir(), 'codesh-config-integration-'));
	const path = join(directory, 'config', 'settings.json');
	const legacyPath = join(directory, '.agent', 'model-preference.json');
	const originalCwd = process.cwd();
	process.chdir(directory);
	const runtimes: Runtime[] = [];
	const works: Promise<void>[] = [];
	const finish = SessionMemoryService.prototype.finish;
	const finishSpy = spyOn(SessionMemoryService.prototype, 'finish').mockImplementation(function (
		this: SessionMemoryService,
		...args
	) {
		const work = finish.apply(this, args);
		works.push(work);
		return work;
	});
	const updater = spyOn(ModelSessionMemoryUpdater.prototype, 'update').mockResolvedValue({
		version: 1,
		goal: null,
		changes: [],
	});
	try {
		await run({
			directory,
			path,
			legacyPath,
			create: async (env = {}, store = new JsonSettingsStore(path)) => {
				const runtime = await createConfiguredRuntime({ env, store, legacyModelPath: legacyPath });
				runtimes.push(runtime);
				return runtime;
			},
		});
	} finally {
		for (const runtime of runtimes) {
			runtime.dispose();
			await runtime.settings!.whenIdle();
		}
		await Promise.allSettled(works);
		finishSpy.mockRestore();
		updater.mockRestore();
		process.chdir(originalCwd);
		await fs.rm(directory, { recursive: true, force: true });
	}
};

test('clean installation needs no .env/provider and uses safe defaults without writing user files', async () => {
	await fixture(async ({ create, path }) => {
		await withMockedFetch(
			async () => {
				throw new Error('unexpected network access');
			},
			async () => {
				const runtime = await create({ TEST_MODEL: 'dedicated-test-only' });
				expect(runtime.settings!.getSnapshot().saved).toEqual(SETTINGS_DEFAULTS);
				expect(runtime.getModelName()).toBeUndefined();
				expect(await fs.exists(path)).toBe(false);
			},
		);
	});
});
test('legacy production env seeds first-save preferences; later starts ignore stale/invalid env values', async () => {
	await fixture(async ({ create, path }) => {
		const first = await create({
			OLLAMA_BASE_URL: 'https://old.example/ollama',
			OLLAMA_MODEL: 'legacy-env-model',
			MODEL_CONTEXT_TOKENS: '32768',
			MODEL_MAX_OUTPUT_TOKENS: '2048',
			OLLAMA_KEEP_ALIVE: '2m',
			TEST_MODEL: 'excluded',
		});
		expect(first.settings!.getSnapshot().sources.keepAlive).toBe('legacy environment');
		await first.settings!.set('ollamaBaseUrl', 'https://chosen.example');
		const fresh = await create({
			OLLAMA_BASE_URL: 'not-a-url',
			OLLAMA_MODEL: 'stale-env-model',
			MODEL_CONTEXT_TOKENS: '0',
			TEST_MODEL: 'excluded',
		});
		expect(fresh.settings!.getSnapshot()).toMatchObject({
			saved: {
				ollamaBaseUrl: 'https://chosen.example',
				lastSelectedModel: 'legacy-env-model',
				contextWindowTokens: 32768,
				maxOutputTokens: 2048,
				keepAlive: '2m',
			},
			sources: { ollamaBaseUrl: 'saved' },
		});
		expect(await fs.readFile(path, 'utf8')).not.toContain('excluded');
	});
});
test('legacy model preference beats legacy env, migrates once and survives a fresh startup', async () => {
	await fixture(async ({ create, legacyPath, path }) => {
		await fs.mkdir(join(legacyPath, '..'), { recursive: true });
		const original = '{"lastSelectedModel":" remembered-model "}\n';
		await fs.writeFile(legacyPath, original);
		const first = await create({ OLLAMA_MODEL: 'stale-env-model', TEST_MODEL: 'excluded' });
		expect(first.settings!.getSnapshot().saved.lastSelectedModel).toBe('remembered-model');
		expect(await fs.readFile(`${legacyPath}.migrated`, 'utf8')).toBe(original);
		expect(await fs.exists(legacyPath)).toBe(false);
		const bytes = await fs.readFile(path);
		const fresh = await create({ OLLAMA_MODEL: 'stale-env-model' });
		expect(await fresh.settings!.readLastSelectedModel()).toBe('remembered-model');
		expect(await fs.readFile(path)).toEqual(bytes);
	});
});
test('failed migration retains the previous model and untouched legacy file', async () => {
	await fixture(async ({ create, path, legacyPath }) => {
		await fs.mkdir(join(legacyPath, '..'), { recursive: true });
		await fs.writeFile(legacyPath, '{"lastSelectedModel":"remembered"}');
		const store = new JsonSettingsStore(path, {
			...fs,
			rename: async () => {
				throw new Error('permission denied');
			},
		});
		const runtime = await create({}, store);
		expect(runtime.settings!.getSnapshot()).toMatchObject({
			saved: { lastSelectedModel: 'remembered' },
			problem: expect.stringContaining('Legacy file'),
		});
		expect(await fs.readFile(legacyPath, 'utf8')).toBe('{"lastSelectedModel":"remembered"}');
		expect(await fs.exists(path)).toBe(false);
	});
});

test('invalid legacy environment cannot silently reset a valid previous model preference', async () => {
	await fixture(async ({ create, legacyPath }) => {
		await fs.mkdir(join(legacyPath, '..'), { recursive: true });
		const original = '{"lastSelectedModel":"remembered"}';
		await fs.writeFile(legacyPath, original);
		const runtime = await create({ OLLAMA_BASE_URL: 'invalid legacy endpoint' });
		expect(runtime.settings!.getSnapshot()).toMatchObject({
			saved: { lastSelectedModel: 'remembered', ollamaBaseUrl: SETTINGS_DEFAULTS.ollamaBaseUrl },
			problem: expect.any(String),
		});
		expect(await fs.readFile(legacyPath, 'utf8')).toBe(original);
		await runtime.settings!.set('ollamaBaseUrl', 'https://repaired.example');
		expect(runtime.settings!.getSnapshot().problem).toBeUndefined();
		expect(runtime.settings!.getSnapshot().saved.lastSelectedModel).toBe('remembered');
	});
});
test('explicit defaults/reset stay authoritative over legacy env, including automatic model startup', async () => {
	await fixture(async ({ create }) => {
		const runtime = await create({ MODEL_MAX_OUTPUT_TOKENS: '2048', OLLAMA_MODEL: 'legacy' });
		await runtime.settings!.reset('maxOutputTokens');
		await runtime.settings!.reset('lastSelectedModel');
		const fresh = await create({ MODEL_MAX_OUTPUT_TOKENS: '1024', OLLAMA_MODEL: 'stale' });
		expect(fresh.settings!.getSnapshot().saved.maxOutputTokens).toBe(4096);
		expect(fresh.settings!.getSnapshot().saved.lastSelectedModel).toBeNull();
	});
});
for (const original of [
	'{ malformed bytes',
	'{"version":9,"preferences":{}}',
	'{"version":1,"preferences":{"testModel":"do-not-import"}}',
]) {
	test(`malformed/unsupported startup recovers without destructive overwrite: ${original}`, async () => {
		await fixture(async ({ create, path }) => {
			await fs.mkdir(join(path, '..'), { recursive: true });
			await fs.writeFile(path, original);
			const runtime = await create({ OLLAMA_MODEL: 'no-env-import' });
			expect(runtime.settings!.getSnapshot().saved).toEqual(SETTINGS_DEFAULTS);
			expect(runtime.settings!.getSnapshot().problem).toBeDefined();
			await expect(runtime.settings!.set('keepAlive', '5m')).rejects.toThrow('Repair the file');
			expect(await fs.readFile(path, 'utf8')).toBe(original);
			await fs.writeFile(
				path,
				JSON.stringify({ version: 1, preferences: { maxOutputTokens: 2048 } }),
			);
			const repaired = await create();
			expect(repaired.settings!.getSnapshot().problem).toBeUndefined();
			expect(repaired.settings!.getSnapshot().effective.maxOutputTokens).toBe(2048);
		});
	});
}
test('shared model selector persists only confirmed activation and startup never preloads', async () => {
	await fixture(async ({ create, path }) => {
		const requests: Record<string, unknown>[] = [];
		let fail = false;
		await withMockedFetch(
			async (url, init) => {
				if (String(url).endsWith('/api/tags'))
					return Response.json({
						models: [{ name: 'first' }, { name: 'chosen' }, { name: 'test-model' }],
					});
				const body = JSON.parse(String(init?.body));
				requests.push(body);
				if (body.keep_alive === 0) return Response.json({ done: true, done_reason: 'unload' });
				if (fail) throw new Error('activation failed');
				return Response.json({ model: body.model, done: true, done_reason: 'load' });
			},
			async () => {
				const runtime = await create({ OLLAMA_MODEL: 'first' });
				await runtime.initializeModels();
				expect(requests).toEqual([]);
				await runtime.settings!.set('maxOutputTokens', 2048);
				await runtime.switchModel('chosen');
				expect(runtime.getModelName()).toBe('chosen');
				expect(runtime.settings!.getSnapshot().saved.lastSelectedModel).toBe('chosen');
				const confirmed = await fs.readFile(path);
				fail = true;
				await expect(runtime.switchModel('test-model')).rejects.toThrow('activation failed');
				expect(await fs.readFile(path)).toEqual(confirmed);
				expect(runtime.settings!.getSnapshot().saved.maxOutputTokens).toBe(2048);
				const fresh = await create();
				await fresh.initializeModels();
				expect(fresh.getModelName()).toBe('chosen');
				expect(fresh.settings!.getSnapshot().effective.maxOutputTokens).toBe(2048);
			},
		);
	});
});
test('inference budgets reach real ContextBuilder/adapter, remain immutable in flight, and change next turn', async () => {
	await fixture(async ({ create }) => {
		const requests: {
			options: { num_ctx: number; num_predict: number };
			keep_alive?: number | string;
			messages: unknown[];
		}[] = [];
		const entered = createDeferred<void>();
		const response = createDeferred<Response>();
		await withMockedFetch(
			async (url, init) => {
				if (String(url).endsWith('/api/tags'))
					return Response.json({ models: [{ name: 'installed' }] });
				const body = JSON.parse(String(init?.body));
				requests.push(body);
				if (requests.length === 1) {
					entered.resolve();
					return response.promise;
				}
				return new Response(
					'{"message":{"content":"scripted"},"done":true,"done_reason":"stop"}\n',
				);
			},
			async () => {
				const runtime = await create();
				const sessionId = runtime.createSessionId();
				const active = collectAsyncIterable(
					runtime.runTurn({ sessionId, prompt: 'Initial request' }),
				);
				await entered.promise;
				await runtime.settings!.set('maxOutputTokens', 2048);
				await runtime.settings!.set('contextWindowTokens', 8192);
				await runtime.settings!.set('keepAlive', '5m');
				expect(requests[0]!.options).toEqual({ num_ctx: 16384, num_predict: 4096 });
				expect(requests[0]!.keep_alive).toBe(0);
				response.resolve(
					new Response('{"message":{"content":"first"},"done":true,"done_reason":"stop"}\n'),
				);
				await active;
				await collectAsyncIterable(runtime.runTurn({ sessionId, prompt: 'Next request' }));
				expect(requests[1]!.options).toEqual({ num_ctx: 8192, num_predict: 2048 });
				expect(requests[1]!.keep_alive).toBe('5m');
				await expect(runtime.settings!.set('maxOutputTokens', 4096)).rejects.toThrow(
					'input tokens',
				);
				expect(runtime.settings!.getSnapshot().effective.maxOutputTokens).toBe(2048);
				await runtime.settings!.set('keepAlive', 'default');
				await collectAsyncIterable(runtime.runTurn({ sessionId, prompt: 'Provider retention' }));
				expect(requests[2]).not.toHaveProperty('keep_alive');
				expect(
					(await runtime.listSessionEvents(sessionId)).filter(
						(event) => event.type === 'prompt.submitted',
					),
				).toHaveLength(3);
			},
		);
	});
});
test('endpoint is saved for restart; the active adapter/catalog retains its original endpoint', async () => {
	await fixture(async ({ create }) => {
		const urls: string[] = [];
		await withMockedFetch(
			async (url) => {
				urls.push(String(url));
				return Response.json({ models: [{ name: 'available' }] });
			},
			async () => {
				const runtime = await create();
				await runtime.initializeModels();
				await runtime.settings!.set('ollamaBaseUrl', 'https://other.example/ollama');
				await runtime.listModels(undefined, { forceRefresh: true });
				expect(urls).toEqual([
					'http://localhost:11434/api/tags',
					'http://localhost:11434/api/tags',
				]);
				expect(runtime.settings!.getSnapshot()).toMatchObject({
					effective: { ollamaBaseUrl: 'http://localhost:11434' },
					saved: { ollamaBaseUrl: 'https://other.example/ollama' },
				});
				const fresh = await create();
				await fresh.initializeModels();
				expect(urls.at(-1)).toBe('https://other.example/ollama/api/tags');
				expect(fresh.settings!.getSnapshot().effective.ollamaBaseUrl).toBe(
					'https://other.example/ollama',
				);
			},
		);
	});
});
