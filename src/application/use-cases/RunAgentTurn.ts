import { isAbortError, throwIfAborted } from '../services/cancellation';
import type { HistoryRetriever } from '../services/HistoryRetriever';
import type { SessionMemoryService } from '../services/SessionMemoryService';
import type {
	AgentErrorOccurred,
	AssistantMessageCompleted,
	AssistantToolCallsCompleted,
	PromptSubmitted,
} from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';
import type { ModelToolCall, ToolDefinition } from '@/domain/Tool';
import type { ClockPort } from '../ports/ClockPort';
import type { AgentMetricsPort, AgentTurnMetricsPort } from '../ports/AgentMetricsPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type { ModelChatInput, ModelPort } from '../ports/ModelPort';
import type { MonotonicClockPort } from '../ports/MonotonicClockPort';
import type { SessionServicePort } from '../ports/SessionServicePort';
import type { ToolExecutorPort } from '../ports/ToolExecutorPort';
import { ContextBudgetExceededError, type ContextBuilder } from '../services/ContextBuilder';
import {
	ToolRunner,
	ToolBatchValidationError,
	type PersistedModelToolCall,
	type PreparedModelToolCall,
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
	sessionStore: SessionServicePort;
	model: ModelPort;
	contextBuilder: ContextBuilder;
	historyRetriever?: HistoryRetriever;
	sessionMemory?: SessionMemoryService;
	clock: ClockPort;
	idGenerator: IdGeneratorPort;
	toolExecutor?: ToolExecutorPort;
	approveToolCall?: ToolApprovalHandler;
	agentMetrics?: AgentMetricsPort;
	monotonicClock?: MonotonicClockPort;
};

export class AgentLoop {
	constructor(private readonly dependencies: RunAgentTurnDependencies) {}

	async *run(input: RunAgentTurnInput): AsyncIterable<AgentTurnChunk> {
		if (input.prompt.trim().length === 0) {
			throw new Error('Prompt cannot be empty.');
		}

		const turnMetrics = startTurnMetrics(this.dependencies.agentMetrics, input.sessionId);

		try {
			yield* this.runTurn(input, turnMetrics);
		} finally {
			completeTurnMetrics(turnMetrics);
		}
	}

