import { describe, expect, spyOn, test } from 'bun:test';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { AgentState } from '@/domain/AgentState';
import { asEventId, asMessageId, asSessionId, asToolCallId, type SessionId } from '@/domain/Ids';
import {
	agentErrorOccurredEvent,
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
	toolCallFailedEvent,
	toolCallRequestedEvent,
	toolCallStartedEvent,
} from '@/test-support/AgentEventFixtures';
import { createDeferred } from '@/test-support/createDeferred';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { AgentStateReducer, reduceAgentState } from './SessionReducer';
import { SessionService } from './SessionService';

const sessionId = asSessionId('session-1');
const otherId = asSessionId('session-2');

class ControlledStore extends InMemorySessionStore {
	readonly reads: SessionId[] = [];
	readonly appends: AgentEvent[] = [];
	onRead: ((id: SessionId) => Promise<void>) | undefined;
	onAppend: ((event: AgentEvent) => Promise<void>) | undefined;
	override async readSessionEvents(id: SessionId) {
		this.reads.push(id);
		await this.onRead?.(id);
		return super.readSessionEvents(id);
	}
	override async appendSessionEvent(event: AgentEvent) {
		this.appends.push(event);
		await this.onAppend?.(event);
		await super.appendSessionEvent(event);
	}
}

// Inspect ownership without adding a production diagnostics API.
const memory = (service: SessionService) =>
	service as unknown as {
		selectedSessionId?: SessionId;
		selectedSession?: { events: AgentEvent[]; reducer: AgentStateReducer };
		appendTails: Map<SessionId, Promise<void>>;
	};

