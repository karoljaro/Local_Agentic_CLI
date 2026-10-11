import { describe, expect, test, spyOn } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRuntime } from './createRuntime';
import { readConfig } from './config';
import { ContextBuilder, type CompiledContext } from '@/application/services/ContextBuilder';
import { SessionMemoryService } from '@/application/services/SessionMemoryService';
import { JsonSessionMemoryStore } from '@/infrastructure/persistence/JsonSessionMemoryStore';
import { SessionMemoryDocumentSchema } from '@/domain/SessionMemory';
import { asSessionId } from '@/domain/Ids';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { withMockedFetch } from '@/test-support/withMockedFetch';
import { SYNTHETIC_MODEL } from '@/test-support/modelFixtures';
import { noMemoryDelta } from '@/test-support/SessionMemoryFixtures';
import { createDeferred } from '@/test-support/createDeferred';
import { createLocalToolExecutor } from './factories/createLocalToolExecutor';
import { toOllamaTool } from '@/infrastructure/model/mappers/OllamaChatMapper';

const sessionId = asSessionId('production-memory');
const stream = (content: string, reason = 'stop') =>
	new Response(JSON.stringify({ message: { content }, done: true, done_reason: reason }) + '\n');
const workspace = async (run: (idle: () => Promise<void>) => Promise<void>) => {
	const { directory, cleanup } = await createTempDirectory('phase18-runtime-');
	const original = process.cwd();
	const operations: Promise<void>[] = [];
	const finish = SessionMemoryService.prototype.finish;
	const capture = spyOn(SessionMemoryService.prototype, 'finish').mockImplementation(function (
		this: SessionMemoryService,
		...args
	) {
		const operation = finish.apply(this, args);
		operations.push(operation);
		return operation;
	});
	const idle = async () => {
		await Promise.all(operations);
	};
	try {
		process.chdir(directory);
		await run(idle);
	} finally {
		await idle();
		capture.mockRestore();
		process.chdir(original);
		await cleanup();
	}
};
type Body = {
	model: string;
	messages: { role: string; content: string }[];
	tools?: unknown[];
	format?: Record<string, unknown>;
	options: { num_ctx: number; num_predict: number };
	truncate: boolean;
	shift: boolean;
};

