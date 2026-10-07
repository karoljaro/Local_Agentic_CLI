import type { SessionServicePort } from '@/application/ports/SessionServicePort';
import type { SessionStorePort, StoredSession } from '@/application/ports/SessionStorePort';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { AgentState } from '@/domain/AgentState';
import type { SessionId } from '@/domain/Ids';
import { AgentStateReducer } from './SessionReducer';

type SelectedSession = {
	events: AgentEvent[];
	reducer: AgentStateReducer;
};

/** Owns selected state and commits; the durable store remains authoritative. */
export class SessionService implements SessionServicePort {
	private selectedSessionId: SessionId | undefined;
	private selectedSession: SelectedSession | undefined;
	private ownershipTail: Promise<void> = Promise.resolve();
	private readonly appendTails = new Map<SessionId, Promise<void>>();
	private readonly listeners = new Set<(event: AgentEvent) => void | Promise<void>>();

	constructor(private readonly durableStore: SessionStorePort) {}

	listSessions(): Promise<StoredSession[]> {
		return this.durableStore.listSessions();
	}

	readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		return this.activateSession(sessionId);
	}

	activateSession(sessionId: SessionId): Promise<AgentEvent[]> {
		return this.withOwnership(async () => {
			const session = await this.selectSession(sessionId);
			return [...session.events];
		});
	}

	readSessionState(sessionId: SessionId): Promise<AgentState> {
		return this.withOwnership(async () => {
			const session = await this.selectSession(sessionId);
			return session.reducer.snapshot();
		});
	}

	async readPreviewEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		// Wait for writes already queued for this session, without selecting/reducing it.
		await this.appendTails.get(sessionId);
		return this.readFilteredEvents(sessionId);
	}

	appendSessionEvent(event: AgentEvent): Promise<void> {
		const append = this.withOwnership(async () => {
			// A failed reduction leaves the selected identity but discards all invalid state.
			// Reload it before any subsequent commit rather than publishing against stale state.
			const session =
				this.selectedSessionId === event.sessionId
					? await this.selectSession(event.sessionId)
					: undefined;
			await this.durableStore.appendSessionEvent(event);

			if (session !== undefined) {
				session.events.push(event);
				try {
					session.reducer.apply(event);
				} catch (error) {
					this.selectedSession = undefined;
					throw error;
				}
			}

			for (const listener of this.listeners) {
				try {
					const notification = listener(event);
					if (notification !== undefined) {
						void Promise.resolve(notification).catch(() => undefined);
					}
				} catch {
					// Presentation/diagnostic observers cannot change a committed append's result.
				}
			}
		});
		const settled = append.then(
			() => undefined,
			() => undefined,
		);
		this.appendTails.set(event.sessionId, settled);
		void settled.then(() => {
			if (this.appendTails.get(event.sessionId) === settled) {
				this.appendTails.delete(event.sessionId);
			}
		});
		return append;
	}

	subscribe(listener: (event: AgentEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private withOwnership<T>(operation: () => Promise<T>): Promise<T> {
		// Selection, loads, reads, and commits share a gate: a transition cannot evict
		// a reducer being finalized, and concurrent reads reuse the first loaded state.
		const result = this.ownershipTail.then(operation);
		this.ownershipTail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private async selectSession(sessionId: SessionId): Promise<SelectedSession> {
		if (this.selectedSessionId === sessionId && this.selectedSession !== undefined) {
			return this.selectedSession;
		}

		this.selectedSession = undefined;
		this.selectedSessionId = sessionId;
		const events = await this.readFilteredEvents(sessionId);
		const reducer = new AgentStateReducer(sessionId);
		for (const event of events) {
			reducer.apply(event);
		}
		const session = { events, reducer };
		this.selectedSession = session;
		return session;
	}

	private async readFilteredEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		const events = await this.durableStore.readSessionEvents(sessionId);
		return events.filter((event) => event.sessionId === sessionId);
	}
}
