import { describe, expect, test } from 'bun:test';
import { copyFile, chmod, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { LocalToolRegistry } from '@/infrastructure/tools/LocalToolExecutor';
import { runProcessTool } from '@/infrastructure/tools/providers/RunProcessProvider';
import type { ProcessResult } from '@/application/ports/ProcessRunnerPort';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { createDeferred } from '@/test-support/createDeferred';
import {
	PROCESS_FIXTURE_NAME,
	PROCESS_FIXTURE_LARGE_BYTES,
	writeProcessFixture,
} from '@/test-support/processFixture';
import { BunProcessRunner, type OwnedProcess, type ProcessSpawner } from './BunProcessRunner';
import { PROCESS_OUTPUT_BYTES, PROCESS_OUTPUT_MARKER } from './BoundedProcessOutput';

const fixture = async (spawn?: ProcessSpawner) => {
	const temp = await createTempDirectory('phase19-process-');
	await writeProcessFixture(temp.directory);
	const registry =
		spawn === undefined
			? createLocalToolExecutor({ workspaceRoot: temp.directory })
			: new LocalToolRegistry([runProcessTool(new BunProcessRunner(temp.directory, spawn))]);
	const prepare = (mode: string, extra: Record<string, unknown> = {}) =>
		registry.prepare({
			toolName: 'run_process',
			toolInput: { program: 'bun', args: [PROCESS_FIXTURE_NAME, mode], timeoutMs: 2000, ...extra },
		});
	const run = async (mode: string, extra: Record<string, unknown> = {}) =>
		(await prepare(mode, extra).execute()).output as ProcessResult;
	return { ...temp, registry, prepare, run };
};

const recordedSpawn = () => {
	const ready = createDeferred<void>();
	const children: Bun.Subprocess<'ignore', 'pipe', 'pipe'>[] = [];
	const launches: { argv: string[]; cwd: string }[] = [];
	const spawn: ProcessSpawner = (cmd, cwd) => {
		launches.push({ argv: [...cmd], cwd });
		const child = Bun.spawn({ cmd, cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
		children.push(child);
		const stdout = child.stdout.pipeThrough(
			new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, controller) {
					ready.resolve();
					controller.enqueue(chunk);
				},
			}),
		);
		return {
			stdout,
			stderr: child.stderr,
			exited: child.exited,
			get exitCode() {
				return child.exitCode;
			},
			get signalCode() {
				return child.signalCode;
			},
			kill: (signal) => child.kill(signal),
		};
	};
	return { ready, children, launches, spawn };
};

