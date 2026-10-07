import { usePresentation } from './hooks/usePresentation';
import type { StoredSession } from '@/application/ports/SessionStorePort';
import {
	assistantMessageCompletedEvent,
	promptSubmittedEvent,
} from '@/test-support/AgentEventFixtures';
import { throwIfAborted } from '@/application/services/cancellation';
import {
	RunAgentTurn,
	type ToolApprovalHandler,
	type ToolApprovalRequest,
} from '@/application/use-cases/RunAgentTurn';
import type { AgentEvent } from '@/domain/AgentEvent';
import { createDeferred } from '@/test-support/createDeferred';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { ScriptedModel } from '@/test-support/ScriptedModel';
import { RecordingToolExecutor } from '@/test-support/RecordingToolExecutor';
import { SessionService } from '@/application/services/SessionService';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { render, renderToString, Text } from 'ink';

import { App } from '@/App';
import type { PresentationRuntime, TurnDelta, TurnInput } from './types';
import {
	asSessionId,
	asToolCallId,
	asISODateTime,
	asEventId,
	asMessageId,
	type SessionId,
} from '@/domain/Ids';

class FakePresentationRuntime implements PresentationRuntime {
	readonly workspacePath = '/workspace';
	activeModelName = 'current-model';
	readonly listeners = new Set<(event: AgentEvent) => void>();
	private completionIndex = 0;

	protected commitAnswer(input: TurnInput, content: string): void {
		const event = assistantMessageCompletedEvent({
			sessionId: input.sessionId,
			id: asEventId(`fake-completion-${this.completionIndex++}`),
			content,
		});
		for (const listener of this.listeners) listener(event);
	}

	createSessionId() {
		return asSessionId('session-1');
	}

	getModelName(): string {
		return this.activeModelName;
	}

	async listModels() {
		return [{ name: 'current-model' }, { name: 'other-model' }];
	}

	async listSessionEvents(_sessionId: SessionId): Promise<AgentEvent[]> {
		return [];
	}

	async readSessionPreviewEvents(_sessionId: SessionId): Promise<AgentEvent[]> {
		return [];
	}

	async listSessions(): Promise<StoredSession[]> {
		return [];
	}

	async *runTurn(input: TurnInput): AsyncIterable<TurnDelta> {
		yield { contentDelta: 'answer' };
		this.commitAnswer(input, 'answer');
	}

	setApprovalHandler(_handler: ToolApprovalHandler): () => void {
		return () => undefined;
	}

	subscribeSessionEvents(listener: (event: AgentEvent) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async switchModel(modelName: string) {
		this.activeModelName = modelName;
		return modelName;
	}
}

class AbortablePresentationRuntime extends FakePresentationRuntime {
	turnSignal: AbortSignal | null = null;
	wasAborted = false;

