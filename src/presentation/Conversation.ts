import { isAbortError, throwIfAborted } from '@/application/services/cancellation';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { EventId, SessionId } from '@/domain/Ids';
import { StreamBuffer } from './state/StreamBuffer';
import { TranscriptLog, type TranscriptEntry } from './TranscriptLog';
import type { PresentationRuntime } from './types';

export type ConversationChange =
	| { type: 'reset' }
	| { type: 'entry'; entry: TranscriptEntry }
	| { type: 'live'; content: string }
	| { type: 'status' }
	| { type: 'metadata' };

type Selection = {
	id: SessionId;
	seen: Set<EventId>;
	controller: AbortController;
};

type Turn = {
	selection: Selection;
	controller: AbortController;
	durableErrorDisplayed: boolean;
};

export class Conversation {
	private selection: Selection;
	private log = new TranscriptLog();
	private readonly stream = new StreamBuffer(32);
	private readonly unsubscribeStream: () => void;
	private unsubscribeEvents: (() => void) | null = null;
	private active: Turn | null = null;
	private readonly turns = new Set<Promise<void>>();
	private readonly sessionLoads = new Set<Promise<void>>();
	private readonly modelSwitches = new Set<Promise<boolean>>();
	private readonly modelRequests = new Set<AbortController>();
	private localIndex = 0;
	private isLoading = true;
	private disposed = false;
	private disposal: Promise<void> | null = null;

	constructor(
		private readonly runtime: PresentationRuntime,
		private readonly onChange: (change: ConversationChange) => void,
	) {
		this.selection = {
			id: runtime.createSessionId(),
			seen: new Set(),
			controller: new AbortController(),
		};
		this.unsubscribeStream = this.stream.subscribe(() =>
			this.emit({ type: 'live', content: this.stream.getSnapshot() }),
		);
	}

	get sessionId(): SessionId {
		return this.selection.id;
	}
	get modelName(): string {
		return this.runtime.getModelName();
	}
	get loading(): boolean {
		return this.isLoading;
	}
	get running(): boolean {
		return this.active !== null;
	}
	get history(): readonly TranscriptEntry[] {
		return this.log.history;
	}
	get liveContent(): string {
		return this.stream.getSnapshot();
	}
	get activeTools() {
		return this.log.activeTools;
	}

	initialize(sessionId = this.sessionId, restoreModel = false): Promise<void> {
		return this.selectSession(sessionId, restoreModel);
	}

	selectSession(sessionId: SessionId, restoreModel = true): Promise<void> {
		const work = this.loadSession(sessionId, restoreModel);
		this.sessionLoads.add(work);
		void work.finally(() => this.sessionLoads.delete(work));
		return work;
	}

	private async loadSession(sessionId: SessionId, restoreModel: boolean): Promise<void> {
		if (this.disposed) return;
		this.selection.controller.abort();
		for (const request of this.modelRequests) request.abort();
		const previous = this.active;
		this.active = null;
		previous?.controller.abort();
		const selection: Selection = {
			id: sessionId,
			seen: new Set(),
			controller: new AbortController(),
		};
		this.selection = selection;
		this.log = new TranscriptLog();
		this.localIndex = 0;
		this.isLoading = true;
		this.stream.start();
		this.subscribe(selection, null);
		this.emit({ type: 'reset' });
		this.emit({ type: 'metadata' });
		this.emit({ type: 'status' });
		try {
			const events = await this.runtime.listSessionEvents(sessionId);
			if (!this.isSelected(selection)) return;
			for (const event of events) this.applyEvent(selection, null, event);
			this.log.clearActivity();
			if (restoreModel) {
				const model = latestModel(events, sessionId);
				if (model !== undefined && model !== this.modelName) {
					await this.runtime.switchModel(model, selection.controller.signal);
					if (!this.isSelected(selection)) return;
					this.emit({ type: 'metadata' });
				}
			}
		} catch (error) {
			if (this.isSelected(selection)) this.appendNotice(errorMessage(error), true);
		} finally {
			if (this.isSelected(selection)) {
				this.isLoading = false;
				this.log.clearActivity();
				this.emit({ type: 'status' });
			}
		}
	}

	submit(prompt: string): boolean {
		if (this.disposed || this.loading || this.running || !prompt.trim()) return false;
		const turn: Turn = {
			selection: this.selection,
			controller: new AbortController(),
			durableErrorDisplayed: false,
		};
		this.active = turn;
		this.stream.start();
		this.subscribe(turn.selection, turn);
		this.emit({ type: 'status' });
		const work = this.consume(turn, prompt);
		this.turns.add(work);
		void work.finally(() => this.turns.delete(work));
		return true;
	}

	cancel(): void {
		this.active?.controller.abort();
	}

	switchModel(name: string, signal?: AbortSignal): Promise<boolean> {
		const work = this.performModelSwitch(name, signal);
		this.modelSwitches.add(work);
		void work.finally(() => this.modelSwitches.delete(work));
		return work;
	}

