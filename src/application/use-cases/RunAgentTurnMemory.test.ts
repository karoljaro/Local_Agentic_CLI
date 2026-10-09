import { describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RunAgentTurn } from './RunAgentTurn';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { SessionMemoryService } from '@/application/services/SessionMemoryService';
import { SessionService } from '@/application/services/SessionService';
import { reduceAgentState } from '@/application/services/SessionReducer';
import { HistoryRetriever } from '@/application/services/HistoryRetriever';
import { BinaryHistoryIndexStore } from '@/infrastructure/persistence/BinaryHistoryIndexStore';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { JsonSessionMemoryStore } from '@/infrastructure/persistence/JsonSessionMemoryStore';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { TemporalClock } from '@/infrastructure/runtime/TemporalClock';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { FakeMemoryStore, FakeMemoryUpdater } from '@/test-support/SessionMemoryFixtures';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { RecordingToolExecutor } from '@/test-support/RecordingToolExecutor';
import { asSessionId } from '@/domain/Ids';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { ModelStreamChunk } from '@/application/ports/ModelPort';
import type { SessionStorePort } from '@/application/ports/SessionStorePort';

const sessionId = asSessionId('memory-agent');
const response = (contentDelta = 'Done.'): ModelStreamChunk[] => [
	{ contentDelta, finishReason: 'stop' },
];
const call = (name: string, args: unknown): ModelStreamChunk[] => [
	{ contentDelta: '', toolCalls: [{ name, arguments: args }], finishReason: 'tool' },
];
const builder = () =>
	new ContextBuilder({
		systemPrompt: 'Use workspace-relative paths.',
		contextProfile: { contextWindowTokens: 16384, maxOutputTokens: 4096 },
	});
