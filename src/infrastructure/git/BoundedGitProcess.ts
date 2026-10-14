import {
	WorkspaceGitError,
	type WorkspaceDiffKind,
} from '@/application/ports/WorkspaceChangesPort';
import { abortError, throwIfAborted } from '@/application/services/cancellation';
import type { OwnedProcess } from '@/infrastructure/process/BunProcessRunner';
import {
	GIT_DIAGNOSTIC_BYTES,
	GIT_DIFF_BYTES,
	GIT_KILL_WAIT_MS,
	GIT_METADATA_BYTES,
	GIT_PIPE_CLOSE_MS,
	GIT_STATUS_BYTES,
	GIT_TERMINATION_GRACE_MS,
	GIT_TIMEOUT_MS,
} from './limits';

export type GitOperation =
	| { type: 'discover' }
	| { type: 'filters' }
	| { type: 'status' }
	| { type: 'diff'; kind: WorkspaceDiffKind; paths: readonly string[] };

export type GitSpawnOptions = {
	cmd: string[];
	cwd: string;
	env: Record<string, string | undefined>;
	stdin: 'ignore';
	stdout: 'pipe';
	stderr: 'pipe';
};
export type GitSpawner = (options: GitSpawnOptions) => OwnedProcess;
const spawnGit: GitSpawner = (options) => Bun.spawn(options);

export type GitProcessResult = {
	stdout: Uint8Array;
	stderr: Uint8Array;
	stdoutTruncated: boolean;
	stderrTruncated: boolean;
	exitCode: number | null;
	timedOut: boolean;
};

/** Only these four read-only operations can reach Bun.spawn; no arbitrary command API. */
export class BoundedGitProcess {
	constructor(private readonly spawn: GitSpawner = spawnGit) {}

	async run(operation: GitOperation, cwd: string, signal: AbortSignal): Promise<GitProcessResult> {
		throwIfAborted(signal);
		const cmd = gitArgv(operation);
		let child: OwnedProcess;
		try {
			child = this.spawn({
				cmd,
				cwd,
				env: gitEnvironment(),
				stdin: 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
			});
		} catch {
			throw new WorkspaceGitError(
				'git-unavailable',
				'Git could not be launched. Install Git or check its availability on PATH.',
			);
		}
		const stdout = new PrefixOutput(
			operation.type === 'status'
				? GIT_STATUS_BYTES
				: operation.type === 'diff'
					? GIT_DIFF_BYTES
					: GIT_METADATA_BYTES,
		);
		const stderr = new PrefixOutput(GIT_DIAGNOSTIC_BYTES);
		const readers = [child.stdout.getReader(), child.stderr.getReader()];
		let settled = false;
		let stopping = false;
		let timedOut = false;
		let pipeFailure = false;
		let escalation: ReturnType<typeof setTimeout> | undefined;
		let deadline: ReturnType<typeof setTimeout> | undefined;
		let pipeDeadline: ReturnType<typeof setTimeout> | undefined;
		let rejectTermination!: (error: Error) => void;
		const terminationFailure = new Promise<never>((_resolve, reject) => {
			rejectTermination = reject;
		});
		const closePipes = () => {
			for (const reader of readers) void reader.cancel().catch(() => undefined);
		};
		const kill = (killSignal: 'SIGTERM' | 'SIGKILL') => {
			if (settled) return;
			try {
				child.kill(killSignal);
			} catch {
				/* Escalate and observe actual settlement. */
			}
		};
		const stop = () => {
			if (stopping || settled) return;
			stopping = true;
			kill('SIGTERM');
			escalation = setTimeout(() => kill('SIGKILL'), GIT_TERMINATION_GRACE_MS);
			deadline = setTimeout(() => {
				if (settled) return;
				kill('SIGKILL');
				closePipes();
				rejectTermination(
					new WorkspaceGitError('repository-error', 'Git termination could not be observed.'),
				);
			}, GIT_TERMINATION_GRACE_MS + GIT_KILL_WAIT_MS);
		};
		const onAbort = () => stop();
		signal.addEventListener('abort', onAbort, { once: true });
		const timeout = setTimeout(() => {
			if (!settled) {
				timedOut = true;
				stop();
			}
		}, GIT_TIMEOUT_MS);
		const exited = child.exited.then(
			() => {
				settled = true;
				clearTimeout(timeout);
				clearTimeout(escalation);
				clearTimeout(deadline);
				pipeDeadline = setTimeout(() => {
					pipeFailure = true;
					closePipes();
				}, GIT_PIPE_CLOSE_MS);
			},
			() => {
				stop();
				throw new WorkspaceGitError('repository-error', 'Git exit could not be observed.');
			},
		);
		const drain = async (reader: ReadableStreamDefaultReader<Uint8Array>, output: PrefixOutput) => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) return;
					output.observe(value);
				}
			} catch {
				stop();
				throw new WorkspaceGitError('repository-error', 'Git output could not be read.');
			} finally {
				reader.releaseLock();
			}
		};
		const completion = Promise.allSettled([
			drain(readers[0]!, stdout),
			drain(readers[1]!, stderr),
			exited,
		]);
		try {
			if (signal.aborted) onAbort();
			const outcomes = await Promise.race([completion, terminationFailure]);
			throwIfAborted(signal);
			if (pipeFailure)
				throw new WorkspaceGitError(
					'repository-error',
					'Git output pipes did not close after exit.',
				);
			for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
			return {
				stdout: stdout.snapshot(),
				stderr: stderr.snapshot(),
				stdoutTruncated: stdout.truncated,
				stderrTruncated: stderr.truncated,
				exitCode: child.exitCode,
				timedOut,
			};
		} catch (error) {
			if (signal.aborted) throw abortError();
			throw error;
		} finally {
			clearTimeout(timeout);
			clearTimeout(escalation);
			clearTimeout(deadline);
			clearTimeout(pipeDeadline);
			signal.removeEventListener('abort', onAbort);
			if (!settled) kill('SIGKILL');
		}
	}
}

