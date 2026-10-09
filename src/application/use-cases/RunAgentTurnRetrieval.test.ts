import { describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EmbeddingPort } from '@/application/ports/EmbeddingPort';
import { ContextBudgetExceededError, ContextBuilder } from '@/application/services/ContextBuilder';
import { HistoryRetriever } from '@/application/services/HistoryRetriever';
import { SessionService } from '@/application/services/SessionService';
import { reduceAgentState } from '@/application/services/SessionReducer';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { asMessageId, asSessionId } from '@/domain/Ids';
import { BinaryHistoryIndexStore } from '@/infrastructure/persistence/BinaryHistoryIndexStore';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { TemporalClock } from '@/infrastructure/runtime/TemporalClock';
import {
	assistantMessageCompletedEvent,
	promptSubmittedEvent,
} from '@/test-support/AgentEventFixtures';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { RunAgentTurn } from './RunAgentTurn';

const sessionId = asSessionId('retrieval-session');
class FakeEmbeddings implements EmbeddingPort {
	modelIdentity = 'controlled';
	texts: string[] = [];
	fail = false;
	async embed(texts: readonly string[]) {
		this.texts.push(...texts);
		if (this.fail) throw new Error('Embedding offline');
		return texts.map((text) => Float32Array.from(text.includes('database') ? [1, 0] : [0, 1]));
	}
}
const builder = () =>
	new ContextBuilder({
		systemPrompt: 'Use workspace-relative paths.',
		contextProfile: { contextWindowTokens: 16384, maxOutputTokens: 4096 },
	});
const seed = async (store: JsonlSessionStore, count = 40) => {
	for (let i = 0; i < count; i++) {
		await store.appendSessionEvent(
			promptSubmittedEvent({
				sessionId,
				id: new BunUuidV7IdGenerator().nextEventId(),
				messageId: asMessageId(`user-${i}`),
				prompt: i === 2 ? 'Use PostgreSQL database, never SQLite.' : `Unrelated colors ${i}`,
			}),
		);
		await store.appendSessionEvent(
			assistantMessageCompletedEvent({
				sessionId,
				id: new BunUuidV7IdGenerator().nextEventId(),
				messageId: asMessageId(`assistant-${i}`),
				content: i === 2 ? 'The database migration policy uses PostgreSQL.' : `Explanation ${i}`,
			}),
		);
	}
};

