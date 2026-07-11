import { createInitialAgentState, type AgentState } from '@/domain/AgentState';

import type { SessionId, ToolCallId } from '@/domain/Ids';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { ModelToolCall } from '@/domain/Tool';

export const reduceAgentState = (sessionId: SessionId, events: AgentEvent[]): AgentState => {
	const state = createInitialAgentState(sessionId);
	const pendingToolCalls = new Map<ToolCallId, ModelToolCall>();
	const terminalToolCallIds = collectTerminalToolCallIds(events);
	const persistedBatchToolCallIds = new Set<ToolCallId>();
	const completeBatchToolCallIds = new Set<ToolCallId>();

	for (const event of events) {
		if (event.type !== 'assistant.tool_calls.completed') {
			continue;
		}

		const isComplete = event.toolCalls.every((toolCall) => terminalToolCallIds.has(toolCall.id));

		for (const toolCall of event.toolCalls) {
			persistedBatchToolCallIds.add(toolCall.id);

			if (isComplete) {
				completeBatchToolCallIds.add(toolCall.id);
			}
		}
	}

	for (const event of events) {
		switch (event.type) {
			case 'prompt.submitted':
				state.messages.push({
					id: event.messageId,
					role: 'user',
					content: event.prompt,
				});
				break;

			case 'assistant.message.completed':
				state.messages.push({
					id: event.messageId,
					role: 'assistant',
					content: event.content,
				});
				break;

			case 'assistant.tool_calls.completed':
				if (event.toolCalls.every((toolCall) => completeBatchToolCallIds.has(toolCall.id))) {
					state.messages.push({
						id: event.messageId,
						role: 'assistant',
						content: event.content,
						toolCalls: event.toolCalls,
					});
				}
				break;

			case 'tool.call.requested':
				if (persistedBatchToolCallIds.has(event.toolCallId)) {
					break;
				}

				pendingToolCalls.set(event.toolCallId, {
					id: event.toolCallId,
					name: event.toolName,
					arguments: event.toolInput,
				});
				break;

			case 'tool.call.completed':
				if (!persistedBatchToolCallIds.has(event.toolCallId)) {
					appendToolCallMessage(state, pendingToolCalls.get(event.toolCallId));
				}
				pendingToolCalls.delete(event.toolCallId);

				state.toolResults.push({
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					output: event.output,
				});

				if (
					!persistedBatchToolCallIds.has(event.toolCallId) ||
					completeBatchToolCallIds.has(event.toolCallId)
				) {
					state.messages.push({
						role: 'tool',
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						content: stringifyToolOutput(event.output),
					});
				}
				break;

			case 'tool.call.failed':
				if (!persistedBatchToolCallIds.has(event.toolCallId)) {
					appendToolCallMessage(state, pendingToolCalls.get(event.toolCallId));
				}
				pendingToolCalls.delete(event.toolCallId);

				if (
					!persistedBatchToolCallIds.has(event.toolCallId) ||
					completeBatchToolCallIds.has(event.toolCallId)
				) {
					state.messages.push({
						role: 'tool',
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						content: JSON.stringify({
							error: {
								message: event.error.message,
							},
						}),
					});
				}

				state.errors.push({
					message: event.error.message,
					...(event.error.code === undefined ? {} : { code: event.error.code }),
					recoverable: true,
					...(event.error.details === undefined ? {} : { details: event.error.details }),
				});
				break;

			case 'agent.error':
				state.errors.push(event.error);
				break;
		}
	}

	return state;
};

const collectTerminalToolCallIds = (events: AgentEvent[]): Set<ToolCallId> => {
	const terminalToolCallIds = new Set<ToolCallId>();

	for (const event of events) {
		if (event.type === 'tool.call.completed' || event.type === 'tool.call.failed') {
			terminalToolCallIds.add(event.toolCallId);
		}
	}

	return terminalToolCallIds;
};

const appendToolCallMessage = (state: AgentState, toolCall: ModelToolCall | undefined): void => {
	if (toolCall === undefined) {
		return;
	}

	state.messages.push({
		role: 'assistant',
		content: '',
		toolCalls: [toolCall],
	});
};

const stringifyToolOutput = (output: unknown): string => {
	if (typeof output === 'string') {
		return output;
	}

	return JSON.stringify(output) ?? String(output);
};