	override async *runTurn(input: TurnInput): AsyncIterable<TurnDelta> {
		this.turnSignal = input.signal ?? null;
		const signal = input.signal!;
		yield { contentDelta: 'partial answer' };
		await new Promise<void>((_resolve, reject) => {
			const rejectAsAborted = () => {
				this.wasAborted = true;
				reject(new DOMException('The operation was aborted.', 'AbortError'));
			};
			if (signal.aborted) {
				rejectAsAborted();
				return;
			}
			signal.addEventListener('abort', rejectAsAborted, { once: true });
		});
	}
}

describe('App interaction', () => {
	test('resume browsing uses previews; selecting a session activates it and restores history', async () => {
		const savedId = asSessionId('saved-session');
		class ResumeRuntime extends FakePresentationRuntime {
			readonly service = new SessionService(
				new InMemorySessionStore({
					events: [
						promptSubmittedEvent({
							sessionId: savedId,
							prompt: 'Saved conversation',
							modelName: 'saved-model',
						}),
					],
					sessions: [{ sessionId: savedId }],
				}),
			);
			readonly activations: SessionId[] = [];
			readonly previews: SessionId[] = [];
			readonly switches: string[] = [];
			override async switchModel(name: string, signal?: AbortSignal) {
				expect(signal?.aborted).toBe(false);
				this.switches.push(name);
				return super.switchModel(name);
			}
			override async listSessions() {
				return this.service.listSessions();
			}
			override async listSessionEvents(id: SessionId) {
				this.activations.push(id);
				return this.service.activateSession(id);
			}
			override async readSessionPreviewEvents(id: SessionId) {
				this.previews.push(id);
				return this.service.readPreviewEvents(id);
			}
		}
		const runtime = new ResumeRuntime();
		const terminal = createTerminal();
		const instance = renderInteractiveApp(runtime, terminal, 'resume');
		try {
			await settle(instance);
			expect(runtime.previews).toEqual([savedId]);
			expect(runtime.activations).toEqual([asSessionId('session-1')]);
			expect(terminal.output()).toContain('Saved conversation');
			terminal.stdin.write('\x1B[B');
			await settle(instance);
			terminal.stdin.write('\r');
			await waitFor(() => runtime.activations.includes(savedId));
			await settle(instance);
			expect(runtime.activations).toEqual([asSessionId('session-1'), savedId]);
			expect(runtime.switches).toEqual(['saved-model']);
			expect(runtime.getModelName()).toBe('saved-model');
			expect(terminal.output()).toContain('Saved conversation');
			expect((await runtime.service.readSessionState(savedId)).messages).toHaveLength(1);
		} finally {
			instance.unmount();
			await instance.waitUntilExit();
			instance.cleanup();
			terminal.stdin.end();
		}
	});

	for (const route of ['command', 'model screen'] as const) {
		test(`${route} awaits the single injected async switch before displaying/using the new model`, async () => {
			class SwitchingRuntime extends FakePresentationRuntime {
				readonly entered = createDeferred<void>();
				readonly release = createDeferred<void>();
				readonly switches: string[] = [];
				readonly turns: TurnInput[] = [];
				override async switchModel(name: string, signal?: AbortSignal) {
					expect(signal?.aborted).toBe(false);
					this.switches.push(name);
					this.entered.resolve();
					await this.release.promise;
					return super.switchModel(name);
				}
				override async *runTurn(input: TurnInput): AsyncIterable<TurnDelta> {
					this.turns.push(input);
					yield { contentDelta: 'answer after switch' };
					this.commitAnswer(input, 'answer after switch');
				}
			}
			const runtime = new SwitchingRuntime();
			const terminal = createTerminal();
			const instance = renderInteractiveApp(runtime, terminal);
			try {
				await settle(instance);
				terminal.stdin.write(route === 'command' ? '/model other-model' : '/model');
				await settle(instance);
				terminal.stdin.write('\r');
				if (route === 'model screen') {
					await waitFor(() => terminal.output().includes('Select model'));
					await settle(instance);
					terminal.stdin.write('\x1B[B');
					await settle(instance);
					terminal.stdin.write('\r');
				}
				await runtime.entered.promise;
				expect(runtime.getModelName()).toBe('current-model');
				expect(runtime.switches).toEqual(['other-model']);
				runtime.release.resolve();
				await waitFor(() => terminal.output().includes('Model switched to other-model.'));
				expect(runtime.getModelName()).toBe('other-model');
				await settle(instance);
				terminal.stdin.write('question');
				await settle(instance);
				terminal.stdin.write('\r');
				await waitFor(() => runtime.turns.length === 1);
				expect(runtime.turns[0]).toMatchObject({
					modelName: 'other-model',
					prompt: 'question',
					sessionId: asSessionId('session-1'),
				});
				expect(runtime.turns[0]?.signal).toBeInstanceOf(AbortSignal);
				await waitFor(() => terminal.output().includes('answer after switch'));
			} finally {
				runtime.release.resolve();
				instance.unmount();
				await instance.waitUntilExit();
				instance.cleanup();
				terminal.stdin.end();
			}
		});
	}

	test('session model restoration failure calls async switch once and retains current selection', async () => {
		const savedId = asSessionId('saved-failing-session');
		const event = promptSubmittedEvent({
			sessionId: savedId,
			prompt: 'saved prompt',
			modelName: 'saved-model',
		});
		class FailedRestoreRuntime extends FakePresentationRuntime {
			readonly switches: string[] = [];
			override async listSessions() {
				return [{ sessionId: savedId }];
			}
			override async readSessionPreviewEvents() {
				return [event];
			}
			override async listSessionEvents(id: SessionId) {
				return id === savedId ? [event] : [];
			}
			override async switchModel(name: string, signal?: AbortSignal): Promise<string> {
				expect(signal?.aborted).toBe(false);
				this.switches.push(name);
				throw new Error('unload failure while restoring saved model');
			}
		}
		const runtime = new FailedRestoreRuntime();
		const terminal = createTerminal();
		const instance = renderInteractiveApp(runtime, terminal, 'resume');
		try {
			await waitFor(() => terminal.output().includes('saved prompt'));
			await settle(instance);
			terminal.stdin.write('\x1B[B');
			await settle(instance);
			terminal.stdin.write('\r');
			await waitFor(() => terminal.output().includes('unload failure while restoring saved model'));
			expect(runtime.switches).toEqual(['saved-model']);
			expect(runtime.getModelName()).toBe('current-model');
		} finally {
			instance.unmount();
			await instance.waitUntilExit();
			instance.cleanup();
			terminal.stdin.end();
		}
	});

	test('shows a guard without mounting interactive hooks for piped input', () => {
		const output = Bun.stripANSI(renderToString(<App runtime={new FakePresentationRuntime()} />));
		expect(output).toContain('requires an interactive terminal');
	});

	test('opens the command menu, enters the model screen, and returns to preserved chat', async () => {
		const terminal = createTerminal();
		const instance = renderInteractiveApp(new FakePresentationRuntime(), terminal);

		await settle(instance);
		terminal.stdin.write('/');
		await settle(instance);
		expect(terminal.output()).toContain('/model [name]');
		expect(terminal.output()).toContain('/resume');

		terminal.stdin.write('\r');
		await settle(instance);
		expect(terminal.output()).toContain('Select model');
		expect(terminal.output()).toContain('current-model · current');

		terminal.stdin.write('\u001B');
		await settle(instance);
		expect(terminal.output().match(/codesh/g)?.length).toBeGreaterThan(1);

		instance.unmount();
		await instance.waitUntilExit();
		instance.cleanup();
		terminal.stdin.end();
	});

	test('cancels an active response on Ctrl+C and exits on the next Ctrl+C once idle', async () => {
		const terminal = createTerminal();
		const runtime = new AbortablePresentationRuntime();
		const instance = renderInteractiveApp(runtime, terminal);
		let exited = false;
		const exitPromise = instance.waitUntilExit().then(() => {
			exited = true;
		});

		await settle(instance);
		terminal.stdin.write('x');
		await settle(instance);
		terminal.stdin.write('\r');
		await waitFor(() => runtime.turnSignal !== null);

		terminal.stdin.write('\x03');
		await waitFor(() => runtime.wasAborted);
		await waitFor(() => terminal.output().includes('The response was cancelled.'));
		expect(exited).toBe(false);

		terminal.stdin.write('\x03');
		await expectExit(exitPromise);

		instance.cleanup();
		terminal.stdin.end();
	});

	test('keeps Escape as a response cancellation shortcut without exiting', async () => {
		const terminal = createTerminal();
		const runtime = new AbortablePresentationRuntime();
		const instance = renderInteractiveApp(runtime, terminal);
		let exited = false;
		const exitPromise = instance.waitUntilExit().then(() => {
			exited = true;
		});

		await settle(instance);
		terminal.stdin.write('x');
		await settle(instance);
		terminal.stdin.write('\r');
		await waitFor(() => runtime.turnSignal !== null);

		terminal.stdin.write('\u001B');
		await waitFor(() => runtime.wasAborted);
		await waitFor(() => terminal.output().includes('The response was cancelled.'));
		expect(exited).toBe(false);

		instance.unmount();
		await expectExit(exitPromise);
		instance.cleanup();
		terminal.stdin.end();
	});

	test('exits on Ctrl+C when no response is active', async () => {
		const terminal = createTerminal();
		const instance = renderInteractiveApp(new FakePresentationRuntime(), terminal);
		const exitPromise = instance.waitUntilExit();

		await settle(instance);
		terminal.stdin.write('\x03');
		await expectExit(exitPromise);

		instance.cleanup();
		terminal.stdin.end();
	});
});

const renderInteractiveApp = (
	runtime: PresentationRuntime,
	terminal: ReturnType<typeof createTerminal>,
	initialMode: 'new' | 'resume' = 'new',
) =>
	render(<App runtime={runtime} initialMode={initialMode} />, {
		stdin: terminal.stdin,
		stdout: terminal.stdout,
		stderr: terminal.stderr,
		interactive: true,
		debug: true,
		exitOnCtrlC: false,
		patchConsole: false,
		maxFps: 60,
	});

const settle = async (instance: ReturnType<typeof render>): Promise<void> => {
	await Bun.sleep(25);
	await instance.waitUntilRenderFlush();
};

const waitFor = async (condition: () => boolean): Promise<void> => {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (condition()) {
			return;
		}
		await Bun.sleep(10);
	}
	throw new Error('Timed out waiting for the expected interactive state.');
};

