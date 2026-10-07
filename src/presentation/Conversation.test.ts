import { expect, test } from 'bun:test';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { SessionService } from '@/application/services/SessionService';
import { throwIfAborted } from '@/application/services/cancellation';
import { RunAgentTurn, type ToolApprovalHandler } from '@/application/use-cases/RunAgentTurn';
import type { ModelPort } from '@/application/ports/ModelPort';
import type { ToolExecutorPort } from '@/application/ports/ToolExecutorPort';
import type { AgentEvent } from '@/domain/AgentEvent';
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
	asToolCallId,
	type SessionId,
} from '@/domain/Ids';
import { createDeferred } from '@/test-support/createDeferred';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { RecordingToolExecutor } from '@/test-support/RecordingToolExecutor';
import {
	agentErrorOccurredEvent,
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	promptSubmittedEvent,
	toolCallCompletedEvent,
	toolCallRequestedEvent,
	toolCallStartedEvent,
} from '@/test-support/AgentEventFixtures';
import { Conversation, type ConversationChange } from './Conversation';
import type { PresentationRuntime, TurnDelta, TurnInput } from './types';

class ControlledTurn implements AsyncIterableIterator<TurnDelta> {
	input!: TurnInput;
	private pending = createDeferred<IteratorResult<TurnDelta> | { error: unknown }>();
	ready = false;
	[Symbol.asyncIterator]() {
		return this;
	}
	next(): Promise<IteratorResult<TurnDelta>> {
		this.ready = true;
		return this.pending.promise.then((result) => {
			if ('error' in result) throw result.error;
			return result;
		});
	}
	async delta(contentDelta: string): Promise<void> {
		await waitFor(() => this.ready);
		this.ready = false;
		this.emitDelta(contentDelta);
		await waitFor(() => this.ready);
	}
	emitDelta(contentDelta: string): void {
		const pending = this.pending;
		this.pending = createDeferred<IteratorResult<TurnDelta> | { error: unknown }>();
		pending.resolve({ value: { contentDelta }, done: false });
	}
	finish(): void {
		this.pending.resolve({ value: undefined, done: true });
	}
	fail(error: unknown): void {
		this.pending.resolve({ error });
	}
}

class ControlledRuntime implements PresentationRuntime {
	readonly workspacePath = '/workspace';
	readonly turns: ControlledTurn[] = [];
	readonly listeners = new Set<(event: AgentEvent) => void>();
	readonly loaded: AgentEvent[] = [];
	readonly switches: string[] = [];
	model = 'test-model';
	disposals = 0;
	createSessionId = () => asSessionId('session-1');
	getModelName = () => this.model;
	listModels = async () => [];
	listSessions = async () => [];
	listSessionEvents = async (id: SessionId) =>
		this.loaded.filter((event) => event.sessionId === id);
	readSessionPreviewEvents = this.listSessionEvents;
	switchModel = async (name: string, signal?: AbortSignal) => {
		throwIfAborted(signal);
		this.switches.push(name);
		this.model = name;
		return name;
	};
	setApprovalHandler: PresentationRuntime['setApprovalHandler'] = () => () => undefined;
	subscribeSessionEvents = (listener: (event: AgentEvent) => void) => {
		this.listeners.add(listener);
		return () => {
			if (this.listeners.delete(listener)) this.disposals++;
		};
	};
	runTurn: PresentationRuntime['runTurn'] = (input) => {
		const turn = new ControlledTurn();
		turn.input = input;
		this.turns.push(turn);
		return turn;
	};
	publish(event: AgentEvent): void {
		for (const listener of this.listeners) listener(event);
	}
}

const waitFor = async (condition: () => boolean): Promise<void> => {
	const deadline = Date.now() + 2000;
	while (!condition()) {
		if (Date.now() >= deadline) throw new Error('Controlled conversation condition timed out');
		await Bun.sleep(1);
	}
};

const setup = async (runtime = new ControlledRuntime()) => {
	const changes: ConversationChange[] = [];
	const conversation = new Conversation(runtime, (change) => changes.push(change));
	await conversation.initialize();
	return {
		conversation,
		runtime,
		changes,
		start: async () => {
			expect(conversation.submit('question')).toBe(true);
			await waitFor(() => runtime.turns.at(-1)?.ready === true);
			return runtime.turns.at(-1)!;
		},
		cleanup: async () => {
			const closing = conversation.dispose();
			for (const turn of runtime.turns) turn.finish();
			await closing;
		},
	};
};

