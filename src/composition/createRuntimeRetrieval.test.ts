import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test';
import { ModelSessionMemoryUpdater } from '@/application/services/ModelSessionMemoryUpdater';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { reduceAgentState } from '@/application/services/SessionReducer';
import type { AgentEvent } from '@/domain/AgentEvent';
import { asEventId, asMessageId, asSessionId } from '@/domain/Ids';
import { BinaryHistoryIndexStore } from '@/infrastructure/persistence/BinaryHistoryIndexStore';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { JsonModelPreferenceStore } from '@/infrastructure/persistence/JsonModelPreferenceStore';
import { toOllamaMessage, toOllamaTool } from '@/infrastructure/model/mappers/OllamaChatMapper';
import {
	assistantMessageCompletedEvent,
	promptSubmittedEvent,
} from '@/test-support/AgentEventFixtures';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { createDeferred } from '@/test-support/createDeferred';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { SYNTHETIC_MODEL } from '@/test-support/modelFixtures';
import { withMockedFetch } from '@/test-support/withMockedFetch';
import { readConfig } from './config';
import { createRuntime, type Runtime } from './createRuntime';
import { createLocalToolExecutor } from './factories/createLocalToolExecutor';

const EMBEDDING_MODEL = 'test-history-embedding';
const SESSION = asSessionId('retrieval-runtime');
const CURRENT_PROMPT = 'How should our database migration handle the chosen storage engine?';
const FINAL_ANSWER = 'Use migrations for the selected database.';
const EVENTS_FILE = join('.agent', 'sessions', SESSION, 'events.jsonl');
const INDEX_FILE = join('.agent', 'history-index', `${SESSION}.bin`);

type WireMessage = { role: string; content: string };
type ChatBody = {
	model: string;
	messages: WireMessage[];
	tools: unknown[];
	options: { num_ctx: number; num_predict: number };
	truncate: boolean;
	shift: boolean;
};

const withWorkspace = async (run: () => Promise<void>): Promise<void> => {
	const originalDirectory = process.cwd();
	const temporary = await createTempDirectory('phase17-runtime-retrieval-');
	try {
		process.chdir(temporary.directory);
		await run();
	} finally {
		process.chdir(originalDirectory);
		await temporary.cleanup();
	}
};

const seedHistory = async (): Promise<{ events: AgentEvent[]; durable: string }> => {
	const events: AgentEvent[] = [];
	const history = [
		[
			'Use PostgreSQL rather than SQLite for this project.',
			'Database migrations should target PostgreSQL.',
		],
		['Inspect the color palette.', 'The palette is purple.'],
		['Please keep CLI help brief.', 'I will keep help concise.'],
	] as const;
	for (const [index, [prompt, content]] of history.entries()) {
		events.push(
			promptSubmittedEvent({
				sessionId: SESSION,
				id: asEventId(`history-prompt-${index}`),
				messageId: asMessageId(`history-user-${index}`),
				prompt,
				modelName: 'historical-unavailable-chat-model',
			}),
			assistantMessageCompletedEvent({
				sessionId: SESSION,
				id: asEventId(`history-answer-${index}`),
				messageId: asMessageId(`history-assistant-${index}`),
				content,
			}),
		);
	}
	const store = new JsonlSessionStore();
	for (const event of events) await store.appendSessionEvent(event);
	return { events, durable: await readFile(EVENTS_FILE, 'utf8') };
};

const catalogResponse = (): Response =>
	Response.json({ models: [{ name: SYNTHETIC_MODEL }, { name: EMBEDDING_MODEL }] });
const chatResponse = (): Response =>
	new Response(
		`${JSON.stringify({ message: { content: FINAL_ANSWER }, done: true, done_reason: 'stop' })}\n`,
	);
