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

describe('App interaction', () => {
	test('shows a guard without mounting interactive hooks for piped input', () => {
		const output = Bun.stripANSI(
			renderToString(<App controller={new FakePresentationController()} />),
		);
		expect(output).toContain('requires an interactive terminal');
	});

	test('opens the command menu, enters the model screen, and returns to preserved chat', async () => {
		const terminal = createTerminal();
		const instance = render(<App controller={new FakePresentationController()} />, {
			stdin: terminal.stdin,
			stdout: terminal.stdout,
			stderr: terminal.stderr,
			interactive: true,
			debug: true,
			patchConsole: false,
			maxFps: 60,
		});

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
});

const settle = async (instance: ReturnType<typeof render>): Promise<void> => {
	await Bun.sleep(25);
	await instance.waitUntilRenderFlush();
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
