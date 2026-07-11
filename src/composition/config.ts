import { z } from 'zod';

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

const ConfigSchema = z.object({
	OLLAMA_BASE_URL: envString('http://localhost:11434').pipe(z.url()),
	OLLAMA_MODEL: envString('gemma4:12b-it-qat'),
	OLLAMA_KEEP_ALIVE: envString('0'),
	SYSTEM_PROMPT: envString('You are a local coding agent.'),
	MAX_CONTEXT_CHARACTERS: positiveInteger(120_000),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const readConfig = (env: EnvSource = Bun.env): AppConfig => {
	const result = ConfigSchema.safeParse(env);

	if (!result.success) {
		throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
	}

	return result.data;
};
