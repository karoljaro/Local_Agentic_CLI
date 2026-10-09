import { describe, expect, test, spyOn } from 'bun:test';
import type { AgentEvent } from '@/domain/AgentEvent';
import { asEventId, asMessageId, asSessionId, asToolCallId } from '@/domain/Ids';
import type { MemoryUpdateInput } from '@/application/ports/SessionMemoryUpdaterPort';
import {
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
	toolCallRequestedEvent,
	toolCallFailedEvent,
	agentErrorOccurredEvent,
} from '@/test-support/AgentEventFixtures';
import {
	FakeMemoryStore,
	FakeMemoryUpdater,
	noMemoryDelta,
} from '@/test-support/SessionMemoryFixtures';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { createDeferred } from '@/test-support/createDeferred';
import { SessionMemoryService } from './SessionMemoryService';
import { SessionService } from './SessionService';
import { AgentStateReducer } from './SessionReducer';
import { MEMORY_CAPS, MEMORY_TOKEN_CAP } from '@/domain/SessionMemory';
import { renderSessionMemory } from './SessionMemoryRenderer';

const sessionId = asSessionId('memory-session');
const change = (
	input: MemoryUpdateInput,
	category: string,
	key: string,
	text: string,
	operation = 'upsert',
	role = 'user',
) => {
	const source = input.evidence.find((item) => item.role === role)!;
	return {
		operation,
		category,
		key,
		...(operation === 'upsert' ? { text } : {}),
		evidence: { messageId: source.messageId, quote: source.text },
	};
};
const initial = (input: MemoryUpdateInput) => ({
	version: 1,
	goal: {
		mode: 'initial',
		text: 'Implement a file service.',
		evidence: { messageId: input.evidence[0]!.messageId, quote: input.evidence[0]!.text },
	},
	changes: [
		change(input, 'decisions', 'database', 'Use PostgreSQL.'),
		change(input, 'constraints', 'tui', 'Do not redesign the TUI.'),
		change(input, 'pending', 'integration-tests', 'Run integration tests.'),
	],
});
const harness = async (
	store = new FakeMemoryStore(),
	updater = new FakeMemoryUpdater(),
	durable = new InMemorySessionStore(),
	deadlineMs = 10000,
) => {
	const sessions = new SessionService(durable);
	const service = new SessionMemoryService(sessions, store, updater, deadlineMs);
	await service.activate(sessionId, await sessions.activateSession(sessionId));
	let sequence = durable.events.length;
	let user = '';
	const append = async (event: AgentEvent) =>
		sessions.appendSessionEvent({ ...event, id: asEventId(`event-${++sequence}`), sessionId });
	const begin = async (prompt: string) => {
		user = `user-${sequence + 1}`;
		await append(promptSubmittedEvent({ messageId: asMessageId(user), prompt }));
		return user;
	};
	const end = async (content = 'Implemented the service.') => {
		const finalId = `assistant-${sequence + 1}`;
		await append(assistantMessageCompletedEvent({ messageId: asMessageId(finalId), content }));
		await service.finish(sessionId, user, finalId, 'test-chat');
		return finalId;
	};
	const tool = async (name: string, args: unknown, output: unknown, failed = false) => {
		const call = asToolCallId(`call-${sequence + 1}`);
		await append(
			assistantToolCallsCompletedEvent({
				messageId: asMessageId(`batch-${sequence + 1}`),
				toolCalls: [{ id: call, name, arguments: args }],
			}),
		);
		await append(
			failed
				? toolCallFailedEvent({ toolCallId: call, toolName: name })
				: toolCallCompletedEvent({ toolCallId: call, toolName: name, output }),
		);
	};
	return {
		service,
		store,
		updater,
		durable,
		sessions,
		begin,
		end,
		tool,
		append,
		memory: () => service.snapshot(sessionId)!,
	};
};

