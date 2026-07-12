import { describe, expect, test } from 'bun:test';

import type { SessionStorePort, StoredSession } from '@/application/ports/SessionStorePort';
import type { AgentEvent } from '@/domain/AgentEvent';
import { asEventId, asMessageId, asSessionId, type SessionId } from '@/domain/Ids';
import {
	assistantMessageCompletedEvent,
	promptSubmittedEvent,
} from '@/test-support/AgentEventFixtures';
import { SessionStateCache } from './SessionStateCache';

class RecordingSessionStore implements SessionStorePort {
	readonly events: AgentEvent[];
	readCount = 0;
	failNextAppend = false;

	constructor(events: AgentEvent[] = []) {
		this.events = [...events];
	}

	async listSessions(): Promise<StoredSession[]> {
		return [];
	}

	async readSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		this.readCount += 1;
		return this.events.filter((event) => event.sessionId === sessionId);
	}

	async appendSessionEvent(event: AgentEvent): Promise<void> {
		if (this.failNextAppend) {
			this.failNextAppend = false;
			throw new Error('append failed');
		}

		this.events.push(event);
	}
}

describe('SessionStateCache', () => {
	test('reads and reduces a session once while applying later appends incrementally', async () => {
		const sessionId = asSessionId('session-1');
		const prompt = promptSubmittedEvent({ sessionId });
		const assistant = assistantMessageCompletedEvent({ sessionId });
		const durableStore = new RecordingSessionStore([prompt]);
		const cache = new SessionStateCache(durableStore);

		const [events, initialState] = await Promise.all([
			cache.readSessionEvents(sessionId),
			cache.readSessionState(sessionId),
		]);
		await cache.appendSessionEvent(assistant);
		const updatedState = await cache.readSessionState(sessionId);

		expect(durableStore.readCount).toBe(1);
		expect(events).toEqual([prompt]);
		expect(initialState.messages).toHaveLength(1);
		expect(updatedState.messages).toHaveLength(2);
		expect(await cache.readSessionEvents(sessionId)).toEqual([prompt, assistant]);
		expect(durableStore.readCount).toBe(1);
	});

	test('does not update cached events or state when durable append fails', async () => {
		const sessionId = asSessionId('session-1');
		const durableStore = new RecordingSessionStore();
		const cache = new SessionStateCache(durableStore);
		await cache.readSessionState(sessionId);
		durableStore.failNextAppend = true;

		await expect(
			cache.appendSessionEvent(
				promptSubmittedEvent({
					id: asEventId('event-failed'),
					messageId: asMessageId('message-failed'),
					sessionId,
				}),
			),
		).rejects.toThrow('append failed');

		expect(await cache.readSessionEvents(sessionId)).toEqual([]);
		expect((await cache.readSessionState(sessionId)).messages).toEqual([]);

		const successfulPrompt = promptSubmittedEvent({ sessionId });
		await cache.appendSessionEvent(successfulPrompt);
		expect(await cache.readSessionEvents(sessionId)).toEqual([successfulPrompt]);
	});

	test('rebuilds the same state from durable events after a process restart', async () => {
		const sessionId = asSessionId('session-1');
		const durableStore = new RecordingSessionStore();
		const firstRuntime = new SessionStateCache(durableStore);
		await firstRuntime.appendSessionEvent(promptSubmittedEvent({ sessionId }));
		await firstRuntime.appendSessionEvent(assistantMessageCompletedEvent({ sessionId }));

		const firstState = await firstRuntime.readSessionState(sessionId);
		const restartedState = await new SessionStateCache(durableStore).readSessionState(sessionId);

		expect(restartedState).toEqual(firstState);
		expect(durableStore.readCount).toBe(2);
	});
});
