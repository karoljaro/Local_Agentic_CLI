import { describe, expect, test } from 'bun:test';
import { OllamaModelAdapter } from './OllamaModelAdapter';
import { ModelSessionMemoryUpdater } from '@/application/services/ModelSessionMemoryUpdater';
import { SessionMemoryService } from '@/application/services/SessionMemoryService';
import { SessionService } from '@/application/services/SessionService';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { RunAgentTurn } from '@/application/use-cases/RunAgentTurn';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { FakeMemoryStore } from '@/test-support/SessionMemoryFixtures';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { withMockedFetch } from '@/test-support/withMockedFetch';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { SYNTHETIC_MODEL, TEST_CONTEXT_PROFILE } from '@/test-support/modelFixtures';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { TemporalClock } from '@/infrastructure/runtime/TemporalClock';
import { asSessionId } from '@/domain/Ids';

describe('structured extraction infrastructure failure isolation', () => {
	for (const mode of ['HTTP timeout', 'body timeout', 'partial body', 'transport size'])
		test(`${mode} preserves successful chat and aborts/rejects the optional operation`, async () => {
			let signal: AbortSignal | undefined;
			let aborted = false;
			let requests = 0;
			await withMockedFetch(
				async (_url, init) => {
					requests++;
					signal = init?.signal ?? undefined;
					const body = JSON.parse(String(init?.body));
					expect(body.format).toBeDefined();
					expect(body.tools).toBeUndefined();
					expect(body.options).toEqual({ num_ctx: 16384, num_predict: 1024 });
					if (mode === 'HTTP timeout')
						return new Promise((_, reject) =>
							signal!.addEventListener(
								'abort',
								() => {
									aborted = true;
									reject(signal!.reason);
								},
								{ once: true },
							),
						);
					if (mode === 'body timeout')
						return new Response(
							new ReadableStream({
								start(controller) {
									signal!.addEventListener(
										'abort',
										() => {
											aborted = true;
											controller.error(signal!.reason);
										},
										{ once: true },
									);
								},
							}),
						);
					if (mode === 'transport size') return new Response('x'.repeat(256001));
					return new Response('{"message":{"content":"{}"}}\n');
				},
				async () => {
					const durable = new InMemorySessionStore();
					const sessions = new SessionService(durable);
					const store = new FakeMemoryStore();
					const updater = new ModelSessionMemoryUpdater(
						new OllamaModelAdapter('http://localhost:11434', SYNTHETIC_MODEL),
						TEST_CONTEXT_PROFILE,
					);
					const memory = new SessionMemoryService(sessions, store, updater, 20);
					const loop = new RunAgentTurn({
						sessionStore: sessions,
						sessionMemory: memory,
						model: new ScriptedModel([
							[{ contentDelta: 'Completed answer.', finishReason: 'stop' }],
						]),
						contextBuilder: new ContextBuilder({
							systemPrompt: 'base',
							contextProfile: TEST_CONTEXT_PROFILE,
						}),
						clock: new TemporalClock(),
						idGenerator: new BunUuidV7IdGenerator(),
					});
					expect(
						await collectAsyncIterable(
							loop.run({
								sessionId: asSessionId('adapter-memory'),
								prompt: 'Implement a service.',
							}),
						),
					).toEqual([{ contentDelta: 'Completed answer.' }]);
					expect(durable.events.map((event) => event.type)).toEqual([
						'prompt.submitted',
						'assistant.message.completed',
					]);
					expect(store.writes.at(-1)?.updater.status).toBe('failed');
					expect(memory.snapshot(asSessionId('adapter-memory'))?.goal).toBeNull();
					expect(requests).toBe(1);
					if (mode.includes('timeout')) {
						expect(signal?.aborted).toBe(true);
						expect(aborted).toBe(true);
					}
				},
			);
		});
});
