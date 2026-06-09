import type { SessionId } from './Ids';
import type { ModelMessage } from './ModelMessage';

export type AgentState = {
	sessionId: SessionId;
	messages: ModelMessage[];
	toolResults: AgentToolResultState[];
	errors: AgentErrorState[];
};

export type AgentToolResultState = {
	toolCallId: string;
	toolName: string;
	output: unknown;
};

export type AgentErrorState = {
	message: string;
	code?: string;
	recoverable: boolean;
};