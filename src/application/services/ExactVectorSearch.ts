import type { HistoryIndexEntry } from '@/application/ports/HistoryIndexPort';
import { throwIfAborted } from './cancellation';

export const normalizeVector = (vector: Float32Array): Float32Array => {
	if (vector.length === 0 || vector.length > 65_536)
		throw new Error('Invalid embedding dimension.');
	let norm = 0;
	for (const value of vector) {
		if (!Number.isFinite(value)) throw new Error('Embedding contains nonfinite values.');
		norm += value * value;
	}
	if (!Number.isFinite(norm) || norm <= 0) throw new Error('Embedding has zero or invalid norm.');
	const divisor = Math.sqrt(norm);
	return Float32Array.from(vector, (value) => value / divisor);
};

export const searchVectors = (
	entries: HistoryIndexEntry[],
	query: Float32Array,
	excluded: Set<string>,
	signal?: AbortSignal,
): { turnId: string; score: number }[] => {
	const best: { turnId: string; score: number; position: number }[] = [];
	for (let position = 0; position < entries.length; position++) {
		if (position % 128 === 0) throwIfAborted(signal);
		const entry = entries[position]!;
		if (excluded.has(entry.turnId)) continue;
		if (entry.vector.length !== query.length) throw new Error('Embedding dimension mismatch.');
		let score = 0;
		for (let i = 0; i < query.length; i++) score += entry.vector[i]! * query[i]!;
		if (score < 0.65) continue;
		best.push({ turnId: entry.turnId, score, position });
		best.sort((a, b) => b.score - a.score || b.position - a.position);
		if (best.length > 8) best.pop();
	}
	throwIfAborted(signal);
	return best.map(({ turnId, score }) => ({ turnId, score }));
};
