import { describe, expect, test } from 'bun:test';
import type { HistoryIndexEntry } from '@/application/ports/HistoryIndexPort';
import { normalizeVector, searchVectors } from './ExactVectorSearch';

const vector = (values: number[]): Float32Array => normalizeVector(new Float32Array(values));
const entry = (turnId: string, values: number[]): HistoryIndexEntry => ({
	turnId,
	sourceHash: `source-${turnId}`,
	vector: vector(values),
});

describe('exact Float32 vector normalization', () => {
	test('normalizes magnitude without mutating caller-owned values', () => {
		const source = new Float32Array([3, 4]);
		const normalized = normalizeVector(source);
		expect(normalized).not.toBe(source);
		expect(Array.from(source)).toEqual([3, 4]);
		expect(normalized[0]).toBeCloseTo(0.6, 6);
		expect(normalized[1]).toBeCloseTo(0.8, 6);
		expect(normalized.reduce((sum, value) => sum + value * value, 0)).toBeCloseTo(1, 6);
	});

	test('normalizes negative finite components and the maximum accepted dimension', () => {
		expect(Array.from(normalizeVector(new Float32Array([-4, 0])))).toEqual([-1, 0]);
		const large = new Float32Array(65_536);
		large[65_535] = 2;
		const normalized = normalizeVector(large);
		expect(normalized).toHaveLength(65_536);
		expect(normalized[65_535]).toBe(1);
	});

	for (const [name, values] of [
		['empty dimension', []],
		['zero norm', [0, 0]],
		['NaN component', [1, NaN]],
		['positive infinity', [Infinity, 1]],
		['negative infinity', [1, -Infinity]],
	] as const) {
		test(`rejects ${name}`, () => {
			expect(() => normalizeVector(new Float32Array(values))).toThrow();
		});
	}

	test('rejects dimensions above the finite cache bound', () => {
		const large = new Float32Array(65_537);
		large[0] = 1;
		expect(() => normalizeVector(large)).toThrow('Invalid embedding dimension');
	});
});

describe('bounded exact cosine search', () => {
	test('empty current-session index has zero matches', () => {
		expect(searchVectors([], vector([1, 0]), new Set())).toEqual([]);
	});

	test('semantic similarity ranks relevant turns ahead of merely recent weak matches', () => {
		const entries = [
			entry('best-old', [1, 0]),
			entry('medium', [0.8, 0.6]),
			entry('weak-new', [0.7, Math.sqrt(0.51)]),
		];
		const matches = searchVectors(entries, vector([1, 0]), new Set());
		expect(matches.map((match) => match.turnId)).toEqual(['best-old', 'medium', 'weak-new']);
		expect(matches[0]?.score).toBeCloseTo(1, 6);
		expect(matches[1]?.score).toBeCloseTo(0.8, 6);
		expect(matches[2]?.score).toBeCloseTo(0.7, 6);
	});

	test('orthogonal, opposite and subthreshold history does not fill unused context', () => {
		const entries = [
			entry('orthogonal', [0, 1]),
			entry('opposite', [-1, 0]),
			entry('below', [0.649, Math.sqrt(1 - 0.649 ** 2)]),
		];
		expect(searchVectors(entries, vector([1, 0]), new Set())).toEqual([]);
	});

	test('uses the fixed 0.65 cosine relevance boundary without fixture-specific calibration', () => {
		const entries = [
			entry('below', [0.649, Math.sqrt(1 - 0.649 ** 2)]),
			entry('above', [0.651, Math.sqrt(1 - 0.651 ** 2)]),
		];
		const matches = searchVectors(entries, vector([1, 0]), new Set());
		expect(matches.map((match) => match.turnId)).toEqual(['above']);
		expect(matches[0]!.score).toBeGreaterThanOrEqual(0.65);
	});

	test('equal semantic scores prefer the newest canonical position deterministically', () => {
		const entries = [entry('oldest', [1, 0]), entry('middle', [1, 0]), entry('newest', [1, 0])];
		const before = entries.map((value) => ({ ...value, vector: new Float32Array(value.vector) }));
		const matches = searchVectors(entries, vector([1, 0]), new Set());
		expect(matches.map((match) => match.turnId)).toEqual(['newest', 'middle', 'oldest']);
		expect(searchVectors(entries, vector([1, 0]), new Set())).toEqual(matches);
		expect(entries).toEqual(before);
	});

	test('retains at most eight strongest candidates from a larger conversation', () => {
		const entries = Array.from({ length: 100 }, (_, index) => entry(`turn-${index}`, [1, 0]));
		const matches = searchVectors(entries, vector([1, 0]), new Set());
		expect(matches).toHaveLength(8);
		expect(matches.map((match) => match.turnId)).toEqual(
			Array.from({ length: 8 }, (_, index) => `turn-${99 - index}`),
		);
	});

	test('a very relevant old candidate is not discarded by the eight-candidate cap', () => {
		const entries = [
			entry('old-best', [1, 0]),
			...Array.from({ length: 20 }, (_, index) => entry(`new-${index}`, [0.8, 0.6])),
		];
		const matches = searchVectors(entries, vector([1, 0]), new Set());
		expect(matches).toHaveLength(8);
		expect(matches[0]?.turnId).toBe('old-best');
		expect(matches.slice(1).map((match) => match.turnId)).toEqual([
			'new-19',
			'new-18',
			'new-17',
			'new-16',
			'new-15',
			'new-14',
			'new-13',
		]);
	});

	test('excludes exact recent IDs before ranking and accepts the next relevant candidate', () => {
		const entries = [
			entry('old', [0.8, 0.6]),
			entry('previous', [1, 0]),
			entry('other', [0.9, Math.sqrt(0.19)]),
		];
		const excluded = new Set(['previous']);
		expect(searchVectors(entries, vector([1, 0]), excluded).map((match) => match.turnId)).toEqual([
			'other',
			'old',
		]);
		expect(excluded).toEqual(new Set(['previous']));
		expect(
			searchVectors(entries, vector([1, 0]), new Set(entries.map((value) => value.turnId))),
		).toEqual([]);
	});

	test('incompatible vector dimensions cannot be compared or mixed', () => {
		expect(() =>
			searchVectors([entry('incompatible', [1, 0, 0])], vector([1, 0]), new Set()),
		).toThrow('dimension mismatch');
	});

	test('excluded history is never considered even if its vector is incompatible', () => {
		expect(
			searchVectors(
				[entry('previous', [1, 0, 0]), entry('old', [1, 0])],
				vector([1, 0]),
				new Set(['previous']),
			),
		).toEqual([{ turnId: 'old', score: 1 }]);
	});

	test('already aborted scan fails with the existing normalized cancellation error', () => {
		const controller = new AbortController();
		controller.abort('caller-specific reason');
		for (const entries of [[], [entry('old', [1, 0])]]) {
			try {
				searchVectors(entries, vector([1, 0]), new Set(), controller.signal);
				throw new Error('Expected cancellation');
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).name).toBe('AbortError');
			}
		}
	});

	test('scan checks cancellation during bounded traversal rather than returning abandoned results', () => {
		const controller = new AbortController();
		const entries = Array.from({ length: 130 }, (_, index) => entry(`turn-${index}`, [1, 0]));
		const firstVector = entries[0]!.vector;
		Object.defineProperty(entries[0]!, 'vector', {
			get: () => {
				controller.abort();
				return firstVector;
			},
		});
		expect(() => searchVectors(entries, vector([1, 0]), new Set(), controller.signal)).toThrow(
			'The operation was aborted',
		);
	});
});