test('submission locks immediately and uses the selected runtime model and session', async () => {
	const p = await setup();
	try {
		expect(p.conversation.submit(' ')).toBe(false);
		const turn = await p.start();
		expect(p.conversation.submit('duplicate')).toBe(false);
		expect(p.runtime.turns).toHaveLength(1);
		expect(turn.input).toMatchObject({
			sessionId: asSessionId('session-1'),
			modelName: 'test-model',
			prompt: 'question',
		});
		expect(turn.input.signal).toBeInstanceOf(AbortSignal);
	} finally {
		await p.cleanup();
	}
});

test('every model round streams before completion and raw deltas leave committed history untouched', async () => {
	const p = await setup();
	try {
		const turn = await p.start();
		const history = p.conversation.history;
		const initialChanges = p.changes.length;
		await turn.delta('First round visible.');
		await waitFor(() => p.conversation.liveContent === 'First round visible.');
		expect(p.conversation.history).toBe(history);
		expect(p.changes.slice(initialChanges).map((change) => change.type)).toEqual(['live']);
		p.runtime.publish(assistantToolCallsCompletedEvent({ content: 'First round visible.' }));
		p.runtime.publish(toolCallRequestedEvent());
		p.runtime.publish(toolCallStartedEvent());
		p.runtime.publish(toolCallCompletedEvent());
		expect(p.conversation.liveContent).toBe('');
		await turn.delta('Second round visible.');
		await waitFor(() => p.conversation.liveContent === 'Second round visible.');
		expect(p.conversation.running).toBe(true);
		p.runtime.publish(
			assistantToolCallsCompletedEvent({
				id: asEventId('round-2'),
				content: 'Second round visible.',
			}),
		);
		await turn.delta('Third round visible.');
		await waitFor(() => p.conversation.liveContent === 'Third round visible.');
		expect(p.conversation.history.map((entry) => entry.content)).toEqual([
			'First round visible.',
			'Read file · README.md',
			'Second round visible.',
		]);
	} finally {
		await p.cleanup();
	}
});

test('durable completion is authoritative before iterator end and produces no duplicate', async () => {
	const p = await setup();
	try {
		const turn = await p.start();
		await turn.delta('draft');
		const event = assistantMessageCompletedEvent({ content: 'authoritative completion' });
		p.runtime.publish(event);
		expect(p.conversation.history).toEqual([
			{ id: String(event.id), kind: 'assistant', content: 'authoritative completion' },
		]);
		expect(p.conversation.liveContent).toBe('');
		expect(p.conversation.running).toBe(true);
		expect(p.conversation.submit('early')).toBe(false);
		p.runtime.publish(event);
		turn.finish();
		await waitFor(() => !p.conversation.running);
		expect(p.conversation.history).toHaveLength(1);
	} finally {
		await p.cleanup();
	}
});

for (const content of ['', ' \n\t']) {
	test(`empty durable completion clears live output without manufacturing history: ${JSON.stringify(content)}`, async () => {
		const p = await setup();
		try {
			const turn = await p.start();
			await turn.delta('temporary draft');
			p.runtime.publish(assistantMessageCompletedEvent({ content }));
			turn.finish();
			await waitFor(() => !p.conversation.running);
			expect(p.conversation.history).toEqual([]);
			expect(p.conversation.liveContent).toBe('');
		} finally {
			await p.cleanup();
		}
	});
}

for (const loaded of [false, true]) {
	test(`redelivery cannot reset a newer pending/live round (loaded=${loaded})`, async () => {
		const runtime = new ControlledRuntime();
		const old = assistantToolCallsCompletedEvent({ content: 'old round' });
		if (loaded) runtime.loaded.push(old);
		const p = await setup(runtime);
		try {
			const turn = await p.start();
			if (!loaded) runtime.publish(old);
			await turn.delta('new pending round');
			runtime.publish(old);
			await waitFor(() => p.conversation.liveContent === 'new pending round');
			runtime.publish(old);
			expect(p.conversation.liveContent).toBe('new pending round');
			expect(p.conversation.history.map((entry) => entry.content)).toEqual(['old round']);
		} finally {
			await p.cleanup();
		}
	});
}