describe('direct Bun foreground process adapter', () => {
	test('exit 0, stdout, stderr, non-zero exit and nonnegative monotonic duration', async () => {
		const f = await fixture();
		try {
			const success = await f.run('success');
			expect(success).toMatchObject({
				program: 'bun',
				args: [PROCESS_FIXTURE_NAME, 'success'],
				cwd: '.',
				exitCode: 0,
				signal: null,
				timedOut: false,
				stdout: 'stdout ok\n',
				stderr: '',
				stdoutBytes: 10,
				stderrBytes: 0,
				stdoutTruncated: false,
				stderrTruncated: false,
			});
			expect(success.durationMs).toBeGreaterThanOrEqual(0);
			const failure = await f.run('failure');
			expect(failure).toMatchObject({
				exitCode: 7,
				signal: null,
				timedOut: false,
				stdout: 'before failure\n',
				stderr: 'stderr failure\n',
			});
			expect(failure.durationMs).toBeGreaterThanOrEqual(0);
			expect(JSON.stringify(success)).not.toContain(f.directory);
			expect(Object.keys(success).sort()).toEqual(
				[
					'program',
					'args',
					'cwd',
					'exitCode',
					'signal',
					'timedOut',
					'durationMs',
					'stdout',
					'stderr',
					'stdoutBytes',
					'stderrBytes',
					'stdoutTruncated',
					'stderrTruncated',
				].sort(),
			);
		} finally {
			await f.cleanup();
		}
	});
	test('shell-looking argv is literal and creates zero chaining/redirection side-effect files', async () => {
		const f = await fixture();
		try {
			const literal = [
				'hello && touch side-effect',
				'hello; touch side-effect',
				'hello | touch side-effect',
				'hello > side-effect',
				'$()',
				'`touch side-effect`',
				'*',
				'',
				' spaced ',
			];
			const output = await f.run('argv', { args: [PROCESS_FIXTURE_NAME, 'argv', ...literal] });
			expect(JSON.parse(output.stdout)).toEqual(literal);
			expect(await readdir(f.directory)).toEqual([PROCESS_FIXTURE_NAME]);
			expect(output.exitCode).toBe(0);
		} finally {
			await f.cleanup();
		}
	});
	test('cwd is applied; workspace executable paths resolve from the workspace root, independently of cwd', async () => {
		const f = await fixture();
		try {
			await mkdir(join(f.directory, 'nested'));
			const binary = process.platform === 'win32' ? 'local-bun.exe' : 'local-bun';
			await copyFile(process.execPath, join(f.directory, binary));
			if (process.platform !== 'win32') await chmod(join(f.directory, binary), 0o755);
			const output = await f.run('cwd', {
				program: `./${binary}`,
				args: ['../' + PROCESS_FIXTURE_NAME, 'cwd'],
				cwd: './nested/.',
			});
			expect(output.cwd).toBe('nested');
			expect(output.program).toBe(`./${binary}`);
			expect(output.stdout).toBe(join(f.directory, 'nested'));
			expect(output.exitCode).toBe(0);
		} finally {
			await f.cleanup();
		}
	});
	test('stdin has EOF and no TTY', async () => {
		const f = await fixture();
		try {
			expect(JSON.parse((await f.run('stdin')).stdout)).toEqual({
				bytes: 0,
				stdinTTY: false,
				stdoutTTY: false,
			});
		} finally {
			await f.cleanup();
		}
	});
	test('drains simultaneous stdout/stderr beyond pipe and retention capacities without deadlock', async () => {
		const f = await fixture();
		try {
			const output = await f.run('large');
			expect(output.exitCode).toBe(0);
			for (const stream of ['stdout', 'stderr'] as const) {
				expect(output[(stream + 'Bytes') as 'stdoutBytes' | 'stderrBytes']).toBe(
					PROCESS_FIXTURE_LARGE_BYTES,
				);
				expect(output[(stream + 'Truncated') as 'stdoutTruncated' | 'stderrTruncated']).toBe(true);
				expect(output[stream].startsWith('HEAD')).toBe(true);
				expect(output[stream].endsWith('TAIL')).toBe(true);
				expect(output[stream]).toContain(PROCESS_OUTPUT_MARKER);
				expect(Buffer.byteLength(output[stream])).toBe(PROCESS_OUTPUT_BYTES);
			}
		} finally {
			await f.cleanup();
		}
	});
	test('binary/invalid UTF-8 cannot fail process execution', async () => {
		const f = await fixture();
		try {
			expect(await f.run('binary')).toMatchObject({
				exitCode: 0,
				stdout: '\ufffd\ufffda',
				stderr: '\ufffdb',
				stdoutBytes: 3,
				stderrBytes: 2,
			});
		} finally {
			await f.cleanup();
		}
	});
	test('unknown executable is a truthful start failure, not exit code 127; one launch only', async () => {
		const record = recordedSpawn();
		const f = await fixture(record.spawn);
		try {
			const pending = f.run('success', { program: 'phase19-definitely-not-an-executable-02b887c' });
			await expect(pending).rejects.toThrow('Process could not start (ENOENT)');
			expect(record.launches).toHaveLength(1);
			expect(record.children).toHaveLength(0);
		} finally {
			await f.cleanup();
		}
	});
	(process.platform === 'win32' ? test.skip : test)(
		'an executable text file without a shebang has no implicit shell fallback',
		async () => {
			const record = recordedSpawn();
			const f = await fixture(record.spawn);
			try {
				await writeFile(join(f.directory, 'no-interpreter'), 'touch implicit-shell-side-effect\n');
				await chmod(join(f.directory, 'no-interpreter'), 0o755);
				await expect(f.run('success', { program: './no-interpreter', args: [] })).rejects.toThrow(
					'Process could not start',
				);
				expect(record.launches).toHaveLength(1);
				expect(record.children).toHaveLength(0);
				expect(await readdir(f.directory)).not.toContain('implicit-shell-side-effect');
			} finally {
				await f.cleanup();
			}
		},
	);
	test('timeout terminates/reaps the owned child, drains ready output and does not retry', async () => {
		const record = recordedSpawn();
		const f = await fixture(record.spawn);
		try {
			const output = await f.run('wait', { timeoutMs: 1000 });
			expect(output.timedOut).toBe(true);
			expect(output.stdout).toBe('ready\n');
			expect(output.durationMs).toBeGreaterThanOrEqual(900);
			expect(output.durationMs).toBeLessThan(4000);
			expect(record.launches).toHaveLength(1);
			expect(record.children[0]!.exitCode !== null || record.children[0]!.signalCode !== null).toBe(
				true,
			);
			expect(output.exitCode).toBe(record.children[0]!.exitCode);
			expect(output.signal).toBe(record.children[0]!.signalCode);
		} finally {
			await f.cleanup();
		}
	});
	(process.platform === 'win32' ? test.skip : test)(
		'SIGTERM-resistant child escalates to SIGKILL and settles',
		async () => {
			const record = recordedSpawn();
			const f = await fixture(record.spawn);
			try {
				const output = await f.run('ignore-term', { timeoutMs: 1000 });
				expect(output.timedOut).toBe(true);
				expect(output.stderr).toContain('ignored SIGTERM');
				expect(output.signal).toBe('SIGKILL');
				expect(output.durationMs).toBeLessThan(4000);
				expect(record.launches).toHaveLength(1);
			} finally {
				await f.cleanup();
			}
		},
	);
	test('AbortSignal stops/reaps a running process, removes its listener and rejects without a normal result', async () => {
		const record = recordedSpawn();
		const f = await fixture(record.spawn);
		const controller = new AbortController();
		let listeners = 0;
		const add = controller.signal.addEventListener.bind(controller.signal);
		const remove = controller.signal.removeEventListener.bind(controller.signal);
		controller.signal.addEventListener = (...args: Parameters<AbortSignal['addEventListener']>) => {
			if (args[0] === 'abort') listeners++;
			add(...args);
		};
		controller.signal.removeEventListener = (
			...args: Parameters<AbortSignal['removeEventListener']>
		) => {
			if (args[0] === 'abort') listeners--;
			remove(...args);
		};
		try {
			const pending = f.prepare('wait').execute({ signal: controller.signal });
			const observed = pending.catch((error: unknown) => error);
			await record.ready.promise;
			const stoppedAt = performance.now();
			controller.abort();
			expect(await observed).toHaveProperty('name', 'AbortError');
			expect(performance.now() - stoppedAt).toBeLessThan(4000);
			expect(listeners).toBe(0);
			expect(record.launches).toHaveLength(1);
			expect(record.children[0]!.exitCode !== null || record.children[0]!.signalCode !== null).toBe(
				true,
			);
		} finally {
			controller.abort();
			await f.cleanup();
		}
	});
	test('already-cancelled prepared call launches zero processes', async () => {
		const record = recordedSpawn();
		const f = await fixture(record.spawn);
		const controller = new AbortController();
		try {
			const call = f.prepare('success');
			controller.abort();
			await expect(call.execute({ signal: controller.signal })).rejects.toHaveProperty(
				'name',
				'AbortError',
			);
			expect(record.launches).toEqual([]);
		} finally {
			await f.cleanup();
		}
	});
});

