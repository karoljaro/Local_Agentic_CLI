import type { SessionMemoryStorePort } from '@/application/ports/SessionMemoryStorePort';
import type {
	MemoryUpdateInput,
	SessionMemoryUpdaterPort,
} from '@/application/ports/SessionMemoryUpdaterPort';
import type { SessionId } from '@/domain/Ids';
import { emptySessionMemory, type SessionMemoryDocument } from '@/domain/SessionMemory';

export const noMemoryDelta = () => ({ version: 1 as const, goal: null, changes: [] });
export class FakeMemoryStore implements SessionMemoryStorePort {
	readonly documents = new Map<string, SessionMemoryDocument>();
	readonly writes: SessionMemoryDocument[] = [];
	readCount = 0;
	failRead = false;
	failWrite = false;
	async read(sessionId: SessionId) {
		this.readCount++;
		if (this.failRead) throw new Error('read unavailable');
		return structuredClone(this.documents.get(sessionId));
	}
	async write(document: SessionMemoryDocument) {
		if (this.failWrite) throw new Error('write unavailable');
		this.writes.push(structuredClone(document));
		this.documents.set(document.sessionId, structuredClone(document));
	}
}
export class FakeMemoryUpdater implements SessionMemoryUpdaterPort {
	readonly inputs: MemoryUpdateInput[] = [];
	handler: (input: MemoryUpdateInput) => unknown | Promise<unknown> = noMemoryDelta;
	async update(input: MemoryUpdateInput) {
		this.inputs.push(input);
		return this.handler(input);
	}
}
export const memoryItem = (key: string, text: string, revision = 1) => ({
	key,
	text,
	revision,
	basis: 'user-sourced' as const,
	sourceMessageIds: ['user-1'],
	sourceEventIds: [],
});
export const sampleMemory = () => ({
	...emptySessionMemory(),
	goal: { ...memoryItem('goal', 'Implement the file service.'), key: 'goal' as const },
	decisions: [memoryItem('database', 'Use PostgreSQL.')],
	constraints: [memoryItem('tui', 'Do not redesign the TUI.')],
	pending: [memoryItem('tests', 'Run the integration tests.')],
});
