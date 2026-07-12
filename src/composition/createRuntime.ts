import type { IdGeneratorPort } from '@/application/ports/IdGeneratorPort';
import type { ListModelsResult } from '@/application/ports/ModelCatalogPort';
import type { UnloadModelInput } from '@/application/ports/ModelPort';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import {
	InMemoryAgentMetrics,
	type AgentMetricsSnapshot,
} from '@/application/services/InMemoryAgentMetrics';
import { SessionStateCache } from '@/application/services/SessionStateCache';
import { ListSessionEvents } from '@/application/use-cases/ListSessionEvents';
import { ListSessions } from '@/application/use-cases/ListSessions';
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

export type { RuntimeListModelsOptions } from '@/composition/model/OllamaModelRuntime';
export type { AgentMetricsSnapshot } from '@/application/services/InMemoryAgentMetrics';

export type Runtime = {
	runAgentTurn: RunAgentTurn;
	listSessionEvents: ListSessionEvents;
	listSessions: ListSessions;
	idGenerator: IdGeneratorPort;
	workspacePath: string;
	getModelName: () => string;
	getAgentMetrics: (sessionId?: SessionId) => AgentMetricsSnapshot;
	listModels: (options?: RuntimeListModelsOptions) => Promise<ListModelsResult>;
	unloadCurrentModel: (input?: UnloadModelInput) => Promise<void>;
	switchModel: (modelName: string) => string;
	setToolApprovalHandler: (handler: ToolApprovalHandler) => () => void;
};

export const createRuntime = (config: AppConfig = readConfig()): Runtime => {
	const sessionStore = new SessionStateCache(new JsonlSessionStore());
	const modelRuntime = new OllamaModelRuntime(config);
	const idGenerator = new BunUuidV7IdGenerator();
	const clock = new TemporalClock();
	const monotonicClock = new PerformanceMonotonicClock();
	const agentMetrics = new InMemoryAgentMetrics();
	const toolExecutor = createLocalToolExecutor();
	let currentToolApprovalHandler: ToolApprovalHandler = async () => false;

	const contextBuilder = new ContextBuilder({
		systemPrompt: config.SYSTEM_PROMPT,
		maxContextCharacters: config.MAX_CONTEXT_CHARACTERS,
	});

	const listSessions = new ListSessions({
		sessionStore,
	});

	const listSessionEvents = new ListSessionEvents({
		sessionStore,
	});

	return {
		idGenerator,
		listSessionEvents,
		listSessions,
		workspacePath: process.cwd(),
		getModelName: () => modelRuntime.getModelName(),
		getAgentMetrics: (sessionId) => agentMetrics.snapshot(sessionId),
		listModels: (options) => modelRuntime.listModels(options),
		unloadCurrentModel: (input) => modelRuntime.unload(input),
		switchModel: (modelName) => modelRuntime.switchModel(modelName),
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
			model: modelRuntime,
			contextBuilder,
			clock,
			idGenerator,
			agentMetrics,
			monotonicClock,
			toolExecutor,
			approveToolCall: (request) => currentToolApprovalHandler(request),
		}),
	};
};
