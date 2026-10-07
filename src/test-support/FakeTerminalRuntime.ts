import type { ToolApprovalHandler } from '@/application/use-cases/RunAgentTurn';
import type { ListedModel } from '@/application/ports/ModelCatalogPort';
import type { AgentEvent } from '@/domain/AgentEvent';
import { asEventId, asSessionId, type SessionId } from '@/domain/Ids';
import type { PresentationRuntime, TurnDelta, TurnInput } from '@/presentation/types';
import { assistantMessageCompletedEvent, promptSubmittedEvent } from './AgentEventFixtures';

export class FakeTerminalRuntime implements PresentationRuntime {
	readonly workspacePath = '/test-workspace';
	readonly listeners = new Set<(event: AgentEvent) => void>();
	readonly events = new Map<SessionId, AgentEvent[]>();
	readonly turns: TurnInput[] = [];
	readonly switches: string[] = [];
	readonly previews: SessionId[] = [];
	readonly activations: SessionId[] = [];
	models: ListedModel[] = [{ name: 'test-model' }, { name: 'other-model' }];
	model = 'test-model';
	approval: ToolApprovalHandler = async () => false;
	private sessionIndex = 0;
	private eventIndex = 0;
	script: (input: TurnInput) => AsyncIterable<TurnDelta> = async function* (
		this: FakeTerminalRuntime,
		input,
	) {
		yield { contentDelta: 'A readable answer.' };
		this.complete(input.sessionId, 'A readable answer.');
	};

	createSessionId(): SessionId {
		return asSessionId(`session-${++this.sessionIndex}`);
	}
	getModelName(): string {
		return this.model;
	}
	async listModels(): Promise<ListedModel[]> {
		return this.models;
	}
	async listSessions() {
		return [...this.events.keys()].map((sessionId) => ({ sessionId }));
	}
	async listSessionEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		this.activations.push(sessionId);
		return [...(this.events.get(sessionId) ?? [])];
	}
	async readSessionPreviewEvents(sessionId: SessionId): Promise<AgentEvent[]> {
		this.previews.push(sessionId);
		return [...(this.events.get(sessionId) ?? [])];
	}
	async switchModel(name: string, signal?: AbortSignal): Promise<string> {
		if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
		this.switches.push(name);
		this.model = name;
		return name;
	}
	async *runTurn(input: TurnInput): AsyncIterable<TurnDelta> {
		this.turns.push(input);
		this.commit(
			promptSubmittedEvent({
				sessionId: input.sessionId,
				id: this.nextId(),
				prompt: input.prompt,
				modelName: this.model,
			}),
		);
		yield* this.script(input);
	}
	subscribeSessionEvents(listener: (event: AgentEvent) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	setApprovalHandler(handler: ToolApprovalHandler): () => void {
		this.approval = handler;
		return () => {
			if (this.approval === handler) this.approval = async () => false;
		};
	}
	commit(event: AgentEvent): void {
		const events = this.events.get(event.sessionId) ?? [];
		events.push(event);
		this.events.set(event.sessionId, events);
		for (const listener of this.listeners) listener(event);
	}
	complete(sessionId: SessionId, content: string): AgentEvent {
		const event = assistantMessageCompletedEvent({ sessionId, id: this.nextId(), content });
		this.commit(event);
		return event;
	}
	nextId() {
		return asEventId(`native-test-${++this.eventIndex}`);
	}
}
