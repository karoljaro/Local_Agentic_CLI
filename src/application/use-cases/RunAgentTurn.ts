import type {
	AgentErrorOccurred,
	AssistantMessageCompleted,
	AssistantToolCallsCompleted,
	PromptSubmitted,
} from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelToolCall } from '@/domain/Tool';
import type { ClockPort } from '../ports/ClockPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type { ModelChatInput, ModelPort } from '../ports/ModelPort';
import type { SessionStorePort } from '../ports/SessionStorePort';
import type { ToolExecutorPort } from '../ports/ToolExecutorPort';
import { ContextBudgetExceededError, type ContextBuilder } from '../services/ContextBuilder';
import { SessionStateCache } from '../services/SessionStateCache';
import {
	ToolRunner,
	type PersistedModelToolCall,
	type ToolApprovalHandler,
} from '../services/ToolRunner';

export type { ToolApprovalHandler, ToolApprovalRequest } from '../services/ToolRunner';

const MAX_TOOL_ITERATIONS = 12;

type RunAgentTurnInput = {
	sessionId: SessionId;
	prompt: string;
	modelName?: string;
	signal?: AbortSignal;
};

type AgentTurnChunk = {
	contentDelta: string;
};

type StreamedModelResponse = {
	contentDeltas: string[];
	toolCalls: ModelToolCall[];
};

export type RunAgentTurnDependencies = {
	sessionStore: SessionStorePort;
	model: ModelPort;
	contextBuilder: ContextBuilder;
	clock: ClockPort;
	idGenerator: IdGeneratorPort;
	toolExecutor?: ToolExecutorPort;
	approveToolCall?: ToolApprovalHandler;
};

export class AgentLoop {
	private readonly sessionStore: SessionStateCache;

	constructor(private readonly dependencies: RunAgentTurnDependencies) {
		this.sessionStore =
			dependencies.sessionStore instanceof SessionStateCache
				? dependencies.sessionStore
				: new SessionStateCache(dependencies.sessionStore);
	}

	async *run(input: RunAgentTurnInput): AsyncIterable<AgentTurnChunk> {
		const { sessionId, prompt, modelName, signal } = input;

		if (prompt.trim().length === 0) {
			throw new Error('Prompt cannot be empty.');
		}

		const promptEvent: PromptSubmitted = {
			id: this.dependencies.idGenerator.nextEventId(),
			messageId: this.dependencies.idGenerator.nextMessageId(),
			sessionId,
			prompt,
			...(modelName === undefined ? {} : { modelName }),
			type: 'prompt.submitted',
			timestamp: this.dependencies.clock.now(),
		};
		this.dependencies.contextBuilder.assertPromptFits(prompt, promptEvent.messageId);

		await this.sessionStore.appendSessionEvent(promptEvent);

		const state = await this.sessionStore.readSessionState(sessionId);
		const { messages } = this.dependencies.contextBuilder.build(state);

		if (this.dependencies.toolExecutor === undefined) {
			yield* this.runStreamingModelTurn(sessionId, messages, signal);
			return;
		}

		yield* this.runWithTools(sessionId, messages, signal, this.dependencies.toolExecutor);
	}

	private async *runStreamingModelTurn(
		sessionId: SessionId,
		messages: ModelMessage[],
		signal: AbortSignal | undefined,
	): AsyncIterable<AgentTurnChunk> {
		const result = yield* this.readModelResponse(sessionId, withSignal({ messages }, signal), true);

		await this.appendAssistantCompleted(sessionId, toContent(result));
	}

	private async *runWithTools(
		sessionId: SessionId,
		messages: ModelMessage[],
		signal: AbortSignal | undefined,
		toolExecutor: ToolExecutorPort,
	): AsyncIterable<AgentTurnChunk> {
		const toolRunner = new ToolRunner({
			sessionStore: this.sessionStore,
			clock: this.dependencies.clock,
			idGenerator: this.dependencies.idGenerator,
			toolExecutor,
			...(this.dependencies.approveToolCall === undefined
				? {}
				: { approveToolCall: this.dependencies.approveToolCall }),
		});
		const tools = toolRunner.listTools();

		if (tools.length === 0) {
			yield* this.runStreamingModelTurn(sessionId, messages, signal);
			return;
		}

		let currentMessages = messages;

		for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
			currentMessages = await this.fitModelMessages(sessionId, currentMessages);
			const result = yield* this.readModelResponse(
				sessionId,
				withSignal({ messages: currentMessages, tools }, signal),
				false,
			);

			if (result.toolCalls.length === 0) {
				for (const contentDelta of result.contentDeltas) {
					yield { contentDelta };
				}

				await this.appendAssistantCompleted(sessionId, toContent(result));
				return;
			}

			let persistedToolCalls: PersistedModelToolCall[];

			try {
				persistedToolCalls = toolRunner.prepareToolCalls(result.toolCalls);
			} catch (caughtError) {
				const error = toError(caughtError);

				await this.tryAppendAgentError(sessionId, error, 'MODEL_TOOL_CALL_INVALID');
				throw error;
			}

			const persistedAssistantMessage = await this.appendAssistantToolCallsCompleted(
				sessionId,
				toContent(result),
				persistedToolCalls,
			);
			const { toolMessages, terminalMessage } = await toolRunner.executeToolCalls(
				sessionId,
				persistedToolCalls,
			);

			if (terminalMessage !== undefined) {
				if (terminalMessage.length > 0) {
					yield { contentDelta: terminalMessage };
				}

				await this.appendAssistantCompleted(sessionId, terminalMessage);
				return;
			}

			currentMessages = [
				...currentMessages,
				{
					id: persistedAssistantMessage.messageId,
					role: 'assistant',
					content: toContent(result),
					toolCalls: persistedToolCalls,
				},
				...toolMessages,
			];
		}