	private async *runTurn(
		input: RunAgentTurnInput,
		turnMetrics: AgentTurnMetricsPort | undefined,
	): AsyncIterable<AgentTurnChunk> {
		const { sessionId, prompt, modelName, signal } = input;
		throwIfAborted(signal);

		const promptEvent: PromptSubmitted = {
			id: this.dependencies.idGenerator.nextEventId(),
			messageId: this.dependencies.idGenerator.nextMessageId(),
			sessionId,
			prompt,
			...(modelName === undefined ? {} : { modelName }),
			type: 'prompt.submitted',
			timestamp: this.dependencies.clock.now(),
		};
		const toolRunner =
			this.dependencies.toolExecutor === undefined
				? undefined
				: new ToolRunner({
						sessionStore: this.dependencies.sessionStore,
						clock: this.dependencies.clock,
						idGenerator: this.dependencies.idGenerator,
						toolExecutor: this.dependencies.toolExecutor,
						...(this.dependencies.approveToolCall === undefined
							? {}
							: { approveToolCall: this.dependencies.approveToolCall }),
						...(turnMetrics === undefined ? {} : { turnMetrics }),
						...(this.dependencies.monotonicClock === undefined
							? {}
							: { monotonicClock: this.dependencies.monotonicClock }),
					});
		const tools = toolRunner?.listTools() ?? [];

		this.dependencies.contextBuilder.assertPromptFits(prompt, promptEvent.messageId, tools);

		const events = await this.dependencies.sessionStore.activateSession(sessionId);
		try {
			await this.dependencies.sessionMemory?.activate(sessionId, events);
		} catch {
			/* Optional memory cannot prevent chat. */
		}
		throwIfAborted(signal);
		await this.dependencies.sessionStore.appendSessionEvent(promptEvent);
		throwIfAborted(signal);

		let memoryFinalized = false;
		try {
			for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
				throwIfAborted(signal);
				const request = await this.buildModelInput(sessionId, tools, signal);
				throwIfAborted(signal);
				const result = yield* this.readModelResponse(
					sessionId,
					withSignal(request, signal),
					turnMetrics,
				);

				throwIfAborted(signal);

				if (toolRunner === undefined || tools.length === 0 || result.toolCalls.length === 0) {
					const final = await this.appendAssistantCompleted(sessionId, toContent(result));
					await this.maintainMemory(
						sessionId,
						promptEvent.messageId,
						final.messageId,
						modelName,
						signal,
					);
					memoryFinalized = true;
					return;
				}

				let preparedToolCalls: PreparedModelToolCall[];

				try {
					preparedToolCalls = toolRunner.prepareToolCalls(result.toolCalls);
				} catch (caughtError) {
					if (caughtError instanceof ToolBatchValidationError) {
						throwIfAborted(signal);
						// Preserve the supplied arguments for truthful feedback, never repair or execute them.
						const rejectedCalls = result.toolCalls.map((call) => ({
							id: this.dependencies.idGenerator.nextToolCallId(),
							name: call.name,
							arguments: structuredClone(call.arguments),
						}));
						await this.appendAssistantToolCallsCompleted(
							sessionId,
							toContent(result),
							rejectedCalls,
						);
						await toolRunner.rejectToolCalls(
							sessionId,
							rejectedCalls,
							caughtError,
							signal === undefined ? {} : { signal },
						);
						continue;
					}
					const error = toError(caughtError);

					await this.tryAppendAgentError(sessionId, error, 'MODEL_TOOL_CALL_INVALID');
					throw error;
				}

				throwIfAborted(signal);
				const persistedToolCalls = preparedToolCalls.map((record) => record.call);
				await this.appendAssistantToolCallsCompleted(
					sessionId,
					toContent(result),
					persistedToolCalls,
				);
				throwIfAborted(signal);
				const { terminalMessage } = await toolRunner.executeToolCalls(
					sessionId,
					preparedToolCalls,
					signal === undefined ? {} : { signal },
				);
				throwIfAborted(signal);

				if (terminalMessage !== undefined) {
					if (terminalMessage.length > 0) {
						yield { contentDelta: terminalMessage };
					}

					throwIfAborted(signal);
					await this.appendAssistantCompleted(sessionId, terminalMessage);
					await this.maintainMemory(sessionId, promptEvent.messageId, undefined, modelName, signal);
					memoryFinalized = true;
					return;
				}
			}

			const error = new Error('Tool iteration limit reached.');

			await this.tryAppendAgentError(sessionId, error, 'TOOL_ITERATION_LIMIT_REACHED');
			throw error;
		} finally {
			// Also captures truthful exact effects after failure/interruption; no semantic completion.
			if (!memoryFinalized)
				await this.maintainMemory(sessionId, promptEvent.messageId, undefined, modelName, signal);
		}
	}

	private async maintainMemory(
		sessionId: SessionId,
		userId: string,
		finalId: string | undefined,
		modelName: string | undefined,
		signal: AbortSignal | undefined,
	) {
		try {
			await this.dependencies.sessionMemory?.finish(sessionId, userId, finalId, modelName, signal);
		} catch {
			/* A completed answer or primary turn error remains valid. */
		}
	}

	private async buildModelInput(
		sessionId: SessionId,
		tools: ToolDefinition[],
		signal: AbortSignal | undefined,
	): Promise<ModelChatInput> {
		try {
			const state = await this.dependencies.sessionStore.readSessionState(sessionId);
			throwIfAborted(signal);
			// Mandatory overflow wins before embedding work; canonical history stays untouched.
			if (this.dependencies.historyRetriever !== undefined)
				this.dependencies.contextBuilder.build(state, tools, {
					enabled: true,
					candidates: [],
					candidatesConsidered: 0,
				});
			const retrieval = await this.dependencies.historyRetriever?.retrieve(state, signal);
			throwIfAborted(signal);
			const { messages, contextProfile } = this.dependencies.contextBuilder.build(
				state,
				tools,
				retrieval,
				this.dependencies.sessionMemory?.snapshot(sessionId),
			);
			return { messages, contextProfile, ...(tools.length === 0 ? {} : { tools }) };
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
		turnMetrics: AgentTurnMetricsPort | undefined,
	): AsyncGenerator<AgentTurnChunk, StreamedModelResponse> {
		const contentDeltas: string[] = [];
		const toolCalls: ModelToolCall[] = [];
		throwIfAborted(input.signal);
		recordModelRequestMetric(turnMetrics, measureModelRequestCharacters(input));
		throwIfAborted(input.signal);

		try {
			for await (const chunk of this.dependencies.model.streamChat(input)) {
				throwIfAborted(input.signal);
				if (chunk.finishReason === 'length') {
					throw new ModelOutputTruncatedError();
				}
				toolCalls.push(...(chunk.toolCalls ?? []));

				if (chunk.contentDelta.length > 0) {
					contentDeltas.push(chunk.contentDelta);

					yield { contentDelta: chunk.contentDelta };
				}
			}
		} catch (caughtError) {
			const error = toError(caughtError);

			if (!isAbortError(caughtError))
				await this.tryAppendAgentError(
					sessionId,
					error,
					error instanceof ModelOutputTruncatedError
						? 'MODEL_OUTPUT_TRUNCATED'
						: 'MODEL_STREAM_FAILED',
				);
			throw error;
		}

		throwIfAborted(input.signal);
		return { contentDeltas, toolCalls };
	}

	private async appendAssistantCompleted(
		sessionId: SessionId,
		content: string,
	): Promise<AssistantMessageCompleted> {
		const event: AssistantMessageCompleted = {
			id: this.dependencies.idGenerator.nextEventId(),
			messageId: this.dependencies.idGenerator.nextMessageId(),
			sessionId,
			type: 'assistant.message.completed',
			timestamp: this.dependencies.clock.now(),
			content,
		};

		await this.dependencies.sessionStore.appendSessionEvent(event);
		return event;
	}

	private async appendAssistantToolCallsCompleted(
		sessionId: SessionId,
		content: string,
		toolCalls: PersistedModelToolCall[],
	): Promise<void> {
		const event: AssistantToolCallsCompleted = {
			id: this.dependencies.idGenerator.nextEventId(),
			messageId: this.dependencies.idGenerator.nextMessageId(),
			sessionId,
			type: 'assistant.tool_calls.completed',
			timestamp: this.dependencies.clock.now(),
			content,
			toolCalls,
		};

		await this.dependencies.sessionStore.appendSessionEvent(event);
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

		await this.dependencies.sessionStore.appendSessionEvent(event);
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

export class ModelOutputTruncatedError extends Error {
	constructor() {
		super('The model response reached its generation or context limit and may be incomplete.');
		this.name = 'ModelOutputTruncatedError';
	}
}

const toContent = (response: StreamedModelResponse): string => response.contentDeltas.join('');

const withSignal = (
	input: Omit<ModelChatInput, 'signal'>,
	signal: AbortSignal | undefined,
): ModelChatInput => (signal === undefined ? input : { ...input, signal });

const toError = (caughtError: unknown): Error =>
	caughtError instanceof Error ? caughtError : new Error(String(caughtError));

const startTurnMetrics = (
	agentMetrics: AgentMetricsPort | undefined,
	sessionId: SessionId,
): AgentTurnMetricsPort | undefined => {
	try {
		return agentMetrics?.startTurn(sessionId);
	} catch {
		return undefined;
	}
};

const completeTurnMetrics = (turnMetrics: AgentTurnMetricsPort | undefined): void => {
	try {
		turnMetrics?.complete();
	} catch {
		// Diagnostics must not change turn behavior.
	}
};

const recordModelRequestMetric = (
	turnMetrics: AgentTurnMetricsPort | undefined,
	requestCharacters: number,
): void => {
	try {
		turnMetrics?.recordModelRequest(requestCharacters);
	} catch {
		// Diagnostics must not change turn behavior.
	}
};

const measureModelRequestCharacters = (input: ModelChatInput): number => {
	try {
		return JSON.stringify({
			messages: input.messages,
			...(input.tools === undefined ? {} : { tools: input.tools }),
		}).length;
	} catch {
		return 0;
	}
};
