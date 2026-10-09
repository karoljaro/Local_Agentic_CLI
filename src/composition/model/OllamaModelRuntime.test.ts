import { SYNTHETIC_MODEL, TEST_CONTEXT_PROFILE } from '@/test-support/modelFixtures';
import { readConfig } from '@/composition/config';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { describe, expect, test } from 'bun:test';

import { createDeferred } from '@/test-support/createDeferred';
import { withMockedFetch } from '@/test-support/withMockedFetch';

import { OllamaModelRuntime } from './OllamaModelRuntime';

describe('OllamaModelRuntime', () => {
	test('reuses an in-flight model list request and caches the result', async () => {
		const pendingResponse = createDeferred<Response>();
		let fetchCount = 0;

		await withMockedFetch(
			async () => {
				fetchCount += 1;
				return pendingResponse.promise;
			},
			async () => {
				const runtime = new OllamaModelRuntime(testConfig);
				const firstList = runtime.listModels();
				const secondList = runtime.listModels();

				expect(fetchCount).toBe(1);
				expect(secondList).toBe(firstList);

				pendingResponse.resolve(
					new Response(JSON.stringify({ models: [{ name: SYNTHETIC_MODEL }] })),
				);

				await expect(firstList).resolves.toEqual({
					models: [{ name: SYNTHETIC_MODEL }],
				});
				await expect(runtime.listModels()).resolves.toEqual({
					models: [{ name: SYNTHETIC_MODEL }],
				});
				expect(fetchCount).toBe(1);
			},
		);
	});

	test('forceRefresh bypasses the cached model list', async () => {
		let fetchCount = 0;

		await withMockedFetch(
			async () => {
				fetchCount += 1;
				const modelName = fetchCount === 1 ? 'first-model' : 'refreshed-model';

				return new Response(JSON.stringify({ models: [{ name: modelName }] }));
			},
			async () => {
				const runtime = new OllamaModelRuntime(testConfig);

				await expect(runtime.listModels()).resolves.toEqual({
					models: [{ name: 'first-model' }],
				});
				await expect(runtime.listModels({ forceRefresh: true })).resolves.toEqual({
					models: [{ name: 'refreshed-model' }],
				});
				expect(fetchCount).toBe(2);
			},
		);
	});
});

const testConfig = readConfig({ OLLAMA_MODEL: SYNTHETIC_MODEL });
const OTHER = 'other-model';

const setup = () => ({
	models: [SYNTHETIC_MODEL, OTHER],
	requests: [] as { model: string; messages: unknown[]; keep_alive?: number; stream: boolean }[],
	writes: [] as string[],
	unloadResponse: undefined as Response | undefined,
	activateResponse: undefined as Response | undefined,
	chatResponse: undefined as Response | undefined,
});
const withProvider = async (
	run: (f: ReturnType<typeof setup>, runtime: OllamaModelRuntime) => Promise<void>,
	configured = SYNTHETIC_MODEL,
) => {
	const f = setup();
	await withMockedFetch(
		async (url, init) => {
			if (String(url).endsWith('/api/tags'))
				return Response.json({ models: f.models.map((name) => ({ name })) });
			const body = JSON.parse(String(init?.body));
			f.requests.push(body);
			if (body.stream)
				return (
					f.chatResponse ??
					new Response(JSON.stringify({ message: { content: 'answer' }, done: true }) + '\n')
				);
			if (body.keep_alive === 0)
				return f.unloadResponse ?? Response.json({ done: true, done_reason: 'unload' });
			return (
				f.activateResponse ?? Response.json({ model: body.model, done: true, done_reason: 'load' })
			);
		},
		async () => {
			const runtime = new OllamaModelRuntime(readConfig({ OLLAMA_MODEL: configured }), {
				readLastSelectedModel: async () => undefined,
				writeLastSelectedModel: async (name) => {
					f.writes.push(name);
				},
			});
			await run(f, runtime);
		},
	);
};

describe('Ollama runtime selection composition', () => {
	test('stale current to installed new survives model-not-found unload and confirms a load before persisting', async () => {
		await withProvider(async (f, runtime) => {
			await runtime.initialize();
			f.models = [OTHER];
			f.unloadResponse = Response.json(
				{ error: `model '${SYNTHETIC_MODEL}' not found` },
				{ status: 404 },
			);
			expect(await runtime.switchModel(OTHER)).toBe(OTHER);
			expect(runtime.getModelName()).toBe(OTHER);
			expect(f.requests).toEqual([
				{ model: SYNTHETIC_MODEL, messages: [], keep_alive: 0, stream: false },
				{ model: OTHER, messages: [], stream: false },
			]);
			expect(f.writes).toEqual([OTHER]);
			expect(
				await collectAsyncIterable(
					runtime.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
				),
			).toEqual([{ contentDelta: 'answer' }]);
		});
	});

	test('unavailable configured model starts truthfully and recovers without unloading an unselected stale adapter', async () => {
		await withProvider(async (f, runtime) => {
			expect(await runtime.initialize()).toMatchObject({
				status: 'unavailable',
				message: expect.stringContaining('/model'),
			});
			expect(runtime.getModelName()).toBeUndefined();
			expect(f.requests).toEqual([]);
			await runtime.switchModel(OTHER);
			expect(f.requests).toEqual([{ model: OTHER, messages: [], stream: false }]);
			expect(runtime.getModelName()).toBe(OTHER);
		}, 'removed-model');
	});

	test('unrelated unload 404 remains a failure and preserves the valid previous selection', async () => {
		await withProvider(async (f, runtime) => {
			await runtime.initialize();
			f.unloadResponse = Response.json({ error: 'route not found' }, { status: 404 });
			await expect(runtime.switchModel(OTHER)).rejects.toThrow(
				'Ollama model unload failed with status 404',
			);
			expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
			expect(f.requests).toHaveLength(1);
			expect(f.writes).toEqual([]);
		});
	});

	test('activation response must confirm load; malformed success cannot commit or persist', async () => {
		await withProvider(async (f, runtime) => {
			await runtime.initialize();
			f.activateResponse = Response.json({ done: true, done_reason: 'unload' });
			await expect(runtime.switchModel(OTHER)).rejects.toThrow('expected a completed load');
			expect(runtime.getModelName()).toBeUndefined();
			expect(f.writes).toEqual([]);
		});
	});

	test('model activation error preserves primary cause and recovery guidance without committing attempted selection', async () => {
		await withProvider(async (f, runtime) => {
			await runtime.initialize();
			f.activateResponse = Response.json(
				{ error: 'failed to load model: unsupported model architecture' },
				{ status: 500 },
			);
			await expect(runtime.switchModel(OTHER)).rejects.toThrow(
				'unsupported model architecture"} Use /model',
			);
			expect(runtime.getModelName()).toBeUndefined();
			expect(f.writes).toEqual([]);
		});
	});

	test('an inference model-not-found clears the active header state and supplies recovery guidance', async () => {
		await withProvider(async (f, runtime) => {
			await runtime.initialize();
			f.chatResponse = Response.json(
				{ error: `model '${SYNTHETIC_MODEL}' not found` },
				{ status: 404 },
			);
			await expect(
				collectAsyncIterable(
					runtime.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
				),
			).rejects.toThrow('Use /model');
			expect(runtime.getModelName()).toBeUndefined();
			expect(f.writes).toEqual([]);
		});
	});
});