describe('SessionService', () => {
	test('selected and preview reads return every durable event in stored order (migrated listing)', async () => {
		const events = [
			promptSubmittedEvent(),
			toolCallCompletedEvent(),
			assistantMessageCompletedEvent(),
		];
		const service = new SessionService(new InMemorySessionStore({ events }));
		expect(await service.readPreviewEvents(sessionId)).toEqual(events);
		expect(memory(service).selectedSession).toBeUndefined();
		expect(await service.activateSession(sessionId)).toEqual(events);
		expect(await service.readSessionEvents(sessionId)).toEqual(events);
	});

	test('missing sessions return empty selected/preview arrays without creating preview state', async () => {
		const service = new SessionService(new InMemorySessionStore());
		expect(await service.listSessions()).toEqual([]);
		expect(await service.readPreviewEvents(sessionId)).toEqual([]);
		expect(memory(service).selectedSession).toBeUndefined();
		expect(await service.activateSession(sessionId)).toEqual([]);
		expect((await service.readSessionState(sessionId)).messages).toEqual([]);
	});

	test('session listing propagates the original adapter failure without activation', async () => {
		const store = new InMemorySessionStore();
		const cause = new Error('list adapter failure');
		store.listSessions = async () => {
			throw cause;
		};
		const service = new SessionService(store);
		await expect(service.listSessions()).rejects.toBe(cause);
		expect(store.readCount).toBe(0);
		expect(memory(service).selectedSession).toBeUndefined();
	});

	test('reads/reduces once and applies later appends incrementally (migrated cache)', async () => {
		const prompt = promptSubmittedEvent();
		const assistant = assistantMessageCompletedEvent();
		const store = new InMemorySessionStore({ events: [prompt] });
		const service = new SessionService(store);
		const apply = spyOn(AgentStateReducer.prototype, 'apply');
		try {
			const [events, initial] = await Promise.all([
				service.readSessionEvents(sessionId),
				service.readSessionState(sessionId),
			]);
			await service.appendSessionEvent(assistant);
			expect(store.readCount).toBe(1);
			expect(apply).toHaveBeenCalledTimes(2);
			expect(events).toEqual([prompt]);
			expect(initial.messages).toHaveLength(1);
			expect((await service.readSessionState(sessionId)).messages).toHaveLength(2);
			expect(await service.activateSession(sessionId)).toEqual([prompt, assistant]);
			expect(store.readCount).toBe(1);
		} finally {
			apply.mockRestore();
		}
	});

	test('failed append preserves memory, notification silence, and original cause (migrated cache)', async () => {
		const store = new ControlledStore();
		const service = new SessionService(store);
		const cause = new Error('storage failed', { cause: new Error('disk cause') });
		const observed: AgentEvent[] = [];
		service.subscribe((event) => {
			observed.push(event);
		});
		await service.activateSession(sessionId);
		store.onAppend = async () => {
			throw cause;
		};
		await expect(service.appendSessionEvent(promptSubmittedEvent())).rejects.toBe(cause);
		expect(store.events).toEqual([]);
		expect(await service.readSessionEvents(sessionId)).toEqual([]);
		expect((await service.readSessionState(sessionId)).messages).toEqual([]);
		expect(observed).toEqual([]);
		store.onAppend = undefined;
		const prompt = promptSubmittedEvent({ id: asEventId('success') });
		await service.appendSessionEvent(prompt);
		expect(await service.readSessionEvents(sessionId)).toEqual([prompt]);
		expect(observed).toEqual([prompt]);
		expect(memory(service).appendTails.size).toBe(0);
	});

	test('reconstructs the same state after restart (migrated cache)', async () => {
		const store = new InMemorySessionStore();
		const service = new SessionService(store);
		await service.activateSession(sessionId);
		await service.appendSessionEvent(promptSubmittedEvent());
		await service.appendSessionEvent(assistantMessageCompletedEvent());
		expect(await new SessionService(store).readSessionState(sessionId)).toEqual(
			await service.readSessionState(sessionId),
		);
		expect(store.readCount).toBe(2);
	});

	test('notifies after successful append and supports cleanup (migrated publisher)', async () => {
		const store = new InMemorySessionStore();
		const service = new SessionService(store);
		const observed: AgentEvent[] = [];
		const unsubscribe = service.subscribe((event) => {
			observed.push(event);
		});
		const first = promptSubmittedEvent();
		await service.appendSessionEvent(first);
		unsubscribe();
		await service.appendSessionEvent(promptSubmittedEvent({ sessionId: otherId }));
		expect(store.events).toHaveLength(2);
		expect(observed).toEqual([first]);
	});

	test('observer failures cannot block another observer or future commits (migrated publisher)', async () => {
		const service = new SessionService(new InMemorySessionStore());
		const observed: AgentEvent[] = [];
		service.subscribe(() => {
			throw new Error('observer failed');
		});
		service.subscribe(async () => {
			throw new Error('async observer failed');
		});
		service.subscribe((event) => {
			observed.push(event);
		});
		const first = promptSubmittedEvent();
		const second = assistantMessageCompletedEvent();
		await expect(service.appendSessionEvent(first)).resolves.toBeUndefined();
		await expect(service.appendSessionEvent(second)).resolves.toBeUndefined();
		expect(observed).toEqual([first, second]);
	});

	test('durable append precedes reduction and synchronous publication; observer reads updated state', async () => {
		const store = new ControlledStore();
		const service = new SessionService(store);
		await service.activateSession(sessionId);
		const order: string[] = [];
		const originalApply = AgentStateReducer.prototype.apply;
		const apply = spyOn(AgentStateReducer.prototype, 'apply').mockImplementation(function (
			this: AgentStateReducer,
			event,
		) {
			expect(store.events).toEqual([event]);
			order.push('reduce');
			originalApply.call(this, event);
		});
		store.onAppend = async () => {
			order.push('durable');
			expect(memory(service).selectedSession?.events).toEqual([]);
		};
		let observerState: Promise<AgentState> | undefined;
		const observerPending = createDeferred<void>();
		service.subscribe(async (event) => {
			order.push('notify');
			expect(memory(service).selectedSession?.events).toEqual([event]);
			expect(memory(service).selectedSession?.reducer.snapshot().messages).toHaveLength(1);
			observerState = service.readSessionState(sessionId);
			await observerPending.promise;
		});
		try {
			await service.appendSessionEvent(promptSubmittedEvent());
			expect(order).toEqual(['durable', 'reduce', 'notify']);
			expect((await observerState)?.messages).toEqual([
				expect.objectContaining({ role: 'user', content: 'Hello' }),
			]);
		} finally {
			observerPending.resolve();
			apply.mockRestore();
		}
	});

	test('serializes concurrent appends; state/event/preview reads wait for prior commits', async () => {
		const store = new ControlledStore();
		const service = new SessionService(store);
		await service.activateSession(sessionId);
		const entered = createDeferred<void>();
		const release = createDeferred<void>();
		const prompt = promptSubmittedEvent();
		const assistant = assistantMessageCompletedEvent();
		store.onAppend = async (event) => {
			if (event === prompt) {
				entered.resolve();
				await release.promise;
			}
		};
		const first = service.appendSessionEvent(prompt);
		const second = service.appendSessionEvent(assistant);
		const state = service.readSessionState(sessionId);
		const events = service.readSessionEvents(sessionId);
		const preview = service.readPreviewEvents(sessionId);
		let stateSettled = false;
		void state.then(() => {
			stateSettled = true;
		});
		await entered.promise;
		expect(store.appends).toEqual([prompt]);
		expect(store.events).toEqual([]);
		expect(stateSettled).toBe(false);
		release.resolve();
		await Promise.all([first, second]);
		expect(store.appends).toEqual([prompt, assistant]);
		expect((await state).messages).toHaveLength(2);
		expect(await events).toEqual([prompt, assistant]);
		expect(await preview).toEqual([prompt, assistant]);
		expect(memory(service).appendTails.size).toBe(0);
	});

	test('a failed concurrent queue entry does not poison the next queued append', async () => {
		const store = new ControlledStore();
		const service = new SessionService(store);
		await service.activateSession(sessionId);
		const entered = createDeferred<void>();
		const release = createDeferred<void>();
		const cause = new Error('disk failed');
		const failed = promptSubmittedEvent();
		const success = assistantMessageCompletedEvent();
		store.onAppend = async (event) => {
			if (event === failed) {
				entered.resolve();
				await release.promise;
				throw cause;
			}
		};
		const observed: AgentEvent[] = [];
		service.subscribe((event) => {
			observed.push(event);
		});
		const first = service.appendSessionEvent(failed);
		const rejected = first.catch((error) => error);
		const second = service.appendSessionEvent(success);
		await entered.promise;
		release.resolve();
		expect(await rejected).toBe(cause);
		await second;
		expect(store.events).toEqual([success]);
		expect(await service.readSessionEvents(sessionId)).toEqual([success]);
		expect((await service.readSessionState(sessionId)).messages).toHaveLength(1);
		expect(observed).toEqual([success]);
		expect(memory(service).appendTails.size).toBe(0);
	});

	test('coalesces concurrent activation/state/event reads into one durable load and replay', async () => {
		const prompt = promptSubmittedEvent();
		const store = new ControlledStore({ events: [prompt] });
		const service = new SessionService(store);
		const entered = createDeferred<void>();
		const release = createDeferred<void>();
		store.onRead = async () => {
			entered.resolve();
			await release.promise;
		};
		const apply = spyOn(AgentStateReducer.prototype, 'apply');
		try {
			const reads = Promise.all([
				service.activateSession(sessionId),
				service.readSessionState(sessionId),
				service.readSessionEvents(sessionId),
				service.activateSession(sessionId),
			]);
			await entered.promise;
			expect(store.reads).toEqual([sessionId]);
			release.resolve();
			const [events, state] = await reads;
			expect(events).toEqual([prompt]);
			expect(state.messages).toHaveLength(1);
			expect(store.readCount).toBe(1);
			expect(apply).toHaveBeenCalledTimes(1);
		} finally {
			release.resolve();
			apply.mockRestore();
		}
	});

	test('durable load failure evicts invalid memory and permits a clean retry', async () => {
		const store = new ControlledStore({ events: [promptSubmittedEvent()] });
		const service = new SessionService(store);
		const cause = new Error('read failed');
		store.onRead = async () => {
			throw cause;
		};
		await expect(service.activateSession(sessionId)).rejects.toBe(cause);
		expect(memory(service).selectedSession).toBeUndefined();
		store.onRead = undefined;
		expect((await service.readSessionState(sessionId)).messages).toHaveLength(1);
		expect(store.reads).toEqual([sessionId, sessionId]);
	});

	test('initial reduction failure retains no invalid reducer and permits retry', async () => {
		const store = new InMemorySessionStore({ events: [promptSubmittedEvent()] });
		const service = new SessionService(store);
		const cause = new Error('replay failed');
		const apply = spyOn(AgentStateReducer.prototype, 'apply').mockImplementation(() => {
			throw cause;
		});
		try {
			await expect(service.readSessionState(sessionId)).rejects.toBe(cause);
			expect(memory(service).selectedSession).toBeUndefined();
		} finally {
			apply.mockRestore();
		}
		expect((await service.readSessionState(sessionId)).messages).toHaveLength(1);
		expect(store.readCount).toBe(2);
	});

	test('post-append reduction failure surfaces once, suppresses publication, and reloads authority', async () => {
		const store = new ControlledStore({ events: [promptSubmittedEvent()] });
		const service = new SessionService(store);
		await service.activateSession(sessionId);
		const cause = new Error('incremental reduction failed');
		const assistant = assistantMessageCompletedEvent();
		const observed: AgentEvent[] = [];
		service.subscribe((event) => {
			observed.push(event);
		});
		const originalApply = AgentStateReducer.prototype.apply;
		const apply = spyOn(AgentStateReducer.prototype, 'apply').mockImplementation(function (
			this: AgentStateReducer,
			event,
		) {
			originalApply.call(this, event); // Even partial mutation must be discarded.
			throw cause;
		});
		try {
			await expect(service.appendSessionEvent(assistant)).rejects.toBe(cause);
			expect(store.appends).toEqual([assistant]);
			expect(store.events).toEqual([promptSubmittedEvent(), assistant]);
			expect(observed).toEqual([]);
			expect(memory(service).selectedSession).toBeUndefined();
		} finally {
			apply.mockRestore();
		}
		const next = promptSubmittedEvent({
			id: asEventId('next'),
			messageId: asMessageId('next-message'),
		});
		await service.appendSessionEvent(next); // Reload before the next append, without retrying assistant.
		expect(store.appends).toEqual([assistant, next]);
		expect(observed).toEqual([next]);
		expect(await service.readSessionState(sessionId)).toEqual(
			reduceAgentState(sessionId, store.events),
		);
		expect(store.readCount).toBe(2);
		expect(memory(service).appendTails.size).toBe(0);
	});

	test('many previews retain no reducers and leave the selected state unchanged', async () => {
		const sessions = Array.from({ length: 100 }, (_, i) => asSessionId(`preview-${i}`));
		const store = new InMemorySessionStore({
			events: [
				promptSubmittedEvent(),
				...sessions.map((id) => promptSubmittedEvent({ sessionId: id })),
			],
		});
		const service = new SessionService(store);
		const apply = spyOn(AgentStateReducer.prototype, 'apply');
		try {
			await Promise.all(sessions.map((id) => service.readPreviewEvents(id)));
			expect(apply).toHaveBeenCalledTimes(0);
			expect(memory(service).selectedSession).toBeUndefined();
			await service.activateSession(sessionId);
			const selected = memory(service).selectedSession;
			await Promise.all(sessions.map((id) => service.readPreviewEvents(id)));
			expect(apply).toHaveBeenCalledTimes(1);
			expect(memory(service).selectedSession).toBe(selected);
			expect(memory(service).selectedSessionId).toBe(sessionId);
			expect(memory(service).appendTails.size).toBe(0);
			expect((await service.readSessionState(sessionId)).messages).toHaveLength(1);
		} finally {
			apply.mockRestore();
		}
	});

	test('selection evicts the previous cache, reuses current state, and reloads an evicted session', async () => {
		const store = new ControlledStore({
			events: [promptSubmittedEvent(), promptSubmittedEvent({ sessionId: otherId })],
		});
		const service = new SessionService(store);
		await service.activateSession(sessionId);
		const first = memory(service).selectedSession;
		await service.activateSession(sessionId);
		await service.appendSessionEvent(assistantMessageCompletedEvent());
		expect(memory(service).selectedSession).toBe(first);
		await service.activateSession(otherId);
		expect(memory(service).selectedSession).not.toBe(first);
		await service.activateSession(sessionId);
		expect(memory(service).selectedSession).not.toBe(first);
		expect(store.reads).toEqual([sessionId, otherId, sessionId]);
		for (let i = 0; i < 50; i++) {
			const id = asSessionId(`selection-${i}`);
			await service.activateSession(id);
			expect(memory(service).selectedSessionId).toBe(id);
			expect(memory(service).selectedSession?.events).toEqual([]);
			expect(memory(service).appendTails.size).toBe(0);
		}
	});

	test('selection waits for queued appends and reduction/publication before eviction', async () => {
		const store = new ControlledStore();
		const service = new SessionService(store);
		await service.activateSession(sessionId);
		const selected = memory(service).selectedSession;
		const entered = createDeferred<void>();
		const release = createDeferred<void>();
		store.onAppend = async () => {
			entered.resolve();
			await release.promise;
		};
		const observed: AgentState[] = [];
		service.subscribe(() => {
			expect(memory(service).selectedSession).toBe(selected);
			observed.push(selected!.reducer.snapshot());
		});
		const first = service.appendSessionEvent(promptSubmittedEvent());
		const second = service.appendSessionEvent(assistantMessageCompletedEvent());
		const switching = service.activateSession(otherId);
		await entered.promise;
		expect(memory(service).selectedSession).toBe(selected);
		expect(store.reads).toEqual([sessionId]);
		release.resolve();
		await Promise.all([first, second, switching]);
		expect(observed.map((state) => state.messages.length)).toEqual([1, 2]);
		expect(memory(service).selectedSessionId).toBe(otherId);
		expect(memory(service).selectedSession).not.toBe(selected);
		expect((await service.readSessionState(sessionId)).messages).toHaveLength(2);
	});

	test('concurrent selections cannot race independent caches into memory', async () => {
		const store = new ControlledStore();
		const service = new SessionService(store);
		const entered = createDeferred<void>();
		const release = createDeferred<void>();
		store.onRead = async (id) => {
			if (id === sessionId) {
				entered.resolve();
				await release.promise;
			}
		};
		const first = service.activateSession(sessionId);
		const second = service.activateSession(otherId);
		const third = service.readSessionState(otherId);
		await entered.promise;
		expect(store.reads).toEqual([sessionId]);
		release.resolve();
		await Promise.all([first, second, third]);
		expect(store.reads).toEqual([sessionId, otherId]);
		expect(memory(service).selectedSessionId).toBe(otherId);
	});

	test('appending to an unselected session does not retain or steal selected state', async () => {
		const service = new SessionService(new InMemorySessionStore());
		await service.activateSession(sessionId);
		const selected = memory(service).selectedSession;
		await service.appendSessionEvent(promptSubmittedEvent({ sessionId: otherId }));
		expect(memory(service).selectedSession).toBe(selected);
		expect(memory(service).selectedSessionId).toBe(sessionId);
		expect(await service.readPreviewEvents(otherId)).toHaveLength(1);
		expect((await service.readSessionState(otherId)).messages).toHaveLength(1);
	});

	test('filters foreign events before selected replay and preview, preserving stored order', async () => {
		const events = [
			promptSubmittedEvent({ sessionId: otherId }),
			toolCallCompletedEvent(),
			agentErrorOccurredEvent(),
		];
		const store = new InMemorySessionStore({ events });
		store.readSessionEvents = async () => [...events]; // Deliberately unsafe adapter.
		const service = new SessionService(store);
		expect(await service.readPreviewEvents(sessionId)).toEqual(events.slice(1));
		expect(await service.activateSession(sessionId)).toEqual(events.slice(1));
		expect(await service.readSessionEvents(sessionId)).toEqual(events.slice(1));
		expect(await service.readSessionState(sessionId)).toEqual(
			reduceAgentState(sessionId, events.slice(1)),
		);
	});

	test('preview preserves adapter failures and does not invalidate selected state', async () => {
		const store = new ControlledStore();
		const service = new SessionService(store);
		await service.activateSession(sessionId);
		const selected = memory(service).selectedSession;
		const cause = new Error('preview read failed');
		store.onRead = async () => {
			throw cause;
		};
		await expect(service.readPreviewEvents(otherId)).rejects.toBe(cause);
		expect(memory(service).selectedSession).toBe(selected);
	});

	test('a failed selection drops the old cache and a later activation reloads cleanly', async () => {
		const store = new ControlledStore({ events: [promptSubmittedEvent()] });
		const service = new SessionService(store);
		await service.activateSession(sessionId);
		const cause = new Error('new selection read failed');
		store.onRead = async (id) => {
			if (id === otherId) throw cause;
		};
		await expect(service.activateSession(otherId)).rejects.toBe(cause);
		expect(memory(service).selectedSession).toBeUndefined();
		expect(await service.activateSession(sessionId)).toEqual([promptSubmittedEvent()]);
		expect(store.reads).toEqual([sessionId, otherId, sessionId]);
	});

	test('selection can proceed after a failed queued append without retaining its failed state', async () => {
		const store = new ControlledStore();
		const service = new SessionService(store);
		await service.activateSession(sessionId);
		const cause = new Error('failed previous write');
		store.onAppend = async () => {
			throw cause;
		};
		const failure = service.appendSessionEvent(promptSubmittedEvent()).catch((error) => error);
		const switching = service.activateSession(otherId);
		expect(await failure).toBe(cause);
		expect(await switching).toEqual([]);
		expect(memory(service).selectedSessionId).toBe(otherId);
		expect(memory(service).selectedSession?.reducer.snapshot().messages).toEqual([]);
		expect(memory(service).appendTails.size).toBe(0);
	});

	test('delegates durable session listing without activation', async () => {
		const sessions = [{ sessionId }, { sessionId: otherId }];
		const store = new InMemorySessionStore({ sessions });
		const service = new SessionService(store);
		expect(await service.listSessions()).toEqual(sessions);
		expect(store.readCount).toBe(0);
		expect(memory(service).selectedSession).toBeUndefined();
	});

	test('event/state snapshots cannot change retained array membership', async () => {
		const service = new SessionService(
			new InMemorySessionStore({ events: [promptSubmittedEvent()] }),
		);
		const events = await service.activateSession(sessionId);
		const state = await service.readSessionState(sessionId);
		events.length = 0;
		state.messages.length = 0;
		expect(await service.readSessionEvents(sessionId)).toHaveLength(1);
		expect((await service.readSessionState(sessionId)).messages).toHaveLength(1);
	});

	test('real JSONL restart preserves legacy replay, orphan results, atomic batches, and interrupted prefixes', async () => {
		const { directory, cleanup } = await createTempDirectory('session-service-');
		try {
			const store = new JsonlSessionStore(directory);
			const service = new SessionService(store);
			await service.activateSession(sessionId);
			const legacy = asToolCallId('legacy');
			const orphan = asToolCallId('orphan');
			const first = asToolCallId('batch-1');
			const second = asToolCallId('batch-2');
			const prefix = [
				promptSubmittedEvent(),
				toolCallRequestedEvent({ toolCallId: legacy }),
				toolCallCompletedEvent({ toolCallId: legacy }),
				toolCallCompletedEvent({ toolCallId: orphan }),
				assistantToolCallsCompletedEvent({
					toolCalls: [
						{ id: first, name: 'read_file', arguments: { path: 'first' } },
						{ id: second, name: 'read_file', arguments: { path: 'second' } },
					],
				}),
				toolCallRequestedEvent({ toolCallId: first }),
				toolCallStartedEvent({ toolCallId: first }),
				toolCallCompletedEvent({ toolCallId: second, output: 'second result' }),
			];
			for (const event of prefix) await service.appendSessionEvent(event);
			const incomplete = await service.readSessionState(sessionId);
			expect(incomplete.messages.map((message) => message.role)).toEqual([
				'user',
				'assistant',
				'tool',
				'tool',
			]);
			expect(
				await new SessionService(new JsonlSessionStore(directory)).readSessionState(sessionId),
			).toEqual(incomplete);
			await service.appendSessionEvent(toolCallFailedEvent({ toolCallId: first }));
			const completed = await service.readSessionState(sessionId);
			expect(
				completed.messages
					.slice(-2)
					.map((message) => (message.role === 'tool' ? message.toolCallId : undefined)),
			).toEqual([first, second]);
			expect(
				await new SessionService(new JsonlSessionStore(directory)).readSessionState(sessionId),
			).toEqual(completed);
			expect(completed).toEqual(
				reduceAgentState(sessionId, await store.readSessionEvents(sessionId)),
			);
		} finally {
			await cleanup();
		}
	});
});
