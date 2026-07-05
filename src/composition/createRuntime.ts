import type { IdGeneratorPort } from '@/application/ports/IdGeneratorPort';
import type { ListModelsResult } from '@/application/ports/ModelCatalogPort';
import type { UnloadModelInput } from '@/application/ports/ModelPort';
import { ContextBuilder } from '@/application/services/ContextBuilder';
import { ListSessionEvents } from '@/application/use-cases/ListSessionEvents';
import { ListSessions } from '@/application/use-cases/ListSessions';
import { LoadSession } from '@/application/use-cases/LoadSession';
import { RunAgentTurn, type ToolApprovalHandler } from '@/application/use-cases/RunAgentTurn';
import { readConfig, type AppConfig } from '@/composition/config';
import {
	OllamaModelRuntime,
	type RuntimeListModelsOptions,
} from '@/composition/model/OllamaModelRuntime';
import { createLocalToolExecutor } from '@/composition/factories/createLocalToolExecutor';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { BunUuidV7IdGenerator } from '@/infrastructure/runtime/BunUuidV7IdGenerator';
import { TemporalClock } from '@/infrastructure/runtime/TemporalClock';

export type { RuntimeListModelsOptions } from '@/composition/model/OllamaModelRuntime';

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
	const modelRuntime = new OllamaModelRuntime(config);
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
		getModelName: () => modelRuntime.getModelName(),
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
			toolExecutor,
			approveToolCall: (request) => currentToolApprovalHandler(request),
		}),
	};
};
