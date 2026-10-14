import { z } from 'zod';
import { validateModelContextProfile } from '@/domain/ModelContextProfile';
import { SETTINGS_DEFAULTS, EndpointSchema } from '@/domain/UserSettings';

type EnvSource = Record<string, string | undefined>;

const envString = (defaultValue: string) =>
	z.preprocess(
		(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
		z.string().trim().min(1).default(defaultValue),
	);

const positiveInteger = (defaultValue: number) =>
	z.preprocess(
		(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
		z.coerce.number().int().positive().default(defaultValue),
	);

const ConfigSchema = z
	.object({
		OLLAMA_BASE_URL: envString(SETTINGS_DEFAULTS.ollamaBaseUrl).pipe(EndpointSchema),
		OLLAMA_MODEL: z.preprocess(
			(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
			z.string().trim().min(1).optional(),
		),
		HISTORY_EMBEDDING_MODEL: z.preprocess(
			(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
			z.string().trim().min(1).optional(),
		),
		OLLAMA_KEEP_ALIVE: envString(SETTINGS_DEFAULTS.keepAlive),
		SYSTEM_PROMPT: envString(
			'Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly. Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work. ' +
				'Respect user/repository command restrictions and required checks. Verify material changes with bounded proportionate run_process checks from instructions/configuration/CI or user/prior successful commands; reuse known commands. Tiny text edits or unavailable/disproportionate checks may remain unverified. Read exit status/stdout/stderr: non-zero exits are diagnostic results, not tool failures. Repair only evidenced failures relevant to requested work; inspect narrowly if uncertain. Reverify repairs when useful. Stop when failure persists without new evidence, fixes are speculative/unrelated or broaden scope, execution is denied/unavailable, or timeout/output prevents safe progress. No automatic dependency installation, downloads or network recovery. Never claim checks passed or failures fixed without current-task tool or trustworthy user evidence; edits alone prove neither. Report verified scope and failed/unrun/blocked/inconclusive checks; disclose repairs without re-verification.',
		),
		MODEL_CONTEXT_TOKENS: positiveInteger(SETTINGS_DEFAULTS.contextWindowTokens),
		MODEL_MAX_OUTPUT_TOKENS: positiveInteger(SETTINGS_DEFAULTS.maxOutputTokens),
	})
	.superRefine((config, ctx) => {
		try {
			validateModelContextProfile({
				contextWindowTokens: config.MODEL_CONTEXT_TOKENS,
				maxOutputTokens: config.MODEL_MAX_OUTPUT_TOKENS,
			});
		} catch (error) {
			ctx.addIssue({
				code: 'custom',
				path: ['MODEL_MAX_OUTPUT_TOKENS'],
				message: (error as Error).message,
			});
		}
	});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const readConfig = (env: EnvSource = Bun.env): AppConfig => {
	const result = ConfigSchema.safeParse(env);

	if (!result.success) {
		throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
	}

	return result.data;
};