const setup = (
	responses: ConstructorParameters<typeof ScriptedModel>[0],
	durable: SessionStorePort = new InMemorySessionStore(),
	memoryStore = new FakeMemoryStore(),
) => {
	const sessions = new SessionService(durable);
	const updater = new FakeMemoryUpdater();
	const memory = new SessionMemoryService(sessions, memoryStore, updater, 20);
	const model = new ScriptedModel(responses);
	const dependencies = {
		sessionStore: sessions,
		sessionMemory: memory,
		model,
		contextBuilder: builder(),
		clock: new TemporalClock(),
		idGenerator: new BunUuidV7IdGenerator(),
	};
	return { sessions, updater, memory, model, memoryStore, dependencies };
};
describe('agent memory completion boundaries', () => {
	test('one semantic operation follows durable final completion and ordinary answer remains exact', async () => {
		const durable = new InMemorySessionStore();
		const h = setup([response()], durable);
		h.updater.handler = (input) => {
			expect(durable.events.at(-1)?.type).toBe('assistant.message.completed');
			return {
				version: 1,
				goal: {
					mode: 'initial',
					text: 'Implement the service.',
					evidence: { messageId: input.evidence[0]!.messageId, quote: 'Implement the service.' },
				},
				changes: [],
			};
		};
		const result = await collectAsyncIterable(
			new RunAgentTurn(h.dependencies).run({ sessionId, prompt: 'Implement the service.' }),
		);
		expect(result).toEqual([{ contentDelta: 'Done.' }]);
		expect(h.updater.inputs).toHaveLength(1);
		expect(h.memoryStore.writes).toHaveLength(1);
		expect(h.memory.snapshot(sessionId)?.goal?.text).toBe('Implement the service.');
		expect(durable.events).toHaveLength(2);
	});
	test('memory failure cannot invalidate a completed answer or add agent errors', async () => {
		const durable = new InMemorySessionStore();
		const h = setup([response()], durable);
		h.updater.handler = () => {
			throw new Error('offline');
		};
		expect(
			await collectAsyncIterable(
				new RunAgentTurn(h.dependencies).run({ sessionId, prompt: 'Work.' }),
			),
		).toEqual([{ contentDelta: 'Done.' }]);
		expect(durable.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.message.completed',
		]);
		expect(h.memoryStore.writes.at(-1)?.updater.status).toBe('failed');
	});
	for (const kind of ['model-error', 'length', 'partial', 'final-append-error'])
		test(`${kind} never invokes semantic extraction`, async () => {
			const durable = new InMemorySessionStore();
			if (kind === 'final-append-error')
				durable.appendSessionEvent = async (event) => {
					if (event.type === 'assistant.message.completed') throw new Error('disk failure');
					durable.events.push(event);
				};
			const h = setup(
				[
					kind === 'model-error'
						? new Error('offline')
						: kind === 'partial'
							? { chunks: response(), error: new Error('cut off') }
							: kind === 'length'
								? [{ contentDelta: 'partial', finishReason: 'length' }]
								: response(),
				],
				durable,
			);
			await expect(
				collectAsyncIterable(new RunAgentTurn(h.dependencies).run({ sessionId, prompt: 'Work.' })),
			).rejects.toThrow();
			expect(h.updater.inputs).toHaveLength(0);
			expect(h.memory.snapshot(sessionId)?.completed).toEqual([]);
		});
	test('early iterator closure cannot create completed state', async () => {
		const h = setup([response('Partial answer.')]);
		const iterator = new RunAgentTurn(h.dependencies)
			.run({ sessionId, prompt: 'Work.' })
			[Symbol.asyncIterator]();
		expect((await iterator.next()).done).toBe(false);
		await iterator.return?.();
		expect(h.updater.inputs).toHaveLength(0);
		expect(
			(await h.sessions.readSessionEvents(sessionId)).some(
				(event) => event.type === 'assistant.message.completed',
			),
		).toBe(false);
	});
	test('denial terminal answer never becomes semantic success or file modification', async () => {
		const h = setup([call('create_file', { path: 'a.ts', content: 'body' })]);
		const executor = new RecordingToolExecutor(
			[{ name: 'create_file', description: 'create', parameters: {}, requiresApproval: true }],
			() => {
				throw new Error('must not execute');
			},
		);
		await collectAsyncIterable(
			new RunAgentTurn({ ...h.dependencies, toolExecutor: executor }).run({
				sessionId,
				prompt: 'Create a.ts.',
			}),
		);
		expect(h.updater.inputs).toHaveLength(0);
		expect(h.memory.snapshot(sessionId)?.files).toEqual([]);
		expect(h.memory.snapshot(sessionId)?.completed).toEqual([]);
		expect(h.memory.snapshot(sessionId)?.problems).toHaveLength(1);
	});
	test('multi-round tool chain projects files but semantic completion waits until final answer', async () => {
		const h = setup([
			call('read_file', { path: 'a.ts' }),
			call('edit_file', { path: 'a.ts' }),
			response('Edit finished.'),
		]);
		const executor = new RecordingToolExecutor(
			[
				{ name: 'read_file', description: 'read', parameters: {} },
				{ name: 'edit_file', description: 'edit', parameters: {} },
			],
			(request) => {
				expect(h.updater.inputs).toHaveLength(0);
				expect(h.memory.snapshot(sessionId)?.completed).toEqual([]);
				return {
					toolName: request.toolName,
					output:
						request.toolName === 'read_file'
							? { path: 'a.ts', content: 'old' }
							: { path: 'a.ts', changed: true },
				};
			},
		);
		h.updater.handler = (input) => ({
			version: 1,
			goal: null,
			changes: [
				{
					operation: 'upsert',
					category: 'completed',
					key: 'edit',
					text: 'Edit finished.',
					evidence: { messageId: input.evidence.at(-1)!.messageId, quote: 'Edit finished.' },
				},
			],
		});
		await collectAsyncIterable(
			new RunAgentTurn({ ...h.dependencies, toolExecutor: executor }).run({
				sessionId,
				prompt: 'Edit a.ts.',
			}),
		);
		expect(h.model.receivedInputs).toHaveLength(3);
		expect(h.updater.inputs).toHaveLength(1);
		expect(h.memory.snapshot(sessionId)?.files[0]?.activity).toBe('modified');
		expect(h.memory.snapshot(sessionId)?.completed[0]?.text).toBe('Edit finished.');
	});
	test('interrupted multi-call batch preserves first exact committed operation without canonical batch completion', async () => {
		const h = setup([
			[
				{
					contentDelta: '',
					toolCalls: [
						{ name: 'create_file', arguments: { path: 'a.ts' } },
						{ name: 'create_file', arguments: { path: 'b.ts' } },
					],
				},
			],
		]);
		const controller = new AbortController();
		const executor = new RecordingToolExecutor(
			[{ name: 'create_file', description: 'create', parameters: {} }],
			(request) => {
				controller.abort();
				return {
					toolName: 'create_file',
					output: { path: (request.toolInput as { path: string }).path, created: true },
				};
			},
		);
		await expect(
			collectAsyncIterable(
				new RunAgentTurn({ ...h.dependencies, toolExecutor: executor }).run({
					sessionId,
					prompt: 'Create two files.',
					signal: controller.signal,
				}),
			),
		).rejects.toThrow();
		expect(executor.receivedRequests).toHaveLength(1);
		expect(h.memory.snapshot(sessionId)?.files[0]).toMatchObject({
			path: 'a.ts',
			activity: 'created',
		});
		expect(h.updater.inputs).toHaveLength(0);
		expect((await h.sessions.readSessionState(sessionId)).messages).toHaveLength(1);
		const events = await h.sessions.readSessionEvents(sessionId);
		expect(events.some((event) => event.type === 'tool.call.completed')).toBe(true);
		expect(events.some((event) => event.type === 'assistant.message.completed')).toBe(false);
	});
	test('cancel during memory inference preserves already committed answer and discards semantic result', async () => {
		const h = setup([response()]);
		const controller = new AbortController();
		h.updater.handler = (input) => {
			controller.abort();
			expect(input.signal.aborted).toBe(true);
			return {
				version: 1,
				goal: {
					mode: 'initial',
					text: 'Work.',
					evidence: { messageId: input.evidence[0]!.messageId, quote: 'Work.' },
				},
				changes: [],
			};
		};
		expect(
			await collectAsyncIterable(
				new RunAgentTurn(h.dependencies).run({
					sessionId,
					prompt: 'Work.',
					signal: controller.signal,
				}),
			),
		).toEqual([{ contentDelta: 'Done.' }]);
		expect((await h.sessions.readSessionEvents(sessionId)).at(-1)?.type).toBe(
			'assistant.message.completed',
		);
		expect(h.memory.snapshot(sessionId)?.goal).toBeNull();
	});
	test('abort racing final append keeps completion truthful and skips optional inference', async () => {
		const durable = new InMemorySessionStore();
		const controller = new AbortController();
		durable.appendSessionEvent = async (event) => {
			durable.events.push(event);
			if (event.type === 'assistant.message.completed') controller.abort();
		};
		const h = setup([response()], durable);
		expect(
			await collectAsyncIterable(
				new RunAgentTurn(h.dependencies).run({
					sessionId,
					prompt: 'Work.',
					signal: controller.signal,
				}),
			),
		).toEqual([{ contentDelta: 'Done.' }]);
		expect(h.updater.inputs).toHaveLength(0);
		expect(durable.events.at(-1)?.type).toBe('assistant.message.completed');
	});
});

