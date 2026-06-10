import type { IdGeneratorPort } from '@/application/ports/IdGeneratorPort';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { RunAgentTurn } from '@/application/use-cases/RunAgentTurn';
import { OllamaModelAdapter } from '@/infrastructure/model/OllamaModelAdapter';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { TemporalClock } from '@/infrastructure/runtime/TemporalClock';
import { readConfig, type AppConfig } from '@/composition/config';
import { LoadSession } from '@/application/use-cases/LoadSession';

export type Runtime = {
	runAgentTurn: RunAgentTurn;
	loadSession: LoadSession;
	idGenerator: IdGeneratorPort;
};

export const createRuntime = (config: AppConfig = readConfig()): Runtime => {
	const sessionStore = new JsonlSessionStore();

	const model = new OllamaModelAdapter(
		config.OLLAMA_BASE_URL,
		config.OLLAMA_MODEL
	);

	const idGenerator = new BunUuidV7IdGenerator();
	const clock = new TemporalClock();

	const contextBuilder = new ContextBuilder({
		systemPrompt: config.SYSTEM_PROMPT,
	});

	const loadSession = new LoadSession({
		sessionStore,
	});

	return {
		idGenerator,
		loadSession,
		runAgentTurn: new RunAgentTurn({
			sessionStore,
			model,
			contextBuilder,
			clock,
			idGenerator,
		}),
	};
};
