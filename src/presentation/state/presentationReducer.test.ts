import { describe, expect, test } from 'bun:test';

import { asEventId, asSessionId, asToolCallId } from '@/domain/Ids';
import {
	agentErrorOccurredEvent,
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
	toolCallRequestedEvent,
	toolCallStartedEvent,
	toolCallFailedEvent,
} from '@/test-support/AgentEventFixtures';
import { chatReducer, createChatState, reduceSessionEvents } from './presentationReducer';

describe('presentationReducer', () => {
	test('restores chat, intermediate assistant text, and concise tool results in event order', () => {
		const sessionId = asSessionId('session-1');
		const state = reduceSessionEvents(sessionId, [
			promptSubmittedEvent({ sessionId }),
			assistantToolCallsCompletedEvent({ sessionId, content: 'I will inspect it.' }),
			toolCallRequestedEvent({ sessionId, toolInput: { path: 'README.md' } }),
			toolCallStartedEvent({ sessionId }),
			toolCallCompletedEvent({ sessionId }),
			assistantMessageCompletedEvent({ sessionId, content: 'Done.' }),
		]);

		expect(state.history.map((entry) => [entry.kind, entry.content])).toEqual([
			['user', 'Hello'],
			['assistant', 'I will inspect it.'],
			['tool', 'Read file · README.md'],
			['assistant', 'Done.'],
		]);
		expect(state.activeTools).toEqual([]);
	});

	test('keeps a tool dynamic until it reaches a terminal event', () => {
		const sessionId = asSessionId('session-1');
		const requested = chatReducer(createChatState(sessionId), {
			type: 'engine.event',
			event: toolCallRequestedEvent({ sessionId, approvalRequired: true }),
		});

		expect(requested.activeTools[0]?.status).toBe('approval');
		expect(requested.history).toEqual([]);

		const running = chatReducer(requested, {
			type: 'engine.event',
			event: toolCallStartedEvent({ sessionId }),
		});
		expect(running.activeTools[0]?.status).toBe('running');
	});

	test('deduplicates durable events and ignores another session', () => {
		const sessionId = asSessionId('session-1');
		const event = agentErrorOccurredEvent({ id: asEventId('same'), sessionId });
		const once = chatReducer(createChatState(sessionId), { type: 'engine.event', event });
		const twice = chatReducer(once, { type: 'engine.event', event });
		const other = chatReducer(twice, {
			type: 'engine.event',
			event: promptSubmittedEvent({ sessionId: asSessionId('other') }),
		});

		expect(other.history).toHaveLength(1);
	});

	test('tracks multiple tool calls independently through success and failure', () => {
		const sessionId = asSessionId('session-1');
		const firstId = toolCallRequestedEvent({ sessionId }).toolCallId;
		const secondId = asToolCallId('tool-call-2');
		const state = reduceSessionEvents(sessionId, [
			toolCallRequestedEvent({ sessionId, toolCallId: firstId }),
			toolCallRequestedEvent({ sessionId, toolCallId: secondId, toolName: 'edit_file' }),
			toolCallCompletedEvent({ sessionId, toolCallId: firstId }),
			toolCallFailedEvent({
				sessionId,
				toolCallId: secondId,
				toolName: 'edit_file',
				error: { message: 'denied', code: 'TOOL_APPROVAL_DENIED' },
			}),
		]);

		expect(state.activeTools).toEqual([]);
		expect(state.history.map((entry) => entry.status)).toEqual(['success', 'failure']);
	});
});
