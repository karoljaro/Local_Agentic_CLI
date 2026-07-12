import type {
	AgentErrorOccurred,
	AssistantMessageCompleted,
	AssistantToolCallsCompleted,
	PromptSubmitted,
	ToolCallCompleted,
	ToolCallFailed,
	ToolCallRequested,
	ToolCallStarted,
} from '@/domain/AgentEvent';
import type { SessionId, ToolCallId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelToolCall, ToolDefinition } from '@/domain/Tool';
import { reduceAgentState } from '../services/SessionReducer';
import { ContextBudgetExceededError, type ContextBuilder } from '../services/ContextBuilder';
import type { ModelChatInput, ModelPort } from '../ports/ModelPort';
import type { SessionStorePort } from '../ports/SessionStorePort';
import type { ClockPort } from '../ports/ClockPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type { ToolExecutorPort } from '../ports/ToolExecutorPort';

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

export type ToolApprovalRequest = {
	sessionId: SessionId;
	toolCallId: ToolCallId;
	toolName: string;
	toolInput: unknown;
};

export type ToolApprovalHandler = (request: ToolApprovalRequest) => Promise<boolean>;

type ToolExecutionBatchResult = {
	toolMessages: ModelMessage[];
	terminalMessage?: string;
};

type PersistedModelToolCall = ModelToolCall & { id: ToolCallId };

