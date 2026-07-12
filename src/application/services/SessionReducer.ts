import type {
	AgentEvent,
	AssistantToolCallsCompleted,
	ToolCallCompleted,
	ToolCallFailed,
} from '@/domain/AgentEvent';
import { createInitialAgentState, type AgentState } from '@/domain/AgentState';
import type { SessionId, ToolCallId } from '@/domain/Ids';
import type { ModelMessage } from '@/domain/ModelMessage';
import type { ModelToolCall } from '@/domain/Tool';

type TerminalToolCallEvent = ToolCallCompleted | ToolCallFailed;

type PendingToolCallBatch = {
	event: AssistantToolCallsCompleted;
	terminalEvents: Map<ToolCallId, TerminalToolCallEvent>;
};

export class AgentStateReducer {
	private readonly state: AgentState;
	private readonly pendingLegacyToolCalls = new Map<ToolCallId, ModelToolCall>();
	private readonly pendingBatchesByToolCallId = new Map<ToolCallId, PendingToolCallBatch>();

	constructor(private readonly sessionId: SessionId) {
		this.state = createInitialAgentState(sessionId);
	}

	apply(event: AgentEvent): void {
		if (event.sessionId !== this.sessionId) {
			throw new Error(`Cannot apply event from another session: ${event.sessionId}.`);
		}

		switch (event.type) {
			case 'prompt.submitted':
				this.state.messages.push({
					id: event.messageId,
					role: 'user',
					content: event.prompt,
				});
				break;

			case 'assistant.message.completed':
				this.state.messages.push({
					id: event.messageId,
					role: 'assistant',
					content: event.content,
				});
				break;

			case 'assistant.tool_calls.completed':
				this.registerToolCallBatch(event);
				break;

			case 'tool.call.requested':
				if (!this.pendingBatchesByToolCallId.has(event.toolCallId)) {
					this.pendingLegacyToolCalls.set(event.toolCallId, {
						id: event.toolCallId,
						name: event.toolName,
						arguments: event.toolInput,
					});
				}
				break;

			case 'tool.call.completed':
				this.state.toolResults.push({
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					output: event.output,
				});
				this.applyTerminalToolCall(event);
				break;

			case 'tool.call.failed':
				this.state.errors.push({
					message: event.error.message,
					...(event.error.code === undefined ? {} : { code: event.error.code }),
					recoverable: true,
					...(event.error.details === undefined ? {} : { details: event.error.details }),
				});
				this.applyTerminalToolCall(event);
				break;

			case 'agent.error':
				this.state.errors.push(event.error);
				break;

			case 'tool.call.started':
				break;
		}
	}

	snapshot(): AgentState {
		return {
			sessionId: this.state.sessionId,
			messages: [...this.state.messages],
			toolResults: [...this.state.toolResults],
			errors: [...this.state.errors],
		};
	}

	private registerToolCallBatch(event: AssistantToolCallsCompleted): void {
		const batch: PendingToolCallBatch = {
			event,
			terminalEvents: new Map(),
		};

		for (const toolCall of event.toolCalls) {
			this.pendingBatchesByToolCallId.set(toolCall.id, batch);
			this.pendingLegacyToolCalls.delete(toolCall.id);
		}
	}

	private applyTerminalToolCall(event: TerminalToolCallEvent): void {
		const batch = this.pendingBatchesByToolCallId.get(event.toolCallId);

		if (batch === undefined) {
			appendLegacyToolCallMessages(
				this.state,
				this.pendingLegacyToolCalls.get(event.toolCallId),
				event,
			);
			this.pendingLegacyToolCalls.delete(event.toolCallId);
			return;
		}

		batch.terminalEvents.set(event.toolCallId, event);

		if (batch.terminalEvents.size !== batch.event.toolCalls.length) {
			return;
		}

		this.state.messages.push({
			id: batch.event.messageId,
			role: 'assistant',
			content: batch.event.content,
			toolCalls: batch.event.toolCalls,
		});

		for (const toolCall of batch.event.toolCalls) {
			const terminalEvent = batch.terminalEvents.get(toolCall.id);

			if (terminalEvent !== undefined) {
				this.state.messages.push(toToolMessage(terminalEvent));
			}

			this.pendingBatchesByToolCallId.delete(toolCall.id);
		}
	}
}

export const reduceAgentState = (sessionId: SessionId, events: AgentEvent[]): AgentState => {
	const reducer = new AgentStateReducer(sessionId);

	for (const event of events) {
		reducer.apply(event);
	}

	return reducer.snapshot();
};

const appendLegacyToolCallMessages = (
	state: AgentState,
	toolCall: ModelToolCall | undefined,
	event: TerminalToolCallEvent,
): void => {
	if (toolCall !== undefined) {
		state.messages.push({
			role: 'assistant',
			content: '',
			toolCalls: [toolCall],
		});
	}

	state.messages.push(toToolMessage(event));
};

const toToolMessage = (event: TerminalToolCallEvent): ModelMessage => ({
	role: 'tool',
	toolCallId: event.toolCallId,
	toolName: event.toolName,
	content:
		event.type === 'tool.call.completed'
			? stringifyToolOutput(event.output)
			: JSON.stringify({ error: { message: event.error.message } }),
});

const stringifyToolOutput = (output: unknown): string => {
	if (typeof output === 'string') {
		return output;
	}

	return JSON.stringify(output) ?? String(output);
};