const embeddingResponse = (body: { model: string; input: string[] }): Response => {
	expect(body.model).toBe(EMBEDDING_MODEL);
	return Response.json({
		model: EMBEDDING_MODEL,
		embeddings: body.input.map((text) =>
			text === CURRENT_PROMPT || text.includes('PostgreSQL') ? [1, 0] : [0, 1],
		),
	});
};
const runCurrent = (runtime: Runtime, signal?: AbortSignal) =>
	collectAsyncIterable(
		runtime.runTurn({
			sessionId: SESSION,
			prompt: CURRENT_PROMPT,
			...(signal === undefined ? {} : { signal }),
		}),
	);
const assertWireGuarantees = (body: ChatBody): void => {
	expect(body.model).toBe(SYNTHETIC_MODEL);
	expect(body.options).toEqual({ num_ctx: 16_384, num_predict: 4_096 });
	expect(body.truncate).toBe(false);
	expect(body.shift).toBe(false);
	expect(body.tools).toEqual(createLocalToolExecutor().listTools().map(toOllamaTool));
	expect(body.tools).toHaveLength(9);
	expect(body.messages[0]).toEqual({ role: 'system', content: 'Use workspace-relative paths.' });
	expect(body.messages.at(-1)).toEqual({ role: 'user', content: CURRENT_PROMPT });
};
const assertDurableCompletion = async (
	runtime: Runtime,
	baseline: { events: AgentEvent[]; durable: string },
): Promise<void> => {
	const events = await runtime.listSessionEvents(SESSION);
	expect(events.slice(0, baseline.events.length)).toEqual(baseline.events);
	expect(events).toHaveLength(baseline.events.length + 2);
	expect(events.at(-2)).toMatchObject({
		type: 'prompt.submitted',
		prompt: CURRENT_PROMPT,
		modelName: SYNTHETIC_MODEL,
	});
	expect(events.at(-1)).toMatchObject({
		type: 'assistant.message.completed',
		content: FINAL_ANSWER,
	});
	expect(events.some((event) => event.type === 'agent.error')).toBe(false);
	expect((await readFile(EVENTS_FILE, 'utf8')).startsWith(baseline.durable)).toBe(true);
	expect(reduceAgentState(SESSION, events).messages).toHaveLength(8);
	expect(await new JsonlSessionStore().readSessionEvents(SESSION)).toEqual(events);
};

