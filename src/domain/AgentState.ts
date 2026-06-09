import type { SessionId, ToolCallId } from './Ids';
import type { ModelMessage } from './ModelMessage';

export type AgentState = {
	sessionId: SessionId;
	messages: ModelMessage[];
	toolResults: AgentToolResultState[];
	errors: AgentErrorState[];
};

export type AgentToolResultState = {
	toolCallId: ToolCallId;
	toolName: string;
	output: unknown;
};

export type AgentErrorState = {
	message: string;
	code?: string;
	recoverable: boolean;
	details?: unknown;
};

export const createInitialAgentState = (sessionId: SessionId): AgentState => {
	return {
		sessionId,
		messages: [],
		toolResults: [],
		errors: [],
	};
};
