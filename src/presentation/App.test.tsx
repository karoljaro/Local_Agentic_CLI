import { describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { render, renderToString } from 'ink';

import { App } from '@/App';
import type {
	PresentationController,
	TurnDelta,
	TurnInput,
} from './adapters/PresentationController';
import { asSessionId } from '@/domain/Ids';

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

	setApprovalHandler() {
		return () => undefined;
	}

	subscribeSessionEvents() {
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
