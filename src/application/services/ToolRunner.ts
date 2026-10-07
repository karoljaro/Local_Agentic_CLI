import type {
	ToolCallCompleted,
	ToolCallFailed,
	ToolCallRequested,
	ToolCallStarted,
} from '@/domain/AgentEvent';
import type { SessionId, ToolCallId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelToolCall, ToolDefinition } from '@/domain/Tool';
import type { AgentTurnMetricsPort } from '../ports/AgentMetricsPort';
import type { ClockPort } from '../ports/ClockPort';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort';
import type { MonotonicClockPort } from '../ports/MonotonicClockPort';
import type { SessionServicePort } from '../ports/SessionServicePort';
import type {
	ToolExecutionOptions,
	ToolExecutionResult,
	ToolExecutorPort,
} from '../ports/ToolExecutorPort';

import { abortError, isAbortError, throwIfAborted } from './cancellation';

export type ToolApprovalRequest = {
	sessionId: SessionId;
	toolCallId: ToolCallId;
	toolName: string;
	toolInput: unknown;
};

export type ToolApprovalHandler = (
	request: ToolApprovalRequest,
	options: ToolExecutionOptions,
) => Promise<boolean>;

export type PersistedModelToolCall = ModelToolCall & { id: ToolCallId };

export type ToolExecutionBatchResult = {
	toolMessages: ModelMessage[];
	terminalMessage?: string;
};

export type ToolRunnerDependencies = {
	sessionStore: SessionServicePort;
	clock: ClockPort;
	idGenerator: IdGeneratorPort;
	toolExecutor: ToolExecutorPort;
	approveToolCall?: ToolApprovalHandler;
	turnMetrics?: AgentTurnMetricsPort;
	monotonicClock?: MonotonicClockPort;
};

type ToolResultReference = {
	sourceToolCallId: ToolCallId;
};

export class ToolRunner {
	private readonly tools: ToolDefinition[];
	private readonly toolResultReferences = new Map<string, ToolResultReference>();

	constructor(private readonly dependencies: ToolRunnerDependencies) {
		this.tools = dependencies.toolExecutor.listTools();
	}

	listTools(): ToolDefinition[] {
		return this.tools;
	}

	prepareToolCalls(toolCalls: ModelToolCall[]): PersistedModelToolCall[] {
		const preparedToolCalls = toolCalls.map((toolCall) => {
			const prepared = this.dependencies.toolExecutor.prepare({
				toolName: toolCall.name,
				toolInput: toolCall.arguments,
			});

			return {
				...toolCall,
				name: prepared.toolName,
				arguments: prepared.toolInput,
			};
		});

		return preparedToolCalls.map((toolCall) => ({
			id: this.dependencies.idGenerator.nextToolCallId(),
			name: toolCall.name,
			arguments: toolCall.arguments,
		}));
	}