describe('bounded derived session memory lifecycle and semantics', () => {
	test('commits during deferred activation buffer after the canonical prefix; same-session activation awaits readiness', async () => {
		const h = await harness();
		await h.begin('Earlier work.');
		await h.end();
		const loaded = createDeferred<
			import('@/domain/SessionMemory').SessionMemoryDocument | undefined
		>();
		const persisted = structuredClone(h.store.documents.get(sessionId));
		h.store.read = async () => loaded.promise;
		const updater = new FakeMemoryUpdater();
		const service = new SessionMemoryService(h.sessions, h.store, updater);
		const activation = service.activate(sessionId, await h.sessions.activateSession(sessionId));
		const user = await h.begin('New current work.');
		const same = service.activate(sessionId, await h.sessions.activateSession(sessionId));
		expect(same).toBe(activation);
		expect(service.snapshot(sessionId)).toBeUndefined();
		loaded.resolve(persisted);
		await activation;
		await h.append(
			assistantMessageCompletedEvent({
				messageId: asMessageId('buffered-final'),
				content: 'New work completed.',
			}),
		);
		await service.finish(sessionId, user, 'buffered-final');
		expect(updater.inputs[0]?.evidence[0]?.messageId).toBe(user);
		expect(h.store.writes.at(-1)?.source.eventCount).toBe(h.durable.events.length);
		h.store.read = async (id) => structuredClone(h.store.documents.get(id));
		const restored = await harness(h.store, new FakeMemoryUpdater(), h.durable);
		expect(restored.service.diagnostics.lastFailure).toBeUndefined();
	});
	test('same-session authoritative reactivation recovers a committed event missed after reduction failure', async () => {
		const h = await harness();
		await h.begin('Create a.ts.');
		const callId = asToolCallId('missed-create');
		await h.append(
			assistantToolCallsCompletedEvent({
				messageId: asMessageId('missed-batch'),
				toolCalls: [{ id: callId, name: 'create_file', arguments: { path: 'a.ts' } }],
			}),
		);
		const apply = AgentStateReducer.prototype.apply;
		const failure = spyOn(AgentStateReducer.prototype, 'apply').mockImplementation(function (
			this: AgentStateReducer,
			event,
		) {
			if (event.type === 'tool.call.completed') throw new Error('reduction failed after commit');
			return apply.call(this, event);
		});
		try {
			await expect(
				h.append(
					toolCallCompletedEvent({
						toolCallId: callId,
						toolName: 'create_file',
						output: { path: 'a.ts', created: true },
					}),
				),
			).rejects.toThrow();
		} finally {
			failure.mockRestore();
		}
		const events = await h.sessions.activateSession(sessionId);
		await h.service.activate(sessionId, events);
		expect(h.memory().files[0]).toMatchObject({ path: 'a.ts', activity: 'created' });
		await h.begin('Continue.');
		await h.end();
		const resumed = await harness(h.store, new FakeMemoryUpdater(), h.durable);
		expect(resumed.memory().files).toEqual(h.memory().files);
		expect(h.store.writes.at(-1)?.source.eventCount).toBe(h.durable.events.length);
	});
	test('problem upsert reopens a completed task without contradictory current completion', async () => {
		const h = await harness();
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [change(input, 'completed', 'tests', 'Tests completed.')],
		});
		await h.begin('Tests completed.');
		await h.end();
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [change(input, 'problems', 'tests', 'Tests are blocked again.')],
		});
		await h.begin('Reopen tests: they are blocked again.');
		await h.end();
		expect(h.memory().completed).toEqual([]);
		expect(h.memory().problems[0]?.key).toBe('tests');
	});
	test('compacted-away failures still block false semantic completion', async () => {
		const h = await harness();
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: Array.from({ length: 8 }, (_, i) =>
				change(input, 'constraints', `constraint-${i}`, 'c'.repeat(130) + '界'.repeat(30)),
			),
		});
		await h.begin('Keep all persistent requirements.');
		await h.end();
		await h.begin('Edit a.ts.');
		await h.tool('edit_file', { path: 'a.ts' }, undefined, true);
		expect(h.memory().problems).toHaveLength(0); // Display cap must not become a truth gate.
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [
				change(input, 'constraints', 'constraint-0', '', 'remove'),
				change(input, 'completed', 'edit', 'Edit completed.', 'upsert', 'assistant'),
			],
		});
		await h.end('Edit completed.');
		expect(h.memory().completed).toEqual([]);
		expect(h.store.writes.at(-1)?.updater.status).toBe('failed');
	});
	test('unrelated file event/message references and future entry sources are rejected on resume', async () => {
		const h = await harness();
		await h.begin('Modify two files.');
		await h.tool('edit_file', { path: 'a.ts' }, { path: 'a.ts', changed: true });
		await h.tool('edit_file', { path: 'b.ts' }, { path: 'b.ts', changed: true });
		await h.end();
		const document = h.store.documents.get(sessionId)!;
		const a = document.memory.files.find((file) => file.path === 'a.ts')!;
		const b = document.memory.files.find((file) => file.path === 'b.ts')!;
		a.sourceEventIds = [...b.sourceEventIds];
		a.sourceMessageIds = [...b.sourceMessageIds];
		const updater = new FakeMemoryUpdater();
		const resumed = await harness(h.store, updater, h.durable);
		expect(resumed.service.diagnostics.lastFailure).toBeDefined();
		expect(resumed.memory().files.find((file) => file.path === 'a.ts')?.sourceEventIds).not.toEqual(
			b.sourceEventIds,
		);
	});
	test('publication remains ordered after a caller timeout while an unabortable write settles', async () => {
		const h = await harness();
		const store = new FakeMemoryStore();
		const deferred = createDeferred<void>();
		let writes = 0;
		store.write = async (document) => {
			if (++writes === 1) await deferred.promise;
			store.documents.set(document.sessionId, structuredClone(document));
			store.writes.push(structuredClone(document));
		};
		const updater = new FakeMemoryUpdater();
		const service = new SessionMemoryService(h.sessions, store, updater, 10000, 20);
		await service.activate(sessionId, await h.sessions.activateSession(sessionId));
		let user = await h.begin('First work.');
		await h.append(
			assistantMessageCompletedEvent({
				messageId: asMessageId('first-final'),
				content: 'First done.',
			}),
		);
		await service.finish(sessionId, user, 'first-final');
		expect(store.writes).toHaveLength(0);
		user = await h.begin('Second work.');
		await h.append(
			assistantMessageCompletedEvent({
				messageId: asMessageId('second-final'),
				content: 'Second done.',
			}),
		);
		const second = service.finish(sessionId, user, 'second-final');
		await Promise.resolve();
		deferred.resolve();
		await second;
		expect(store.writes).toHaveLength(2);
		expect(store.documents.get(sessionId)?.source.eventCount).toBe(h.durable.events.length);
		expect(store.writes[0]!.source.eventCount).toBeLessThan(store.writes[1]!.source.eventCount);
	});
	test('changing decision source kind replaces provenance instead of mixing acceptance roles', async () => {
		const h = await harness();
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [change(input, 'decisions', 'database', 'Use SQLite.')],
		});
		await h.begin('Use SQLite.');
		await h.end();
		await h.begin('Implement PostgreSQL instead.');
		await h.tool('edit_file', { path: 'db.ts' }, { path: 'db.ts', changed: true });
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [change(input, 'decisions', 'database', 'Use PostgreSQL.', 'upsert', 'assistant')],
		});
		const final = await h.end('Implemented PostgreSQL.');
		expect(h.memory().decisions[0]).toMatchObject({
			basis: 'assistant-reported',
			sourceMessageIds: [final],
			text: 'Use PostgreSQL.',
		});
	});
	test('repeated reads preserve durable evidence of earlier actual modification', async () => {
		const h = await harness();
		await h.begin('Modify then read.');
		await h.tool('edit_file', { path: 'a.ts' }, { path: 'a.ts', changed: true });
		const mutation = h.memory().files[0]!.sourceEventIds[0];
		for (let i = 0; i < 8; i++)
			await h.tool('read_file', { path: 'a.ts' }, { path: 'a.ts', content: 'current' });
		await h.end();
		expect(h.memory().files[0]?.sourceEventIds).toContain(mutation);
		expect(h.memory().files[0]?.sourceEventIds.length).toBeLessThanOrEqual(3);
	});
	test('legacy mutation with one message anchor survives reads across turns and resume', async () => {
		const h = await harness();
		h.updater.handler = initial;
		await h.begin('Implement a file service.');
		await h.end();
		h.updater.handler = noMemoryDelta;
		const user = await h.begin('Modify a.ts.');
		const call = asToolCallId('legacy-edit');
		await h.append(
			toolCallRequestedEvent({
				toolCallId: call,
				toolName: 'edit_file',
				toolInput: { path: 'a.ts' },
			}),
		);
		await h.append(
			toolCallCompletedEvent({
				toolCallId: call,
				toolName: 'edit_file',
				output: { path: 'a.ts', changed: true },
			}),
		);
		const mutation = h.memory().files[0]!.sourceEventIds[0];
		await h.end();
		for (let i = 0; i < 5; i++) {
			await h.begin('Read a.ts.');
			await h.tool('read_file', { path: 'a.ts' }, { path: 'a.ts', content: 'current' });
			await h.end();
			expect(h.memory().goal?.text).toBe('Implement a file service.');
			expect(h.memory().files[0]?.sourceMessageIds).toContain(user);
			expect(h.memory().files[0]?.sourceEventIds).toContain(mutation);
		}
		const restored = await harness(h.store, new FakeMemoryUpdater(), h.durable);
		expect(restored.memory()).toEqual(h.memory());
		expect(restored.service.diagnostics.lastFailure).toBeUndefined();
	});
	test('empty session has no state or inference', async () => {
		const h = await harness();
		expect(h.memory()).toEqual({
			goal: null,
			decisions: [],
			constraints: [],
			files: [],
			completed: [],
			pending: [],
			problems: [],
		});
		expect(h.updater.inputs).toHaveLength(0);
		expect(h.store.writes).toHaveLength(0);
	});
	test('stores initial high-level goal, accepted decision, persistent constraint and explicit pending with durable provenance', async () => {
		const h = await harness();
		h.updater.handler = initial;
		const user = await h.begin(
			'Implement a file service. Use PostgreSQL; do not redesign the TUI. Run integration tests later.',
		);
		await h.end();
		expect(h.memory().goal?.text).toBe('Implement a file service.');
		expect(h.memory().goal?.sourceMessageIds).toEqual([user]);
		expect(h.memory().decisions[0]).toMatchObject({
			key: 'database',
			basis: 'user-sourced',
			sourceMessageIds: [user],
		});
		expect(h.memory().constraints[0]?.text).toBe('Do not redesign the TUI.');
		expect(h.memory().pending[0]?.key).toBe('integration-tests');
		expect(JSON.stringify(h.store.writes)).not.toContain('quote');
	});
	test('small operational follow-ups retain the goal and constraint over many turns', async () => {
		const h = await harness();
		h.updater.handler = initial;
		await h.begin('Implement a file service.');
		await h.end();
		h.updater.handler = noMemoryDelta;
		for (let i = 0; i < 40; i++) {
			await h.begin('Run typecheck.');
			await h.end('Typecheck passed.');
		}
		expect(h.memory().goal?.text).toBe('Implement a file service.');
		expect(h.memory().constraints).toHaveLength(1);
		expect(h.service.diagnostics.resumeEvents).toBe(0);
		expect(h.store.readCount).toBe(1);
		expect(h.service.diagnostics.semanticAttempts).toBe(41);
	});
	test('explicit new goal supersedes the prior goal; another initial goal cannot replace it', async () => {
		const h = await harness();
		h.updater.handler = initial;
		await h.begin('Implement a file service.');
		await h.end();
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			goal: {
				mode: 'explicit-replacement',
				text: 'Implement authentication.',
				evidence: { messageId: input.evidence[0]!.messageId, quote: input.evidence[0]!.text },
			},
		});
		await h.begin('New goal: implement authentication.');
		await h.end();
		expect(h.memory().goal?.text).toBe('Implement authentication.');
		h.updater.handler = initial;
		await h.begin('Run typecheck.');
		await h.end();
		expect(h.memory().goal?.text).toBe('Implement authentication.');
		expect(h.store.writes.at(-1)?.updater.status).toBe('failed');
	});
	test('semantic keys supersede decisions and constraints without conflicting current entries', async () => {
		const h = await harness();
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [
				change(input, 'decisions', 'database', 'Use SQLite.'),
				change(input, 'constraints', 'tui', 'Keep the TUI unchanged.'),
			],
		});
		await h.begin('Use SQLite. Keep the TUI unchanged.');
		await h.end();
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [
				change(input, 'decisions', 'database', 'Use PostgreSQL.'),
				change(input, 'constraints', 'tui', '', 'remove'),
			],
		});
		await h.begin('Replace SQLite with PostgreSQL. Remove the TUI restriction.');
		await h.end();
		expect(h.memory().decisions.map((item) => item.text)).toEqual(['Use PostgreSQL.']);
		expect(h.memory().constraints).toEqual([]);
	});
	test('completed resolves matching pending/problem and reopening removes completed', async () => {
		const h = await harness();
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [
				change(input, 'pending', 'tests', 'Run tests.'),
				change(input, 'problems', 'tests', 'Tests are blocked.'),
			],
		});
		await h.begin('Run tests; they are blocked.');
		await h.end();
		h.updater.handler = noMemoryDelta;
		await h.begin('Inspect the layout.');
		await h.end();
		expect(h.memory().problems).toHaveLength(1);
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [change(input, 'completed', 'tests', 'Tests passed.', 'upsert', 'assistant')],
		});
		await h.begin('Run tests now.');
		await h.end('Tests passed.');
		expect(h.memory().pending).toEqual([]);
		expect(h.memory().problems).toEqual([]);
		expect(h.memory().completed[0]?.basis).toBe('assistant-reported');
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [change(input, 'pending', 'tests', 'Rerun the tests.')],
		});
		await h.begin('Rerun the tests.');
		await h.end();
		expect(h.memory().completed).toEqual([]);
		expect(h.memory().pending).toHaveLength(1);
	});
	test('duplicates merge bounded provenance rather than grow', async () => {
		const h = await harness();
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [change(input, 'decisions', 'database', 'Use PostgreSQL.')],
		});
		for (let i = 0; i < 20; i++) {
			await h.begin('Use PostgreSQL.');
			await h.end();
		}
		expect(h.memory().decisions).toHaveLength(1);
		expect(h.memory().decisions[0]?.sourceMessageIds).toHaveLength(3);
	});
	test('count and total caps evict deterministically, retaining newest identities', async () => {
		const h = await harness();
		for (let i = 0; i < 30; i++) {
			h.updater.handler = (input) => ({
				...noMemoryDelta(),
				changes: [change(input, 'decisions', `choice-${i}`, `Choice ${i}.`)],
			});
			await h.begin(`Choice ${i}.`);
			await h.end();
		}
		expect(h.memory().decisions).toHaveLength(MEMORY_CAPS.decisions);
		expect(h.memory().decisions[0]?.key).toBe('choice-29');
		expect(renderSessionMemory('', h.memory()).tokens).toBeLessThanOrEqual(MEMORY_TOKEN_CAP);
	});
	for (const [name, args, output, activity] of [
		[
			'read_file',
			{ path: 'src/a.ts' },
			{
				path: 'src/a.ts',
				content: 'SECRET FILE CONTENT',
				version: 'opaque',
				startLine: 2,
				endLine: 3,
			},
			'read',
		],
		[
			'create_file',
			{ path: 'src/a.ts', content: 'SECRET FILE CONTENT' },
			{ path: 'src/a.ts', created: true },
			'created',
		],
		['edit_file', { path: 'src/a.ts', edits: [] }, { path: 'src/a.ts', changed: true }, 'modified'],
		[
			'replace_file',
			{ path: 'src/a.ts', content: 'SECRET FILE CONTENT' },
			{ path: 'src/a.ts', changed: true },
			'modified',
		],
	] as const)
		test(`${name} projects exact successful activity without contents`, async () => {
			const h = await harness();
			const user = await h.begin('Work on the file.');
			await h.tool(name, args, output);
			await h.end();
			expect(h.memory().files[0]).toMatchObject({ path: 'src/a.ts', activity });
			expect(h.memory().files[0]?.sourceMessageIds).toContain(user);
			expect(h.memory().files[0]?.sourceEventIds).toHaveLength(1);
			expect(JSON.stringify(h.store.writes)).not.toContain('SECRET FILE CONTENT');
			expect(JSON.stringify(h.updater.inputs)).not.toContain('SECRET FILE CONTENT');
		});
	test('failed edit is a problem with unknown effects; later successful matching edit resolves it', async () => {
		const h = await harness();
		await h.begin('Edit src/a.ts.');
		await h.tool('edit_file', { path: 'src/a.ts' }, undefined, true);
		await h.end('Edit failed.');
		expect(h.memory().files).toEqual([]);
		expect(h.memory().problems[0]?.text).toBe('edit_file failed; effects unknown.');
		await h.begin('Retry the edit.');
		await h.tool('edit_file', { path: 'src/a.ts' }, { path: 'src/a.ts', changed: true });
		await h.end();
		expect(h.memory().problems).toEqual([]);
		expect(h.memory().files[0]?.activity).toBe('modified');
	});
	test('move replaces tracked source with destination/from; delete is historical state', async () => {
		const h = await harness();
		await h.begin('Move then delete.');
		await h.tool('read_file', { path: 'draft.txt' }, { path: 'draft.txt', content: 'body' });
		await h.tool(
			'move_file',
			{ source: 'draft.txt', destination: 'final.txt' },
			{ source: 'draft.txt', destination: 'final.txt', moved: true },
		);
		expect(h.memory().files).toHaveLength(1);
		expect(h.memory().files[0]).toMatchObject({
			path: 'final.txt',
			from: 'draft.txt',
			activity: 'moved',
		});
		await h.tool(
			'delete_path',
			{ path: 'final.txt' },
			{ path: 'final.txt', deleted: true, type: 'file' },
		);
		await h.end();
		expect(h.memory().files[0]?.activity).toBe('deleted');
	});
	test('reads preserve earlier modification relevance; no-op changes and cache references do not claim mutations', async () => {
		const h = await harness();
		await h.begin('Read and edit.');
		await h.tool('edit_file', { path: 'a.ts' }, { path: 'a.ts', changed: true });
		await h.tool('read_file', { path: 'a.ts' }, { path: 'a.ts', content: 'new' });
		await h.tool('edit_file', { path: 'b.ts' }, { path: 'b.ts', changed: false });
		await h.tool('read_file', { path: 'c.ts' }, { cached: true, sourceToolCallId: 'missing' });
		await h.end();
		expect(h.memory().files).toHaveLength(1);
		expect(h.memory().files[0]?.activity).toBe('modified');
	});
	test('malformed/orphan/mismatched output and failed move never create successful activity', async () => {
		const h = await harness();
		await h.begin('Change files.');
		await h.append(
			toolCallCompletedEvent({
				toolName: 'create_file',
				output: { path: 'fabricated', created: true },
			}),
		);
		await h.tool('create_file', { path: 'a' }, { path: '../outside', created: true });
		await h.tool('move_file', { source: 'a', destination: 'b' }, undefined, true);
		await h.end();
		expect(h.memory().files).toEqual([]);
		expect(h.memory().problems).toHaveLength(1);
	});
	test('semantic completion cannot override an unresolved failed edit', async () => {
		const h = await harness();
		await h.begin('Edit a.ts.');
		await h.tool('edit_file', { path: 'a.ts' }, undefined, true);
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [change(input, 'completed', 'edit', 'Edit completed.', 'upsert', 'assistant')],
		});
		await h.end('Edit completed.');
		expect(h.memory().completed).toEqual([]);
		expect(h.memory().problems).toHaveLength(1);
	});
	for (const invalid of [
		'unknown',
		'foreign',
		'quote',
		'files',
		'oversized',
		'partial-delta',
		'tool-problem',
	])
		test(`rejects ${invalid} semantic output atomically`, async () => {
			const h = await harness();
			h.updater.handler = (input) => {
				const valid = change(input, 'decisions', 'database', 'Use PostgreSQL.');
				if (invalid === 'unknown') return { ...noMemoryDelta(), surprise: true };
				if (invalid === 'files')
					return { ...noMemoryDelta(), files: [{ path: 'a', activity: 'modified' }] };
				if (invalid === 'oversized')
					return { ...noMemoryDelta(), changes: [{ ...valid, text: 'x'.repeat(161) }] };
				if (invalid === 'foreign')
					return {
						...noMemoryDelta(),
						changes: [
							{
								...valid,
								evidence: { messageId: 'another-session-user', quote: input.evidence[0]!.text },
							},
						],
					};
				if (invalid === 'quote')
					return {
						...noMemoryDelta(),
						changes: [{ ...valid, evidence: { ...valid.evidence, quote: 'fabricated quote' } }],
					};
				if (invalid === 'tool-problem')
					return {
						...noMemoryDelta(),
						changes: [{ ...valid, category: 'problems', key: 'tool-fabricated' }],
					};
				return {
					...noMemoryDelta(),
					changes: [
						valid,
						{ ...valid, key: 'other', evidence: { ...valid.evidence, quote: 'fabricated quote' } },
					],
				};
			};
			await h.begin('Use PostgreSQL.');
			await h.end();
			expect(h.memory().decisions).toEqual([]);
			expect(h.store.writes.at(-1)?.updater.status).toBe('failed');
		});
	test('assistant proposal has no user acceptance or implementation evidence', async () => {
		const h = await harness();
		h.updater.handler = (input) => ({
			...noMemoryDelta(),
			changes: [change(input, 'decisions', 'database', 'Use PostgreSQL.', 'upsert', 'assistant')],
		});
		await h.begin('Discuss storage.');
		await h.end('I propose PostgreSQL.');
		expect(h.memory().decisions).toEqual([]);
	});
	test('provider failure and timeout keep deterministic effects and normal completion', async () => {
		for (const timeout of [false, true]) {
			const h = await harness(undefined, undefined, undefined, 10);
			h.updater.handler = () =>
				timeout ? new Promise(() => {}) : Promise.reject(new Error('offline'));
			await h.begin('Create a.ts.');
			await h.tool('create_file', { path: 'a.ts' }, { path: 'a.ts', created: true });
			await h.end();
			expect(h.memory().files[0]?.activity).toBe('created');
			expect(h.memory().completed).toEqual([]);
			expect(h.durable.events.at(-1)?.type).toBe('assistant.message.completed');
			expect(h.durable.events.some((event) => event.type === 'agent.error')).toBe(false);
		}
	});
	test('write failure preserves prior semantic memory and current exact effects', async () => {
		const h = await harness();
		h.updater.handler = initial;
		await h.begin('Implement a file service.');
		await h.end();
		h.store.failWrite = true;
		await h.begin('Create a.ts.');
		await h.tool('create_file', { path: 'a.ts' }, { path: 'a.ts', created: true });
		await h.end();
		expect(h.memory().goal?.text).toBe('Implement a file service.');
		expect(h.memory().files[0]?.activity).toBe('created');
		expect(h.service.diagnostics.lastFailure).toBe('memory-write-failed');
	});
	test('failed/cancelled/denied finish never invokes semantic updater', async () => {
		const h = await harness();
		const user = await h.begin('Do work.');
		await h.tool('edit_file', { path: 'a' }, undefined, true);
		await h.service.finish(sessionId, user);
		const controller = new AbortController();
		controller.abort();
		await h.service.finish(sessionId, user, 'no-final', undefined, controller.signal);
		expect(h.updater.inputs).toEqual([]);
		expect(h.memory().completed).toEqual([]);
	});
	test('agent errors remain unresolved until a subsequent completed response', async () => {
		const h = await harness();
		const user = await h.begin('Work.');
		await h.append(
			agentErrorOccurredEvent({
				error: { message: 'RAW ERROR SECRET', code: 'MODEL_STREAM_FAILED', recoverable: true },
			}),
		);
		await h.service.finish(sessionId, user);
		expect(h.memory().problems).toHaveLength(1);
		expect(JSON.stringify(h.memory())).not.toContain('RAW ERROR SECRET');
		await h.begin('Try again.');
		await h.end();
		expect(h.memory().problems).toEqual([]);
	});
	test('valid memory resumes with stable source IDs, without semantic backfill or history writes', async () => {
		const h = await harness();
		h.updater.handler = initial;
		await h.begin('Implement a file service.');
		await h.end();
		const before = structuredClone(h.durable.events);
		const resumed = await harness(h.store, new FakeMemoryUpdater(), h.durable);
		expect(resumed.memory()).toEqual(h.memory());
		expect(resumed.updater.inputs).toEqual([]);
		expect(resumed.durable.events).toEqual(before);
		expect(resumed.service.diagnostics.resumeEvents).toBe(before.length);
	});
	for (const corrupt of [
		'invalid-schema',
		'foreign-session',
		'unknown-message',
		'unknown-event',
		'changed-prefix',
		'future-revision',
		'assistant-constraint',
		'fabricated-file',
	])
		test(`restore rejects ${corrupt} provenance/state nonfatally`, async () => {
			const h = await harness();
			h.updater.handler = initial;
			await h.begin('Implement a file service.');
			await h.end();
			const document = h.store.documents.get(sessionId)!;
			if (corrupt === 'invalid-schema')
				(document as unknown as Record<string, unknown>)['version'] = 999;
			if (corrupt === 'foreign-session') document.sessionId = 'foreign';
			if (corrupt === 'unknown-message')
				document.memory.decisions[0]!.sourceMessageIds = ['foreign-user'];
			if (corrupt === 'unknown-event')
				document.memory.decisions[0]!.sourceEventIds = ['missing-event'];
			if (corrupt === 'changed-prefix')
				h.durable.events[0] = { ...h.durable.events[0]!, timestamp: 'changed' as never };
			if (corrupt === 'future-revision') document.memory.decisions[0]!.revision = 9999;
			if (corrupt === 'assistant-constraint') {
				document.memory.constraints[0]!.basis = 'assistant-reported';
				document.memory.constraints[0]!.sourceMessageIds = [
					h.durable.events.at(-1)!['messageId' as keyof AgentEvent] as string,
				];
			}
			if (corrupt === 'fabricated-file')
				document.memory.files = [
					{
						path: 'invented.ts',
						activity: 'modified',
						revision: 1,
						sourceMessageIds: document.memory.goal!.sourceMessageIds,
						sourceEventIds: [h.durable.events[0]!.id],
					},
				];
			const resumed = await harness(h.store, new FakeMemoryUpdater(), h.durable);
			expect(resumed.memory().goal).toBeNull();
			expect(resumed.memory().decisions).toEqual([]);
			expect(resumed.memory().files).toEqual([]);
		});
	test('missing/corrupt read rebuilds exact observations without inference', async () => {
		const h = await harness();
		await h.begin('Create a.ts.');
		await h.tool('create_file', { path: 'a.ts' }, { path: 'a.ts', created: true });
		await h.end();
		h.store.documents.clear();
		h.store.failRead = true;
		const resumed = await harness(h.store, new FakeMemoryUpdater(), h.durable);
		expect(resumed.memory().files[0]?.activity).toBe('created');
		expect(resumed.updater.inputs).toEqual([]);
	});
	test('source digest includes tool results, not just Phase 17 search text', async () => {
		const h = await harness();
		h.updater.handler = initial;
		await h.begin('Create a.ts.');
		await h.tool('create_file', { path: 'a.ts' }, { path: 'a.ts', created: true });
		await h.end();
		const index = h.durable.events.findIndex((event) => event.type === 'tool.call.completed');
		h.durable.events[index] = {
			...h.durable.events[index]!,
			output: { path: 'different.ts', created: true },
		} as AgentEvent;
		const resumed = await harness(h.store, new FakeMemoryUpdater(), h.durable);
		expect(resumed.memory().goal).toBeNull();
		expect(resumed.memory().files[0]?.path).toBe('different.ts');
	});
	test('duplicate identities cannot produce ambiguous memory provenance', async () => {
		const h = await harness();
		h.updater.handler = initial;
		await h.begin('Implement a file service.');
		await h.end();
		h.durable.events.push({ ...h.durable.events[0]! });
		const resumed = await harness(h.store, new FakeMemoryUpdater(), h.durable);
		expect(resumed.service.snapshot(sessionId)).toBeUndefined();
	});
	test('A→B→A selection discards late extraction, and another session cannot leak', async () => {
		const h = await harness();
		const deferred = createDeferred<unknown>();
		h.updater.handler = () => deferred.promise;
		const user = await h.begin('Implement a file service.');
		await h.append(
			assistantMessageCompletedEvent({ messageId: asMessageId('final'), content: 'Done.' }),
		);
		const finishing = h.service.finish(sessionId, user, 'final', 'test-chat');
		await Promise.resolve();
		await Promise.resolve();
		const other = asSessionId('other-session');
		await h.service.activate(other, []);
		expect(h.service.snapshot(sessionId)).toBeUndefined();
		await h.service.activate(sessionId, h.durable.events);
		deferred.resolve(
			initial({
				memory: h.memory(),
				evidence: [{ messageId: user, role: 'user', text: 'Implement a file service.' }],
				signal: new AbortController().signal,
			}),
		);
		await finishing;
		expect(h.memory().goal).toBeNull();
		expect(h.store.writes).toHaveLength(0);
	});
});
