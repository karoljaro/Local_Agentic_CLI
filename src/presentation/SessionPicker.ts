import {
	BoxRenderable,
	RGBA,
	SelectRenderable,
	SelectRenderableEvents,
	TextRenderable,
	type CliRenderer,
	type SelectOption,
} from '@opentui/core';
import type { SessionId } from '@/domain/Ids';
import { buildSessionOption } from './state/sessionSummary';
import type { PresentationRuntime } from './types';

export class SessionPicker {
	readonly root: BoxRenderable;
	readonly input: SelectRenderable;
	readonly load: Promise<void>;
	private closed = false;

	constructor(
		renderer: CliRenderer,
		runtime: PresentationRuntime,
		currentSessionId: SessionId,
		onSelect: (sessionId: SessionId | null) => void,
		onCancel: () => void,
	) {
		const background = RGBA.defaultBackground();
		this.root = new BoxRenderable(renderer, {
			id: 'session-picker',
			position: 'absolute',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			zIndex: 20,
			backgroundColor: background,
			alignItems: 'center',
			justifyContent: 'center',
		});
		const panel = new BoxRenderable(renderer, {
			width: '90%',
			maxWidth: 88,
			height: 18,
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
				content: 'Resume a session',
				fg: '#8bbcd1',
				height: 1,
				flexShrink: 0,
			}),
		);
		const status = new TextRenderable(renderer, {
			content: 'Loading saved sessions…',
			fg: '#888888',
			height: 1,
			flexShrink: 0,
			truncate: true,
		});
		panel.add(status);
		const newSession: SelectOption = {
			name: 'New session',
			description: 'Start a conversation',
			value: null,
		};
		this.input = new SelectRenderable(renderer, {
			id: 'session-choices',
			flexGrow: 1,
			minHeight: 0,
			flexShrink: 1,
			options: [newSession],
			itemSpacing: 0,
			showDescription: true,
			backgroundColor: background,
			focusedBackgroundColor: background,
			selectedBackgroundColor: background,
			textColor: RGBA.defaultForeground(),
			focusedTextColor: RGBA.defaultForeground(),
			selectedTextColor: '#8bbcd1',
			descriptionColor: '#888888',
			selectedDescriptionColor: '#888888',
			keyBindings: [
				{ name: 'pageup', action: 'move-up-fast' },
				{ name: 'pagedown', action: 'move-down-fast' },
			],
			onKeyDown: (key) => {
				if (key.name === 'escape') {
					key.preventDefault();
					onCancel();
				}
			},
		});
		this.input.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: SelectOption) => {
			if (!this.closed) onSelect(option.value as SessionId | null);
		});
		panel.add(this.input);
		panel.add(
			new TextRenderable(renderer, {
				content: 'Esc close · Enter resume · ↑↓ choose',
				fg: '#888888',
				height: 1,
				flexShrink: 0,
				truncate: true,
			}),
		);
		this.root.add(panel);
		const input = this.input;
		this.load = (async () => {
			try {
				const listed = await runtime.listSessions();
				if (this.closed) return;
				const summaries = await Promise.all(
					listed.map(async ({ sessionId }) => {
						try {
							return buildSessionOption(
								sessionId,
								await runtime.readSessionPreviewEvents(sessionId),
							);
						} catch {
							return buildSessionOption(sessionId, []);
						}
					}),
				);
				if (this.closed) return;
				summaries.sort((left, right) =>
					(right.lastActiveAt ?? '').localeCompare(left.lastActiveAt ?? ''),
				);
				input.options = [
					newSession,
					...summaries.map(
						(session): SelectOption => ({
							name: `${session.preview ?? String(session.sessionId)}${session.sessionId === currentSessionId ? ' · current' : ''}`,
							description: [
								session.lastActiveAt?.replace('T', ' ').replace(/\.\d+Z$/, 'Z'),
								String(session.sessionId).slice(-8),
							]
								.filter(Boolean)
								.join(' · '),
							value: session.sessionId,
						}),
					),
				];
				panel.height = Math.min(18, input.options.length * 2 + 5);
				status.content =
					summaries.length === 0 ? 'No saved sessions yet' : 'Saved conversations, newest first';
			} catch (error) {
				if (this.closed) return;
				status.fg = '#e98282';
				status.content = `Could not load sessions: ${error instanceof Error ? error.message : String(error)}`;
			}
		})();
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.root.destroyRecursively();
	}
}
