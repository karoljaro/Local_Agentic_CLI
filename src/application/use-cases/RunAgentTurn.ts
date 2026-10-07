import { isAbortError, throwIfAborted } from '../services/cancellation';
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
import type { AgentMetricsPort, AgentTurnMetricsPort } from '../ports/AgentMetricsPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type { ModelChatInput, ModelPort } from '../ports/ModelPort';
import type { MonotonicClockPort } from '../ports/MonotonicClockPort';
import type { SessionServicePort } from '../ports/SessionServicePort';
import type { ToolExecutorPort } from '../ports/ToolExecutorPort';
import { ContextBudgetExceededError, type ContextBuilder } from '../services/ContextBuilder';
import {
	ToolRunner,
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
		this.dependencies.contextBuilder.assertPromptFits(prompt, promptEvent.messageId);

		await this.dependencies.sessionStore.activateSession(sessionId);
		throwIfAborted(signal);
		await this.dependencies.sessionStore.appendSessionEvent(promptEvent);
		throwIfAborted(signal);

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

		for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
			throwIfAborted(signal);
			const messages = await this.buildModelMessages(sessionId, signal);
			throwIfAborted(signal);
			const result = yield* this.readModelResponse(
				sessionId,
				withSignal({ messages, ...(tools.length === 0 ? {} : { tools }) }, signal),
				turnMetrics,
			);

			throwIfAborted(signal);

			if (toolRunner === undefined || tools.length === 0 || result.toolCalls.length === 0) {
				await this.appendAssistantCompleted(sessionId, toContent(result));
				return;
			}

			let preparedToolCalls: PreparedModelToolCall[];

			try {
				preparedToolCalls = toolRunner.prepareToolCalls(result.toolCalls);
			} catch (caughtError) {
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
				return;
			}
		}

		const error = new Error('Tool iteration limit reached.');

		await this.tryAppendAgentError(sessionId, error, 'TOOL_ITERATION_LIMIT_REACHED');
		throw error;
	}

	private async buildModelMessages(
		sessionId: SessionId,
		signal: AbortSignal | undefined,
	): Promise<ModelMessage[]> {
		try {
			const state = await this.dependencies.sessionStore.readSessionState(sessionId);
			throwIfAborted(signal);
			return this.dependencies.contextBuilder.build(state).messages;
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
				toolCalls.push(...(chunk.toolCalls ?? []));

				if (chunk.contentDelta.length > 0) {
					contentDeltas.push(chunk.contentDelta);

					yield { contentDelta: chunk.contentDelta };
				}
			}
		} catch (caughtError) {
			const error = toError(caughtError);

			if (!isAbortError(caughtError))
				await this.tryAppendAgentError(sessionId, error, 'MODEL_STREAM_FAILED');
			throw error;
		}

		throwIfAborted(input.signal);
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

		await this.dependencies.sessionStore.appendSessionEvent(event);
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
