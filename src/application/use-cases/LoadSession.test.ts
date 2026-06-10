import { describe, expect, test } from 'bun:test';

import type { AgentEvent } from '@/domain/AgentEvent';
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
	type SessionId,
} from '@/domain/Ids';
import type {
	SessionStorePort,
	StoredSession,
} from '../ports/SessionStorePort';
import { LoadSession } from './LoadSession';

class InMemorySessionStore implements SessionStorePort {
	constructor(private readonly events: AgentEvent[] = []) {}

	async listSessions(): Promise<StoredSession[]> {
		return [];
	}

	async readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		return this.events.filter((event) => event.sessionId === sessionId);
	}

	async appendSessionEvent(event: AgentEvent): Promise<void> {
		this.events.push(event);
	}
}

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
			sessionStore: new InMemorySessionStore([
				{
					id: asEventId('event-1'),
					sessionId,
					type: 'prompt.submitted',
					timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
					messageId: asMessageId('message-user-1'),
					prompt: 'Hej',
				},
				{
					id: asEventId('event-2'),
					sessionId,
					type: 'assistant.message.completed',
					timestamp: asISODateTime('2026-06-09T12:00:01.000Z'),
					messageId: asMessageId('message-assistant-1'),
					content: 'Czesc',
				},
			]),
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
			sessionStore: new InMemorySessionStore([
				{
					id: asEventId('event-1'),
					sessionId: otherSessionId,
					type: 'prompt.submitted',
					timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
					messageId: asMessageId('message-user-1'),
					prompt: 'Other prompt',
				},
			]),
		});

		const result = await useCase.load({ sessionId });

		expect(result.state.messages).toEqual([]);
	});
});
