import { describe, expect, spyOn, test } from 'bun:test';

import type { AppConfig } from '@/composition/config';
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
					new Response(JSON.stringify({ models: [{ name: 'llama3.1:8b' }] })),
				);

				await expect(firstList).resolves.toEqual({
					models: [{ name: 'llama3.1:8b' }],
				});
				await expect(runtime.listModels()).resolves.toEqual({
					models: [{ name: 'llama3.1:8b' }],
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

const testConfig: AppConfig = {
	OLLAMA_BASE_URL: 'http://localhost:11434',
	OLLAMA_MODEL: 'initial-model',
	OLLAMA_KEEP_ALIVE: '0',
	SYSTEM_PROMPT: 'You are a local coding agent.',
	MAX_CONTEXT_CHARACTERS: 120_000,
};

// Inspect adapter identity without exposing a second production switch/injection API.
const internals = (runtime: OllamaModelRuntime) =>
	runtime as unknown as {
		currentModel: import('@/infrastructure/model/OllamaModelAdapter').OllamaModelAdapter;
		createModel(
			name: string,
		): import('@/infrastructure/model/OllamaModelAdapter').OllamaModelAdapter;
	};
const chat = async (runtime: OllamaModelRuntime) => {
	for await (const _chunk of runtime.streamChat({ messages: [] })) {
		/* drain */
	}
};
const chatResponse = () =>
	new Response(JSON.stringify({ message: { content: 'answer' }, done: true }) + '\n');

describe('OllamaModelRuntime unload-and-switch', () => {
	test('awaits unload completion before construction and commits normalized name/adapter together', async () => {
		const unloadFinished = createDeferred<void>();
		const requests: unknown[] = [];
		const signal = new AbortController().signal;
		await withMockedFetch(
			async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				requests.push(body);
				if (!body.stream) {
					expect(init?.signal).toBe(signal);
					const response = new Response('');
					response.text = async () => {
						await unloadFinished.promise;
						return '';
					};
					return response;
				}
				return chatResponse();
			},
			async () => {
				const runtime = new OllamaModelRuntime(testConfig);
				const old = internals(runtime).currentModel;
				const construct = spyOn(internals(runtime), 'createModel');
				try {
					const switching = runtime.switchModel('  next-model  ', signal);
					await Promise.resolve();
					expect(requests).toEqual([
						{ model: 'initial-model', messages: [], keep_alive: 0, stream: false },
					]);
					expect(construct).not.toHaveBeenCalled();
					expect(runtime.getModelName()).toBe('initial-model');
					expect(internals(runtime).currentModel).toBe(old);
					unloadFinished.resolve();
					expect(await switching).toBe('next-model');
					expect(construct).toHaveBeenCalledWith('next-model');
					expect(runtime.getModelName()).toBe('next-model');
					expect(internals(runtime).currentModel).not.toBe(old);
					await chat(runtime);
					expect(requests).toHaveLength(2);
					expect(requests[1]).toMatchObject({ model: 'next-model', stream: true });
				} finally {
					unloadFinished.resolve();
					construct.mockRestore();
				}
			},
		);
	});

	test('unload failure preserves original cause, old name/adapter, and skips construction', async () => {
		const cause = new Error('unload transport failed');
		const models: string[] = [];
		await withMockedFetch(
			async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				if (!body.stream) throw cause;
				models.push(body.model);
				return chatResponse();
			},
			async () => {
				const runtime = new OllamaModelRuntime(testConfig);
				const old = internals(runtime).currentModel;
				const construct = spyOn(internals(runtime), 'createModel');
				try {
					await expect(runtime.switchModel('next-model')).rejects.toBe(cause);
					expect(construct).not.toHaveBeenCalled();
					expect(runtime.getModelName()).toBe('initial-model');
					expect(internals(runtime).currentModel).toBe(old);
					await chat(runtime);
					expect(models).toEqual(['initial-model']);
				} finally {
					construct.mockRestore();
				}
			},
		);
	});

	test('blank name rejects before unload or construction', async () => {
		let fetches = 0;
		await withMockedFetch(
			async () => {
				fetches++;
				return new Response('');
			},
			async () => {
				const runtime = new OllamaModelRuntime(testConfig);
				const old = internals(runtime).currentModel;
				await expect(runtime.switchModel(' \t ')).rejects.toThrow(
					'Ollama model name cannot be empty.',
				);
				expect(fetches).toBe(0);
				expect(runtime.getModelName()).toBe('initial-model');
				expect(internals(runtime).currentModel).toBe(old);
			},
		);
	});

	test('already-aborted signal rejects as AbortError without unload/construction', async () => {
		let fetches = 0;
		await withMockedFetch(
			async () => {
				fetches++;
				return new Response('');
			},
			async () => {
				const runtime = new OllamaModelRuntime(testConfig);
				const old = internals(runtime).currentModel;
				const request = new AbortController();
				request.abort('custom reason');
				await expect(runtime.switchModel('next-model', request.signal)).rejects.toHaveProperty(
					'name',
					'AbortError',
				);
				expect(fetches).toBe(0);
				expect(runtime.getModelName()).toBe('initial-model');
				expect(internals(runtime).currentModel).toBe(old);
			},
		);
	});

	for (const boundary of ['during unload', 'after unload', 'during construction'] as const) {
		test(`cancellation ${boundary} preserves selection and prevents partial state`, async () => {
			const request = new AbortController();
			const entered = createDeferred<void>();
			const release = createDeferred<void>();
			await withMockedFetch(
				async () => {
					entered.resolve();
					await release.promise;
					if (boundary === 'during unload') throw request.signal.reason;
					if (boundary === 'after unload') request.abort('custom reason');
					return new Response('');
				},
				async () => {
					const runtime = new OllamaModelRuntime(testConfig);
					const old = internals(runtime).currentModel;
					const original = internals(runtime).createModel.bind(runtime);
					const construct = spyOn(internals(runtime), 'createModel').mockImplementation((name) => {
						const candidate = original(name);
						request.abort('custom reason');
						return candidate;
					});
					try {
						const outcome = runtime
							.switchModel('next-model', request.signal)
							.catch((error: unknown) => error);
						await entered.promise;
						if (boundary === 'during unload') request.abort('custom reason');
						release.resolve();
						expect(await outcome).toHaveProperty('name', 'AbortError');
						expect(construct).toHaveBeenCalledTimes(boundary === 'during construction' ? 1 : 0);
						expect(runtime.getModelName()).toBe('initial-model');
						expect(internals(runtime).currentModel).toBe(old);
					} finally {
						release.resolve();
						construct.mockRestore();
					}
				},
			);
		});
	}

	test('adapter construction failure after unload cannot change either active field', async () => {
		let unloads = 0;
		await withMockedFetch(
			async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				if (!body.stream) unloads++;
				return body.stream ? chatResponse() : new Response('');
			},
			async () => {
				const runtime = new OllamaModelRuntime(testConfig);
				const old = internals(runtime).currentModel;
				const cause = new Error('adapter construction failed');
				const construct = spyOn(internals(runtime), 'createModel').mockImplementation(() => {
					throw cause;
				});
				try {
					await expect(runtime.switchModel('next-model')).rejects.toBe(cause);
					expect(unloads).toBe(1);
					expect(runtime.getModelName()).toBe('initial-model');
					expect(internals(runtime).currentModel).toBe(old);
					await chat(runtime);
				} finally {
					construct.mockRestore();
				}
			},
		);
	});

	test('independent unload failure is preserved even when cancellation is also pending', async () => {
		const request = new AbortController();
		const cause = new Error('independent storage/transport failure');
		await withMockedFetch(
			async () => {
				request.abort('custom');
				throw cause;
			},
			async () => {
				const runtime = new OllamaModelRuntime(testConfig);
				const old = internals(runtime).currentModel;
				await expect(runtime.switchModel('next-model', request.signal)).rejects.toBe(cause);
				expect(runtime.getModelName()).toBe('initial-model');
				expect(internals(runtime).currentModel).toBe(old);
			},
		);
	});
});
