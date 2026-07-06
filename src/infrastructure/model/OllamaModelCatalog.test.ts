import { describe, expect, test } from 'bun:test';

import { withMockedFetch } from '@/test-support/withMockedFetch';

import { OllamaModelCatalog } from './OllamaModelCatalog';

describe('OllamaModelCatalog', () => {
	test('fetches local models from Ollama tags endpoint', async () => {
		let requestUrl = '';

		await withMockedFetch(
			async (input) => {
				requestUrl = String(input);

				return new Response(
					JSON.stringify({
						models: [
							{
								name: 'gemma4:12b-it-qat',
								modified_at: '2026-06-20T12:00:00Z',
								size: 123,
								details: {
									parameter_size: '12B',
									quantization_level: 'Q4_0',
								},
							},
						],
					}),
				);
			},
			async () => {
				const catalog = new OllamaModelCatalog('http://localhost:11434/');

				await expect(catalog.listModels()).resolves.toEqual({
					models: [
						{
							name: 'gemma4:12b-it-qat',
							modifiedAt: '2026-06-20T12:00:00Z',
							parameterSize: '12B',
							quantizationLevel: 'Q4_0',
							sizeBytes: 123,
						},
					],
				});
				expect(requestUrl).toBe('http://localhost:11434/api/tags');
			},
		);
	});

	test('passes abort signal to the tags request', async () => {
		const controller = new AbortController();
		let receivedSignal: AbortSignal | null | undefined;

		await withMockedFetch(
			async (_input, init) => {
				receivedSignal = init?.signal;

				return new Response(JSON.stringify({ models: [{ name: 'llama3.1:8b' }] }));
			},
			async () => {
				const catalog = new OllamaModelCatalog();

				await expect(catalog.listModels({ signal: controller.signal })).resolves.toEqual({
					models: [{ name: 'llama3.1:8b' }],
				});
				expect(receivedSignal).toBe(controller.signal);
			},
		);
	});

	test('throws a bounded error for non-ok responses', async () => {
		await withMockedFetch(
			async () => new Response('not running', { status: 500 }),
			async () => {
				const catalog = new OllamaModelCatalog();

				await expect(catalog.listModels()).rejects.toThrow(
					'Ollama model list failed with status 500: not running',
				);
			},
		);
	});

	test('throws for malformed responses', async () => {
		await withMockedFetch(
			async () => new Response('{"models":[{}]}'),
			async () => {
				const catalog = new OllamaModelCatalog();

				await expect(catalog.listModels()).rejects.toThrow(
					'Invalid Ollama model list response: model entry is missing name.',
				);
			},
		);
	});
});