test('empty deltas do not notify and exceptional normal return preserves only a local partial', async () => {
	const p = await setup();
	try {
		const turn = await p.start();
		const before = p.changes.length;
		await turn.delta('');
		expect(p.changes).toHaveLength(before);
		await turn.delta('uncommitted partial');
		turn.finish();
		await waitFor(() => !p.conversation.running);
		expect(p.conversation.history).toHaveLength(1);
		expect(p.conversation.history[0]).toMatchObject({
			kind: 'assistant',
			content: 'uncommitted partial',
		});
		expect(p.conversation.history[0]?.id).toStartWith('partial:');
	} finally {
		await p.cleanup();
	}
});

for (const ending of ['throw', 'return'] as const) {
	test(`abort preserves committed rounds and only the current local partial once (${ending})`, async () => {
		const p = await setup();
		try {
			const turn = await p.start();
			await turn.delta('committed');
			p.runtime.publish(assistantToolCallsCompletedEvent({ content: 'committed' }));
			await turn.delta('partial');
			p.conversation.cancel();
			p.runtime.publish(
				agentErrorOccurredEvent({
					error: {
						message: 'legacy abort report',
						code: 'MODEL_STREAM_FAILED',
						recoverable: true,
						details: { name: 'AbortError' },
					},
				}),
			);
			if (ending === 'throw') turn.fail(new DOMException('aborted', 'AbortError'));
			else turn.finish();
			await waitFor(() => !p.conversation.running);
			expect(p.conversation.history.map((entry) => [entry.kind, entry.content])).toEqual([
				['assistant', 'committed'],
				['assistant', 'partial'],
				['cancelled', 'The response was cancelled.'],
			]);
			expect(p.conversation.liveContent).toBe('');
		} finally {
			await p.cleanup();
		}
	});
}

for (const durable of [false, true]) {
	for (const aborted of [false, true]) {
		test(`independent failure preserves partial and actual error once (durable=${durable}, aborted=${aborted})`, async () => {
			const p = await setup();
			try {
				const turn = await p.start();
				await turn.delta('partial');
				if (aborted) p.conversation.cancel();
				if (durable)
					p.runtime.publish(
						agentErrorOccurredEvent({ error: { message: 'actual failure', recoverable: true } }),
					);
				turn.fail(new Error('actual failure'));
				await waitFor(() => !p.conversation.running);
				expect(p.conversation.history.map((entry) => [entry.kind, entry.content])).toEqual([
					['assistant', 'partial'],
					['error', 'actual failure'],
				]);
				expect(p.conversation.liveContent).toBe('');
			} finally {
				await p.cleanup();
			}
		});
	}
}

test('AbortError without an aborted turn is a truthful error', async () => {
	const p = await setup();
	try {
		const turn = await p.start();
		turn.fail(new DOMException('independent abort-like failure', 'AbortError'));
		await waitFor(() => !p.conversation.running);
		expect(p.conversation.history.map((entry) => entry.kind)).toEqual(['error']);
	} finally {
		await p.cleanup();
	}
});

test('foreign IDs do not consume selected event identity or reset a live round', async () => {
	const p = await setup();
	try {
		const turn = await p.start();
		await turn.delta('live');
		const selected = assistantMessageCompletedEvent({ content: 'selected' });
		p.runtime.publish({ ...selected, sessionId: asSessionId('foreign') });
		await waitFor(() => p.conversation.liveContent === 'live');
		expect(p.conversation.history).toEqual([]);
		p.runtime.publish(selected);
		expect(p.conversation.history.map((entry) => entry.content)).toEqual(['selected']);
		expect(p.conversation.liveContent).toBe('');
	} finally {
		await p.cleanup();
	}
});

for (const ending of ['finish', 'failure'] as const) {
	test(`session changes isolate old deltas, disposed event callbacks and ${ending}`, async () => {
		const p = await setup();
		try {
			const old = await p.start();
			const oldCallback = [...p.runtime.listeners][0]!;
			await old.delta('old partial');
			await p.conversation.selectSession(asSessionId('session-2'), false);
			expect(old.input.signal?.aborted).toBe(true);
			const newer = await p.start();
			await newer.delta('new live');
			oldCallback(assistantMessageCompletedEvent({ content: 'stale callback' }));
			old.emitDelta('late delta');
			if (ending === 'failure') old.fail(new Error('late failure'));
			else old.finish();
			await waitFor(() => p.conversation.liveContent === 'new live');
			expect(p.conversation.history).toEqual([]);
			expect(p.conversation.running).toBe(true);
			expect(p.runtime.listeners.size).toBe(1);
		} finally {
			await p.cleanup();
		}
	});
}

