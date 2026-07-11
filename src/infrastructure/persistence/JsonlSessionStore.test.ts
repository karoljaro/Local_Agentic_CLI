import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { AgentEvent } from '@/domain/AgentEvent';
import { asEventId, asISODateTime, asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';
import { createTempDirectory } from '@/test-support/createTempDirectory';

import { JsonlSessionStore } from './JsonlSessionStore';

const createTempStore = async (): Promise<{
	store: JsonlSessionStore;
	directory: string;
	cleanup: () => Promise<void>;
}> => {
	const { directory, cleanup } = await createTempDirectory('jsonl-session-store-');

	return {
		store: new JsonlSessionStore(directory),
		directory,
		cleanup,
	};
};

describe('JsonlSessionStore', () => {
	test('returns empty sessions for a missing sessions directory', async () => {
		const { store, cleanup } = await createTempStore();

		try {
			await cleanup();

			const sessions = await store.listSessions();

			expect(sessions).toEqual([]);
		} finally {
			await cleanup();
		}
	});

	test('lists sessions with event files in descending id order', async () => {
		const { store, directory, cleanup } = await createTempStore();
		const timestamp = asISODateTime('2026-06-09T12:00:00.000Z');
		const firstSessionId = asSessionId('session-1');
		const secondSessionId = asSessionId('session-2');

		try {
			await mkdir(join(directory, 'empty-session'), { recursive: true });
			await writeFile(join(directory, 'not-a-session.txt'), 'ignored', 'utf8');

			await store.appendSessionEvent({
				id: asEventId('event-1'),
				sessionId: firstSessionId,
				type: 'prompt.submitted',
				timestamp,
				messageId: asMessageId('message-1'),
				prompt: 'Hello',
			});
			await store.appendSessionEvent({
				id: asEventId('event-2'),
				sessionId: secondSessionId,
				type: 'prompt.submitted',
				timestamp,
				messageId: asMessageId('message-2'),
				prompt: 'Hi',
			});

			const sessions = await store.listSessions();

			expect(sessions).toEqual([{ sessionId: secondSessionId }, { sessionId: firstSessionId }]);
		} finally {
			await cleanup();
		}
	});

	test('returns empty events for a missing session', async () => {
		const { store, cleanup } = await createTempStore();

		try {
			const events = await store.readSessionEvents(asSessionId('missing-session'));

			expect(events).toEqual([]);
		} finally {
			await cleanup();
		}
	});

	test('appends and reads session events in order', async () => {
		const { store, cleanup } = await createTempStore();
		const sessionId = asSessionId('session-1');
		const timestamp = asISODateTime('2026-06-09T12:00:00.000Z');

		const firstEvent: AgentEvent = {
			id: asEventId('event-1'),
			sessionId,
			type: 'prompt.submitted',
			timestamp,
			messageId: asMessageId('message-1'),
			prompt: 'Hello',
		};
		const secondEvent: AgentEvent = {
			id: asEventId('event-2'),
			sessionId,
			type: 'assistant.message.completed',
			timestamp,
			messageId: asMessageId('message-2'),
			content: 'Hi',
		};

		try {
			await store.appendSessionEvent(firstEvent);
			await store.appendSessionEvent(secondEvent);

			const events = await store.readSessionEvents(sessionId);

			expect(events).toEqual([firstEvent, secondEvent]);
		} finally {
			await cleanup();
		}
	});

	test('appends and reads an assistant tool-call batch', async () => {
		const { store, cleanup } = await createTempStore();
		const sessionId = asSessionId('session-1');
		const event: AgentEvent = {
			id: asEventId('event-1'),
			sessionId,
			type: 'assistant.tool_calls.completed',
			timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
			messageId: asMessageId('message-1'),
			content: 'I will inspect both files.',
			toolCalls: [
				{
					id: asToolCallId('tool-call-1'),
					name: 'read_file',
					arguments: { path: 'README.md' },
				},
			],
		};

		try {
			await store.appendSessionEvent(event);

			expect(await store.readSessionEvents(sessionId)).toEqual([event]);
		} finally {
			await cleanup();
		}
	});

	test('reports the line number for malformed JSONL', async () => {
		const { store, directory, cleanup } = await createTempStore();
		const sessionId = asSessionId('session-1');
		const sessionDirectory = join(directory, sessionId);
		const validEvent: AgentEvent = {
			id: asEventId('event-1'),
			sessionId,
			type: 'prompt.submitted',
			timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
			messageId: asMessageId('message-1'),
			prompt: 'Hello',
		};

		try {
			await mkdir(sessionDirectory, { recursive: true });
			await writeFile(
				join(sessionDirectory, 'events.jsonl'),
				`${JSON.stringify(validEvent)}\nnot-json\n${JSON.stringify(validEvent)}\n`,
				'utf8',
			);

			await expect(store.readSessionEvents(sessionId)).rejects.toThrow('line 2');
		} finally {
			await cleanup();
		}
	});

	test('ignores an incomplete final JSONL line without dropping previous events', async () => {
		const { store, directory, cleanup } = await createTempStore();
		const sessionId = asSessionId('session-1');
		const sessionDirectory = join(directory, sessionId);
		const validEvent: AgentEvent = {
			id: asEventId('event-1'),
			sessionId,
			type: 'prompt.submitted',
			timestamp: asISODateTime('2026-06-09T12:00:00.000Z'),
			messageId: asMessageId('message-1'),
			prompt: 'Hello',
		};

		try {
			await mkdir(sessionDirectory, { recursive: true });
			await writeFile(
				join(sessionDirectory, 'events.jsonl'),
				`${JSON.stringify(validEvent)}\n{"id":"partial"`,
				'utf8',
			);

			const events = await store.readSessionEvents(sessionId);

			expect(events).toEqual([validEvent]);
		} finally {
			await cleanup();
		}
	});

	test('validates event structure when reading JSONL', async () => {
		const { store, directory, cleanup } = await createTempStore();
		const sessionId = asSessionId('session-1');
		const sessionDirectory = join(directory, sessionId);

		try {
			await mkdir(sessionDirectory, { recursive: true });
			await writeFile(
				join(sessionDirectory, 'events.jsonl'),
				JSON.stringify({
					id: 'event-1',
					sessionId,
					type: 'prompt.submitted',
					timestamp: '2026-06-09T12:00:00.000Z',
					messageId: 'message-1',
				}) + '\n',
				'utf8',
			);

			await expect(store.readSessionEvents(sessionId)).rejects.toThrow('prompt');
		} finally {
			await cleanup();
		}
	});

	test('rejects session ids that are unsafe path segments', async () => {
		const { store, cleanup } = await createTempStore();

		try {
			await expect(store.readSessionEvents(asSessionId('../outside'))).rejects.toThrow(
				'Invalid session id',
			);
		} finally {
			await cleanup();
		}
	});
});
