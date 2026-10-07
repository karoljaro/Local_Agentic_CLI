import {
	BoxRenderable,
	RGBA,
	SelectRenderable,
	SelectRenderableEvents,
	TextRenderable,
	type CliRenderer,
	type SelectOption,
} from '@opentui/core';
import type { PresentationRuntime } from './types';

export class ModelPicker {
	readonly root: BoxRenderable;
	readonly input: SelectRenderable;
	readonly load: Promise<void>;
	private readonly status: TextRenderable;
	private readonly request = new AbortController();
	private closed = false;

	constructor(
		renderer: CliRenderer,
		runtime: PresentationRuntime,
		onSelect: (modelName: string) => void,
		onCancel: () => void,
	) {
		const background = RGBA.defaultBackground();
		this.root = new BoxRenderable(renderer, {
			id: 'model-picker',
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
			maxWidth: 72,
			height: 16,
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
				content: 'Choose a model',
				fg: '#8bbcd1',
				height: 1,
				flexShrink: 0,
			}),
		);
		const status = new TextRenderable(renderer, {
			content: 'Loading available models…',
			fg: '#888888',
			height: 1,
			flexShrink: 0,
			truncate: true,
		});
		this.status = status;
		panel.add(status);
		this.input = new SelectRenderable(renderer, {
			id: 'model-choices',
			flexGrow: 1,
			minHeight: 0,
			flexShrink: 1,
			options: [],
			itemSpacing: 0,
			showDescription: false,
			backgroundColor: background,
			focusedBackgroundColor: background,
			selectedBackgroundColor: background,
			textColor: RGBA.defaultForeground(),
			focusedTextColor: RGBA.defaultForeground(),
			selectedTextColor: '#8bbcd1',
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
			if (!this.closed && !this.request.signal.aborted) onSelect(option.value as string);
		});
		panel.add(this.input);
		panel.add(
			new TextRenderable(renderer, {
				content: 'Esc close · Enter select · ↑↓ choose',
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
				const models = await runtime.listModels(this.request.signal);
				if (this.closed || this.request.signal.aborted) return;
				const current = runtime.getModelName();
				input.options = models.map(
					(model): SelectOption => ({
						name: `${model.name}${model.name === current ? ' · current' : ''}`,
						description: '',
						value: model.name,
					}),
				);
				panel.height = Math.min(16, Math.max(7, models.length + 5));
				const currentIndex = models.findIndex((model) => model.name === current);
				if (currentIndex >= 0) input.setSelectedIndex(currentIndex);
				status.content = models.length === 0 ? 'No models available' : `Current: ${current}`;
			} catch (error) {
				if (this.closed || this.request.signal.aborted) return;
				status.fg = '#e98282';
				status.content = `Could not load models: ${error instanceof Error ? error.message : String(error)}`;
			}
		})();
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.request.abort();
		this.root.destroyRecursively();
	}

	setError(message: string): void {
		if (this.closed) return;
		this.status.fg = '#e98282';
		this.status.content = message;
	}
}
