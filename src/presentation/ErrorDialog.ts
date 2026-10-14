import {
	BoxRenderable,
	RGBA,
	ScrollBoxRenderable,
	SelectRenderable,
	SelectRenderableEvents,
	TextRenderable,
	type CliRenderer,
	type KeyEvent,
} from '@opentui/core';
import { errorDetailsText, type OperationError } from './formatters/operationError';

/** A temporary native modal; TerminalApp owns focus restoration and clipboard IO. */
export class ErrorDialog {
	readonly root: BoxRenderable;
	readonly input: SelectRenderable;
	readonly scroll: ScrollBoxRenderable;
	readonly copyText: string;
	private readonly feedback: TextRenderable;
	private compact = false;
	private closed = false;
	constructor(
		renderer: CliRenderer,
		error: OperationError,
		onClose: () => void,
		onCopy: (text: string) => void,
	) {
		const background = RGBA.defaultBackground();
		this.copyText = errorDetailsText(error);
		this.root = new BoxRenderable(renderer, {
			id: 'error-dialog',
			position: 'absolute',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			zIndex: 30,
			backgroundColor: background,
			alignItems: 'center',
			justifyContent: 'center',
		});
		const panel = new BoxRenderable(renderer, {
			width: '100%',
			maxWidth: 88,
			height: '100%',
			maxHeight: 24,
			minHeight: 0,
			border: true,
			borderColor: '#888888',
			paddingX: 1,
			overflow: 'hidden',
			backgroundColor: background,
			flexDirection: 'column',
		});
		this.scroll = new ScrollBoxRenderable(renderer, {
			id: 'error-details-scroll',
			flexGrow: 1,
			minHeight: 0,
			scrollX: false,
			scrollY: true,
			viewportCulling: true,
			scrollbarOptions: { visible: false },
			contentOptions: { flexDirection: 'column' },
		});
		for (const [content, fg] of [
			[error.title, '#e98282'],
			[`Operation: ${error.operation}`, '#8bbcd1'],
			[error.message, RGBA.defaultForeground()],
			[`\nDetails:\n${error.details}`, RGBA.defaultForeground()],
		] as const) {
			this.scroll.add(
				new TextRenderable(renderer, {
					content,
					fg,
					width: '100%',
					flexShrink: 0,
					wrapMode: 'char',
					selectable: false,
				}),
			);
		}
		panel.add(this.scroll);
		this.input = new SelectRenderable(renderer, {
			id: 'error-actions',
			height: 2,
			flexShrink: 0,
			options: [
				{ name: 'Close · Enter / Esc', description: '', value: 'close' },
				{ name: 'Copy details · C', description: '', value: 'copy' },
			],
			showDescription: false,
			itemSpacing: 0,
			backgroundColor: background,
			focusedBackgroundColor: background,
			selectedBackgroundColor: background,
			textColor: '#888888',
			selectedTextColor: '#8bbcd1',
			onMouseUp: (event) => {
				if (this.closed || event.button !== 0 || event.isDragging) return;
				const index = event.y - this.input.y + (this.compact ? this.input.getSelectedIndex() : 0);
				if (index < 0 || index >= 2) return;
				this.input.setSelectedIndex(index);
				this.input.selectCurrent();
				event.stopPropagation();
			},
		});
		this.input.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
			if (this.closed) return;
			if (option.value === 'copy') onCopy(this.copyText);
			else onClose();
		});
		panel.add(this.input);
		this.feedback = new TextRenderable(renderer, {
			id: 'error-copy-feedback',
			height: 1,
			flexShrink: 0,
			fg: '#8bbcd1',
			truncate: true,
			selectable: false,
			visible: false,
		});
		panel.add(this.feedback);
		const hint = new TextRenderable(renderer, {
			content: '↑↓ scroll · Tab actions · C copy',
			fg: '#888888',
			height: 1,
			flexShrink: 0,
			truncate: true,
			selectable: false,
		});
		panel.add(hint);
		this.root.add(panel);
		const resize = () => {
			this.compact = this.root.height < 8;
			panel.border = !this.compact;
			this.input.height = this.compact ? 1 : 2;
			hint.visible = this.root.height >= 10;
		};
		this.root.on('resized', resize);
		this.onClose = onClose;
		this.onCopy = onCopy;
	}
	private readonly onClose: () => void;
	private readonly onCopy: (text: string) => void;
	setFeedback(message: string): void {
		this.feedback.content = message;
		this.feedback.visible = Boolean(message);
	}
	handleKey(key: KeyEvent): void {
		if (key.name === 'escape') this.onClose();
		else if (key.name === 'c' && !key.ctrl && !key.meta) this.onCopy(this.copyText);
		else if (key.name === 'return' || key.name === 'kpenter') this.input.selectCurrent();
		else if (key.name === 'tab') {
			this.input.setSelectedIndex((this.input.getSelectedIndex() + 1) % 2);
			this.input.focus();
		} else if (key.name === 'up' || key.name === 'down')
			this.scroll.scrollBy(key.name === 'up' ? -1 : 1);
		else if (key.name === 'pageup' || key.name === 'pagedown')
			this.scroll.scrollBy(key.name === 'pageup' ? -1 : 1, 'viewport');
		else if (key.name === 'home') this.scroll.scrollTo(0);
		else if (key.name === 'end') this.scroll.scrollTo(Number.MAX_SAFE_INTEGER);
	}
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.root.destroyRecursively();
	}
}
