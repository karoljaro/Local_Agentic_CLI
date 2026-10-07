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

for (const ending of ['turn.finished', 'turn.failed'] as const) {
	test(`${ending} clears transient active tools without adding tool terminal history`, () => {
		const sessionId = asSessionId('session-1');
		const running = reduceSessionEvents(sessionId, [
			toolCallRequestedEvent(),
			toolCallStartedEvent(),
		]);
		expect(running.activeTools).toHaveLength(1);
		const finished = chatReducer(
			running,
			ending === 'turn.finished'
				? { type: ending }
				: { type: ending, entries: [{ id: 'error', kind: 'error', content: 'storage failure' }] },
		);
		expect(finished.activeTools).toEqual([]);
		expect(finished.turnStatus).toBe('idle');
		expect(finished.history.filter((entry) => entry.kind === 'tool')).toEqual([]);
	});
}

test('loading an interrupted persisted prefix does not revive transient active tools', () => {
	const state = chatReducer(createChatState(asSessionId('session-1')), {
		type: 'session.loaded',
		events: [toolCallRequestedEvent(), toolCallStartedEvent()],
	});
	expect(state.turnStatus).toBe('idle');
	expect(state.activeTools).toEqual([]);
	expect(state.history).toEqual([]);
});
