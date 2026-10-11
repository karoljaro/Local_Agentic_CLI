import { expect, test, spyOn } from 'bun:test';
import type { MemoryUpdateInput } from '@/application/ports/SessionMemoryUpdaterPort';
import type { SessionMemoryDocument } from '@/domain/SessionMemory';
import { asEventId, asMessageId, asSessionId } from '@/domain/Ids';
import {
	assistantMessageCompletedEvent,
	promptSubmittedEvent,
} from '@/test-support/AgentEventFixtures';
import { createDeferred } from '@/test-support/createDeferred';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import {
	FakeMemoryStore,
	FakeMemoryUpdater,
	noMemoryDelta,
} from '@/test-support/SessionMemoryFixtures';
import { SessionMemoryService } from './SessionMemoryService';
import { SessionService } from './SessionService';

const sessionId = asSessionId('opportunistic-memory');
const goal = (input: MemoryUpdateInput, text = input.evidence[0]!.text) => ({
	version: 1,
	goal: {
		mode: 'initial',
		text,
		evidence: { messageId: input.evidence[0]!.messageId, quote: input.evidence[0]!.text },
	},
	changes: [],
});
const setup = async () => {
	const durable = new InMemorySessionStore();
	const sessions = new SessionService(durable);
	const store = new FakeMemoryStore();
	const updater = new FakeMemoryUpdater();
	const memory = new SessionMemoryService(sessions, store, updater);
	await memory.activate(sessionId, await sessions.activateSession(sessionId));
	let index = 0;
	const completed = async (prompt: string) => {
		const userId = asMessageId(`user-${++index}`);
		const finalId = asMessageId(`final-${index}`);
		await sessions.appendSessionEvent(
			promptSubmittedEvent({
				sessionId,
				id: asEventId(`prompt-${index}`),
				messageId: userId,
				prompt,
			}),
		);
		await sessions.appendSessionEvent(
			assistantMessageCompletedEvent({
				sessionId,
				id: asEventId(`answer-${index}`),
				messageId: finalId,
				content: 'Accepted.',
			}),
		);
		return { userId, finalId };
	};
	const schedule = (
		{ userId, finalId }: Awaited<ReturnType<typeof completed>>,
		model = 'test-chat',
		signal?: AbortSignal,
	) => {
		memory.schedule(sessionId, userId, finalId, model, signal);
		return memory.whenIdle();
	};
	return { durable, sessions, store, updater, memory, completed, schedule };
};
const deferredUpdater = (updater: FakeMemoryUpdater) => {
	const result = createDeferred<unknown>();
	const started = createDeferred<MemoryUpdateInput>();
	updater.handler = (input) => {
		started.resolve(input);
		return result.promise;
	};
	return { result, started };
};

test('idle scheduled maintenance publishes a valid exact prefix and canonical history stays unchanged', async () => {
	const h = await setup();
	const d = deferredUpdater(h.updater);
	const turn = await h.completed('Build a file service.');
	const before = structuredClone(h.durable.events);
	const idle = h.schedule(turn);
	const input = await d.started.promise;
	expect(h.store.writes).toHaveLength(0);
	d.result.resolve(goal(input));
	await idle;
	expect(h.memory.snapshot(sessionId)?.goal?.text).toBe('Build a file service.');
	expect(h.store.writes[0]).toMatchObject({
		sessionId,
		source: { eventCount: 2, lastEventId: 'answer-1' },
		updater: { model: 'test-chat', status: 'updated' },
	});
	expect(h.durable.events).toEqual(before);
	h.memory.dispose();
});

test('scheduling twice before dispatch collapses obsolete work to one extraction', async () => {
	const h = await setup();
	h.updater.handler = goal;
	const turn = await h.completed('Objective.');
	const first = h.schedule(turn);
	const last = h.schedule(turn);
	await Promise.all([first, last]);
	expect(h.updater.inputs).toHaveLength(1);
	expect(h.store.writes).toHaveLength(1);
	h.memory.dispose();
});

test('the scheduling owner observes a rejected maintenance promise without a chat error', async () => {
	const h = await setup();
	const failure = spyOn(h.memory, 'finish').mockRejectedValue(new Error('owner failure'));
	try {
		h.schedule(await h.completed('Objective.'));
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(h.memory.diagnostics.lastFailure).toBe('memory-maintenance-failed');
		expect(h.durable.events.at(-1)?.type).toBe('assistant.message.completed');
	} finally {
		failure.mockRestore();
		h.memory.dispose();
	}
});

