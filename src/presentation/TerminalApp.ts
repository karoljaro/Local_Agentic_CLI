import {
	BoxRenderable,
	CliRenderEvents,
	MarkdownRenderable,
	RGBA,
	ScrollBoxRenderable,
	SelectRenderable,
	SyntaxStyle,
	TextareaRenderable,
	TextRenderable,
	type CliRenderer,
	type KeyEvent,
	type Renderable,
	type TreeSitterClient,
} from '@opentui/core';
import { abortError, throwIfAborted } from '@/application/services/cancellation';
import { ApprovalPrompt } from './ApprovalPrompt';
import { Conversation, type ConversationChange } from './Conversation';
import { ModelPicker } from './ModelPicker';
import { SessionPicker } from './SessionPicker';
import { WorkspaceChangesView } from './WorkspaceChangesView';
import { SettingsView } from './SettingsView';
import { getCommandSuggestions, parseCommand } from './commands/commands';
import type { TranscriptEntry } from './TranscriptLog';
import type { PresentationRuntime, StartupMode } from './types';
import { createAppClipboard, copyResultFeedback, type CopyClipboard } from './clipboard';
import { ErrorDialog } from './ErrorDialog';
import {
	operationError,
	safeDiagnosticText,
	type OperationError,
} from './formatters/operationError';

const ACCENT = '#8bbcd1';
const MUTED = '#888888';
const ERROR = '#e98282';

export class TerminalApp {
	readonly conversation: Conversation;
	readonly composer: TextareaRenderable;
	readonly transcript: ScrollBoxRenderable;
	readonly ready: Promise<void>;
	readonly closed: Promise<void>;
	private readonly shell: BoxRenderable;
	private readonly model: TextRenderable;
	private readonly session: TextRenderable;
	private readonly activity: TextRenderable;
	private readonly feedback: TextRenderable;
	private readonly clipboard: CopyClipboard;
	private copyRequest: AbortController | null = null;
	private copyWork: Promise<void> | null = null;
	private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
	private errorDialog: ErrorDialog | null = null;
	private errorFocus: Renderable | null = null;
	private confirmedModel: string | undefined;
	private readonly live: TextRenderable;
	private readonly liveRegion: BoxRenderable;
	private readonly suggestions: SelectRenderable;
	private readonly syntax: SyntaxStyle;
	private readonly committed: Renderable[] = [];
	private picker: SessionPicker | ModelPicker | WorkspaceChangesView | null = null;
	private settingsView: SettingsView | null = null;
	private readonly pickerLoads = new Set<Promise<void>>();
	private approval: ApprovalPrompt | null = null;
	private cancelApproval: (() => void) | null = null;
	private readonly unregisterApproval: () => void;
	private commandRequest: AbortController | null = null;
	private closing: Promise<void> | null = null;
	private disposed = false;
	private suggestionsDismissed = false;
	private finishClosed!: () => void;