type ToolResultReference = {
	sourceToolCallId: ToolCallId;
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

export class RunAgentTurn {
	constructor(private readonly dependencies: RunAgentTurnDependencies) {}

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

		await this.dependencies.sessionStore.appendSessionEvent(promptEvent);

		const sessionEvents = await this.dependencies.sessionStore.readSessionEvents(sessionId);

		const reducedState = reduceAgentState(sessionId, sessionEvents);
		const { messages } = this.dependencies.contextBuilder.build(reducedState);

		if (this.dependencies.toolExecutor !== undefined) {
			yield* this.runWithTools(sessionId, messages, signal);
			return;
		}

		yield* this.runStreamingModelTurn(sessionId, messages, signal);
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
	): AsyncIterable<AgentTurnChunk> {
		const toolExecutor = this.dependencies.toolExecutor;

		if (toolExecutor === undefined) {
			return;
		}

		const tools = toolExecutor.listTools();

		if (tools.length === 0) {
			yield* this.runStreamingModelTurn(sessionId, messages, signal);
			return;
		}

		let currentMessages = messages;
		const toolResultReferences = new Map<string, ToolResultReference>();

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

			let preparedToolCalls: ModelToolCall[];

			try {
				preparedToolCalls = result.toolCalls.map((toolCall) => {
					const prepared = toolExecutor.prepare({
						toolName: toolCall.name,
						toolInput: toolCall.arguments,
					});

					return {
						...toolCall,
						name: prepared.toolName,
						arguments: prepared.toolInput,
					};
				});
			} catch (caughtError) {
				const error = toError(caughtError);

				await this.tryAppendAgentError(sessionId, error, 'MODEL_TOOL_CALL_INVALID');
				throw error;
			}

			const persistedToolCalls = preparedToolCalls.map((toolCall) => ({
				id: this.dependencies.idGenerator.nextToolCallId(),
				name: toolCall.name,
				arguments: toolCall.arguments,
			}));

			const persistedAssistantMessage = await this.appendAssistantToolCallsCompleted(
				sessionId,
				toContent(result),
				persistedToolCalls,
			);

			const { toolMessages, terminalMessage } = await this.executeToolCalls(
				sessionId,
				persistedToolCalls,
				toolExecutor,
				tools,
				toolResultReferences,
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

	private async executeToolCalls(
		sessionId: SessionId,
		toolCalls: PersistedModelToolCall[],
		toolExecutor: ToolExecutorPort,
		tools: ToolDefinition[],
		toolResultReferences: Map<string, ToolResultReference>,
	): Promise<ToolExecutionBatchResult> {
		const toolMessages: ModelMessage[] = [];

		for (const [toolCallIndex, toolCall] of toolCalls.entries()) {
			const toolCallId = toolCall.id;
			const toolName = toolCall.name;

			const requestedEvent = await this.appendToolCallRequested(sessionId, toolCall, tools);

			if (requestedEvent.approvalRequired) {
				const approved = await this.requestToolApproval({
					sessionId,
					toolCallId,
					toolName,
					toolInput: toolCall.arguments,
				});

				if (!approved) {
					const errorMessage = `Tool call was not approved: ${toolName}`;

					await this.appendToolCallFailed({
						sessionId,
						toolCallId,
						toolName,
						message: errorMessage,
						code: 'TOOL_APPROVAL_DENIED',
					});
					for (const cancelledToolCall of toolCalls.slice(toolCallIndex + 1)) {
						await this.appendToolCallRequested(sessionId, cancelledToolCall, tools);
						const cancelledMessage = `Tool call was cancelled after approval denial: ${cancelledToolCall.name}`;

						await this.appendToolCallFailed({
							sessionId,
							toolCallId: cancelledToolCall.id,
							toolName: cancelledToolCall.name,
							message: cancelledMessage,
							code: 'TOOL_BATCH_CANCELLED',
						});
					}

					return {
						toolMessages,
						terminalMessage: errorMessage,
					};
				}
			}

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
				const toolDefinition = getToolDefinition(toolName, tools);
				const cacheKey =
					toolDefinition.deduplicate === true
						? JSON.stringify([toolName, toolCall.arguments])
						: undefined;
				const previousResult =
					cacheKey === undefined ? undefined : toolResultReferences.get(cacheKey);
				let output: unknown;

				if (previousResult === undefined) {
					const result = await toolExecutor.execute({
						toolName,
						toolInput: toolCall.arguments,
					});
					output = result.output;

					if (cacheKey !== undefined) {
						toolResultReferences.set(cacheKey, { sourceToolCallId: toolCallId });
					}
				} else {
					output = createCachedToolOutput(previousResult.sourceToolCallId);
				}

				if (toolDefinition.invalidatesWorkspaceCache === true) {
					toolResultReferences.clear();
				}

				const completedEvent: ToolCallCompleted = {
					id: this.dependencies.idGenerator.nextEventId(),
					sessionId,
					type: 'tool.call.completed',
					timestamp: this.dependencies.clock.now(),
					toolCallId,
					toolName,
					output,
				};
				await this.dependencies.sessionStore.appendSessionEvent(completedEvent);

				toolMessages.push({
					role: 'tool',
					toolCallId,
					toolName,
					content: stringifyToolOutput(output),
				});
			} catch (caughtError) {
				const error = toError(caughtError);

				await this.appendToolCallFailed({
					sessionId,
					toolCallId,
					toolName,
					message: error.message,
					code: 'TOOL_FAILED',
					details: {
						name: error.name,
					},
				});

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
			toolMessages,
		};
	}

	private async appendToolCallRequested(
		sessionId: SessionId,
		toolCall: PersistedModelToolCall,
		tools: ToolDefinition[],
	): Promise<ToolCallRequested> {
		const requestedEvent: ToolCallRequested = {
			id: this.dependencies.idGenerator.nextEventId(),
			sessionId,
			type: 'tool.call.requested',
			timestamp: this.dependencies.clock.now(),
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			toolInput: toolCall.arguments,
			approvalRequired: isApprovalRequired(toolCall.name, tools),
		};

		await this.dependencies.sessionStore.appendSessionEvent(requestedEvent);

		return requestedEvent;
	}

	private async requestToolApproval(request: ToolApprovalRequest): Promise<boolean> {
		if (this.dependencies.approveToolCall === undefined) {
			return false;
		}

		try {
			return await this.dependencies.approveToolCall(request);
		} catch {
			return false;
		}
	}

	private async appendToolCallFailed(input: {
		sessionId: SessionId;
		toolCallId: ToolCallId;
		toolName: string;
		message: string;
		code: string;
		details?: unknown;
	}): Promise<void> {
		const failedEvent: ToolCallFailed = {
			id: this.dependencies.idGenerator.nextEventId(),
			sessionId: input.sessionId,
			type: 'tool.call.failed',
			timestamp: this.dependencies.clock.now(),
			toolCallId: input.toolCallId,
			toolName: input.toolName,
			error: {
				message: input.message,
				code: input.code,
				...(input.details === undefined ? {} : { details: input.details }),
			},
		};

		await this.dependencies.sessionStore.appendSessionEvent(failedEvent);
	}

	private async appendAssistantCompleted(sessionId: SessionId, content: string): Promise<void> {
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

	private async appendAssistantToolCallsCompleted(
		sessionId: SessionId,
		content: string,
		toolCalls: PersistedModelToolCall[],
	): Promise<AssistantToolCallsCompleted> {
		const completedEvent: AssistantToolCallsCompleted = {
			id: this.dependencies.idGenerator.nextEventId(),
			messageId: this.dependencies.idGenerator.nextMessageId(),
			sessionId,
			type: 'assistant.tool_calls.completed',
			timestamp: this.dependencies.clock.now(),
			content,
			toolCalls,
		};

		await this.dependencies.sessionStore.appendSessionEvent(completedEvent);

		return completedEvent;
	}

	private async appendAgentError(sessionId: SessionId, error: Error, code: string): Promise<void> {
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

const toContent = (response: StreamedModelResponse): string => response.contentDeltas.join('');

const stringifyToolOutput = (output: unknown): string => {
	if (typeof output === 'string') {
		return output;
	}

	const json = JSON.stringify(output);

	return json ?? String(output);
};

const createCachedToolOutput = (sourceToolCallId: ToolCallId): Record<string, unknown> => ({
	cached: true,
	sourceToolCallId,
	message: `Result reused from tool call ${sourceToolCallId}.`,
});

const withSignal = (
	input: Omit<ModelChatInput, 'signal'>,
	signal: AbortSignal | undefined,
): ModelChatInput => {
	return signal === undefined ? input : { ...input, signal };
};

const toError = (caughtError: unknown): Error =>
	caughtError instanceof Error ? caughtError : new Error(String(caughtError));

const isApprovalRequired = (toolName: string, tools: ToolDefinition[]): boolean => {
	return getToolDefinition(toolName, tools).requiresApproval === true;
};

const getToolDefinition = (toolName: string, tools: ToolDefinition[]): ToolDefinition => {
	const tool = tools.find((candidate) => candidate.name === toolName);

	if (tool === undefined) {
		throw new Error(`Unknown tool requested by model: ${toolName}`);
	}

	return tool;
};
