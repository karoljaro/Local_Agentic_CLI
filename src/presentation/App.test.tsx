import { usePresentation } from './hooks/usePresentation';
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
import { PublishingSessionStore } from '@/composition/PublishingSessionStore';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { render, renderToString, Text } from 'ink';

import { App } from '@/App';
import type {
	PresentationController,
	TurnDelta,
	TurnInput,
} from './adapters/PresentationController';
import { asSessionId, asToolCallId, asISODateTime, asEventId, asMessageId } from '@/domain/Ids';

class FakePresentationController implements PresentationController {
	readonly workspacePath = '/workspace';

	createSessionId() {
		return asSessionId('session-1');
	}

	getModelName(): string {
		return 'current-model';
	}

	async listModels() {
		return { models: [{ name: 'current-model' }, { name: 'other-model' }] };
	}

	async listSessionEvents() {
		return [];
	}

	async listSessions() {
		return [];
	}

	async *runTurn(_input: TurnInput): AsyncIterable<TurnDelta> {
		yield { contentDelta: 'answer' };
	}

	setApprovalHandler(_handler: ToolApprovalHandler): () => void {
		return () => undefined;
	}

	subscribeSessionEvents(_listener: (event: AgentEvent) => void): () => void {
		return () => undefined;
	}

	async switchModel(modelName: string) {
		return modelName;
	}
}

class AbortablePresentationController extends FakePresentationController {
	turnSignal: AbortSignal | null = null;
	wasAborted = false;

	override async *runTurn(input: TurnInput): AsyncIterable<TurnDelta> {
		this.turnSignal = input.signal;
		yield { contentDelta: 'partial answer' };
		await new Promise<void>((_resolve, reject) => {
			const rejectAsAborted = () => {
				this.wasAborted = true;
				reject(new DOMException('The operation was aborted.', 'AbortError'));
			};
			if (input.signal.aborted) {
				rejectAsAborted();
				return;
			}
			input.signal.addEventListener('abort', rejectAsAborted, { once: true });
		});
	}
}

describe('App interaction', () => {
	test('shows a guard without mounting interactive hooks for piped input', () => {
		const output = Bun.stripANSI(
			renderToString(<App controller={new FakePresentationController()} />),
		);
		expect(output).toContain('requires an interactive terminal');
	});

	test('opens the command menu, enters the model screen, and returns to preserved chat', async () => {
		const terminal = createTerminal();
		const instance = renderInteractiveApp(new FakePresentationController(), terminal);

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
		const controller = new AbortablePresentationController();
		const instance = renderInteractiveApp(controller, terminal);
		let exited = false;
		const exitPromise = instance.waitUntilExit().then(() => {
			exited = true;
		});

		await settle(instance);
		terminal.stdin.write('x');
		await settle(instance);
		terminal.stdin.write('\r');
		await waitFor(() => controller.turnSignal !== null);

		terminal.stdin.write('\x03');
		await waitFor(() => controller.wasAborted);
		await waitFor(() => terminal.output().includes('The response was cancelled.'));
		expect(exited).toBe(false);

		terminal.stdin.write('\x03');
		await expectExit(exitPromise);

		instance.cleanup();
		terminal.stdin.end();
	});

	test('keeps Escape as a response cancellation shortcut without exiting', async () => {
		const terminal = createTerminal();
		const controller = new AbortablePresentationController();
		const instance = renderInteractiveApp(controller, terminal);
		let exited = false;
		const exitPromise = instance.waitUntilExit().then(() => {
			exited = true;
		});

		await settle(instance);
		terminal.stdin.write('x');
		await settle(instance);
		terminal.stdin.write('\r');
		await waitFor(() => controller.turnSignal !== null);

		terminal.stdin.write('\u001B');
		await waitFor(() => controller.wasAborted);
		await waitFor(() => terminal.output().includes('The response was cancelled.'));
		expect(exited).toBe(false);

		instance.unmount();
		await expectExit(exitPromise);
		instance.cleanup();
		terminal.stdin.end();
	});

	test('exits on Ctrl+C when no response is active', async () => {
		const terminal = createTerminal();
		const instance = renderInteractiveApp(new FakePresentationController(), terminal);
		const exitPromise = instance.waitUntilExit();

		await settle(instance);
		terminal.stdin.write('\x03');
		await expectExit(exitPromise);

		instance.cleanup();
		terminal.stdin.end();
	});
});