test('switching away and back fences old same-session callbacks and finalizers', async () => {
	const p = await setup();
	try {
		const old = await p.start();
		const oldCallback = [...p.runtime.listeners][0]!;
		await p.conversation.selectSession(asSessionId('session-2'), false);
		await p.conversation.selectSession(asSessionId('session-1'), false);
		const newer = await p.start();
		await newer.delta('new live');
		oldCallback(assistantMessageCompletedEvent({ content: 'stale same-session callback' }));
		old.finish();
		await waitFor(() => p.conversation.liveContent === 'new live');
		expect(p.conversation.running).toBe(true);
		expect(p.conversation.history).toEqual([]);
	} finally {
		await p.cleanup();
	}
});

test('completed turn callbacks cannot commit or reset the next turn', async () => {
	const p = await setup();
	try {
		const old = await p.start();
		const oldCallback = [...p.runtime.listeners][0]!;
		old.finish();
		await waitFor(() => !p.conversation.running);
		const newer = await p.start();
		await newer.delta('new live');
		oldCallback(assistantMessageCompletedEvent({ content: 'old callback' }));
		await waitFor(() => p.conversation.liveContent === 'new live');
		expect(p.conversation.history).toEqual([]);
	} finally {
		await p.cleanup();
	}
});

test('dispose aborts, detaches and stops buffer notifications before waiting for active work', async () => {
	const p = await setup();
	const turn = await p.start();
	await turn.delta('pending content');
	const callback = [...p.runtime.listeners][0]!;
	const count = p.changes.length;
	let completed = false;
	const closing = p.conversation.dispose().then(() => {
		completed = true;
	});
	expect(turn.input.signal?.aborted).toBe(true);
	expect(p.runtime.listeners.size).toBe(0);
	expect(p.conversation.liveContent).toBe('');
	await Bun.sleep(40);
	expect(p.changes).toHaveLength(count);
	expect(completed).toBe(false);
	callback(assistantMessageCompletedEvent({ content: 'late' }));
	p.conversation.appendNotice('late local notice');
	turn.fail(new Error('late failure'));
	await closing;
	expect(p.conversation.history).toEqual([]);
	expect(p.conversation.submit('late prompt')).toBe(false);
	await p.conversation.dispose();
});

test('stale session load cannot replace current durable history', async () => {
	const runtime = new ControlledRuntime();
	const old = createDeferred<AgentEvent[]>();
	runtime.listSessionEvents = async (id) =>
		id === asSessionId('session-1')
			? old.promise
			: [promptSubmittedEvent({ sessionId: id, prompt: 'new loaded' })];
	const conversation = new Conversation(runtime, () => undefined);
	try {
		const loading = conversation.initialize();
		expect(conversation.submit('too early')).toBe(false);
		await conversation.selectSession(asSessionId('session-2'), false);
		old.resolve([promptSubmittedEvent({ prompt: 'old loaded' })]);
		await loading;
		expect(conversation.history.map((entry) => entry.content)).toEqual(['new loaded']);
		expect(conversation.loading).toBe(false);
	} finally {
		old.resolve([]);
		await conversation.dispose();
	}
});

test('resume replays durable history, clears incomplete activity and restores latest model once', async () => {
	const runtime = new ControlledRuntime();
	runtime.loaded.push(
		promptSubmittedEvent({ modelName: 'saved-model' }),
		assistantMessageCompletedEvent({ content: 'saved answer' }),
		toolCallRequestedEvent(),
		toolCallStartedEvent(),
	);
	const conversation = new Conversation(runtime, () => undefined);
	try {
		await conversation.initialize(undefined, true);
		expect(conversation.history.map((entry) => entry.content)).toEqual(['Hello', 'saved answer']);
		expect(conversation.activeTools).toEqual([]);
		expect(conversation.modelName).toBe('saved-model');
		expect(runtime.switches).toEqual(['saved-model']);
		runtime.publish(assistantMessageCompletedEvent({ content: 'redelivered' }));
		expect(conversation.history).toHaveLength(2);
	} finally {
		await conversation.dispose();
	}
});

