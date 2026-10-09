import type { SessionId } from '@/domain/Ids';

export type HistoryIndexEntry = {
	turnId: string;
	sourceHash: string;
	vector: Float32Array;
};

export type HistoryIndex = {
	version: 1;
	sessionId: SessionId;
	modelIdentity: string;
	dimension: number;
	entries: HistoryIndexEntry[];
};

/** Disposable derived state. Canonical payloads are never stored here. */
export interface HistoryIndexPort {
	read(sessionId: SessionId, signal?: AbortSignal): Promise<HistoryIndex | undefined>;
	write(index: HistoryIndex, signal?: AbortSignal): Promise<void>;
}
