import {
	BoxRenderable,
	RGBA,
	ScrollBoxRenderable,
	SelectRenderable,
	SelectRenderableEvents,
	StyledText,
	TextRenderable,
	type CliRenderer,
	type KeyEvent,
} from '@opentui/core';
import type { WorkspaceChangesPort } from '@/application/ports/WorkspaceChangesPort';
import { boundedDiffText, changeLabel, safeWorkspaceText } from './formatters/workspaceChanges';
import { WorkspaceChangesState } from './state/WorkspaceChangesState';

const ACCENT = '#8bbcd1';
const MUTED = '#888888';
const ERROR = '#e98282';

export class WorkspaceChangesView {
	readonly root: BoxRenderable;
	readonly input: SelectRenderable;
	readonly load: Promise<void>;
	readonly state: WorkspaceChangesState;
	readonly diffScroll: ScrollBoxRenderable;
	private readonly status: TextRenderable;
	private readonly detail: TextRenderable;
	private readonly footer: TextRenderable;
	private readonly preview: TextRenderable;
	private readonly diagnostic: TextRenderable;
	private showingDiff = false;
	private renderedEntries: unknown = null;
	private renderedPreview: unknown = null;
	private previewTruncated = false;
	private updatingList = false;
	private closed = false;

	constructor(
		renderer: CliRenderer,
		git: WorkspaceChangesPort,
		private readonly onCancel: () => void,
	) {
		const background = RGBA.defaultBackground();
		this.root = new BoxRenderable(renderer, {
			id: 'workspace-changes',
			position: 'absolute',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			zIndex: 20,
			backgroundColor: background,
			flexDirection: 'column',
			paddingX: 1,
		});
		this.root.add(
			new TextRenderable(renderer, {
				content: 'Workspace Changes',
				fg: ACCENT,
				height: 1,
				flexShrink: 0,
				truncate: true,
			}),
		);
		this.status = new TextRenderable(renderer, {
			id: 'changes-status',
			fg: MUTED,
			height: 1,
			flexShrink: 0,
			truncate: true,
		});
		this.root.add(this.status);
		this.detail = new TextRenderable(renderer, {
			id: 'changes-detail',
			fg: MUTED,
			height: 1,
			flexShrink: 0,
			truncate: true,
		});
		this.root.add(this.detail);
		this.input = new SelectRenderable(renderer, {
			id: 'changed-files',
			flexGrow: 1,
			minHeight: 0,
			itemSpacing: 0,
			showDescription: false,
			showScrollIndicator: true,
			wrapSelection: false,
			backgroundColor: background,
			focusedBackgroundColor: background,
			selectedBackgroundColor: background,
			textColor: RGBA.defaultForeground(),
			focusedTextColor: RGBA.defaultForeground(),
			selectedTextColor: ACCENT,
			keyBindings: [
				{ name: 'pageup', action: 'move-up-fast' },
				{ name: 'pagedown', action: 'move-down-fast' },
			],
		});
		this.input.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
			if (!this.updatingList) this.state.select(index);
		});
		this.input.on(SelectRenderableEvents.ITEM_SELECTED, () => this.openDiff());
		this.root.add(this.input);
		this.diffScroll = new ScrollBoxRenderable(renderer, {
			id: 'workspace-diff',
			flexGrow: 1,
			minHeight: 0,
			visible: false,
			scrollX: false,
			scrollY: true,
			viewportCulling: true,
			scrollbarOptions: { visible: false },
			contentOptions: { flexDirection: 'column' },
		});
		this.preview = new TextRenderable(renderer, {
			id: 'diff-text',
			width: '100%',
			flexShrink: 0,
			wrapMode: 'char',
			fg: RGBA.defaultForeground(),
		});
		this.diagnostic = new TextRenderable(renderer, {
			id: 'changes-diagnostic',
			width: '100%',
			flexShrink: 0,
			wrapMode: 'char',
			fg: MUTED,
		});
		this.diffScroll.add(this.diagnostic);
		this.diffScroll.add(this.preview);
		this.root.add(this.diffScroll);
		this.footer = new TextRenderable(renderer, {
			fg: MUTED,
			height: 2,
			flexShrink: 0,
			wrapMode: 'none',
			truncate: true,
		});
		this.root.add(this.footer);
		this.state = new WorkspaceChangesState(git, () => this.render());
		this.root.on('resized', () => this.render());
		this.load = this.state.refresh();
	}

	private openDiff(): void {
		if (!this.state.selected || this.state.loadingStatus || this.closed) return;
		this.showingDiff = true;
		this.input.blur();
		this.diffScroll.scrollTo(0);
		void this.state.inspect();
	}

	handleKey(key: KeyEvent): boolean {
		if (key.name === 'escape') {
			if (this.showingDiff) {
				this.showingDiff = false;
				this.state.leaveDiff();
				this.input.focus();
			} else this.onCancel();
			return true;
		}
		if (key.name === 'r' && !key.ctrl && !key.meta) {
			this.showingDiff = false;
			void this.state.refresh();
			this.input.focus();
			return true;
		}
		if (this.showingDiff) {
			if (key.name === 'tab') {
				this.diffScroll.scrollTo(0);
				void this.state.switchKind();
			} else if (key.name === 'up' || key.name === 'down')
				this.diffScroll.scrollBy(key.name === 'up' ? -1 : 1);
			else if (key.name === 'pageup' || key.name === 'pagedown')
				this.diffScroll.scrollBy(key.name === 'pageup' ? -1 : 1, 'viewport');
			else if (key.name === 'home') this.diffScroll.scrollTo(0);
			else if (key.name === 'end') this.diffScroll.scrollTo(Number.MAX_SAFE_INTEGER);
			return true;
		}
		if (key.name === 'home' || key.name === 'end') {
			this.input.setSelectedIndex(key.name === 'home' ? 0 : this.input.options.length - 1);
			return true;
		}
		if (
			this.state.error &&
			(key.name === 'pageup' || key.name === 'pagedown' || key.name === 'up' || key.name === 'down')
		) {
			this.diffScroll.scrollBy(
				key.name === 'up' || key.name === 'pageup' ? -1 : 1,
				key.name.startsWith('page') ? 'viewport' : 'step',
			);
			return true;
		}
		if (this.state.loadingStatus) return true;
		// The existing native SelectRenderable owns arrow/page/Enter behavior.
		return false;
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.state.close();
		this.root.destroyRecursively();
	}

	whenIdle(): Promise<void> {
		return this.state.whenIdle();
	}

	private render(): void {
		if (this.closed) return;
		const state = this.state;
		const entries = state.status?.entries;
		if (entries !== this.renderedEntries) {
			this.renderedEntries = entries;
			this.updatingList = true;
			this.input.options = (entries ?? []).map((entry) => ({
				name: changeLabel(entry),
				description: '',
				value: entry.path,
			}));
			this.input.setSelectedIndex(state.selectedIndex);
			this.updatingList = false;
		}
		// Keep the native input visible during loading so initial modal focus is retained.
		this.input.visible = !this.showingDiff;
		this.input.flexGrow = !state.error && (entries?.length ?? 0) > 0 ? 1 : 0;
		this.diffScroll.visible =
			this.showingDiff || Boolean(state.error) || (entries?.length ?? 0) === 0;
		this.status.fg = state.error ? ERROR : MUTED;
		this.status.content = state.loadingStatus
			? 'Loading workspace changes…'
			: state.error
				? safeWorkspaceText(state.error)
				: this.showingDiff
					? `${state.selected?.untracked ? 'Untracked file' : `${state.kind === 'staged' ? 'Staged' : 'Unstaged'} diff`}${state.loadingDiff ? ' · Loading…' : ''}`
					: state.status?.truncated
						? `Truncated list · ${entries?.length ?? 0} files · R refresh`
						: `${entries?.length ?? 0} changed ${entries?.length === 1 ? 'file' : 'files'}`;
		this.detail.content =
			this.showingDiff && state.selected
				? safeWorkspaceText(state.selected.path)
				: state.status?.notice
					? safeWorkspaceText(state.status.notice)
					: state.selected
						? changeLabel(state.selected)
						: state.loadingStatus
							? ''
							: state.error
								? 'R refresh · Esc return to conversation'
								: state.status?.truncated || state.status?.notice
									? 'The inspected list is incomplete; see the scope notice.'
									: 'No changes detected in this workspace scope.';
		if (state.preview !== this.renderedPreview) {
			this.renderedPreview = state.preview;
			const formatted = state.preview ? boundedDiffText(state.preview.text) : null;
			this.previewTruncated = formatted?.truncated ?? false;
			this.preview.content = new StyledText(
				(formatted?.text.match(/[^\n]*\n|[^\n]+$/g) ?? []).map((line) => ({
					__isChunk: true as const,
					text: line,
					fg: line.startsWith('-')
						? RGBA.fromHex(ERROR)
						: line.startsWith('+') || line.startsWith('@@') || line.startsWith('diff ')
							? RGBA.fromHex(ACCENT)
							: RGBA.defaultForeground(),
				})),
			);
		}
		const truncated = state.preview?.truncated || this.previewTruncated;
		this.diagnostic.fg = state.error ? ERROR : MUTED;
		this.diagnostic.content = [
			state.error ? safeWorkspaceText(state.error, true) : state.preview?.notice,
			!this.showingDiff ? state.status?.notice : '',
			truncated
				? 'Diff preview truncated (128 KiB / 2,000 lines); this is incomplete. R refresh.'
				: '',
		]
			.filter(Boolean)
			.join('\n');
		const narrow = this.root.width < 48;
		this.footer.content = this.showingDiff
			? `${narrow ? 'Esc files · R refresh · ↑↓' : 'Esc files · R refresh · ↑↓ / PgUp/PgDn scroll'}\n${truncated ? 'Incomplete preview · ' : ''}${state.selected?.staged && state.selected.unstaged ? (narrow ? 'Tab views' : 'Tab staged/unstaged') : ''}`
			: narrow
				? 'Enter diff · R refresh\n↑↓ files · Esc chat'
				: 'Esc chat · R refresh · Enter diff · ↑↓ choose\nColumns: staged / unstaged · ?? untracked';
	}
}
