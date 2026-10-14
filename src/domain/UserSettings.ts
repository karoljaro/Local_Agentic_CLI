import { z } from 'zod';
import { validateModelContextProfile } from './ModelContextProfile';

export const SETTINGS_MAX_BYTES = 16_384;
export type SettingsValues = {
	ollamaBaseUrl: string;
	lastSelectedModel: string | null;
	keepAlive: string;
	contextWindowTokens: number;
	maxOutputTokens: number;
};
export const SETTINGS_DEFAULTS: Readonly<SettingsValues> = Object.freeze({
	ollamaBaseUrl: 'http://localhost:11434',
	lastSelectedModel: null as string | null,
	keepAlive: '0',
	contextWindowTokens: 16_384,
	maxOutputTokens: 4_096,
});
export type SettingKey = keyof SettingsValues;
export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS) as SettingKey[];

export const EndpointSchema = z
	.string()
	.trim()
	.min(1)
	.max(2048)
	.superRefine((value, ctx) => {
		let valid = false;
		try {
			const url = new URL(value);
			const host = url.hostname.replace(/\.$/, '');
			valid =
				/^https?:\/\//i.test(value) &&
				['http:', 'https:'].includes(url.protocol) &&
				!/[\s\\\x00-\x1f\x7f?#]/.test(value) &&
				!url.username &&
				!url.password &&
				!/^https?:\/\/[^/]*@/i.test(value) &&
				(host.startsWith('[') ||
					host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)));
		} catch {
			/* Report a safe message, never echo credentials or the input. */
		}
		if (!valid)
			ctx.addIssue({
				code: 'custom',
				message:
					'Use an absolute HTTP/HTTPS URL with a valid host/port, without credentials, query or fragment.',
			});
	});

export const ModelPreferenceSchema = z
	.string()
	.trim()
	.min(1)
	.max(256)
	.regex(/^[^\s\x00-\x1f\x7f]+$/, 'Model names cannot contain whitespace or terminal controls.');
export const KeepAliveSchema = z
	.string()
	.trim()
	.max(32)
	.refine(
		(value) => ['default', '0', '-1'].includes(value) || /^[1-9]\d{0,6}(?:ms|s|m|h)$/.test(value),
		'Use 0 (unload after request), -1 (retain), default, or a positive duration such as 5m.',
	);

const Fields = z
	.object({
		ollamaBaseUrl: EndpointSchema,
		lastSelectedModel: ModelPreferenceSchema.nullable(),
		keepAlive: KeepAliveSchema,
		contextWindowTokens: z.number().int().min(8192).max(1_048_576),
		maxOutputTokens: z.number().int().min(1).max(262_144),
	})
	.strict();

export const validateSettingsBudget = (values: SettingsValues, minimumInputTokens = 4096): void => {
	validateModelContextProfile(values);
	const safety = Math.max(128, Math.ceil(values.contextWindowTokens / 16));
	if (values.contextWindowTokens - values.maxOutputTokens - safety < minimumInputTokens)
		throw new Error(
			`Context must leave at least ${minimumInputTokens} input tokens after output and the safety reserve. Increase context or reduce output.`,
		);
};
export const SettingsValuesSchema = Fields.superRefine((values, ctx) => {
	try {
		validateSettingsBudget(values);
	} catch (error) {
		ctx.addIssue({ code: 'custom', path: ['maxOutputTokens'], message: (error as Error).message });
	}
});
export const SettingsDocumentSchema = z
	.object({
		version: z.literal(1),
		preferences: Fields.partial(),
	})
	.strict()
	.superRefine((document, ctx) => {
		const result = SettingsValuesSchema.safeParse({
			...SETTINGS_DEFAULTS,
			...document.preferences,
		});
		if (!result.success)
			for (const issue of result.error.issues)
				ctx.addIssue({
					code: 'custom',
					path: ['preferences', ...issue.path],
					message: issue.message,
				});
	});
export type SettingsDocument = z.infer<typeof SettingsDocumentSchema>;

export class SettingsValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SettingsValidationError';
	}
}
export const parseSettingsDocument = (value: unknown): SettingsDocument => {
	if (typeof value === 'object' && value !== null && 'version' in value && value.version !== 1)
		throw new SettingsValidationError(
			'Unsupported settings schema version. Original file preserved; update Codesh or restore a version 1 file.',
		);
	const result = SettingsDocumentSchema.safeParse(value);
	if (!result.success)
		throw new SettingsValidationError(
			'Invalid settings. Original file preserved. ' +
				result.error.issues
					.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
					.join('; ')
					.slice(0, 1200),
		);
	return result.data;
};
export const resolveSettingsValues = (document?: SettingsDocument): SettingsValues =>
	SettingsValuesSchema.parse({ ...SETTINGS_DEFAULTS, ...document?.preferences });

export const parseSettingInput = (key: SettingKey, value: string): SettingsValues[SettingKey] => {
	if (key === 'contextWindowTokens' || key === 'maxOutputTokens') {
		if (!/^\d+$/.test(value.trim()))
			throw new SettingsValidationError('Enter a positive whole number.');
		return Number(value.trim());
	}
	return value.trim();
};
