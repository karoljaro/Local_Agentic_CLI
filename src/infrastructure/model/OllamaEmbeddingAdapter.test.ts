import { describe, expect, test } from 'bun:test';

import { createDeferred } from '@/test-support/createDeferred';
import { withMockedFetch } from '@/test-support/withMockedFetch';

import { OllamaEmbeddingAdapter } from './OllamaEmbeddingAdapter';

const EMBEDDING_MODEL = 'test-embedding-model';
const BASE_URL = 'http://localhost:11434';

describe('OllamaEmbeddingAdapter', () => {
	test('maps a bounded batch separately from chat and normalizes returned vectors', async () => {
		const texts = ['Use PostgreSQL for persistence.', 'How do migrations work?'] as const;
		const signal = new AbortController().signal;
		await withMockedFetch(
			async (url, init) => {
				expect(String(url)).toBe(`${BASE_URL}/api/embed`);
				expect(init?.method).toBe('POST');
				expect(init?.signal).toBe(signal);
				expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
				expect(JSON.parse(String(init?.body))).toEqual({
					model: EMBEDDING_MODEL,
					input: texts,
					truncate: false,
				});
				return Response.json({
					model: EMBEDDING_MODEL,
					embeddings: [
						[3, 4],
						[0, -2],
					],
				});
			},
			async () => {
				const adapter = new OllamaEmbeddingAdapter(` ${BASE_URL}/// `, ` ${EMBEDDING_MODEL} `);
				expect(adapter.modelIdentity).toBe(JSON.stringify(['ollama', BASE_URL, EMBEDDING_MODEL]));
				const vectors = await adapter.embed(texts, signal);
				expect(vectors).toHaveLength(2);
				expect(vectors[0]).toBeInstanceOf(Float32Array);
				expect(vectors[0]?.[0]).toBeCloseTo(0.6);
				expect(vectors[0]?.[1]).toBeCloseTo(0.8);
				expect(vectors[1]).toEqual(new Float32Array([0, -1]));
			},
		);
	});

	test('accepts the maximum 32-text batch without changing order', async () => {
		const texts = Array.from({ length: 32 }, (_, index) => `text-${index}`);
		await withMockedFetch(
			async (_url, init) => {
				expect(JSON.parse(String(init?.body)).input).toEqual(texts);
				return Response.json({
					model: EMBEDDING_MODEL,
					embeddings: texts.map((_, index) => [index + 1, 1]),
				});
			},
			async () => {
				const vectors = await new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(texts);
				expect(vectors).toHaveLength(32);
				expect(vectors[0]?.[0]).toBeCloseTo(1 / Math.sqrt(2));
				expect(vectors[31]?.[0]).toBeCloseTo(32 / Math.sqrt(1025));
			},
		);
	});

	for (const size of [0, 33]) {
		test(`rejects a ${size}-text batch before HTTP invocation`, async () => {
			let requests = 0;
			await withMockedFetch(
				async () => {
					requests += 1;
					return new Response('');
				},
				async () => {
					await expect(
						new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(Array(size).fill('text')),
					).rejects.toThrow('Embedding batch must contain 1–32 texts.');
					expect(requests).toBe(0);
				},
			);
		});
	}

	test('keeps source/model identity independent of chat selection', () => {
		const adapter = new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL);
		expect(new OllamaEmbeddingAdapter(`${BASE_URL}/`, ` ${EMBEDDING_MODEL} `).modelIdentity).toBe(
			adapter.modelIdentity,
		);
		expect(
			new OllamaEmbeddingAdapter('http://localhost:22434', EMBEDDING_MODEL).modelIdentity,
		).not.toBe(adapter.modelIdentity);
		expect(new OllamaEmbeddingAdapter(BASE_URL, 'other-embedding-model').modelIdentity).not.toBe(
			adapter.modelIdentity,
		);
	});

	test('rejects blank endpoint and model configuration', () => {
		expect(() => new OllamaEmbeddingAdapter(' ', EMBEDDING_MODEL)).toThrow(
			'Ollama base URL cannot be empty.',
		);
		expect(() => new OllamaEmbeddingAdapter(BASE_URL, ' ')).toThrow(
			'Ollama model name cannot be empty.',
		);
	});

	test('omits an abort signal when none is provided', async () => {
		await withMockedFetch(
			async (_url, init) => {
				expect(init).not.toHaveProperty('signal');
				return Response.json({ model: EMBEDDING_MODEL, embeddings: [[1]] });
			},
			async () => {
				expect(await new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text'])).toEqual(
					[new Float32Array([1])],
				);
			},
		);
	});

	test('rejects caller cancellation before HTTP invocation', async () => {
		const controller = new AbortController();
		controller.abort('caller-specific reason');
		let requests = 0;
		await withMockedFetch(
			async () => {
				requests += 1;
				return new Response('');
			},
			async () => {
				await expect(
					new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text'], controller.signal),
				).rejects.toMatchObject({ name: 'AbortError' });
				expect(requests).toBe(0);
			},
		);
	});

	test('stops an active response-body read when its caller aborts', async () => {
		const controller = new AbortController();
		const readStarted = createDeferred();
		let bodyReadAborted = false;
		await withMockedFetch(
			async (_url, init) => {
				const stream = new ReadableStream<Uint8Array>({
					start(streamController) {
						init?.signal?.addEventListener(
							'abort',
							() => {
								bodyReadAborted = true;
								streamController.error(
									new DOMException('The operation was aborted.', 'AbortError'),
								);
							},
							{ once: true },
						);
					},
					pull() {
						readStarted.resolve(undefined);
					},
				});
				return new Response(stream);
			},
			async () => {
				const embedding = new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(
					['text'],
					controller.signal,
				);
				await readStarted.promise;
				controller.abort();
				await expect(embedding).rejects.toMatchObject({ name: 'AbortError' });
				expect(bodyReadAborted).toBe(true);
			},
		);
	});

	test('checks cancellation after the provider response arrives', async () => {
		const controller = new AbortController();
		await withMockedFetch(
			async () => {
				controller.abort();
				return Response.json({ model: EMBEDDING_MODEL, embeddings: [[1]] });
			},
			async () => {
				await expect(
					new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text'], controller.signal),
				).rejects.toMatchObject({ name: 'AbortError' });
			},
		);
	});

	test('preserves transport failure without chat model-selection guidance', async () => {
		const error = new Error('connection refused');
		await withMockedFetch(
			async () => {
				throw error;
			},
			async () => {
				await expect(
					new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text']),
				).rejects.toBe(error);
			},
		);
	});

	for (const status of [400, 404, 500]) {
		test(`preserves embedding HTTP ${status} errors without chat recovery`, async () => {
			await withMockedFetch(
				async () => Response.json({ error: 'embedding unavailable' }, { status }),
				async () => {
					await expect(
						new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text']),
					).rejects.toThrow(
						`Ollama embedding request failed with status ${status}: {"error":"embedding unavailable"}`,
					);
				},
			);
		});
	}

	test('bounds oversized provider error text', async () => {
		await withMockedFetch(
			async () => new Response('x'.repeat(5000), { status: 500 }),
			async () => {
				let failure: unknown;
				try {
					await new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text']);
				} catch (error) {
					failure = error;
				}
				expect(failure).toBeInstanceOf(Error);
				expect((failure as Error).message).toContain(
					'Ollama embedding request failed with status 500',
				);
				expect((failure as Error).message.length).toBeLessThan(1100);
			},
		);
	});

	test('rejects malformed JSON instead of manufacturing a vector', async () => {
		await withMockedFetch(
			async () => new Response('not-json'),
			async () => {
				await expect(
					new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text']),
				).rejects.toThrow();
			},
		);
	});

	for (const [label, payload] of [
		['null response', null],
		['missing model', { embeddings: [[1]] }],
		['different model', { model: 'different-model', embeddings: [[1]] }],
		['missing embeddings', { model: EMBEDDING_MODEL }],
		['nonarray embeddings', { model: EMBEDDING_MODEL, embeddings: {} }],
		['no vectors', { model: EMBEDDING_MODEL, embeddings: [] }],
		['too many vectors', { model: EMBEDDING_MODEL, embeddings: [[1], [1]] }],
	] as const) {
		test(`rejects ${label}`, async () => {
			await withMockedFetch(
				async () => Response.json(payload),
				async () => {
					await expect(
						new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text']),
					).rejects.toThrow('Invalid Ollama embedding response.');
				},
			);
		});
	}

	for (const [label, vector, error] of [
		['nonarray vector', 1, 'Invalid Ollama embedding vector.'],
		['empty vector', [], 'Invalid Ollama embedding vector.'],
		['string coordinate', ['1', 2], 'Invalid Ollama embedding vector.'],
		['null coordinate', [null, 1], 'Invalid Ollama embedding vector.'],
		['zero vector', [0, 0], 'Embedding has zero or invalid norm.'],
		['Float32 overflow', [1e40], 'Embedding contains nonfinite values.'],
		['Float32 underflow to zero', [1e-50], 'Embedding has zero or invalid norm.'],
	] as const) {
		test(`rejects ${label}`, async () => {
			await withMockedFetch(
				async () => Response.json({ model: EMBEDDING_MODEL, embeddings: [vector] }),
				async () => {
					await expect(
						new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text']),
					).rejects.toThrow(error);
				},
			);
		});
	}

	test('rejects JSON numeric overflow before Float32 conversion', async () => {
		await withMockedFetch(
			async () => new Response(`{"model":"${EMBEDDING_MODEL}","embeddings":[[1e309]]}`),
			async () => {
				await expect(
					new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text']),
				).rejects.toThrow('Invalid Ollama embedding vector.');
			},
		);
	});

	test('rejects inconsistent dimensions within a returned batch', async () => {
		await withMockedFetch(
			async () => Response.json({ model: EMBEDDING_MODEL, embeddings: [[1], [1, 0]] }),
			async () => {
				await expect(
					new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['first', 'second']),
				).rejects.toThrow('Inconsistent Ollama embedding dimensions.');
			},
		);
	});

	test('rejects an excessive vector dimension', async () => {
		await withMockedFetch(
			async () => Response.json({ model: EMBEDDING_MODEL, embeddings: [Array(65_537).fill(1)] }),
			async () => {
				await expect(
					new OllamaEmbeddingAdapter(BASE_URL, EMBEDDING_MODEL).embed(['text']),
				).rejects.toThrow('Invalid embedding dimension.');
			},
		);
	});
});
