import type { SessionStorePort, StoredSession } from '@/application/ports/SessionStorePort';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { AgentState } from '@/domain/AgentState';
import type { SessionId } from '@/domain/Ids';
import { AgentStateReducer } from './SessionReducer';

type CachedSession = {
	events: AgentEvent[];
	reducer: AgentStateReducer;
	appendTail: Promise<void>;
};

export class SessionStateCache implements SessionStorePort {
	private readonly sessions = new Map<SessionId, Promise<CachedSession>>();

	constructor(private readonly durableStore: SessionStorePort) {}

	listSessions(): Promise<StoredSession[]> {
		return this.durableStore.listSessions();
	}

	async readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		const session = await this.getSession(sessionId);
		await session.appendTail;

		return [...session.events];
	}

	async readSessionState(sessionId: SessionId): Promise<AgentState> {
		const session = await this.getSession(sessionId);
		await session.appendTail;

		return session.reducer.snapshot();
	}

	async appendSessionEvent(event: AgentEvent): Promise<void> {
		const session = await this.getSession(event.sessionId);
		const append = session.appendTail.then(async () => {
			await this.durableStore.appendSessionEvent(event);
			session.events.push(event);

			try {
				session.reducer.apply(event);
			} catch (caughtError) {
				this.sessions.delete(event.sessionId);
				throw caughtError;
			}
		});

		session.appendTail = append.catch(() => undefined);
		await append;
	}

	private getSession(sessionId: SessionId): Promise<CachedSession> {
		const cached = this.sessions.get(sessionId);

		if (cached !== undefined) {
			return cached;
		}

		const loading = this.loadSession(sessionId);
		this.sessions.set(sessionId, loading);
		void loading.catch(() => {
			if (this.sessions.get(sessionId) === loading) {
				this.sessions.delete(sessionId);
			}
		});

		return loading;
	}

	private async loadSession(sessionId: SessionId): Promise<CachedSession> {
		const events = await this.durableStore.readSessionEvents(sessionId);
		const reducer = new AgentStateReducer(sessionId);

		for (const event of events) {
			reducer.apply(event);
		}

		return {
			events: [...events],
			reducer,
			appendTail: Promise.resolve(),
		};
	}
}
