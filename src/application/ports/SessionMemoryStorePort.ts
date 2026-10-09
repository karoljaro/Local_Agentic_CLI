import type { SessionId } from '@/domain/Ids';
import type { SessionMemoryDocument } from '@/domain/SessionMemory';

export interface SessionMemoryStorePort {
	read(sessionId: SessionId, signal?: AbortSignal): Promise<SessionMemoryDocument | undefined>;
	write(document: SessionMemoryDocument, signal?: AbortSignal): Promise<void>;
}
