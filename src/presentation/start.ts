import {
	CliRenderEvents,
	createCliRenderer,
	RGBA,
	type CliRendererErrorEvent,
} from '@opentui/core';
import { createRuntime } from '@/composition/createRuntime';
import { TerminalApp } from './TerminalApp';
import type { PresentationRuntime, StartupMode } from './types';

export async function startTerminal(
	initialMode: StartupMode,
	runtime?: PresentationRuntime,
): Promise<void> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		console.log('codesh requires an interactive terminal.');
		return;
	}
	const renderer = await createCliRenderer({
		exitOnCtrlC: false,
		exitSignals: [],
		screenMode: 'alternate-screen',
		consoleMode: 'disabled',
		openConsoleOnError: false,
		autoFocus: false,
		backgroundColor: RGBA.defaultBackground(),
		targetFps: 30,
		maxFps: 60,
	});
	let app: TerminalApp;
	try {
		app = new TerminalApp(renderer, runtime ?? createRuntime(), initialMode);
	} catch (error) {
		renderer.destroy();
		throw error;
	}
	const shutdown = () => {
		void app.shutdown();
	};
	const fail = ({ error }: CliRendererErrorEvent) => {
		process.exitCode = 1;
		void app.shutdown().then(() => console.error(error.message));
	};
	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
	process.on('SIGHUP', shutdown);
	renderer.on(CliRenderEvents.RENDER_ERROR, fail);
	renderer.on(CliRenderEvents.HANDLER_ERROR, fail);
	renderer.once(CliRenderEvents.DESTROY, shutdown);
	try {
		await app.ready;
		await app.closed;
	} finally {
		process.off('SIGTERM', shutdown);
		process.off('SIGINT', shutdown);
		process.off('SIGHUP', shutdown);
		renderer.off(CliRenderEvents.RENDER_ERROR, fail);
		renderer.off(CliRenderEvents.HANDLER_ERROR, fail);
		renderer.off(CliRenderEvents.DESTROY, shutdown);
		await app.shutdown();
	}
}
