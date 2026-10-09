import { createHash } from 'node:crypto';
import type { EmbeddingPort } from '@/application/ports/EmbeddingPort';
import type { HistoryIndex, HistoryIndexPort } from '@/application/ports/HistoryIndexPort';
import type { AgentState } from '@/domain/AgentState';
import { abortError, throwIfAborted } from './cancellation';
import { normalizeVector, searchVectors } from './ExactVectorSearch';
import {
	groupMessagesIntoTurns,
	historyQuery,
	isRetrievableTurn,
	projectHistoryTurn,
} from './HistoryTurns';

export type HistoryRetrieval = {
	enabled: boolean;
	candidates: { turnId: string; score: number }[];
	candidatesConsidered: number;
	fallbackReason?: 'disabled' | 'embedding-failed' | 'index-write-failed' | 'timeout';
	indexState?: 'missing' | 'corrupt' | 'rebuilt' | 'incremental' | 'reused';
	failureDetail?: string;
};

/** Owns selected-session cache lifecycle; never reads or replays durable events. */
export class HistoryRetriever {
	private tail: Promise<void> = Promise.resolve();
	private index: HistoryIndex | undefined;
	private active: { key: string; result?: HistoryRetrieval; query?: Float32Array } | undefined;

	constructor(
		private readonly embeddings: EmbeddingPort | undefined,
		private readonly store: HistoryIndexPort,
	) {}

	retrieve(state: AgentState, signal?: AbortSignal): Promise<HistoryRetrieval> {
		const result = this.tail.then(() => this.retrieveSelected(state, signal));
		this.tail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private async retrieveSelected(
		state: AgentState,
		signal?: AbortSignal,
	): Promise<HistoryRetrieval> {
		throwIfAborted(signal);
		if (!this.embeddings)
			return {
				enabled: false,
				candidates: [],
				candidatesConsidered: 0,
				fallbackReason: 'disabled',
			};
		const turns = groupMessagesIntoTurns(state.messages);
		const activeTurn = turns.at(-1) ?? [];
		const activeUser = activeTurn[0];
		const queryText = historyQuery(activeTurn);
		const key = JSON.stringify([
			state.sessionId,
			activeUser?.id,
			queryText,
			this.embeddings.modelIdentity,
		]);
		if (this.active?.key !== key) this.active = { key };
		if (this.active.result?.fallbackReason) return this.active.result;
		const historical = turns
			.slice(0, -1)
			.filter(isRetrievableTurn)
			.map((turn) => ({
				turnId: turn[0]!.id!,
				text: projectHistoryTurn(turn),
			}))
			.map((source) => ({
				...source,
				sourceHash: createHash('sha256').update(source.text).digest('hex'),
			}));
		if (historical.length === 0 || !queryText.trim())
			return { enabled: true, candidates: [], candidatesConsidered: 0 };
		const deadline = AbortSignal.timeout(10_000);
		const operationSignal = signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
		let stage: 'embedding-failed' | 'index-write-failed' = 'embedding-failed';
		let indexState: HistoryRetrieval['indexState'] = 'reused';
		let checkpoint: HistoryIndex | undefined;
		let existingEntries = 0;
		try {
			if (this.index?.sessionId !== state.sessionId) {
				this.index = undefined;
				try {
					this.index = await this.store.read(state.sessionId, operationSignal);
					if (!this.index) indexState = 'missing';
				} catch {
					throwIfAborted(operationSignal);
					indexState = 'corrupt';
				}
			}
			throwIfAborted(operationSignal);
			const query = (this.active.query ?? (await this.embed([queryText], operationSignal))[0])!;
			this.active.query = query;
			const compatible =
				this.index?.sessionId === state.sessionId &&
				this.index.version === 1 &&
				this.index.modelIdentity === this.embeddings.modelIdentity &&
				this.index.dimension === query.length &&
				this.index.entries.length <= historical.length &&
				this.index.entries.every(
					(entry, i) =>
						entry.turnId === historical[i]!.turnId &&
						entry.sourceHash === historical[i]!.sourceHash,
				);
			if (!compatible) {
				this.index = {
					version: 1,
					sessionId: state.sessionId,
					modelIdentity: this.embeddings.modelIdentity,
					dimension: query.length,
					entries: [],
				};
				if (indexState === 'reused') indexState = 'rebuilt';
			}
			const index = this.index!;
			const added = historical.length - index.entries.length;
			// Each completed batch is a valid source prefix; retain it if later embedding fails.
			const updated = { ...index, entries: [...index.entries] };
			existingEntries = index.entries.length;
			checkpoint = updated;
			for (let start = updated.entries.length; start < historical.length; start += 32) {
				const sources = historical.slice(start, start + 32);
				const vectors = await this.embed(
					sources.map((source) => source.text),
					operationSignal,
				);
				if (vectors.some((vector) => vector.length !== query.length))
					throw new Error('History embedding dimension changed.');
				for (let i = 0; i < vectors.length; i++) {
					const source = sources[i]!;
					updated.entries.push({
						turnId: source.turnId,
						sourceHash: source.sourceHash,
						vector: vectors[i]!,
					});
				}
			}
			if (added > 0 || !compatible) {
				stage = 'index-write-failed';
				await this.store.write(updated, operationSignal);
				this.index = updated;
				throwIfAborted(operationSignal);
				if (compatible) indexState = 'incremental';
			}
			const previous = turns.at(-2)?.[0];
			const excluded = new Set<string>(previous?.role === 'user' ? [previous.id] : []);
			const candidates = searchVectors(updated.entries, query, excluded, operationSignal);
			throwIfAborted(signal);
			const result: HistoryRetrieval = {
				enabled: true,
				candidates,
				candidatesConsidered: updated.entries.filter((entry) => !excluded.has(entry.turnId)).length,
				indexState,
			};
			this.active.result = result;
			return result;
		} catch (error) {
			if (signal?.aborted) {
				const cancelled = abortError();
				cancelled.cause = error;
				throw cancelled;
			}
			let failureDetail = error instanceof Error ? error.message : String(error);
			if (
				stage === 'embedding-failed' &&
				checkpoint &&
				checkpoint.entries.length > existingEntries
			) {
				try {
					const cleanupDeadline = AbortSignal.timeout(1_000);
					await this.store.write(
						checkpoint,
						signal === undefined ? cleanupDeadline : AbortSignal.any([signal, cleanupDeadline]),
					);
					this.index = checkpoint;
				} catch (checkpointError) {
					failureDetail += `; index checkpoint failed: ${checkpointError instanceof Error ? checkpointError.message : String(checkpointError)}`;
					if (signal?.aborted) {
						const cancelled = abortError();
						cancelled.cause = checkpointError;
						throw cancelled;
					}
				}
			}
			throwIfAborted(signal);
			const result: HistoryRetrieval = {
				enabled: true,
				candidates: [],
				candidatesConsidered: 0,
				fallbackReason: deadline.aborted ? 'timeout' : stage,
				indexState,
				failureDetail,
			};
			this.active.result = result;
			return result;
		}
	}

	private async embed(texts: string[], signal: AbortSignal): Promise<Float32Array[]> {
		throwIfAborted(signal);
		const vectors = await this.embeddings!.embed(texts, signal);
		throwIfAborted(signal);
		if (vectors.length !== texts.length) throw new Error('Embedding cardinality mismatch.');
		return vectors.map(normalizeVector);
	}
}
