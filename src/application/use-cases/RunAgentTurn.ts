import type {
	AgentErrorOccurred,
	AssistantMessageCompleted,
	PromptSubmitted,
} from '@/domain/AgentEvent';
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

		if (prompt.trim().length === 0) {
			throw new Error('Prompt cannot be empty.');
		}

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

		try {
			for await (const chunk of this.dependencies.model.streamChat({ messages })) {
				assistantContent += chunk.contentDelta;

				yield { contentDelta: chunk.contentDelta };
			}
		} catch (caughtError) {
			const error =
				caughtError instanceof Error
					? caughtError
					: new Error(String(caughtError));

			const errorEvent: AgentErrorOccurred = {
				id: this.dependencies.idGenerator.nextEventId(),
				sessionId,
				type: 'agent.error',
				timestamp: this.dependencies.clock.now(),
				error: {
					message: error.message,
					code: 'MODEL_STREAM_FAILED',
					recoverable: true,
					details: {
						name: error.name,
					},
				},
			};

			try {
				await this.dependencies.sessionStore.appendSessionEvent(errorEvent);
			} catch {
				// Preserve the original model error; storage failure is secondary here.
			}

			throw error;
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