	constructor(
		private readonly renderer: CliRenderer,
		private readonly runtime: PresentationRuntime,
		initialMode: StartupMode = 'new',
		private readonly treeSitterClient?: TreeSitterClient,
		clipboard?: CopyClipboard,
	) {
		// OpenTUI owns scrolling; Shift + mouse selection stays with the host terminal.
		renderer.clearSelection();
		renderer.useMouse = true;
		this.clipboard = clipboard ?? createAppClipboard(renderer);
		this.confirmedModel = runtime.getModelName();
		this.closed = new Promise((resolve) => {
			this.finishClosed = resolve;
		});
		this.syntax = SyntaxStyle.fromStyles({
			default: { fg: RGBA.defaultForeground() },
			'markup.heading': { bold: true },
			'markup.strong': { bold: true },
			'markup.italic': { italic: true },
			'markup.link': { fg: ACCENT },
			'markup.raw': { fg: RGBA.defaultForeground() },
		});
		this.shell = new BoxRenderable(renderer, {
			id: 'conversation',
			width: '100%',
			height: '100%',
			flexDirection: 'column',
			paddingX: 2,
			backgroundColor: RGBA.defaultBackground(),
		});
		const header = new BoxRenderable(renderer, {
			flexDirection: 'row',
			height: 1,
			flexShrink: 0,
		});
		this.model = new TextRenderable(renderer, {
			content: runtime.getModelName() ?? 'No model selected · /model',
			fg: ACCENT,
			flexGrow: 1,
			truncate: true,
			height: 1,
		});
		this.session = new TextRenderable(renderer, { fg: ACCENT, height: 1 });
		header.add(this.model);
		header.add(this.session);
		this.shell.add(header);
		this.transcript = new ScrollBoxRenderable(renderer, {
			id: 'transcript',
			flexGrow: 1,
			minHeight: 0,
			scrollX: false,
			scrollY: true,
			stickyScroll: true,
			stickyStart: 'bottom',
			viewportCulling: true,
			contentOptions: { flexDirection: 'column', paddingTop: 1, paddingBottom: 1 },
			verticalScrollbarOptions: {
				width: 1,
				trackOptions: { foregroundColor: ACCENT, backgroundColor: RGBA.defaultBackground() },
			},
			horizontalScrollbarOptions: { visible: false },
		});
		this.liveRegion = new BoxRenderable(renderer, {
			id: 'live-round',
			width: '100%',
			paddingLeft: 2,
			marginY: 1,
			flexShrink: 0,
			visible: false,
		});
		// Incomplete Markdown alternates between parser previews and concealed highlights.
		// Keep the live buffer literal; appendEntry renders the final assistant Markdown once.
		this.live = new TextRenderable(renderer, {
			id: 'live-output',
			width: '100%',
			content: '',
			wrapMode: 'word',
			fg: RGBA.defaultForeground(),
			selectable: false,
		});
		this.liveRegion.add(this.live);
		this.transcript.add(this.liveRegion);
		this.shell.add(this.transcript);
		this.activity = new TextRenderable(renderer, {
			id: 'activity',
			content: '',
			fg: MUTED,
			height: 1,
			flexShrink: 0,
			truncate: true,
		});
		this.shell.add(this.activity);
		this.feedback = new TextRenderable(renderer, {
			id: 'ui-feedback',
			content: '',
			fg: MUTED,
			height: 1,
			flexShrink: 0,
			truncate: true,
			selectable: false,
		});
		this.shell.add(this.feedback);
		const footer = new BoxRenderable(renderer, {
			border: ['top'],
			borderColor: MUTED,
			flexDirection: 'column',
			flexShrink: 0,
		});
		this.suggestions = new SelectRenderable(renderer, {
			id: 'slash-commands',
			height: 2,
			visible: false,
			showDescription: false,
			backgroundColor: RGBA.defaultBackground(),
			focusedBackgroundColor: RGBA.defaultBackground(),
			textColor: MUTED,
			selectedBackgroundColor: RGBA.defaultBackground(),
			selectedTextColor: ACCENT,
		});
		footer.add(this.suggestions);
		const prompt = new BoxRenderable(renderer, { flexDirection: 'row', minHeight: 1 });
		prompt.add(new TextRenderable(renderer, { content: '› ', fg: ACCENT, width: 2, height: 1 }));
		this.composer = new TextareaRenderable(renderer, {
			id: 'composer',
			flexGrow: 1,
			minHeight: 1,
			maxHeight: 5,
			wrapMode: 'word',
			backgroundColor: RGBA.defaultBackground(),
			focusedBackgroundColor: RGBA.defaultBackground(),
			textColor: RGBA.defaultForeground(),
			focusedTextColor: RGBA.defaultForeground(),
			cursorColor: ACCENT,
			placeholder: 'Ask anything · /model · /resume · /changes · /settings',
			placeholderColor: MUTED,
			keyBindings: [
				{ name: 'return', action: 'submit' },
				{ name: 'return', shift: true, action: 'newline' },
				{ name: 'kpenter', action: 'submit' },
				{ name: 'kpenter', shift: true, action: 'newline' },
				{ name: 'j', ctrl: true, action: 'newline' },
				{ name: 'a', ctrl: true, action: 'line-home' },
				{ name: 'e', ctrl: true, action: 'line-end' },
				{ name: 'u', ctrl: true, action: 'delete-to-line-start' },
			],
			onSubmit: () => this.submit(),
			onContentChange: () => {
				this.suggestionsDismissed = false;
				this.updateSuggestions();
			},
		});
		prompt.add(this.composer);
		footer.add(prompt);
		this.shell.add(footer);
		renderer.root.add(this.shell);
		this.conversation = new Conversation(runtime, this.onConversationChange);
		this.unregisterApproval = runtime.setApprovalHandler((request, { signal }) => {
			return new Promise<boolean>((resolve, reject) => {
				throwIfAborted(signal);
				if (this.disposed || request.sessionId !== this.conversation.sessionId) throw abortError();
				this.cancelApproval?.();
				this.closeError();
				this.closePicker();
				let settled = false;
				const finish = (allowed: boolean, cancelled = false) => {
					if (settled) return;
					settled = true;
					signal?.removeEventListener('abort', onAbort);
					if (this.approval === prompt) {
						this.approval = null;
						this.cancelApproval = null;
						prompt.close();
						this.updateMouseMode();
						if (!this.disposed) {
							if (this.settingsView) this.settingsView.focus();
							else this.composer.focus();
						}
					}
					if (cancelled) reject(abortError());
					else resolve(allowed);
				};
				const onAbort = () => finish(false, true);
				const prompt = new ApprovalPrompt(renderer, request, (allowed) => finish(allowed));
				this.approval = prompt;
				this.updateMouseMode();
				this.cancelApproval = onAbort;
				this.composer.blur();
				this.suggestions.visible = false;
				this.shell.add(prompt.root);
				prompt.input.focus();
				signal?.addEventListener('abort', onAbort, { once: true });
				if (signal?.aborted) onAbort();
			});
		});
		renderer.keyInput.on('keypress', this.onKey);
		renderer.once(CliRenderEvents.DESTROY, this.onRendererDestroy);
		this.composer.focus();
		this.ready = this.conversation.initialize().then(() => {
			if (!this.disposed && initialMode === 'resume') this.openSessions();
		});
		const settingsProblem = runtime.settings?.getSnapshot().problem;
		if (settingsProblem)
			this.showError(
				operationError(
					'Could not load settings',
					'Settings — startup',
					runtime.settings?.getSnapshot().readOnly
						? 'Configuration is unavailable. Original bytes are preserved; repair the file and restart before saving.'
						: 'Legacy configuration could not be applied. Use /settings to save supported preferences; valid previous model preferences are retained.',
					settingsProblem,
				),
			);
	}