	async executeToolCalls(
		sessionId: SessionId,
		toolCalls: PersistedModelToolCall[],
		options: ToolExecutionOptions = {},
	): Promise<ToolExecutionBatchResult> {
		const toolMessages: ModelMessage[] = [];

		for (const [toolCallIndex, toolCall] of toolCalls.entries()) {
			throwIfAborted(options.signal);
			const { id: toolCallId, name: toolName } = toolCall;
			const requestedEvent = await this.appendToolCallRequested(sessionId, toolCall);

			throwIfAborted(options.signal);

			if (requestedEvent.approvalRequired) {
				const approved = await this.requestToolApproval(
					{
						sessionId,
						toolCallId,
						toolName,
						toolInput: toolCall.arguments,
					},
					options,
				);
				throwIfAborted(options.signal);

				if (approved === false) {
					const errorMessage = `Tool call was not approved: ${toolName}`;

					await this.appendToolCallFailed({
						sessionId,
						toolCallId,
						toolName,
						message: errorMessage,
						code: 'TOOL_APPROVAL_DENIED',
					});

					for (const cancelledToolCall of toolCalls.slice(toolCallIndex + 1)) {
						throwIfAborted(options.signal);
						await this.appendToolCallRequested(sessionId, cancelledToolCall);
						await this.appendToolCallFailed({
							sessionId,
							toolCallId: cancelledToolCall.id,
							toolName: cancelledToolCall.name,
							message: `Tool call was cancelled after approval denial: ${cancelledToolCall.name}`,
							code: 'TOOL_BATCH_CANCELLED',
						});
					}

					return {
						toolMessages,
						terminalMessage: errorMessage,
					};
				}
			}

			const toolDefinition = getToolDefinition(toolName, this.tools);
			const cacheKey =
				toolDefinition.deduplicate === true
					? JSON.stringify([toolName, toolCall.arguments])
					: undefined;
			const previousResult =
				cacheKey === undefined ? undefined : this.toolResultReferences.get(cacheKey);
			await this.appendToolCallStarted(sessionId, toolCallId, toolName);
			throwIfAborted(options.signal);
			const executionStartedAt = this.readMonotonicClock();
			throwIfAborted(options.signal);
			let result: ToolExecutionResult | undefined;
			let executionFailure: { error: Error } | undefined;

			if (previousResult === undefined) {
				try {
					result = await this.dependencies.toolExecutor.execute(
						{
							toolName,
							toolInput: toolCall.arguments,
						},
						options,
					);
				} catch (caughtError) {
					if (isAbortError(caughtError)) throw caughtError;
					executionFailure = { error: toError(caughtError) };
				}
			}

			if (executionFailure !== undefined) {
				const { error } = executionFailure;
				const errorOutput = { error: { message: error.message } };
				this.recordToolExecution(toolName, executionStartedAt, errorOutput, true, false);
				await this.appendToolCallFailed({
					sessionId,
					toolCallId,
					toolName,
					message: error.message,
					code: 'TOOL_FAILED',
					details: { name: error.name },
				});
				toolMessages.push({
					role: 'tool',
					toolCallId,
					toolName,
					content: stringifyToolOutput(errorOutput),
				});
			} else {
				const output =
					previousResult === undefined
						? result!.output
						: createCachedToolOutput(previousResult.sourceToolCallId);
				if (cacheKey !== undefined && previousResult === undefined) {
					this.toolResultReferences.set(cacheKey, { sourceToolCallId: toolCallId });
				}
				if (toolDefinition.invalidatesWorkspaceCache === true) this.toolResultReferences.clear();
				this.recordToolExecution(
					toolName,
					executionStartedAt,
					output,
					false,
					previousResult !== undefined,
				);
				// Serialization and persistence failures are turn failures, never executor failures.
				const content = stringifyToolOutput(output);
				await this.appendToolCallCompleted(sessionId, toolCallId, toolName, output);
				toolMessages.push({ role: 'tool', toolCallId, toolName, content });
			}
			// In-flight work is awaited and recorded before honoring cancellation.
			throwIfAborted(options.signal);
		}

		return { toolMessages };
	}

	private recordToolExecution(
		toolName: string,
		startedAt: number | undefined,
		output: unknown,
		failed: boolean,
		reused: boolean,
	): void {
		try {
			this.dependencies.turnMetrics?.recordToolExecution({
				toolName,
				durationMs: this.elapsedMilliseconds(startedAt),
				outputCharacters: stringifyToolOutput(output).length,
				failed,
				reused,
			});
		} catch {
			// Diagnostic calculations and recording must not change tool behavior.
		}
	}

	private elapsedMilliseconds(startedAt: number | undefined): number {
		if (startedAt === undefined || this.dependencies.monotonicClock === undefined) {
			return 0;
		}

		const completedAt = this.readMonotonicClock();

		return completedAt === undefined ? 0 : Math.max(0, completedAt - startedAt);
	}

	private readMonotonicClock(): number | undefined {
		try {
			return this.dependencies.monotonicClock?.nowMilliseconds();
		} catch {
			return undefined;
		}
	}