test('scheduled evidence and prefix cannot change when later input arrives; cancelled late result never publishes', async () => {
	const h = await setup();
	const d = deferredUpdater(h.updater);
	const idle = h.schedule(await h.completed('First exact objective.'));
	const input = await d.started.promise;
	const evidence = structuredClone(input.evidence);
	await h.completed('New exact objective.');
	expect(input.signal.aborted).toBe(true);
	expect(input.evidence).toEqual(evidence);
	await idle; // Cancellation settles ownership without waiting for the ignoring updater.
	d.result.resolve(goal(input));
	await d.result.promise;
	expect(h.store.writes).toHaveLength(0);
	expect(h.memory.snapshot(sessionId)?.goal).toBeNull();
	h.memory.dispose();
});

test('uncooperative cancelled updater suppresses later inference without an accumulating queue', async () => {
	const h = await setup();
	const d = deferredUpdater(h.updater);
	const old = h.schedule(await h.completed('First objective.'));
	const input = await d.started.promise;
	h.memory.cancelPending();
	await old;
	for (let i = 0; i < 12; i++) await h.schedule(await h.completed(`New objective ${i}.`));
	expect(h.updater.inputs).toHaveLength(1);
	expect(h.store.documents.get(sessionId)?.source.eventCount).toBe(26);
	d.result.resolve(goal(input));
	await d.result.promise;
	h.updater.handler = goal;
	await h.schedule(await h.completed('Newest objective.'));
	expect(h.updater.inputs).toHaveLength(2);
	expect(h.memory.snapshot(sessionId)?.goal?.text).toBe('Newest objective.');
	expect(h.store.documents.get(sessionId)?.source.eventCount).toBe(28);
	h.memory.dispose();
});

test('newer successful publication wins after old provider ignores abort and settles late', async () => {
	const h = await setup();
	const d = deferredUpdater(h.updater);
	const old = h.schedule(await h.completed('Old objective.'));
	const input = await d.started.promise;
	const latest = await h.completed('New objective.');
	await old;
	d.result.resolve(goal(input));
	await d.result.promise;
	h.updater.handler = goal;
	await h.schedule(latest);
	expect(h.store.writes).toHaveLength(1);
	expect(h.store.documents.get(sessionId)?.memory.goal?.text).toBe('New objective.');
	expect(h.memory.snapshot(sessionId)?.goal?.sourceMessageIds).toEqual([latest.userId]);
	h.memory.dispose();
});

test('session A→B→A fences late work even when the exact A prefix is restored', async () => {
	const h = await setup();
	const d = deferredUpdater(h.updater);
	const old = h.schedule(await h.completed('Session A objective.'));
	const input = await d.started.promise;
	const other = asSessionId('session-b');
	h.memory.selectSession(other);
	expect(input.signal.aborted).toBe(true);
	await h.memory.activate(other, await h.sessions.activateSession(other));
	expect(h.memory.snapshot(other)?.goal).toBeNull();
	await h.memory.activate(sessionId, await h.sessions.activateSession(sessionId));
	d.result.resolve(goal(input));
	await old;
	expect(h.store.writes).toHaveLength(0);
	expect(h.memory.snapshot(sessionId)?.goal).toBeNull();
	h.memory.dispose();
});

test('model-change cancellation fences an unchanged prefix without attributing A output to B', async () => {
	const h = await setup();
	const d = deferredUpdater(h.updater);
	const old = h.schedule(await h.completed('Old model objective.'), 'model-a');
	const input = await d.started.promise;
	h.memory.cancelPending(); // Composition does this before unchanged ModelSelection.switchModel.
	await old;
	d.result.resolve(goal(input));
	await d.result.promise;
	expect(h.store.writes).toHaveLength(0);
	h.updater.handler = goal;
	await h.schedule(await h.completed('Model B objective.'), 'model-b');
	expect(h.store.documents.get(sessionId)?.updater.model).toBe('model-b');
	h.memory.dispose();
});

test('detached provider rejection after cancellation is observed and never becomes an unhandled error', async () => {
	const h = await setup();
	const rejection = createDeferred<Error>();
	const started = createDeferred<void>();
	h.updater.handler = async () => {
		started.resolve();
		throw await rejection.promise;
	};
	const unhandled: unknown[] = [];
	const observe = (error: unknown) => {
		unhandled.push(error);
	};
	process.on('unhandledRejection', observe);
	try {
		const idle = h.schedule(await h.completed('Objective.'));
		await started.promise;
		h.memory.cancelPending();
		await idle;
		rejection.resolve(new Error('late provider rejection'));
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(unhandled).toEqual([]);
		expect(h.store.writes).toHaveLength(0);
		expect(h.durable.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.message.completed',
		]);
	} finally {
		h.memory.dispose();
		process.off('unhandledRejection', observe);
	}
});