class PrefixOutput {
	private readonly data: Uint8Array;
	private length = 0;
	truncated = false;
	constructor(limit: number) {
		this.data = new Uint8Array(limit);
	}
	observe(chunk: Uint8Array): void {
		const retained = Math.min(chunk.length, this.data.length - this.length);
		this.data.set(chunk.subarray(0, retained), this.length);
		this.length += retained;
		if (retained < chunk.length) this.truncated = true;
	}
	snapshot(): Uint8Array {
		return this.data.subarray(0, this.length);
	}
}

const gitArgv = (operation: GitOperation): string[] => {
	const argv = [
		'git',
		'--no-pager',
		'--no-optional-locks',
		'--literal-pathspecs',
		'--no-lazy-fetch',
		'-c',
		'color.ui=false',
		'-c',
		'core.fsmonitor=',
		'-c',
		'core.untrackedCache=false',
		'-c',
		'gc.auto=0',
		'-c',
		'maintenance.auto=false',
		'-c',
		'diff.external=',
		'-c',
		'diff.renameLimit=1000',
		'-c',
		'core.quotePath=true',
		'-c',
		'protocol.allow=never',
		'-c',
		'protocol.file.allow=never',
	];
	switch (operation.type) {
		case 'discover':
			return [...argv, 'rev-parse', '--show-toplevel'];
		case 'filters':
			return [
				...argv,
				'config',
				'--null',
				'--name-only',
				'--get-regexp',
				'^filter\\..*\\.(clean|smudge|process|required)$',
			];
		case 'status':
			return [
				...argv,
				'status',
				'--porcelain=v1',
				'-z',
				'--untracked-files=all',
				'--ignore-submodules=all',
				'--renames',
				'--',
				'.',
			];
		case 'diff':
			return [
				...argv,
				'diff',
				...(operation.kind === 'staged' ? ['--cached'] : []),
				'--patch',
				'--no-ext-diff',
				'--no-textconv',
				'--no-color',
				'--no-relative',
				'--ignore-submodules=all',
				'--find-renames',
				'--find-copies',
				'--unified=3',
				'--src-prefix=a/',
				'--dst-prefix=b/',
				'--',
				...operation.paths,
			];
		default:
			throw new WorkspaceGitError('repository-error', 'Unsupported Git operation.');
	}
};

const gitEnvironment = (): Record<string, string | undefined> => ({
	...Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')),
	),
	GIT_OPTIONAL_LOCKS: '0',
	GIT_NO_LAZY_FETCH: '1',
	GIT_TERMINAL_PROMPT: '0',
	GIT_ATTR_NOSYSTEM: '1',
	LC_ALL: 'C',
	LANG: 'C',
});
