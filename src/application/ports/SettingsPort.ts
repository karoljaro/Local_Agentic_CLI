import type { ModelPreferencePort } from './ModelPreferencePort';
import type { SettingKey, SettingsDocument, SettingsValues } from '@/domain/UserSettings';

export type SettingsSource =
	| 'built-in default'
	| 'saved'
	| 'legacy environment'
	| 'legacy model preference';
export type SettingsSnapshot = {
	path: string;
	saved: SettingsValues;
	effective: SettingsValues;
	sources: Record<SettingKey, SettingsSource>;
	problem?: string;
	readOnly: boolean;
};
export interface SettingsStorePort {
	readonly path: string;
	read(signal?: AbortSignal): Promise<SettingsDocument | undefined>;
	update(
		change: (current: SettingsDocument | undefined) => SettingsDocument,
		signal?: AbortSignal,
	): Promise<SettingsDocument>;
	whenIdle(): Promise<void>;
}
export interface SettingsPort extends ModelPreferencePort {
	getSnapshot(): SettingsSnapshot;
	set(
		key: SettingKey,
		value: SettingsValues[SettingKey],
		signal?: AbortSignal,
	): Promise<SettingsSnapshot>;
	reset(key: SettingKey, signal?: AbortSignal): Promise<SettingsSnapshot>;
	whenIdle(): Promise<void>;
	dispose(): void;
}
