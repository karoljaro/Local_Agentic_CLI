import type { SessionStorePort, StoredSession } from '@/application/ports/SessionStorePort';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';

export type SessionEventListener = (event: AgentEvent) => void;

/** Publishes only events which have already been durably appended by the delegated store. */
export class PublishingSessionStore implements SessionStorePort {
	private readonly listeners = new Set<SessionEventListener>();

	constructor(private readonly delegate: SessionStorePort) {}

	listSessions(): Promise<StoredSession[]> {
		return this.delegate.listSessions();
	}

	readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		return this.delegate.readSessionEvents(sessionId);
	}

	async appendSessionEvent(event: AgentEvent): Promise<void> {
		await this.delegate.appendSessionEvent(event);

		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch {
				// Observers are diagnostics/presentation consumers and cannot change persistence semantics.
			}
		}
	}

	subscribe(listener: SessionEventListener): () => void {
		this.listeners.add(listener);

		return () => {
			this.listeners.delete(listener);
		};
	}
}