	private readonly onConversationChange = (change: ConversationChange): void => {
		if (this.disposed) return;
		switch (change.type) {
			case 'entry':
				this.appendEntry(change.entry);
				break;
			case 'reset':
				this.renderer.clearSelection();
				this.cancelCopy();
				this.closeError();
				for (const node of this.committed.splice(0)) node.destroyRecursively();
				this.transcript.scrollTo(Number.MAX_SAFE_INTEGER);
				break;
			case 'live':
				this.live.content = change.content;
				this.liveRegion.visible = change.content.trim().length > 0;
				return;
			case 'metadata':
			case 'status':
				break;
			case 'operation-error':
				this.showError(change.error);
				break;
		}
		this.updateStatus();
	};

	private appendEntry(entry: TranscriptEntry): void {
		const node = new BoxRenderable(this.renderer, {
			id: `entry:${entry.id}`,
			width: '100%',
			flexDirection: 'row',
			flexShrink: 0,
			marginTop: entry.kind === 'user' || entry.kind === 'assistant' ? 1 : 0,
			marginBottom: entry.kind === 'assistant' ? 1 : 0,
			paddingLeft: entry.kind === 'user' ? 0 : 2,
		});
		if (entry.kind === 'user') {
			// The prompt owns its separator, replacing the existing bottom margin.
			node.border = ['bottom'];
			node.borderColor = MUTED;
			node.add(
				new TextRenderable(this.renderer, {
					content: '› ',
					fg: ACCENT,
					width: 2,
					selectable: false,
				}),
			);
		}
		if (entry.kind === 'assistant') {
			node.add(
				new MarkdownRenderable(this.renderer, {
					content: entry.content,
					width: '100%',
					syntaxStyle: this.syntax,
					fg: RGBA.defaultForeground(),
					tableOptions: { style: 'columns' },
					...(this.treeSitterClient ? { treeSitterClient: this.treeSitterClient } : {}),
				}),
			);
		} else {
			const tool = entry.kind === 'tool';
			node.add(
				new TextRenderable(this.renderer, {
					content: `${tool ? (entry.failure ? '× ' : '• ') : ''}${entry.content}`,
					flexGrow: 1,
					wrapMode: 'word',
					fg:
						entry.kind === 'error' || entry.failure
							? ERROR
							: entry.kind === 'user'
								? RGBA.defaultForeground()
								: MUTED,
				}),
			);
		}
		this.transcript.insertBefore(node, this.liveRegion);
		this.committed.push(node);
	}