test('the unchanged 10000 ms deadline expires nonfatally after release with no real-clock delay', async () => {
	const h = await setup();
	const deadline = new AbortController();
	const timeout = AbortSignal.timeout;
	const bound = spyOn(AbortSignal, 'timeout').mockImplementation((ms) =>
		ms === 10000 ? deadline.signal : timeout(ms),
	);
	try {
		const d = deferredUpdater(h.updater);
		const idle = h.schedule(await h.completed('Objective.'));
		const input = await d.started.promise;
		expect(bound.mock.calls.some(([ms]) => ms === 10000)).toBe(true);
		deadline.abort(new DOMException('deadline', 'TimeoutError'));
		await idle;
		expect(input.signal.aborted).toBe(true);
		expect(h.store.documents.get(sessionId)?.updater.status).toBe('failed');
		expect(h.memory.snapshot(sessionId)?.goal).toBeNull();
		expect(h.durable.events.at(-1)?.type).toBe('assistant.message.completed');
		d.result.resolve(noMemoryDelta());
	} finally {
		bound.mockRestore();
		h.memory.dispose();
	}
});

test('host validation rejects the entire scheduled delta, including an earlier valid goal', async () => {
	const h = await setup();
	h.updater.handler = (input) => ({
		...goal(input),
		changes: [
			{
				operation: 'upsert',
				category: 'decisions',
				key: 'invented',
				text: 'Invented.',
				evidence: { messageId: input.evidence[0]!.messageId, quote: 'not present' },
			},
		],
	});
	await h.schedule(await h.completed('Valid objective.'));
	expect(h.memory.snapshot(sessionId)?.goal).toBeNull();
	expect(h.store.documents.get(sessionId)?.memory.decisions).toEqual([]);
	expect(h.store.documents.get(sessionId)?.updater.status).toBe('failed');
	h.memory.dispose();
});

test('updater mutation of its input cannot forge host evidence or mutate projected state', async () => {
	const h = await setup();
	h.updater.handler = (input) => {
		input.evidence[0]!.text = 'forged evidence';
		return goal(input);
	};
	await h.schedule(await h.completed('Exact durable objective.'));
	expect(h.memory.snapshot(sessionId)?.goal).toBeNull();
	expect(h.store.documents.get(sessionId)?.updater.status).toBe('failed');
	expect(h.durable.events[0]).toMatchObject({ prompt: 'Exact durable objective.' });
	h.memory.dispose();
});

test('cancellation during publication prevents in-memory replacement and partial publication', async () => {
	const h = await setup();
	h.updater.handler = goal;
	const writing = createDeferred<AbortSignal>();
	const release = createDeferred<void>();
	h.store.write = async (document, signal?: AbortSignal) => {
		writing.resolve(signal!);
		await release.promise;
		if (signal?.aborted) return;
		h.store.writes.push(structuredClone(document));
	};
	const idle = h.schedule(await h.completed('Objective.'));
	const signal = await writing.promise;
	h.memory.cancelPending();
	await idle;
	expect(signal.aborted).toBe(true);
	release.resolve();
	await release.promise;
	expect(h.store.writes).toHaveLength(0);
	expect(h.memory.snapshot(sessionId)?.goal).toBeNull();
	h.memory.dispose();
});

test('an unabortable older atomic write cannot overtake a newer valid publication', async () => {
	const h = await setup();
	h.updater.handler = goal;
	const writing = createDeferred<void>();
	const release = createDeferred<void>();
	const documents: SessionMemoryDocument[] = [];
	h.store.write = async (document) => {
		if (documents.length === 0) {
			writing.resolve();
			await release.promise;
		}
		documents.push(structuredClone(document));
		h.store.documents.set(sessionId, structuredClone(document));
	};
	const old = h.schedule(await h.completed('Old objective.'));
	await writing.promise;
	const latest = h.schedule(await h.completed('New objective.'));
	await old;
	expect(h.memory.snapshot(sessionId)?.goal).toBeNull();
	release.resolve();
	await latest;
	expect(documents.map((document) => document.source.eventCount)).toEqual([2, 4]);
	expect(h.memory.snapshot(sessionId)?.goal?.text).toBe('New objective.');
	expect(h.store.documents.get(sessionId)?.memory.goal?.text).toBe('New objective.');
	h.memory.dispose();
});

test('disposal aborts and unsubscribes optional work immediately without awaiting an ignoring provider', async () => {
	const h = await setup();
	const d = deferredUpdater(h.updater);
	const idle = h.schedule(await h.completed('Objective.'));
	const input = await d.started.promise;
	h.memory.dispose();
	expect(input.signal.aborted).toBe(true);
	await idle;
	const observed = h.memory.diagnostics.observedEvents;
	await h.completed('After disposal.');
	expect(h.memory.diagnostics.observedEvents).toBe(observed);
	d.result.resolve(goal(input));
	await d.result.promise;
	expect(h.store.writes).toHaveLength(0);
	expect(h.memory.snapshot(sessionId)).toBeUndefined();
});
