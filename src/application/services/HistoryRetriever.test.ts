import { describe, expect, spyOn, test } from 'bun:test';
import type { EmbeddingPort } from '@/application/ports/EmbeddingPort';
import type { HistoryIndex, HistoryIndexPort } from '@/application/ports/HistoryIndexPort';
import type { AgentState } from '@/domain/AgentState';
import { asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';
import { HistoryRetriever } from './HistoryRetriever';
import { ContextBuilder } from './ContextBuilder';
import { projectHistoryTurn } from './HistoryTurns';
import { createHash } from 'node:crypto';

class MemoryIndex implements HistoryIndexPort {
	values = new Map<string, HistoryIndex>();
	reads = 0;
	writes = 0;
	readError = false;
	writeError = false;
	async read(id: string) {
		this.reads++;
		if (this.readError) throw new Error('corrupt cache');
		return this.values.get(id);
	}
	async write(index: HistoryIndex) {
		this.writes++;
		if (this.writeError) throw new Error('read-only cache');
		this.values.set(index.sessionId, structuredClone(index));
	}
}
class FakeEmbeddings implements EmbeddingPort {
	modelIdentity = 'fake-embedding-v1';
	calls: string[][] = [];
	dimension = 2;
	fail = false;
	async embed(texts: readonly string[], signal?: AbortSignal) {
		signal?.throwIfAborted();
		this.calls.push([...texts]);
		if (this.fail) throw new Error('provider unavailable');
		return texts.map((text) =>
			Float32Array.from(
				this.dimension === 2 ? (text.includes('database') ? [1, 0] : [0, 1]) : [1, 0, 0],
			),
		);
	}
	get texts() {
		return this.calls.flat();
	}
}
const user = (id: string, content = id): ModelMessage => ({
	role: 'user',
	id: asMessageId(id),
	content,
});
const turn = (id: string, content = id): ModelMessage[] => [
	user(id, content),
	{ role: 'assistant', content: `Answered ${id}` },
];
const state = (turns: ModelMessage[][], id = 'session'): AgentState => ({
	sessionId: asSessionId(id),
	messages: turns.flat(),
});
const fixture = () => {
	const store = new MemoryIndex();
	const embeddings = new FakeEmbeddings();
	return { store, embeddings, retriever: new HistoryRetriever(embeddings, store) };
};
const base = () =>
	state([
		turn('old', 'Use PostgreSQL database'),
		turn('unrelated', 'Explore colors'),
		turn('previous', 'Immediate context'),
		[user('active', 'database migrations')],
	]);
const compiler = new ContextBuilder({
	systemPrompt: 'System',
	contextProfile: { contextWindowTokens: 16384, maxOutputTokens: 4096 },
});

describe('current-session HistoryRetriever', () => {
	test('no historical turns performs no embedding/cache work and compiles active exact', async () => {
		const { retriever, store, embeddings } = fixture();
		const current = state([[user('active')]]);
		const result = await retriever.retrieve(current);
		expect(result).toEqual({ enabled: true, candidates: [], candidatesConsidered: 0 });
		expect(embeddings.texts).toEqual([]);
		expect(store.reads).toBe(0);
		expect(compiler.build(current, [], result).messages.slice(1)).toEqual(current.messages);
	});
	test('disabled does no provider/store work and returns explicit fallback', async () => {
		const store = new MemoryIndex();
		const result = await new HistoryRetriever(undefined, store).retrieve(base());
		expect(result.fallbackReason).toBe('disabled');
		expect(result.enabled).toBe(false);
		expect(store.reads).toBe(0);
		expect(compiler.build(base(), [], result).messages.slice(1)).toEqual(base().messages);
	});
	test('previous exact continuity does not require semantic match', async () => {
		const { retriever } = fixture();
		const current = state([turn('previous', 'Colors'), [user('active', 'database')]]);
		const result = await retriever.retrieve(current);
		expect(result.candidates).toEqual([]);
		expect(compiler.build(current, [], result).messages.slice(1)).toEqual(current.messages);
	});
	test('relevant old history ranks semantically; irrelevant history is omitted', async () => {
		const { retriever, store, embeddings } = fixture();
		const current = base();
		const before = structuredClone(current);
		const result = await retriever.retrieve(current);
		expect(result.candidates).toEqual([{ turnId: 'old', score: 1 }]);
		expect(result.candidatesConsidered).toBe(2);
		expect(result.indexState).toBe('missing');
		expect(embeddings.calls.map((batch) => batch.length)).toEqual([1, 3]);
		expect(store.values.get('session')!.entries.map((entry) => entry.turnId)).toEqual([
			'old',
			'unrelated',
			'previous',
		]);
		expect(compiler.build(current, [], result).messages.slice(1)).toEqual([
			...turn('old', 'Use PostgreSQL database'),
			...turn('previous', 'Immediate context'),
			user('active', 'database migrations'),
		]);
		expect(current).toEqual(before);
	});
	test('zero relevance produces zero old context despite unused budget', async () => {
		const { retriever } = fixture();
		const current = state([
			turn('old', 'Colors'),
			turn('previous', 'Layout'),
			[user('active', 'database')],
		]);
		const result = await retriever.retrieve(current);
		expect(result.candidates).toEqual([]);
		expect(compiler.build(current, [], result).messages.slice(1)).toEqual([
			...turn('previous', 'Layout'),
			user('active', 'database'),
		]);
	});
	test('previous relevant turn is excluded from retrieval even when indexed', async () => {
		const { retriever } = fixture();
		const result = await retriever.retrieve(
			state([turn('old', 'database'), turn('previous', 'database'), [user('active', 'database')]]),
		);
		expect(result.candidates.map((candidate) => candidate.turnId)).toEqual(['old']);
	});
	test('failed result/recovery chains are indexed without embedding tool bodies', async () => {
		const { retriever, embeddings } = fixture();
		const call = asToolCallId('read');
		const failed: ModelMessage[] = [
			user('failed', 'database file'),
			{
				role: 'assistant',
				content: 'Inspecting',
				toolCalls: [{ id: call, name: 'read_file', arguments: { path: 'db.ts' } }],
			},
			{
				role: 'tool',
				toolCallId: call,
				toolName: 'read_file',
				content: '{"error":"SECRET_FAILURE_BODY"}',
			},
			{ role: 'assistant', content: 'Retry next time' },
		];
		const current = state([failed, turn('previous'), [user('active', 'database')]]);
		const result = await retriever.retrieve(current);
		expect(result.candidates.map((candidate) => candidate.turnId)).toEqual(['failed']);
		expect(embeddings.texts.join(' ')).not.toContain('SECRET_FAILURE_BODY');
		expect(compiler.build(current, [], result).messages.slice(1, 5)).toEqual(failed);
	});
	test('orphan legacy units and leading legacy groups are never indexed', async () => {
		const { retriever, store } = fixture();
		const current = state([
			[{ role: 'assistant', content: 'Leading' }],
			[
				user('bad', 'database'),
				{
					role: 'tool',
					toolCallId: asToolCallId('orphan'),
					toolName: 'read_file',
					content: 'database',
				},
			],
			turn('previous'),
			[user('active', 'database')],
		]);
		const result = await retriever.retrieve(current);
		expect(result.candidates).toEqual([]);
		expect(store.values.get('session')!.entries.map((entry) => entry.turnId)).toEqual(['previous']);
	});
	test('missing cache rebuilds; same active tool rounds reuse query/index', async () => {
		const { retriever, store, embeddings } = fixture();
		await retriever.retrieve(base());
		const current = base();
		current.messages.push({ role: 'assistant', content: 'Inspecting database migration' });
		await retriever.retrieve(current);
		expect(store.writes).toBe(1);
		expect(store.reads).toBe(1);
		expect(embeddings.calls).toHaveLength(2);
	});
	test('incremental update embeds only newly historical turn plus new query', async () => {
		const { retriever, embeddings, store } = fixture();
		await retriever.retrieve(base());
		embeddings.calls = [];
		const current = base();
		current.messages.push(
			{ role: 'assistant', content: 'Migration done' },
			user('next', 'database rollback'),
		);
		const result = await retriever.retrieve(current);
		expect(result.indexState).toBe('incremental');
		expect(embeddings.calls.map((batch) => batch.length)).toEqual([1, 1]);
		expect(embeddings.texts[1]).toContain('Migration done');
		expect(store.values.get('session')!.entries.map((entry) => entry.turnId)).toEqual([
			'old',
			'unrelated',
			'previous',
			'active',
		]);
	});
	test('restart reuses valid persisted index with query embedding only', async () => {
		const { retriever, store } = fixture();
		await retriever.retrieve(base());
		const embeddings = new FakeEmbeddings();
		const result = await new HistoryRetriever(embeddings, store).retrieve(base());
		expect(result.indexState).toBe('reused');
		expect(result.candidates).toEqual([{ turnId: 'old', score: 1 }]);
		expect(embeddings.calls.map((batch) => batch.length)).toEqual([1]);
		expect(store.writes).toBe(1);
	});
	test('corrupt cache rebuilds safely without changing canonical history', async () => {
		const { retriever, store } = fixture();
		store.readError = true;
		const current = base();
		const before = structuredClone(current);
		const result = await retriever.retrieve(current);
		expect(result.indexState).toBe('corrupt');
		expect(result.candidates[0]!.turnId).toBe('old');
		expect(current).toEqual(before);
	});
	test('changed embedding identity invalidates all stored vectors', async () => {
		const { retriever, store } = fixture();
		await retriever.retrieve(base());
		const embeddings = new FakeEmbeddings();
		embeddings.modelIdentity = 'different-model';
		const result = await new HistoryRetriever(embeddings, store).retrieve(base());
		expect(result.indexState).toBe('rebuilt');
		expect(embeddings.calls.map((batch) => batch.length)).toEqual([1, 3]);
		expect(store.values.get('session')!.modelIdentity).toBe('different-model');
	});
	test('dimension change rebuilds without mixing incompatible vectors', async () => {
		const { retriever, store } = fixture();
		await retriever.retrieve(base());
		const embeddings = new FakeEmbeddings();
		embeddings.dimension = 3;
		const result = await new HistoryRetriever(embeddings, store).retrieve(base());
		expect(result.indexState).toBe('rebuilt');
		expect(store.values.get('session')!.entries.every((entry) => entry.vector.length === 3)).toBe(
			true,
		);
	});
	test('mixed batch dimensions fail safely and write no partial cache', async () => {
		const { store } = fixture();
		const embeddings: EmbeddingPort = {
			modelIdentity: 'mixed',
			async embed(texts) {
				return texts.map((_, i) => Float32Array.from(i ? [1, 0, 0] : [1, 0]));
			},
		};
		const result = await new HistoryRetriever(embeddings, store).retrieve(base());
		expect(result.fallbackReason).toBe('embedding-failed');
		expect(store.writes).toBe(0);
	});
	test('source projection changes invalidate cache; array positions do not supply identities', async () => {
		const { retriever, store, embeddings } = fixture();
		await retriever.retrieve(base());
		embeddings.calls = [];
		const current = base();
		current.messages[0] = user('old', 'Different database policy');
		current.messages.push(user('next', 'database'));
		const result = await retriever.retrieve(current);
		expect(result.indexState).toBe('rebuilt');
		expect(store.values.get('session')!.entries[0]!.turnId).toBe('old');
		expect(embeddings.calls[1]).toHaveLength(4);
	});
	test('provider failure is nonfatal, memoized per active turn, retried next user', async () => {
		const { retriever, embeddings } = fixture();
		embeddings.fail = true;
		const first = await retriever.retrieve(base());
		expect(first.fallbackReason).toBe('embedding-failed');
		expect(compiler.build(base(), [], first).messages.slice(1)).toEqual(base().messages);
		await retriever.retrieve(base());
		expect(embeddings.calls).toHaveLength(1);
		embeddings.fail = false;
		const current = base();
		current.messages.push(user('next', 'database'));
		expect((await retriever.retrieve(current)).fallbackReason).toBeUndefined();
	});
	test('index write failure falls back and reports internal failure', async () => {
		const { retriever, store } = fixture();
		store.writeError = true;
		const result = await retriever.retrieve(base());
		expect(result.fallbackReason).toBe('index-write-failed');
		expect(result.failureDetail).toBe('read-only cache');
		expect(store.values.size).toBe(0);
	});
	test('current session cannot retrieve another session; switching back safely reloads', async () => {
		const { retriever, store } = fixture();
		await retriever.retrieve(base());
		const other = state(
			[
				turn('other-old', 'Colors'),
				turn('other-recent', 'Layout'),
				[user('other-active', 'database')],
			],
			'other',
		);
		expect((await retriever.retrieve(other)).candidates).toEqual([]);
		expect(
			(await retriever.retrieve(base())).candidates.map((candidate) => candidate.turnId),
		).toEqual(['old']);
		expect(store.values.size).toBe(2);
	});
	test('concurrent reads serialize and avoid duplicate index embedding', async () => {
		const { retriever, embeddings, store } = fixture();
		const results = await Promise.all([retriever.retrieve(base()), retriever.retrieve(base())]);
		expect(results.map((result) => result.candidates)).toEqual([
			[{ turnId: 'old', score: 1 }],
			[{ turnId: 'old', score: 1 }],
		]);
		expect(store.writes).toBe(1);
		expect(embeddings.calls).toHaveLength(2);
	});
	test('caller cancellation aborts embedding, propagates and leaves cache unwritten', async () => {
		const store = new MemoryIndex();
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const embeddings: EmbeddingPort = {
			modelIdentity: 'abort',
			embed(_texts, signal) {
				entered();
				return new Promise((_, reject) =>
					signal!.addEventListener(
						'abort',
						() => reject(new DOMException('Aborted', 'AbortError')),
						{ once: true },
					),
				);
			},
		};
		const controller = new AbortController();
		const promise = new HistoryRetriever(embeddings, store).retrieve(base(), controller.signal);
		await started;
		controller.abort();
		await expect(promise).rejects.toHaveProperty('name', 'AbortError');
		expect(store.writes).toBe(0);
	});
	test('large history batches at most 32, final request is bounded/sparse and canonical history complete', async () => {
		const { retriever, embeddings, store } = fixture();
		const current = state([
			...Array.from({ length: 150 }, (_, i) =>
				turn(`old-${i}`, i === 2 ? 'database PostgreSQL' : 'Colors unrelated'),
			),
			turn('previous'),
			[user('active', 'database')],
		]);
		const count = current.messages.length;
		const result = await retriever.retrieve(current);
		const request = compiler.build(current, [], result);
		expect(embeddings.calls.every((batch) => batch.length <= 32)).toBe(true);
		expect(store.values.get('session')!.entries).toHaveLength(151);
		expect(current.messages).toHaveLength(count);
		expect(request.messages).toHaveLength(6);
		expect(request.diagnostics.retrievedTurnCount).toBe(1);
		expect(request.diagnostics.estimatedInputTokens).toBeLessThan(1000);
		expect(request.diagnostics.maxOutputTokens).toBe(4096);
		expect(request.diagnostics.safetyAllowanceTokens).toBe(1024);
	});
	test('verified rebuild prefix survives later batch failure and next user resumes incrementally', async () => {
		class FlakyEmbeddings extends FakeEmbeddings {
			recovered = false;
			override async embed(texts: readonly string[], signal?: AbortSignal) {
				const vectors = await super.embed(texts, signal);
				if (!this.recovered && this.calls.length === 3) throw new Error('Later batch failed');
				return vectors;
			}
		}
		const store = new MemoryIndex();
		const embeddings = new FlakyEmbeddings();
		const retriever = new HistoryRetriever(embeddings, store);
		const current = state([
			...Array.from({ length: 100 }, (_, i) => turn(`old-${i}`, 'database')),
			[user('active', 'database')],
		]);
		expect((await retriever.retrieve(current)).fallbackReason).toBe('embedding-failed');
		expect(store.values.get('session')!.entries).toHaveLength(32);
		embeddings.calls = [];
		embeddings.recovered = true;
		current.messages.push(user('next', 'database'));
		const result = await retriever.retrieve(current);
		expect(result.indexState).toBe('incremental');
		expect(embeddings.calls.map((batch) => batch.length)).toEqual([1, 32, 32, 5]);
		expect(embeddings.calls[1]![0]).toContain('Answered old-32');
		expect(store.values.get('session')!.entries).toHaveLength(101);
	});
	test('cancellation after atomic cache commit preserves the committed in-memory generation', async () => {
		const controller = new AbortController();
		class CancellingIndex extends MemoryIndex {
			override async write(index: HistoryIndex) {
				await super.write(index);
				controller.abort();
			}
		}
		const store = new CancellingIndex();
		const embeddings = new FakeEmbeddings();
		const retriever = new HistoryRetriever(embeddings, store);
		await expect(retriever.retrieve(base(), controller.signal)).rejects.toHaveProperty(
			'name',
			'AbortError',
		);
		expect(store.writes).toBe(1);
		const result = await retriever.retrieve(base());
		expect(result.indexState).toBe('reused');
		expect(embeddings.calls).toHaveLength(2);
		expect(store.writes).toBe(1);
	});

	test('retrieval deadline is a nonfatal timeout distinct from caller cancellation', async () => {
		const timeout = spyOn(AbortSignal, 'timeout').mockReturnValue(
			AbortSignal.abort(new DOMException('Deadline', 'TimeoutError')),
		);
		try {
			const { retriever, store, embeddings } = fixture();
			const result = await retriever.retrieve(base());
			expect(result.fallbackReason).toBe('timeout');
			expect(store.writes).toBe(0);
			expect(embeddings.texts).toEqual([]);
		} finally {
			timeout.mockRestore();
		}
	});

	test('stored source digest is deterministic projection only and no transcript copy', async () => {
		const { retriever, store } = fixture();
		await retriever.retrieve(base());
		const entry = store.values.get('session')!.entries[0]!;
		expect(entry.sourceHash).toBe(
			createHash('sha256')
				.update(projectHistoryTurn(turn('old', 'Use PostgreSQL database')))
				.digest('hex'),
		);
		expect(Object.keys(entry).sort()).toEqual(['sourceHash', 'turnId', 'vector']);
	});
});