const expectExit = async (exitPromise: Promise<unknown>): Promise<void> => {
	const outcome = await Promise.race([
		exitPromise.then(() => 'exited' as const),
		Bun.sleep(500).then(() => 'timeout' as const),
	]);
	expect(outcome).toBe('exited');
};

const createTerminal = () => {
	const input = new PassThrough();
	const output = new PassThrough();
	const error = new PassThrough();
	let rendered = '';
	output.on('data', (chunk) => {
		rendered += String(chunk);
	});
	const stdin = Object.assign(input, {
		isTTY: true,
		setRawMode: () => stdin,
		ref: () => stdin,
		unref: () => stdin,
	}) as unknown as NodeJS.ReadStream;
	const stdout = Object.assign(output, {
		isTTY: true,
		columns: 80,
		rows: 24,
	}) as unknown as NodeJS.WriteStream;
	const stderr = Object.assign(error, {
		isTTY: true,
		columns: 80,
		rows: 24,
	}) as unknown as NodeJS.WriteStream;

	return { stdin, stdout, stderr, output: () => Bun.stripANSI(rendered) };
};

class ApprovalPresentationRuntime extends FakePresentationRuntime {
	handler: ToolApprovalHandler | null = null;
	turnSignal: AbortSignal | null = null;
	executions = 0;
	disposals = 0;
	override setApprovalHandler(handler: ToolApprovalHandler) {
		this.handler = handler;
		return () => {
			this.disposals++;
			if (this.handler === handler) this.handler = null;
		};
	}
	override async *runTurn(input: TurnInput): AsyncIterable<TurnDelta> {
		this.turnSignal = input.signal ?? null;
		const approved = await this.handler?.(
			approvalRequest('pending'),
			input.signal === undefined ? {} : { signal: input.signal },
		);
		throwIfAborted(input.signal);
		if (approved) this.executions++;
		yield { contentDelta: approved ? 'approved' : 'denied' };
		this.commitAnswer(input, approved ? 'approved' : 'denied');
	}
}