test('model restoration failure preserves previous model and the resumed durable history', async () => {
	const runtime = new ControlledRuntime();
	runtime.loaded.push(promptSubmittedEvent({ modelName: 'saved-model' }));
	runtime.switchModel = async (name) => {
		runtime.switches.push(name);
		throw new Error('unload failed');
	};
	const conversation = new Conversation(runtime, () => undefined);
	try {
		await conversation.initialize(undefined, true);
		expect(conversation.modelName).toBe('test-model');
		expect(conversation.history.map((entry) => [entry.kind, entry.content])).toEqual([
			['user', 'Hello'],
			['error', 'unload failed'],
		]);
		expect(runtime.switches).toEqual(['saved-model']);
		expect(conversation.loading).toBe(false);
	} finally {
		await conversation.dispose();
	}
});

test('model switch awaits runtime, updates metadata once and uses the returned model for prompts', async () => {
	const p = await setup();
	const entered = createDeferred<void>();
	const release = createDeferred<void>();
	p.runtime.switchModel = async (name, signal) => {
		entered.resolve();
		await release.promise;
		throwIfAborted(signal);
		p.runtime.model = name;
		return name;
	};
	try {
		const switched = p.conversation.switchModel('other-model');
		await entered.promise;
		expect(p.conversation.modelName).toBe('test-model');
		release.resolve();
		expect(await switched).toBe(true);
		expect(p.conversation.modelName).toBe('other-model');
		const turn = await p.start();
		expect(turn.input.modelName).toBe('other-model');
		expect(p.conversation.history.map((entry) => entry.content)).toEqual([
			'Model switched to other-model.',
		]);
	} finally {
		release.resolve();
		await p.cleanup();
	}
});

test('model switch failure preserves previous model and records the actual runtime error', async () => {
	const p = await setup();
	p.runtime.switchModel = async () => {
		throw new Error('actual unload failure');
	};
	try {
		expect(await p.conversation.switchModel('other-model')).toBe(false);
		expect(p.conversation.modelName).toBe('test-model');
		expect(p.conversation.history.map((entry) => [entry.kind, entry.content])).toEqual([
			['error', 'actual unload failure'],
		]);
	} finally {
		await p.cleanup();
	}
});

test('resume ignores a foreign latest model as well as foreign durable messages', async () => {
	const runtime = new ControlledRuntime();
	runtime.listSessionEvents = async () => [
		promptSubmittedEvent({ modelName: 'saved-model' }),
		promptSubmittedEvent({
			id: asEventId('foreign-prompt'),
			sessionId: asSessionId('foreign'),
			modelName: 'foreign-model',
			prompt: 'foreign',
		}),
	];
	const conversation = new Conversation(runtime, () => undefined);
	try {
		await conversation.initialize(undefined, true);
		expect(runtime.switches).toEqual(['saved-model']);
		expect(conversation.history.map((entry) => entry.content)).toEqual(['Hello']);
	} finally {
		await conversation.dispose();
	}
});

test('dispose awaits a pending session load and prevents late loaded output', async () => {
	const runtime = new ControlledRuntime();
	const release = createDeferred<AgentEvent[]>();
	runtime.listSessionEvents = async () => release.promise;
	const changes: ConversationChange[] = [];
	const conversation = new Conversation(runtime, (change) => changes.push(change));
	const loading = conversation.initialize();
	const count = changes.length;
	let complete = false;
	const closing = conversation.dispose().then(() => {
		complete = true;
	});
	await Promise.resolve();
	expect(complete).toBe(false);
	release.resolve([promptSubmittedEvent()]);
	await Promise.all([loading, closing]);
	expect(changes).toHaveLength(count);
	expect(conversation.history).toEqual([]);
	expect(runtime.listeners.size).toBe(0);
});

