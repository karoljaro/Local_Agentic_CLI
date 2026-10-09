import { SYNTHETIC_MODEL, TEST_CONTEXT_PROFILE } from '@/test-support/modelFixtures';
import { describe, expect, test } from 'bun:test';

import { asMessageId, asToolCallId } from '@/domain/Ids';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { createDeferred } from '@/test-support/createDeferred';
import { withMockedFetch } from '@/test-support/withMockedFetch';

import { OllamaModelAdapter } from './OllamaModelAdapter';

describe('OllamaModelAdapter', () => {
	for (const [keepAlive, expected] of [
		[' \t ', undefined],
		[' 2m ', '2m'],
	] as const) {
		test(`preserves optional keep-alive normalization for ${JSON.stringify(keepAlive)}`, async () => {
			await withMockedFetch(
				async (_url, init) => {
					const body = JSON.parse(String(init?.body));
					if (expected === undefined) {
						expect(body).not.toHaveProperty('keep_alive');
					} else {
						expect(body.keep_alive).toBe(expected);
					}
					return new Response('{"message":{"content":"Done"},"done":true}\n');
				},
				async () => {
					const adapter = new OllamaModelAdapter(
						'http://localhost:11434',
						'fixture-model',
						keepAlive,
					);
					await collectAsyncIterable(
						adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
					);
				},
			);
		});
	}

	test('posts assistant tool calls and tool messages', async () => {
		let requestBody: unknown;

		await withMockedFetch(
			async (_input, init) => {
				requestBody = JSON.parse(String(init?.body));

				return new Response('{"message":{"content":"Done"},"done":true}\n');
			},
			async () => {
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				await collectAsyncIterable(
					adapter.streamChat({
						contextProfile: TEST_CONTEXT_PROFILE,
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
					model: SYNTHETIC_MODEL,
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
					options: { num_ctx: 16_384, num_predict: 4_096 },
					truncate: false,
					shift: false,
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
				const adapter = new OllamaModelAdapter('http://localhost:11434/', ` ${SYNTHETIC_MODEL} `);

				const chunks = await collectAsyncIterable(
					adapter.streamChat({
						contextProfile: TEST_CONTEXT_PROFILE,
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
					model: SYNTHETIC_MODEL,
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
					options: { num_ctx: 16_384, num_predict: 4_096 },
					truncate: false,
					shift: false,
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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL, '0');

				await collectAsyncIterable(
					adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
				);

				expect(requestBody).toEqual({
					model: SYNTHETIC_MODEL,
					messages: [],
					keep_alive: 0,
					stream: true,
					options: { num_ctx: 16_384, num_predict: 4_096 },
					truncate: false,
					shift: false,
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
				const adapter = new OllamaModelAdapter('http://localhost:11434/', ` ${SYNTHETIC_MODEL} `);

				await adapter.unload({ signal: abortController.signal });

				expect(requestUrl).toBe('http://localhost:11434/api/chat');
				expect(requestSignal).toBe(abortController.signal);
				expect(requestBody).toEqual({
					model: SYNTHETIC_MODEL,
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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				await collectAsyncIterable(
					adapter.streamChat({
						contextProfile: TEST_CONTEXT_PROFILE,
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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				await collectAsyncIterable(
					adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
				);

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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);
				const tool = {
					name: 'read_file',
					description: 'Read a file',
					requiresApproval: true,
					deduplicate: true,
					invalidatesWorkspaceCache: true,
					parameters: {
						type: 'object',
						required: ['path'],
						properties: {
							path: { type: 'string' },
						},
					},
				};

				const chunks = await collectAsyncIterable(
					adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [], tools: [tool] }),
				);

				expect(requestBody).toEqual({
					model: SYNTHETIC_MODEL,
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
					options: { num_ctx: 16_384, num_predict: 4_096 },
					truncate: false,
					shift: false,
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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				const chunks = await collectAsyncIterable(
					adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
				);

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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				const chunks = await collectAsyncIterable(
					adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
				);

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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				await expect(
					collectAsyncIterable(
						adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
					),
				).rejects.toThrow('Ollama request failed with status 404');
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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				await expect(
					collectAsyncIterable(
						adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
					),
				).rejects.toThrow('Invalid Ollama stream JSON');
				expect(wasCancelled).toBe(true);
			},
		);
	});

	test('cancels the response stream when the consumer stops early', async () => {
		let wasCancelled = false;

		await withMockedFetch(
			async () => {
				return new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(
								new TextEncoder().encode('{"message":{"content":"partial"},"done":false}\n'),
							);
						},
						cancel() {
							wasCancelled = true;
						},
					}),
					{ status: 200 },
				);
			},
			async () => {
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);
				const iterator = adapter
					.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] })
					[Symbol.asyncIterator]();

				await expect(iterator.next()).resolves.toEqual({
					done: false,
					value: { contentDelta: 'partial' },
				});
				await iterator.return?.();

				expect(wasCancelled).toBe(true);
			},
		);
	});

	test('releases the response stream reader when aborted during an active read', async () => {
		const abortController = new AbortController();
		const readStarted = createDeferred();
		let responseBody: ReadableStream<Uint8Array> | undefined;

		await withMockedFetch(
			async (_input, init) => {
				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						init?.signal?.addEventListener(
							'abort',
							() => {
								controller.error(new DOMException('The operation was aborted.', 'AbortError'));
							},
							{ once: true },
						);
					},
					pull() {
						readStarted.resolve(undefined);
					},
				});

				const response = new Response(stream, { status: 200 });
				responseBody = response.body ?? undefined;

				return response;
			},
			async () => {
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);
				const iterator = adapter
					.streamChat({
						contextProfile: TEST_CONTEXT_PROFILE,
						messages: [],
						signal: abortController.signal,
					})
					[Symbol.asyncIterator]();
				const nextChunk = iterator.next();

				await readStarted.promise;
				abortController.abort();

				await expect(nextChunk).rejects.toThrow('aborted');
				expect(responseBody?.locked).toBe(false);
			},
		);
	});

	test('throws when Ollama streams an error event', async () => {
		await withMockedFetch(
			async () => new Response('{"error":"model failed"}\n', { status: 200 }),
			async () => {
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				await expect(
					collectAsyncIterable(
						adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
					),
				).rejects.toThrow('Ollama stream failed: model failed');
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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				await expect(
					collectAsyncIterable(
						adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
					),
				).rejects.toThrow('Ollama stream failed: model failed');
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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				await expect(
					collectAsyncIterable(
						adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
					),
				).rejects.toThrow('Ollama stream ended before completion.');
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
				const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);

				await expect(
					collectAsyncIterable(
						adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
					),
				).rejects.toThrow('Invalid Ollama tool arguments for read_file');
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

describe('Ollama model management boundaries', () => {
	for (const message of [
		`model '${SYNTHETIC_MODEL}' not found`,
		`model "${SYNTHETIC_MODEL}" not found`,
		'model not found',
	]) {
		test(`model-specific JSON 404 unload is already-unloaded success: ${message}`, async () => {
			await withMockedFetch(
				async () => Response.json({ error: message }, { status: 404 }),
				async () => {
					const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);
					await expect(adapter.unload()).resolves.toBeUndefined();
				},
			);
		});
	}

	for (const [status, body] of [
		[404, '{"error":"route not found"}'],
		[404, 'Not Found'],
		[404, '{"error":"model \'other-model\' not found"}'],
		[403, '{"error":"permission denied"}'],
		[500, '{"error":"internal server error"}'],
	] as const)
		test(`unrelated unload HTTP ${status} retains the provider error: ${body}`, async () => {
			await withMockedFetch(
				async () => new Response(body, { status }),
				async () => {
					const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);
					await expect(adapter.unload()).rejects.toThrow(
						`Ollama model unload failed with status ${status}: ${body}`,
					);
				},
			);
		});

	test('unload transport failure remains the original failure', async () => {
		const cause = new Error('connection refused');
		await withMockedFetch(
			async () => {
				throw cause;
			},
			async () => {
				await expect(
					new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL).unload(),
				).rejects.toBe(cause);
			},
		);
	});

	for (const keepAlive of [undefined, '0', '0s', '0m', '-1', '2m'])
		test(`manual activation requests a real load for keep-alive ${keepAlive}`, async () => {
			const signal = new AbortController().signal;
			await withMockedFetch(
				async (url, init) => {
					expect(String(url)).toBe('http://localhost:11434/api/chat');
					expect(init?.signal).toBe(signal);
					expect(JSON.parse(String(init?.body))).toEqual({
						model: SYNTHETIC_MODEL,
						messages: [],
						stream: false,
					});
					return Response.json({ model: SYNTHETIC_MODEL, done: true, done_reason: 'load' });
				},
				async () => {
					await expect(
						new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL, keepAlive).activate({
							signal,
						}),
					).resolves.toBeUndefined();
				},
			);
		});

	for (const [status, payload, hint] of [
		[404, `model '${SYNTHETIC_MODEL}' not found`, true],
		[400, `model '${SYNTHETIC_MODEL}' does not support tools`, true],
		[500, 'failed to load model: unsupported model architecture', true],
		[404, 'route not found', false],
		[403, 'permission denied', false],
		[500, 'failed to load model: permission denied', false],
		[500, 'failed to load model: connection refused', false],
		[500, 'internal server error', false],
	] as const)
		test(`model-specific inference/activation recovery classification: ${status} ${payload}`, async () => {
			for (const operation of ['activate', 'inference'] as const)
				await withMockedFetch(
					async () => Response.json({ error: payload }, { status }),
					async () => {
						const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);
						let caught: unknown;
						try {
							if (operation === 'activate') await adapter.activate();
							else
								await collectAsyncIterable(
									adapter.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
								);
						} catch (error) {
							caught = error;
						}
						expect(caught).toBeInstanceOf(Error);
						const message = (caught as Error).message;
						expect(message).toContain(payload);
						expect(message.includes('Use /model')).toBe(hint);
					},
				);
		});

	test('streamed model-specific error includes guidance without misclassifying generic stream failure', async () => {
		for (const [error, hint] of [
			[`model '${SYNTHETIC_MODEL}' not found`, true],
			['does not support tools', true],
			['network outage', false],
		] as const) {
			await withMockedFetch(
				async () => new Response(JSON.stringify({ error }) + '\n'),
				async () => {
					let caught: unknown;
					try {
						await collectAsyncIterable(
							new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL).streamChat({
								contextProfile: TEST_CONTEXT_PROFILE,
								messages: [],
							}),
						);
					} catch (error) {
						caught = error;
					}
					expect((caught as Error).message).toContain(`Ollama stream failed: ${error}`);
					expect((caught as Error).message.includes('Use /model')).toBe(hint);
				},
			);
		}
	});
});