	private updateStatus(): void {
		if (!this.commandRequest) this.confirmedModel = this.runtime.getModelName();
		this.model.content = `${this.confirmedModel ?? 'No model selected · /model'}${this.commandRequest ? ' · Applying model selection…' : ''}`;
		this.session.content = `session ${String(this.conversation.sessionId).slice(-4)}`;
		this.activity.content = this.commandRequest
			? 'Applying model selection…'
			: this.conversation.loading
				? 'Loading session…'
				: this.conversation.activeTools.map((tool) => tool.description).join(' · ') ||
					(this.conversation.waitingForResponse
						? 'Waiting for model…  Esc to cancel'
						: this.conversation.running
							? 'Working…  Esc to cancel'
							: '');
		this.settingsView?.refresh();
	}

	private updateSuggestions(): void {
		if (!this.suggestions) return;
		const matches = getCommandSuggestions(this.composer.plainText);
		this.suggestions.options = matches.map((item) => ({
			name: item.name,
			description: item.description,
			value: item.name,
		}));
		this.suggestions.height = Math.min(2, matches.length);
		this.suggestions.visible =
			!this.disposed &&
			!this.suggestionsDismissed &&
			!this.picker &&
			!this.settingsView &&
			!this.approval &&
			!this.errorDialog &&
			matches.length > 0;
	}

	private submit(): void {
		if (
			this.disposed ||
			this.picker ||
			this.settingsView ||
			this.approval ||
			this.errorDialog ||
			this.commandRequest
		)
			return;
		const prompt = this.composer.plainText.trim();
		if (!prompt) return;
		const command = parseCommand(prompt);
		// Local Settings remains usable during discovery/generation; opening it never cancels a turn.
		if (command?.type !== 'settings' && (this.conversation.loading || this.conversation.running))
			return;
		if (command === null) {
			if (this.conversation.submit(prompt)) this.composer.clear();
			return;
		}
		this.composer.clear();
		switch (command.type) {
			case 'settings':
				this.openSettings();
				break;
			case 'select-model':
				this.openModels();
				break;
			case 'resume-session':
				this.openSessions();
				break;
			case 'workspace-changes':
				this.openChanges();
				break;
			case 'switch-model':
				void this.switchModel(command.modelName);
				break;
			case 'invalid':
				this.conversation.appendNotice(command.message, true);
				break;
		}
	}

