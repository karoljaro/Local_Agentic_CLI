import { createHash } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, spyOn, test } from 'bun:test';

import type { HistoryIndex } from '@/application/ports/HistoryIndexPort';
import { asSessionId } from '@/domain/Ids';
import { createTempDirectory } from '@/test-support/createTempDirectory';

import { BinaryHistoryIndexStore } from './BinaryHistoryIndexStore';

type CacheHeader = {
	version: number;
	sessionId: string;
	modelIdentity: string;
	dimension: number;
	entries: { turnId: string; sourceHash: string }[];
	checksum: string;
};

type Fixture = {
	store: BinaryHistoryIndexStore;
	directory: string;
	root: string;
	path: string;
};

const sessionId = asSessionId('session-a');
const makeIndex = (): HistoryIndex => ({
	version: 1,
	sessionId,
	modelIdentity: 'ollama:embedding-model@digest',
	dimension: 2,
	entries: [
		{ turnId: 'durable-user-1', sourceHash: 'a'.repeat(64), vector: new Float32Array([3, 4]) },
		{ turnId: 'durable-user-2', sourceHash: 'b'.repeat(64), vector: new Float32Array([0, -5]) },
	],
});

const withStore = async (operation: (fixture: Fixture) => Promise<void>): Promise<void> => {
	const temp = await createTempDirectory('history-index-store-');
	const directory = join(temp.directory, 'index');
	try {
		await operation({
			store: new BinaryHistoryIndexStore(directory),
			directory,
			root: temp.directory,
			path: join(directory, `${sessionId}.bin`),
		});
	} finally {
		await temp.cleanup();
	}
};

const parseEnvelope = (bytes: Buffer): { header: CacheHeader; body: Buffer } => {
	const length = bytes.readUInt32LE(0);
	return {
		header: JSON.parse(bytes.subarray(4, 4 + length).toString('utf8')) as CacheHeader,
		body: Buffer.from(bytes.subarray(4 + length)),
	};
};

const envelope = (header: CacheHeader, body: Buffer, recomputeChecksum = false): Buffer => {
	const metadata = Buffer.from(
		JSON.stringify({
			...header,
			checksum: recomputeChecksum
				? createHash('sha256').update(body).digest('hex')
				: header.checksum,
		}),
	);
	const prefix = Buffer.alloc(4);
	prefix.writeUInt32LE(metadata.length);
	return Buffer.concat([prefix, metadata, body]);
};

