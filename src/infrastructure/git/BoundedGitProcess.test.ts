import { expect, test } from 'bun:test';
import { createDeferred } from '@/test-support/createDeferred';
import type { OwnedProcess } from '@/infrastructure/process/BunProcessRunner';
import { BoundedGitProcess, type GitSpawnOptions } from './BoundedGitProcess';
import { GIT_DIAGNOSTIC_BYTES, GIT_DIFF_BYTES, GIT_STATUS_BYTES } from './limits';

const stream = (text: string | Uint8Array) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(typeof text === 'string' ? new TextEncoder().encode(text) : text);
			controller.close();
		},
	});
const completed = (stdout = '', stderr = '', exitCode = 0): OwnedProcess => ({
	stdout: stream(stdout),
	stderr: stream(stderr),
	exited: Promise.resolve(exitCode),
	exitCode,
	signalCode: null,
	kill: () => {},
});

test('fixed read-only argv, no shell/TTY/stdin; untrusted paths stay separate and literal', async () => {
	const launches: GitSpawnOptions[] = [];
	const runner = new BoundedGitProcess((options) => {
		launches.push(options);
		return completed();
	});
	const paths = ['--output=owned', ':(top)outside', 'space \t\nżółć', 'x; touch owned', '$()'];
	for (const kind of ['staged', 'unstaged'] as const) {
		await runner.run({ type: 'diff', kind, paths }, '/workspace', new AbortController().signal);
	}
	await runner.run({ type: 'discover' }, '/workspace', new AbortController().signal);
	await runner.run({ type: 'status' }, '/workspace', new AbortController().signal);
	await runner.run({ type: 'filters' }, '/workspace', new AbortController().signal);
	for (const options of launches) {
		expect(options.cmd[0]).toBe('git');
		expect(options).toMatchObject({
			cwd: '/workspace',
			stdin: 'ignore',
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(Object.keys(options).sort()).toEqual(['cmd', 'cwd', 'env', 'stderr', 'stdin', 'stdout']);
		for (const flag of [
			'--no-pager',
			'--no-optional-locks',
			'--literal-pathspecs',
			'--no-lazy-fetch',
			'core.fsmonitor=',
			'protocol.allow=never',
			'color.ui=false',
		])
			expect(options.cmd).toContain(flag);
		expect(
			options.cmd.some((arg) =>
				[
					'add',
					'reset',
					'restore',
					'checkout',
					'clean',
					'commit',
					'push',
					'fetch',
					'pull',
				].includes(arg),
			),
		).toBe(false);
	}
	for (const options of launches.slice(0, 2)) {
		expect(options.cmd.slice(options.cmd.indexOf('--') + 1)).toEqual(paths);
		for (const flag of ['--no-ext-diff', '--no-textconv', '--no-color'])
			expect(options.cmd).toContain(flag);
	}
	expect(launches[0]!.cmd).toContain('--cached');
	expect(launches[1]!.cmd).not.toContain('--cached');
});

test('inherited Git overrides are removed and no environment is returned in results', async () => {
	const old = process.env['GIT_WORK_TREE'];
	process.env['GIT_WORK_TREE'] = '/unrelated';
	let launch: GitSpawnOptions | undefined;
	try {
		const result = await new BoundedGitProcess((options) => {
			launch = options;
			return completed();
		}).run({ type: 'status' }, '/workspace', new AbortController().signal);
		expect(launch!.env['GIT_WORK_TREE']).toBeUndefined();
		expect(launch!.env['GIT_NO_LAZY_FETCH']).toBe('1');
		expect(launch!.env['GIT_OPTIONAL_LOCKS']).toBe('0');
		expect(JSON.stringify(result)).not.toContain('env');
	} finally {
		if (old === undefined) delete process.env['GIT_WORK_TREE'];
		else process.env['GIT_WORK_TREE'] = old;
	}
});

test('large stdout/stderr drain without retaining more than fixed prefix limits', async () => {
	for (const operation of [
		{ type: 'status' },
		{ type: 'diff', kind: 'unstaged', paths: ['file'] },
	] as const) {
		const limit = operation.type === 'status' ? GIT_STATUS_BYTES : GIT_DIFF_BYTES;
		const child = completed();
		child.stdout = stream(new Uint8Array(limit * 4).fill(65));
		child.stderr = stream(new Uint8Array(GIT_DIAGNOSTIC_BYTES * 4).fill(66));
		const result = await new BoundedGitProcess(() => child).run(
			operation,
			'/workspace',
			new AbortController().signal,
		);
		expect(result.stdout.length).toBe(limit);
		expect(result.stderr.length).toBe(GIT_DIAGNOSTIC_BYTES);
		expect(result.stdoutTruncated).toBe(true);
		expect(result.stderrTruncated).toBe(true);
	}
});

test('launch failure is a Git-unavailable state; nonzero exit remains an observed result', async () => {
	await expect(
		new BoundedGitProcess(() => {
			throw new Error('ENOENT SECRET');
		}).run({ type: 'discover' }, '/workspace', new AbortController().signal),
	).rejects.toMatchObject({ kind: 'git-unavailable' });
	const result = await new BoundedGitProcess(() => completed('', 'fatal: unavailable', 128)).run(
		{ type: 'status' },
		'/workspace',
		new AbortController().signal,
	);
	expect(result).toMatchObject({ exitCode: 128, timedOut: false });
});

const running = (ignoreTerm = false, keepPipes = false) => {
	const exit = createDeferred<number>();
	const kills: string[] = [];
	let code: number | null = null;
	const pipes: ReadableStreamDefaultController<Uint8Array>[] = [];
	const child: OwnedProcess = {
		stdout: new ReadableStream({ start: (controller) => pipes.push(controller) }),
		stderr: new ReadableStream({ start: (controller) => pipes.push(controller) }),
		exited: exit.promise,
		get exitCode() {
			return code;
		},
		signalCode: null,
		kill(signal) {
			kills.push(String(signal));
			if (ignoreTerm && signal === 'SIGTERM') return;
			code = 143;
			if (!keepPipes) for (const pipe of pipes) pipe.close();
			exit.resolve(code);
		},
	};
	return { child, kills };
};

test('pre-cancelled request launches nothing; cancellation kills and awaits exit without a normal result', async () => {
	const controller = new AbortController();
	controller.abort();
	let calls = 0;
	await expect(
		new BoundedGitProcess(() => {
			calls++;
			return completed();
		}).run({ type: 'status' }, '/workspace', controller.signal),
	).rejects.toHaveProperty('name', 'AbortError');
	expect(calls).toBe(0);
	const process = running();
	const request = new AbortController();
	const result = new BoundedGitProcess(() => process.child).run(
		{ type: 'status' },
		'/workspace',
		request.signal,
	);
	request.abort();
	await expect(result).rejects.toHaveProperty('name', 'AbortError');
	expect(process.kills).toEqual(['SIGTERM']);
});

test('cancellation escalates to hard kill when the owned process ignores TERM', async () => {
	const process = running(true);
	const request = new AbortController();
	const result = new BoundedGitProcess(() => process.child).run(
		{ type: 'status' },
		'/workspace',
		request.signal,
	);
	request.abort();
	await expect(result).rejects.toHaveProperty('name', 'AbortError');
	expect(process.kills).toEqual(['SIGTERM', 'SIGKILL']);
});

test('timeout is observed distinctly from cancellation and settles the owned child', async () => {
	const process = running();
	const result = await new BoundedGitProcess(() => process.child).run(
		{ type: 'status' },
		'/workspace',
		new AbortController().signal,
	);
	expect(result.timedOut).toBe(true);
	expect(process.kills).toEqual(['SIGTERM']);
	expect(result.exitCode).toBe(143);
}, 10_000);

test('inherited open pipes cannot indefinitely hold observation after direct child exit', async () => {
	const process = running(false, true);
	const request = new AbortController();
	const result = new BoundedGitProcess(() => process.child).run(
		{ type: 'status' },
		'/workspace',
		request.signal,
	);
	process.child.kill('SIGTERM');
	await expect(result).rejects.toThrow('pipes did not close');
});