const renderInteractiveApp = (
	controller: PresentationController,
	terminal: ReturnType<typeof createTerminal>,
) =>
	render(<App controller={controller} />, {
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

class ApprovalPresentationController extends FakePresentationController {
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
		this.turnSignal = input.signal;
		const approved = await this.handler?.(approvalRequest('pending'), { signal: input.signal });
		throwIfAborted(input.signal);
		if (approved) this.executions++;
		yield { contentDelta: approved ? 'approved' : 'denied' };
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
const renderPresentationProbe = (controller: ApprovalPresentationController) => {
	const terminal = createTerminal();
	let latest!: ReturnType<typeof usePresentation>;
	const Probe = ({
		controller: activeController,
	}: {
		controller: ApprovalPresentationController;
	}) => {
		latest = usePresentation(activeController, 'new');
		return <Text>{latest.pendingApproval?.toolInput ? 'pending' : 'clear'}</Text>;
	};
	const instance = render(<Probe controller={controller} />, {
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
		replace: (next: ApprovalPresentationController) =>
			instance.rerender(<Probe controller={next} />),
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
		const controller = new ApprovalPresentationController();
		const probe = renderPresentationProbe(controller);
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
				controller.handler!(approvalRequest('first'), { signal: signalController.signal }),
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
			const second = controller.handler!(approvalRequest('second'), { signal: newer.signal }).then(
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
		const controller = new ApprovalPresentationController();
		const probe = renderPresentationProbe(controller);
		try {
			await settle(probe.instance);
			const request = approvalRequest('same');
			const firstController = new AbortController();
			const first = rejection(controller.handler!(request, { signal: firstController.signal }));
			await settle(probe.instance);
			const stale = probe.latest().resolveApproval;
			let settled = false;
			const second = controller.handler!(request, {}).then((result) => {
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
		const old = new ApprovalPresentationController();
		const probe = renderPresentationProbe(old);
		try {
			await settle(probe.instance);
			const oldHandler = old.handler!;
			const first = rejection(oldHandler(approvalRequest('old'), {}));
			await settle(probe.instance);
			const newer = new ApprovalPresentationController();
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
		const controller = new ApprovalPresentationController();
		const probe = renderPresentationProbe(controller);
		try {
			await settle(probe.instance);
			const request = new AbortController();
			request.abort('custom');
			expect(
				await rejection(controller.handler!(approvalRequest('never'), { signal: request.signal })),
			).toHaveProperty('name', 'AbortError');
			expect(probe.latest().pendingApproval).toBeNull();
		} finally {
			await probe.cleanup();
		}
	});

	for (const shutdown of ['unmount', 'Ctrl+C'] as const) {
		test(`${shutdown} while approval is pending aborts the turn without executing`, async () => {
			const controller = new ApprovalPresentationController();
			const terminal = createTerminal();
			const instance = renderInteractiveApp(controller, terminal);
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
				expect(controller.turnSignal?.aborted).toBe(true);
				expect(controller.executions).toBe(0);
				expect(controller.handler).toBeNull();
				expect(controller.disposals).toBe(1);
			} finally {
				instance.unmount();
				instance.cleanup();
				terminal.stdin.end();
			}
		});
	}

	test('Escape while approval is visible keeps explicit denial interaction', async () => {
		const controller = new ApprovalPresentationController();
		const terminal = createTerminal();
		const instance = renderInteractiveApp(controller, terminal);
		try {
			await settle(instance);
			terminal.stdin.write('edit');
			await settle(instance);
			terminal.stdin.write('\r');
			await waitFor(() => terminal.output().includes('? APPROVAL'));
			terminal.stdin.write('\u001B');
			await waitFor(() => terminal.output().includes('denied'));
			expect(controller.turnSignal?.aborted).toBe(false);
			expect(controller.executions).toBe(0);
		} finally {
			instance.unmount();
			await instance.waitUntilExit();
			instance.cleanup();
			terminal.stdin.end();
		}
	});
});

class StorageFailurePresentationController extends FakePresentationController {
	readonly pendingCompletion = createDeferred<void>();
	readonly finishCompletion = createDeferred<void>();
	readonly store = new InMemorySessionStore();
	readonly publishing = new PublishingSessionStore(this.store);
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
			sessionStore: this.publishing,
			model: this.model,
			toolExecutor: this.executor,
			contextBuilder: new ContextBuilder({ systemPrompt: 'test' }),
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
		this.turnSignal = input.signal;
		yield* this.loop.run(input);
	}
	override subscribeSessionEvents(listener: (event: AgentEvent) => void) {
		return this.publishing.subscribe(listener);
	}
}

test('UI displays original storage failure after mutation even when cancellation is also pending', async () => {
	const controller = new StorageFailurePresentationController();
	const terminal = createTerminal();
	const instance = renderInteractiveApp(controller, terminal);
	try {
		await settle(instance);
		terminal.stdin.write('mutate');
		await settle(instance);
		terminal.stdin.write('\r');
		await controller.pendingCompletion.promise;
		terminal.stdin.write('\u001B');
		await waitFor(() => controller.turnSignal?.aborted === true);
		controller.finishCompletion.resolve();
		await waitFor(() => terminal.output().includes('actual storage error after mutation'));
		expect(terminal.output()).not.toContain('The response was cancelled.');
		expect(controller.executor.receivedRequests).toHaveLength(1);
		expect(controller.model.receivedInputs).toHaveLength(1);
		expect(controller.store.events.filter((event) => event.type === 'tool.call.failed')).toEqual(
			[],
		);
	} finally {
		controller.finishCompletion.resolve();
		instance.unmount();
		await instance.waitUntilExit();
		instance.cleanup();
		terminal.stdin.end();
	}
});
