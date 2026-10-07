import { SessionService } from './SessionService';
import { describe, expect, test } from 'bun:test';

import type { ClockPort } from '@/application/ports/ClockPort';
import type { IdGeneratorPort } from '@/application/ports/IdGeneratorPort';
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
	asToolCallId,
	type EventId,
	type ISODateTime,
	type MessageId,
	type SessionId,
	type ToolCallId,
} from '@/domain/Ids';
import type { ToolDefinition } from '@/domain/Tool';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { RecordingToolExecutor } from '@/test-support/RecordingToolExecutor';
import { ToolRunner, type ToolRunnerDependencies } from './ToolRunner';
import type { AgentEvent } from '@/domain/AgentEvent';
import { assistantToolCallsCompletedEvent } from '@/test-support/AgentEventFixtures';
import { createDeferred } from '@/test-support/createDeferred';
import { reduceAgentState } from './SessionReducer';

class FixedClock implements ClockPort {
	now(): ISODateTime {
		return asISODateTime('2026-07-12T12:00:00.000Z');
	}
}

class RecordingIdGenerator implements IdGeneratorPort {
	toolCallCount = 0;
	private nextNumber = 1;

	nextEventId(): EventId {
		return asEventId(`event-${this.nextNumber++}`);
	}

	nextMessageId(): MessageId {
		return asMessageId(`message-${this.nextNumber++}`);
	}

	nextSessionId(): SessionId {
		return asSessionId(`session-${this.nextNumber++}`);
	}

	nextToolCallId(): ToolCallId {
		this.toolCallCount += 1;
		return asToolCallId(`tool-call-${this.nextNumber++}`);
	}
}

const searchTool: ToolDefinition = {
	name: 'search_file',
	description: 'Search files',
	deduplicate: true,
	parameters: {},
};

describe('ToolRunner', () => {
	test('prepares the complete batch before assigning tool call ids', () => {
		const idGenerator = new RecordingIdGenerator();
		const toolExecutor = new RecordingToolExecutor(
			[searchTool],
			(request) => ({ toolName: request.toolName, output: {} }),
			(request) => {
				if (
					typeof request.toolInput !== 'object' ||
					request.toolInput === null ||
					!('query' in request.toolInput) ||
					typeof request.toolInput.query !== 'string'
				) {
					throw new Error('invalid search input');
				}

				return request;
			},
		);
		const runner = new ToolRunner({
			sessionStore: new SessionService(new InMemorySessionStore()),
			clock: new FixedClock(),
			idGenerator,
			toolExecutor,
		});

		expect(() =>
			runner.prepareToolCalls([
				{ name: 'search_file', arguments: { query: 'valid' } },
				{ name: 'search_file', arguments: { query: 42 } },
			]),
		).toThrow('invalid search input');
		expect(idGenerator.toolCallCount).toBe(0);
	});

	test('scopes deduplicated results to one runner instance', async () => {
		const sessionStore = new InMemorySessionStore();
		const idGenerator = new RecordingIdGenerator();
		const toolExecutor = new RecordingToolExecutor([searchTool], (request) => ({
			toolName: request.toolName,
			output: { matches: ['result'] },
		}));
		const dependencies = {
			sessionStore: new SessionService(sessionStore),
			clock: new FixedClock(),
			idGenerator,
			toolExecutor,
		};
		const firstRunner = new ToolRunner(dependencies);
		const [firstCall, secondCall] = firstRunner.prepareToolCalls([
			{ name: 'search_file', arguments: { query: 'needle' } },
			{ name: 'search_file', arguments: { query: 'needle' } },
		]);

		if (firstCall === undefined || secondCall === undefined) {
			throw new Error('Expected prepared tool calls.');
		}

		await firstRunner.executeToolCalls(asSessionId('session-1'), [firstCall]);
		const repeated = await firstRunner.executeToolCalls(asSessionId('session-1'), [secondCall]);
		expect(toolExecutor.receivedRequests).toHaveLength(1);
		expect(repeated.toolMessages[0]?.content).toContain('"cached":true');

		const nextRunner = new ToolRunner(dependencies);
		const nextCall = nextRunner.prepareToolCalls([
			{ name: 'search_file', arguments: { query: 'needle' } },
		])[0];

		if (nextCall === undefined) {
			throw new Error('Expected a prepared tool call.');
		}

		await nextRunner.executeToolCalls(asSessionId('session-2'), [nextCall]);
		expect(toolExecutor.receivedRequests).toHaveLength(2);
	});
});