describe('process execution-time workspace paths', () => {
	for (const field of ['cwd', 'program'] as const)
		test(`${field} symlink escape after preparation starts zero processes`, async () => {
			const record = recordedSpawn();
			const f = await fixture(record.spawn);
			const outside = await createTempDirectory('phase19-outside-');
			try {
				const name = field === 'cwd' ? 'work' : 'checker';
				if (field === 'cwd') await mkdir(join(f.directory, name));
				else await writeFile(join(f.directory, name), 'placeholder');
				const call = f.prepare('success', { [field]: field === 'cwd' ? name : `./${name}` });
				await rm(join(f.directory, name), { recursive: true });
				if (field === 'cwd')
					await symlink(
						outside.directory,
						join(f.directory, name),
						process.platform === 'win32' ? 'junction' : 'dir',
					);
				else {
					await writeFile(join(outside.directory, name), 'outside');
					await symlink(join(outside.directory, name), join(f.directory, name));
				}
				await expect(call.execute()).rejects.toThrow('outside workspace');
				expect(record.launches).toEqual([]);
			} finally {
				await f.cleanup();
				await outside.cleanup();
			}
		});
	test('a disappeared cwd and file-as-cwd are execution failures before spawn', async () => {
		const record = recordedSpawn();
		const f = await fixture(record.spawn);
		try {
			await mkdir(join(f.directory, 'work'));
			const call = f.prepare('success', { cwd: 'work' });
			await rm(join(f.directory, 'work'), { recursive: true });
			await expect(call.execute()).rejects.toThrow('path unavailable (ENOENT)');
			await expect(f.run('success', { cwd: PROCESS_FIXTURE_NAME })).rejects.toThrow(
				'not a directory',
			);
			expect(record.launches).toEqual([]);
		} finally {
			await f.cleanup();
		}
	});
	test('inside-workspace symlinks are allowed while cwd/result remain the approved relative path', async () => {
		const record = recordedSpawn();
		const f = await fixture(record.spawn);
		try {
			await mkdir(join(f.directory, 'work'));
			await symlink(
				join(f.directory, 'work'),
				join(f.directory, 'link'),
				process.platform === 'win32' ? 'junction' : 'dir',
			);
			const output = await f.run('success', {
				cwd: 'link',
				args: ['../' + PROCESS_FIXTURE_NAME, 'success'],
			});
			expect(output.cwd).toBe('link');
			expect(record.launches[0]!.cwd).toBe(join(f.directory, 'work'));
		} finally {
			await f.cleanup();
		}
	});
});

