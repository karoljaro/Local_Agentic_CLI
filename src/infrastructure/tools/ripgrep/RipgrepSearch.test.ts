import { createDeferred } from '@/test-support/createDeferred';
import { describe, expect, test, spyOn } from 'bun:test';

import { RipgrepSearch, runRipgrepCommand, type RipgrepCommandRunner } from './RipgrepSearch';

type CommandFixture = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

const createSearch = (
	runCommand: RipgrepCommandRunner,
	options: Partial<{
		maxMatches: number;
		maxMatchTextLength: number;
		timeoutMs: number;
	}> = {},
): RipgrepSearch => {
	return new RipgrepSearch({
		workspaceRoot: '/workspace',
		timeoutMs: options.timeoutMs ?? 5000,
		maxMatches: options.maxMatches ?? 50,
		maxMatchTextLength: options.maxMatchTextLength ?? 300,
		runCommand,
	});
};

const createSequenceRunner = (fixtures: CommandFixture[]): RipgrepCommandRunner => {
	let index = 0;

	return async ({ onStdoutLine }) => {
		const fixture = fixtures[index];
		index += 1;

		if (fixture === undefined) {
			throw new Error('unexpected rg call');
		}

		for (const line of fixture.stdout.split('\n').filter(Boolean)) {
			if (!onStdoutLine(line)) {
				return { stderr: fixture.stderr, exitCode: 143, stoppedEarly: true };
			}
		}

		return {
			stderr: fixture.stderr,
			exitCode: fixture.exitCode,
			stoppedEarly: false,
		};
	};
};

const matchLine = (path: string, line: number, text: string): string =>
	JSON.stringify({
		type: 'match',
		data: {
			path: { text: `./${path}` },
			line_number: line,
			lines: { text: `${text}\n` },
		},
	});

const successful = (stdout: string): CommandFixture => ({
	stdout,
	stderr: '',
	exitCode: 0,
});

const noMatches = (): CommandFixture => ({ stdout: '', stderr: '', exitCode: 1 });

describe('RipgrepSearch', () => {
	test('returns empty output when rg exits with code 1', async () => {
		const search = createSearch(createSequenceRunner([noMatches(), noMatches()]));

		await expect(search.search({ query: 'missing' })).resolves.toEqual({
			returnedMatches: 0,
			returnedFiles: 0,
			matches: [],
			truncated: false,
		});
	});

	test('sorts matches after combining normal files and safe env files', async () => {
		const search = createSearch(
			createSequenceRunner([
				successful(`${matchLine('src/z.ts', 1, 'needle z')}\n`),
				successful(`${matchLine('.env.example', 1, 'needle env')}\n`),
			]),
		);

		await expect(search.search({ query: 'needle' })).resolves.toEqual({
			returnedMatches: 2,
			returnedFiles: 2,
			matches: [
				{
					path: '.env.example',
					line: 1,
					text: 'needle env',
				},
				{
					path: 'src/z.ts',
					line: 1,
					text: 'needle z',
				},
			],
			truncated: false,
		});
	});

	test('stops consuming ripgrep output after one match beyond the limit', async () => {
		let commandIndex = 0;
		let processedMatchLines = 0;
		const runCommand: RipgrepCommandRunner = async ({ onStdoutLine }) => {
			const currentIndex = commandIndex;
			commandIndex += 1;

			if (currentIndex === 1) {
				return { stderr: '', exitCode: 1, stoppedEarly: false };
			}

			for (let index = 1; index <= 10; index += 1) {
				processedMatchLines += 1;

				if (!onStdoutLine(matchLine(`src/${index}.ts`, index, 'needle'))) {
					return { stderr: '', exitCode: 143, stoppedEarly: true };
				}
			}

			return { stderr: '', exitCode: 0, stoppedEarly: false };
		};
		const search = createSearch(runCommand, { maxMatches: 2 });

		const result = await search.search({ query: 'needle' });

		expect(processedMatchLines).toBe(3);
		expect(result).toMatchObject({
			returnedMatches: 2,
			returnedFiles: 2,
			truncated: true,
		});
	});

	test('reports timeout when rg is killed by timeout', async () => {
		const search = createSearch(
			createSequenceRunner([{ stdout: '', stderr: '', exitCode: 143 }, noMatches()]),
			{ timeoutMs: 250 },
		);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			'search_file timed out after 250ms.',
		);
	});

	test('reports missing ripgrep binary', async () => {
		const runCommand: RipgrepCommandRunner = async () => {
			throw Object.assign(new Error('spawn failed'), { code: 'ENOENT' });
		};

		const search = createSearch(runCommand);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			'search_file failed: ripgrep binary not found',
		);
	});

	test('uses exit code when rg fails without stderr', async () => {
		const search = createSearch(
			createSequenceRunner([{ stdout: '', stderr: '', exitCode: 2 }, noMatches()]),
		);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			'search_file failed: rg exited with code 2',
		);
	});

	test('bounds long rg stderr in failure messages', async () => {
		const longStderr = `${'x'.repeat(1200)}tail`;
		const search = createSearch(
			createSequenceRunner([{ stdout: '', stderr: longStderr, exitCode: 2 }, noMatches()]),
		);

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			`search_file failed: ${'x'.repeat(1000)}...`,
		);
	});

	test('reports invalid rg JSON output', async () => {
		const search = createSearch(createSequenceRunner([successful('not-json\n'), noMatches()]));

		await expect(search.search({ query: 'needle' })).rejects.toThrow(
			'search_file failed: invalid rg JSON output',
		);
	});

	test('waits for both runners to finish when one search fails', async () => {
		let commandIndex = 0;
		let secondRunnerFinished = false;
		const runCommand: RipgrepCommandRunner = async () => {
			const currentIndex = commandIndex;
			commandIndex += 1;

			if (currentIndex === 0) {
				throw new Error('first search failed');
			}

			await Promise.resolve();
			secondRunnerFinished = true;
			return { stderr: '', exitCode: 1, stoppedEarly: false };
		};

		await expect(createSearch(runCommand).search({ query: 'needle' })).rejects.toThrow(
			'first search failed',
		);
		expect(secondRunnerFinished).toBe(true);
	});
});

