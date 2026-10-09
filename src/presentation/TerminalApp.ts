import {
	BoxRenderable,
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
import { getCommandSuggestions, parseCommand } from './commands/commands';
import type { TranscriptEntry } from './TranscriptLog';
import type { PresentationRuntime, StartupMode } from './types';

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
	private readonly live: TextRenderable;
	private readonly liveRegion: BoxRenderable;
	private readonly suggestions: SelectRenderable;
	private readonly syntax: SyntaxStyle;
	private readonly committed: Renderable[] = [];
	private picker: SessionPicker | ModelPicker | null = null;
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
	) {
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
			scrollbarOptions: { visible: false },
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
			placeholder: 'Ask anything · /model · /resume',
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
						if (!this.disposed) this.composer.focus();
					}
					if (cancelled) reject(abortError());
					else resolve(allowed);
				};
				const onAbort = () => finish(false, true);
				const prompt = new ApprovalPrompt(renderer, request, (allowed) => finish(allowed));
				this.approval = prompt;
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
		this.composer.focus();
		this.ready = this.conversation.initialize().then(() => {
			if (!this.disposed && initialMode === 'resume') this.openSessions();
		});
	}

	private readonly onConversationChange = (change: ConversationChange): void => {
		if (this.disposed) return;
		switch (change.type) {
			case 'entry':
				this.appendEntry(change.entry);
				break;
			case 'reset':
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
		}
		this.updateStatus();
	};

	private appendEntry(entry: TranscriptEntry): void {
		const node = new BoxRenderable(this.renderer, {
			id: `entry:${entry.id}`,
			width: '100%',
			flexDirection: 'row',
			flexShrink: 0,
			marginY: entry.kind === 'user' || entry.kind === 'assistant' ? 1 : 0,
			paddingLeft: entry.kind === 'user' ? 0 : 2,
		});
		if (entry.kind === 'user') {
			node.add(new TextRenderable(this.renderer, { content: '› ', fg: ACCENT, width: 2 }));
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
		this.model.content = this.commandRequest
			? 'Switching model…'
			: (this.runtime.getModelName() ?? 'No model selected · /model');
		this.session.content = `session ${String(this.conversation.sessionId).slice(-4)}`;
		this.activity.content = this.commandRequest
			? 'Switching model…'
			: this.conversation.loading
				? 'Loading session…'
				: this.conversation.activeTools.map((tool) => tool.description).join(' · ') ||
					(this.conversation.running ? 'Working…  Esc to cancel' : '');
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
			!this.approval &&
			matches.length > 0;
	}

	private submit(): void {
		if (
			this.disposed ||
			this.picker ||
			this.approval ||
			this.commandRequest ||
			this.conversation.loading ||
			this.conversation.running
		)
			return;
		const prompt = this.composer.plainText.trim();
		if (!prompt) return;
		const command = parseCommand(prompt);
		if (command === null) {
			if (this.conversation.submit(prompt)) this.composer.clear();
			return;
		}
		this.composer.clear();
		switch (command.type) {
			case 'select-model':
				this.openModels();
				break;
			case 'resume-session':
				this.openSessions();
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
		this.updateStatus();
		try {
			const switched = await this.conversation.switchModel(name, request.signal);
			if (switched && !this.disposed && !request.signal.aborted) this.closePicker();
			else if (!this.disposed && !request.signal.aborted && this.picker instanceof ModelPicker) {
				const error = this.conversation.history.at(-1);
				this.picker.setError(
					error?.kind === 'error'
						? error.content
						: `Could not switch model; current: ${this.runtime.getModelName()}`,
				);
			}
		} finally {
			if (this.commandRequest === request) this.commandRequest = null;
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
		);
		this.showPicker();
	}

	private openSessions(): void {
		if (this.disposed || this.approval || this.commandRequest) return;
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
		);
		this.showPicker();
	}

	private showPicker(): void {
		if (!this.picker) return;
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
		this.picker?.close();
		this.picker = null;
		if (!this.disposed && !this.approval) this.composer.focus();
	}

	private readonly onKey = (key: KeyEvent): void => {
		if (this.disposed || key.eventType === 'release') return;
		if (key.ctrl && key.name === 'c') {
			key.stopPropagation();
			if (this.approval || !this.conversation.running) void this.shutdown();
			else this.conversation.cancel();
			return;
		}
		if (key.name === 'escape') {
			key.stopPropagation();
			if (this.approval) this.approval.handleKey(key);
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
			if (this.commandRequest) {
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

	shutdown(): Promise<void> {
		if (this.closing) return this.closing;
		this.disposed = true;
		this.renderer.keyInput.off('keypress', this.onKey);
		this.commandRequest?.abort();
		this.unregisterApproval();
		this.cancelApproval?.();
		this.closePicker();
		const closing = Promise.allSettled([this.conversation.dispose(), ...this.pickerLoads])
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
