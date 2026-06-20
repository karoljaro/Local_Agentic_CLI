import { createInitialAgentState, type AgentState } from '@/domain/AgentState';

import type { SessionId, ToolCallId } from '@/domain/Ids';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { ModelToolCall } from '@/domain/Tool';

export const reduceAgentState = (
	sessionId: SessionId,
	events: AgentEvent[],
): AgentState => {
	const state = createInitialAgentState(sessionId);
	const pendingToolCalls = new Map<ToolCallId, ModelToolCall>();

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

			case 'tool.call.requested':
				pendingToolCalls.set(event.toolCallId, {
					id: event.toolCallId,
					name: event.toolName,
					arguments: event.toolInput,
				});
				break;

			case 'tool.call.completed':
				appendToolCallMessage(state, pendingToolCalls.get(event.toolCallId));
				pendingToolCalls.delete(event.toolCallId);

				state.toolResults.push({
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					output: event.output,
				});

				state.messages.push({
					role: 'tool',
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					content: JSON.stringify(event.output),
				});
				break;

			case 'tool.call.failed':
				appendToolCallMessage(state, pendingToolCalls.get(event.toolCallId));
				pendingToolCalls.delete(event.toolCallId);

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

				state.errors.push({
					message: event.error.message,
					...(event.error.code === undefined ? {} : { code: event.error.code }),
					recoverable: true,
					...(event.error.details === undefined
						? {}
						: { details: event.error.details }),
				});
				break;

			case 'agent.error':
				state.errors.push(event.error);
				break;
		}
	}

	return state;
};

const appendToolCallMessage = (
	state: AgentState,
	toolCall: ModelToolCall | undefined,
): void => {
	if (toolCall === undefined) {
		return;
	}

	state.messages.push({
		role: 'assistant',
		content: '',
		toolCalls: [toolCall],
	});
};