for (const restoring of [false, true]) {
	test(`dispose aborts and awaits an in-flight model operation (restoring=${restoring})`, async () => {
		const runtime = new ControlledRuntime();
		const entered = createDeferred<void>();
		const release = createDeferred<void>();
		let signal: AbortSignal | undefined;
		runtime.switchModel = async (_name, providedSignal) => {
			signal = providedSignal;
			entered.resolve();
			await release.promise;
			throwIfAborted(providedSignal);
			return 'unused';
		};
		if (restoring) runtime.loaded.push(promptSubmittedEvent({ modelName: 'saved-model' }));
		const conversation = new Conversation(runtime, () => undefined);
		const loading = conversation.initialize(undefined, restoring);
		if (!restoring) await loading;
		const switching = restoring ? loading : conversation.switchModel('other-model');
		await entered.promise;
		let complete = false;
		const closing = conversation.dispose().then(() => {
			complete = true;
		});
		expect(signal?.aborted).toBe(true);
		await Promise.resolve();
		expect(complete).toBe(false);
		release.resolve();
		await Promise.all([switching, closing]);
		expect(conversation.modelName).toBe('test-model');
		expect(
			conversation.history.filter((entry) => entry.kind === 'error' || entry.kind === 'notice'),
		).toEqual([]);
	});
}

test('session selection aborts an old model switch without appending its outcome to new history', async () => {
	const p = await setup();
	const entered = createDeferred<void>();
	const release = createDeferred<void>();
	let signal: AbortSignal | undefined;
	p.runtime.switchModel = async (_name, providedSignal) => {
		signal = providedSignal;
		entered.resolve();
		await release.promise;
		throwIfAborted(providedSignal);
		return 'unused';
	};
	try {
		const switching = p.conversation.switchModel('other-model');
		await entered.promise;
		await p.conversation.selectSession(asSessionId('session-2'), false);
		expect(signal?.aborted).toBe(true);
		release.resolve();
		expect(await switching).toBe(false);
		expect(p.conversation.history).toEqual([]);
	} finally {
		release.resolve();
		await p.cleanup();
	}
});

const realRuntime = (
	model: ModelPort,
	store = new InMemorySessionStore(),
	toolExecutor?: ToolExecutorPort,
) => {
	const service = new SessionService(store);
	let approval: ToolApprovalHandler = async () => false;
	let id = 0;
	const loop = new RunAgentTurn({
		sessionStore: service,
		model,
		contextBuilder: new ContextBuilder({ systemPrompt: 'test', maxContextCharacters: 120_000 }),
		clock: { now: () => asISODateTime('2026-10-07T12:00:00Z') },
		idGenerator: {
			nextEventId: () => asEventId(`event-${id++}`),
			nextMessageId: () => asMessageId(`message-${id++}`),
			nextToolCallId: () => asToolCallId(`call-${id++}`),
			nextSessionId: () => asSessionId('session-1'),
		},
		...(toolExecutor ? { toolExecutor } : {}),
		approveToolCall: (request, options) => approval(request, options),
	});
	const runtime: PresentationRuntime = {
		createSessionId: () => asSessionId('session-1'),
		getModelName: () => 'test-model',
		workspacePath: '/workspace',
		listModels: async () => [],
		listSessions: () => service.listSessions(),
		listSessionEvents: (sessionId) => service.activateSession(sessionId),
		readSessionPreviewEvents: (sessionId) => service.readPreviewEvents(sessionId),
		switchModel: async (name) => name,
		runTurn: (input) => loop.run(input),
		subscribeSessionEvents: (listener) => service.subscribe(listener),
		setApprovalHandler: (handler) => {
			approval = handler;
			return () => {
				approval = async () => false;
			};
		},
	};
	return { runtime, service, store };
};

for (const aborted of [false, true]) {
	test(`real final-message append failure keeps local partial and original storage error (aborted=${aborted})`, async () => {
		const store = new InMemorySessionStore();
		const entered = createDeferred<void>();
		const release = createDeferred<void>();
		const append = store.appendSessionEvent.bind(store);
		store.appendSessionEvent = async (event) => {
			if (event.type === 'assistant.message.completed') {
				entered.resolve();
				await release.promise;
				throw new Error('final append failed');
			}
			await append(event);
		};
		const { runtime } = realRuntime(
			new ScriptedModel([[{ contentDelta: 'model partial' }]]),
			store,
		);
		const conversation = new Conversation(runtime, () => undefined);
		try {
			await conversation.initialize();
			expect(conversation.submit('prompt')).toBe(true);
			await entered.promise;
			if (aborted) conversation.cancel();
			release.resolve();
			await waitFor(() => !conversation.running);
			expect(conversation.history.map((entry) => [entry.kind, entry.content])).toEqual([
				['user', 'prompt'],
				['assistant', 'model partial'],
				['error', 'final append failed'],
			]);
			expect(store.events.map((event) => event.type)).toEqual(['prompt.submitted']);
		} finally {
			release.resolve();
			await conversation.dispose();
		}
	});
}

