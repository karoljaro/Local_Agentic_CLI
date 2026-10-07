import type { AgentEvent } from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';
import type { SessionServicePort } from '../ports/SessionServicePort';

export type ListedSessionEvent = AgentEvent;

type ListSessionEventsInput = {
	sessionId: SessionId;
};

type ListSessionEventsResult = {
	events: ListedSessionEvent[];
};

type ListSessionEventsDependencies = {
	sessionStore: SessionServicePort;
};

export class ListSessionEvents {
	constructor(private readonly dependencies: ListSessionEventsDependencies) {}

	async list(input: ListSessionEventsInput): Promise<ListSessionEventsResult> {
		const events = await this.dependencies.sessionStore.activateSession(input.sessionId);

		return {
			events,
		};
	}
}
