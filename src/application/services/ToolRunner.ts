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
import type { SessionStorePort } from '../ports/SessionStorePort';
import type { ToolExecutorPort } from '../ports/ToolExecutorPort';

export type ToolApprovalRequest = {
	sessionId: SessionId;
	toolCallId: ToolCallId;
	toolName: string;
	toolInput: unknown;
};

export type ToolApprovalHandler = (request: ToolApprovalRequest) => Promise<boolean>;

export type PersistedModelToolCall = ModelToolCall & { id: ToolCallId };

export type ToolExecutionBatchResult = {
	toolMessages: ModelMessage[];
	terminalMessage?: string;
};

export type ToolRunnerDependencies = {
	sessionStore: SessionStorePort;
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
	): Promise<ToolExecutionBatchResult> {
		const toolMessages: ModelMessage[] = [];

		for (const [toolCallIndex, toolCall] of toolCalls.entries()) {
			const { id: toolCallId, name: toolName } = toolCall;
			const requestedEvent = await this.appendToolCallRequested(sessionId, toolCall);

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

			await this.appendToolCallStarted(sessionId, toolCallId, toolName);
			const executionStartedAt = this.readMonotonicClock();
			let executionMetricRecorded = false;

			try {
				const { output, reused } = await this.executeToolCall(toolCall);
				this.recordToolExecution({
					toolName,
					durationMs: this.elapsedMilliseconds(executionStartedAt),
					outputCharacters: stringifyToolOutput(output).length,
					failed: false,
					reused,
				});
				executionMetricRecorded = true;
				await this.appendToolCallCompleted(sessionId, toolCallId, toolName, output);
				toolMessages.push({
					role: 'tool',
					toolCallId,
					toolName,
					content: stringifyToolOutput(output),
				});
			} catch (caughtError) {
				const error = toError(caughtError);
				const errorOutput = { error: { message: error.message } };

				if (!executionMetricRecorded) {
					this.recordToolExecution({
						toolName,
						durationMs: this.elapsedMilliseconds(executionStartedAt),
						outputCharacters: stringifyToolOutput(errorOutput).length,
						failed: true,
						reused: false,
					});
				}

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
			}
		}

		return { toolMessages };
	}

	private async executeToolCall(
		toolCall: PersistedModelToolCall,
	): Promise<{ output: unknown; reused: boolean }> {
		const toolDefinition = getToolDefinition(toolCall.name, this.tools);
		const cacheKey =
			toolDefinition.deduplicate === true
				? JSON.stringify([toolCall.name, toolCall.arguments])
				: undefined;
		const previousResult =
			cacheKey === undefined ? undefined : this.toolResultReferences.get(cacheKey);
		let output: unknown;
		const reused = previousResult !== undefined;

		if (previousResult === undefined) {
			const result = await this.dependencies.toolExecutor.execute({
				toolName: toolCall.name,
				toolInput: toolCall.arguments,
			});
			output = result.output;

			if (cacheKey !== undefined) {
				this.toolResultReferences.set(cacheKey, { sourceToolCallId: toolCall.id });
			}
		} else {
			output = createCachedToolOutput(previousResult.sourceToolCallId);
		}

		if (toolDefinition.invalidatesWorkspaceCache === true) {
			this.toolResultReferences.clear();
		}

		return { output, reused };
	}

	private recordToolExecution(metric: Parameters<AgentTurnMetricsPort['recordToolExecution']>[0]) {
		try {
			this.dependencies.turnMetrics?.recordToolExecution(metric);
		} catch {
			// Diagnostics must not change tool behavior.
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
