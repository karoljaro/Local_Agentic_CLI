import { describe, expect, test } from 'bun:test';

import {
	asEventId,
	asMessageId,
	asSessionId,
	asToolCallId,
} from '@/domain/Ids';
import {
	agentErrorOccurredEvent,
	assistantMessageCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
	toolCallFailedEvent,
	toolCallRequestedEvent,
	toolCallStartedEvent,
} from '@/test-support/AgentEventFixtures';

import { reduceAgentState } from './SessionReducer';

describe('reduceAgentState', () => {
	test('builds session state from durable events', () => {
		const sessionId = asSessionId('session-1');
		const toolCallId = asToolCallId('tool-call-1');

		const events = [
			promptSubmittedEvent({
				id: asEventId('event-1'),
				sessionId,
				messageId: asMessageId('message-user-1'),
				prompt: 'Read README',
			}),
			assistantMessageCompletedEvent({
				id: asEventId('event-2'),
				sessionId,
				messageId: asMessageId('message-assistant-1'),
				content: 'I will check it.',
			}),
			toolCallRequestedEvent({
				id: asEventId('event-3'),
				sessionId,
				toolCallId,
				toolName: 'read_file',
				toolInput: { path: 'README.md' },
			}),
			toolCallCompletedEvent({
				id: asEventId('event-4'),
				sessionId,
				toolCallId,
				toolName: 'read_file',
				output: { path: 'README.md', content: 'hello' },
			}),
			toolCallRequestedEvent({
				id: asEventId('event-5'),
				sessionId,
				toolCallId: asToolCallId('tool-call-2'),
				toolName: 'search_code',
				toolInput: { query: 'UserRepository' },
			}),
			toolCallFailedEvent({
				id: asEventId('event-6'),
				sessionId,
				toolCallId: asToolCallId('tool-call-2'),
				toolName: 'search_code',
				error: {
					message: 'rg failed',
					code: 'TOOL_FAILED',
					details: { exitCode: 2 },
				},
			}),
			agentErrorOccurredEvent({
				id: asEventId('event-7'),
				sessionId,
				error: {
					message: 'model unavailable',
					code: 'MODEL_UNAVAILABLE',
					recoverable: true,
					details: { provider: 'ollama' },
				},
			}),
		];

		const state = reduceAgentState(sessionId, events);

		expect(state.sessionId).toBe(sessionId);
		expect(state.messages).toEqual([
			{
				id: asMessageId('message-user-1'),
				role: 'user',
				content: 'Read README',
			},
			{
				id: asMessageId('message-assistant-1'),
				role: 'assistant',
				content: 'I will check it.',
			},
			{
				role: 'assistant',
				content: '',
				toolCalls: [
					{
						id: toolCallId,
						name: 'read_file',
						arguments: { path: 'README.md' },
					},
				],
			},
			{
				role: 'tool',
				toolCallId,
				toolName: 'read_file',
				content: JSON.stringify({ path: 'README.md', content: 'hello' }),
			},
			{
				role: 'assistant',
				content: '',
				toolCalls: [
					{
						id: asToolCallId('tool-call-2'),
						name: 'search_code',
						arguments: { query: 'UserRepository' },
					},
				],
			},
			{
				role: 'tool',
				toolCallId: asToolCallId('tool-call-2'),
				toolName: 'search_code',
				content: JSON.stringify({
					error: {
						message: 'rg failed',
					},
				}),
			},
		]);
		expect(state.toolResults).toEqual([
			{
				toolCallId,
				toolName: 'read_file',
				output: { path: 'README.md', content: 'hello' },
			},
		]);
		expect(state.errors).toEqual([
			{
				message: 'rg failed',
				code: 'TOOL_FAILED',
				recoverable: true,
				details: { exitCode: 2 },
			},
			{
				message: 'model unavailable',
				code: 'MODEL_UNAVAILABLE',
				recoverable: true,
				details: { provider: 'ollama' },
			},
		]);
	});

	test('ignores an unfinished tool call when rebuilding messages', () => {
		const sessionId = asSessionId('session-1');
		const toolCallId = asToolCallId('tool-call-1');

		const state = reduceAgentState(sessionId, [
			toolCallRequestedEvent({
				id: asEventId('event-1'),
				sessionId,
				toolCallId,
				toolName: 'read_file',
				toolInput: { path: 'README.md' },
			}),
			toolCallStartedEvent({
				id: asEventId('event-2'),
				sessionId,
				toolCallId,
				toolName: 'read_file',
			}),
		]);

		expect(state.messages).toEqual([]);
	});
});
