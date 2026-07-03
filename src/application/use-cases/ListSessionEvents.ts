import type { AgentEvent, AssistantMessageCompleted, PromptSubmitted } from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';
import type { SessionStorePort } from '../ports/SessionStorePort';

export type ListedSessionEvent = PromptSubmitted | AssistantMessageCompleted;

type ListSessionEventsInput = {
	sessionId: SessionId;
};

type ListSessionEventsResult = {
	events: ListedSessionEvent[];
};

type ListSessionEventsDependencies = {
	sessionStore: SessionStorePort;
};

export class ListSessionEvents {
	constructor(private readonly dependencies: ListSessionEventsDependencies) {}

	async list(input: ListSessionEventsInput): Promise<ListSessionEventsResult> {
		const events = await this.dependencies.sessionStore.readSessionEvents(input.sessionId);

		return {
			events: events.filter(isListedSessionEvent),
		};
	}
}

const isListedSessionEvent = (event: AgentEvent): event is ListedSessionEvent => {
	return event.type === 'prompt.submitted' || event.type === 'assistant.message.completed';
};