const approvalRequest = (id: string): ToolApprovalRequest => ({
	sessionId: asSessionId('session-1'),
	toolCallId: asToolCallId(id),
	toolName: 'edit_file',
	toolInput: { path: id, oldText: 'a', newText: 'b' },
});
const rejection = (promise: Promise<unknown>) =>
	promise.then(
		() => undefined,
		(error: unknown) => error,
	);
const renderPresentationProbe = (runtime: ApprovalPresentationRuntime) => {
	const terminal = createTerminal();
	let latest!: ReturnType<typeof usePresentation>;
	const Probe = ({ runtime: activeRuntime }: { runtime: ApprovalPresentationRuntime }) => {
		latest = usePresentation(activeRuntime, 'new');
		return <Text>{latest.pendingApproval?.toolInput ? 'pending' : 'clear'}</Text>;
	};
	const instance = render(<Probe runtime={runtime} />, {
		stdin: terminal.stdin,
		stdout: terminal.stdout,
		stderr: terminal.stderr,
		interactive: true,
		debug: true,
		exitOnCtrlC: false,
		patchConsole: false,
	});
	return {
		instance,
		terminal,
		latest: () => latest,
		replace: (next: ApprovalPresentationRuntime) => instance.rerender(<Probe runtime={next} />),
		cleanup: async () => {
			instance.unmount();
			await instance.waitUntilExit();
			instance.cleanup();
			terminal.stdin.end();
		},
	};
};

