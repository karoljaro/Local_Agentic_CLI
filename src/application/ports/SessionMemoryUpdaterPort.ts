import type { SessionMemory } from '@/domain/SessionMemory';

export type MemoryEvidence = { messageId: string; role: 'user' | 'assistant'; text: string };
export type MemoryUpdateInput = {
	memory: SessionMemory;
	evidence: MemoryEvidence[];
	modelName?: string;
	signal: AbortSignal;
};

/** Optional semantic operation; returns untrusted data, always validated by the host. */
export interface SessionMemoryUpdaterPort {
	update(input: MemoryUpdateInput): Promise<unknown>;
}
