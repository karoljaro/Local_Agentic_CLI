import type { SessionStorePort, StoredSession } from '@/application/ports/SessionStorePort';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';

type InMemorySessionStoreOptions = {
	events?: AgentEvent[];
	sessions?: StoredSession[];
};

export class InMemorySessionStore implements SessionStorePort {
	readonly events: AgentEvent[];
	readonly sessions: StoredSession[];
	readCount = 0;

	constructor(options: InMemorySessionStoreOptions = {}) {
		this.events = options.events ?? [];
		this.sessions = options.sessions ?? [];
	}

	async listSessions(): Promise<StoredSession[]> {
		return this.sessions;
	}

	async readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		this.readCount += 1;
		return this.events.filter((event) => event.sessionId === sessionId);
	}

	async appendSessionEvent(event: AgentEvent): Promise<void> {
		this.events.push(event);
	}
}
