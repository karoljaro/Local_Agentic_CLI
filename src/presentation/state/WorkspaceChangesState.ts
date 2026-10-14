import type {
	WorkspaceChange,
	WorkspaceChangesPort,
	WorkspaceDiff,
	WorkspaceDiffKind,
	WorkspaceStatus,
} from '@/application/ports/WorkspaceChangesPort';
import { isAbortError } from '@/application/services/cancellation';

/** One status snapshot and one preview, with no preview cache or polling. */
export class WorkspaceChangesState {
	status: WorkspaceStatus | null = null;
	selectedIndex = 0;
	kind: WorkspaceDiffKind = 'unstaged';
	preview: WorkspaceDiff | null = null;
	loadingStatus = false;
	loadingDiff = false;
	error: string | null = null;
	private statusRequest: AbortController | null = null;
	private diffRequest: AbortController | null = null;
	private readonly pending = new Set<Promise<void>>();
	private closed = false;

	constructor(
		private readonly git: WorkspaceChangesPort,
		private readonly changed: () => void,
	) {}

	get selected(): WorkspaceChange | undefined {
		return this.status?.entries[this.selectedIndex];
	}

	refresh(): Promise<void> {
		if (this.closed) return Promise.resolve();
		this.statusRequest?.abort();
		this.cancelDiff();
		const request = new AbortController();
		this.statusRequest = request;
		const selectedPath = this.selected?.path;
		this.loadingStatus = true;
		this.error = null;
		this.preview = null;
		this.changed();
		return this.track(
			(async () => {
				try {
					const status = await this.git.status(request.signal);
					if (!this.current(request, 'status')) return;
					this.status = status;
					const index = status.entries.findIndex((entry) => entry.path === selectedPath);
					this.selectedIndex = index < 0 ? 0 : index;
					this.chooseKind();
				} catch (error) {
					if (!this.current(request, 'status') || isAbortError(error)) return;
					this.status = null;
					this.error = error instanceof Error ? error.message : 'Git inspection failed.';
				} finally {
					if (this.current(request, 'status')) {
						this.statusRequest = null;
						this.loadingStatus = false;
						this.changed();
					}
				}
			})(),
		);
	}

	select(index: number): void {
		if (this.closed || this.loadingStatus || !this.status?.entries[index]) return;
		if (index === this.selectedIndex) return;
		this.cancelDiff();
		this.selectedIndex = index;
		this.preview = null;
		this.error = null;
		this.chooseKind();
		this.changed();
	}

	inspect(): Promise<void> {
		if (this.closed || this.loadingStatus || !this.selected) return Promise.resolve();
		this.cancelDiff();
		const entry = this.selected;
		this.preview = null;
		this.error = null;
		if (entry.untracked) {
			this.preview = { text: '', truncated: false, notice: 'Untracked file — no Git diff yet.' };
			this.changed();
			return Promise.resolve();
		}
		const request = new AbortController();
		this.diffRequest = request;
		const kind = this.kind;
		this.loadingDiff = true;
		this.changed();
		return this.track(
			(async () => {
				try {
					const preview = await this.git.diff(entry, kind, request.signal);
					if (!this.current(request, 'diff')) return;
					this.preview = preview;
				} catch (error) {
					if (!this.current(request, 'diff') || isAbortError(error)) return;
					this.error =
						error instanceof Error
							? error.message
							: 'Git diff failed. Refresh to check the snapshot.';
				} finally {
					if (this.current(request, 'diff')) {
						this.diffRequest = null;
						this.loadingDiff = false;
						this.changed();
					}
				}
			})(),
		);
	}

	switchKind(): Promise<void> {
		if (this.closed || this.loadingStatus || !this.selected?.staged || !this.selected.unstaged)
			return Promise.resolve();
		this.kind = this.kind === 'staged' ? 'unstaged' : 'staged';
		return this.inspect();
	}

	leaveDiff(): void {
		this.cancelDiff();
		this.preview = null;
		this.error = null;
		if (!this.closed) this.changed();
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.statusRequest?.abort();
		this.statusRequest = null;
		this.cancelDiff();
		this.status = null;
		this.preview = null;
	}

	async whenIdle(): Promise<void> {
		await Promise.allSettled([...this.pending]);
	}

	private chooseKind(): void {
		if (this.selected && !this.selected[this.kind])
			this.kind = this.selected.staged ? 'staged' : 'unstaged';
	}
	private cancelDiff(): void {
		this.diffRequest?.abort();
		this.diffRequest = null;
		this.loadingDiff = false;
	}
	private current(request: AbortController, type: 'status' | 'diff'): boolean {
		return (
			!this.closed &&
			!request.signal.aborted &&
			request === (type === 'status' ? this.statusRequest : this.diffRequest)
		);
	}
	private track(promise: Promise<void>): Promise<void> {
		this.pending.add(promise);
		void promise.finally(() => this.pending.delete(promise));
		return promise;
	}
}
