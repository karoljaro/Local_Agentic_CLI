import { describe, expect, test } from 'bun:test';

import { asEventId, asISODateTime, asMessageId, asSessionId } from '@/domain/Ids';
import {
	assistantMessageCompletedEvent,
	promptSubmittedEvent,
} from '@/test-support/AgentEventFixtures';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { LoadSession } from './LoadSession';

describe('LoadSession', () => {
	test('returns an empty state when session has no events', async () => {
		const sessionId = asSessionId('session-1');
		const useCase = new LoadSession({
			sessionStore: new InMemorySessionStore(),
		});

		const result = await useCase.load({ sessionId });

		expect(result.state).toEqual({
			sessionId,
			messages: [],
			toolResults: [],
			errors: [],
		});
	});

	test('rebuilds chat history from stored session events', async () => {
		const sessionId = asSessionId('session-1');
		const useCase = new LoadSession({
			sessionStore: new InMemorySessionStore({
				events: [
					promptSubmittedEvent({
						id: asEventId('event-1'),
						sessionId,
						timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
						messageId: asMessageId('message-user-1'),
						prompt: 'Hej',
					}),
					assistantMessageCompletedEvent({
						id: asEventId('event-2'),
						sessionId,
						timestamp: asISODateTime('2026-06-09T12:00:01.000Z'),
						messageId: asMessageId('message-assistant-1'),
						content: 'Czesc',
					}),
				],
			}),
		});

		const result = await useCase.load({ sessionId });

		expect(result.state.messages).toEqual([
			{
				id: asMessageId('message-user-1'),
				role: 'user',
				content: 'Hej',
			},
			{
				id: asMessageId('message-assistant-1'),
				role: 'assistant',
				content: 'Czesc',
			},
		]);
	});

	test('does not load events from another session', async () => {
		const sessionId = asSessionId('session-1');
		const otherSessionId = asSessionId('session-2');
		const useCase = new LoadSession({
			sessionStore: new InMemorySessionStore({
				events: [
					promptSubmittedEvent({
						id: asEventId('event-1'),
						sessionId: otherSessionId,
						timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
						messageId: asMessageId('message-user-1'),
						prompt: 'Other prompt',
					}),
				],
			}),
		});

		const result = await useCase.load({ sessionId });

		expect(result.state.messages).toEqual([]);
	});
});
