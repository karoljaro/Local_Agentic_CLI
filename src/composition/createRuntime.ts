import type { ListedModel } from '@/application/ports/ModelCatalogPort';
import type { UnloadModelInput } from '@/application/ports/ModelPort';
import { HistoryRetriever } from '@/application/services/HistoryRetriever';
import { OllamaEmbeddingAdapter } from '@/infrastructure/model/OllamaEmbeddingAdapter';
import { BinaryHistoryIndexStore } from '@/infrastructure/persistence/BinaryHistoryIndexStore';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import {
	InMemoryAgentMetrics,
	type AgentMetricsSnapshot,
} from '@/application/services/InMemoryAgentMetrics';
import { SessionService } from '@/application/services/SessionService';
import { RunAgentTurn, type ToolApprovalHandler } from '@/application/use-cases/RunAgentTurn';
import { readConfig, type AppConfig } from '@/composition/config';
import {
	OllamaModelRuntime,
	type RuntimeListModelsOptions,
} from '@/composition/model/OllamaModelRuntime';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { PerformanceMonotonicClock } from '@/infrastructure/runtime/PerformanceMonotonicClock';
import { TemporalClock } from '@/infrastructure/runtime/TemporalClock';
import type { SessionId } from '@/domain/Ids';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { StoredSession } from '@/application/ports/SessionStorePort';
import type { ModelSelectionState } from '@/application/services/ModelSelection';

export type { RuntimeListModelsOptions } from '@/composition/model/OllamaModelRuntime';
export type { AgentMetricsSnapshot } from '@/application/services/InMemoryAgentMetrics';

export type Runtime = {
	createSessionId: () => SessionId;
	runTurn: RunAgentTurn['run'];
	listSessionEvents: (sessionId: SessionId) => Promise<AgentEvent[]>;
	readSessionPreviewEvents: (sessionId: SessionId) => Promise<AgentEvent[]>;
	listSessions: () => Promise<StoredSession[]>;
	workspacePath: string;
	getModelName: () => string | undefined;
	getModelSelection: () => ModelSelectionState;
	initializeModels: (signal?: AbortSignal) => Promise<ModelSelectionState>;
	getAgentMetrics: (sessionId?: SessionId) => AgentMetricsSnapshot;
	listModels: (
		signal?: AbortSignal,
		options?: Pick<RuntimeListModelsOptions, 'forceRefresh'>,
	) => Promise<ListedModel[]>;
	unloadCurrentModel: (input?: UnloadModelInput) => Promise<void>;
	switchModel: (modelName: string, signal?: AbortSignal) => Promise<string>;
	setApprovalHandler: (handler: ToolApprovalHandler) => () => void;
	subscribeSessionEvents: (listener: (event: AgentEvent) => void) => () => void;
};

export const createRuntime = (config: AppConfig = readConfig()): Runtime => {
	const sessionStore = new SessionService(new JsonlSessionStore());
	const modelRuntime = new OllamaModelRuntime(config);
	const idGenerator = new BunUuidV7IdGenerator();
	const clock = new TemporalClock();
	const monotonicClock = new PerformanceMonotonicClock();
	const agentMetrics = new InMemoryAgentMetrics();
	const toolExecutor = createLocalToolExecutor();
	let currentToolApprovalHandler: ToolApprovalHandler = async () => false;

	const contextBuilder = new ContextBuilder({
		systemPrompt: config.SYSTEM_PROMPT,
		contextProfile: {
			contextWindowTokens: config.MODEL_CONTEXT_TOKENS,
			maxOutputTokens: config.MODEL_MAX_OUTPUT_TOKENS,
		},
	});

	const historyRetriever =
		config.HISTORY_EMBEDDING_MODEL === undefined
			? undefined
			: new HistoryRetriever(
					new OllamaEmbeddingAdapter(config.OLLAMA_BASE_URL, config.HISTORY_EMBEDDING_MODEL),
					new BinaryHistoryIndexStore(),
				);
	const runAgentTurn = new RunAgentTurn({
		...(historyRetriever === undefined ? {} : { historyRetriever }),
		sessionStore,
		model: modelRuntime,
		contextBuilder,
		clock,
		idGenerator,
		agentMetrics,
		monotonicClock,
		toolExecutor,
		approveToolCall: (request, options) => currentToolApprovalHandler(request, options),
	});

	return {
		createSessionId: () => idGenerator.nextSessionId(),
		runTurn: async function* (input) {
			const modelName = await modelRuntime.requireModel(input.signal);
			yield* runAgentTurn.run({ ...input, modelName });
		},
		listSessionEvents: (sessionId) => sessionStore.activateSession(sessionId),
		readSessionPreviewEvents: (sessionId) => sessionStore.readPreviewEvents(sessionId),
		listSessions: () => sessionStore.listSessions(),
		workspacePath: process.cwd(),
		getModelName: () => modelRuntime.getModelName(),
		getModelSelection: () => modelRuntime.getModelSelection(),
		initializeModels: (signal) => modelRuntime.initialize(signal),
		getAgentMetrics: (sessionId) => agentMetrics.snapshot(sessionId),
		listModels: async (signal, options) =>
			(await modelRuntime.listModels({ ...options, signal })).models,
		unloadCurrentModel: (input) => modelRuntime.unload(input),
		switchModel: (modelName, signal) => modelRuntime.switchModel(modelName, signal),
		subscribeSessionEvents: (listener) => sessionStore.subscribe(listener),
		setApprovalHandler: (handler) => {
			currentToolApprovalHandler = handler;

			return () => {
				if (currentToolApprovalHandler === handler) {
					currentToolApprovalHandler = async () => false;
				}
			};
		},
	};
};
