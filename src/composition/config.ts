import { z } from 'zod';
import { validateModelContextProfile } from '@/domain/ModelContextProfile';

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
		OLLAMA_BASE_URL: envString('http://localhost:11434').pipe(z.url()),
		OLLAMA_MODEL: z.preprocess(
			(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
			z.string().trim().min(1).optional(),
		),
		HISTORY_EMBEDDING_MODEL: z.preprocess(
			(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
			z.string().trim().min(1).optional(),
		),
		OLLAMA_KEEP_ALIVE: envString('0'),
		SYSTEM_PROMPT: envString('Use workspace-relative paths.'),
		MODEL_CONTEXT_TOKENS: positiveInteger(16_384),
		MODEL_MAX_OUTPUT_TOKENS: positiveInteger(4_096),
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
