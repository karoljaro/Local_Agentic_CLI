/** User-initiated, read-only inspection; never a model tool or a session event. */
export type GitChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U';

export type WorkspaceChange = {
	readonly path: string;
	readonly originalPath?: string;
	readonly staged: GitChangeStatus | null;
	readonly unstaged: GitChangeStatus | null;
	readonly untracked: boolean;
};

export type WorkspaceStatus = {
	readonly entries: readonly WorkspaceChange[];
	readonly truncated: boolean;
	readonly notice?: string;
};

export type WorkspaceDiffKind = 'staged' | 'unstaged';
export type WorkspaceDiff = {
	readonly text: string;
	readonly truncated: boolean;
	readonly notice?: string;
};

export interface WorkspaceChangesPort {
	status(signal: AbortSignal): Promise<WorkspaceStatus>;
	diff(
		entry: WorkspaceChange,
		kind: WorkspaceDiffKind,
		signal: AbortSignal,
	): Promise<WorkspaceDiff>;
}

export class WorkspaceGitError extends Error {
	constructor(
		readonly kind: 'git-unavailable' | 'not-repository' | 'repository-error' | 'unsupported-scope',
		message: string,
	) {
		super(message);
		this.name = 'WorkspaceGitError';
	}
}