describe('Ripgrep cancellation cleanup', () => {
	test('already aborted starts neither branch', async () => {
		let commands = 0;
		const search = createSearch(async () => {
			commands++;
			return { stderr: '', exitCode: 0, stoppedEarly: false };
		});
		const controller = new AbortController();
		controller.abort('custom');
		expect(
			await search.search({ query: 'needle' }, { signal: controller.signal }).then(
				() => undefined,
				(error: unknown) => error,
			),
		).toHaveProperty('name', 'AbortError');
		expect(commands).toBe(0);
	});

	test('both branches receive the same signal and cancellation awaits both cleanup paths', async () => {
		const controller = new AbortController();
		const first = createDeferred<void>();
		const second = createDeferred<void>();
		const ready = createDeferred<void>();
		let commands = 0;
		let cleaned = 0;
		const search = createSearch(async ({ signal }) => {
			expect(signal).toBe(controller.signal);
			const gate = commands++ === 0 ? first : second;
			const aborted = createDeferred<void>();
			const onAbort = () => aborted.resolve();
			signal?.addEventListener('abort', onAbort);
			if (commands === 2) ready.resolve();
			try {
				await aborted.promise;
				await gate.promise;
				throw new DOMException('cancelled', 'AbortError');
			} finally {
				signal?.removeEventListener('abort', onAbort);
				cleaned++;
			}
		});
		let settled = false;
		const outcome = search
			.search({ query: 'needle' }, { signal: controller.signal })
			.then(
				() => undefined,
				(error: unknown) => error,
			)
			.then((error) => {
				settled = true;
				return error;
			});
		await ready.promise;
		controller.abort();
		first.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(settled).toBe(false);
		second.resolve();
		expect(await outcome).toHaveProperty('name', 'AbortError');
		expect(cleaned).toBe(2);
	});

	test('independent branch failure retains its cause even when another branch aborts', async () => {
		const cause = new Error('independent process failure');
		let calls = 0;
		const search = createSearch(async () => {
			if (calls++ === 0) throw new DOMException('cancelled', 'AbortError');
			throw cause;
		});
		expect(
			await search.search({ query: 'needle' }).then(
				() => undefined,
				(error: unknown) => error,
			),
		).toBe(cause);
	});

	for (const termination of ['abort', 'limit', 'consumer failure'] as const) {
		test(`real child settles and removes listeners after ${termination}`, async () => {
			const controller = new AbortController();
			const added: unknown[] = [];
			const removed: unknown[] = [];
			const add = controller.signal.addEventListener.bind(controller.signal);
			const remove = controller.signal.removeEventListener.bind(controller.signal);
			controller.signal.addEventListener = (
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | AddEventListenerOptions,
			) => {
				added.push(listener);
				add(type, listener, options);
			};
			controller.signal.removeEventListener = (
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | EventListenerOptions,
			) => {
				removed.push(listener);
				remove(type, listener, options);
			};
			const cause = new Error('consumer failed');
			let pid = 0;
			const outcome = await runRipgrepCommand({
				cmd: [process.execPath, '-e', 'console.log(process.pid); setInterval(() => {}, 1000);'],
				cwd: process.cwd(),
				timeoutMs: 2000,
				signal: controller.signal,
				onStdoutLine: (line) => {
					pid = Number(line);
					if (termination === 'abort') controller.abort();
					if (termination === 'consumer failure') {
						controller.abort();
						throw cause;
					}
					return termination !== 'limit';
				},
			}).then(
				(result) => result,
				(error: unknown) => error,
			);
			if (termination === 'abort') expect(outcome).toHaveProperty('name', 'AbortError');
			if (termination === 'limit') expect(outcome).toMatchObject({ stoppedEarly: true });
			if (termination === 'consumer failure') expect(outcome).toBe(cause);
			expect(pid).toBeGreaterThan(0);
			expect(() => process.kill(pid, 0)).toThrow();
			expect(removed).toEqual(added);
		});
	}
});

test('abort releases both process stream readers after draining and child settlement', async () => {
	const originalSpawn = Bun.spawn;
	let stdout: ReadableStream<Uint8Array> | undefined;
	let stderr: ReadableStream<Uint8Array> | undefined;
	const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(((
		...args: Parameters<typeof Bun.spawn>
	) => {
		const subprocess = originalSpawn(...args);
		stdout = subprocess.stdout as ReadableStream<Uint8Array>;
		stderr = subprocess.stderr as ReadableStream<Uint8Array>;
		return subprocess;
	}) as typeof Bun.spawn);
	const controller = new AbortController();
	try {
		const outcome = await runRipgrepCommand({
			cmd: [
				process.execPath,
				'-e',
				'console.error("diagnostic"); console.log("ready"); setInterval(() => {}, 1000);',
			],
			cwd: process.cwd(),
			timeoutMs: 2000,
			signal: controller.signal,
			onStdoutLine: () => {
				controller.abort();
				return true;
			},
		}).then(
			() => undefined,
			(error: unknown) => error,
		);
		expect(outcome).toHaveProperty('name', 'AbortError');
		expect(stdout?.locked).toBe(false);
		expect(stderr?.locked).toBe(false);
	} finally {
		spawnSpy.mockRestore();
	}
});