	private async switchModel(name: string): Promise<void> {
		if (this.commandRequest || this.disposed) return;
		const request = new AbortController();
		this.commandRequest = request;
		if (this.picker instanceof ModelPicker) this.picker.setApplying(name);
		this.updateStatus();
		try {
			const switched = await this.conversation.switchModel(name, request.signal);
			if (switched && !this.disposed && !request.signal.aborted) {
				this.closePicker();
				const model = this.runtime.getModelSelection();
				if (model.status === 'selected' && model.warning)
					this.showError(
						operationError(
							'Could not save model preference',
							'Settings — model preference',
							'Model selection was confirmed, but its preference was not saved. Check Settings before restarting.',
							model.warning,
						),
					);
			}
		} finally {
			if (this.commandRequest === request) this.commandRequest = null;
			if (this.picker instanceof ModelPicker) this.picker.setCurrent();
			if (!this.disposed) this.updateStatus();
		}
	}

	private openModels(): void {
		if (this.disposed || this.approval || this.conversation.running || this.commandRequest) return;
		this.closePicker();
		this.picker = new ModelPicker(
			this.renderer,
			this.runtime,
			(name) => {
				void this.switchModel(name);
			},
			() => this.closePicker(),
			(error) => this.showError(error),
			() => this.updateStatus(),
		);
		this.showPicker();
	}

	private openSessions(): void {
		if (this.disposed || this.approval || this.commandRequest || this.settingsView) return;
		this.closePicker();
		this.picker = new SessionPicker(
			this.renderer,
			this.runtime,
			this.conversation.sessionId,
			(sessionId) => {
				this.composer.clear();
				this.closePicker();
				void this.conversation.selectSession(sessionId ?? this.runtime.createSessionId());
			},
			() => this.closePicker(),
			(error) => this.showError(error),
		);
		this.showPicker();
	}

	private openChanges(): void {
		if (
			this.disposed ||
			this.approval ||
			this.settingsView ||
			this.conversation.running ||
			this.conversation.loading ||
			this.commandRequest
		)
			return;
		this.closePicker();
		this.picker = new WorkspaceChangesView(this.renderer, this.runtime.workspaceChanges, () =>
			this.closePicker(),
		);
		this.showPicker();
	}

	private openSettings(): void {
		if (
			this.disposed ||
			this.approval ||
			this.commandRequest ||
			this.settingsView ||
			!this.runtime.settings
		)
			return;
		this.closePicker();
		this.settingsView = new SettingsView(
			this.renderer,
			this.runtime.settings,
			() => (this.commandRequest ? this.confirmedModel : this.runtime.getModelName()),
			() => {
				if (this.conversation.running || this.conversation.loading) return false;
				this.openModels();
				return true;
			},
			() => this.closeSettings(),
			(error) => this.showError(error),
		);
		this.composer.blur();
		this.suggestions.visible = false;
		this.shell.add(this.settingsView.root);
		this.settingsView.focus();
		this.updateMouseMode();
	}
	private closeSettings(): void {
		if (!this.settingsView) return;
		this.closeError();
		const view = this.settingsView;
		this.settingsView = null;
		view.close();
		const work = view.whenIdle();
		this.pickerLoads.add(work);
		void work.finally(() => this.pickerLoads.delete(work));
		this.updateMouseMode();
		if (!this.disposed && !this.approval && !this.picker) this.composer.focus();
	}

	private showPicker(): void {
		if (!this.picker) return;
		this.updateMouseMode();
		const load = this.picker.load;
		this.pickerLoads.add(load);
		void load.finally(() => {
			this.pickerLoads.delete(load);
			if (!this.disposed) this.updateStatus();
		});
		this.composer.blur();
		this.suggestions.visible = false;
		this.shell.add(this.picker.root);
		this.picker.input.focus();
	}