describe('BinaryHistoryIndexStore', () => {
	test('missing cache returns undefined without creating derived state', async () => {
		await withStore(async ({ store, directory }) => {
			expect(await store.read(sessionId)).toBeUndefined();
			await expect(readdir(directory)).rejects.toHaveProperty('code', 'ENOENT');
		});
	});

	test('roundtrip preserves identities and exact normalized Float32 values across restart', async () => {
		await withStore(async ({ store, directory }) => {
			const index = makeIndex();
			await store.write(index);
			const restored = await new BinaryHistoryIndexStore(directory).read(sessionId);
			expect(restored).toEqual({
				...index,
				entries: [
					{ ...index.entries[0]!, vector: new Float32Array([0.6, 0.8]) },
					{ ...index.entries[1]!, vector: new Float32Array([0, -1]) },
				],
			});
			expect(index.entries[0]!.vector).toEqual(new Float32Array([3, 4]));
			expect(await readdir(directory)).toEqual([`${sessionId}.bin`]);
		});
	});

	test('envelope stores compact little-endian floats and metadata without transcript copies', async () => {
		await withStore(async ({ store, path }) => {
			const index = Object.assign(makeIndex(), {
				messages: [{ role: 'user', content: 'UNIQUE_CANONICAL_TRANSCRIPT_SECRET' }],
				searchText: 'UNIQUE_SEARCH_REPRESENTATION_SECRET',
			});
			await store.write(index);
			const bytes = await readFile(path);
			const { header, body } = parseEnvelope(bytes);
			expect(body.byteLength).toBe(index.entries.length * index.dimension * 4);
			expect(body.readFloatLE(0)).toBe(new Float32Array([0.6])[0]!);
			expect(body.readFloatLE(4)).toBe(new Float32Array([0.8])[0]!);
			expect(header.entries).toEqual(
				index.entries.map(({ turnId, sourceHash }) => ({ turnId, sourceHash })),
			);
			expect(bytes.includes(Buffer.from('UNIQUE_CANONICAL_TRANSCRIPT_SECRET'))).toBe(false);
			expect(bytes.includes(Buffer.from('UNIQUE_SEARCH_REPRESENTATION_SECRET'))).toBe(false);
		});
	});

	test('valid empty index can be persisted independently of chat history', async () => {
		await withStore(async ({ store }) => {
			const index = { ...makeIndex(), entries: [] };
			await store.write(index);
			expect(await store.read(sessionId)).toEqual(index);
		});
	});

	test('separate sessions retain separate turn identities and model metadata', async () => {
		await withStore(async ({ store, directory }) => {
			const other = {
				...makeIndex(),
				sessionId: asSessionId('session-b'),
				modelIdentity: 'ollama:another-embedding-model',
				entries: [{ ...makeIndex().entries[0]!, turnId: 'other-session-user' }],
			};
			await store.write(makeIndex());
			await store.write(other);
			expect((await store.read(sessionId))?.entries.map(({ turnId }) => turnId)).toEqual([
				'durable-user-1',
				'durable-user-2',
			]);
			expect((await store.read(other.sessionId))?.entries.map(({ turnId }) => turnId)).toEqual([
				'other-session-user',
			]);
			expect((await store.read(other.sessionId))?.modelIdentity).toBe(other.modelIdentity);
			expect((await readdir(directory)).sort()).toEqual(['session-a.bin', 'session-b.bin']);
		});
	});

	test.each([
		'',
		'.',
		'..',
		'../outside',
		'nested/session',
		'nested\\session',
		'bad\0session',
	])('rejects unsafe session path %j before accessing the cache', async (unsafe) => {
		await withStore(async ({ store, root }) => {
			const id = asSessionId(unsafe);
			await expect(store.read(id)).rejects.toThrow('Invalid history index session identity');
			await expect(store.write({ ...makeIndex(), sessionId: id })).rejects.toThrow(
				'Invalid history index session identity',
			);
			expect(await readdir(root)).toEqual([]);
		});
	});

	test.each([
		'short-prefix',
		'out-of-range-header',
		'invalid-json',
	] as const)('rejects corrupt %s without changing durable JSONL', async (kind) => {
		await withStore(async ({ store, root, path, directory }) => {
			const durablePath = join(root, 'events.jsonl');
			const durable = '{"id":"durable-event","prompt":"keep exact"}\n';
			await writeFile(durablePath, durable);
			await mkdir(directory);
			let bytes: Buffer;
			if (kind === 'short-prefix') bytes = Buffer.from([1, 2, 3]);
			else if (kind === 'out-of-range-header') {
				bytes = Buffer.alloc(4);
				bytes.writeUInt32LE(0xffff_ffff);
			} else {
				bytes = Buffer.from([1, 0, 0, 0, 123]);
			}
			await writeFile(path, bytes);
			await expect(store.read(sessionId)).rejects.toThrow();
			expect(await readFile(durablePath, 'utf8')).toBe(durable);
		});
	});

	test.each([
		'old-version',
		'wrong-session',
		'duplicate-turns',
		'invalid-source-hash',
		'dimension',
	] as const)('rejects incompatible %s metadata', async (kind) => {
		await withStore(async ({ store, path }) => {
			await store.write(makeIndex());
			const { header, body } = parseEnvelope(await readFile(path));
			if (kind === 'old-version') header.version = 0;
			if (kind === 'wrong-session') header.sessionId = 'session-b';
			if (kind === 'duplicate-turns') header.entries[1]!.turnId = header.entries[0]!.turnId;
			if (kind === 'invalid-source-hash') header.entries[0]!.sourceHash = 'not-a-source-hash';
			if (kind === 'dimension') header.dimension = 3;
			await writeFile(path, envelope(header, body));
			await expect(store.read(sessionId)).rejects.toThrow();
		});
	});

	test.each([
		'checksum',
		'truncated',
		'extra',
	] as const)('rejects %s vector-body corruption', async (kind) => {
		await withStore(async ({ store, path }) => {
			await store.write(makeIndex());
			const { header, body } = parseEnvelope(await readFile(path));
			let corrupted = body;
			if (kind === 'checksum') corrupted[0] = corrupted[0]! ^ 1;
			if (kind === 'truncated') corrupted = body.subarray(0, body.length - 1);
			if (kind === 'extra') corrupted = Buffer.concat([body, Buffer.alloc(4)]);
			await writeFile(path, envelope(header, corrupted));
			await expect(store.read(sessionId)).rejects.toThrow('vector data');
		});
	});

	test.each([
		{ name: 'zero', values: [0, 0] },
		{ name: 'NaN', values: [NaN, 0] },
		{ name: 'infinity', values: [Infinity, 0] },
		{ name: 'unnormalized', values: [2, 0] },
	])('rejects $name vectors even with a matching body checksum', async ({ values }) => {
		await withStore(async ({ store, path }) => {
			await store.write(makeIndex());
			const { header, body } = parseEnvelope(await readFile(path));
			body.writeFloatLE(values[0]!, 0);
			body.writeFloatLE(values[1]!, 4);
			await writeFile(path, envelope(header, body, true));
			await expect(store.read(sessionId)).rejects.toThrow();
		});
	});

	test.each([
		{ name: 'zero', vector: new Float32Array([0, 0]) },
		{ name: 'nonfinite', vector: new Float32Array([NaN, 1]) },
		{ name: 'wrong dimension', vector: new Float32Array([1]) },
	])('invalid $name writes preserve the previous cache', async ({ vector }) => {
		await withStore(async ({ store, path, directory }) => {
			await store.write(makeIndex());
			const previous = await readFile(path);
			const index = makeIndex();
			index.entries[0]!.vector = vector;
			await expect(store.write(index)).rejects.toThrow();
			expect(await readFile(path)).toEqual(previous);
			expect(await readdir(directory)).toEqual([`${sessionId}.bin`]);
		});
	});

	test('duplicate turn identities are rejected before publishing a cache', async () => {
		await withStore(async ({ store, root }) => {
			const index = makeIndex();
			index.entries[1]!.turnId = index.entries[0]!.turnId;
			await expect(store.write(index)).rejects.toThrow('Duplicate history index turn identity');
			expect(await readdir(root)).toEqual([]);
		});
	});

	test('replacement publishes a whole new dimension/model generation and leaves no temp', async () => {
		await withStore(async ({ store, directory }) => {
			await store.write(makeIndex());
			const replacement: HistoryIndex = {
				...makeIndex(),
				modelIdentity: 'ollama:replacement-model',
				dimension: 3,
				entries: [
					{
						turnId: 'durable-user-new',
						sourceHash: 'c'.repeat(64),
						vector: new Float32Array([0, 0, 1]),
					},
				],
			};
			await store.write(replacement);
			expect(await store.read(sessionId)).toEqual(replacement);
			expect(await readdir(directory)).toEqual([`${sessionId}.bin`]);
		});
	});

	test('pre-aborted reads and writes are cancelled without creating files', async () => {
		await withStore(async ({ store, root }) => {
			const controller = new AbortController();
			controller.abort('caller-specific reason');
			await expect(store.read(sessionId, controller.signal)).rejects.toHaveProperty(
				'name',
				'AbortError',
			);
			await expect(store.write(makeIndex(), controller.signal)).rejects.toHaveProperty(
				'name',
				'AbortError',
			);
			expect(await readdir(root)).toEqual([]);
		});
	});

	test('cancellation after temporary write removes the temp and preserves prior generation', async () => {
		await withStore(async ({ store, directory, path }) => {
			await store.write(makeIndex());
			const original = await readFile(path);
			const controller = new AbortController();
			const originalOpen = fsPromises.open;
			let writeSpy: ReturnType<typeof spyOn> | undefined;
			const openSpy = spyOn(fsPromises, 'open').mockImplementation(
				async (...args: Parameters<typeof fsPromises.open>) => {
					const handle = await originalOpen(...args);
					const originalWrite = handle.writeFile.bind(handle);
					writeSpy = spyOn(handle, 'writeFile').mockImplementation(
						async (...writeArgs: Parameters<typeof handle.writeFile>) => {
							await originalWrite(...writeArgs);
							controller.abort();
						},
					);
					return handle;
				},
			);
			try {
				await expect(store.write(makeIndex(), controller.signal)).rejects.toHaveProperty(
					'name',
					'AbortError',
				);
				expect(await readFile(path)).toEqual(original);
				expect(await readdir(directory)).toEqual([`${sessionId}.bin`]);
			} finally {
				writeSpy?.mockRestore();
				openSpy.mockRestore();
			}
		});
	});

	test('rename failure removes owned temp and preserves the original cache bytes', async () => {
		await withStore(async ({ store, directory, path }) => {
			await store.write(makeIndex());
			const original = await readFile(path);
			const cause = new Error('injected cache publish failure');
			const renameSpy = spyOn(fsPromises, 'rename').mockRejectedValue(cause);
			try {
				await expect(store.write(makeIndex())).rejects.toBe(cause);
				expect(await readFile(path)).toEqual(original);
				expect(await readdir(directory)).toEqual([`${sessionId}.bin`]);
			} finally {
				renameSpy.mockRestore();
			}
		});
	});

	test('publication and cleanup failure reports the primary error and owned remnant', async () => {
		await withStore(async ({ store, directory }) => {
			const cause = new Error('injected cache publish failure');
			const renameSpy = spyOn(fsPromises, 'rename').mockRejectedValue(cause);
			const unlinkSpy = spyOn(fsPromises, 'unlink').mockRejectedValue(
				new Error('injected cleanup failure'),
			);
			try {
				const result: unknown = await store.write(makeIndex()).catch((error: unknown) => error);
				expect(result).toBeInstanceOf(AggregateError);
				expect((result as AggregateError).errors[0]).toBe(cause);
				expect((result as AggregateError).errors[1].message).toBe('injected cleanup failure');
				expect((result as Error).message).toContain('.tmp');
				expect(await readdir(directory)).toHaveLength(1);
			} finally {
				unlinkSpy.mockRestore();
				renameSpy.mockRestore();
			}
		});
	});

	test('two readers reuse the same complete cached generation', async () => {
		await withStore(async ({ store }) => {
			await store.write(makeIndex());
			const [left, right] = await Promise.all([store.read(sessionId), store.read(sessionId)]);
			expect(left).toEqual(right);
			expect(left?.entries).toHaveLength(2);
		});
	});

	test('oversized cache stat rejects before allocating or reading the body', async () => {
		await withStore(async ({ store }) => {
			await store.write(makeIndex());
			const originalOpen = fsPromises.open;
			let statSpy: ReturnType<typeof spyOn> | undefined;
			let readSpy: ReturnType<typeof spyOn> | undefined;
			const openSpy = spyOn(fsPromises, 'open').mockImplementation(
				async (...args: Parameters<typeof fsPromises.open>) => {
					const handle = await originalOpen(...args);
					const metadata = await handle.stat();
					metadata.size = 256 * 1024 * 1024 + 1;
					statSpy = spyOn(handle, 'stat').mockResolvedValue(metadata);
					readSpy = spyOn(handle, 'read');
					return handle;
				},
			);
			const allocateSpy = spyOn(Buffer, 'alloc').mockImplementation(() => {
				throw new Error('Cache allocated bytes before validating its size.');
			});
			try {
				await expect(store.read(sessionId)).rejects.toThrow('Invalid history index size');
				expect(readSpy).not.toHaveBeenCalled();
				expect(allocateSpy).not.toHaveBeenCalled();
			} finally {
				allocateSpy.mockRestore();
				readSpy?.mockRestore();
				statSpy?.mockRestore();
				openSpy.mockRestore();
			}
		});
	});

	test('reader sentinel rejects bytes appended after the bounded size was observed', async () => {
		await withStore(async ({ store, path }) => {
			await store.write(makeIndex());
			const original = await readFile(path);
			const originalOpen = fsPromises.open;
			let statSpy: ReturnType<typeof spyOn> | undefined;
			const openSpy = spyOn(fsPromises, 'open').mockImplementation(
				async (...args: Parameters<typeof fsPromises.open>) => {
					const handle = await originalOpen(...args);
					const originalStat = handle.stat.bind(handle);
					statSpy = spyOn(handle, 'stat').mockImplementation((async () => {
						const observed = await originalStat();
						await appendFile(path, Buffer.from([1]));
						return observed;
					}) as typeof handle.stat);
					return handle;
				},
			);
			try {
				await expect(store.read(sessionId)).rejects.toThrow('History index changed during read');
				expect(statSpy).toHaveBeenCalledTimes(1);
				expect(await readFile(path)).toEqual(Buffer.concat([original, Buffer.from([1])]));
			} finally {
				statSpy?.mockRestore();
				openSpy.mockRestore();
			}
		});
	});
});
