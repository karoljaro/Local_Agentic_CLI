import {
	BoxRenderable,
	CliRenderEvents,
	InputRenderable,
	InputRenderableEvents,
	RGBA,
	ScrollBoxRenderable,
	SelectRenderable,
	SelectRenderableEvents,
	TextRenderable,
	type CliRenderer,
	type KeyEvent,
	type SelectOption,
} from '@opentui/core';
import type { SettingsPort } from '@/application/ports/SettingsPort';
import {
	SETTINGS_DEFAULTS,
	SettingsValidationError,
	parseSettingInput,
	type SettingKey,
	type SettingsValues,
} from '@/domain/UserSettings';
import { isAbortError } from '@/application/services/cancellation';
import {
	operationError,
	safeDiagnosticText,
	type OperationError,
} from './formatters/operationError';

const FIELDS: { key: SettingKey; category: string; label: string; hint: string }[] = [
	{
		key: 'ollamaBaseUrl',
		category: 'Ollama',
		label: 'Server URL',
		hint: 'Absolute HTTP/HTTPS URL. Saved endpoint takes effect after restart.',
	},
	{
		key: 'lastSelectedModel',
		category: 'Ollama',
		label: 'Default model',
		hint: 'Enter opens the existing model picker. R restores automatic startup selection; current selection remains until restart.',
	},
	{
		key: 'keepAlive',
		category: 'Ollama',
		label: 'Keep alive',
		hint: 'Retention after a request. Explicit model switching still unloads the previous model; activation uses provider retention.',
	},
	{
		key: 'contextWindowTokens',
		category: 'Inference',
		label: 'Context window',
		hint: '8192–1048576 tokens. Output and safety reserve must leave at least 4096 input tokens. Models may support less.',
	},
	{
		key: 'maxOutputTokens',
		category: 'Inference',
		label: 'Max output tokens',
		hint: '1–262144 tokens, within context/output/safety budgets. Applies to new turns; active turns retain their snapshot.',
	},
];
const KEEP_ALIVE: SelectOption[] = [
	{ name: 'Unload after request · 0', description: '', value: '0' },
	{ name: 'Retain for 5 minutes', description: '', value: '5m' },
	{ name: 'Retain for 30 minutes', description: '', value: '30m' },
	{ name: 'Retain indefinitely · -1', description: '', value: '-1' },
	{ name: 'Provider default', description: '', value: 'default' },
];

