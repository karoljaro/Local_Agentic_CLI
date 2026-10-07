import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { Box, render, renderToString, Text } from 'ink';

import type { AgentEvent } from '@/domain/AgentEvent';
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asToolCallId,
	asSessionId,
	type SessionId,
} from '@/domain/Ids';
import {
	agentErrorOccurredEvent,
	assistantMessageCompletedEvent,
	assistantToolCallsCompletedEvent,
	toolCallCompletedEvent,
	toolCallRequestedEvent,
	toolCallStartedEvent,
} from '@/test-support/AgentEventFixtures';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { SessionService } from '@/application/services/SessionService';
import { RunAgentTurn } from '@/application/use-cases/RunAgentTurn';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { createDeferred } from '@/test-support/createDeferred';
import type { PresentationRuntime, TurnDelta, TurnInput } from '../types';
import { LiveTurn } from '../chat/LiveTurn';
import { useChatSession } from './useChatSession';

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
	disposals = 0;
	createSessionId = () => asSessionId('session-1');
	getModelName = () => 'test-model';
	listModels = async () => [];
	listSessions = async () => [];
	listSessionEvents = async (id: SessionId) =>
		this.loaded.filter((event) => event.sessionId === id);
	readSessionPreviewEvents = this.listSessionEvents;
	switchModel = async (name: string) => name;
	setApprovalHandler = () => () => undefined;
	subscribeSessionEvents = (listener: (event: AgentEvent) => void) => {
		this.listeners.add(listener);
		return () => {
			if (this.listeners.delete(listener)) this.disposals++;
		};
	};
	runTurn: PresentationRuntime['runTurn'] = (input: TurnInput) => {
		const turn = new ControlledTurn();
		turn.input = input;
		this.turns.push(turn);
		return turn;
	};
	publish(event: AgentEvent): void {
		for (const listener of this.listeners) listener(event);
	}
}

type Chat = ReturnType<typeof useChatSession>;
const onModelNameChange = () => undefined;
const probe = async (runtime = new ControlledRuntime()) => {
	let latest!: Chat;
	const Probe = ({ sessionId }: { sessionId: SessionId }) => {
		latest = useChatSession({
			runtime,
			sessionId,
			modelName: 'test-model',
			onModelNameChange,
			restoreSessionModel: false,
		});
		return (
			<Box flexDirection="column">
				<Text>{latest.state.turnStatus}</Text>
				<LiveTurn
					activeTools={latest.state.activeTools}
					status={latest.state.turnStatus}
					stream={latest.stream}
				/>
			</Box>
		);
	};
	const stdout = new PassThrough();
	stdout.on('data', () => undefined);
	const stdin = new PassThrough();
	const instance = render(<Probe sessionId={asSessionId('session-1')} />, {
		stdout: stdout as unknown as NodeJS.WriteStream,
		stderr: stdout as unknown as NodeJS.WriteStream,
		stdin: stdin as unknown as NodeJS.ReadStream,
		patchConsole: false,
		exitOnCtrlC: false,
	});
	await waitFor(() => latest?.state.loadStatus === 'ready');
	return {
		runtime,
		instance,
		latest: () => latest,
		select: (id: SessionId) => instance.rerender(<Probe sessionId={id} />),
		start: async () => {
			expect(latest.runPrompt('question')).toBe(true);
			await waitFor(
				() => runtime.turns.at(-1)?.ready === true && latest.state.turnStatus === 'waiting',
			);
			return runtime.turns.at(-1)!;
		},
		live: () =>
			Bun.stripANSI(
				renderToString(
					<LiveTurn
						activeTools={latest.state.activeTools}
						status={latest.state.turnStatus}
						stream={latest.stream}
					/>,
					{ columns: 100 },
				),
			),
		cleanup: async () => {
			instance.unmount();
			for (const turn of runtime.turns) turn.finish();
			await instance.waitUntilExit();
			instance.cleanup();
			stdout.end();
			stdin.end();
		},
	};
};

const waitFor = async (condition: () => boolean): Promise<void> => {
	const deadline = Date.now() + 1000;
	while (!condition()) {
		if (Date.now() >= deadline) throw new Error('Controlled presentation condition timed out');
		await Bun.sleep(1);
	}
};