describe('real JSONL memory restore and independent retrieval', () => {
	test('real filesystem mutation, semantic persistence, restart, provenance and exact canonical retrieval coexist', async () => {
		const { directory, cleanup } = await createTempDirectory('phase18-loop-');
		try {
			const durable = new JsonlSessionStore(join(directory, 'sessions'));
			const store = new JsonSessionMemoryStore(join(directory, 'memory'));
			const sessions = new SessionService(durable);
			const updater = new FakeMemoryUpdater();
			const memory = new SessionMemoryService(sessions, store, updater);
			await writeFile(join(directory, 'service.ts'), 'mode=old\n');
			const model = new ScriptedModel([
				call('edit_file', { path: 'service.ts', edits: [{ oldText: 'old', newText: 'postgres' }] }),
				response('Implemented PostgreSQL file service.'),
				response('Typecheck passed.'),
				response('Use the chosen database.'),
			]);
			updater.handler = (input) =>
				input.memory.goal
					? { version: 1, goal: null, changes: [] }
					: {
							version: 1,
							goal: {
								mode: 'initial',
								text: 'Implement a file service.',
								evidence: {
									messageId: input.evidence[0]!.messageId,
									quote: 'Implement a file service.',
								},
							},
							changes: [
								{
									operation: 'upsert',
									category: 'decisions',
									key: 'database',
									text: 'Use PostgreSQL.',
									evidence: { messageId: input.evidence[0]!.messageId, quote: 'Use PostgreSQL.' },
								},
							],
						};
			const dependencies = {
				sessionStore: sessions,
				sessionMemory: memory,
				model,
				contextBuilder: builder(),
				toolExecutor: createLocalToolExecutor({ workspaceRoot: directory }),
				approveToolCall: async () => true,
				clock: new TemporalClock(),
				idGenerator: new BunUuidV7IdGenerator(),
			};
			await collectAsyncIterable(
				new RunAgentTurn(dependencies).run({
					sessionId,
					prompt: 'Implement a file service. Use PostgreSQL.',
				}),
			);
			await collectAsyncIterable(
				new RunAgentTurn(dependencies).run({ sessionId, prompt: 'Run typecheck.' }),
			);
			const path = join(directory, 'sessions', sessionId, 'events.jsonl');
			const prefix = await readFile(path, 'utf8');
			const original = await sessions.readSessionEvents(sessionId);
			const restoredSessions = new SessionService(durable);
			const restored = new SessionMemoryService(restoredSessions, store, new FakeMemoryUpdater());
			await restored.activate(sessionId, await restoredSessions.activateSession(sessionId));
			expect(restored.snapshot(sessionId)).toEqual(memory.snapshot(sessionId));
			expect(await readFile(path, 'utf8')).toBe(prefix);
			expect(await readFile(join(directory, 'service.ts'), 'utf8')).toBe('mode=postgres\n');
			const oldId = (original[0] as Extract<AgentEvent, { type: 'prompt.submitted' }>).messageId;
			expect(restored.snapshot(sessionId)?.decisions[0]?.sourceMessageIds).toContain(oldId);
			const retriever = new HistoryRetriever(
				{
					modelIdentity: 'fake-embedding',
					embed: async (texts) =>
						texts.map((text) =>
							Float32Array.from(
								text.includes('database') || text.includes('PostgreSQL') ? [1, 0] : [0, 1],
							),
						),
				},
				new BinaryHistoryIndexStore(join(directory, 'index')),
			);
			await collectAsyncIterable(
				new RunAgentTurn({
					...dependencies,
					sessionStore: restoredSessions,
					sessionMemory: restored,
					historyRetriever: retriever,
				}).run({ sessionId, prompt: 'Which database should we use?' }),
			);
			const request = model.receivedInputs.at(-1)!;
			expect(request.messages[0]?.content).toContain('Use PostgreSQL.');
			expect(request.messages.find((message) => message.id === oldId)?.content).toBe(
				'Implement a file service. Use PostgreSQL.',
			);
			expect(request.messages.filter((message) => message.role === 'system')).toHaveLength(1);
			expect(request.tools).toHaveLength(9);
			expect((await readFile(path, 'utf8')).startsWith(prefix)).toBe(true);
			expect(
				reduceAgentState(
					sessionId,
					await restoredSessions.readSessionEvents(sessionId),
				).messages.slice(0, -2),
			).toEqual(reduceAgentState(sessionId, original).messages);
		} finally {
			await cleanup();
		}
	});
});