test('inherited pipes cannot keep foreground observation open after the owned child has exited', async () => {
	const exit = createDeferred<number>();
	let cancelCount = 0;
	const stream = () =>
		new ReadableStream<Uint8Array>({
			cancel() {
				cancelCount++;
			},
		});
	const child: OwnedProcess = {
		stdout: stream(),
		stderr: stream(),
		exited: exit.promise,
		exitCode: 0,
		signalCode: null,
		kill() {
			throw new Error('already exited');
		},
	};
	const f = await fixture(() => child);
	try {
		const pending = f.run('success');
		exit.resolve(0);
		await expect(pending).rejects.toThrow('output pipes did not close after child exit');
		expect(cancelCount).toBe(2);
	} finally {
		await f.cleanup();
	}
});

test('pipe observation failure stops and settles the owned child rather than returning success', async () => {
	const exit = createDeferred<number>();
	let stderrController!: ReadableStreamDefaultController<Uint8Array>;
	const kills: (number | NodeJS.Signals | undefined)[] = [];
	const child: OwnedProcess = {
		stdout: new ReadableStream<Uint8Array>({
			start(controller) {
				controller.error(new Error('pipe failed'));
			},
		}),
		stderr: new ReadableStream<Uint8Array>({
			start(controller) {
				stderrController = controller;
			},
		}),
		exited: exit.promise,
		exitCode: null,
		signalCode: null,
		kill(signal) {
			kills.push(signal);
			stderrController.close();
			exit.resolve(143);
		},
	};
	const f = await fixture(() => child);
	try {
		await expect(f.run('success')).rejects.toThrow('output observation failed');
		expect(kills).toEqual(['SIGTERM']);
	} finally {
		await f.cleanup();
	}
});

test('unobservable termination is bounded and truthful, attempts hard kill and never returns a fabricated timeout result', async () => {
	const exit = createDeferred<number>();
	let launches = 0;
	let closedPipes = 0;
	const kills: (number | NodeJS.Signals | undefined)[] = [];
	const stream = () =>
		new ReadableStream<Uint8Array>({
			cancel() {
				closedPipes++;
			},
		});
	const child: OwnedProcess = {
		stdout: stream(),
		stderr: stream(),
		exited: exit.promise,
		exitCode: null,
		signalCode: null,
		kill(signal) {
			kills.push(signal);
		},
	};
	const f = await fixture(() => {
		launches++;
		return child;
	});
	try {
		const startedAt = performance.now();
		await expect(f.run('wait', { timeoutMs: 1000 })).rejects.toThrow(
			'Process termination did not settle',
		);
		expect(performance.now() - startedAt).toBeLessThan(4500);
		expect(launches).toBe(1);
		expect(kills[0]).toBe('SIGTERM');
		expect(kills.filter((signal) => signal === 'SIGKILL').length).toBeGreaterThanOrEqual(2);
		expect(closedPipes).toBe(2);
	} finally {
		await f.cleanup();
	}
});
