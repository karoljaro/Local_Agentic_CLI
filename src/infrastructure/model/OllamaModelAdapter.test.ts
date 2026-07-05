import { describe, expect, test } from 'bun:test';

import { asMessageId, asToolCallId } from '@/domain/Ids';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { withMockedFetch } from '@/test-support/withMockedFetch';

import { OllamaModelAdapter } from './OllamaModelAdapter';

describe('OllamaModelAdapter', () => {
	test('posts assistant tool calls and tool messages', async () => {
		let requestBody: unknown;

		await withMockedFetch(
			async (_input, init) => {
				requestBody = JSON.parse(String(init?.body));

				return new Response('{"message":{"content":"Done"},"done":true}\n');
			},
			async () => {
				const adapter = new OllamaModelAdapter();

				await collectAsyncIterable(
					adapter.streamChat({
						messages: [
							{
								role: 'assistant',
								content: '',
								toolCalls: [
									{
										id: asToolCallId('tool-call-1'),
										name: 'read_file',
										arguments: { path: 'README.md' },
									},
								],
							},
							{
								role: 'tool',
								toolCallId: asToolCallId('tool-call-1'),
								toolName: 'read_file',
								content: '{"content":"hello"}',
							},
						],
					}),
				);

				expect(requestBody).toEqual({
					model: 'gemma4:12b-it-qat',
					messages: [
						{
							role: 'assistant',
							content: '',
							tool_calls: [
								{
									function: {
										name: 'read_file',
										arguments: { path: 'README.md' },
									},
								},
							],
						},
						{
							role: 'tool',
							content: '{"content":"hello"}',
							tool_name: 'read_file',
						},
					],
					stream: true,
				});
			},
		);
	});

	test('posts chat messages and yields content deltas', async () => {
		let requestUrl = '';
		let requestBody: unknown;

		await withMockedFetch(
			async (input, init) => {
				requestUrl = String(input);
				requestBody = JSON.parse(String(init?.body));

				return new Response(
					'{"message":{"content":"Hello"},"done":false}\n{"message":{"content":" there"},"done":false}\n{"done":true}\n',
					{ status: 200 },
				);
			},
			async () => {
				const adapter = new OllamaModelAdapter('http://localhost:11434/', ' test-model ');

				const chunks = await collectAsyncIterable(
					adapter.streamChat({
						messages: [
							{
								role: 'system',
								content: 'System prompt',
							},
							{
								id: asMessageId('message-1'),
								role: 'user',
								content: 'Hello',
							},
						],
					}),
				);

				expect(requestUrl).toBe('http://localhost:11434/api/chat');
				expect(requestBody).toEqual({
					model: 'test-model',
					messages: [
						{
							role: 'system',
							content: 'System prompt',
						},
						{
							role: 'user',
							content: 'Hello',
						},
					],
					stream: true,
				});
				expect(chunks).toEqual([{ contentDelta: 'Hello' }, { contentDelta: ' there' }]);
			},
		);
	});

	test('passes keep_alive to chat requests when configured', async () => {
		let requestBody: unknown;

		await withMockedFetch(
			async (_input, init) => {
				requestBody = JSON.parse(String(init?.body));

				return new Response('{"done":true}\n', { status: 200 });
			},
			async () => {
				const adapter = new OllamaModelAdapter('http://localhost:11434', 'test-model', '0');

				await collectAsyncIterable(adapter.streamChat({ messages: [] }));

				expect(requestBody).toEqual({
					model: 'test-model',
					messages: [],
					keep_alive: 0,
					stream: true,
				});
			},
		);
	});

	test('unloads the active model through chat keep_alive 0', async () => {
		const abortController = new AbortController();
		let requestUrl = '';
		let requestSignal: AbortSignal | null | undefined;
		let requestBody: unknown;

		await withMockedFetch(
			async (input, init) => {
				requestUrl = String(input);
				requestSignal = init?.signal;
				requestBody = JSON.parse(String(init?.body));

				return new Response('{"done":true,"done_reason":"unload"}', { status: 200 });
			},
			async () => {
				const adapter = new OllamaModelAdapter('http://localhost:11434/', ' test-model ');

				await adapter.unload({ signal: abortController.signal });

				expect(requestUrl).toBe('http://localhost:11434/api/chat');
				expect(requestSignal).toBe(abortController.signal);
				expect(requestBody).toEqual({
					model: 'test-model',
					messages: [],
					keep_alive: 0,
					stream: false,
				});
			},
		);
	});

	test('passes the abort signal to fetch', async () => {
		const abortController = new AbortController();
		let requestSignal: AbortSignal | null | undefined;

		await withMockedFetch(
			async (_input, init) => {
				requestSignal = init?.signal;

				return new Response('{"done":true}\n', { status: 200 });
			},
			async () => {
				const adapter = new OllamaModelAdapter();

				await collectAsyncIterable(
					adapter.streamChat({
						messages: [],
						signal: abortController.signal,
					}),
				);

				expect(requestSignal).toBe(abortController.signal);
			},
		);
	});

	test('does not pass an abort signal when none is provided', async () => {
		let requestSignal: AbortSignal | null | undefined = null;

		await withMockedFetch(
			async (_input, init) => {
				requestSignal = init?.signal;

				return new Response('{"done":true}\n', { status: 200 });
			},
			async () => {
				const adapter = new OllamaModelAdapter();

				await collectAsyncIterable(adapter.streamChat({ messages: [] }));

				expect(requestSignal).toBeUndefined();
			},
		);
	});

	test('streams tool calls when tools are provided', async () => {
		let requestBody: unknown;

		await withMockedFetch(
			async (_input, init) => {
				requestBody = JSON.parse(String(init?.body));

				return new Response(
					'{"message":{"content":"","tool_calls":[{"function":{"name":"read_file","arguments":{"path":"README.md"}}}]},"done":true}\n',
					{ status: 200 },
				);
			},
			async () => {
				const adapter = new OllamaModelAdapter();
				const tool = {
					name: 'read_file',
					description: 'Read a file',
					parameters: {
						type: 'object',
						required: ['path'],
						properties: {
							path: { type: 'string' },
						},
					},
				};

				const chunks = await collectAsyncIterable(
					adapter.streamChat({
						messages: [],
						tools: [tool],
					}),
				);

				expect(requestBody).toEqual({
					model: 'gemma4:12b-it-qat',
					messages: [],
					tools: [
						{
							type: 'function',
							function: {
								name: tool.name,
								description: tool.description,
								parameters: tool.parameters,
							},
						},
					],
					stream: true,
				});
				expect(chunks).toEqual([
					{
						contentDelta: '',
						toolCalls: [
							{
								name: 'read_file',
								arguments: { path: 'README.md' },
							},
						],
					},
				]);
			},
		);
	});

	test('accepts an empty completed response', async () => {
		await withMockedFetch(
			async () => {
				return new Response('{"message":{"content":""},"done":true}\n', {
					status: 200,
				});
			},
			async () => {
				const adapter = new OllamaModelAdapter();

				const chunks = await collectAsyncIterable(adapter.streamChat({ messages: [] }));

				expect(chunks).toEqual([]);
			},
		);
	});

	test('keeps repeated tool calls as separate chunks', async () => {
		await withMockedFetch(
			async () => {
				return new Response(
					[
						'{"message":{"tool_calls":[{"function":{"name":"read_file","arguments":{"path":"README.md"}}}]},"done":false}',
						'{"message":{"tool_calls":[{"function":{"name":"read_file","arguments":{"path":"README.md"}}}]},"done":true}',
						'',
					].join('\n'),
					{ status: 200 },
				);
			},
			async () => {
				const adapter = new OllamaModelAdapter();

				const chunks = await collectAsyncIterable(adapter.streamChat({ messages: [] }));

				expect(chunks).toEqual([
					{
						contentDelta: '',
						toolCalls: [
							{
								name: 'read_file',
								arguments: { path: 'README.md' },
							},
						],
					},
					{
						contentDelta: '',
						toolCalls: [
							{
								name: 'read_file',
								arguments: { path: 'README.md' },
							},
						],
					},
				]);
			},
		);
	});

	test('throws a bounded error for non-ok responses', async () => {
		await withMockedFetch(
			async () => new Response('model not found', { status: 404 }),
			async () => {
				const adapter = new OllamaModelAdapter();

				await expect(collectAsyncIterable(adapter.streamChat({ messages: [] }))).rejects.toThrow(
					'Ollama request failed with status 404',
				);
			},
		);
	});

	test('throws when the stream contains malformed JSON', async () => {
		let wasCancelled = false;

		await withMockedFetch(
			async () => {
				return new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode('not-json\n'));
						},
						cancel() {
							wasCancelled = true;
						},
					}),
					{ status: 200 },
				);
			},
			async () => {
				const adapter = new OllamaModelAdapter();

				await expect(collectAsyncIterable(adapter.streamChat({ messages: [] }))).rejects.toThrow(
					'Invalid Ollama stream JSON',
				);
				expect(wasCancelled).toBe(true);
			},
		);
	});

	test('throws when Ollama streams an error event', async () => {
		await withMockedFetch(
			async () => new Response('{"error":"model failed"}\n', { status: 200 }),
			async () => {
				const adapter = new OllamaModelAdapter();

				await expect(collectAsyncIterable(adapter.streamChat({ messages: [] }))).rejects.toThrow(
					'Ollama stream failed: model failed',
				);
			},
		);
	});

	test('throws when Ollama streams an error after content deltas', async () => {
		await withMockedFetch(
			async () => {
				return new Response(
					'{"message":{"content":"partial"},"done":false}\n{"error":"model failed"}\n',
					{ status: 200 },
				);
			},
			async () => {
				const adapter = new OllamaModelAdapter();

				await expect(collectAsyncIterable(adapter.streamChat({ messages: [] }))).rejects.toThrow(
					'Ollama stream failed: model failed',
				);
			},
		);
	});

	test('throws when the stream ends before Ollama marks it complete', async () => {
		await withMockedFetch(
			async () => {
				return new Response(
					'{"message":{"content":"","tool_calls":[{"function":{"name":"read_file","arguments":{"path":"README.md"}}}]},"done":false}\n',
					{ status: 200 },
				);
			},
			async () => {
				const adapter = new OllamaModelAdapter();

				await expect(collectAsyncIterable(adapter.streamChat({ messages: [] }))).rejects.toThrow(
					'Ollama stream ended before completion.',
				);
			},
		);
	});

	test('throws when tool arguments contain invalid JSON', async () => {
		await withMockedFetch(
			async () => {
				return new Response(
					'{"message":{"content":"","tool_calls":[{"function":{"name":"read_file","arguments":"{invalid"}}]},"done":true}\n',
					{ status: 200 },
				);
			},
			async () => {
				const adapter = new OllamaModelAdapter();

				await expect(collectAsyncIterable(adapter.streamChat({ messages: [] }))).rejects.toThrow(
					'Invalid Ollama tool arguments for read_file',
				);
			},
		);
	});

	test('rejects empty configuration values', () => {
		expect(() => new OllamaModelAdapter(' ', 'model')).toThrow('Ollama base URL cannot be empty.');
		expect(() => new OllamaModelAdapter('http://localhost:11434', ' ')).toThrow(
			'Ollama model name cannot be empty.',
		);
	});
});