describe('createRuntime historical retrieval composition', () => {
	let memoryUpdate: ReturnType<typeof spyOn>;
	beforeEach(() => {
		memoryUpdate = spyOn(ModelSessionMemoryUpdater.prototype, 'update').mockResolvedValue({
			version: 1,
			goal: null,
			changes: [],
		});
	});
	afterEach(() => memoryUpdate.mockRestore());
	test('disabled embeddings make no retrieval requests and retain safe Phase 16 context', async () => {
		await withWorkspace(async () => {
			const baseline = await seedHistory();
			let chatRequests = 0;
			await withMockedFetch(
				async (url, init) => {
					if (String(url).endsWith('/api/tags')) return catalogResponse();
					expect(String(url)).toBe('http://localhost:11434/api/chat');
					chatRequests += 1;
					const body: ChatBody = JSON.parse(String(init?.body));
					assertWireGuarantees(body);
					expect(body.messages.slice(1, -1) as unknown).toEqual(
						reduceAgentState(SESSION, baseline.events).messages.map(toOllamaMessage),
					);
					return chatResponse();
				},
				async () => {
					const runtime = createRuntime(
						readConfig({ OLLAMA_MODEL: SYNTHETIC_MODEL, TEST_MODEL: 'ignored-live-chat-model' }),
					);
					expect(await runCurrent(runtime)).toEqual([{ contentDelta: FINAL_ANSWER }]);
					await assertDurableCompletion(runtime, baseline);
					expect(chatRequests).toBe(1);
					expect(await readdir('.agent')).toEqual(['session-memory', 'sessions']);
				},
			);
		});
	});

	test('configured retrieval inserts exact relevant history and previous context while preserving chat preference', async () => {
		await withWorkspace(async () => {
			const baseline = await seedHistory();
			await new JsonModelPreferenceStore().writeLastSelectedModel(SYNTHETIC_MODEL);
			const preferenceBefore = await readFile('.agent/model-preference.json', 'utf8');
			const embedded: string[][] = [];
			let chatRequests = 0;
			await withMockedFetch(
				async (url, init) => {
					if (String(url).endsWith('/api/tags')) return catalogResponse();
					if (String(url).endsWith('/api/embed')) {
						const body = JSON.parse(String(init?.body));
						expect(body.truncate).toBe(false);
						embedded.push(body.input);
						return embeddingResponse(body);
					}
					expect(String(url)).toBe('http://localhost:11434/api/chat');
					chatRequests += 1;
					const body: ChatBody = JSON.parse(String(init?.body));
					assertWireGuarantees(body);
					const canonical = reduceAgentState(SESSION, baseline.events).messages;
					expect(body.messages.slice(1, -1) as unknown).toEqual(
						[...canonical.slice(0, 2), ...canonical.slice(4)].map(toOllamaMessage),
					);
					return chatResponse();
				},
				async () => {
					const runtime = createRuntime(
						readConfig({
							HISTORY_EMBEDDING_MODEL: EMBEDDING_MODEL,
							TEST_MODEL: 'ignored-live-model',
						}),
					);
					expect(runtime.getModelName()).toBeUndefined();
					expect(await runtime.initializeModels()).toMatchObject({
						status: 'selected',
						modelName: SYNTHETIC_MODEL,
					});
					expect(embedded).toHaveLength(0);
					expect(await runCurrent(runtime)).toEqual([{ contentDelta: FINAL_ANSWER }]);
					expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
					expect(chatRequests).toBe(1);
					expect(embedded).toHaveLength(2);
					expect(embedded[0]).toEqual([CURRENT_PROMPT]);
					expect(embedded[1]).toHaveLength(3);
					await assertDurableCompletion(runtime, baseline);
					expect(await readFile('.agent/model-preference.json', 'utf8')).toBe(preferenceBefore);
					const index = await new BinaryHistoryIndexStore().read(SESSION);
					expect(index).toMatchObject({ sessionId: SESSION, dimension: 2 });
					expect(index?.modelIdentity).toBe(
						JSON.stringify(['ollama', 'http://localhost:11434', EMBEDDING_MODEL]),
					);
					expect(index?.entries.map((entry) => entry.turnId)).toEqual([
						'history-user-0',
						'history-user-1',
						'history-user-2',
					]);
				},
			);
		});
	});

	for (const cache of ['missing', 'corrupt'] as const) {
		test(`embedding failure with ${cache} cache falls back and completes normal chat`, async () => {
			await withWorkspace(async () => {
				const baseline = await seedHistory();
				const corruptBytes = Buffer.from('corrupt derived vector cache');
				if (cache === 'corrupt') {
					await mkdir('.agent/history-index');
					await writeFile(INDEX_FILE, corruptBytes);
				}
				let embeddingRequests = 0;
				let chatRequests = 0;
				await withMockedFetch(
					async (url, init) => {
						if (String(url).endsWith('/api/tags')) return catalogResponse();
						if (String(url).endsWith('/api/embed')) {
							embeddingRequests += 1;
							return Response.json({ error: 'embedding model unavailable' }, { status: 404 });
						}
						expect(String(url)).toBe('http://localhost:11434/api/chat');
						chatRequests += 1;
						const body: ChatBody = JSON.parse(String(init?.body));
						assertWireGuarantees(body);
						expect(body.messages.slice(1, -1) as unknown).toEqual(
							reduceAgentState(SESSION, baseline.events).messages.map(toOllamaMessage),
						);
						return chatResponse();
					},
					async () => {
						const runtime = createRuntime(
							readConfig({
								OLLAMA_MODEL: SYNTHETIC_MODEL,
								HISTORY_EMBEDDING_MODEL: EMBEDDING_MODEL,
							}),
						);
						expect(await runCurrent(runtime)).toEqual([{ contentDelta: FINAL_ANSWER }]);
						expect(embeddingRequests).toBe(1);
						expect(chatRequests).toBe(1);
						expect(runtime.getModelSelection()).toMatchObject({
							status: 'selected',
							modelName: SYNTHETIC_MODEL,
						});
						await assertDurableCompletion(runtime, baseline);
						if (cache === 'corrupt') expect(await readFile(INDEX_FILE)).toEqual(corruptBytes);
						else expect(await readdir('.agent')).toEqual(['session-memory', 'sessions']);
					},
				);
			});
		});
	}

	test('corrupt derived cache rebuilds from durable history before semantic selection', async () => {
		await withWorkspace(async () => {
			const baseline = await seedHistory();
			await mkdir('.agent/history-index');
			await writeFile(INDEX_FILE, 'invalid-cache');
			let embeddingRequests = 0;
			await withMockedFetch(
				async (url, init) => {
					if (String(url).endsWith('/api/tags')) return catalogResponse();
					if (String(url).endsWith('/api/embed')) {
						embeddingRequests += 1;
						return embeddingResponse(JSON.parse(String(init?.body)));
					}
					expect(String(url)).toBe('http://localhost:11434/api/chat');
					const body: ChatBody = JSON.parse(String(init?.body));
					assertWireGuarantees(body);
					expect(
						body.messages.some((message) => message.content === 'Inspect the color palette.'),
					).toBe(false);
					expect(
						body.messages.filter((message) => message.content.includes('PostgreSQL')),
					).toHaveLength(2);
					return chatResponse();
				},
				async () => {
					const runtime = createRuntime(
						readConfig({ OLLAMA_MODEL: SYNTHETIC_MODEL, HISTORY_EMBEDDING_MODEL: EMBEDDING_MODEL }),
					);
					expect(await runCurrent(runtime)).toEqual([{ contentDelta: FINAL_ANSWER }]);
					expect(embeddingRequests).toBe(2);
					expect((await new BinaryHistoryIndexStore().read(SESSION))?.entries).toHaveLength(3);
					await assertDurableCompletion(runtime, baseline);
				},
			);
		});
	});

	test('caller cancellation aborts active embedding and prevents chat invocation', async () => {
		await withWorkspace(async () => {
			const baseline = await seedHistory();
			const controller = new AbortController();
			const embeddingStarted = createDeferred();
			let embeddingAborted = false;
			let chatRequests = 0;
			await withMockedFetch(
				async (url, init) => {
					if (String(url).endsWith('/api/tags')) return catalogResponse();
					if (String(url).endsWith('/api/embed')) {
						expect(init?.signal).toBeInstanceOf(AbortSignal);
						return new Promise<Response>((_resolve, reject) => {
							init?.signal?.addEventListener(
								'abort',
								() => {
									embeddingAborted = true;
									reject(new DOMException('The operation was aborted.', 'AbortError'));
								},
								{ once: true },
							);
							embeddingStarted.resolve(undefined);
						});
					}
					chatRequests += 1;
					return chatResponse();
				},
				async () => {
					const runtime = createRuntime(
						readConfig({ OLLAMA_MODEL: SYNTHETIC_MODEL, HISTORY_EMBEDDING_MODEL: EMBEDDING_MODEL }),
					);
					const turn = runCurrent(runtime, controller.signal).catch((error: unknown) => error);
					await embeddingStarted.promise;
					controller.abort('caller-cancelled');
					expect(await turn).toMatchObject({ name: 'AbortError' });
					expect(embeddingAborted).toBe(true);
					expect(chatRequests).toBe(0);
					expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
					const events = await runtime.listSessionEvents(SESSION);
					expect(events.slice(0, baseline.events.length)).toEqual(baseline.events);
					expect(events).toHaveLength(baseline.events.length + 1);
					expect(events.at(-1)).toMatchObject({ type: 'prompt.submitted', prompt: CURRENT_PROMPT });
					expect((await readFile(EVENTS_FILE, 'utf8')).startsWith(baseline.durable)).toBe(true);
					expect(await readdir('.agent')).toEqual(['sessions']);
				},
			);
		});
	});
});
