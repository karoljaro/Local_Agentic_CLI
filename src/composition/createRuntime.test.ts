import { ContextBuilder, type CompiledContext } from '@/application/services/ContextBuilder';
import { ModelSessionMemoryUpdater } from '@/application/services/ModelSessionMemoryUpdater';
import { JsonSessionMemoryStore } from '@/infrastructure/persistence/JsonSessionMemoryStore';
import { reduceAgentState } from '@/application/services/SessionReducer';
import { assistantMessageCompletedEvent } from '@/test-support/AgentEventFixtures';
import { asEventId, asMessageId } from '@/domain/Ids';
import { toOllamaMessage, toOllamaTool } from '@/infrastructure/model/mappers/OllamaChatMapper';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { SYNTHETIC_MODEL } from '@/test-support/modelFixtures';
import { JsonModelPreferenceStore } from '@/infrastructure/persistence/JsonModelPreferenceStore';
import { OllamaModelCatalog } from '@/infrastructure/model/OllamaModelCatalog';
import { describe, expect, spyOn, test } from 'bun:test';

import { SessionService } from '@/application/services/SessionService';
import { ContextBudgetExceededError } from '@/application/services/ContextBuilder';
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
import { readConfig, type AppConfig } from './config';

const config = {
	OLLAMA_BASE_URL: 'http://localhost:11434',
	OLLAMA_MODEL: SYNTHETIC_MODEL,
	OLLAMA_KEEP_ALIVE: '0',
	SYSTEM_PROMPT: 'test',
	MODEL_CONTEXT_TOKENS: 16_384,
	MODEL_MAX_OUTPUT_TOKENS: 4_096,
};
const id = asSessionId('selected');
const withMemoryRuntime = async (
	run: (runtime: Runtime, events: AgentEvent[]) => Promise<void>,
	runtimeConfig: AppConfig = config,
) => {
	const events: AgentEvent[] = [];
	const memoryRead = spyOn(JsonSessionMemoryStore.prototype, 'read').mockResolvedValue(undefined);
	const memoryWrite = spyOn(JsonSessionMemoryStore.prototype, 'write').mockResolvedValue(undefined);
	const semanticUpdate = spyOn(ModelSessionMemoryUpdater.prototype, 'update').mockResolvedValue({
		version: 1,
		goal: null,
		changes: [],
	});
	const preferenceRead = spyOn(
		JsonModelPreferenceStore.prototype,
		'readLastSelectedModel',
	).mockResolvedValue(undefined);
	const preferenceWrite = spyOn(
		JsonModelPreferenceStore.prototype,
		'writeLastSelectedModel',
	).mockResolvedValue(undefined);
	const catalog = spyOn(OllamaModelCatalog.prototype, 'listModels').mockResolvedValue({
		models: [
			{ name: runtimeConfig.OLLAMA_MODEL ?? SYNTHETIC_MODEL },
			...(runtimeConfig.OLLAMA_MODEL === undefined ? [] : [{ name: 'next-model' }]),
		],
	});
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
		const runtime = createRuntime(runtimeConfig);
		await runtime.initializeModels();
		await run(runtime, events);
	} finally {
		memoryRead.mockRestore();
		memoryWrite.mockRestore();
		semanticUpdate.mockRestore();
		preferenceRead.mockRestore();
		preferenceWrite.mockRestore();
		catalog.mockRestore();
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
		...(runtime.getModelName() === undefined ? {} : { modelName: runtime.getModelName()! }),
		...(signal === undefined ? {} : { signal }),
	}))
		deltas.push(delta);
	return deltas;
};