	private closePicker(): void {
		this.closeError();
		if (this.picker instanceof WorkspaceChangesView || this.picker instanceof ModelPicker) {
			const picker = this.picker;
			picker.close();
			const cleanup = picker.whenIdle();
			this.pickerLoads.add(cleanup);
			void cleanup.finally(() => this.pickerLoads.delete(cleanup));
		}
		this.picker?.close();
		this.picker = null;
		this.updateMouseMode();
		if (!this.disposed && !this.approval) {
			if (this.settingsView) {
				this.settingsView.refresh();
				this.settingsView.focus();
			} else this.composer.focus();
		}
	}

	private readonly onKey = (key: KeyEvent): void => {
		if (this.disposed || key.eventType === 'release') return;
		// Ptyxis normally consumes native Copy. If a distinct event is forwarded,
		// consume it without cancellation, editor input or an application copy.
		if (key.ctrl && key.shift && key.name.toLowerCase() === 'c') {
			key.preventDefault();
			key.stopPropagation();
			return;
		}
		if (key.ctrl && !key.shift && key.name.toLowerCase() === 'c') {
			key.stopPropagation();
			if (this.approval || !this.conversation.running) void this.shutdown();
			else this.conversation.cancel();
			return;
		}
		if (this.errorDialog) {
			key.preventDefault();
			key.stopPropagation();
			this.errorDialog.handleKey(key);
			return;
		}
		if (this.settingsView && !this.picker && !this.approval) {
			if (this.settingsView.handleKey(key)) {
				key.preventDefault();
				key.stopPropagation();
			}
			return;
		}
		if (key.name === 'escape') {
			key.stopPropagation();
			if (this.approval) this.approval.handleKey(key);
			else if (this.picker instanceof WorkspaceChangesView) this.picker.handleKey(key);
			else if (this.picker) {
				this.commandRequest?.abort();
				this.closePicker();
			} else if (this.conversation.running) this.conversation.cancel();
			else {
				this.suggestionsDismissed = true;
				this.suggestions.visible = false;
			}
			return;
		}
		if (this.approval) {
			if (this.approval.handleKey(key)) key.stopPropagation();
			return;
		}
		if (this.picker) {
			if (this.picker instanceof WorkspaceChangesView) {
				if (this.picker.handleKey(key)) key.stopPropagation();
				return;
			}
			if (this.commandRequest) {
				key.stopPropagation();
				return;
			}
			if (this.picker instanceof ModelPicker && this.picker.handleKey(key)) {
				key.stopPropagation();
				return;
			}
			if (key.name === 'home' || key.name === 'end') {
				key.stopPropagation();
				this.picker.input.setSelectedIndex(
					key.name === 'home' ? 0 : this.picker.input.options.length - 1,
				);
			}
			return;
		}
		if (key.name === 'f2' || key.name === 'f3') {
			key.stopPropagation();
			if (key.name === 'f2') this.openModels();
			else this.openSessions();
			return;
		}
		if (
			key.name === 'pageup' ||
			key.name === 'pagedown' ||
			(key.ctrl && (key.name === 'home' || key.name === 'end'))
		) {
			key.stopPropagation();
			if (key.name === 'home') this.transcript.scrollTo(0);
			else if (key.name === 'end') this.transcript.scrollTo(Number.MAX_SAFE_INTEGER);
			else this.transcript.scrollBy(key.name === 'pageup' ? -1 : 1, 'viewport');
			return;
		}
		if (this.suggestions.visible) {
			if (key.name === 'up' || key.name === 'down') {
				key.stopPropagation();
				if (key.name === 'up') this.suggestions.moveUp();
				else this.suggestions.moveDown();
			} else if (key.name === 'tab' || (key.name === 'return' && !key.shift && !key.ctrl)) {
				key.stopPropagation();
				const name = this.suggestions.getSelectedOption()?.value as string | undefined;
				if (name) {
					this.composer.setText(name);
					this.composer.gotoBufferEnd();
				}
				if (key.name === 'return') this.submit();
			}
		}
	};