describe('RunAgentTurn retrieval and durable replay', () => {
	test('actual JSONL resume keeps complete history, sparse exact requests across tool rounds, then reuses derived cache on restart', async () => {
		const { directory, cleanup } = await createTempDirectory('phase17-loop-');
		try {
			const durable = new JsonlSessionStore(join(directory, 'sessions'));
			await seed(durable);
			await writeFile(join(directory, 'database.conf'), 'CURRENT_WORKSPACE_STATE=postgres\n');
			const eventsFile = join(directory, 'sessions', sessionId, 'events.jsonl');
			const prefix = await readFile(eventsFile, 'utf8');
			const embeddings = new FakeEmbeddings();
			const index = new BinaryHistoryIndexStore(join(directory, 'index'));
			const services = new SessionService(durable);
			const model = new ScriptedModel([
				[
					{
						contentDelta: 'Inspecting current state',
						toolCalls: [{ name: 'read_file', arguments: { path: 'database.conf' } }],
					},
				],
				[{ contentDelta: 'PostgreSQL migrations use current workspace state.' }],
			]);
			const run = new RunAgentTurn({
				sessionStore: services,
				contextBuilder: builder(),
				historyRetriever: new HistoryRetriever(embeddings, index),
				model,
				clock: new TemporalClock(),
				idGenerator: new BunUuidV7IdGenerator(),
				toolExecutor: createLocalToolExecutor({
					workspaceRoot: directory,
					maxReadCharacters: 50_000,
				}),
			});
			await collectAsyncIterable(run.run({ sessionId, prompt: 'Explain database migrations.' }));
			expect(model.receivedInputs).toHaveLength(2);
			const fresh = new SessionService(new JsonlSessionStore(join(directory, 'sessions')));
			const replay = await fresh.readSessionState(sessionId);
			for (const input of model.receivedInputs) {
				expect(input.tools).toHaveLength(9);
				expect(input.contextProfile).toEqual({ contextWindowTokens: 16384, maxOutputTokens: 4096 });
				expect(
					input.messages
						.filter((message) => message.role === 'user')
						.map((message) => message.content),
				).toEqual([
					'Use PostgreSQL database, never SQLite.',
					'Unrelated colors 39',
					'Explain database migrations.',
				]);
				expect(input.messages[1]).toEqual(replay.messages[4]!);
				expect(input.messages[2]).toEqual(replay.messages[5]!);
			}
			const active = model.receivedInputs[1]!.messages.slice(5);
			expect(active[0]!.content).toBe('Explain database migrations.');
			expect(active[1]).toMatchObject({
				role: 'assistant',
				content: 'Inspecting current state',
				toolCalls: [{ name: 'read_file', arguments: { path: 'database.conf' } }],
			});
			expect(active[2]).toMatchObject({ role: 'tool', toolName: 'read_file' });
			expect(active[2]!.content).toContain('CURRENT_WORKSPACE_STATE=postgres');
			expect(embeddings.texts).toHaveLength(41); // query + completed historical turns only
			expect(embeddings.texts.join('\n')).not.toContain('CURRENT_WORKSPACE_STATE');
			expect(replay.messages).toHaveLength(84);
			expect((await readFile(eventsFile, 'utf8')).startsWith(prefix)).toBe(true);
			expect(replay).toEqual(
				reduceAgentState(sessionId, await durable.readSessionEvents(sessionId)),
			);
			const restartedEmbeddings = new FakeEmbeddings();
			const restartedModel = new ScriptedModel([[{ contentDelta: 'Rollback answer' }]]);
			const restarted = new RunAgentTurn({
				sessionStore: fresh,
				contextBuilder: builder(),
				historyRetriever: new HistoryRetriever(
					restartedEmbeddings,
					new BinaryHistoryIndexStore(join(directory, 'index')),
				),
				model: restartedModel,
				clock: new TemporalClock(),
				idGenerator: new BunUuidV7IdGenerator(),
			});
			await collectAsyncIterable(
				restarted.run({ sessionId, prompt: 'Explain database rollback.' }),
			);
			expect(restartedEmbeddings.texts).toHaveLength(2); // new query + only newly completed prior active turn
			expect(restartedModel.receivedInputs[0]!.messages.at(-1)!.content).toBe(
				'Explain database rollback.',
			);
			expect((await fresh.readSessionState(sessionId)).messages).toHaveLength(86);
		} finally {
			await cleanup();
		}
	});

	test('embedding provider failure still completes normal inference with Phase 16 fallback', async () => {
		const { directory, cleanup } = await createTempDirectory('phase17-fallback-');
		try {
			const durable = new JsonlSessionStore(join(directory, 'sessions'));
			await seed(durable, 4);
			const services = new SessionService(durable);
			const embeddings = new FakeEmbeddings();
			embeddings.fail = true;
			const model = new ScriptedModel([[{ contentDelta: 'Completed without retrieval' }]]);
			const run = new RunAgentTurn({
				sessionStore: services,
				contextBuilder: builder(),
				historyRetriever: new HistoryRetriever(
					embeddings,
					new BinaryHistoryIndexStore(join(directory, 'index')),
				),
				model,
				clock: new TemporalClock(),
				idGenerator: new BunUuidV7IdGenerator(),
			});
			expect(await collectAsyncIterable(run.run({ sessionId, prompt: 'database' }))).toEqual([
				{ contentDelta: 'Completed without retrieval' },
			]);
			expect(
				model.receivedInputs[0]!.messages.filter((message) => message.role === 'user'),
			).toHaveLength(5);
			expect(
				(await durable.readSessionEvents(sessionId)).some((event) => event.type === 'agent.error'),
			).toBe(false);
		} finally {
			await cleanup();
		}
	});

	test('mandatory initial and post-tool overflow happen before embedding/next model invocation', async () => {
		const { directory, cleanup } = await createTempDirectory('phase17-overflow-');
		try {
			const durable = new JsonlSessionStore(join(directory, 'sessions'));
			await seed(durable, 4);
			const services = new SessionService(durable);
			const embeddings = new FakeEmbeddings();
			const model = new ScriptedModel([
				[{ contentDelta: '', toolCalls: [{ name: 'read_file', arguments: { path: 'huge.txt' } }] }],
			]);
			await writeFile(join(directory, 'huge.txt'), 'x'.repeat(40_000));
			const run = new RunAgentTurn({
				sessionStore: services,
				contextBuilder: builder(),
				historyRetriever: new HistoryRetriever(
					embeddings,
					new BinaryHistoryIndexStore(join(directory, 'index')),
				),
				model,
				clock: new TemporalClock(),
				idGenerator: new BunUuidV7IdGenerator(),
				toolExecutor: createLocalToolExecutor({
					workspaceRoot: directory,
					maxReadCharacters: 50_000,
				}),
			});
			await expect(
				collectAsyncIterable(run.run({ sessionId, prompt: 'x'.repeat(40_000) })),
			).rejects.toBeInstanceOf(ContextBudgetExceededError);
			expect(embeddings.texts).toEqual([]);
			expect(model.receivedInputs).toHaveLength(0);
			expect(
				(await durable.readSessionEvents(sessionId)).filter(
					(event) => event.type === 'prompt.submitted',
				),
			).toHaveLength(4);
			await expect(
				collectAsyncIterable(run.run({ sessionId, prompt: 'database read huge file' })),
			).rejects.toBeInstanceOf(ContextBudgetExceededError);
			expect(model.receivedInputs).toHaveLength(1);
			expect(embeddings.texts).toHaveLength(5);
			const events = await durable.readSessionEvents(sessionId);
			expect(events.at(-1)).toMatchObject({
				type: 'agent.error',
				error: { code: 'CONTEXT_BUDGET_EXCEEDED' },
			});
			expect(events.filter((event) => event.type === 'assistant.message.completed')).toHaveLength(
				4,
			);
		} finally {
			await cleanup();
		}
	});
});