describe('presentation approval lifecycle', () => {
	test('aborted pending approval clears matching state and stale callbacks cannot affect a newer request', async () => {
		const runtime = new ApprovalPresentationRuntime();
		const probe = renderPresentationProbe(runtime);
		try {
			await settle(probe.instance);
			const signalController = new AbortController();
			let adds = 0;
			let removes = 0;
			const add = signalController.signal.addEventListener.bind(signalController.signal);
			const remove = signalController.signal.removeEventListener.bind(signalController.signal);
			signalController.signal.addEventListener = (
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | AddEventListenerOptions,
			) => {
				adds++;
				add(type, listener, options);
			};
			signalController.signal.removeEventListener = (
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | EventListenerOptions,
			) => {
				removes++;
				remove(type, listener, options);
			};
			const first = rejection(
				runtime.handler!(approvalRequest('first'), { signal: signalController.signal }),
			);
			await settle(probe.instance);
			const staleResolve = probe.latest().resolveApproval;
			signalController.abort();
			expect(await first).toHaveProperty('name', 'AbortError');
			await settle(probe.instance);
			expect(probe.latest().pendingApproval).toBeNull();
			expect(removes).toBe(adds);
			const newer = new AbortController();
			let settled = false;
			const second = runtime.handler!(approvalRequest('second'), { signal: newer.signal }).then(
				(result) => {
					settled = true;
					return result;
				},
			);
			await settle(probe.instance);
			staleResolve(true);
			signalController.abort();
			await settle(probe.instance);
			expect(settled).toBe(false);
			expect(probe.latest().pendingApproval?.toolCallId).toBe(asToolCallId('second'));
			probe.latest().resolveApproval(true);
			expect(await second).toBe(true);
		} finally {
			await probe.cleanup();
		}
	});

	test('replacement cancels the previous request and old callbacks cannot resolve even reused request IDs', async () => {
		const runtime = new ApprovalPresentationRuntime();
		const probe = renderPresentationProbe(runtime);
		try {
			await settle(probe.instance);
			const request = approvalRequest('same');
			const firstController = new AbortController();
			const first = rejection(runtime.handler!(request, { signal: firstController.signal }));
			await settle(probe.instance);
			const stale = probe.latest().resolveApproval;
			let settled = false;
			const second = runtime.handler!(request, {}).then((result) => {
				settled = true;
				return result;
			});
			expect(await first).toHaveProperty('name', 'AbortError');
			await settle(probe.instance);
			stale(true);
			firstController.abort();
			await settle(probe.instance);
			expect(settled).toBe(false);
			expect(probe.latest().pendingApproval).not.toBeNull();
			probe.latest().resolveApproval(false);
			expect(await second).toBe(false);
		} finally {
			await probe.cleanup();
		}
	});

	test('handler disposal cancels pending approval and a disposed handler cannot replace the new one', async () => {
		const old = new ApprovalPresentationRuntime();
		const probe = renderPresentationProbe(old);
		try {
			await settle(probe.instance);
			const oldHandler = old.handler!;
			const first = rejection(oldHandler(approvalRequest('old'), {}));
			await settle(probe.instance);
			const newer = new ApprovalPresentationRuntime();
			probe.replace(newer);
			await settle(probe.instance);
			expect(await first).toHaveProperty('name', 'AbortError');
			expect(old.disposals).toBe(1);
			const second = newer.handler!(approvalRequest('new'), {});
			await settle(probe.instance);
			expect(await rejection(oldHandler(approvalRequest('stale'), {}))).toHaveProperty(
				'name',
				'AbortError',
			);
			expect(probe.latest().pendingApproval?.toolCallId).toBe(asToolCallId('new'));
			probe.latest().resolveApproval(true);
			expect(await second).toBe(true);
		} finally {
			await probe.cleanup();
		}
	});

	test('already-aborted UI request never displays approval', async () => {
		const runtime = new ApprovalPresentationRuntime();
		const probe = renderPresentationProbe(runtime);
		try {
			await settle(probe.instance);
			const request = new AbortController();
			request.abort('custom');
			expect(
				await rejection(runtime.handler!(approvalRequest('never'), { signal: request.signal })),
			).toHaveProperty('name', 'AbortError');
			expect(probe.latest().pendingApproval).toBeNull();
		} finally {
			await probe.cleanup();
		}
	});

	for (const shutdown of ['unmount', 'Ctrl+C'] as const) {
		test(`${shutdown} while approval is pending aborts the turn without executing`, async () => {
			const runtime = new ApprovalPresentationRuntime();
			const terminal = createTerminal();
			const instance = renderInteractiveApp(runtime, terminal);
			const exit = instance.waitUntilExit();
			try {
				await settle(instance);
				terminal.stdin.write('edit');
				await settle(instance);
				terminal.stdin.write('\r');
				await waitFor(() => terminal.output().includes('? APPROVAL'));
				if (shutdown === 'unmount') instance.unmount();
				else terminal.stdin.write('\x03');
				await expectExit(exit);
				expect(runtime.turnSignal?.aborted).toBe(true);
				expect(runtime.executions).toBe(0);
				expect(runtime.handler).toBeNull();
				expect(runtime.disposals).toBe(1);
			} finally {
				instance.unmount();
				instance.cleanup();
				terminal.stdin.end();
			}
		});
	}

	test('Escape while approval is visible keeps explicit denial interaction', async () => {
		const runtime = new ApprovalPresentationRuntime();
		const terminal = createTerminal();
		const instance = renderInteractiveApp(runtime, terminal);
		try {
			await settle(instance);
			terminal.stdin.write('edit');
			await settle(instance);
			terminal.stdin.write('\r');
			await waitFor(() => terminal.output().includes('? APPROVAL'));
			terminal.stdin.write('\u001B');
			await waitFor(() => terminal.output().includes('denied'));
			expect(runtime.turnSignal?.aborted).toBe(false);
			expect(runtime.executions).toBe(0);
		} finally {
			instance.unmount();
			await instance.waitUntilExit();
			instance.cleanup();
			terminal.stdin.end();
		}
	});
});

