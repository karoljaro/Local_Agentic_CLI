import { describe, expect, test } from 'bun:test';

import type { AgentEvent } from '@/domain/AgentEvent';
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
	asToolCallId,
} from '@/domain/Ids';

import { reduceAgentState } from './SessionReducer';

describe('reduceAgentState', () => {
	test('builds session state from durable events', () => {
		const sessionId = asSessionId('session-1');
		const timestamp = asISODateTime('2026-06-09T12:00:00.000Z');
		const toolCallId = asToolCallId('tool-call-1');

		const events: AgentEvent[] = [
			{
				id: asEventId('event-1'),
				sessionId,
				type: 'prompt.submitted',
				timestamp,
				messageId: asMessageId('message-user-1'),
				prompt: 'Read README',
			},
			{
				id: asEventId('event-2'),
				sessionId,
				type: 'assistant.message.completed',
				timestamp,
				messageId: asMessageId('message-assistant-1'),
				content: 'I will check it.',
			},
			{
				id: asEventId('event-3'),
				sessionId,
				type: 'tool.call.requested',
				timestamp,
				toolCallId,
				toolName: 'read_file',
				toolInput: { path: 'README.md' },
				approvalRequired: false,
			},
			{
				id: asEventId('event-4'),
				sessionId,
				type: 'tool.call.completed',
				timestamp,
				toolCallId,
				toolName: 'read_file',
				output: { path: 'README.md', content: 'hello' },
			},
			{
				id: asEventId('event-5'),
				sessionId,
				type: 'tool.call.requested',
				timestamp,
				toolCallId: asToolCallId('tool-call-2'),
				toolName: 'search_code',
				toolInput: { query: 'UserRepository' },
				approvalRequired: false,
			},
			{
				id: asEventId('event-6'),
				sessionId,
				type: 'tool.call.failed',
				timestamp,
				toolCallId: asToolCallId('tool-call-2'),
				toolName: 'search_code',
				error: {
					message: 'rg failed',
					code: 'TOOL_FAILED',
					details: { exitCode: 2 },
				},
			},
			{
				id: asEventId('event-7'),
				sessionId,
				type: 'agent.error',
				timestamp,
				error: {
					message: 'model unavailable',
					code: 'MODEL_UNAVAILABLE',
					recoverable: true,
					details: { provider: 'ollama' },
				},
			},
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
			{
				id: asEventId('event-1'),
				sessionId,
				type: 'tool.call.requested',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId,
				toolName: 'read_file',
				toolInput: { path: 'README.md' },
				approvalRequired: false,
			},
			{
				id: asEventId('event-2'),
				sessionId,
				type: 'tool.call.started',
				timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
				toolCallId,
				toolName: 'read_file',
			},
		]);

		expect(state.messages).toEqual([]);
	});
});
