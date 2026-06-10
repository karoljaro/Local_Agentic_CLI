import { z } from 'zod';

type EnvSource = Record<string, string | undefined>;

const envString = (defaultValue: string) =>
	z.preprocess(
		(value) =>
			typeof value === 'string' && value.trim() === ''
				? undefined
				: value,
		z.string().trim().min(1).default(defaultValue)
	);

const ConfigSchema = z.object({
	OLLAMA_BASE_URL: envString('http://localhost:11434').pipe(z.url()),
	OLLAMA_MODEL: envString('gemma4:12b-it-qat'),
	SYSTEM_PROMPT: envString('You are a local coding agent.'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const readConfig = (env: EnvSource = Bun.env): AppConfig => {
	const result = ConfigSchema.safeParse(env);

	if (!result.success) {
		throw new Error(
			`Invalid configuration:\n${z.prettifyError(result.error)}`
		);
	}

	return result.data;
};