test('every model round streams visibly before final completion', async () => {
	const p = await probe();
	try {
		const turn = await p.start();
		await turn.delta('First round visible.');
		await waitFor(() => p.latest().stream.getSnapshot() === 'First round visible.');
		expect(p.latest().state.turnStatus).toBe('streaming');
		expect(p.live()).toContain('First round visible.');
		p.runtime.publish(assistantToolCallsCompletedEvent({ content: 'First round visible.' }));
		p.runtime.publish(toolCallRequestedEvent());
		p.runtime.publish(toolCallStartedEvent());
		p.runtime.publish(toolCallCompletedEvent());
		await waitFor(() => p.latest().state.turnStatus === 'waiting');
		expect(p.latest().stream.getSnapshot()).toBe('');
		await turn.delta('Second round visible before completion.');
		await waitFor(
			() => p.latest().stream.getSnapshot() === 'Second round visible before completion.',
		);
		expect({
			status: p.latest().state.turnStatus,
			bufferedText: p.latest().stream.getSnapshot(),
			liveVisible: p.live().includes('Second round visible before completion.'),
		}).toEqual({
			status: 'streaming',
			bufferedText: 'Second round visible before completion.',
			liveVisible: true,
		});
	} finally {
		await p.cleanup();
	}
});

const settle = async (instance: ReturnType<typeof render>) => {
	await Bun.sleep(10);
	await instance.waitUntilRenderFlush();
};

const finish = async (p: Awaited<ReturnType<typeof probe>>, turn: ControlledTurn) => {
	turn.finish();
	await waitFor(() => p.latest().state.turnStatus === 'idle');
};

test('durable final completion is authoritative before iterator end and termination adds no duplicate', async () => {
	const p = await probe();
	try {
		const turn = await p.start();
		await turn.delta('live text before commit');
		const event = assistantMessageCompletedEvent({ content: 'committed answer' });
		p.runtime.publish(event);
		await waitFor(() => p.latest().state.history.length === 1);
		expect(turn.ready).toBe(true);
		expect(p.latest().state.history).toEqual([
			{ id: String(event.id), kind: 'assistant', content: 'committed answer' },
		]);
		expect(p.latest().stream.flush()).toBe('');
		expect(p.live()).not.toContain('live text before commit');
		expect(p.latest().runPrompt('too early')).toBe(false);
		await finish(p, turn);
		p.runtime.publish(event);
		await settle(p.instance);
		expect(p.latest().state.history).toHaveLength(1);
	} finally {
		await p.cleanup();
	}
});

for (const content of ['', ' \n\t']) {
	test(`empty durable completion clears its round without visible history: ${JSON.stringify(content)}`, async () => {
		const p = await probe();
		try {
			const turn = await p.start();
			await turn.delta(content);
			p.runtime.publish(assistantMessageCompletedEvent({ content }));
			await settle(p.instance);
			expect(p.latest().stream.flush()).toBe('');
			expect(p.latest().state.history).toEqual([]);
			await finish(p, turn);
			expect(p.latest().state.history).toEqual([]);
		} finally {
			await p.cleanup();
		}
	});
}

test('empty deltas leave waiting intact; each of three committed rounds can stream', async () => {
	const p = await probe();
	try {
		const turn = await p.start();
		for (let round = 1; round <= 3; round++) {
			await turn.delta('');
			expect(p.latest().state.turnStatus).toBe('waiting');
			expect(p.latest().stream.getSnapshot()).toBe('');
			await turn.delta(`round ${round}`);
			await waitFor(() => p.latest().state.turnStatus === 'streaming');
			await turn.delta(' more');
			p.latest().stream.flush();
			expect(p.live()).toContain(`round ${round} more`);
			const options = { id: asEventId(`round-${round}`), content: `round ${round} more` };
			p.runtime.publish(
				round === 3
					? assistantMessageCompletedEvent(options)
					: assistantToolCallsCompletedEvent(options),
			);
			await waitFor(() => p.latest().state.turnStatus === 'waiting');
			expect(p.latest().stream.flush()).toBe('');
		}
		await finish(p, turn);
		expect(p.latest().state.history.map((entry) => entry.content)).toEqual([
			'round 1 more',
			'round 2 more',
			'round 3 more',
		]);
	} finally {
		await p.cleanup();
	}
});

