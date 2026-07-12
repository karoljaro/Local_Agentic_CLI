import type { SessionId } from './Ids';
import type { ModelMessage } from './ModelMessage';

export type AgentState = {
	sessionId: SessionId;
	messages: ModelMessage[];
};

export const createInitialAgentState = (sessionId: SessionId): AgentState => {
	return {
		sessionId,
		messages: [],
	};
};