const sessionId = asSessionId('session-1');
const calls = [1, 2].map((id) => ({
	id: asToolCallId(`call-${id}`),
	name: 'mutate',
	arguments: { path: `file-${id}` },
}));

class LifecycleStore extends InMemorySessionStore {
	onAppend?: (event: AgentEvent) => void | Promise<void>;
	override async appendSessionEvent(event: AgentEvent) {
		await this.onAppend?.(event);
		await super.appendSessionEvent(event);
	}
}

const harness = (overrides: Partial<ToolRunnerDependencies> = {}, denyByDefault = false) => {
	const store = new LifecycleStore({
		events: [assistantToolCallsCompletedEvent({ toolCalls: calls })],
	});
	const executor = new RecordingToolExecutor(
		[{ name: 'mutate', description: 'Mutation', parameters: {}, requiresApproval: true }],
		(request) => ({ toolName: request.toolName, output: { changed: true } }),
	);
	let id = 0;
	const runner = new ToolRunner({
		sessionStore: new SessionService(store),
		toolExecutor: executor,
		clock: { now: () => asISODateTime('2026-10-07T12:00:00Z') },
		idGenerator: {
			nextEventId: () => asEventId(`event-${id++}`),
			nextMessageId: () => asMessageId(`message-${id++}`),
			nextSessionId: () => sessionId,
			nextToolCallId: () => asToolCallId(`call-${id++}`),
		},
		...(denyByDefault ? {} : { approveToolCall: async () => true }),
		...overrides,
	});
	return { runner, store, executor };
};

describe('ToolRunner lifecycle', () => {
	test('late approval after abort invokes the executor zero times (regression A)', async () => {
		const approval = createDeferred<boolean>();
		const waiting = createDeferred<void>();
		const controller = new AbortController();
		const { runner, store, executor } = harness({
			approveToolCall: () => {
				waiting.resolve();
				return approval.promise;
			},
		});
		const outcome = runner.executeToolCalls(sessionId, calls, { signal: controller.signal }).then(
			() => undefined,
			(error: unknown) => error,
		);
		await waiting.promise;
		controller.abort();
		approval.resolve(true);
		const error = await outcome;
		expect(executor.receivedRequests.length).toBe(0);
		expect(error).toHaveProperty('name', 'AbortError');
		expect(store.events.map((event) => event.type)).toEqual([
			'assistant.tool_calls.completed',
			'tool.call.requested',
		]);
		expect(reduceAgentState(sessionId, store.events).messages).toEqual([]);
	});

	test('successful mutation with failed completion append preserves storage cause (regression B)', async () => {
		const storageError = new Error('completion storage failed');
		let mutations = 0;
		const executor = new RecordingToolExecutor(
			[{ name: 'mutate', description: 'Mutation', parameters: {} }],
			(request) => {
				mutations++;
				return { toolName: request.toolName, output: { changed: true } };
			},
		);
		const { runner, store } = harness({ toolExecutor: executor });
		store.onAppend = (event) => {
			if (event.type === 'tool.call.completed') throw storageError;
		};
		const error = await runner.executeToolCalls(sessionId, calls).then(
			() => undefined,
			(cause: unknown) => cause,
		);
		expect(error).toBe(storageError);
		expect(mutations).toBe(1);
		expect(store.events.map((event) => event.type)).toEqual([
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.started',
		]);
		expect(reduceAgentState(sessionId, store.events).messages).toEqual([]);
	});
});

const rejection = (promise: Promise<unknown>) =>
	promise.then(
		() => undefined,
		(error: unknown) => error,
	);
const expectIncomplete = (store: InMemorySessionStore) => {
	expect(reduceAgentState(sessionId, store.events).messages).toEqual([]);
	expect(JSON.stringify(store.events)).not.toContain('signal');
};