test('real model failure commits one durable error and preserves streamed partial locally', async () => {
	const { runtime, store } = realRuntime(
		new ScriptedModel([
			{ chunks: [{ contentDelta: 'model partial' }], error: new Error('model failed') },
		]),
	);
	const conversation = new Conversation(runtime, () => undefined);
	try {
		await conversation.initialize();
		conversation.submit('prompt');
		await waitFor(() => !conversation.running);
		expect(conversation.history.map((entry) => [entry.kind, entry.content])).toEqual([
			['user', 'prompt'],
			['assistant', 'model partial'],
			['error', 'model failed'],
		]);
		expect(store.events.map((event) => event.type)).toEqual(['prompt.submitted', 'agent.error']);
		expect(conversation.history[1]?.id).toStartWith('partial:');
		expect(conversation.history[2]?.id).toBe(String(store.events[1]!.id));
	} finally {
		await conversation.dispose();
	}
});

test('real pending approval cancellation cannot execute after a late allow', async () => {
	const executor = new RecordingToolExecutor(
		[{ name: 'mutate', description: 'change file', parameters: {}, requiresApproval: true }],
		() => ({ toolName: 'mutate', output: { changed: true } }),
	);
	const model = new ScriptedModel([
		[{ contentDelta: '', toolCalls: [{ name: 'mutate', arguments: {} }] }],
	]);
	const { runtime, store } = realRuntime(model, new InMemorySessionStore(), executor);
	const entered = createDeferred<void>();
	const release = createDeferred<boolean>();
	const unregister = runtime.setApprovalHandler(async () => {
		entered.resolve();
		return release.promise;
	});
	const conversation = new Conversation(runtime, () => undefined);
	try {
		await conversation.initialize();
		conversation.submit('change file');
		await entered.promise;
		conversation.cancel();
		release.resolve(true);
		await waitFor(() => !conversation.running);
		expect(executor.receivedRequests).toHaveLength(0);
		expect(store.events.map((event) => event.type)).toEqual([
			'prompt.submitted',
			'assistant.tool_calls.completed',
			'tool.call.requested',
		]);
		expect(conversation.history.at(-1)?.kind).toBe('cancelled');
		expect(conversation.activeTools).toEqual([]);
	} finally {
		release.resolve(false);
		unregister();
		await conversation.dispose();
	}
});

test('real mutation completion storage failure remains truthful with cancellation pending', async () => {
	const executor = new RecordingToolExecutor(
		[{ name: 'mutate', description: 'change file', parameters: {} }],
		() => ({ toolName: 'mutate', output: { changed: true } }),
	);
	const model = new ScriptedModel([
		[
			{
				contentDelta: '',
				toolCalls: [
					{ name: 'mutate', arguments: {} },
					{ name: 'mutate', arguments: {} },
				],
			},
		],
	]);
	const store = new InMemorySessionStore();
	const entered = createDeferred<void>();
	const release = createDeferred<void>();
	const append = store.appendSessionEvent.bind(store);
	store.appendSessionEvent = async (event) => {
		if (event.type === 'tool.call.completed') {
			entered.resolve();
			await release.promise;
			throw new Error('actual storage error after mutation');
		}
		await append(event);
	};
	const { runtime } = realRuntime(model, store, executor);
	const unregister = runtime.setApprovalHandler(async () => true);
	const conversation = new Conversation(runtime, () => undefined);
	try {
		await conversation.initialize();
		conversation.submit('change file');
		await entered.promise;
		conversation.cancel();
		release.resolve();
		await waitFor(() => !conversation.running);
		expect(executor.receivedRequests).toHaveLength(1);
		expect(conversation.history.at(-1)).toMatchObject({
			kind: 'error',
			content: 'actual storage error after mutation',
		});
		expect(
			conversation.history.filter((entry) => entry.kind === 'cancelled' || entry.kind === 'tool'),
		).toEqual([]);
		expect(conversation.activeTools).toEqual([]);
	} finally {
		release.resolve();
		unregister();
		await conversation.dispose();
	}
});
