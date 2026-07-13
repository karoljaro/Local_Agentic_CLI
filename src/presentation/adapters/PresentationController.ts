import type { ListModelsResult } from '@/application/ports/ModelCatalogPort';
import type { StoredSession } from '@/application/ports/SessionStorePort';
import type { ToolApprovalHandler } from '@/application/use-cases/RunAgentTurn';
import type { Runtime } from '@/composition/createRuntime';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';

export type TurnInput = {
	sessionId: SessionId;
	prompt: string;
	modelName: string;
	signal: AbortSignal;
};

export type TurnDelta = {
	contentDelta: string;
};

export interface PresentationController {
	readonly workspacePath: string;
	createSessionId(): SessionId;
	getModelName(): string;
	listModels(signal: AbortSignal): Promise<ListModelsResult>;
	listSessionEvents(sessionId: SessionId): Promise<AgentEvent[]>;
	listSessions(): Promise<StoredSession[]>;
	runTurn(input: TurnInput): AsyncIterable<TurnDelta>;
	setApprovalHandler(handler: ToolApprovalHandler): () => void;
	subscribeSessionEvents(listener: (event: AgentEvent) => void): () => void;
	switchModel(modelName: string, signal: AbortSignal): Promise<string>;
}

export class RuntimePresentationController implements PresentationController {
	readonly workspacePath: string;

	constructor(private readonly runtime: Runtime) {
		this.workspacePath = runtime.workspacePath;
	}

	createSessionId(): SessionId {
		return this.runtime.idGenerator.nextSessionId();
	}

	getModelName(): string {
		return this.runtime.getModelName();
	}

	listModels(signal: AbortSignal): Promise<ListModelsResult> {
		return this.runtime.listModels({ signal });
	}

	async listSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		const result = await this.runtime.listSessionEvents.list({ sessionId });
		return result.events;
	}

	async listSessions(): Promise<StoredSession[]> {
		const result = await this.runtime.listSessions.list();
		return result.sessions;
	}

	runTurn(input: TurnInput): AsyncIterable<TurnDelta> {
		return this.runtime.runAgentTurn.run(input);
	}

	setApprovalHandler(handler: ToolApprovalHandler): () => void {
		return this.runtime.setToolApprovalHandler(handler);
	}

	subscribeSessionEvents(listener: (event: AgentEvent) => void): () => void {
		return this.runtime.subscribeSessionEvents(listener);
	}

	async switchModel(modelName: string, signal: AbortSignal): Promise<string> {
		await this.runtime.unloadCurrentModel({ signal });
		return this.runtime.switchModel(modelName);
	}
}
