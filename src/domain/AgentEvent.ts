import type { EventId, ISODateTime, MessageId, SessionId, ToolCallId } from "./Ids";

export type AgentEvent =
	| PromptSubmitted
	| AssistantMessageStarted
	| AssistantMessageDelta
	| AssistantMessageCompleted
	| ToolCallRequested
	| ToolCallStarted
	| ToolCallCompleted
	| ToolCallFailed
	| AgentErrorOccurred;


export type AgentEventBase<TType extends string> = {
	id: EventId;
	sessionId: SessionId;
	type: TType;
	timestamp: ISODateTime;
};

export type PromptSubmitted = AgentEventBase<'prompt.submitted'> & {
	messageId: MessageId;
	prompt: string;
	modelName?: string;
};

export type AssistantMessageStarted =
	AgentEventBase<'assistant.message.started'> & {
		messageId: MessageId;
	};

export type AssistantMessageDelta =
	AgentEventBase<'assistant.message.delta'> & {
		messageId: MessageId;
		delta: string;
	};

export type AssistantMessageCompleted =
	AgentEventBase<'assistant.message.completed'> & {
		messageId: MessageId;
		content: string;
	};

export type ToolCallRequested = AgentEventBase<'tool.call.requested'> & {
	toolCallId: ToolCallId;
	toolName: string;
	toolInput: unknown;
	approvalRequired: boolean;
};

export type ToolCallStarted = AgentEventBase<'tool.call.started'> & {
	toolCallId: ToolCallId;
	toolName: string;
};

export type ToolCallCompleted = AgentEventBase<'tool.call.completed'> & {
	toolCallId: ToolCallId;
	toolName: string;
	output: unknown;
	durationMs?: number;
};

export type ToolCallFailed = AgentEventBase<'tool.call.failed'> & {
	toolCallId: ToolCallId;
	toolName: string;
	error: {
		message: string;
		code?: string;
		details?: unknown;
	};
};

export type AgentErrorOccurred = AgentEventBase<'agent.error'> & {
	error: {
		message: string;
		code?: string;
		recoverable: boolean;
		details?: unknown;
	};
};
