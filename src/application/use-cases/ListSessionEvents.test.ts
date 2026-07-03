import { describe, expect, test } from 'bun:test';

import type { AgentEvent } from '@/domain/AgentEvent';
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
	asToolCallId,
} from '@/domain/Ids';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { ListSessionEvents } from './ListSessionEvents';

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
			sessionStore: new InMemorySessionStore({
				events: [
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
				],
			}),
		});

		const result = await useCase.list({ sessionId });

		expect(result.events).toEqual([promptEvent, assistantEvent]);
	});

	test('does not return events from another session or non-chat event types', async () => {
		const sessionId = asSessionId('session-1');
		const otherSessionId = asSessionId('session-2');
		const timestamp = asISODateTime('2026-06-09T12:00:00.000Z');
		const useCase = new ListSessionEvents({
			sessionStore: new InMemorySessionStore({
				events: [
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
				],
			}),
		});

		const result = await useCase.list({ sessionId });

		expect(result.events).toEqual([]);
	});
});
