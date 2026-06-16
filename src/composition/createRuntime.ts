import type { IdGeneratorPort } from '@/application/ports/IdGeneratorPort';
import type { ModelPort } from '@/application/ports/ModelPort';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import {
	RunAgentTurn,
	type ToolApprovalHandler,
} from '@/application/use-cases/RunAgentTurn';
import { OllamaModelAdapter } from '@/infrastructure/model/OllamaModelAdapter';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { TemporalClock } from '@/infrastructure/runtime/TemporalClock';
import { LocalToolExecutor } from '@/infrastructure/tools/LocalToolExecutor';
import { readConfig, type AppConfig } from '@/composition/config';
import { LoadSession } from '@/application/use-cases/LoadSession';
import { ListSessionEvents } from '@/application/use-cases/ListSessionEvents';
import { ListSessions } from '@/application/use-cases/ListSessions';

export type Runtime = {
	runAgentTurn: RunAgentTurn;
	loadSession: LoadSession;
	listSessionEvents: ListSessionEvents;
	listSessions: ListSessions;
	idGenerator: IdGeneratorPort;
	workspacePath: string;
	getModelName: () => string;
	switchModel: (modelName: string) => string;
	setToolApprovalHandler: (handler: ToolApprovalHandler) => () => void;
};

export const createRuntime = (config: AppConfig = readConfig()): Runtime => {
	const sessionStore = new JsonlSessionStore();

	let currentModelName = normalizeModelName(config.OLLAMA_MODEL);
	let currentModel = new OllamaModelAdapter(
		config.OLLAMA_BASE_URL,
		currentModelName,
	);

	const model: ModelPort = {
		chat: (input) => currentModel.chat(input),
		streamChat: (input) => currentModel.streamChat(input),
	};

	const idGenerator = new BunUuidV7IdGenerator();
	const clock = new TemporalClock();
	const toolExecutor = new LocalToolExecutor();
	let currentToolApprovalHandler: ToolApprovalHandler = async () => false;

	const contextBuilder = new ContextBuilder({
		systemPrompt: config.SYSTEM_PROMPT,
	});

	const loadSession = new LoadSession({
		sessionStore,
	});

	const listSessions = new ListSessions({
		sessionStore,
	});

	const listSessionEvents = new ListSessionEvents({
		sessionStore,
	});

	return {
		idGenerator,
		loadSession,
		listSessionEvents,
		listSessions,
		workspacePath: process.cwd(),
		getModelName: () => currentModelName,
		switchModel: (modelName) => {
			currentModelName = normalizeModelName(modelName);
			currentModel = new OllamaModelAdapter(
				config.OLLAMA_BASE_URL,
				currentModelName,
			);

			return currentModelName;
		},
		setToolApprovalHandler: (handler) => {
			currentToolApprovalHandler = handler;

			return () => {
				if (currentToolApprovalHandler === handler) {
					currentToolApprovalHandler = async () => false;
				}
			};
		},
		runAgentTurn: new RunAgentTurn({
			sessionStore,
			model,
			contextBuilder,
			clock,
			idGenerator,
			toolExecutor,
			approveToolCall: (request) => currentToolApprovalHandler(request),
		}),
	};
};

const normalizeModelName = (modelName: string): string => {
	const normalizedModelName = modelName.trim();

	if (normalizedModelName.length === 0) {
		throw new Error('Ollama model name cannot be empty.');
	}

	return normalizedModelName;
};
