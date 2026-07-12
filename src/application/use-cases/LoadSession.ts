import type { AgentState } from '@/domain/AgentState';
import type { SessionId } from '@/domain/Ids';
import type { SessionStorePort } from '../ports/SessionStorePort';
import { SessionStateCache } from '../services/SessionStateCache';

type LoadSessionInput = {
	sessionId: SessionId;
};

type LoadSessionResult = {
	state: AgentState;
};

type LoadSessionDependencies = {
	sessionStore: SessionStorePort;
};

export class LoadSession {
	private readonly sessionStore: SessionStateCache;

	constructor(dependencies: LoadSessionDependencies) {
		this.sessionStore =
			dependencies.sessionStore instanceof SessionStateCache
				? dependencies.sessionStore
				: new SessionStateCache(dependencies.sessionStore);
	}

	async load(input: LoadSessionInput): Promise<LoadSessionResult> {
		const { sessionId } = input;

		const state = await this.sessionStore.readSessionState(sessionId);

		return { state };
	}
}