describe('Ollama context profile and completion metadata', () => {
	for (const [contextWindowTokens, maxOutputTokens] of [
		[16_384, 4_096],
		[8_192, 2_048],
	]) {
		test(`maps the request profile ${contextWindowTokens}/${maxOutputTokens} on every request`, async () => {
			let requests = 0;
			await withMockedFetch(
				async (_url, init) => {
					const body = JSON.parse(String(init?.body));
					expect(body.options).toEqual({
						num_ctx: contextWindowTokens,
						num_predict: maxOutputTokens,
					});
					expect(body.truncate).toBe(false);
					expect(body.shift).toBe(false);
					requests += 1;
					return new Response('{"done":true,"done_reason":"stop"}\n');
				},
				async () => {
					const adapter = new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL);
					for (let i = 0; i < 3; i++)
						await collectAsyncIterable(
							adapter.streamChat({
								messages: [],
								contextProfile: {
									contextWindowTokens: contextWindowTokens!,
									maxOutputTokens: maxOutputTokens!,
								},
							}),
						);
				},
			);
			expect(requests).toBe(3);
		});
	}

	for (const [reason, expected] of [
		['stop', 'stop'],
		['length', 'length'],
		['tool_calls', 'tool'],
		['future_reason', 'unknown'],
	] as const) {
		test(`preserves final ${reason} and provider-reported prompt/output counts`, async () => {
			await withMockedFetch(
				async () =>
					new Response(
						'{"message":{"content":"Partial"},"done":false}\n' +
							JSON.stringify({
								done: true,
								done_reason: reason,
								prompt_eval_count: 4_066,
								eval_count: 30,
							}) +
							'\n',
					),
				async () => {
					const chunks = await collectAsyncIterable(
						new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL).streamChat({
							messages: [],
							contextProfile: TEST_CONTEXT_PROFILE,
						}),
					);
					expect(chunks).toEqual([
						{ contentDelta: 'Partial' },
						{
							contentDelta: '',
							finishReason: expected,
							usage: { promptTokens: 4_066, outputTokens: 30 },
						},
					]);
				},
			);
		});
	}

	test('drops invalid usage counters and does not invent a stop reason when absent', async () => {
		await withMockedFetch(
			async () => new Response('{"done":true,"prompt_eval_count":-1,"eval_count":2.5}\n'),
			async () => {
				expect(
					await collectAsyncIterable(
						new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL).streamChat({
							messages: [],
							contextProfile: TEST_CONTEXT_PROFILE,
						}),
					),
				).toEqual([]);
			},
		);
	});

	test('rejects invalid request profiles before HTTP invocation', async () => {
		let invoked = false;
		await withMockedFetch(
			async () => {
				invoked = true;
				return new Response('');
			},
			async () => {
				await expect(
					collectAsyncIterable(
						new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL).streamChat({
							messages: [],
							contextProfile: { contextWindowTokens: 4_096, maxOutputTokens: 4_096 },
						}),
					),
				).rejects.toThrow('maximum output tokens must be smaller');
			},
		);
		expect(invoked).toBe(false);
	});
});
