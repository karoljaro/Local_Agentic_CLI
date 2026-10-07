import {
	BoxRenderable,
	RGBA,
	ScrollBoxRenderable,
	SelectRenderable,
	SelectRenderableEvents,
	TextRenderable,
	type CliRenderer,
	type KeyEvent,
	type SelectOption,
} from '@opentui/core';
import type { ToolApprovalRequest } from '@/application/use-cases/RunAgentTurn';
import { formatToolName, getPrimaryToolTarget } from './formatters/tool';

export class ApprovalPrompt {
	readonly root: BoxRenderable;
	readonly input: SelectRenderable;
	private readonly details: ScrollBoxRenderable;
	private closed = false;
	private resolved = false;

	constructor(
		renderer: CliRenderer,
		request: ToolApprovalRequest,
		private readonly onResolve: (allowed: boolean) => void,
	) {
		const background = RGBA.defaultBackground();
		this.root = new BoxRenderable(renderer, {
			id: 'approval-prompt',
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
			width: '90%',
			maxWidth: 88,
			maxHeight: '90%',
			minHeight: 0,
			border: true,
			borderColor: '#888888',
			paddingX: 1,
			overflow: 'hidden',
			backgroundColor: background,
		});
		panel.add(
			new TextRenderable(renderer, {
				content: 'Approval required',
				fg: '#8bbcd1',
				height: 1,
				flexShrink: 0,
			}),
		);
		panel.add(
			new TextRenderable(renderer, {
				content: formatToolName(request.toolName),
				fg: RGBA.defaultForeground(),
				wrapMode: 'word',
				flexShrink: 0,
			}),
		);
		const target = getPrimaryToolTarget(request.toolInput);
		if (target !== undefined)
			panel.add(
				new TextRenderable(renderer, {
					content: target,
					fg: RGBA.defaultForeground(),
					wrapMode: 'word',
					minHeight: 1,
					flexShrink: 0,
				}),
			);
		this.input = new SelectRenderable(renderer, {
			id: 'approval-choices',
			height: 2,
			minHeight: 1,
			flexShrink: 0,
			options: [
				{ name: 'Deny', description: '', value: false },
				{ name: 'Allow', description: '', value: true },
			],
			selectedIndex: 0,
			itemSpacing: 0,
			showDescription: false,
			backgroundColor: background,
			focusedBackgroundColor: background,
			selectedBackgroundColor: background,
			textColor: RGBA.defaultForeground(),
			focusedTextColor: RGBA.defaultForeground(),
			selectedTextColor: '#8bbcd1',
		});
		this.input.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: SelectOption) => {
			this.resolve(option.value === true);
		});
		panel.add(this.input);
		panel.add(
			new TextRenderable(renderer, {
				content: 'n/Esc deny · y allow · Enter confirm · d details',
				fg: '#888888',
				height: 1,
				flexShrink: 0,
				truncate: true,
			}),
		);
		this.details = new ScrollBoxRenderable(renderer, {
			id: 'approval-details',
			height: 8,
			minHeight: 0,
			flexShrink: 1,
			visible: false,
			scrollX: false,
			scrollbarOptions: { visible: false },
		});
		let serialized: string;
		try {
			serialized = JSON.stringify(request.toolInput, null, 2) ?? String(request.toolInput);
		} catch {
			serialized = String(request.toolInput);
		}
		this.details.add(
			new TextRenderable(renderer, {
				content: serialized,
				fg: '#888888',
				wrapMode: 'word',
				flexShrink: 0,
			}),
		);
		panel.add(this.details);
		this.root.add(panel);
	}

	handleKey(key: KeyEvent): boolean {
		if (this.closed || key.eventType === 'release' || key.ctrl || key.meta) return false;
		if (key.name === 'escape' || key.name.toLowerCase() === 'n') {
			this.resolve(false);
			return true;
		}
		if (key.name.toLowerCase() === 'y') {
			this.resolve(true);
			return true;
		}
		if (key.name.toLowerCase() === 'd') {
			this.details.visible = !this.details.visible;
			return true;
		}
		if (this.details.visible && (key.name === 'pageup' || key.name === 'pagedown')) {
			this.details.scrollBy(key.name === 'pageup' ? -1 : 1, 'viewport');
			return true;
		}
		return false;
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.root.destroyRecursively();
	}

	private resolve(allowed: boolean): void {
		if (this.closed || this.resolved) return;
		this.resolved = true;
		this.onResolve(allowed);
	}
}