for (const loaded of [false, true]) {
	test(`redelivery cannot reset a newer pending/live round (loaded=${loaded})`, async () => {
		const runtime = new ControlledRuntime();
		const events = [
			assistantToolCallsCompletedEvent({ id: asEventId('old-tool'), content: 'old tool round' }),
			assistantMessageCompletedEvent({ id: asEventId('old-final'), content: 'old final' }),
			agentErrorOccurredEvent({ id: asEventId('old-error') }),
			assistantMessageCompletedEvent({ id: asEventId('old-empty'), content: '' }),
		];
		if (loaded) runtime.loaded.push(...events);
		const p = await probe(runtime);
		try {
			const turn = await p.start();
			if (!loaded) {
				for (const event of events) runtime.publish(event);
				await settle(p.instance);
			}
			await turn.delta('newer buffered text');
			await waitFor(() => p.latest().state.turnStatus === 'streaming');
			const history = p.latest().state.history;
			for (const event of events) runtime.publish(event);
			await settle(p.instance);
			expect(p.latest().stream.flush()).toBe('newer buffered text');
			expect(p.latest().state.turnStatus).toBe('streaming');
			expect(p.latest().state.history).toEqual(history);
			expect(p.live()).toContain('newer buffered text');
		} finally {
			await p.cleanup();
		}
	});
}

test('abort after committed intermediate round preserves only current local partial and one cancellation', async () => {
	const p = await probe();
	try {
		const turn = await p.start();
		await turn.delta('committed intermediate');
		const committed = assistantToolCallsCompletedEvent({ content: 'committed intermediate' });
		p.runtime.publish(committed);
		p.runtime.publish(toolCallRequestedEvent());
		p.runtime.publish(toolCallStartedEvent());
		p.runtime.publish(toolCallCompletedEvent());
		await waitFor(() => p.latest().state.turnStatus === 'waiting');
		await turn.delta('current partial');
		p.latest().abortTurn();
		expect(turn.input.signal?.aborted).toBe(true);
		p.runtime.publish(
			agentErrorOccurredEvent({
				error: {
					message: 'model abort duplicate',
					code: 'MODEL_STREAM_FAILED',
					recoverable: true,
					details: { name: 'AbortError' },
				},
			}),
		);
		turn.fail(new DOMException('model abort duplicate', 'AbortError'));
		await waitFor(() => p.latest().state.turnStatus === 'idle');
		const history = p.latest().state.history;
		expect(history.filter((entry) => entry.kind === 'assistant')).toEqual([
			{ id: String(committed.id), kind: 'assistant', content: 'committed intermediate' },
			{
				id: expect.stringContaining('partial-assistant:'),
				kind: 'assistant',
				content: 'current partial',
			},
		]);
		expect(history.filter((entry) => entry.kind === 'cancelled')).toHaveLength(1);
		expect(history.filter((entry) => entry.kind === 'error')).toEqual([]);
		expect(history.filter((entry) => entry.kind === 'tool')).toHaveLength(1);
		expect(p.latest().stream.flush()).toBe('');
	} finally {
		await p.cleanup();
	}
});

for (const durable of [false, true]) {
	for (const aborted of [false, true]) {
		test(`non-abort failure preserves partial once and error once (durable=${durable}, aborted=${aborted})`, async () => {
			const p = await probe();
			try {
				const turn = await p.start();
				await turn.delta('uncommitted partial');
				if (aborted) p.latest().abortTurn();
				const error = new Error('actual independent failure');
				const event = agentErrorOccurredEvent({
					error: { message: error.message, recoverable: true, details: { name: error.name } },
				});
				if (durable) {
					p.runtime.publish(event);
					p.runtime.publish(event);
					await waitFor(() => p.latest().state.history.length === 2);
					expect(p.latest().state.history.map((entry) => entry.content)).toEqual([
						'uncommitted partial',
						error.message,
					]);
					expect(p.latest().stream.flush()).toBe('');
				}
				turn.fail(error);
				await waitFor(() => p.latest().state.turnStatus === 'idle');
				expect(p.latest().state.history).toEqual([
					{
						id: expect.stringContaining('partial-assistant:'),
						kind: 'assistant',
						content: 'uncommitted partial',
					},
					{
						id: durable ? String(event.id) : expect.stringContaining('turn-error:'),
						kind: 'error',
						content: error.message,
					},
				]);
				expect(p.latest().stream.flush()).toBe('');
			} finally {
				await p.cleanup();
			}
		});
	}
}