		const error = new Error('Tool iteration limit reached.');

		await this.tryAppendAgentError(sessionId, error, 'TOOL_ITERATION_LIMIT_REACHED');
		throw error;
	}

	private async fitModelMessages(
		sessionId: SessionId,
		messages: ModelMessage[],
	): Promise<ModelMessage[]> {
		try {
			return this.dependencies.contextBuilder.fit(messages);
		} catch (caughtError) {
			if (caughtError instanceof ContextBudgetExceededError) {
				await this.tryAppendAgentError(sessionId, caughtError, 'CONTEXT_BUDGET_EXCEEDED');
			}

			throw caughtError;
		}
	}

	private async *readModelResponse(
		sessionId: SessionId,
		input: ModelChatInput,
		streamContent: boolean,
	): AsyncGenerator<AgentTurnChunk, StreamedModelResponse> {
		const contentDeltas: string[] = [];
		const toolCalls: ModelToolCall[] = [];

		try {
			for await (const chunk of this.dependencies.model.streamChat(input)) {
				toolCalls.push(...(chunk.toolCalls ?? []));

				if (chunk.contentDelta.length > 0) {
					contentDeltas.push(chunk.contentDelta);

					if (streamContent) {
						yield { contentDelta: chunk.contentDelta };
					}
				}
			}
		} catch (caughtError) {
			const error = toError(caughtError);

			await this.tryAppendAgentError(sessionId, error, 'MODEL_STREAM_FAILED');
			throw error;
		}

		return { contentDeltas, toolCalls };
	}

	private async appendAssistantCompleted(sessionId: SessionId, content: string): Promise<void> {
		const event: AssistantMessageCompleted = {
			id: this.dependencies.idGenerator.nextEventId(),
			messageId: this.dependencies.idGenerator.nextMessageId(),
			sessionId,
			type: 'assistant.message.completed',
			timestamp: this.dependencies.clock.now(),
			content,
		};

		await this.sessionStore.appendSessionEvent(event);
	}

	private async appendAssistantToolCallsCompleted(
		sessionId: SessionId,
		content: string,
		toolCalls: PersistedModelToolCall[],
	): Promise<AssistantToolCallsCompleted> {
		const event: AssistantToolCallsCompleted = {
			id: this.dependencies.idGenerator.nextEventId(),
			messageId: this.dependencies.idGenerator.nextMessageId(),
			sessionId,
			type: 'assistant.tool_calls.completed',
			timestamp: this.dependencies.clock.now(),
			content,
			toolCalls,
		};

		await this.sessionStore.appendSessionEvent(event);

		return event;
	}

	private async appendAgentError(sessionId: SessionId, error: Error, code: string): Promise<void> {
		const event: AgentErrorOccurred = {
			id: this.dependencies.idGenerator.nextEventId(),
			sessionId,
			type: 'agent.error',
			timestamp: this.dependencies.clock.now(),
			error: {
				message: error.message,
				code,
				recoverable: true,
				details: { name: error.name },
			},
		};

		await this.sessionStore.appendSessionEvent(event);
	}

	private async tryAppendAgentError(
		sessionId: SessionId,
		error: Error,
		code: string,
	): Promise<void> {
		try {
			await this.appendAgentError(sessionId, error, code);
		} catch {
			// Preserve the original error; storage failure is secondary here.
		}
	}
}

export { AgentLoop as RunAgentTurn };

const toContent = (response: StreamedModelResponse): string => response.contentDeltas.join('');

const withSignal = (
	input: Omit<ModelChatInput, 'signal'>,
	signal: AbortSignal | undefined,
): ModelChatInput => (signal === undefined ? input : { ...input, signal });

const toError = (caughtError: unknown): Error =>
	caughtError instanceof Error ? caughtError : new Error(String(caughtError));
