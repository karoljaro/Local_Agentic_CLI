import { expect, test } from 'bun:test';
import { asEventId, asToolCallId } from '@/domain/Ids';
import {
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
	toolCallFailedEvent,
	toolCallRequestedEvent,
	toolCallStartedEvent,
} from '@/test-support/AgentEventFixtures';
import { TranscriptLog } from './TranscriptLog';

test('transcript preserves durable event order and compact tool descriptions', () => {
	const log = new TranscriptLog();
	for (const event of [
		promptSubmittedEvent(),
		assistantToolCallsCompletedEvent({ content: 'Inspecting the file.' }),
		toolCallRequestedEvent(),
		toolCallStartedEvent(),
		toolCallCompletedEvent(),
		assistantMessageCompletedEvent({ content: 'Done.' }),
	])
		log.apply(event);
	expect(log.history.map((entry) => [entry.kind, entry.content])).toEqual([
		['user', 'Hello'],
		['assistant', 'Inspecting the file.'],
		['tool', 'Read file · README.md'],
		['assistant', 'Done.'],
	]);
	expect(log.activeTools).toEqual([]);
	expect(log.history.some((entry) => entry.content.includes('ok'))).toBe(false);
});

test('independent tool lifetimes produce truthful success and failure entries', () => {
	const log = new TranscriptLog();
	const second = asToolCallId('second');
	log.apply(toolCallRequestedEvent({ approvalRequired: true }));
	log.apply(
		toolCallRequestedEvent({
			id: asEventId('request-2'),
			toolCallId: second,
			toolName: 'edit_file',
			toolInput: { path: 'main.ts' },
		}),
	);
	expect(log.activeTools[0]?.status).toBe('approval');
	log.apply(toolCallStartedEvent());
	expect(log.activeTools[0]?.status).toBe('running');
	log.apply(toolCallCompletedEvent());
	log.apply(
		toolCallFailedEvent({
			toolCallId: second,
			toolName: 'edit_file',
			error: { message: 'denied' },
		}),
	);
	expect(log.activeTools).toEqual([]);
	expect(log.history[1]).toMatchObject({ content: 'Edit file · main.ts · denied', failure: true });
});

test('legacy orphan results have a useful fallback and duplicate durable entries appear once', () => {
	const log = new TranscriptLog();
	const legacy = toolCallCompletedEvent({ toolName: 'read_file' });
	log.apply(legacy);
	log.apply(legacy);
	expect(log.history).toEqual([{ id: String(legacy.id), kind: 'tool', content: 'Read file' }]);
	log.apply(assistantMessageCompletedEvent({ content: ' \n' }));
	expect(log.history).toHaveLength(1);
});

test('clearing interrupted activity does not fabricate terminal tool history', () => {
	const log = new TranscriptLog();
	log.apply(toolCallRequestedEvent());
	log.apply(toolCallStartedEvent());
	log.clearActivity();
	expect(log.activeTools).toEqual([]);
	expect(log.history).toEqual([]);
});
