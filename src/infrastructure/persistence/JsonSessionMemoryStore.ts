import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { SessionMemoryStorePort } from '@/application/ports/SessionMemoryStorePort';
import { throwIfAborted } from '@/application/services/cancellation';
import type { SessionId } from '@/domain/Ids';
import {
	MEMORY_MAX_BYTES,
	SessionMemoryDocumentSchema,
	type SessionMemoryDocument,
} from '@/domain/SessionMemory';

/** Readable derived state; atomic replacement never writes conversation history. */
const publicationTails = new Map<string, Promise<void>>();

export class JsonSessionMemoryStore implements SessionMemoryStorePort {
	constructor(private readonly directory = '.agent/session-memory') {}
	async read(
		sessionId: SessionId,
		signal?: AbortSignal,
	): Promise<SessionMemoryDocument | undefined> {
		throwIfAborted(signal);
		await publicationTails.get(resolve(this.filePath(sessionId)));
		throwIfAborted(signal);
		try {
			const handle = await open(this.filePath(sessionId), 'r');
			try {
				const { size } = await handle.stat();
				if (size > MEMORY_MAX_BYTES) throw new Error('Session memory exceeds byte limit.');
				const bytes = Buffer.alloc(size);
				let offset = 0;
				while (offset < size) {
					throwIfAborted(signal);
					const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
					if (!bytesRead) throw new Error('Incomplete session memory.');
					offset += bytesRead;
				}
				if ((await handle.read(Buffer.alloc(1), 0, 1, size)).bytesRead)
					throw new Error('Session memory changed during read.');
				const document = SessionMemoryDocumentSchema.parse(JSON.parse(bytes.toString('utf8')));
				if (document.sessionId !== sessionId) throw new Error('Foreign session memory.');
				throwIfAborted(signal);
				return document;
			} finally {
				await handle.close();
			}
		} catch (error) {
			if ((error as { code?: string }).code === 'ENOENT') return undefined;
			throw error;
		}
	}
	async write(document: SessionMemoryDocument, signal?: AbortSignal): Promise<void> {
		const path = resolve(this.filePath(document.sessionId));
		const operation = (publicationTails.get(path) ?? Promise.resolve()).then(() =>
			this.replace(document, signal),
		);
		const settled = operation.catch(() => undefined);
		publicationTails.set(path, settled);
		void settled.then(() => {
			if (publicationTails.get(path) === settled) publicationTails.delete(path);
		});
		return operation;
	}
	private async replace(document: SessionMemoryDocument, signal?: AbortSignal): Promise<void> {
		const validated = SessionMemoryDocumentSchema.parse(document);
		const content = JSON.stringify(validated, null, 2) + '\n';
		if (Buffer.byteLength(content) > MEMORY_MAX_BYTES)
			throw new Error('Session memory exceeds byte limit.');
		const target = this.filePath(validated.sessionId);
		throwIfAborted(signal);
		await mkdir(this.directory, { recursive: true });
		const temporary = `${target}.${randomUUID()}.tmp`;
		const handle = await open(temporary, 'wx', 0o600);
		try {
			await handle.writeFile(content, 'utf8');
			await handle.close();
			throwIfAborted(signal);
			await rename(temporary, target);
		} catch (error) {
			await handle.close().catch(() => undefined);
			await unlink(temporary).catch(() => undefined);
			throw error;
		}
	}
	private filePath(sessionId: string): string {
		if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId))
			throw new Error('Unsafe memory session identity.');
		return join(this.directory, `${sessionId}.json`);
	}
}
