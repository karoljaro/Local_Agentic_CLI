import { describe, expect, test, spyOn } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRuntime } from './createRuntime';
import { readConfig } from './config';
import { ContextBuilder, type CompiledContext } from '@/application/services/ContextBuilder';
import { JsonSessionMemoryStore } from '@/infrastructure/persistence/JsonSessionMemoryStore';
import { SessionMemoryDocumentSchema } from '@/domain/SessionMemory';
import { asSessionId } from '@/domain/Ids';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { withMockedFetch } from '@/test-support/withMockedFetch';
import { SYNTHETIC_MODEL } from '@/test-support/modelFixtures';
import { noMemoryDelta } from '@/test-support/SessionMemoryFixtures';
import { createLocalToolExecutor } from './factories/createLocalToolExecutor';
import { toOllamaTool } from '@/infrastructure/model/mappers/OllamaChatMapper';

const sessionId = asSessionId('production-memory');
const stream = (content: string, reason = 'stop') =>
	new Response(JSON.stringify({ message: { content }, done: true, done_reason: reason }) + '\n');
const workspace = async (run: () => Promise<void>) => {
	const { directory, cleanup } = await createTempDirectory('phase18-runtime-');
	const original = process.cwd();
	try {
		process.chdir(directory);
		await run();
	} finally {
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
	test('config → runtime → selected model → structured extraction → JSON → resume → compiler → actual Ollama body', async () =>
		workspace(async () => {
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
						runtime = createRuntime(config);
						const current = 'Now implement database migrations.\n"\\😀';
						await collectAsyncIterable(runtime.runTurn({ sessionId, prompt: current }));
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
	test('malformed real adapter output is nonfatal and does not persist semantic claims', async () =>
		workspace(async () => {
			let ordinary = 0;
			let semantic = 0;
			await withMockedFetch(
				async (url, init) => {
					if (String(url).endsWith('/api/tags'))
						return Response.json({ models: [{ name: SYNTHETIC_MODEL }] });
					const body = JSON.parse(String(init?.body));
					if (body.format) {
						semantic++;
						return stream('{malformed');
					}
					ordinary++;
					return stream('Completed answer.');
				},
				async () => {
					const runtime = createRuntime(readConfig({ OLLAMA_MODEL: SYNTHETIC_MODEL }));
					expect(
						await collectAsyncIterable(
							runtime.runTurn({ sessionId, prompt: 'Implement a file service.' }),
						),
					).toEqual([{ contentDelta: 'Completed answer.' }]);
					const persisted = await new JsonSessionMemoryStore().read(sessionId);
					expect(persisted?.updater.status).toBe('failed');
					expect(persisted?.memory.goal).toBeNull();
					expect((await runtime.listSessionEvents(sessionId)).map((event) => event.type)).toEqual([
						'prompt.submitted',
						'assistant.message.completed',
					]);
					expect(ordinary).toBe(1);
					expect(semantic).toBe(1);
				},
			);
		}));
});