describe('createRuntime direct API', () => {
	for (const [name, env, expected] of [
		[
			'unset env',
			{},
			{
				baseUrl: 'http://localhost:11434',
				model: SYNTHETIC_MODEL,
				systemPrompt: readConfig({}).SYSTEM_PROMPT,
				contextWindowTokens: 16_384,
				maxOutputTokens: 4_096,
				keepAlive: 0,
			},
		],
		[
			'blank env',
			{
				OLLAMA_BASE_URL: ' ',
				OLLAMA_MODEL: '\t',
				SYSTEM_PROMPT: '\n',
				MODEL_CONTEXT_TOKENS: ' ',
				MODEL_MAX_OUTPUT_TOKENS: ' ',
				OLLAMA_KEEP_ALIVE: ' ',
			},
			{
				baseUrl: 'http://localhost:11434',
				model: SYNTHETIC_MODEL,
				systemPrompt: readConfig({}).SYSTEM_PROMPT,
				contextWindowTokens: 16_384,
				maxOutputTokens: 4_096,
				keepAlive: 0,
			},
		],
		[
			'explicit env',
			{
				OLLAMA_BASE_URL: ' http://127.0.0.1:22123/ ',
				OLLAMA_MODEL: ` ${SYNTHETIC_MODEL} `,
				SYSTEM_PROMPT: ' fixture prompt ',
				MODEL_CONTEXT_TOKENS: ' 8192 ',
				MODEL_MAX_OUTPUT_TOKENS: ' 2048 ',
				OLLAMA_KEEP_ALIVE: ' 2m ',
			},
			{
				baseUrl: 'http://127.0.0.1:22123',
				model: SYNTHETIC_MODEL,
				systemPrompt: 'fixture prompt',
				contextWindowTokens: 8_192,
				maxOutputTokens: 2_048,
				keepAlive: '2m',
			},
		],
	] as const) {
		test(`resolved ${name} reaches model, catalog, and context without constructor defaults`, async () => {
			const urls: string[] = [];
			await withMockedFetch(
				async (url, init) => {
					urls.push(String(url));
					if (String(url).endsWith('/api/tags')) {
						return new Response(JSON.stringify({ models: [] }));
					}
					expect(JSON.parse(String(init?.body))).toMatchObject({
						model: expected.model,
						keep_alive: expected.keepAlive,
						options: {
							num_ctx: expected.contextWindowTokens,
							num_predict: expected.maxOutputTokens,
						},
						truncate: false,
						shift: false,
						messages: [
							{ role: 'system', content: expected.systemPrompt },
							{ role: 'user', content: 'hello' },
						],
					});
					return response();
				},
				async () =>
					withMemoryRuntime(async (runtime, events) => {
						expect(runtime.getModelName()).toBe(expected.model);
						expect((await runtime.listModels())[0]?.name).toBe(expected.model);
						expect(await run(runtime)).toEqual([{ contentDelta: 'answer' }]);
						const committed = [...events];
						await expect(
							(async () => {
								for await (const _delta of runtime.runTurn({
									sessionId: id,
									prompt: 'x'.repeat(expected.contextWindowTokens * 4),
									...(runtime.getModelName() === undefined
										? {}
										: { modelName: runtime.getModelName()! }),
								})) {
									// Oversized prompts must reject before streaming or persistence.
								}
							})(),
						).rejects.toBeInstanceOf(ContextBudgetExceededError);
						expect(events).toEqual(committed);
						expect(urls).toEqual([`${expected.baseUrl}/api/chat`]);
					}, readConfig(env)),
			);
		});
	}

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
				return body.stream
					? response()
					: body.keep_alive === 0
						? unloaded.promise
						: Response.json({ model: body.model, done: true, done_reason: 'load' });
			},
			async () =>
				withMemoryRuntime(async (runtime) => {
					const switching = runtime.switchModel('  next-model  ');
					expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
					await Promise.resolve();
					await Promise.resolve();
					unloaded.resolve(new Response(''));
					expect(await switching).toBe('next-model');
					await run(runtime);
					expect(requests).toMatchObject([
						{ model: SYNTHETIC_MODEL, stream: false },
						{ model: 'next-model', stream: false },
						{ model: 'next-model', stream: true },
					]);
					await expect(runtime.switchModel(' ')).rejects.toThrow('Model name cannot be empty.');
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
				await withMemoryRuntime(async (runtime) => {
					await expect(runtime.switchModel('next-model', request.signal)).rejects.toBe(cause);
					expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
					await expect(runtime.unloadCurrentModel({ signal: request.signal })).rejects.toBe(cause);
					request.abort('custom');
					await expect(runtime.switchModel('next', request.signal)).rejects.toHaveProperty(
						'name',
						'AbortError',
					);
					expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
					expect(fetches).toBe(2);
				});
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
		let executions = 0;
		const prepare = LocalToolRegistry.prototype.prepare;
		const prepared = spyOn(LocalToolRegistry.prototype, 'prepare').mockImplementation(function (
			this: LocalToolRegistry,
			request,
		) {
			const execution = prepare.call(this, request);
			return {
				...execution,
				execute: async () => {
					executions++;
					return { toolName: execution.toolName, output: { created: true } };
				},
			};
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
						expect(executions).toBe(1);
						disposeCurrent();
						await run(runtime);
						expect(executions).toBe(1);
						const disposeAgain = runtime.setApprovalHandler(current);
						disposeOld();
						disposeAgain();
						await run(runtime);
						expect(signals).toHaveLength(1);
						expect(executions).toBe(1);
					}),
			);
		} finally {
			prepared.mockRestore();
		}
	});
});

