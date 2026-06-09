import { createInitialAgentState, type AgentState } from '@/domain/AgentState';

import type { SessionId } from '@/domain/Ids';
import type { AgentEvent } from '@/domain/AgentEvent';

export const reduceAgentState = (
	sessionId: SessionId,
	events: AgentEvent[]
): AgentState => {
	const state = createInitialAgentState(sessionId);

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

			case 'tool.call.completed':
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
