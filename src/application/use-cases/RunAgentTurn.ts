import type {
	AgentErrorOccurred,
	AssistantMessageCompleted,
	PromptSubmitted,
	ToolCallCompleted,
	ToolCallFailed,
	ToolCallRequested,
	ToolCallStarted,
} from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelToolCall } from '@/domain/Tool';
import { reduceAgentState } from '../services/SessionReducer';
import { ContextBuilder } from '../services/ContextBuilder';
import type {
	ModelChatInput,
	ModelChatResult,
	ModelPort,
} from '../ports/ModelPort';
import type { SessionStorePort } from '../ports/SessionStorePort';
import type { ClockPort } from '../ports/ClockPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type { ToolExecutorPort } from '../ports/ToolExecutorPort';

const MAX_TOOL_ITERATIONS = 6;

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
	toolExecutor?: ToolExecutorPort;
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

		if (this.dependencies.toolExecutor !== undefined) {
			yield* this.runWithTools(sessionId, messages);
			return;
		}

		yield* this.runStreamingModelTurn(sessionId, messages);
	}

	private async *runStreamingModelTurn(
		sessionId: SessionId,
		messages: ModelMessage[],
	): AsyncIterable<AgentTurnChunk> {
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

			await this.tryAppendAgentError(sessionId, error, 'MODEL_STREAM_FAILED');
			throw error;
		}

		await this.appendAssistantCompleted(sessionId, assistantContent);
	}

	private async *runWithTools(
		sessionId: SessionId,
		messages: ModelMessage[],
	): AsyncIterable<AgentTurnChunk> {
		const toolExecutor = this.dependencies.toolExecutor;

		if (toolExecutor === undefined) {
			return;
		}

		const tools = toolExecutor.listTools();

		if (tools.length === 0) {
			yield* this.runStreamingModelTurn(sessionId, messages);
			return;
		}

		let currentMessages = messages;

		for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
			const result = await this.chatWithErrorPersistence(sessionId, {
				messages: currentMessages,
				tools,
			});

			if (result.toolCalls.length === 0) {
				yield* this.completeAssistantResponse(sessionId, result.content);
				return;
			}

			const { toolCalls, toolMessages } = await this.executeToolCalls(
				sessionId,
				result.toolCalls,
				toolExecutor,
			);

			currentMessages = [
				...currentMessages,
				{
					role: 'assistant',
					content: result.content,
					toolCalls,
				},
				...toolMessages,
			];
		}

		const error = new Error('Tool iteration limit reached.');

		await this.tryAppendAgentError(
			sessionId,
			error,
			'TOOL_ITERATION_LIMIT_REACHED',
		);
		throw error;
	}

	private async executeToolCalls(
		sessionId: SessionId,
		toolCalls: ModelToolCall[],
		toolExecutor: ToolExecutorPort,
	): Promise<{ toolCalls: ModelToolCall[]; toolMessages: ModelMessage[] }> {
		const toolCallsWithIds: ModelToolCall[] = [];
		const toolMessages: ModelMessage[] = [];

		for (const toolCall of toolCalls) {
			const toolCallId = this.dependencies.idGenerator.nextToolCallId();
			const toolName = toolCall.name;

			toolCallsWithIds.push({
				id: toolCallId,
				name: toolName,
				arguments: toolCall.arguments,
			});

			const requestedEvent: ToolCallRequested = {
				id: this.dependencies.idGenerator.nextEventId(),
				sessionId,
				type: 'tool.call.requested',
				timestamp: this.dependencies.clock.now(),
				toolCallId,
				toolName,
				toolInput: toolCall.arguments,
				approvalRequired: false,
			};
			await this.dependencies.sessionStore.appendSessionEvent(requestedEvent);

			const startedEvent: ToolCallStarted = {
				id: this.dependencies.idGenerator.nextEventId(),
				sessionId,
				type: 'tool.call.started',
				timestamp: this.dependencies.clock.now(),
				toolCallId,
				toolName,
			};
			await this.dependencies.sessionStore.appendSessionEvent(startedEvent);

			try {
				const result = await toolExecutor.execute({
					toolName,
					toolInput: toolCall.arguments,
				});

				const completedEvent: ToolCallCompleted = {
					id: this.dependencies.idGenerator.nextEventId(),
					sessionId,
					type: 'tool.call.completed',
					timestamp: this.dependencies.clock.now(),
					toolCallId,
					toolName,
					output: result.output,
				};
				await this.dependencies.sessionStore.appendSessionEvent(completedEvent);

				toolMessages.push({
					role: 'tool',
					toolCallId,
					toolName,
					content: stringifyToolOutput(result.output),
				});
			} catch (caughtError) {
				const error =
					caughtError instanceof Error
						? caughtError
						: new Error(String(caughtError));

				const failedEvent: ToolCallFailed = {
					id: this.dependencies.idGenerator.nextEventId(),
					sessionId,
					type: 'tool.call.failed',
					timestamp: this.dependencies.clock.now(),
					toolCallId,
					toolName,
					error: {
						message: error.message,
						code: 'TOOL_FAILED',
						details: {
							name: error.name,
						},
					},
				};
				await this.dependencies.sessionStore.appendSessionEvent(failedEvent);

				toolMessages.push({
					role: 'tool',
					toolCallId,
					toolName,
					content: stringifyToolOutput({
						error: {
							message: error.message,
						},
					}),
				});
			}
		}

		return {
			toolCalls: toolCallsWithIds,
			toolMessages,
		};
	}

	private async chatWithErrorPersistence(
		sessionId: SessionId,
		input: ModelChatInput,
	): Promise<ModelChatResult> {
		try {
			return await this.dependencies.model.chat(input);
		} catch (caughtError) {
			const error =
				caughtError instanceof Error
					? caughtError
					: new Error(String(caughtError));

			await this.tryAppendAgentError(sessionId, error, 'MODEL_CHAT_FAILED');
			throw error;
		}
	}

	private async *completeAssistantResponse(
		sessionId: SessionId,
		content: string,
	): AsyncIterable<AgentTurnChunk> {
		if (content.length > 0) {
			yield { contentDelta: content };
		}

		await this.appendAssistantCompleted(sessionId, content);
	}

	private async appendAssistantCompleted(
		sessionId: SessionId,
		content: string,
	): Promise<void> {
		const completedEvent: AssistantMessageCompleted = {
			id: this.dependencies.idGenerator.nextEventId(),
			messageId: this.dependencies.idGenerator.nextMessageId(),
			sessionId,
			type: 'assistant.message.completed',
			timestamp: this.dependencies.clock.now(),
			content,
		};

		await this.dependencies.sessionStore.appendSessionEvent(completedEvent);
	}

	private async appendAgentError(
		sessionId: SessionId,
		error: Error,
		code: string,
	): Promise<void> {
		const errorEvent: AgentErrorOccurred = {
			id: this.dependencies.idGenerator.nextEventId(),
			sessionId,
			type: 'agent.error',
			timestamp: this.dependencies.clock.now(),
			error: {
				message: error.message,
				code,
				recoverable: true,
				details: {
					name: error.name,
				},
			},
		};

		await this.dependencies.sessionStore.appendSessionEvent(errorEvent);
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

const stringifyToolOutput = (output: unknown): string => {
	if (typeof output === 'string') {
		return output;
	}

	const json = JSON.stringify(output);

	return json ?? String(output);
};
