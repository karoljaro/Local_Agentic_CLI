import { describe, expect, test } from 'bun:test';

import { asSessionId } from '@/domain/Ids';
import { promptSubmittedEvent } from '@/test-support/AgentEventFixtures';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { PublishingSessionStore } from './PublishingSessionStore';

describe('PublishingSessionStore', () => {
	test('notifies subscribers after a successful append and supports cleanup', async () => {
		const store = new PublishingSessionStore(new InMemorySessionStore());
		const observed: string[] = [];
		const unsubscribe = store.subscribe((event) => observed.push(String(event.id)));
		const first = promptSubmittedEvent();
		const second = promptSubmittedEvent({ sessionId: asSessionId('session-2') });

		await store.appendSessionEvent(first);
		unsubscribe();
		await store.appendSessionEvent(second);

		expect(observed).toEqual([String(first.id)]);
	});

	test('isolates subscriber failures from persistence and other subscribers', async () => {
		const store = new PublishingSessionStore(new InMemorySessionStore());
		const observed: string[] = [];
		store.subscribe(() => {
			throw new Error('observer failed');
		});
		store.subscribe((event) => observed.push(String(event.id)));
		const event = promptSubmittedEvent();

		await expect(store.appendSessionEvent(event)).resolves.toBeUndefined();
		expect(observed).toEqual([String(event.id)]);
	});
});
