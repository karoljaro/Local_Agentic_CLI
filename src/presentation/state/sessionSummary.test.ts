import { describe, expect, test } from 'bun:test';

import { asISODateTime, asSessionId } from '@/domain/Ids';
import {
	assistantMessageCompletedEvent,
	promptSubmittedEvent,
} from '@/test-support/AgentEventFixtures';
import { buildSessionOption } from './sessionSummary';

describe('buildSessionOption', () => {
	test('uses the latest prompt and final event timestamp as resume metadata', () => {
		const sessionId = asSessionId('session-1');
		const finalTimestamp = asISODateTime('2026-07-12T14:00:00.000Z');
		const option = buildSessionOption(sessionId, [
			promptSubmittedEvent({ sessionId, prompt: 'Older' }),
			promptSubmittedEvent({ sessionId, prompt: 'Latest\nquestion' }),
			assistantMessageCompletedEvent({ sessionId, timestamp: finalTimestamp }),
		]);

		expect(option).toEqual({
			sessionId,
			lastActiveAt: finalTimestamp,
			preview: 'Latest question',
		});
	});
});
