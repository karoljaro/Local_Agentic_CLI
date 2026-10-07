import { describe, expect, spyOn, test } from 'bun:test';

import { SessionService } from '@/application/services/SessionService';
import type { ToolApprovalHandler } from '@/application/use-cases/RunAgentTurn';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { LocalToolRegistry } from '@/infrastructure/tools/LocalToolExecutor';
import type { AgentEvent } from '@/domain/AgentEvent';
import { asSessionId } from '@/domain/Ids';
import { promptSubmittedEvent } from '@/test-support/AgentEventFixtures';
import { createDeferred } from '@/test-support/createDeferred';
import { withMockedFetch } from '@/test-support/withMockedFetch';
import { createRuntime, type Runtime } from './createRuntime';

const config = {
	OLLAMA_BASE_URL: 'http://localhost:11434',
	OLLAMA_MODEL: 'initial-model',
	OLLAMA_KEEP_ALIVE: '0',
	SYSTEM_PROMPT: 'test',
	MAX_CONTEXT_CHARACTERS: 120_000,
};
const id = asSessionId('selected');
const withMemoryRuntime = async (
	run: (runtime: Runtime, events: AgentEvent[]) => Promise<void>,
) => {
	const events: AgentEvent[] = [];
	const read = spyOn(JsonlSessionStore.prototype, 'readSessionEvents').mockImplementation(
		async (sessionId) => events.filter((event) => event.sessionId === sessionId),
	);
	const append = spyOn(JsonlSessionStore.prototype, 'appendSessionEvent').mockImplementation(
		async (event) => {
			events.push(event);
		},
	);
	const list = spyOn(JsonlSessionStore.prototype, 'listSessions').mockResolvedValue([
		{ sessionId: id },
	]);
	try {
		await run(createRuntime(config), events);
	} finally {
		read.mockRestore();
		append.mockRestore();
		list.mockRestore();
	}
};
const response = (message: unknown = { content: 'answer' }) =>
	new Response(JSON.stringify({ message, done: true }) + '\n');
const run = async (runtime: Runtime, signal?: AbortSignal) => {
	const deltas = [];
	for await (const delta of runtime.runTurn({
		sessionId: id,
		prompt: 'hello',
		modelName: runtime.getModelName(),
		...(signal === undefined ? {} : { signal }),
	}))
		deltas.push(delta);
	return deltas;
};

