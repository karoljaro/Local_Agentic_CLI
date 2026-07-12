import { describe, expect, test } from 'bun:test';

import { asEventId, asISODateTime, asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';
import {
	agentErrorOccurredEvent,
	assistantMessageCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
} from '@/test-support/AgentEventFixtures';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { ListSessionEvents } from './ListSessionEvents';

describe('ListSessionEvents', () => {
	test('returns every durable event for the session in stored order', async () => {
		const sessionId = asSessionId('session-1');
		const timestamp = asISODateTime('2026-06-09T12:00:00.000Z');
		const promptEvent = promptSubmittedEvent({
			id: asEventId('event-1'),
			sessionId,
			timestamp,
			messageId: asMessageId('message-user-1'),
			prompt: 'Hej',
		});
		const assistantEvent = assistantMessageCompletedEvent({
			id: asEventId('event-3'),
			sessionId,
			timestamp,
			messageId: asMessageId('message-assistant-1'),
			content: 'Czesc',
		});
		const useCase = new ListSessionEvents({
			sessionStore: new InMemorySessionStore({
				events: [
					promptEvent,
					toolCallCompletedEvent({
						id: asEventId('event-2'),
						sessionId,
						timestamp,
						toolCallId: asToolCallId('tool-call-1'),
						toolName: 'read_file',
						output: { ok: true },
					}),
					assistantEvent,
				],
			}),
		});

		const result = await useCase.list({ sessionId });

		expect(result.events).toEqual([
			promptEvent,
			expect.objectContaining({ type: 'tool.call.completed' }),
			assistantEvent,
		]);
	});

	test('defensively excludes events from another session', async () => {
		const sessionId = asSessionId('session-1');
		const otherSessionId = asSessionId('session-2');
		const timestamp = asISODateTime('2026-06-09T12:00:00.000Z');
		const useCase = new ListSessionEvents({
			sessionStore: new InMemorySessionStore({
				events: [
					promptSubmittedEvent({
						id: asEventId('event-1'),
						sessionId: otherSessionId,
						timestamp,
						messageId: asMessageId('message-user-1'),
						prompt: 'Other prompt',
					}),
					toolCallCompletedEvent({
						id: asEventId('event-2'),
						sessionId,
						timestamp,
						toolCallId: asToolCallId('tool-call-1'),
						toolName: 'read_file',
						output: { ok: true },
					}),
					agentErrorOccurredEvent({
						id: asEventId('event-3'),
						sessionId,
						timestamp,
						error: {
							message: 'model failed',
							recoverable: true,
						},
					}),
				],
			}),
		});

		const result = await useCase.list({ sessionId });

		expect(result.events).toEqual([
			expect.objectContaining({ type: 'tool.call.completed' }),
			expect.objectContaining({ type: 'agent.error' }),
		]);
	});
});
