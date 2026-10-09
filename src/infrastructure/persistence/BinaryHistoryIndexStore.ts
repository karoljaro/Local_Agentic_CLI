import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { HistoryIndex, HistoryIndexPort } from '@/application/ports/HistoryIndexPort';
import { normalizeVector } from '@/application/services/ExactVectorSearch';
import { throwIfAborted } from '@/application/services/cancellation';
import type { SessionId } from '@/domain/Ids';

const Header = z.object({
	version: z.literal(1),
	sessionId: z.string().min(1),
	modelIdentity: z.string().min(1),
	dimension: z.number().int().min(1).max(65_536),
	entries: z
		.array(z.object({ turnId: z.string().min(1), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }))
		.max(50_000),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
});
const checksum = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const MAX_BYTES = 256 * 1024 * 1024;

/** One atomic envelope, explicit little endian vectors, no canonical text. */
export class BinaryHistoryIndexStore implements HistoryIndexPort {
	constructor(private readonly directory = '.agent/history-index') {}

	async read(sessionId: SessionId, signal?: AbortSignal): Promise<HistoryIndex | undefined> {
		throwIfAborted(signal);
		let bytes: Buffer;
		try {
			const handle = await open(this.filePath(sessionId), 'r');
			try {
				const { size } = await handle.stat();
				if (size > MAX_BYTES || size < 4) throw new Error('Invalid history index size.');
				bytes = Buffer.alloc(size);
				let offset = 0;
				while (offset < size) {
					throwIfAborted(signal);
					const { bytesRead } = await handle.read(
						bytes,
						offset,
						Math.min(262_144, size - offset),
						offset,
					);
					if (bytesRead === 0) throw new Error('Incomplete history index read.');
					offset += bytesRead;
				}
				if ((await handle.read(Buffer.alloc(1), 0, 1, size)).bytesRead !== 0)
					throw new Error('History index changed during read.');
			} finally {
				await handle.close();
			}
		} catch (error) {
			if ((error as { code?: string }).code === 'ENOENT') return undefined;
			throw error;
		}
		throwIfAborted(signal);
		if (bytes.length > MAX_BYTES || bytes.length < 4)
			throw new Error('Invalid history index size.');
		const headerLength = bytes.readUInt32LE(0);
		if (headerLength > 16 * 1024 * 1024 || headerLength + 4 > bytes.length)
			throw new Error('Invalid history index header.');
		const header = Header.parse(JSON.parse(bytes.subarray(4, 4 + headerLength).toString('utf8')));
		const body = bytes.subarray(4 + headerLength);
		if (
			header.sessionId !== sessionId ||
			new Set(header.entries.map((entry) => entry.turnId)).size !== header.entries.length ||
			body.length !== header.entries.length * header.dimension * 4 ||
			checksum(body) !== header.checksum
		)
			throw new Error('Invalid history index identity or vector data.');
		const entries = header.entries.map((entry, position) => {
			throwIfAborted(signal);
			const vector = new Float32Array(header.dimension);
			for (let i = 0; i < vector.length; i++)
				vector[i] = body.readFloatLE((position * header.dimension + i) * 4);
			// Reject invalid vectors; preserve stored floats for repeatable rankings.
			normalizeVector(vector);
			let norm = 0;
			for (const value of vector) norm += value * value;
			if (Math.abs(norm - 1) > 0.001) throw new Error('Unnormalized history index vector.');
			return { ...entry, vector };
		});
		return {
			version: 1,
			sessionId,
			modelIdentity: header.modelIdentity,
			dimension: header.dimension,
			entries,
		};
	}

	async write(index: HistoryIndex, signal?: AbortSignal): Promise<void> {
		throwIfAborted(signal);
		const filePath = this.filePath(index.sessionId);
		const bodyLength = index.entries.length * index.dimension * 4;
		if (!Number.isSafeInteger(bodyLength) || bodyLength > MAX_BYTES)
			throw new Error('History index is too large.');
		const body = Buffer.alloc(bodyLength);
		for (let position = 0; position < index.entries.length; position++) {
			throwIfAborted(signal);
			const entry = index.entries[position]!;
			if (entry.vector.length !== index.dimension)
				throw new Error('History index dimension mismatch.');
			const vector = normalizeVector(entry.vector);
			for (let i = 0; i < index.dimension; i++)
				body.writeFloatLE(vector[i]!, (position * index.dimension + i) * 4);
		}
		const metadata = Header.parse({
			...index,
			entries: index.entries.map(({ turnId, sourceHash }) => ({ turnId, sourceHash })),
			checksum: checksum(body),
		});
		if (new Set(metadata.entries.map((entry) => entry.turnId)).size !== metadata.entries.length)
			throw new Error('Duplicate history index turn identity.');
		const header = Buffer.from(JSON.stringify(metadata), 'utf8');
		if (header.length > 16 * 1024 * 1024 || 4 + header.length + body.length > MAX_BYTES)
			throw new Error('History index is too large.');
		const prefix = Buffer.alloc(4);
		prefix.writeUInt32LE(header.length);
		throwIfAborted(signal);
		await mkdir(this.directory, { recursive: true });
		const temporary = `${filePath}.${randomUUID()}.tmp`;
		const handle = await open(temporary, 'wx', 0o600);
		try {
			await handle.writeFile(Buffer.concat([prefix, header, body]));
			await handle.close();
			throwIfAborted(signal);
			await rename(temporary, filePath);
		} catch (error) {
			await handle.close().catch(() => undefined);
			try {
				await unlink(temporary);
			} catch (cleanupError) {
				if ((cleanupError as { code?: string }).code !== 'ENOENT')
					throw new AggregateError(
						[error, cleanupError],
						`History index write failed; temporary file cleanup failed: ${temporary}`,
					);
			}
			throw error;
		}
	}

	private filePath(sessionId: SessionId): string {
		if (!sessionId || sessionId === '.' || sessionId === '..' || /[/\\\0]/.test(sessionId))
			throw new Error('Invalid history index session identity.');
		return join(this.directory, `${sessionId}.bin`);
	}
}
