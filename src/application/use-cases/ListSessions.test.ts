import { describe, expect, test } from 'bun:test';

import type { AgentEvent } from '@/domain/AgentEvent';
import { asSessionId } from '@/domain/Ids';
import type {
	SessionStorePort,
	StoredSession,
} from '../ports/SessionStorePort';
import { ListSessions } from './ListSessions';

class InMemorySessionStore implements SessionStorePort {
	constructor(private readonly sessions: StoredSession[]) {}

	async listSessions(): Promise<StoredSession[]> {
		return this.sessions;
	}

	async readSessionEvents(): Promise<AgentEvent[]> {
		return [];
	}

	async appendSessionEvent(): Promise<void> {}
}

describe('ListSessions', () => {
	test('returns stored sessions from the session store', async () => {
		const sessions: StoredSession[] = [
			{ sessionId: asSessionId('session-2') },
			{ sessionId: asSessionId('session-1') },
		];
		const useCase = new ListSessions({
			sessionStore: new InMemorySessionStore(sessions),
		});

		const result = await useCase.list();

		expect(result.sessions).toEqual(sessions);
	});
});
