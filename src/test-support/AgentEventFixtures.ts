import type {
	AgentErrorOccurred,
	AssistantMessageCompleted,
	AssistantToolCallsCompleted,
	PromptSubmitted,
	ToolCallCompleted,
	ToolCallFailed,
	ToolCallRequested,
	ToolCallStarted,
} from '@/domain/AgentEvent';
import { asEventId, asISODateTime, asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';

const testEventTimestamp = asISODateTime('2026-06-09T12:00:00.000Z');

type EventOverrides<TEvent extends { type: string }> = Partial<Omit<TEvent, 'type'>>;

export const promptSubmittedEvent = (
	overrides: EventOverrides<PromptSubmitted> = {},
): PromptSubmitted => ({
	id: asEventId('event-prompt'),
	sessionId: asSessionId('session-1'),
	type: 'prompt.submitted',
	timestamp: testEventTimestamp,
	messageId: asMessageId('message-user-1'),
	prompt: 'Hello',
	...overrides,
});

export const assistantMessageCompletedEvent = (
	overrides: EventOverrides<AssistantMessageCompleted> = {},
): AssistantMessageCompleted => ({
	id: asEventId('event-assistant-completed'),
	sessionId: asSessionId('session-1'),
	type: 'assistant.message.completed',
	timestamp: testEventTimestamp,
	messageId: asMessageId('message-assistant-1'),
	content: 'Hello',
	...overrides,
});

export const assistantToolCallsCompletedEvent = (
	overrides: EventOverrides<AssistantToolCallsCompleted> = {},
): AssistantToolCallsCompleted => ({
	id: asEventId('event-assistant-tool-calls-completed'),
	sessionId: asSessionId('session-1'),
	type: 'assistant.tool_calls.completed',
	timestamp: testEventTimestamp,
	messageId: asMessageId('message-assistant-tool-calls-1'),
	content: '',
	toolCalls: [
		{
			id: asToolCallId('tool-call-1'),
			name: 'read_file',
			arguments: { path: 'README.md' },
		},
	],
	...overrides,
});

export const toolCallRequestedEvent = (
	overrides: EventOverrides<ToolCallRequested> = {},
): ToolCallRequested => ({
	id: asEventId('event-tool-requested'),
	sessionId: asSessionId('session-1'),
	type: 'tool.call.requested',
	timestamp: testEventTimestamp,
	toolCallId: asToolCallId('tool-call-1'),
	toolName: 'read_file',
	toolInput: { path: 'README.md' },
	approvalRequired: false,
	...overrides,
});

export const toolCallStartedEvent = (
	overrides: EventOverrides<ToolCallStarted> = {},
): ToolCallStarted => ({
	id: asEventId('event-tool-started'),
	sessionId: asSessionId('session-1'),
	type: 'tool.call.started',
	timestamp: testEventTimestamp,
	toolCallId: asToolCallId('tool-call-1'),
	toolName: 'read_file',
	...overrides,
});

export const toolCallCompletedEvent = (
	overrides: EventOverrides<ToolCallCompleted> = {},
): ToolCallCompleted => ({
	id: asEventId('event-tool-completed'),
	sessionId: asSessionId('session-1'),
	type: 'tool.call.completed',
	timestamp: testEventTimestamp,
	toolCallId: asToolCallId('tool-call-1'),
	toolName: 'read_file',
	output: { ok: true },
	...overrides,
});

export const toolCallFailedEvent = (
	overrides: EventOverrides<ToolCallFailed> = {},
): ToolCallFailed => ({
	id: asEventId('event-tool-failed'),
	sessionId: asSessionId('session-1'),
	type: 'tool.call.failed',
	timestamp: testEventTimestamp,
	toolCallId: asToolCallId('tool-call-1'),
	toolName: 'read_file',
	error: {
		message: 'tool failed',
	},
	...overrides,
});

export const agentErrorOccurredEvent = (
	overrides: EventOverrides<AgentErrorOccurred> = {},
): AgentErrorOccurred => ({
	id: asEventId('event-agent-error'),
	sessionId: asSessionId('session-1'),
	type: 'agent.error',
	timestamp: testEventTimestamp,
	error: {
		message: 'agent failed',
		recoverable: true,
	},
	...overrides,
});
