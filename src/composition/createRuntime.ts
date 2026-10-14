import type { ListedModel } from '@/application/ports/ModelCatalogPort';
import type { UnloadModelInput } from '@/application/ports/ModelPort';
import { HistoryRetriever } from '@/application/services/HistoryRetriever';
import { OllamaEmbeddingAdapter } from '@/infrastructure/model/OllamaEmbeddingAdapter';
import { BinaryHistoryIndexStore } from '@/infrastructure/persistence/BinaryHistoryIndexStore';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { SessionMemoryService } from '@/application/services/SessionMemoryService';
import { ModelSessionMemoryUpdater } from '@/application/services/ModelSessionMemoryUpdater';
import { JsonSessionMemoryStore } from '@/infrastructure/persistence/JsonSessionMemoryStore';
import {
	InMemoryAgentMetrics,
	type AgentMetricsSnapshot,
} from '@/application/services/InMemoryAgentMetrics';
import { SessionService } from '@/application/services/SessionService';
import { RunAgentTurn, type ToolApprovalHandler } from '@/application/use-cases/RunAgentTurn';
import type { AppConfig } from '@/composition/config';
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
import type { WorkspaceChangesPort } from '@/application/ports/WorkspaceChangesPort';
import { GitWorkspaceChanges } from '@/infrastructure/git/GitWorkspaceChanges';
import type { SettingsPort } from '@/application/ports/SettingsPort';

export type { RuntimeListModelsOptions } from '@/composition/model/OllamaModelRuntime';
export type { AgentMetricsSnapshot } from '@/application/services/InMemoryAgentMetrics';

export type Runtime = {
	settings?: SettingsPort;
	dispose: () => void;
	createSessionId: () => SessionId;
	runTurn: RunAgentTurn['run'];
	listSessionEvents: (sessionId: SessionId) => Promise<AgentEvent[]>;
	readSessionPreviewEvents: (sessionId: SessionId) => Promise<AgentEvent[]>;
	listSessions: () => Promise<StoredSession[]>;
	workspacePath: string;
	workspaceChanges: WorkspaceChangesPort;
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

export const createRuntime = (config: AppConfig, settings?: SettingsPort): Runtime => {
	const workspacePath = process.cwd();
	const sessionStore = new SessionService(new JsonlSessionStore());
	const modelRuntime = new OllamaModelRuntime(
		config,
		settings,
		settings ? () => settings.getSnapshot().effective.keepAlive : undefined,
	);
	const idGenerator = new BunUuidV7IdGenerator();
	const clock = new TemporalClock();
	const monotonicClock = new PerformanceMonotonicClock();
	const agentMetrics = new InMemoryAgentMetrics();
	const toolExecutor = createLocalToolExecutor();
	let currentToolApprovalHandler: ToolApprovalHandler = async () => false;

	const getContextProfile = () =>
		settings
			? {
					contextWindowTokens: settings.getSnapshot().effective.contextWindowTokens,
					maxOutputTokens: settings.getSnapshot().effective.maxOutputTokens,
				}
			: {
					contextWindowTokens: config.MODEL_CONTEXT_TOKENS,
					maxOutputTokens: config.MODEL_MAX_OUTPUT_TOKENS,
				};

	const historyRetriever =
		config.HISTORY_EMBEDDING_MODEL === undefined
			? undefined
			: new HistoryRetriever(
					new OllamaEmbeddingAdapter(config.OLLAMA_BASE_URL, config.HISTORY_EMBEDDING_MODEL),
					new BinaryHistoryIndexStore(),
				);
	const sessionMemory = new SessionMemoryService(
		sessionStore,
		new JsonSessionMemoryStore(),
		new ModelSessionMemoryUpdater(modelRuntime, getContextProfile, () =>
			modelRuntime.getModelName(),
		),
	);
	const createTurn = () =>
		new RunAgentTurn({
			sessionMemory,
			...(historyRetriever === undefined ? {} : { historyRetriever }),
			sessionStore,
			model: modelRuntime,
			contextBuilder: new ContextBuilder({
				systemPrompt: config.SYSTEM_PROMPT,
				contextProfile: getContextProfile(),
			}),
			clock,
			idGenerator,
			agentMetrics,
			monotonicClock,
			toolExecutor,
			approveToolCall: (request, options) => currentToolApprovalHandler(request, options),
		});

	return {
		...(settings ? { settings } : {}),
		dispose: () => {
			settings?.dispose();
			sessionMemory.dispose();
		},
		createSessionId: () => idGenerator.nextSessionId(),
		runTurn: async function* (input) {
			sessionMemory.cancelPending();
			const modelName = await modelRuntime.requireModel(input.signal);
			// Immutable compiler per turn: an active request/continuation keeps its coherent budget.
			yield* createTurn().run({ ...input, modelName });
		},
		listSessionEvents: async (sessionId) => {
			sessionMemory.selectSession(sessionId);
			return sessionStore.activateSession(sessionId);
		},
		readSessionPreviewEvents: (sessionId) => sessionStore.readPreviewEvents(sessionId),
		listSessions: () => sessionStore.listSessions(),
		workspacePath,
		workspaceChanges: new GitWorkspaceChanges(workspacePath),
		getModelName: () => modelRuntime.getModelName(),
		getModelSelection: () => modelRuntime.getModelSelection(),
		initializeModels: (signal) => modelRuntime.initialize(signal),
		getAgentMetrics: (sessionId) => agentMetrics.snapshot(sessionId),
		listModels: async (signal, options) =>
			(await modelRuntime.listModels({ ...options, signal })).models,
		unloadCurrentModel: (input) => {
			sessionMemory.cancelPending();
			return modelRuntime.unload(input);
		},
		switchModel: (modelName, signal) => {
			sessionMemory.cancelPending();
			return modelRuntime.switchModel(modelName, signal);
		},
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
