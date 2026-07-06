import { describe, expect, test } from 'bun:test';

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
};