	private async appendToolCallRequested(
		sessionId: SessionId,
		toolCall: PersistedModelToolCall,
	): Promise<ToolCallRequested> {
		const event: ToolCallRequested = {
			id: this.dependencies.idGenerator.nextEventId(),
			sessionId,
			type: 'tool.call.requested',
			timestamp: this.dependencies.clock.now(),
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			toolInput: toolCall.arguments,
			approvalRequired: getToolDefinition(toolCall.name, this.tools).requiresApproval === true,
		};

		await this.dependencies.sessionStore.appendSessionEvent(event);

		return event;
	}

	private async appendToolCallStarted(
		sessionId: SessionId,
		toolCallId: ToolCallId,
		toolName: string,
	): Promise<void> {
		const event: ToolCallStarted = {
			id: this.dependencies.idGenerator.nextEventId(),
			sessionId,
			type: 'tool.call.started',
			timestamp: this.dependencies.clock.now(),
			toolCallId,
			toolName,
		};

		await this.dependencies.sessionStore.appendSessionEvent(event);
	}

	private async appendToolCallCompleted(
		sessionId: SessionId,
		toolCallId: ToolCallId,
		toolName: string,
		output: unknown,
	): Promise<void> {
		const event: ToolCallCompleted = {
			id: this.dependencies.idGenerator.nextEventId(),
			sessionId,
			type: 'tool.call.completed',
			timestamp: this.dependencies.clock.now(),
			toolCallId,
			toolName,
			output,
		};

		await this.dependencies.sessionStore.appendSessionEvent(event);
	}

	private async requestToolApproval(
		request: ToolApprovalRequest,
		options: ToolExecutionOptions,
	): Promise<boolean> {
		const { signal } = options;
		throwIfAborted(signal);
		let onAbort: (() => void) | undefined;
		try {
			const aborted = new Promise<never>((_resolve, reject) => {
				onAbort = () => reject(abortError());
				signal?.addEventListener('abort', onAbort, { once: true });
			});
			// The race attaches rejection handling even when the underlying handler settles late.
			const approval = Promise.resolve().then(() => {
				throwIfAborted(signal);
				return this.dependencies.approveToolCall?.(request, options) ?? false;
			});
			const approved = await Promise.race([approval, aborted]);
			throwIfAborted(signal);
			return approved;
		} catch (error) {
			if (!isAbortError(error)) {
				try {
					await this.dependencies.sessionStore.appendSessionEvent({
						id: this.dependencies.idGenerator.nextEventId(),
						sessionId: request.sessionId,
						type: 'agent.error',
						timestamp: this.dependencies.clock.now(),
						error: {
							message: toError(error).message,
							code: 'TOOL_APPROVAL_FAILED',
							recoverable: true,
							details: { name: toError(error).name },
						},
					});
				} catch {
					// Error reporting is best effort; retain the approval handler's original cause.
				}
			}
			throw error;
		} finally {
			if (onAbort !== undefined) signal?.removeEventListener('abort', onAbort);
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
		const event: ToolCallFailed = {
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

		await this.dependencies.sessionStore.appendSessionEvent(event);
	}
}

const stringifyToolOutput = (output: unknown): string => {
	if (typeof output === 'string') {
		return output;
	}

	return JSON.stringify(output) ?? String(output);
};

const createCachedToolOutput = (sourceToolCallId: ToolCallId): Record<string, unknown> => ({
	cached: true,
	sourceToolCallId,
	message: `Result reused from tool call ${sourceToolCallId}.`,
});

const getToolDefinition = (toolName: string, tools: ToolDefinition[]): ToolDefinition => {
	const tool = tools.find((candidate) => candidate.name === toolName);

	if (tool === undefined) {
		throw new Error(`Unknown tool requested by model: ${toolName}`);
	}

	return tool;
};

const toError = (caughtError: unknown): Error =>
	caughtError instanceof Error ? caughtError : new Error(String(caughtError));
