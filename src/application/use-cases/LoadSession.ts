import type { AgentState } from '@/domain/AgentState';
import type { SessionId } from '@/domain/Ids';
import type { SessionStorePort } from '../ports/SessionStorePort';
import { reduceAgentState } from '../services/SessionReducer';

export type LoadSessionInput = {
	sessionId: SessionId;
};

export type LoadSessionResult = {
	state: AgentState;
};

export type LoadSessionDependencies = {
	sessionStore: SessionStorePort;
};

export class LoadSession {
	constructor(private readonly dependencies: LoadSessionDependencies) {}

	async load(input: LoadSessionInput): Promise<LoadSessionResult> {
		const { sessionId } = input;

		const sessionEvents =
			await this.dependencies.sessionStore.readSessionEvents(sessionId);

		const state = reduceAgentState(sessionId, sessionEvents);
        
		return { state };
	}
}
