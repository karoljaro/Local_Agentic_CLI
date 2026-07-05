import type { IdGeneratorPort } from '@/application/ports/IdGeneratorPort';
import type {
	ListModelsOptions,
	ListModelsResult,
	ModelCatalogPort,
} from '@/application/ports/ModelCatalogPort';
import type { ModelMemoryPort, ModelPort, UnloadModelInput } from '@/application/ports/ModelPort';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { RunAgentTurn, type ToolApprovalHandler } from '@/application/use-cases/RunAgentTurn';
import { OllamaModelAdapter } from '@/infrastructure/model/OllamaModelAdapter';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { TemporalClock } from '@/infrastructure/runtime/TemporalClock';
import { readConfig, type AppConfig } from '@/composition/config';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { LoadSession } from '@/application/use-cases/LoadSession';
import { ListSessionEvents } from '@/application/use-cases/ListSessionEvents';
import { ListSessions } from '@/application/use-cases/ListSessions';
import { OllamaModelCatalog } from '@/infrastructure/model/OllamaModelCatalog';

export type RuntimeListModelsOptions = ListModelsOptions & {
	forceRefresh?: boolean | undefined;
};

export type Runtime = {
	runAgentTurn: RunAgentTurn;
	loadSession: LoadSession;
	listSessionEvents: ListSessionEvents;
	listSessions: ListSessions;
	idGenerator: IdGeneratorPort;
	workspacePath: string;
	getModelName: () => string;
	listModels: (options?: RuntimeListModelsOptions) => Promise<ListModelsResult>;
	unloadCurrentModel: (input?: UnloadModelInput) => Promise<void>;
	switchModel: (modelName: string) => string;
	setToolApprovalHandler: (handler: ToolApprovalHandler) => () => void;
};

export const createRuntime = (config: AppConfig = readConfig()): Runtime => {
	const sessionStore = new JsonlSessionStore();

	let currentModelName = normalizeModelName(config.OLLAMA_MODEL);
	let currentModel = createOllamaModel(config, currentModelName);

	const model: ModelPort = {
		streamChat: (input) => currentModel.streamChat(input),
	};
	const modelCatalog: ModelCatalogPort = new OllamaModelCatalog(config.OLLAMA_BASE_URL);
	let modelListCache: ListModelsResult | undefined;
	let modelListPromise: Promise<ListModelsResult> | undefined;

	const idGenerator = new BunUuidV7IdGenerator();
	const clock = new TemporalClock();
	const toolExecutor = createLocalToolExecutor();
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
		listModels: async (options = {}) => {
			if (options.forceRefresh !== true && modelListCache !== undefined) {
				return modelListCache;
			}

			if (options.forceRefresh !== true && modelListPromise !== undefined) {
				return modelListPromise;
			}

			const loadModels = modelCatalog
				.listModels({ signal: options.signal })
				.then((result) => {
					modelListCache = result;
					return result;
				})
				.finally(() => {
					if (modelListPromise === loadModels) {
						modelListPromise = undefined;
					}
				});

			modelListPromise = loadModels;

			return loadModels;
		},
		unloadCurrentModel: (input) => currentModel.unload(input),
		switchModel: (modelName) => {
			currentModelName = normalizeModelName(modelName);
			currentModel = createOllamaModel(config, currentModelName);

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

const createOllamaModel = (
	config: AppConfig,
	modelName: string,
): OllamaModelAdapter & ModelMemoryPort =>
	new OllamaModelAdapter(config.OLLAMA_BASE_URL, modelName, config.OLLAMA_KEEP_ALIVE);