describe('createRuntime direct API', () => {
	test('one session service owns activation, preview, listing, turn state and committed subscriptions', async () => {
		const owners = new Set<SessionService>();
		const activate = SessionService.prototype.activateSession;
		const preview = SessionService.prototype.readPreviewEvents;
		const list = SessionService.prototype.listSessions;
		const state = SessionService.prototype.readSessionState;
		const subscribe = SessionService.prototype.subscribe;
		const spies = [
			spyOn(SessionService.prototype, 'activateSession').mockImplementation(function (
				this: SessionService,
				id,
			) {
				owners.add(this);
				return activate.call(this, id);
			}),
			spyOn(SessionService.prototype, 'readPreviewEvents').mockImplementation(function (
				this: SessionService,
				id,
			) {
				owners.add(this);
				return preview.call(this, id);
			}),
			spyOn(SessionService.prototype, 'listSessions').mockImplementation(function (
				this: SessionService,
			) {
				owners.add(this);
				return list.call(this);
			}),
			spyOn(SessionService.prototype, 'readSessionState').mockImplementation(function (
				this: SessionService,
				id,
			) {
				owners.add(this);
				return state.call(this, id);
			}),
			spyOn(SessionService.prototype, 'subscribe').mockImplementation(function (
				this: SessionService,
				listener,
			) {
				owners.add(this);
				return subscribe.call(this, listener);
			}),
		];
		try {
			await withMockedFetch(
				async () => response(),
				async () =>
					withMemoryRuntime(async (runtime, events) => {
						expect(await runtime.listSessions()).toEqual([{ sessionId: id }]);
						expect(await runtime.listSessionEvents(id)).toEqual([]);
						expect(await runtime.readSessionPreviewEvents(asSessionId('preview'))).toEqual([]);
						const committed: AgentEvent[] = [];
						const unsubscribe = runtime.subscribeSessionEvents((event) => {
							const owner = [...owners][0]!;
							expect(
								(owner as unknown as { selectedSession: { events: AgentEvent[] } }).selectedSession
									.events,
							).toContain(event);
							committed.push(event);
						});
						expect(await run(runtime)).toEqual([{ contentDelta: 'answer' }]);
						expect(await runtime.listSessionEvents(id)).toEqual(events);
						expect(committed).toEqual(events);
						expect(owners.size).toBe(1);
						expect(spies[0]).toHaveBeenCalledWith(id);
						expect(spies[1]).toHaveBeenCalledTimes(1);
						unsubscribe();
						await run(runtime);
						expect(committed).toHaveLength(2);
					}),
			);
		} finally {
			for (const spy of spies) spy.mockRestore();
		}
	});

	test('session arrays preserve adapter order/filtering and original listing/selected/preview errors', async () => {
		const foreign = promptSubmittedEvent({ sessionId: asSessionId('foreign') });
		const prompt = promptSubmittedEvent({ sessionId: id });
		const read = spyOn(JsonlSessionStore.prototype, 'readSessionEvents').mockResolvedValue([
			foreign,
			prompt,
		]);
		const sessions = [{ sessionId: asSessionId('second') }, { sessionId: id }];
		const list = spyOn(JsonlSessionStore.prototype, 'listSessions').mockResolvedValue(sessions);
		try {
			const runtime = createRuntime(config);
			expect(await runtime.listSessions()).toEqual(sessions);
			expect(read).not.toHaveBeenCalled();
			expect(await runtime.listSessionEvents(id)).toEqual([prompt]);
			expect(await runtime.readSessionPreviewEvents(id)).toEqual([prompt]);
			const cause = new Error('adapter failed');
			list.mockRejectedValue(cause);
			read.mockRejectedValue(cause);
			await expect(runtime.listSessions()).rejects.toBe(cause);
			await expect(runtime.readSessionPreviewEvents(id)).rejects.toBe(cause);
			await expect(runtime.listSessionEvents(asSessionId('uncached'))).rejects.toBe(cause);
		} finally {
			read.mockRestore();
			list.mockRestore();
		}
	});

	test('session IDs remain deterministic through the private injected generator; use cases stay private', () => {
		const next = spyOn(BunUuidV7IdGenerator.prototype, 'nextSessionId').mockReturnValue(id);
		try {
			const runtime = createRuntime(config);
			expect(runtime.createSessionId()).toBe(id);
			expect(next).toHaveBeenCalledTimes(1);
			expect(runtime).not.toHaveProperty('idGenerator');
			expect(runtime).not.toHaveProperty('runAgentTurn');
			expect(typeof runtime.listSessions).toBe('function');
			expect(typeof runtime.listSessionEvents).toBe('function');
			expect(runtime.getAgentMetrics()).toEqual({ completedTurns: [] });
			expect(runtime.workspacePath).toBe(process.cwd());
		} finally {
			next.mockRestore();
		}
	});

	test('model listing returns arrays, forwards signal, caches and preserves force refresh', async () => {
		const signal = new AbortController().signal;
		let fetches = 0;
		await withMockedFetch(
			async (_url, init) => {
				expect(init?.signal).toBe(signal);
				return new Response(JSON.stringify({ models: [{ name: `model-${++fetches}` }] }));
			},
			async () => {
				const runtime = createRuntime(config);
				expect(await runtime.listModels(signal)).toEqual([{ name: 'model-1' }]);
				expect(await runtime.listModels(signal)).toEqual([{ name: 'model-1' }]);
				expect(await runtime.listModels(signal, { forceRefresh: true })).toEqual([
					{ name: 'model-2' },
				]);
				expect(fetches).toBe(2);
			},
		);
	});

	test('async runtime switch unloads before commit; next turn uses the normalized new model', async () => {
		const unloaded = createDeferred<Response>();
		const requests: { model: string; stream: boolean }[] = [];
		await withMockedFetch(
			async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				requests.push(body);
				return body.stream ? response() : unloaded.promise;
			},
			async () =>
				withMemoryRuntime(async (runtime) => {
					const switching = runtime.switchModel('  next-model  ');
					expect(runtime.getModelName()).toBe('initial-model');
					expect(requests).toMatchObject([{ model: 'initial-model', stream: false }]);
					unloaded.resolve(new Response(''));
					expect(await switching).toBe('next-model');
					await run(runtime);
					expect(requests).toMatchObject([
						{ model: 'initial-model', stream: false },
						{ model: 'next-model', stream: true },
					]);
					await expect(runtime.switchModel(' ')).rejects.toThrow(
						'Ollama model name cannot be empty.',
					);
					expect(runtime.getModelName()).toBe('next-model');
				}),
		);
	});

	test('runtime switch forwards cancellation and unload errors without changing selection; standalone unload remains', async () => {
		const cause = new Error('unload failed');
		const request = new AbortController();
		let fetches = 0;
		await withMockedFetch(
			async (_url, init) => {
				fetches++;
				expect(init?.signal).toBe(request.signal);
				throw cause;
			},
			async () => {
				const runtime = createRuntime(config);
				await expect(runtime.switchModel('next', request.signal)).rejects.toBe(cause);
				expect(runtime.getModelName()).toBe('initial-model');
				await expect(runtime.unloadCurrentModel({ signal: request.signal })).rejects.toBe(cause);
				request.abort('custom');
				await expect(runtime.switchModel('next', request.signal)).rejects.toHaveProperty(
					'name',
					'AbortError',
				);
				expect(runtime.getModelName()).toBe('initial-model');
				expect(fetches).toBe(2);
			},
		);
	});

	test('approval registration, replacement, identity disposal and default denial work through direct turns', async () => {
		const toolResponse = () =>
			response({
				content: '',
				tool_calls: [
					{ function: { name: 'create_file', arguments: { path: 'safe.txt', content: 'text' } } },
				],
			});
		let chatRequests = 0;
		const signals: (AbortSignal | undefined)[] = [];
		const old: ToolApprovalHandler = async () => {
			throw new Error('disposed old handler used');
		};
		const current: ToolApprovalHandler = async (_request, options) => {
			signals.push(options.signal);
			return true;
		};
		const execute = spyOn(LocalToolRegistry.prototype, 'execute').mockResolvedValue({
			toolName: 'create_file',
			output: { created: true },
		});
		try {
			await withMockedFetch(
				async () => (++chatRequests === 2 ? response() : toolResponse()),
				async () =>
					withMemoryRuntime(async (runtime) => {
						const disposeOld = runtime.setApprovalHandler(old);
						const disposeCurrent = runtime.setApprovalHandler(current);
						disposeOld(); // Must not clear the newer registration.
						const signal = new AbortController().signal;
						await run(runtime, signal);
						expect(signals).toEqual([signal]);
						expect(execute).toHaveBeenCalledTimes(1);
						disposeCurrent();
						await run(runtime);
						expect(execute).toHaveBeenCalledTimes(1);
						const disposeAgain = runtime.setApprovalHandler(current);
						disposeOld();
						disposeAgain();
						await run(runtime);
						expect(signals).toHaveLength(1);
						expect(execute).toHaveBeenCalledTimes(1);
					}),
			);
		} finally {
			execute.mockRestore();
		}
	});
});
