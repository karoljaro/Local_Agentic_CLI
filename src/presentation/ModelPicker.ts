import {
	BoxRenderable,
	RGBA,
	SelectRenderable,
	SelectRenderableEvents,
	TextRenderable,
	type CliRenderer,
	type SelectOption,
	type KeyEvent,
} from '@opentui/core';
import { isAbortError } from '@/application/services/cancellation';
import { operationError, type OperationError } from './formatters/operationError';
import type { PresentationRuntime } from './types';

export class ModelPicker {
	readonly root: BoxRenderable;
	readonly input: SelectRenderable;
	readonly load: Promise<void>;
	private readonly status: TextRenderable;
	private request: AbortController | null = null;
	private readonly panel: BoxRenderable;
	private readonly pending = new Set<Promise<void>>();
	private closed = false;
	private applying = false;

	constructor(
		renderer: CliRenderer,
		private readonly runtime: PresentationRuntime,
		onSelect: (modelName: string) => void,
		onCancel: () => void,
		private readonly onError: (error: OperationError) => void,
		private readonly onSettled: () => void,
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
		this.panel = panel;
		panel.add(
			new TextRenderable(renderer, {
				content: 'Choose a model',
				fg: '#8bbcd1',
				height: 1,
				flexShrink: 0,
			}),
		);
		const status = new TextRenderable(renderer, {
			content: 'Fetching available models…',
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
			onMouse: (event) => {
				if (this.request || this.applying || this.closed) return;
				const input = this.input;
				if (event.type === 'scroll') {
					if (event.scroll?.direction === 'up') input.moveUp();
					else if (event.scroll?.direction === 'down') input.moveDown();
					event.stopPropagation();
				} else if (event.type === 'up' && event.button === 0 && !event.isDragging) {
					// OpenTUI 0.5.14 Select has no mouse action; match its documented
					// installed one-line item layout and centered scroll window.
					const visible = Math.max(1, Math.floor(input.height));
					const first = Math.max(
						0,
						Math.min(
							input.getSelectedIndex() - Math.floor(visible / 2),
							input.options.length - visible,
						),
					);
					const index = first + event.y - input.y;
					if (index >= 0 && index < input.options.length) {
						input.setSelectedIndex(index);
						input.selectCurrent();
					}
					event.stopPropagation();
				}
			},
			onKeyDown: (key) => {
				if (key.name === 'escape') {
					key.preventDefault();
					onCancel();
				}
			},
		});
		this.input.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: SelectOption) => {
			if (!this.closed && !this.request) onSelect(option.value as string);
		});
		panel.add(this.input);
		panel.add(
			new TextRenderable(renderer, {
				content: 'Esc close · Enter select · ↑↓ choose · R refresh',
				fg: '#888888',
				height: 1,
				flexShrink: 0,
				truncate: true,
			}),
		);
		this.root.add(panel);
		this.load = this.refresh();
	}

	refresh(): Promise<void> {
		if (this.closed || this.request) return Promise.resolve();
		const request = new AbortController();
		this.request = request;
		this.status.content = 'Fetching available models…';
		this.input.options = [];
		const work = (async () => {
			try {
				const models = await this.runtime.listModels(request.signal, { forceRefresh: true });
				if (this.closed || request.signal.aborted || this.request !== request) return;
				const current = this.runtime.getModelName();
				this.input.options = models.map(
					(model): SelectOption => ({
						name: `${model.name}${model.name === current ? ' · current' : ''}`,
						description: '',
						value: model.name,
					}),
				);
				this.panel.height = Math.min(16, Math.max(7, models.length + 5));
				const currentIndex = models.findIndex((model) => model.name === current);
				if (currentIndex >= 0) this.input.setSelectedIndex(currentIndex);
				this.status.content =
					models.length === 0
						? 'No models available · install one in your provider'
						: current === undefined
							? 'No model selected · choose one'
							: `Current: ${current}`;
			} catch (error) {
				if (
					this.closed ||
					request.signal.aborted ||
					this.request !== request ||
					isAbortError(error)
				)
					return;
				this.status.content = 'Models unavailable · R refresh';
				this.onError(
					operationError(
						'Could not load models',
						'Ollama — model discovery',
						'The model list could not be retrieved.',
						error,
					),
				);
			} finally {
				if (this.request === request) this.request = null;
				if (!this.closed) this.onSettled();
			}
		})();
		this.pending.add(work);
		void work.finally(() => this.pending.delete(work));
		return work;
	}

	handleKey(key: KeyEvent): boolean {
		if (key.name === 'r' && !key.ctrl && !key.meta) {
			void this.refresh();
			return true;
		}
		return Boolean(this.request);
	}

	whenIdle(): Promise<void> {
		return Promise.allSettled([...this.pending]).then(() => undefined);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.request?.abort();
		this.root.destroyRecursively();
	}

	setApplying(name: string): void {
		if (this.closed) return;
		this.applying = true;
		this.status.content = `Applying model selection… ${name}`;
	}
	setCurrent(): void {
		this.applying = false;
		if (!this.closed)
			this.status.content = `Current: ${this.runtime.getModelName() ?? 'none'} · R refresh`;
	}
}