describe('Phase 16 captured production context path', () => {
	for (const [name, profileEnv, contextWindowTokens, maxOutputTokens] of [
		['default', {}, 16_384, 4_096],
		['override', { MODEL_CONTEXT_TOKENS: '8192', MODEL_MAX_OUTPUT_TOKENS: '2048' }, 8_192, 2_048],
	] as const) {
		test(`${name}: config → runtime → canonical reducer → compiler → agent → ModelPort → Ollama HTTP in every tool round`, async () => {
			const resolved = readConfig({ ...profileEnv, OLLAMA_MODEL: SYNTHETIC_MODEL });
			const contexts: CompiledContext[] = [];
			const originalBuild = ContextBuilder.prototype.build;
			const compile = spyOn(ContextBuilder.prototype, 'build').mockImplementation(function (
				this: ContextBuilder,
				state,
				tools,
			) {
				const result = originalBuild.call(this, state, tools);
				contexts.push(result);
				return result;
			});
			const originalPrepare = LocalToolRegistry.prototype.prepare;
			const prepared = spyOn(LocalToolRegistry.prototype, 'prepare').mockImplementation(function (
				this: LocalToolRegistry,
				request,
			) {
				const execution = originalPrepare.call(this, request);
				return {
					...execution,
					execute: async () => ({
						toolName: execution.toolName,
						output: {
							path: (execution.toolInput as { path: string }).path,
							content: `Exact ${(execution.toolInput as { path: string }).path}\n"\\😀`,
						},
					}),
				};
			});
			let round = 0;
			let durable: AgentEvent[] = [];
			const prompt = 'Inspect first.conf then second.conf; preserve this exact request.\n😀';
			const definitions = createLocalToolExecutor().listTools();
			try {
				await withMockedFetch(
					async (_url, init) => {
						const body = JSON.parse(String(init?.body));
						const compiled = contexts.at(-1)!;
						expect(body.model).toBe(SYNTHETIC_MODEL);
						expect(body.options).toEqual({
							num_ctx: contextWindowTokens,
							num_predict: maxOutputTokens,
						});
						expect(body.truncate).toBe(false);
						expect(body.shift).toBe(false);
						expect(
							body.messages.filter((message: { role: string }) => message.role === 'system'),
						).toEqual([{ role: 'system', content: resolved.SYSTEM_PROMPT }]);
						expect(body.tools).toEqual(definitions.map(toOllamaTool));
						expect(body.tools).toHaveLength(9);
						expect(body.messages).toEqual(compiled.messages.map(toOllamaMessage));
						expect(compiled.contextProfile).toEqual({ contextWindowTokens, maxOutputTokens });
						expect(compiled.contextProfile).toBe(contexts[0]!.contextProfile);
						expect(compiled.diagnostics.estimatedRemainingMarginTokens).toBeGreaterThanOrEqual(0);
						expect(compiled.diagnostics.selectedCompletedTurns).toBeGreaterThan(0);
						expect(compiled.diagnostics.droppedCompletedTurns).toBeGreaterThan(0);
						const canonical = reduceAgentState(id, durable).messages;
						const activeStart = canonical.findLastIndex((message) => message.role === 'user');
						const active = canonical.slice(activeStart);
						expect(active[0]).toMatchObject({ role: 'user', content: prompt });
						expect(compiled.messages.slice(-active.length)).toEqual(active);
						const selected = compiled.diagnostics.selectedCompletedTurns;
						expect(compiled.messages.slice(1)).toEqual([
							...canonical.slice(activeStart - selected * 2, activeStart),
							...active,
						]);
						expect(contexts).toHaveLength(round + 1);
						const results = body.messages.filter(
							(message: { role: string }) => message.role === 'tool',
						);
						expect(
							results.map((message: { content: string }) => JSON.parse(message.content)),
						).toEqual(
							['first.conf', 'second.conf']
								.slice(0, round)
								.map((path) => ({ path, content: `Exact ${path}\n"\\😀` })),
						);
						if (round++ < 2) {
							const path = round === 1 ? 'first.conf' : 'second.conf';
							return response({
								content: `Read ${path}`,
								tool_calls: [{ function: { name: 'read_file', arguments: { path } } }],
							});
						}
						return new Response(
							'{"message":{"content":"Read both."},"done":true,"done_reason":"stop","prompt_eval_count":2048,"eval_count":8}\n',
						);
					},
					async () =>
						withMemoryRuntime(async (runtime, events) => {
							durable = events;
							for (let i = 0; i < 30; i++)
								events.push(
									promptSubmittedEvent({
										sessionId: id,
										id: asEventId(`old-prompt-${i}`),
										messageId: asMessageId(`old-user-${i}`),
										prompt: `Historical question ${i}`,
										modelName: 'historical-unavailable-model',
									}),
									assistantMessageCompletedEvent({
										sessionId: id,
										id: asEventId(`old-answer-${i}`),
										messageId: asMessageId(`old-assistant-${i}`),
										content: `Historical answer ${i} ${'x'.repeat(2_000)}`,
									}),
								);
							const original = structuredClone(events);
							expect(await runtime.listSessionEvents(id)).toEqual(original);
							const deltas = [];
							for await (const delta of runtime.runTurn({ sessionId: id, prompt }))
								deltas.push(delta.contentDelta);
							expect(deltas).toEqual(['Read first.conf', 'Read second.conf', 'Read both.']);
							expect(events.slice(0, original.length)).toEqual(original);
							expect(reduceAgentState(id, events).messages).toHaveLength(66);
							expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
							expect(events.findLast((event) => event.type === 'prompt.submitted')).toMatchObject({
								modelName: SYNTHETIC_MODEL,
								prompt,
							});
							expect(events.at(-1)).toMatchObject({
								type: 'assistant.message.completed',
								content: 'Read both.',
							});
							expect(events.filter((event) => event.type === 'tool.call.failed')).toHaveLength(0);
						}, resolved),
				);
				expect(round).toBe(3);
			} finally {
				compile.mockRestore();
				prepared.mockRestore();
			}
		});
	}
});
