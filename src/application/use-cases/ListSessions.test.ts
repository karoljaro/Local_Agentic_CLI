import { describe, expect, test } from 'bun:test';

import { asSessionId } from '@/domain/Ids';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import type { StoredSession } from '../ports/SessionStorePort';
import { ListSessions } from './ListSessions';

describe('ListSessions', () => {
	test('returns stored sessions from the session store', async () => {
		const sessions: StoredSession[] = [
			{ sessionId: asSessionId('session-2') },
			{ sessionId: asSessionId('session-1') },
		];
		const useCase = new ListSessions({
			sessionStore: new InMemorySessionStore({ sessions }),
		});

		const result = await useCase.list();

		expect(result.sessions).toEqual(sessions);
	});
});
