import { realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
	ProcessInvocation,
	ProcessResult,
	ProcessRunnerPort,
} from '@/application/ports/ProcessRunnerPort';
import type { ToolExecutionOptions } from '@/application/ports/ToolExecutorPort';
import { abortError, throwIfAborted } from '@/application/services/cancellation';
import {
	assertContained,
	isProgramPath,
	workspaceRelativePath,
} from '@/infrastructure/file-system/workspacePaths';
import { BoundedProcessOutput } from './BoundedProcessOutput';

export const PROCESS_TERMINATION_GRACE_MS = 500;
export const PROCESS_KILL_WAIT_MS = 2_000;
export const PROCESS_PIPE_CLOSE_MS = 1_000;

// Narrow runtime seam for deterministic lifecycle tests; no model spawn options.
export type OwnedProcess = Pick<Bun.Subprocess, 'exited' | 'exitCode' | 'signalCode' | 'kill'> & {
	stdout: ReadableStream<Uint8Array>;
	stderr: ReadableStream<Uint8Array>;
};
export type ProcessSpawner = (argv: string[], cwd: string) => OwnedProcess;

const spawnProcess: ProcessSpawner = (cmd, cwd) =>
	Bun.spawn({ cmd, cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });

export class BunProcessRunner implements ProcessRunnerPort {
	constructor(
		private readonly workspaceRoot: string,
		private readonly spawn: ProcessSpawner = spawnProcess,
	) {}

	async run(input: ProcessInvocation, options: ToolExecutionOptions = {}): Promise<ProcessResult> {
		const { signal } = options;
		throwIfAborted(signal);
		// Re-resolve after approval. All checks and spawn are synchronous with no await gap.
		let root: string;
		try {
			root = realpathSync(this.workspaceRoot);
		} catch (error) {
			throw processError('workspace unavailable', '.', error);
		}
		const cwd = resolveProcessPath(root, input.cwd, 'directory');
		const program = isProgramPath(input.program)
			? resolveProcessPath(root, input.program, 'file')
			: input.program;
		throwIfAborted(signal);
		const startedAt = performance.now();
		let child: OwnedProcess;
		try {
			child = this.spawn([program, ...input.args], cwd);
		} catch (error) {
			throw processError('could not start', input.program, error);
		}

		const stdout = new BoundedProcessOutput();
		const stderr = new BoundedProcessOutput();
		const readers = [child.stdout.getReader(), child.stderr.getReader()];
		let childSettled = false;
		let cancelled = false;
		let timedOut = false;
		let stopping = false;
		let pipeFailure: Error | undefined;
		let escalation: ReturnType<typeof setTimeout> | undefined;
		let killDeadline: ReturnType<typeof setTimeout> | undefined;
		let pipeDeadline: ReturnType<typeof setTimeout> | undefined;
		let rejectTermination!: (error: Error) => void;
		const terminationFailure = new Promise<never>((_resolve, reject) => {
			rejectTermination = reject;
		});
		const closePipes = () => {
			for (const reader of readers) void reader.cancel().catch(() => undefined);
		};
		const kill = (killSignal: 'SIGTERM' | 'SIGKILL') => {
			if (childSettled) return;
			try {
				child.kill(killSignal);
			} catch {
				/* Escalate and verify settlement, never infer success. */
			}
		};
		const stop = () => {
			if (stopping || childSettled) return;
			stopping = true;
			kill('SIGTERM');
			escalation = setTimeout(() => kill('SIGKILL'), PROCESS_TERMINATION_GRACE_MS);
			killDeadline = setTimeout(() => {
				if (childSettled) return;
				kill('SIGKILL');
				closePipes();
				rejectTermination(new Error(`Process termination did not settle: ${input.program}`));
			}, PROCESS_TERMINATION_GRACE_MS + PROCESS_KILL_WAIT_MS);
		};
		const onAbort = () => {
			cancelled = true;
			stop();
		};
		signal?.addEventListener('abort', onAbort, { once: true });
		const timeout = setTimeout(() => {
			if (!childSettled) {
				timedOut = true;
				stop();
			}
		}, input.timeoutMs);
		const exited = child.exited.then(
			(exitCode) => {
				childSettled = true;
				clearTimeout(timeout);
				clearTimeout(escalation);
				clearTimeout(killDeadline);
				// Descendants may inherit pipes; owning a child does not imply owning its tree.
				pipeDeadline = setTimeout(() => {
					pipeFailure = new Error(
						`Process output pipes did not close after child exit: ${input.program}`,
					);
					closePipes();
				}, PROCESS_PIPE_CLOSE_MS);
				return exitCode;
			},
			(error: unknown) => {
				stop();
				throw processError('exit observation failed', input.program, error);
			},
		);
		const drain = async (
			reader: ReadableStreamDefaultReader<Uint8Array>,
			output: BoundedProcessOutput,
		) => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) return;
					output.observe(value);
				}
			} catch (error) {
				stop();
				throw processError('output observation failed', input.program, error);
			} finally {
				reader.releaseLock();
			}
		};
		// Attach handlers to both drains and exit immediately, including late failure paths.
		const completion = Promise.allSettled([
			drain(readers[0]!, stdout),
			drain(readers[1]!, stderr),
			exited,
		]);
		try {
			if (signal?.aborted) onAbort();
			const outcomes = await Promise.race([completion, terminationFailure]);
			if (cancelled || signal?.aborted) throw abortError();
			if (pipeFailure) throw pipeFailure;
			for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
			const out = stdout.snapshot();
			const err = stderr.snapshot();
			return {
				program: input.program,
				args: [...input.args],
				cwd: input.cwd,
				exitCode: child.exitCode,
				signal: child.signalCode ?? null,
				timedOut,
				durationMs: Math.max(0, performance.now() - startedAt),
				stdout: out.text,
				stderr: err.text,
				stdoutBytes: out.bytes,
				stderrBytes: err.bytes,
				stdoutTruncated: out.truncated,
				stderrTruncated: err.truncated,
			};
		} catch (error) {
			if (cancelled || signal?.aborted) throw abortError();
			throw error;
		} finally {
			clearTimeout(timeout);
			clearTimeout(escalation);
			clearTimeout(killDeadline);
			clearTimeout(pipeDeadline);
			signal?.removeEventListener('abort', onAbort);
			if (!childSettled) kill('SIGKILL');
		}
	}
}

const resolveProcessPath = (root: string, input: string, kind: 'directory' | 'file'): string => {
	const path = resolve(root, workspaceRelativePath(input));
	assertContained(root, path, input);
	let canonical: string;
	try {
		canonical = realpathSync(path);
	} catch (error) {
		throw processError('path unavailable', input, error);
	}
	assertContained(root, canonical, input);
	let valid: boolean;
	try {
		const stats = statSync(canonical);
		valid = kind === 'directory' ? stats.isDirectory() : stats.isFile();
	} catch (error) {
		throw processError('path unavailable', input, error);
	}
	if (!valid) throw new Error(`Process path is not a ${kind}: ${input}`);
	return canonical;
};

const processError = (action: string, program: string, cause: unknown): Error => {
	// OS error messages may contain the absolute workspace root. Retain only the code.
	const code =
		typeof cause === 'object' &&
		cause !== null &&
		'code' in cause &&
		typeof cause.code === 'string' &&
		/^[A-Z0-9_]+$/.test(cause.code)
			? ` (${cause.code})`
			: '';
	return new Error(`Process ${action}${code}: ${program}`);
};