describe('default production working memory request path', () => {
	for (const action of [
		'next-turn',
		'switch-model',
		'switch-model-return',
		'switch-session',
		'unload',
		'dispose',
	] as const)
		test(`pending provider stream is aborted before ${action}, with no stale publication`, async () =>
			workspace(async (idle) => {
				const started = createDeferred<AbortSignal>();
				let aborts = 0;
				let semantic = 0;
				let ordinary = 0;
				const models: string[] = [];
				await withMockedFetch(
					async (url, init) => {
						if (String(url).endsWith('/api/tags')) {
							if (semantic && (action === 'next-turn' || action.startsWith('switch-model')))
								expect(aborts).toBe(1); // Cancel before catalog/model resolution too.
							return Response.json({ models: [{ name: SYNTHETIC_MODEL }, { name: 'other-chat' }] });
						}
						const body = JSON.parse(String(init?.body));
						if (body.messages.length === 0) {
							expect(aborts).toBe(1);
							return Response.json({
								model: body.model,
								done: true,
								done_reason: body.keep_alive === 0 ? 'unload' : 'load',
							});
						}
						if (body.format) {
							if (++semantic > 1) return stream(JSON.stringify(noMemoryDelta()));
							return new Response(
								new ReadableStream({
									start(controller) {
										const signal = init!.signal!;
										signal.addEventListener(
											'abort',
											() => {
												aborts++;
												controller.error(signal.reason);
											},
											{ once: true },
										);
										started.resolve(signal);
									},
								}),
							);
						}
						if (++ordinary > 1) expect(aborts).toBe(1);
						models.push(body.model);
						return stream('Completed exact answer.');
					},
					async () => {
						const runtime = createRuntime(readConfig({ OLLAMA_MODEL: SYNTHETIC_MODEL }));
						try {
							await collectAsyncIterable(
								runtime.runTurn({ sessionId, prompt: 'First objective.' }),
							);
							const signal = await started.promise;
							expect(signal.aborted).toBe(false);
							const other = asSessionId('other-session');
							if (action === 'next-turn')
								await collectAsyncIterable(
									runtime.runTurn({ sessionId, prompt: 'Next objective.' }),
								);
							if (action.startsWith('switch-model')) {
								await runtime.switchModel('other-chat');
								if (action === 'switch-model-return') await runtime.switchModel(SYNTHETIC_MODEL);
								await collectAsyncIterable(
									runtime.runTurn({ sessionId, prompt: 'New model objective.' }),
								);
							}
							if (action === 'switch-session') {
								await runtime.listSessionEvents(other);
								await collectAsyncIterable(
									runtime.runTurn({ sessionId: other, prompt: 'Other session objective.' }),
								);
							}
							if (action === 'unload') await runtime.unloadCurrentModel();
							if (action === 'dispose') runtime.dispose();
							expect(signal.aborted).toBe(true);
							expect(aborts).toBe(1);
							await idle();
							const old = await new JsonSessionMemoryStore().read(sessionId);
							if (action === 'switch-session' || action === 'unload' || action === 'dispose')
								expect(old).toBeUndefined();
							else {
								expect(old?.source.eventCount).toBe(4);
								expect(old?.updater.model).toBe(
									action === 'switch-model' ? 'other-chat' : SYNTHETIC_MODEL,
								);
							}
							if (action === 'switch-session')
								expect((await new JsonSessionMemoryStore().read(other))?.sessionId).toBe(other);
							expect(models.at(-1)).toBe(
								action === 'switch-model' ? 'other-chat' : SYNTHETIC_MODEL,
							);
							expect(
								(await runtime.listSessionEvents(sessionId)).filter(
									(event) => event.type === 'agent.error',
								),
							).toEqual([]);
						} finally {
							runtime.dispose();
						}
					},
				);
			}));
	test('config → runtime → selected model → structured extraction → JSON → resume → compiler → actual Ollama body', async () =>
		workspace(async (idle) => {
			const ordinary: Body[] = [];
			const semantic: Body[] = [];
			const compiled: CompiledContext[] = [];
			const originalBuild = ContextBuilder.prototype.build;
			const capture = spyOn(ContextBuilder.prototype, 'build').mockImplementation(function (
				this: ContextBuilder,
				...args
			) {
				const context = originalBuild.apply(this, args);
				compiled.push(context);
				return context;
			});
			let embeddings = 0;
			try {
				await withMockedFetch(
					async (url, init) => {
						if (String(url).endsWith('/api/tags'))
							return Response.json({
								models: [{ name: SYNTHETIC_MODEL }, { name: 'test-embedding' }],
							});
						const body = JSON.parse(String(init?.body));
						if (String(url).endsWith('/api/embed')) {
							embeddings++;
							return Response.json({
								model: 'test-embedding',
								embeddings: body.input.map((text: string) =>
									text.includes('PostgreSQL') || text.includes('database') ? [1, 0] : [0, 1],
								),
							});
						}
						if (body.format) {
							semantic.push(body);
							expect(body.model).toBe(SYNTHETIC_MODEL);
							expect(body.tools).toBeUndefined();
							expect(body.options).toEqual({ num_ctx: 16384, num_predict: 1024 });
							const data = JSON.parse(body.messages[1].content);
							const evidence = data.evidence[0];
							const delta =
								semantic.length === 1
									? {
											version: 1,
											goal: {
												mode: 'initial',
												text: 'Implement a file service.',
												evidence: {
													messageId: evidence.messageId,
													quote: 'Implement a file service.',
												},
											},
											changes: [
												{
													operation: 'upsert',
													category: 'decisions',
													key: 'database',
													text: 'Use PostgreSQL.',
													evidence: { messageId: evidence.messageId, quote: 'Use PostgreSQL.' },
												},
												{
													operation: 'upsert',
													category: 'constraints',
													key: 'tui',
													text: 'Do not redesign the TUI.',
													evidence: {
														messageId: evidence.messageId,
														quote: 'Do not redesign the TUI.',
													},
												},
												{
													operation: 'upsert',
													category: 'pending',
													key: 'tests',
													text: 'Run integration tests.',
													evidence: {
														messageId: evidence.messageId,
														quote: 'Run integration tests later.',
													},
												},
											],
										}
									: noMemoryDelta();
							return stream(JSON.stringify(delta));
						}
						ordinary.push(body);
						return stream('Accepted; work continues.');
					},
					async () => {
						const config = readConfig({
							OLLAMA_MODEL: SYNTHETIC_MODEL,
							HISTORY_EMBEDDING_MODEL: 'test-embedding',
						});
						let runtime = createRuntime(config);
						await collectAsyncIterable(
							runtime.runTurn({
								sessionId,
								prompt:
									'Implement a file service. Use PostgreSQL. Do not redesign the TUI. Run integration tests later.',
							}),
						);
						await idle(); // An explicit idle opportunity, not an interactive dependency.
						const sourceEvents = await runtime.listSessionEvents(sessionId);
						const firstUser = sourceEvents.find((event) => event.type === 'prompt.submitted')!;
						const memory = await new JsonSessionMemoryStore().read(sessionId);
						expect(SessionMemoryDocumentSchema.safeParse(memory).success).toBe(true);
						expect(memory?.memory.goal?.text).toBe('Implement a file service.');
						expect(memory?.memory.decisions[0]?.sourceMessageIds).toContain(firstUser.messageId);
						const durablePath = join('.agent', 'sessions', sessionId, 'events.jsonl');
						const prefix = await readFile(durablePath, 'utf8');
						await collectAsyncIterable(
							runtime.runTurn({ sessionId, prompt: 'Inspect the palette.' }),
						);
						await idle();
						runtime.dispose();
						runtime = createRuntime(config);
						const current = 'Now implement database migrations.\n"\\😀';
						await collectAsyncIterable(runtime.runTurn({ sessionId, prompt: current }));
						await idle();
						const request = ordinary.at(-1)!;
						const context = compiled.at(-1)!;
						expect(request.messages.filter((message) => message.role === 'system')).toHaveLength(1);
						expect(request.messages[0]?.content.match(/Session working memory/g)).toHaveLength(1);
						expect(request.messages[0]?.content).toContain('Implement a file service.');
						expect(request.messages[0]?.content).toContain('Use PostgreSQL.');
						expect(request.messages[0]?.content).toContain('Do not redesign the TUI.');
						expect(request.messages.at(-1)).toEqual({ role: 'user', content: current });
						expect(
							request.messages.some((message) => message.content === 'Inspect the palette.'),
						).toBe(true);
						expect(request.messages.some((message) => message.content === firstUser.prompt)).toBe(
							true,
						);
						expect(request.tools).toEqual(createLocalToolExecutor().listTools().map(toOllamaTool));
						expect(request.tools).toHaveLength(9);
						expect(request.options).toEqual({ num_ctx: 16384, num_predict: 4096 });
						expect(request.truncate).toBe(false);
						expect(request.shift).toBe(false);
						expect(context.diagnostics.safetyAllowanceTokens).toBe(1024);
						expect(context.diagnostics.estimatedMemoryTokens).toBeGreaterThan(0);
						expect(context.diagnostics.retrievedTurnCount).toBe(1);
						expect(context.diagnostics.estimatedInputTokens + 4096 + 1024).toBeLessThanOrEqual(
							16384,
						);
						expect(ordinary).toHaveLength(3);
						expect(semantic).toHaveLength(3);
						expect(embeddings).toBeGreaterThan(0);
						expect((await readFile(durablePath, 'utf8')).startsWith(prefix)).toBe(true);
						expect(
							(await runtime.listSessionEvents(sessionId)).filter(
								(event) => event.type === 'agent.error',
							),
						).toEqual([]);
						expect(runtime.getModelSelection()).toMatchObject({
							status: 'selected',
							modelName: SYNTHETIC_MODEL,
						});
					},
				);
			} finally {
				capture.mockRestore();
			}
		}));
	test('malformed semantic output preserves selection and the next exact turn', async () =>
		workspace(async (idle) => {
			let ordinary = 0;
			let semantic = 0;
			const ordinaryBodies: Body[] = [];
			await withMockedFetch(
				async (url, init) => {
					if (String(url).endsWith('/api/tags'))
						return Response.json({ models: [{ name: SYNTHETIC_MODEL }] });
					const body = JSON.parse(String(init?.body)) as Body;
					expect(body.model).toBe(SYNTHETIC_MODEL);
					if (body.format) {
						semantic++;
						return stream('{malformed');
					}
					ordinary++;
					ordinaryBodies.push(body);
					return stream('Completed answer.');
				},
				async () => {
					const runtime = createRuntime(readConfig({ OLLAMA_MODEL: SYNTHETIC_MODEL }));
					expect(
						await collectAsyncIterable(
							runtime.runTurn({ sessionId, prompt: 'Implement a file service.' }),
						),
					).toEqual([{ contentDelta: 'Completed answer.' }]);
					await idle();
					const persisted = await new JsonSessionMemoryStore().read(sessionId);
					expect(persisted?.updater.status).toBe('failed');
					expect(persisted?.memory.goal).toBeNull();
					expect(runtime.getModelSelection()).toEqual({
						status: 'selected',
						modelName: SYNTHETIC_MODEL,
					});
					expect((await runtime.listSessionEvents(sessionId)).map((event) => event.type)).toEqual([
						'prompt.submitted',
						'assistant.message.completed',
					]);
					expect(
						await collectAsyncIterable(
							runtime.runTurn({ sessionId, prompt: 'Continue with the selected model.' }),
						),
					).toEqual([{ contentDelta: 'Completed answer.' }]);
					await idle();
					expect(
						ordinaryBodies[1]!.messages
							.filter((message) => message.role !== 'system')
							.map((message) => message.content),
					).toEqual([
						'Implement a file service.',
						'Completed answer.',
						'Continue with the selected model.',
					]);
					expect(
						(await runtime.listSessionEvents(sessionId))
							.filter((event) => event.type === 'prompt.submitted')
							.map((event) => event.modelName),
					).toEqual([SYNTHETIC_MODEL, SYNTHETIC_MODEL]);
					expect(runtime.getModelName()).toBe(SYNTHETIC_MODEL);
					expect(ordinary).toBe(2);
					expect(semantic).toBe(2);
				},
			);
		}));
});
