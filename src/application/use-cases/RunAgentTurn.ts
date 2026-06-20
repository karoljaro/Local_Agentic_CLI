import type {
	AgentErrorOccurred,
	AssistantMessageCompleted,
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
import type { ContextBuilder } from '../services/ContextBuilder';
import type { ModelChatInput, ModelPort } from '../ports/ModelPort';
import type { SessionStorePort } from '../ports/SessionStorePort';
import type { ClockPort } from '../ports/ClockPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type {
	ToolExecutionResult,
	ToolExecutorPort,
} from '../ports/ToolExecutorPort';

const MAX_TOOL_ITERATIONS = 12;
const CACHEABLE_TOOLS = new Set(['list_files', 'read_file', 'search_file']);
const CACHE_INVALIDATING_TOOLS = new Set(['create_file', 'edit_file']);

export type RunAgentTurnInput = {
	sessionId: SessionId;
	prompt: string;
	modelName?: string;
};

export type AgentTurnChunk = {
	contentDelta: string;
};

export type ToolApprovalRequest = {
	sessionId: SessionId;
	toolCallId: ToolCallId;
	toolName: string;
	toolInput: unknown;
};

export type ToolApprovalHandler = (
	request: ToolApprovalRequest,
) => Promise<boolean>;

type ToolExecutionBatchResult = {
	toolCalls: ModelToolCall[];
	toolMessages: ModelMessage[];
	terminalMessage?: string;
};

type StreamedModelResponse = {
	content: string;
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
		const { sessionId, prompt, modelName } = input;

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
		const result = yield* this.streamModelResponse(sessionId, { messages });

		await this.appendAssistantCompleted(sessionId, result.content);
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
		let assistantContent = '';
		const toolCache = new Map<string, ToolExecutionResult>();

		for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
			const result = yield* this.streamModelResponse(sessionId, {
				messages: currentMessages,
				tools,
			});
			assistantContent += result.content;

			if (result.toolCalls.length === 0) {
				await this.appendAssistantCompleted(sessionId, assistantContent);
				return;
			}

			const {
				toolCalls,
				toolMessages,
				terminalMessage,
			} = await this.executeToolCalls(
				sessionId,
				result.toolCalls,
				toolExecutor,
				tools,
				toolCache,
			);

			if (terminalMessage !== undefined) {
				if (terminalMessage.length > 0) {
					yield { contentDelta: terminalMessage };
					assistantContent += terminalMessage;
				}

				await this.appendAssistantCompleted(sessionId, assistantContent);
				return;
			}

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

	private async *streamModelResponse(
		sessionId: SessionId,
		input: ModelChatInput,
	): AsyncGenerator<AgentTurnChunk, StreamedModelResponse> {
		let content = '';
		const toolCalls: ModelToolCall[] = [];

		try {
			for await (const chunk of this.dependencies.model.streamChat(input)) {
				content += chunk.contentDelta;
				toolCalls.push(...(chunk.toolCalls ?? []));

				if (chunk.contentDelta.length > 0) {
					yield { contentDelta: chunk.contentDelta };
				}
			}
		} catch (caughtError) {
			const error = toError(caughtError);

			await this.tryAppendAgentError(sessionId, error, 'MODEL_STREAM_FAILED');
			throw error;
		}

		return { content, toolCalls };
	}

	private async executeToolCalls(
		sessionId: SessionId,
		toolCalls: ModelToolCall[],
		toolExecutor: ToolExecutorPort,
		tools: ToolDefinition[],
		toolCache: Map<string, ToolExecutionResult>,
	): Promise<ToolExecutionBatchResult> {
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
				approvalRequired: isApprovalRequired(toolName, tools),
			};
			await this.dependencies.sessionStore.appendSessionEvent(requestedEvent);

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

					return {
						toolCalls: toolCallsWithIds,
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
				const cacheKey = CACHEABLE_TOOLS.has(toolName)
					? JSON.stringify([toolName, toolCall.arguments])
					: undefined;
				let result =
					cacheKey === undefined ? undefined : toolCache.get(cacheKey);

				if (result === undefined) {
					result = await toolExecutor.execute({
						toolName,
						toolInput: toolCall.arguments,
					});

					if (cacheKey !== undefined) {
						toolCache.set(cacheKey, result);
					}
				}

				if (CACHE_INVALIDATING_TOOLS.has(toolName)) {
					toolCache.clear();
				}

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
			toolCalls: toolCallsWithIds,
			toolMessages,
		};
	}

	private async requestToolApproval(
		request: ToolApprovalRequest,
	): Promise<boolean> {
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

const toError = (caughtError: unknown): Error =>
	caughtError instanceof Error ? caughtError : new Error(String(caughtError));

const isApprovalRequired = (
	toolName: string,
	tools: ToolDefinition[],
): boolean => {
	return tools.some(
		(tool) => tool.name === toolName && tool.requiresApproval === true,
	);
};