test('an AbortError without cancellation is an actual local error', async () => {
	const p = await probe();
	try {
		const turn = await p.start();
		turn.fail(new DOMException('independent operation failed', 'AbortError'));
		await waitFor(() => p.latest().state.turnStatus === 'idle');
		expect(p.latest().state.history.map((entry) => [entry.kind, entry.content])).toEqual([
			['error', 'independent operation failed'],
		]);
	} finally {
		await p.cleanup();
	}
});

test('foreign events do not consume selected IDs or affect stream, status, and transcript', async () => {
	const p = await probe();
	try {
		const turn = await p.start();
		await turn.delta('selected partial');
		await waitFor(() => p.latest().state.turnStatus === 'streaming');
		const event = assistantMessageCompletedEvent({ content: 'selected committed' });
		p.runtime.publish({ ...event, sessionId: asSessionId('foreign') });
		p.runtime.publish(agentErrorOccurredEvent({ sessionId: asSessionId('foreign') }));
		await settle(p.instance);
		expect(p.latest().stream.flush()).toBe('selected partial');
		expect(p.latest().state.turnStatus).toBe('streaming');
		expect(p.latest().state.history).toEqual([]);
		p.runtime.publish(event);
		await waitFor(() => p.latest().state.history.length === 1);
		expect(p.latest().stream.flush()).toBe('');
	} finally {
		await p.cleanup();
	}
});

for (const ending of ['completion', 'failure', 'delta'] as const) {
	test(`session switch isolates late old ${ending}, deltas, and finalizer from the new run`, async () => {
		const p = await probe();
		try {
			const old = await p.start();
			await old.delta('old partial');
			const stale = [...p.runtime.listeners][0]!;
			const oldRunPrompt = p.latest().runPrompt;
			const oldAppend = p.latest().appendSystemMessage;
			p.select(asSessionId('session-2'));
			await waitFor(
				() =>
					p.latest().state.sessionId === asSessionId('session-2') &&
					p.latest().state.loadStatus === 'ready',
			);
			expect(old.input.signal?.aborted).toBe(true);
			expect(oldRunPrompt('stale')).toBe(false);
			oldAppend('stale local entry');
			const newer = await p.start();
			await newer.delta('new session live');
			const oldEvent = assistantMessageCompletedEvent({ content: 'old completed' });
			stale(oldEvent);
			p.runtime.publish(oldEvent);
			// The stale subscription also must reject a forged new-session event.
			stale({ ...oldEvent, sessionId: asSessionId('session-2') });
			if (ending === 'completion') {
				old.finish();
			} else if (ending === 'failure') old.fail(new Error('old failure'));
			else old.emitDelta('late old delta');
			await settle(p.instance);
			expect(p.latest().stream.flush()).toBe('new session live');
			expect(p.latest().state.turnStatus).toBe('streaming');
			expect(p.latest().state.history).toEqual([]);
			p.runtime.publish({
				...oldEvent,
				sessionId: asSessionId('session-2'),
				content: 'new committed',
			});
			await waitFor(() => p.latest().state.history.length === 1);
			await finish(p, newer);
			expect(p.latest().state.history[0]?.content).toBe('new committed');
		} finally {
			await p.cleanup();
		}
	});
}

