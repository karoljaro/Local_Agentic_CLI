import type {
	SettingsPort,
	SettingsSnapshot,
	SettingsSource,
	SettingsStorePort,
} from '../ports/SettingsPort';
import { throwIfAborted } from './cancellation';
import {
	SETTINGS_DEFAULTS,
	SETTING_KEYS,
	SettingsValuesSchema,
	SettingsValidationError,
	resolveSettingsValues,
	validateSettingsBudget,
	type SettingsDocument,
	type SettingsValues,
	type SettingKey,
} from '@/domain/UserSettings';

/** One persisted preference owner. Provider identity stays fixed until restart. */
export class SettingsService implements SettingsPort {
	private values: SettingsValues;
	private readonly endpoint: string;
	private readonly startupModel: string | null;
	private sources: Record<SettingKey, SettingsSource>;
	private readonly requests = new Set<AbortController>();
	private disposed = false;
	constructor(
		private readonly store: SettingsStorePort,
		options: {
			document?: SettingsDocument;
			initial?: SettingsValues;
			sources?: Partial<Record<SettingKey, SettingsSource>>;
			problem?: string;
			readOnly?: boolean;
			minimumInputTokens?: number;
		} = {},
	) {
		this.values = SettingsValuesSchema.parse(
			options.initial ?? resolveSettingsValues(options.document),
		);
		this.endpoint = this.values.ollamaBaseUrl;
		this.startupModel = this.values.lastSelectedModel;
		this.problem = options.problem;
		this.blocked = options.readOnly ?? Boolean(options.problem);
		this.minimumInputTokens = options.minimumInputTokens ?? 4096;
		this.sources = Object.fromEntries(
			SETTING_KEYS.map((key) => [
				key,
				options.sources?.[key] ??
					(options.document?.preferences[key] !== undefined ? 'saved' : 'built-in default'),
			]),
		) as Record<SettingKey, SettingsSource>;
	}
	private problem: string | undefined;
	private readonly blocked: boolean;
	private readonly minimumInputTokens: number;
	getSnapshot(): SettingsSnapshot {
		return {
			path: this.store.path,
			saved: { ...this.values },
			effective: {
				...this.values,
				ollamaBaseUrl: this.endpoint,
				lastSelectedModel: this.startupModel,
			},
			sources: { ...this.sources },
			readOnly: Boolean(this.problem && this.blocked),
			...(this.problem ? { problem: this.problem } : {}),
		};
	}
	readLastSelectedModel(): Promise<string | undefined> {
		return Promise.resolve(this.values.lastSelectedModel ?? undefined);
	}
	async writeLastSelectedModel(name: string): Promise<void> {
		await this.set('lastSelectedModel', name);
	}
	reset(key: SettingKey, signal?: AbortSignal): Promise<SettingsSnapshot> {
		return this.set(key, SETTINGS_DEFAULTS[key], signal);
	}
	async set(
		key: SettingKey,
		value: SettingsValues[SettingKey],
		signal?: AbortSignal,
	): Promise<SettingsSnapshot> {
		if (this.disposed) throw new DOMException('Settings service is closed.', 'AbortError');
		if (this.problem && this.blocked)
			throw new Error(this.problem + ' Repair the file and restart before saving.');
		const request = new AbortController();
		const cancel = () => request.abort();
		signal?.addEventListener('abort', cancel, { once: true });
		if (signal?.aborted) cancel();
		this.requests.add(request);
		try {
			throwIfAborted(request.signal);
			const document = await this.store.update((current) => {
				const candidate = {
					...(current ? resolveSettingsValues(current) : this.values),
					[key]: value,
				};
				const result = SettingsValuesSchema.safeParse(candidate);
				if (!result.success)
					throw new SettingsValidationError(
						result.error.issues.map((issue) => issue.message).join('; '),
					);
				try {
					validateSettingsBudget(result.data, this.minimumInputTokens);
				} catch (error) {
					throw new SettingsValidationError((error as Error).message);
				}
				return { version: 1, preferences: result.data };
			}, request.signal);
			// Rename is the commit point. Cancellation after it must not hide a completed write.
			this.values = resolveSettingsValues(document);
			this.problem = undefined;
			this.sources = Object.fromEntries(SETTING_KEYS.map((field) => [field, 'saved'])) as Record<
				SettingKey,
				SettingsSource
			>;
			return this.getSnapshot();
		} finally {
			signal?.removeEventListener('abort', cancel);
			this.requests.delete(request);
		}
	}
	whenIdle(): Promise<void> {
		return this.store.whenIdle();
	}
	dispose(): void {
		this.disposed = true;
		for (const request of this.requests) request.abort();
	}
}
