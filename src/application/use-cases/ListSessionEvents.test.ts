import { describe, expect, test } from 'bun:test';

import type { AgentEvent } from '@/domain/AgentEvent';
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
	asToolCallId,
	type SessionId,
} from '@/domain/Ids';
import type {
	SessionStorePort,
	StoredSession,
} from '../ports/SessionStorePort';
import { ListSessionEvents } from './ListSessionEvents';

class InMemorySessionStore implements SessionStorePort {
	constructor(private readonly events: AgentEvent[]) {}

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

describe('ListSessionEvents', () => {
	test('returns prompt and completed assistant events in stored order', async () => {
		const sessionId = asSessionId('session-1');
		const timestamp = asISODateTime('2026-06-09T12:00:00.000Z');
		const promptEvent: AgentEvent = {
			id: asEventId('event-1'),
			sessionId,
			type: 'prompt.submitted',
			timestamp,
			messageId: asMessageId('message-user-1'),
			prompt: 'Hej',
		};
		const assistantEvent: AgentEvent = {
			id: asEventId('event-3'),
			sessionId,
			type: 'assistant.message.completed',
			timestamp,
			messageId: asMessageId('message-assistant-1'),
			content: 'Czesc',
		};
		const useCase = new ListSessionEvents({
			sessionStore: new InMemorySessionStore([
				promptEvent,
				{
					id: asEventId('event-2'),
					sessionId,
					type: 'assistant.message.delta',
					timestamp,
					messageId: asMessageId('message-assistant-1'),
					delta: 'Czesc',
				},
				assistantEvent,
			]),
		});

		const result = await useCase.list({ sessionId });

		expect(result.events).toEqual([promptEvent, assistantEvent]);
	});

	test('does not return events from another session or non-chat event types', async () => {
		const sessionId = asSessionId('session-1');
		const otherSessionId = asSessionId('session-2');
		const timestamp = asISODateTime('2026-06-09T12:00:00.000Z');
		const useCase = new ListSessionEvents({
			sessionStore: new InMemorySessionStore([
				{
					id: asEventId('event-1'),
					sessionId: otherSessionId,
					type: 'prompt.submitted',
					timestamp,
					messageId: asMessageId('message-user-1'),
					prompt: 'Other prompt',
				},
				{
					id: asEventId('event-2'),
					sessionId,
					type: 'tool.call.completed',
					timestamp,
					toolCallId: asToolCallId('tool-call-1'),
					toolName: 'read_file',
					output: { ok: true },
				},
				{
					id: asEventId('event-3'),
					sessionId,
					type: 'agent.error',
					timestamp,
					error: {
						message: 'model failed',
						recoverable: true,
					},
				},
			]),
		});

		const result = await useCase.list({ sessionId });

		expect(result.events).toEqual([]);
	});
});