test('disposed old turn callback in the same session cannot commit/reset a newer turn', async () => {
	const p = await probe();
	try {
		const old = await p.start();
		const stale = [...p.runtime.listeners][0]!;
		p.runtime.publish(assistantMessageCompletedEvent({ content: 'old committed' }));
		await finish(p, old);
		const newer = await p.start();
		await newer.delta('new turn partial');
		const event = assistantMessageCompletedEvent({
			id: asEventId('new-commit'),
			content: 'new committed',
		});
		stale(event);
		await settle(p.instance);
		expect(p.latest().stream.flush()).toBe('new turn partial');
		expect(p.latest().state.turnStatus).toBe('streaming');
		expect(p.latest().state.history.map((entry) => entry.content)).toEqual(['old committed']);
		p.runtime.publish(event);
		await finish(p, newer);
		expect(p.latest().state.history.map((entry) => entry.content)).toEqual([
			'old committed',
			'new committed',
		]);
	} finally {
		await p.cleanup();
	}
});

test('unmount aborts work, disposes subscription/timer/listeners, and rejects late updates', async () => {
	const p = await probe();
	const turn = await p.start();
	await turn.delta('pending at unmount');
	const stale = [...p.runtime.listeners][0]!;
	const chat = p.latest();
	let notifications = 0;
	chat.stream.subscribe(() => notifications++);
	p.instance.unmount();
	const atUnmount = notifications;
	expect(turn.input.signal?.aborted).toBe(true);
	expect(p.runtime.listeners.size).toBe(0);
	expect(p.runtime.disposals).toBeGreaterThan(0);
	stale(assistantMessageCompletedEvent({ content: 'late completion' }));
	chat.appendSystemMessage('late local entry');
	turn.fail(new Error('late failure'));
	await Bun.sleep(50);
	expect(notifications).toBe(atUnmount);
	expect(chat.stream.flush()).toBe('');
	expect(p.latest().state.history).toEqual([]);
	await p.cleanup();
});

for (const aborted of [false, true]) {
	test(`final-message append failure leaves local partial and the storage error (aborted=${aborted})`, async () => {
		const entered = createDeferred<void>();
		const release = createDeferred<void>();
		const storageError = new Error('final completion storage failure');
		const store = new InMemorySessionStore();
		const append = store.appendSessionEvent.bind(store);
		store.appendSessionEvent = async (event) => {
			if (event.type === 'assistant.message.completed') {
				entered.resolve();
				await release.promise;
				throw storageError;
			}
			await append(event);
		};
		const service = new SessionService(store);
		const model = new ScriptedModel([[{ contentDelta: 'answer before failed commit' }]]);
		let index = 0;
		const loop = new RunAgentTurn({
			sessionStore: service,
			model,
			contextBuilder: new ContextBuilder({ systemPrompt: 'test' }),
			clock: { now: () => asISODateTime('2026-10-07T12:00:00Z') },
			idGenerator: {
				nextEventId: () => asEventId(`event-${index++}`),
				nextMessageId: () => asMessageId(`message-${index++}`),
				nextSessionId: () => asSessionId('session-1'),
				nextToolCallId: () => asToolCallId(`call-${index++}`),
			},
		});
		class Runtime extends ControlledRuntime {
			override runTurn = (input: TurnInput) => loop.run(input);
			override listSessionEvents = (id: SessionId) => service.activateSession(id);
			override subscribeSessionEvents = (listener: (event: AgentEvent) => void) =>
				service.subscribe(listener);
		}
		const p = await probe(new Runtime());
		try {
			expect(p.latest().runPrompt('question')).toBe(true);
			await entered.promise;
			await waitFor(() => p.latest().state.turnStatus === 'streaming');
			if (aborted) p.latest().abortTurn();
			release.resolve();
			await waitFor(() => p.latest().state.turnStatus === 'idle');
			expect(p.latest().state.history.filter((entry) => entry.kind !== 'user')).toEqual([
				{
					id: expect.stringContaining('partial-assistant:'),
					kind: 'assistant',
					content: 'answer before failed commit',
				},
				{
					id: expect.stringContaining('turn-error:'),
					kind: 'error',
					content: storageError.message,
				},
			]);
			expect(store.events.map((event) => event.type)).toEqual(['prompt.submitted']);
			expect(p.latest().stream.flush()).toBe('');
			expect(model.receivedInputs).toHaveLength(1);
		} finally {
			release.resolve();
			await p.cleanup();
		}
	});
}

