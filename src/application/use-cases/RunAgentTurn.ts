import type { AssistantMessageCompleted, PromptSubmitted } from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';
import { reduceAgentState } from '../services/SessionReducer';
import { ContextBuilder } from '../services/ContextBuilder';
import type { ModelPort } from '../ports/ModelPort';
import type { SessionStorePort } from '../ports/SessionStorePort';
import type { ClockPort } from '../ports/ClockPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';

export type RunAgentTurnInput = {
	sessionId: SessionId;
	prompt: string;
};

export type AgentTurnChunk = {
	contentDelta: string;
};

export type RunAgentTurnDependencies = {
	sessionStore: SessionStorePort;
	model: ModelPort;
	contextBuilder: ContextBuilder;
	clock: ClockPort;
	idGenerator: IdGeneratorPort;
};

export class RunAgentTurn {
	constructor(private readonly dependencies: RunAgentTurnDependencies) {}

	async *run(input: RunAgentTurnInput): AsyncIterable<AgentTurnChunk> {
		const { sessionId, prompt } = input;

		const promptEvent: PromptSubmitted = {
			id: this.dependencies.idGenerator.nextEventId(),
			messageId: this.dependencies.idGenerator.nextMessageId(),
			sessionId,
			prompt,
			type: 'prompt.submitted',
			timestamp: this.dependencies.clock.now(),
		};

		await this.dependencies.sessionStore.appendSessionEvent(promptEvent);

		const sessionEvents =
			await this.dependencies.sessionStore.readSessionEvents(sessionId);

		const reducedState = reduceAgentState(sessionId, sessionEvents);
		const { messages } = this.dependencies.contextBuilder.build(reducedState);
		let assistantContent = '';

		for await (const chunk of this.dependencies.model.streamChat({ messages })) {
			assistantContent += chunk.contentDelta;

			yield { contentDelta: chunk.contentDelta };
		}

		const completedEvent: AssistantMessageCompleted = {
			id: this.dependencies.idGenerator.nextEventId(),
			messageId: this.dependencies.idGenerator.nextMessageId(),
			sessionId,
			type: 'assistant.message.completed',
			timestamp: this.dependencies.clock.now(),
			content: assistantContent,
		};

		await this.dependencies.sessionStore.appendSessionEvent(completedEvent);
	}
}