/** Native modal with one explicitly confirmed edit, no model/configuration work in rendering. */
export class SettingsView {
	readonly root: BoxRenderable;
	readonly input: SelectRenderable;
	private readonly panel: BoxRenderable;
	private readonly status: TextRenderable;
	private readonly details: TextRenderable;
	private readonly scroll: ScrollBoxRenderable;
	private readonly footer: TextRenderable;
	private readonly onResize: () => void;
	private editor: InputRenderable | SelectRenderable | null = null;
	private editing: SettingKey | null = null;
	private request: AbortController | null = null;
	private readonly pending = new Set<Promise<void>>();
	private closed = false;
	constructor(
		private readonly renderer: CliRenderer,
		private readonly settings: SettingsPort,
		private readonly getModelName: () => string | undefined,
		private readonly onModel: () => boolean,
		private readonly onClose: () => void,
		private readonly onError: (error: OperationError) => void,
	) {
		const background = RGBA.defaultBackground();
		this.root = new BoxRenderable(renderer, {
			id: 'settings-view',
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
		this.panel = new BoxRenderable(renderer, {
			width: '100%',
			maxWidth: 88,
			height: '100%',
			maxHeight: 20,
			minHeight: 0,
			border: true,
			borderColor: '#888888',
			paddingX: 1,
			overflow: 'hidden',
			backgroundColor: background,
			flexDirection: 'column',
		});
		const title = new TextRenderable(renderer, {
			content: 'Settings',
			fg: '#8bbcd1',
			height: 1,
			flexShrink: 0,
			selectable: false,
		});
		this.panel.add(title);
		const path = new TextRenderable(renderer, {
			id: 'settings-path',
			content: safeDiagnosticText(settings.getSnapshot().path, 2048),
			fg: '#888888',
			height: 1,
			flexShrink: 0,
			truncate: true,
			selectable: false,
		});
		this.panel.add(path);
		this.status = new TextRenderable(renderer, {
			id: 'settings-status',
			fg: '#8bbcd1',
			height: 1,
			flexShrink: 0,
			truncate: true,
			selectable: false,
		});
		this.panel.add(this.status);
		this.input = new SelectRenderable(renderer, {
			id: 'settings-choices',
			height: FIELDS.length,
			minHeight: 1,
			flexShrink: 0,
			itemSpacing: 0,
			showDescription: false,
			backgroundColor: background,
			focusedBackgroundColor: background,
			selectedBackgroundColor: background,
			textColor: RGBA.defaultForeground(),
			selectedTextColor: '#8bbcd1',
			onMouseUp: (event) => {
				if (this.closed || this.editor || this.request || event.button !== 0 || event.isDragging)
					return;
				const index = this.visibleFirst(this.input) + event.y - this.input.y;
				if (index >= 0 && index < FIELDS.length) {
					this.input.setSelectedIndex(index);
					this.input.selectCurrent();
					event.stopPropagation();
				}
			},
		});
		this.input.on(SelectRenderableEvents.SELECTION_CHANGED, () => this.refreshDetails());
		this.input.on(SelectRenderableEvents.ITEM_SELECTED, () => this.edit());
		this.panel.add(this.input);
		const scroll = new ScrollBoxRenderable(renderer, {
			id: 'settings-details-scroll',
			flexGrow: 1,
			flexShrink: 1,
			minHeight: 0,
			scrollX: false,
			scrollY: true,
			scrollbarOptions: { visible: false },
		});
		this.details = new TextRenderable(renderer, {
			id: 'settings-details',
			width: '100%',
			wrapMode: 'char',
			fg: '#888888',
			selectable: false,
		});
		scroll.add(this.details);
		this.scroll = scroll;
		this.panel.add(scroll);
		this.footer = new TextRenderable(renderer, {
			content: '↑↓ choose · Enter edit · R reset · Esc back',
			fg: '#888888',
			height: 1,
			flexShrink: 0,
			truncate: true,
			selectable: false,
		});
		this.panel.add(this.footer);
		this.root.add(this.panel);
		this.onResize = () => {
			const compact = this.renderer.height < 10;
			this.panel.border = !compact;
			path.visible = !compact;
			title.visible = this.renderer.height >= 6;
			this.input.height = Math.min(
				FIELDS.length,
				Math.max(1, this.renderer.height - (compact ? 3 : 10)),
			);
			if (this.editor instanceof SelectRenderable)
				this.editor.height = Math.min(
					this.editor.options.length,
					Math.max(1, this.renderer.height - (compact ? 3 : 10)),
				);
			this.updateFooter();
			this.refresh();
		};
		this.renderer.on(CliRenderEvents.RESIZE, this.onResize);
		this.onResize();
		this.refresh();
	}
	get isEditing(): boolean {
		return this.editor !== null;
	}
	focus(): void {
		(this.editor ?? this.input).focus();
	}
	refresh(): void {
		if (this.closed) return;
		const index = this.input.getSelectedIndex();
		const { saved, effective, problem, readOnly } = this.settings.getSnapshot();
		this.input.options = FIELDS.map(({ key, category, label }) => {
			const heading =
				this.renderer.width < 44
					? key === 'maxOutputTokens'
						? 'Max output'
						: key === 'contextWindowTokens'
							? 'Context'
							: label
					: `${category} · ${label}`;
			return {
				name: `${heading}  ${safeDiagnosticText(String(saved[key] ?? 'Automatic'), 2048)}${key === 'ollamaBaseUrl' && saved[key] !== effective[key] ? ' · Restart required' : ''}`,
				description: '',
				value: key,
			};
		});
		this.input.setSelectedIndex(index);
		if (problem)
			this.status.content = readOnly
				? 'Configuration unavailable · read-only · repair file and restart'
				: 'Legacy configuration invalid · edit and save preferences';
		this.refreshDetails();
	}
	private refreshDetails(error?: string): void {
		if (this.closed) return;
		const field = FIELDS[this.input.getSelectedIndex()]!;
		const { saved, effective, sources, problem } = this.settings.getSnapshot();
		const value = String(saved[field.key] ?? 'Automatic');
		const current =
			field.key === 'lastSelectedModel'
				? (this.getModelName() ?? 'None confirmed')
				: String(effective[field.key]);
		this.details.content = safeDiagnosticText(
			[
				error ? `Validation: ${error}` : '',
				`${field.label} · ${sources[field.key]}`,
				`${sources[field.key] === 'saved' ? 'Saved preference' : 'Startup preference'}: ${value}`,
				`Currently effective: ${current}`,
				field.hint,
				problem ?? '',
			]
				.filter(Boolean)
				.join('\n'),
			4000,
		);
		if (error) this.scroll.scrollTo(0);
	}
	private edit(reset = false): void {
		if (this.closed || this.editor || this.request) return;
		const snapshot = this.settings.getSnapshot();
		if (snapshot.problem && snapshot.readOnly) {
			this.onError(
				operationError(
					'Could not edit settings',
					'Settings — configuration',
					'Repair the preserved configuration file and restart.',
					snapshot.problem,
				),
			);
			return;
		}
		const field = FIELDS[this.input.getSelectedIndex()]!;
		if (field.key === 'lastSelectedModel' && !reset) {
			if (!this.onModel())
				this.status.content = 'Model selection waits for the current turn/session load';
			return;
		}
		this.editing = field.key;
		this.input.blur();
		this.input.visible = false;
		this.status.content = `${reset ? 'Reset' : 'Edit'} ${field.label}`;
		const value = reset ? SETTINGS_DEFAULTS[field.key] : snapshot.saved[field.key];
		if (field.key === 'keepAlive' || field.key === 'lastSelectedModel') {
			const options =
				field.key === 'lastSelectedModel'
					? [{ name: 'Automatic model selection on restart', description: '', value: null }]
					: [...KEEP_ALIVE];
			if (!options.some((option) => option.value === value))
				options.push({ name: `Current duration · ${value}`, description: '', value });
			const input = new SelectRenderable(this.renderer, {
				id: 'settings-enum',
				height: Math.min(
					options.length,
					Math.max(1, this.renderer.height - (this.renderer.height < 10 ? 3 : 10)),
				),
				minHeight: 1,
				flexShrink: 0,
				options,
				selectedIndex: Math.max(
					0,
					options.findIndex((option) => option.value === value),
				),
				showDescription: false,
				itemSpacing: 0,
				backgroundColor: RGBA.defaultBackground(),
				focusedBackgroundColor: RGBA.defaultBackground(),
				selectedBackgroundColor: RGBA.defaultBackground(),
				textColor: RGBA.defaultForeground(),
				selectedTextColor: '#8bbcd1',
				onMouseUp: (event) => {
					if (this.request || this.closed || event.button !== 0 || event.isDragging) return;
					const index = this.visibleFirst(input) + event.y - input.y;
					if (index >= 0 && index < input.options.length) {
						input.setSelectedIndex(index);
						input.selectCurrent();
						event.stopPropagation();
					}
				},
			});
			input.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option: SelectOption) =>
				this.save(option.value),
			);
			this.editor = input;
		} else {
			const input = new InputRenderable(this.renderer, {
				id: 'settings-editor',
				value: String(value),
				maxLength: field.key === 'ollamaBaseUrl' ? 2048 : 10,
				flexShrink: 0,
				backgroundColor: RGBA.defaultBackground(),
				focusedBackgroundColor: RGBA.defaultBackground(),
				textColor: RGBA.defaultForeground(),
				cursorColor: '#8bbcd1',
			});
			input.on(InputRenderableEvents.ENTER, () => {
				try {
					this.save(parseSettingInput(field.key, input.value));
				} catch (error) {
					this.refreshDetails((error as Error).message);
				}
			});
			this.editor = input;
		}
		this.panel.insertBefore(
			this.editor,
			this.panel.getChildren().find((node) => node.id === 'settings-details-scroll')!,
		);
		this.updateFooter();
		this.refreshDetails();
		this.focus();
	}
	private save(value: SettingsValues[SettingKey]): void {
		if (this.request || !this.editing || this.closed) return;
		const key = this.editing;
		const request = new AbortController();
		this.request = request;
		this.status.content = 'Saving settings…';
		const work = (async () => {
			try {
				const snapshot = await this.settings.set(key, value, request.signal);
				if (this.closed || this.request !== request) return;
				this.finishEdit();
				this.refresh();
				this.status.content =
					(key === 'ollamaBaseUrl' &&
						snapshot.saved.ollamaBaseUrl !== snapshot.effective.ollamaBaseUrl) ||
					key === 'lastSelectedModel'
						? 'Saved · Restart required'
						: key === 'keepAlive'
							? 'Saved · Next provider request'
							: 'Saved · Next turn';
			} catch (error) {
				if (this.closed || this.request !== request) return;
				if (isAbortError(error)) this.status.content = 'Save cancelled · Enter retry · Esc back';
				else if (error instanceof SettingsValidationError) {
					this.status.content = 'Invalid value · edit and retry';
					this.refreshDetails(error.message);
				} else {
					this.status.content = 'Save failed · previous value retained';
					this.onError(
						operationError(
							'Could not save settings',
							'Settings — persistence',
							'The setting was not saved. Previous effective configuration is retained.',
							error,
						),
					);
				}
			} finally {
				if (this.request === request) this.request = null;
			}
		})();
		this.pending.add(work);
		void work.finally(() => this.pending.delete(work));
	}
	private finishEdit(): void {
		this.editor?.destroyRecursively();
		this.editor = null;
		this.editing = null;
		this.input.visible = true;
		this.footer.content = '↑↓ choose · Enter edit · R reset · Esc back';
		this.updateFooter();
		this.focus();
	}
	handleKey(key: KeyEvent): boolean {
		if (this.request) {
			if (key.name === 'escape') {
				this.request.abort();
				this.status.content = 'Cancelling save…';
			}
			return true;
		}
		if (key.name === 'escape') {
			if (this.editor) {
				this.finishEdit();
				this.status.content = 'Edit cancelled';
				this.refresh();
			} else this.onClose();
			return true;
		}
		if (key.name === 'pageup' || key.name === 'pagedown') {
			this.scroll.scrollBy(key.name === 'pageup' ? -1 : 1, 'viewport');
			return true;
		}
		if (!this.editor && key.name === 'r' && !key.ctrl && !key.meta) {
			this.edit(true);
			return true;
		}
		if (!this.editor && (key.name === 'home' || key.name === 'end')) {
			this.input.setSelectedIndex(key.name === 'home' ? 0 : FIELDS.length - 1);
			return true;
		}
		return false;
	}
	whenIdle(): Promise<void> {
		return Promise.allSettled([...this.pending]).then(() => undefined);
	}
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.request?.abort();
		this.renderer.off(CliRenderEvents.RESIZE, this.onResize);
		this.root.destroyRecursively();
	}
	private visibleFirst(input: SelectRenderable): number {
		const visible = Math.max(1, Math.floor(input.height));
		return Math.max(
			0,
			Math.min(input.getSelectedIndex() - Math.floor(visible / 2), input.options.length - visible),
		);
	}
	private updateFooter(): void {
		this.footer.content =
			this.renderer.width < 44
				? this.editor
					? 'Enter save · Esc back'
					: '↑↓ Enter R Esc'
				: this.editor
					? 'Enter save · Esc cancel · PgUp/PgDn details'
					: '↑↓ choose · Enter edit · R reset · Esc back · PgUp/PgDn details';
	}
}
