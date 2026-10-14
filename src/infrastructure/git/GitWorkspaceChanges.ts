import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
	WorkspaceGitError,
	type WorkspaceChange,
	type WorkspaceChangesPort,
	type WorkspaceDiff,
	type WorkspaceDiffKind,
	type WorkspaceStatus,
} from '@/application/ports/WorkspaceChangesPort';
import { throwIfAborted } from '@/application/services/cancellation';
import { BoundedGitProcess, type GitProcessResult, type GitSpawner } from './BoundedGitProcess';
import { GIT_MAX_FILTERS } from './limits';
import { parseStatus, validGitPath } from './parseStatus';

export class GitWorkspaceChanges implements WorkspaceChangesPort {
	private readonly process: BoundedGitProcess;
	constructor(
		private readonly workspaceRoot: string,
		spawn?: GitSpawner,
	) {
		this.process = new BoundedGitProcess(spawn);
	}

	async status(signal: AbortSignal): Promise<WorkspaceStatus> {
		const scope = await this.discover(signal);
		await this.assertNoFilters(scope.workspace, signal);
		const result = await this.process.run({ type: 'status' }, scope.workspace, signal);
		assertSuccess(result);
		return parseStatus(result.stdout, scope.prefix, result.stdoutTruncated);
	}

	async diff(
		entry: WorkspaceChange,
		kind: WorkspaceDiffKind,
		signal: AbortSignal,
	): Promise<WorkspaceDiff> {
		throwIfAborted(signal);
		if (entry.untracked)
			return { text: '', truncated: false, notice: 'Untracked file — no Git diff yet.' };
		if (!entry[kind])
			return {
				text: '',
				truncated: false,
				notice: `No ${kind} change in this snapshot. Refresh to check again.`,
			};
		const scope = await this.discover(signal);
		// Only a rename in the selected side needs its deleted endpoint. Including a copy
		// source, or the source of a staged rename in an unstaged view, can show another file.
		const paths = [
			entry.path,
			...(entry[kind] === 'R' && entry.originalPath !== undefined ? [entry.originalPath] : []),
		];
		for (const path of paths) await this.assertPath(scope.workspace, path, signal);
		await this.assertNoFilters(scope.workspace, signal);
		throwIfAborted(signal);
		const result = await this.process.run({ type: 'diff', kind, paths }, scope.workspace, signal);
		assertSuccess(result);
		let text: string;
		try {
			text = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout, {
				stream: result.stdoutTruncated,
			});
		} catch {
			throw new WorkspaceGitError(
				'repository-error',
				'Git diff contains non-UTF-8 text; a textual preview is unavailable.',
			);
		}
		return {
			text,
			truncated: result.stdoutTruncated,
			...(!text
				? {
						notice:
							'No textual diff is available. The snapshot may be stale or only metadata changed; refresh to check.',
					}
				: /^(?:Binary files .+ and .+ differ|GIT binary patch)$/m.test(text)
					? { notice: 'Git reports a binary difference; no textual content preview is available.' }
					: {}),
		};
	}

	private async discover(signal: AbortSignal): Promise<{ workspace: string; prefix: string }> {
		throwIfAborted(signal);
		let workspace: string;
		try {
			workspace = await realpath(this.workspaceRoot);
		} catch {
			throw new WorkspaceGitError('repository-error', 'The configured workspace is unavailable.');
		}
		throwIfAborted(signal);
		const result = await this.process.run({ type: 'discover' }, workspace, signal);
		if (result.exitCode !== 0 && diagnostic(result).includes('not a git repository')) {
			throw new WorkspaceGitError(
				'not-repository',
				'The workspace is not inside an accessible Git repository.',
			);
		}
		assertSuccess(result);
		if (result.stdoutTruncated)
			throw new WorkspaceGitError(
				'unsupported-scope',
				'Git repository discovery exceeded its limit.',
			);
		let root: string;
		try {
			const path = new TextDecoder('utf-8', { fatal: true })
				.decode(result.stdout)
				.replace(/\n$/, '');
			if (!isAbsolute(path)) throw new Error('Invalid repository root');
			root = await realpath(path);
		} catch {
			throw new WorkspaceGitError(
				'unsupported-scope',
				'Git repository scope could not be verified.',
			);
		}
		throwIfAborted(signal);
		const subdirectory = relative(root, workspace);
		if (isAbsolute(subdirectory) || subdirectory === '..' || subdirectory.startsWith(`..${sep}`)) {
			throw new WorkspaceGitError(
				'unsupported-scope',
				'Git worktree does not contain the configured workspace; inspection is unavailable.',
			);
		}
		return { workspace, prefix: subdirectory ? `${subdirectory.split(sep).join('/')}/` : '' };
	}

	private async assertNoFilters(workspace: string, signal: AbortSignal): Promise<void> {
		const result = await this.process.run({ type: 'filters' }, workspace, signal);
		if (result.exitCode === 1 && !result.timedOut && !result.stdout.length && !result.stderr.length)
			return;
		assertSuccess(result);
		if (result.stdoutTruncated)
			throw new WorkspaceGitError(
				'repository-error',
				'Git filter configuration exceeds the inspection limit.',
			);
		const text = new TextDecoder().decode(result.stdout);
		if (text && !text.endsWith('\0'))
			throw new WorkspaceGitError('repository-error', 'Git filter configuration is malformed.');
		const filters = new Set<string>();
		for (const key of text.split('\0').filter(Boolean)) {
			const match = /^filter\.([A-Za-z0-9._-]+)\.(?:clean|smudge|process|required)$/.exec(key);
			if (!match)
				throw new WorkspaceGitError(
					'repository-error',
					'Unsupported Git filter configuration; no content commands were executed.',
				);
			filters.add(match[1]!);
		}
		if (filters.size > GIT_MAX_FILTERS)
			throw new WorkspaceGitError(
				'repository-error',
				'Too many configured Git filters for bounded inspection.',
			);
		if (filters.size > 0)
			throw new WorkspaceGitError(
				'repository-error',
				'Git content filters are configured. Workspace inspection is unavailable because it would require executing configured commands.',
			);
	}

	private async assertPath(workspace: string, path: string, signal: AbortSignal): Promise<void> {
		if (!validGitPath(path) || (process.platform === 'win32' && /[\\:]/.test(path))) {
			throw new WorkspaceGitError(
				'unsupported-scope',
				'The selected path cannot be safely scoped to this workspace.',
			);
		}
		let current = workspace;
		for (const component of path.split('/')) {
			throwIfAborted(signal);
			current = resolve(current, component);
			try {
				const stats = await lstat(current);
				if (stats.isSymbolicLink())
					throw new WorkspaceGitError(
						'unsupported-scope',
						'Diff inspection through symlinks is unavailable.',
					);
			} catch (error) {
				if (error instanceof WorkspaceGitError) throw error;
				if (
					typeof error === 'object' &&
					error !== null &&
					'code' in error &&
					(error.code === 'ENOENT' || error.code === 'ENOTDIR')
				)
					break;
				throw new WorkspaceGitError(
					'repository-error',
					'The selected path is unavailable. Refresh the workspace changes.',
				);
			}
		}
		throwIfAborted(signal);
	}
}

const diagnostic = (result: GitProcessResult): string => new TextDecoder().decode(result.stderr);
const assertSuccess = (result: GitProcessResult): void => {
	if (result.timedOut)
		throw new WorkspaceGitError(
			'repository-error',
			'Git inspection timed out after 5 seconds. Refresh to try again.',
		);
	if (result.exitCode !== 0)
		throw new WorkspaceGitError(
			'repository-error',
			`Git inspection failed${result.exitCode === null ? '' : ` (exit ${result.exitCode})`}: ${diagnostic(result) || 'No diagnostic output.'}${result.stderrTruncated ? ' [diagnostic truncated]' : ''}`,
		);
};