class StorageFailurePresentationRuntime extends FakePresentationRuntime {
	readonly pendingCompletion = createDeferred<void>();
	readonly finishCompletion = createDeferred<void>();
	readonly store = new InMemorySessionStore();
	readonly sessionService = new SessionService(this.store);
	readonly model = new ScriptedModel([
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
	readonly executor = new RecordingToolExecutor(
		[{ name: 'mutate', description: '', parameters: {} }],
		(request) => ({ toolName: request.toolName, output: { changed: true } }),
	);
	turnSignal: AbortSignal | null = null;
	private readonly loop: RunAgentTurn;
	constructor() {
		super();
		const append = this.store.appendSessionEvent.bind(this.store);
		this.store.appendSessionEvent = async (event) => {
			if (event.type === 'tool.call.completed') {
				this.pendingCompletion.resolve();
				await this.finishCompletion.promise;
				throw new Error('actual storage error after mutation');
			}
			await append(event);
		};
		let id = 0;
		this.loop = new RunAgentTurn({
			sessionStore: this.sessionService,
			model: this.model,
			toolExecutor: this.executor,
			contextBuilder: new ContextBuilder({ systemPrompt: 'test', maxContextCharacters: 120_000 }),
			clock: { now: () => asISODateTime('2026-10-07T12:00:00Z') },
			idGenerator: {
				nextEventId: () => asEventId(`event-${id++}`),
				nextMessageId: () => asMessageId(`message-${id++}`),
				nextSessionId: () => asSessionId('session-1'),
				nextToolCallId: () => asToolCallId(`call-${id++}`),
			},
		});
	}
	override async *runTurn(input: TurnInput) {
		this.turnSignal = input.signal ?? null;
		yield* this.loop.run(input);
	}
	override subscribeSessionEvents(listener: (event: AgentEvent) => void) {
		return this.sessionService.subscribe(listener);
	}
}

test('UI displays original storage failure after mutation even when cancellation is also pending', async () => {
	const runtime = new StorageFailurePresentationRuntime();
	const terminal = createTerminal();
	const instance = renderInteractiveApp(runtime, terminal);
	try {
		await settle(instance);
		terminal.stdin.write('mutate');
		await settle(instance);
		terminal.stdin.write('\r');
		await runtime.pendingCompletion.promise;
		terminal.stdin.write('\u001B');
		await waitFor(() => runtime.turnSignal?.aborted === true);
		runtime.finishCompletion.resolve();
		await waitFor(() => terminal.output().includes('actual storage error after mutation'));
		expect(terminal.output()).not.toContain('The response was cancelled.');
		expect(runtime.executor.receivedRequests).toHaveLength(1);
		expect(runtime.model.receivedInputs).toHaveLength(1);
		expect(runtime.store.events.filter((event) => event.type === 'tool.call.failed')).toEqual([]);
	} finally {
		runtime.finishCompletion.resolve();
		instance.unmount();
		await instance.waitUntilExit();
		instance.cleanup();
		terminal.stdin.end();
	}
});