describe('ToolRunner cancellation and failure boundaries', () => {
	test('already aborted does not request approval or start work', async () => {
		let approvals = 0;
		const { runner, store, executor } = harness({
			approveToolCall: async () => {
				approvals++;
				return true;
			},
		});
		const controller = new AbortController();
		controller.abort(new Error('arbitrary abort reason'));
		expect(
			await rejection(runner.executeToolCalls(sessionId, calls, { signal: controller.signal })),
		).toHaveProperty('name', 'AbortError');
		expect(approvals).toBe(0);
		expect(executor.receivedRequests).toHaveLength(0);
		expect(store.events).toHaveLength(1);
		expectIncomplete(store);
	});

	test('abort settles a still-pending approval and cleans its listener; late rejection is handled', async () => {
		const waiting = createDeferred<void>();
		let rejectApproval!: (error: unknown) => void;
		const pending = new Promise<boolean>((_resolve, reject) => {
			rejectApproval = reject;
		});
		const controller = new AbortController();
		const added: EventListenerOrEventListenerObject[] = [];
		const removed: EventListenerOrEventListenerObject[] = [];
		const add = controller.signal.addEventListener.bind(controller.signal);
		const remove = controller.signal.removeEventListener.bind(controller.signal);
		controller.signal.addEventListener = (
			type: string,
			listener: EventListenerOrEventListenerObject,
			options?: boolean | AddEventListenerOptions,
		) => {
			if (listener) added.push(listener);
			add(type, listener, options);
		};
		controller.signal.removeEventListener = (
			type: string,
			listener: EventListenerOrEventListenerObject,
			options?: boolean | EventListenerOptions,
		) => {
			if (listener) removed.push(listener);
			remove(type, listener, options);
		};
		const { runner, store, executor } = harness({
			approveToolCall: (_request, options) => {
				expect(options.signal).toBe(controller.signal);
				waiting.resolve();
				return pending;
			},
		});
		const outcome = rejection(
			runner.executeToolCalls(sessionId, calls, { signal: controller.signal }),
		);
		await waiting.promise;
		controller.abort();
		expect(await outcome).toHaveProperty('name', 'AbortError');
		expect(removed).toEqual(added);
		rejectApproval(new Error('late approval failure'));
		await Promise.resolve();
		expect(executor.receivedRequests).toHaveLength(0);
		expect(store.events.map((event) => event.type)).toEqual([
			'assistant.tool_calls.completed',
			'tool.call.requested',
		]);
		expectIncomplete(store);
	});

	for (const abortFirst of [true, false]) {
		test(`approval and abort in the same callback cannot execute (abort first: ${abortFirst})`, async () => {
			const controller = new AbortController();
			const approval = createDeferred<boolean>();
			const { runner, executor, store } = harness({
				approveToolCall: () => {
					if (abortFirst) controller.abort();
					approval.resolve(true);
					if (!abortFirst) controller.abort();
					return approval.promise;
				},
			});
			expect(
				await rejection(runner.executeToolCalls(sessionId, calls, { signal: controller.signal })),
			).toHaveProperty('name', 'AbortError');
			expect(executor.receivedRequests.length).toBe(0);
			expectIncomplete(store);
		});
	}

	for (const reportingFails of [false, true]) {
		test(`approval failure retains its original cause (reporting fails: ${reportingFails})`, async () => {
			const cause = new Error('approval handler failed');
			const { runner, store, executor } = harness({
				approveToolCall: async () => {
					throw cause;
				},
			});
			store.onAppend = (event) => {
				if (reportingFails && event.type === 'agent.error') throw new Error('reporting failed');
			};
			expect(await rejection(runner.executeToolCalls(sessionId, calls))).toBe(cause);
			expect(executor.receivedRequests).toHaveLength(0);
			expect(store.events.filter((event) => event.type === 'tool.call.failed')).toEqual([]);
			if (!reportingFails)
				expect(store.events.at(-1)).toMatchObject({
					type: 'agent.error',
					error: { code: 'TOOL_APPROVAL_FAILED', message: cause.message },
				});
			expectIncomplete(store);
		});
	}

	for (const handler of [undefined, async () => false]) {
		test(`explicit/default denial closes the batch without execution (default: ${handler === undefined})`, async () => {
			const { runner, store, executor } = harness(
				handler === undefined ? {} : { approveToolCall: handler },
				handler === undefined,
			);
			const result = await runner.executeToolCalls(sessionId, calls);
			expect(result.terminalMessage).toContain('not approved');
			expect(executor.receivedRequests).toHaveLength(0);
			expect(store.events.map((event) => event.type)).toEqual([
				'assistant.tool_calls.completed',
				'tool.call.requested',
				'tool.call.failed',
				'tool.call.requested',
				'tool.call.failed',
			]);
			expect(
				store.events
					.filter((event) => event.type === 'tool.call.failed')
					.map((event) => event.error.code),
			).toEqual(['TOOL_APPROVAL_DENIED', 'TOOL_BATCH_CANCELLED']);
			expect(reduceAgentState(sessionId, store.events).messages).toHaveLength(3);
		});
	}

	test('abort after started append prevents executor invocation', async () => {
		const controller = new AbortController();
		const { runner, store, executor } = harness();
		store.onAppend = (event) => {
			if (event.type === 'tool.call.started') controller.abort();
		};
		expect(
			await rejection(runner.executeToolCalls(sessionId, calls, { signal: controller.signal })),
		).toHaveProperty('name', 'AbortError');
		expect(executor.receivedRequests.length).toBe(0);
		expect(store.events.map((event) => event.type)).toEqual([
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.started',
		]);
		expectIncomplete(store);
	});

	test('abort between calls preserves the first completion and never starts the second', async () => {
		const controller = new AbortController();
		const { runner, store, executor } = harness();
		store.onAppend = (event) => {
			if (event.type === 'tool.call.completed') controller.abort();
		};
		expect(
			await rejection(runner.executeToolCalls(sessionId, calls, { signal: controller.signal })),
		).toHaveProperty('name', 'AbortError');
		expect(executor.receivedRequests).toHaveLength(1);
		expect(executor.receivedOptions[0]?.signal).toBe(controller.signal);
		expect(store.events.map((event) => event.type)).toEqual([
			'assistant.tool_calls.completed',
			'tool.call.requested',
			'tool.call.started',
			'tool.call.completed',
		]);
		expectIncomplete(store);
	});

	test('an in-flight mutation is awaited and recorded before stopping after abort', async () => {
		const started = createDeferred<void>();
		const completed = createDeferred<void>();
		const controller = new AbortController();
		const executor = new RecordingToolExecutor(
			[{ name: 'mutate', description: '', parameters: {} }],
			async (request) => {
				started.resolve();
				await completed.promise;
				return { toolName: request.toolName, output: { changed: true } };
			},
		);
		const { runner, store } = harness({ toolExecutor: executor });
		let settled = false;
		const outcome = rejection(
			runner.executeToolCalls(sessionId, calls, { signal: controller.signal }),
		).then((error) => {
			settled = true;
			return error;
		});
		await started.promise;
		controller.abort();
		await Promise.resolve();
		expect(settled).toBe(false);
		completed.resolve();
		expect(await outcome).toHaveProperty('name', 'AbortError');
		expect(executor.receivedRequests).toHaveLength(1);
		expect(store.events.at(-1)).toMatchObject({
			type: 'tool.call.completed',
			output: { changed: true },
		});
		expectIncomplete(store);
	});

	test('storage failure after successful mutation wins over pending cancellation', async () => {
		const cause = new Error('storage unavailable');
		const controller = new AbortController();
		const { runner, store, executor } = harness();
		store.onAppend = (event) => {
			if (event.type === 'tool.call.completed') {
				controller.abort();
				throw cause;
			}
		};
		expect(
			await rejection(runner.executeToolCalls(sessionId, calls, { signal: controller.signal })),
		).toBe(cause);
		expect(executor.receivedRequests).toHaveLength(1);
		expect(store.events.filter((event) => event.type === 'tool.call.failed')).toEqual([]);
		expectIncomplete(store);
	});

	for (const storageFails of [false, true]) {
		test(`actual executor failure is persisted before pending cancellation (storage fails: ${storageFails})`, async () => {
			const controller = new AbortController();
			const cause = new Error('failure persistence failed');
			const executor = new RecordingToolExecutor(
				[{ name: 'mutate', description: '', parameters: {} }],
				() => {
					controller.abort();
					throw new Error('executor failed');
				},
			);
			const { runner, store } = harness({ toolExecutor: executor });
			store.onAppend = (event) => {
				if (storageFails && event.type === 'tool.call.failed') throw cause;
			};
			const error = await rejection(
				runner.executeToolCalls(sessionId, calls, { signal: controller.signal }),
			);
			if (storageFails) expect(error).toBe(cause);
			else {
				expect(error).toHaveProperty('name', 'AbortError');
				expect(store.events.at(-1)).toMatchObject({
					type: 'tool.call.failed',
					error: { code: 'TOOL_FAILED', message: 'executor failed' },
				});
			}
			expect(executor.receivedRequests).toHaveLength(1);
			expectIncomplete(store);
		});
	}

	test('executor AbortError is propagated without TOOL_FAILED', async () => {
		const cause = new DOMException('executor cancelled', 'AbortError');
		const executor = new RecordingToolExecutor(
			[{ name: 'mutate', description: '', parameters: {} }],
			() => {
				throw cause;
			},
		);
		const { runner, store } = harness({ toolExecutor: executor });
		expect(await rejection(runner.executeToolCalls(sessionId, calls))).toBe(cause);
		expect(store.events).toHaveLength(3);
		expectIncomplete(store);
	});

	test('failure-event persistence without cancellation also retains storage cause', async () => {
		const cause = new Error('failed-event storage failed');
		const executor = new RecordingToolExecutor(
			[{ name: 'mutate', description: '', parameters: {} }],
			() => {
				throw new Error('executor failed');
			},
		);
		const { runner, store } = harness({ toolExecutor: executor });
		store.onAppend = (event) => {
			if (event.type === 'tool.call.failed') throw cause;
		};
		expect(await rejection(runner.executeToolCalls(sessionId, calls))).toBe(cause);
		expect(executor.receivedRequests).toHaveLength(1);
		expectIncomplete(store);
	});

	test('diagnostic clocks and metrics cannot change successful execution', async () => {
		const { runner, store, executor } = harness({
			monotonicClock: {
				nowMilliseconds: () => {
					throw new Error('diagnostic clock');
				},
			},
			turnMetrics: {
				recordToolExecution: () => {
					throw new Error('metric');
				},
				recordModelRequest: () => {},
				complete: () => {},
			},
		});
		const result = await runner.executeToolCalls(sessionId, calls);
		expect(executor.receivedRequests).toHaveLength(2);
		expect(result.toolMessages).toHaveLength(2);
		expect(store.events.filter((event) => event.type === 'tool.call.failed')).toEqual([]);
	});

	for (const operation of ['clock', 'id', 'serialization']) {
		test(`completion ${operation} failure is outside the execution catch`, async () => {
			const cause = new Error(`${operation} failed`);
			let succeeded = false;
			const executor = new RecordingToolExecutor(
				[{ name: 'mutate', description: '', parameters: {} }],
				(request) => {
					succeeded = true;
					return {
						toolName: request.toolName,
						output:
							operation === 'serialization'
								? {
										toJSON() {
											throw cause;
										},
									}
								: 'done',
					};
				},
			);
			const { runner, store } = harness({
				toolExecutor: executor,
				...(operation === 'clock'
					? {
							clock: {
								now: () => {
									if (succeeded) throw cause;
									return asISODateTime('2026-10-07T12:00:00Z');
								},
							},
						}
					: {}),
				...(operation === 'id'
					? {
							idGenerator: {
								nextEventId: () => {
									if (succeeded) throw cause;
									return asEventId('event');
								},
								nextMessageId: () => asMessageId('message'),
								nextSessionId: () => sessionId,
								nextToolCallId: () => asToolCallId('call'),
							},
						}
					: {}),
			});
			expect(await rejection(runner.executeToolCalls(sessionId, calls))).toBe(cause);
			expect(executor.receivedRequests).toHaveLength(1);
			expect(store.events.filter((event) => event.type === 'tool.call.failed')).toEqual([]);
			expectIncomplete(store);
		});
	}
});

test('diagnostic output sizing failure alone cannot change a successful result', async () => {
	let serializations = 0;
	let metrics = 0;
	const output = {
		toJSON: () => {
			if (serializations++ === 0) throw new Error('diagnostic sizing failed');
			return { changed: true };
		},
	};
	const executor = new RecordingToolExecutor(
		[{ name: 'mutate', description: '', parameters: {} }],
		(request) => ({ toolName: request.toolName, output }),
	);
	const { runner, store } = harness({
		toolExecutor: executor,
		turnMetrics: {
			recordToolExecution: () => {
				metrics++;
			},
			recordModelRequest: () => {},
			complete: () => {},
		},
	});
	const result = await runner.executeToolCalls(sessionId, [calls[0]!]);
	expect(result.toolMessages[0]?.content).toBe('{"changed":true}');
	expect(store.events.at(-1)).toMatchObject({ type: 'tool.call.completed' });
	expect(store.events.filter((event) => event.type === 'tool.call.failed')).toEqual([]);
	expect(metrics).toBe(0);
});
