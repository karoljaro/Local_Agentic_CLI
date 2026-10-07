import { describe, expect, spyOn, test } from 'bun:test';

import { reduceAgentState } from '@/application/services/SessionReducer';
import { asISODateTime, asSessionId } from '@/domain/Ids';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { buildSessionOption } from '@/presentation/state/sessionSummary';
import {
	assistantMessageCompletedEvent,
	promptSubmittedEvent,
} from '@/test-support/AgentEventFixtures';
import { createTempDirectory } from '@/test-support/createTempDirectory';

import { TemporalClock } from './TemporalClock';

describe('TemporalClock', () => {
	test('returns an ISO timestamp', () => {
		const clock = new TemporalClock();

		expect(clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
	});

	test('preserves native instant precision through JSONL reload, summary, and replay', async () => {
		const instant = Temporal.Instant.from('2026-10-07T15:50:40.123456789Z');
		const now = spyOn(Temporal.Now, 'instant').mockReturnValue(instant);
		let timestamp;
		try {
			timestamp = new TemporalClock().now();
			expect(timestamp).toBe(asISODateTime('2026-10-07T15:50:40.123456789Z'));
			expect(now).toHaveBeenCalledTimes(1);
			expect(Temporal.Instant.from(timestamp).epochNanoseconds).toBe(instant.epochNanoseconds);
		} finally {
			now.mockRestore();
		}

		const sessionId = asSessionId('mixed-precision');
		const events = [
			promptSubmittedEvent({
				sessionId,
				timestamp: asISODateTime('2026-10-07T15:50:40.123Z'),
			}),
			assistantMessageCompletedEvent({ sessionId, timestamp }),
		];
		const { directory, cleanup } = await createTempDirectory('phase-10-clock-');
		try {
			const store = new JsonlSessionStore(directory);
			for (const event of events) await store.appendSessionEvent(event);
			const reloaded = await new JsonlSessionStore(directory).readSessionEvents(sessionId);
			expect(reloaded).toEqual(events);
			expect(buildSessionOption(sessionId, reloaded).lastActiveAt).toBe(timestamp);
			expect(reduceAgentState(sessionId, reloaded)).toEqual(reduceAgentState(sessionId, events));
		} finally {
			await cleanup();
		}
	});
});