	private showError(error: OperationError): void {
		// One dialog, first failure retained until close; no competing stack/queue.
		if (this.disposed || this.approval || this.errorDialog) return;
		this.errorFocus = this.renderer.currentFocusedRenderable ?? this.picker?.input ?? this.composer;
		this.errorFocus.blur();
		this.suggestions.visible = false;
		this.errorDialog = new ErrorDialog(
			this.renderer,
			error,
			() => this.closeError(),
			(text) => this.copyText(text),
		);
		this.shell.add(this.errorDialog.root);
		this.errorDialog.input.focus();
		this.updateMouseMode();
	}

	private closeError(): void {
		if (!this.errorDialog) return;
		this.errorDialog.close();
		this.errorDialog = null;
		this.updateMouseMode();
		if (!this.disposed && this.errorFocus && !this.errorFocus.isDestroyed) this.errorFocus.focus();
		this.errorFocus = null;
		this.updateSuggestions();
	}

	private copyText(text: string): void {
		if (this.disposed || !text) return;
		if (this.copyRequest) {
			this.showFeedback('Clipboard copy in progress…');
			return;
		}
		const request = new AbortController();
		this.copyRequest = request;
		this.copyWork = (async () => {
			try {
				const result = await this.clipboard.writeText(text, {
					destination: 'best-available',
					signal: request.signal,
				});
				if (!this.disposed && !request.signal.aborted && this.copyRequest === request)
					this.showFeedback(copyResultFeedback(result));
			} catch (error) {
				if (!this.disposed && !request.signal.aborted && this.copyRequest === request)
					this.showFeedback(
						`Could not copy: ${safeDiagnosticText(error instanceof Error ? error.message : String(error), 500)}`,
					);
			} finally {
				if (this.copyRequest === request) this.copyRequest = null;
			}
		})();
	}

	private showFeedback(message: string): void {
		if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
		this.feedback.content = message;
		this.errorDialog?.setFeedback(message);
		this.feedbackTimer = setTimeout(() => {
			this.feedbackTimer = null;
			if (!this.disposed) {
				this.feedback.content = '';
				this.errorDialog?.setFeedback('');
			}
		}, 3000);
	}

	private cancelCopy(): void {
		this.copyRequest?.abort();
		if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
		this.feedbackTimer = null;
		this.feedback.content = '';
	}

	private readonly onRendererDestroy = (): void => {
		void this.shutdown();
	};
	private updateMouseMode(): void {
		if (this.renderer.isDestroyed) return;
		this.renderer.clearSelection();
		// The public setter resets capture and parser button state when disabled.
		// Reset at view boundaries, then keep reporting enabled for chat as well as modals.
		this.renderer.useMouse = false;
		if (!this.disposed) this.renderer.useMouse = true;
	}

	shutdown(): Promise<void> {
		if (this.closing) return this.closing;
		this.disposed = true;
		this.updateMouseMode();
		this.renderer.keyInput.off('keypress', this.onKey);
		this.renderer.off(CliRenderEvents.DESTROY, this.onRendererDestroy);
		this.cancelCopy();
		this.commandRequest?.abort();
		this.unregisterApproval();
		this.cancelApproval?.();
		this.closePicker();
		this.closeSettings();
		const closing = Promise.allSettled([
			this.conversation.dispose(),
			this.runtime.settings?.whenIdle(),
			...this.pickerLoads,
			this.copyWork,
			this.clipboard.dispose(),
		])
			.then(() => undefined)
			.finally(() => {
				try {
					this.shell.destroyRecursively();
					this.syntax.destroy();
				} finally {
					this.renderer.destroy();
					this.finishClosed();
				}
			});
		this.closing = closing;
		return closing;
	}
}
