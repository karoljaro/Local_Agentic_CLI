import { join } from 'node:path';
import { SettingsService } from '@/application/services/SettingsService';
import {
	estimateMessageTokens,
	estimateToolTokens,
	ESTIMATED_REQUEST_FRAMING_TOKENS,
} from '@/application/services/ModelRequestEstimator';
import {
	SETTINGS_DEFAULTS,
	SETTING_KEYS,
	SettingsValuesSchema,
	validateSettingsBudget,
	type SettingsDocument,
	type SettingsValues,
} from '@/domain/UserSettings';
import {
	JsonSettingsStore,
	settingsFilePath,
} from '@/infrastructure/persistence/JsonSettingsStore';
import type { SettingsSource } from '@/application/ports/SettingsPort';
import { readConfig } from './config';
import { createRuntime, type Runtime } from './createRuntime';
import { createLocalToolExecutor } from './factories/createLocalToolExecutor';

const LEGACY_ENV = {
	ollamaBaseUrl: 'OLLAMA_BASE_URL',
	lastSelectedModel: 'OLLAMA_MODEL',
	keepAlive: 'OLLAMA_KEEP_ALIVE',
	contextWindowTokens: 'MODEL_CONTEXT_TOKENS',
	maxOutputTokens: 'MODEL_MAX_OUTPUT_TOKENS',
} as const;

/** Production startup loads local preferences before constructing provider/budget consumers. */
export async function createConfiguredRuntime(
	options: {
		env?: Record<string, string | undefined>;
		store?: JsonSettingsStore;
		legacyModelPath?: string;
	} = {},
): Promise<Runtime> {
	const env = options.env ?? Bun.env;
	const store = options.store ?? new JsonSettingsStore(settingsFilePath(env));
	const legacyPath =
		options.legacyModelPath ?? join(process.cwd(), '.agent', 'model-preference.json');
	let document: SettingsDocument | undefined;
	let legacyModel: string | undefined;
	let initial: SettingsValues = { ...SETTINGS_DEFAULTS };
	let problem: string | undefined;
	let readOnly = true;
	const sources: Partial<Record<keyof SettingsValues, SettingsSource>> = {};
	// Operational overrides stay separate; dedicated TEST_MODEL is never read here.
	let config = readConfig({});
	try {
		config = readConfig({
			SYSTEM_PROMPT: env['SYSTEM_PROMPT'],
			HISTORY_EMBEDDING_MODEL: env['HISTORY_EMBEDDING_MODEL'],
		});
	} catch {
		problem =
			'Invalid operational configuration (SYSTEM_PROMPT or HISTORY_EMBEDDING_MODEL). Correct the environment and restart.';
	}
	const fixed =
		ESTIMATED_REQUEST_FRAMING_TOKENS +
		estimateMessageTokens({ role: 'system', content: config.SYSTEM_PROMPT }) +
		createLocalToolExecutor()
			.listTools()
			.reduce((sum, tool) => sum + estimateToolTokens(tool), 0);
	const minimumInputTokens = Math.max(4096, fixed + 1024);
	try {
		document = await store.read();
		if (document) {
			initial = SettingsValuesSchema.parse({ ...SETTINGS_DEFAULTS, ...document.preferences });
		} else {
			const legacy = await store.readLegacyModel(legacyPath);
			legacyModel = legacy;
			// Invalid legacy env can be replaced from Settings; an unreadable/corrupt file cannot.
			readOnly = false;
			const legacyConfig = readConfig(env);
			initial = SettingsValuesSchema.parse({
				ollamaBaseUrl: legacyConfig.OLLAMA_BASE_URL,
				lastSelectedModel: legacy ?? legacyConfig.OLLAMA_MODEL ?? null,
				keepAlive: legacyConfig.OLLAMA_KEEP_ALIVE,
				contextWindowTokens: legacyConfig.MODEL_CONTEXT_TOKENS,
				maxOutputTokens: legacyConfig.MODEL_MAX_OUTPUT_TOKENS,
			});
			for (const key of SETTING_KEYS)
				if (env[LEGACY_ENV[key]]?.trim()) sources[key] = 'legacy environment';
			if (legacy) sources.lastSelectedModel = 'legacy model preference';
			validateSettingsBudget(initial, minimumInputTokens);
			if (legacy && !problem) {
				try {
					document = await store.update(
						(current) => current ?? { version: 1, preferences: initial },
					);
					initial = SettingsValuesSchema.parse({ ...SETTINGS_DEFAULTS, ...document.preferences });
					for (const key of SETTING_KEYS) sources[key] = 'saved';
					// Archive only after confirmed persistence. Failure never loses the migrated preference.
					await store.archiveLegacyModel(legacyPath).catch(() => undefined);
				} catch {
					problem =
						'Could not persist the migrated model preference. Legacy file and selected preference preserved; check settings-directory permissions and restart.';
				}
			}
		}
		validateSettingsBudget(initial, minimumInputTokens);
		readOnly = false;
	} catch (error) {
		problem = `Could not load settings from ${store.path}. ${error instanceof Error ? error.message : 'Settings unavailable.'}`;
		initial = { ...SETTINGS_DEFAULTS, lastSelectedModel: legacyModel ?? null };
		for (const key of SETTING_KEYS) sources[key] = 'built-in default';
		if (legacyModel) sources.lastSelectedModel = 'legacy model preference';
	}
	const settings = new SettingsService(store, {
		initial,
		sources,
		...(document ? { document } : {}),
		...(problem ? { problem } : {}),
		minimumInputTokens,
		readOnly,
	});
	return createRuntime(
		{
			...config,
			OLLAMA_BASE_URL: initial.ollamaBaseUrl,
			OLLAMA_MODEL: undefined,
			OLLAMA_KEEP_ALIVE: initial.keepAlive,
			MODEL_CONTEXT_TOKENS: initial.contextWindowTokens,
			MODEL_MAX_OUTPUT_TOKENS: initial.maxOutputTokens,
		},
		settings,
	);
}