test('real model failure commits agent.error once and keeps the streamed partial local', async () => {
	const store = new InMemorySessionStore();
	const service = new SessionService(store);
	let index = 0;
	const loop = new RunAgentTurn({
		sessionStore: service,
		model: new ScriptedModel([
			{
				chunks: [{ contentDelta: 'partial from real loop' }],
				error: new Error('real model failure'),
			},
		]),
		contextBuilder: new ContextBuilder({ systemPrompt: 'test' }),
		clock: { now: () => asISODateTime('2026-10-07T12:00:00Z') },
		idGenerator: {
			nextEventId: () => asEventId(`event-${index++}`),
			nextMessageId: () => asMessageId(`message-${index++}`),
			nextSessionId: () => asSessionId('session-1'),
			nextToolCallId: () => asToolCallId(`call-${index++}`),
		},
	});
	class Runtime extends ControlledRuntime {
		override runTurn = (input: TurnInput) => loop.run(input);
		override listSessionEvents = (id: SessionId) => service.activateSession(id);
		override subscribeSessionEvents = (listener: (event: AgentEvent) => void) =>
			service.subscribe(listener);
	}
	const p = await probe(new Runtime());
	try {
		expect(p.latest().runPrompt('question')).toBe(true);
		await waitFor(() => p.latest().state.history.some((entry) => entry.kind === 'error'));
		await waitFor(() => p.latest().state.turnStatus === 'idle');
		const event = store.events.find((candidate) => candidate.type === 'agent.error')!;
		expect(store.events.map((candidate) => candidate.type)).toEqual([
			'prompt.submitted',
			'agent.error',
		]);
		expect(p.latest().state.history.filter((entry) => entry.kind !== 'user')).toEqual([
			{
				id: expect.stringContaining('partial-assistant:'),
				kind: 'assistant',
				content: 'partial from real loop',
			},
			{ id: String(event.id), kind: 'error', content: 'real model failure' },
		]);
		expect(p.latest().stream.flush()).toBe('');
	} finally {
		await p.cleanup();
	}
});

test('iterator returning without durable completion preserves only a local partial', async () => {
	const p = await probe();
	try {
		const turn = await p.start();
		await turn.delta('uncommitted exceptional return');
		await finish(p, turn);
		expect(p.latest().state.history).toEqual([
			{
				id: expect.stringContaining('partial-assistant:'),
				kind: 'assistant',
				content: 'uncommitted exceptional return',
			},
		]);
		expect(p.latest().stream.flush()).toBe('');
	} finally {
		await p.cleanup();
	}
});

test('cancelled iterator returning normally still preserves one partial and cancellation', async () => {
	const p = await probe();
	try {
		const turn = await p.start();
		await turn.delta('cancelled partial');
		p.latest().abortTurn();
		await finish(p, turn);
		expect(p.latest().state.history.map((entry) => [entry.kind, entry.content])).toEqual([
			['assistant', 'cancelled partial'],
			['cancelled', 'The response was cancelled.'],
		]);
	} finally {
		await p.cleanup();
	}
});

test('old same-session finalizer after switching away and back cannot close the newer run', async () => {
	const p = await probe();
	try {
		const old = await p.start();
		const stale = [...p.runtime.listeners][0]!;
		p.select(asSessionId('session-2'));
		await waitFor(
			() =>
				p.latest().state.sessionId === asSessionId('session-2') &&
				p.latest().state.loadStatus === 'ready',
		);
		p.select(asSessionId('session-1'));
		await waitFor(
			() =>
				p.latest().state.sessionId === asSessionId('session-1') &&
				p.latest().state.loadStatus === 'ready',
		);
		const newer = await p.start();
		await newer.delta('new same-session text');
		stale(assistantMessageCompletedEvent({ content: 'stale same-session commit' }));
		old.fail(new Error('old same-session failure'));
		await settle(p.instance);
		expect(p.latest().stream.flush()).toBe('new same-session text');
		expect(p.latest().state.turnStatus).toBe('streaming');
		expect(p.latest().state.history).toEqual([]);
		expect(p.latest().runPrompt('cannot overlap')).toBe(false);
	} finally {
		await p.cleanup();
	}
});