	private async performModelSwitch(name: string, signal?: AbortSignal): Promise<boolean> {
		if (this.disposed || this.loading || this.running) return false;
		const selection = this.selection;
		const request = new AbortController();
		const onAbort = () => request.abort();
		signal?.addEventListener('abort', onAbort, { once: true });
		if (signal?.aborted) onAbort();
		this.modelRequests.add(request);
		try {
			throwIfAborted(request.signal);
			const selected = await this.runtime.switchModel(name, request.signal);
			throwIfAborted(request.signal);
			if (!this.isSelected(selection)) return false;
			this.emit({ type: 'metadata' });
			this.appendNotice(`Model switched to ${selected}.`);
			return true;
		} catch (error) {
			if (this.isSelected(selection) && !(request.signal.aborted && isAbortError(error))) {
				this.appendNotice(errorMessage(error), true);
			}
			return false;
		} finally {
			signal?.removeEventListener('abort', onAbort);
			this.modelRequests.delete(request);
		}
	}

	appendNotice(content: string, error = false): void {
		if (!this.disposed)
			this.append({
				id: this.localId(error ? 'error' : 'notice'),
				kind: error ? 'error' : 'notice',
				content,
			});
	}

	dispose(): Promise<void> {
		if (this.disposal) return this.disposal;
		this.disposed = true;
		this.selection.controller.abort();
		this.active?.controller.abort();
		this.active = null;
		for (const request of this.modelRequests) request.abort();
		this.unsubscribeEvents?.();
		this.unsubscribeEvents = null;
		this.unsubscribeStream();
		this.stream.reset();
		this.stream.dispose();
		this.log.clearActivity();
		this.disposal = Promise.allSettled([
			...this.turns,
			...this.sessionLoads,
			...this.modelSwitches,
		]).then(() => undefined);
		return this.disposal;
	}

	private async consume(turn: Turn, prompt: string): Promise<void> {
		try {
			for await (const chunk of this.runtime.runTurn({
				sessionId: turn.selection.id,
				prompt,
				modelName: this.modelName,
				signal: turn.controller.signal,
			})) {
				if (!this.isActive(turn)) return;
				if (chunk.contentDelta) this.stream.push(chunk.contentDelta);
			}
			if (!this.isActive(turn)) return;
			throwIfAborted(turn.controller.signal);
			this.preservePartial();
		} catch (error) {
			if (!this.isActive(turn)) return;
			this.preservePartial();
			if (turn.controller.signal.aborted && isAbortError(error)) {
				this.append({
					id: this.localId('cancelled'),
					kind: 'cancelled',
					content: 'The response was cancelled.',
				});
			} else if (!turn.durableErrorDisplayed) {
				this.appendNotice(errorMessage(error), true);
			}
		} finally {
			if (this.isActive(turn)) {
				this.stream.reset();
				this.active = null;
				this.log.clearActivity();
				this.subscribe(turn.selection, null);
				this.emit({ type: 'status' });
			}
		}
	}

	private subscribe(selection: Selection, turn: Turn | null): void {
		this.unsubscribeEvents?.();
		let disposed = false;
		const unsubscribe = this.runtime.subscribeSessionEvents((event) => {
			if (!disposed && this.isSelected(selection) && this.active === turn)
				this.applyEvent(selection, turn, event);
		});
		this.unsubscribeEvents = () => {
			if (disposed) return;
			disposed = true;
			unsubscribe();
		};
	}

	private applyEvent(selection: Selection, turn: Turn | null, event: AgentEvent): void {
		if (event.sessionId !== selection.id || selection.seen.has(event.id)) return;
		selection.seen.add(event.id);
		if (turn) {
			if (
				event.type === 'assistant.message.completed' ||
				event.type === 'assistant.tool_calls.completed'
			) {
				this.stream.flush();
				this.stream.reset();
			} else if (event.type === 'agent.error') {
				const details = event.error.details;
				if (
					turn.controller.signal.aborted &&
					event.error.code === 'MODEL_STREAM_FAILED' &&
					typeof details === 'object' &&
					details !== null &&
					'name' in details &&
					details.name === 'AbortError'
				)
					return;
				this.preservePartial();
				turn.durableErrorDisplayed = true;
			}
		}
		const previousActivity = this.log.activeTools;
		const entry = this.log.apply(event);
		if (entry) this.emit({ type: 'entry', entry });
		if (previousActivity !== this.log.activeTools) this.emit({ type: 'status' });
	}

	private preservePartial(): void {
		const content = this.stream.flush();
		this.stream.reset();
		if (content.trim()) this.append({ id: this.localId('partial'), kind: 'assistant', content });
	}

	private append(entry: TranscriptEntry): void {
		if (this.log.append(entry)) this.emit({ type: 'entry', entry });
	}

	private localId(prefix: string): string {
		return `${prefix}:${this.sessionId}:${this.localIndex++}`;
	}
	private isSelected(selection: Selection): boolean {
		return !this.disposed && this.selection === selection;
	}
	private isActive(turn: Turn): boolean {
		return this.isSelected(turn.selection) && this.active === turn;
	}
	private emit(change: ConversationChange): void {
		if (!this.disposed) this.onChange(change);
	}
}

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const latestModel = (events: AgentEvent[], sessionId: SessionId): string | undefined => {
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (
			event?.sessionId === sessionId &&
			event.type === 'prompt.submitted' &&
			event.modelName !== undefined
		)
			return event.modelName;
	}
	return undefined;
};
