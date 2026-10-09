import { createHash } from 'node:crypto';
import type { SessionServicePort } from '@/application/ports/SessionServicePort';
import type { SessionMemoryStorePort } from '@/application/ports/SessionMemoryStorePort';
import type {
	MemoryEvidence,
	SessionMemoryUpdaterPort,
} from '@/application/ports/SessionMemoryUpdaterPort';
import type { AgentEvent } from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';
import {
	emptySessionMemory,
	MEMORY_UPDATER_VERSION,
	MemoryDeltaSchema,
	memoryPath,
	SessionMemoryDocumentSchema,
	type MemoryBoundary,
	type MemoryItem,
	type SessionMemory,
	type SessionMemoryDocument,
} from '@/domain/SessionMemory';
import { compactSessionMemory } from './SessionMemoryRenderer';
import { throwIfAborted } from './cancellation';

type Source = { position: number; role: 'user' | 'assistant'; final: boolean };
type Call = { name: string; target: string; userId: string; messageId?: string };
type EventSource = {
	position: number;
	type: AgentEvent['type'];
	file?: {
		path: string;
		activity: SessionMemory['files'][number]['activity'];
		from?: string;
		messageIds: string[];
	};
	problem?: { key: string; text: string; userId: string };
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const emptyBoundary = (): MemoryBoundary => ({
	eventCount: 0,
	lastEventId: null,
	digest: hash('session-memory-event-prefix-v1'),
});
const advance = (source: MemoryBoundary, event: AgentEvent): MemoryBoundary => ({
	eventCount: source.eventCount + 1,
	lastEventId: event.id,
	// JSONL validation can reorder object keys on replay; normalize keys, retain all values.
	digest: hash(
		source.digest +
			'\n' +
			JSON.stringify(event, (_key, value: unknown) => {
				if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
				return Object.fromEntries(
					Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
				);
			}),
	),
});
const mergeIds = (a: string[], b: string[]) => [...new Set([...b, ...a])].slice(0, 3);
const record = (value: unknown): Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
const targetOf = (value: unknown): string => {
	const args = record(value);
	return typeof args['path'] === 'string'
		? args['path']
		: typeof args['destination'] === 'string'
			? args['destination']
			: '';
};

/** Derived selected-session state. Observers project exact events only; inference is explicit. */
export class SessionMemoryService {
	private selected: SessionId | undefined;
	private generation = 0;
	private scope = new AbortController();
	private memory = emptySessionMemory();
	private source = emptyBoundary();
	private readonly messages = new Map<string, Source>();
	private readonly events = new Map<string, EventSource>();
	private readonly ambiguousMessages = new Set<string>();
	private readonly ambiguousEvents = new Set<string>();
	private readonly calls = new Map<string, Call>();
	private readonly ambiguousCalls = new Set<string>();
	private currentUser: string | undefined;
	private evidence: MemoryEvidence[] = [];
	private mutationConfirmed = false;
	private readonly turnFailures = new Set<string>();
	private loading = false;
	private buffered: AgentEvent[] = [];
	private activating: Promise<void> | undefined;
	private attemptedBoundary: string | undefined;
	private updater: SessionMemoryDocument['updater'] = {
		version: MEMORY_UPDATER_VERSION,
		model: null,
		status: 'unavailable',
	};
	private tail: Promise<void> = Promise.resolve();
	private publicationTail: Promise<void> = Promise.resolve();
	readonly diagnostics: {
		lastFailure?: string;
		semanticAttempts: number;
		resumeEvents: number;
		observedEvents: number;
	} = { semanticAttempts: 0, resumeEvents: 0, observedEvents: 0 };

	constructor(
		sessions: SessionServicePort,
		private readonly store: SessionMemoryStorePort,
		private readonly semantic?: SessionMemoryUpdaterPort,
		private readonly deadlineMs = 10000,
		private readonly ioDeadlineMs = 1000,
	) {
		sessions.subscribe((event) => {
			try {
				if (event.sessionId === this.selected) {
					if (this.loading) this.buffered.push(event);
					else this.observe(event);
				}
			} catch {
				this.diagnostics.lastFailure = 'event-projection-failed';
			}
		});
	}

	activate(sessionId: SessionId, events: readonly AgentEvent[]): Promise<void> {
		if (this.selected === sessionId) {
			if (this.activating) return this.activating;
			// O(1) common path; a missed observer after a failed reduction triggers recovery.
			if (
				this.source.eventCount === events.length &&
				this.source.lastEventId === (events.at(-1)?.id ?? null)
			)
				return Promise.resolve();
		}
		const operation = this.activateSelected(sessionId, [...events]);
		this.activating = operation;
		void operation
			.finally(() => {
				if (this.activating === operation) this.activating = undefined;
			})
			.catch(() => undefined);
		return operation;
	}

	private async activateSelected(
		sessionId: SessionId,
		events: readonly AgentEvent[],
	): Promise<void> {
		this.scope.abort();
		this.scope = new AbortController();
		const generation = ++this.generation;
		this.selected = sessionId;
		this.loading = true;
		this.buffered = [];
		this.memory = emptySessionMemory();
		this.source = emptyBoundary();
		this.messages.clear();
		this.events.clear();
		this.calls.clear();
		this.ambiguousMessages.clear();
		this.ambiguousEvents.clear();
		this.ambiguousCalls.clear();
		this.currentUser = undefined;
		this.evidence = [];
		this.mutationConfirmed = false;
		this.turnFailures.clear();
		this.attemptedBoundary = undefined;
		this.updater = { version: MEMORY_UPDATER_VERSION, model: null, status: 'unavailable' };
		let persisted: SessionMemoryDocument | undefined;
		try {
			const readSignal = AbortSignal.any([
				this.scope.signal,
				AbortSignal.timeout(this.ioDeadlineMs),
			]);
			const value = await bounded(this.store.read(sessionId, readSignal), readSignal);
			persisted = value === undefined ? undefined : SessionMemoryDocumentSchema.parse(value);
			if (persisted && persisted.sessionId !== sessionId) persisted = undefined;
		} catch {
			this.diagnostics.lastFailure = 'memory-read-failed';
		}
		if (generation !== this.generation) return;
		let matched =
			persisted?.source.eventCount === 0 && persisted.source.digest === this.source.digest;
		for (const event of events) {
			if (event.sessionId !== sessionId) {
				persisted = undefined;
				continue;
			}
			this.observe(event);
			this.diagnostics.resumeEvents++;
			if (persisted?.source.eventCount === this.source.eventCount) {
				matched =
					persisted.source.lastEventId === this.source.lastEventId &&
					persisted.source.digest === this.source.digest;
				if (matched && this.validProvenance(persisted)) {
					this.memory = compactSessionMemory(persisted.memory);
					this.updater = persisted.updater;
				} else {
					this.diagnostics.lastFailure = 'memory-source-rejected';
					persisted = undefined;
				}
			}
		}
		if (
			!matched ||
			!persisted ||
			persisted.sessionId !== sessionId ||
			persisted.source.eventCount > this.source.eventCount
		) {
			if (persisted) this.diagnostics.lastFailure = 'memory-source-rejected';
		}
		this.evidence = []; // Resume never performs semantic backfill or reuses stale turn evidence.
		this.loading = false;
		for (const event of this.buffered) this.observe(event);
		this.buffered = [];
	}

	snapshot(sessionId: SessionId): SessionMemory | undefined {
		return this.selected === sessionId &&
			!this.loading &&
			this.validProvenance({
				version: 1,
				sessionId,
				source: this.source,
				updater: this.updater,
				memory: this.memory,
			})
			? structuredClone(this.memory)
			: undefined;
	}

	/** Normal completion passes exact originating user and final assistant IDs, not "latest". */
	finish(
		sessionId: SessionId,
		userId: string,
		finalId?: string,
		modelName?: string,
		signal?: AbortSignal,
	): Promise<void> {
		const generation = this.generation;
		const boundary = { ...this.source };
		const evidence = structuredClone(this.evidence);
		const work = this.tail.then(() =>
			this.finishSelected(
				sessionId,
				userId,
				finalId,
				modelName,
				signal,
				generation,
				boundary,
				evidence,
			),
		);
		this.tail = work.catch(() => undefined);
		return work;
	}

	private async finishSelected(
		sessionId: SessionId,
		userId: string,
		finalId: string | undefined,
		modelName: string | undefined,
		signal: AbortSignal | undefined,
		generation: number,
		boundary: MemoryBoundary,
		evidence: MemoryEvidence[],
	) {
		if (!this.owns(sessionId, generation, boundary) || signal?.aborted) return;
		let candidate = structuredClone(this.memory);
		let updater = { ...this.updater };
		const final = finalId === undefined ? undefined : this.messages.get(finalId);
		if (
			this.semantic &&
			this.attemptedBoundary !== boundary.digest &&
			final?.final &&
			this.currentUser === userId &&
			evidence[0]?.messageId === userId &&
			evidence.at(-1)?.messageId === finalId
		) {
			this.attemptedBoundary = boundary.digest;
			try {
				if (evidence.some((item) => item.text.length > (item.role === 'user' ? 6000 : 2000)))
					throw new Error('oversized-evidence');
				const operationSignal = signal
					? AbortSignal.any([signal, this.scope.signal, AbortSignal.timeout(this.deadlineMs)])
					: AbortSignal.any([this.scope.signal, AbortSignal.timeout(this.deadlineMs)]);
				this.diagnostics.semanticAttempts++;
				const delta = MemoryDeltaSchema.parse(
					await bounded(
						this.semantic.update({
							memory: structuredClone(candidate),
							evidence,
							signal: operationSignal,
							...(modelName ? { modelName } : {}),
						}),
						operationSignal,
					),
				);
				if (!this.owns(sessionId, generation, boundary)) return;
				candidate = this.applyDelta(candidate, delta, evidence);
				updater = { version: MEMORY_UPDATER_VERSION, model: modelName ?? null, status: 'updated' };
			} catch {
				candidate = structuredClone(this.memory); // Reject the entire delta, including earlier valid changes.
				this.diagnostics.lastFailure = 'semantic-update-failed';
				updater = { ...updater, status: 'failed' };
			}
		}
		if (!this.owns(sessionId, generation, boundary) || signal?.aborted) return;
		const document: SessionMemoryDocument = {
			version: 1,
			sessionId,
			source: boundary,
			updater,
			memory: compactSessionMemory(candidate),
		};
		try {
			SessionMemoryDocumentSchema.parse(document);
			if (!this.validProvenance(document)) throw new Error('Invalid provenance.');
			const writeSignal = AbortSignal.any([
				this.scope.signal,
				AbortSignal.timeout(this.ioDeadlineMs),
				...(signal ? [signal] : []),
			]);
			// A timed-out OS rename may still settle. Keep publication order beyond caller timeout.
			const publication = this.publicationTail.then(async () => {
				throwIfAborted(writeSignal);
				if (!this.owns(sessionId, generation, boundary)) return;
				await this.store.write(document, writeSignal);
			});
			this.publicationTail = publication.catch(() => undefined);
			await bounded(publication, writeSignal);
			if (this.owns(sessionId, generation, boundary)) {
				this.memory = document.memory;
				this.updater = updater;
			}
		} catch {
			this.diagnostics.lastFailure = 'memory-write-failed';
		}
	}

	private owns(sessionId: SessionId, generation: number, boundary: MemoryBoundary) {
		return (
			this.selected === sessionId &&
			this.generation === generation &&
			this.source.digest === boundary.digest
		);
	}

	private observe(event: AgentEvent): void {
		this.source = advance(this.source, event);
		this.diagnostics.observedEvents++;
		if (this.events.has(event.id)) this.ambiguousEvents.add(event.id);
		this.events.set(event.id, { position: this.source.eventCount, type: event.type });
		if ('messageId' in event) {
			if (this.messages.has(event.messageId)) this.ambiguousMessages.add(event.messageId);
			this.messages.set(event.messageId, {
				position: this.source.eventCount,
				role: event.type === 'prompt.submitted' ? 'user' : 'assistant',
				final: event.type === 'assistant.message.completed',
			});
		}
		if (event.type === 'prompt.submitted') {
			this.currentUser = event.messageId;
			this.calls.clear();
			this.ambiguousCalls.clear();
			this.mutationConfirmed = false;
			this.turnFailures.clear();
			this.evidence = [{ messageId: event.messageId, role: 'user', text: event.prompt }];
		} else if (event.type === 'assistant.message.completed') {
			this.memory.problems = this.memory.problems.filter((item) => !item.key.startsWith('agent-'));
			for (const key of this.turnFailures)
				if (key.startsWith('agent-')) this.turnFailures.delete(key);
			this.evidence.push({ messageId: event.messageId, role: 'assistant', text: event.content });
		} else if (event.type === 'assistant.tool_calls.completed') {
			for (const call of event.toolCalls)
				this.registerCall(call.id, call.name, call.arguments, event.messageId);
		} else if (event.type === 'tool.call.requested' && !this.calls.has(event.toolCallId)) {
			this.registerCall(event.toolCallId, event.toolName, event.toolInput);
		} else if (event.type === 'tool.call.completed' || event.type === 'tool.call.failed') {
			const call = this.calls.get(event.toolCallId);
			if (!call || call.name !== event.toolName || this.ambiguousCalls.has(event.toolCallId))
				return;
			const problemKey = 'tool-' + hash(JSON.stringify([call.name, call.target])).slice(0, 24);
			if (event.type === 'tool.call.failed') {
				this.turnFailures.add(problemKey);
				const notExecuted = [
					'TOOL_APPROVAL_DENIED',
					'TOOL_BATCH_CANCELLED',
					'TOOL_APPROVAL_FAILED',
				].includes(event.error.code ?? '');
				this.upsertProblem(
					problemKey,
					notExecuted
						? `${call.name} was not executed (${event.error.code}).`
						: `${call.name} failed; effects unknown.`,
					event,
					call,
				);
			} else {
				this.turnFailures.delete(problemKey);
				this.memory.problems = this.memory.problems.filter((item) => item.key !== problemKey);
				this.projectFile(event, call);
			}
		} else if (event.type === 'agent.error' && this.currentUser) {
			this.turnFailures.add('agent-' + hash(event.error.code ?? 'failure').slice(0, 24));
			this.upsertProblem(
				'agent-' + hash(event.error.code ?? 'failure').slice(0, 24),
				`Turn failed (${(event.error.code ?? 'unknown').slice(0, 80)}).`,
				event,
				{ name: '', target: '', userId: this.currentUser },
			);
		}
		this.memory = compactSessionMemory(this.memory);
	}
	private registerCall(id: string, name: string, args: unknown, messageId?: string) {
		if (!this.currentUser) return;
		if (this.calls.has(id)) this.ambiguousCalls.add(id);
		this.calls.set(id, {
			name,
			target: targetOf(args),
			userId: this.currentUser,
			...(messageId ? { messageId } : {}),
		});
	}
	private upsertProblem(key: string, text: string, event: AgentEvent, call: Call) {
		this.events.get(event.id)!.problem = { key, text, userId: call.userId };
		const item: MemoryItem = {
			key,
			text,
			basis: 'tool-observed',
			sourceMessageIds: [call.userId],
			sourceEventIds: [event.id],
			revision: this.source.eventCount,
		};
		this.memory.problems = [...this.memory.problems.filter((old) => old.key !== key), item];
	}
	private projectFile(event: Extract<AgentEvent, { type: 'tool.call.completed' }>, call: Call) {
		const output = record(event.output);
		// Cache references are not fresh observations; the earlier exact event already projected.
		if (output['cached'] === true) return;
		let path: unknown = output['path'];
		let activity: SessionMemory['files'][number]['activity'] | undefined;
		let from: string | undefined;
		if (call.name === 'read_file' && typeof output['content'] === 'string') activity = 'read';
		if (call.name === 'create_file' && output['created'] === true) activity = 'created';
		if (['edit_file', 'replace_file'].includes(call.name) && output['changed'] === true)
			activity = 'modified';
		if (
			call.name === 'move_file' &&
			output['moved'] === true &&
			memoryPath.safeParse(output['source']).success
		) {
			path = output['destination'];
			from = output['source'] as string;
			activity = 'moved';
		}
		if (call.name === 'delete_path' && output['deleted'] === true) activity = 'deleted';
		if (!activity || !memoryPath.safeParse(path).success) return;
		const validPath = path as string;
		const mutation = activity !== 'read';
		this.events.get(event.id)!.file = {
			path: validPath,
			activity,
			...(from ? { from } : {}),
			messageIds: [call.userId, ...(call.messageId ? [call.messageId] : [])],
		};
		const prior = this.memory.files.find((file) => file.path === validPath);
		const preservesActivity =
			activity === 'read' && prior !== undefined && prior.activity !== 'deleted';
		if (activity === 'read' && prior && prior.activity !== 'deleted') activity = prior.activity;
		if (from) this.memory.files = this.memory.files.filter((file) => file.path !== from);
		this.memory.files = [
			...this.memory.files.filter((file) => file.path !== validPath),
			{
				path: validPath,
				activity,
				...(from ? { from } : preservesActivity && prior.from ? { from: prior.from } : {}),
				sourceMessageIds: preservesActivity
					? [
							...new Set([
								...(this.events.get(prior.sourceEventIds[0]!)?.file?.messageIds ?? []),
								call.userId,
							]),
						].slice(0, 3)
					: [call.userId, ...(call.messageId ? [call.messageId] : [])],
				sourceEventIds: preservesActivity
					? [...new Set([prior.sourceEventIds[0]!, event.id, ...prior.sourceEventIds])].slice(0, 3)
					: [event.id],
				revision: this.source.eventCount,
			},
		];
		this.mutationConfirmed ||= mutation;
	}

	private applyDelta(
		memory: SessionMemory,
		delta: import('@/domain/SessionMemory').MemoryDelta,
		evidence: MemoryEvidence[],
	): SessionMemory {
		const validate = (source: { messageId: string; quote: string }) => {
			const message = evidence.find((item) => item.messageId === source.messageId);
			if (
				!message ||
				!message.text.includes(source.quote) ||
				this.ambiguousMessages.has(source.messageId)
			)
				throw new Error('Unknown or fabricated evidence.');
			return message;
		};
		const item = (
			key: string,
			text: string,
			source: { messageId: string; quote: string },
			previous?: MemoryItem,
		): MemoryItem => {
			const basis = validate(source).role === 'user' ? 'user-sourced' : 'assistant-reported';
			return {
				key,
				text,
				basis,
				sourceMessageIds: mergeIds(
					previous?.text === text && previous.basis === basis ? previous.sourceMessageIds : [],
					[source.messageId],
				),
				sourceEventIds: [],
				revision: this.source.eventCount,
			};
		};
		if (delta.goal) {
			if (
				validate(delta.goal.evidence).role !== 'user' ||
				(delta.goal.mode === 'initial' && memory.goal !== null)
			)
				throw new Error('Goal requires explicit user replacement.');
			memory.goal = { ...item('goal', delta.goal.text, delta.goal.evidence), key: 'goal' };
		}
		const changed = new Set<string>();
		for (const change of delta.changes) {
			const identity = `${change.category}:${change.key}`;
			if (changed.has(identity)) throw new Error('Conflicting operations.');
			changed.add(identity);
			const source = validate(change.evidence);
			const previous = memory[change.category].find((entry) => entry.key === change.key);
			if (
				previous?.basis === 'tool-observed' ||
				change.key.startsWith('tool-') ||
				change.key.startsWith('agent-')
			)
				throw new Error('Semantic delta cannot change deterministic problems.');
			if (change.category === 'constraints' && source.role !== 'user')
				throw new Error('Constraints require user evidence.');
			if (
				change.category === 'decisions' &&
				source.role === 'assistant' &&
				(!this.mutationConfirmed || this.turnFailures.size > 0)
			)
				throw new Error('Decision lacks implementation evidence.');
			if (
				change.category === 'completed' &&
				source.role === 'assistant' &&
				this.turnFailures.size > 0
			)
				throw new Error('Completion conflicts with unresolved failure.');
			memory[change.category] = memory[change.category].filter((entry) => entry.key !== change.key);
			if (change.operation === 'upsert') {
				memory[change.category].push(item(change.key, change.text, change.evidence, previous));
				if (change.category === 'completed') {
					memory.pending = memory.pending.filter((entry) => entry.key !== change.key);
					memory.problems = memory.problems.filter(
						(entry) => entry.key !== change.key || entry.basis === 'tool-observed',
					);
				} else if (change.category === 'pending' || change.category === 'problems')
					memory.completed = memory.completed.filter((entry) => entry.key !== change.key);
			}
		}
		return compactSessionMemory(memory);
	}

	private validProvenance(document: SessionMemoryDocument): boolean {
		if (document.sessionId !== this.selected) return false;
		if (document.memory.goal && document.memory.goal.basis !== 'user-sourced') return false;
		if (document.memory.constraints.some((entry) => entry.basis !== 'user-sourced')) return false;
		if (
			['decisions', 'completed', 'pending'].some((category) =>
				document.memory[category as 'decisions'].some((entry) => entry.basis === 'tool-observed'),
			)
		)
			return false;
		if (
			document.memory.files.some((file) => {
				const observed = this.memory.files.find((entry) => entry.path === file.path);
				const anchor = this.events.get(file.sourceEventIds[0] ?? '')?.file;
				return (
					!observed ||
					observed.activity !== file.activity ||
					observed.from !== file.from ||
					!anchor ||
					anchor.path !== file.path ||
					anchor.activity !== file.activity ||
					anchor.from !== file.from ||
					file.sourceEventIds.some((id) => this.events.get(id)?.file?.path !== file.path) ||
					file.sourceMessageIds.some(
						(id) =>
							!file.sourceEventIds.some((eventId) =>
								this.events.get(eventId)?.file?.messageIds.includes(id),
							),
					) ||
					Math.max(
						...file.sourceEventIds.map((id) => this.events.get(id)?.position ?? Infinity),
					) !== file.revision
				);
			})
		)
			return false;
		const entries = [
			document.memory.goal,
			...document.memory.decisions,
			...document.memory.constraints,
			...document.memory.files,
			...document.memory.completed,
			...document.memory.pending,
			...document.memory.problems,
		].filter((entry) => entry !== null);
		if (
			entries.some(
				(entry) =>
					'basis' in entry && entry.basis !== 'tool-observed' && entry.sourceEventIds.length > 0,
			)
		)
			return false;
		if (
			document.memory.problems.some(
				(entry) =>
					entry.basis === 'tool-observed' &&
					(entry.sourceEventIds.length !== 1 ||
						this.events.get(entry.sourceEventIds[0]!)?.problem?.key !== entry.key ||
						this.events.get(entry.sourceEventIds[0]!)?.problem?.text !== entry.text ||
						entry.sourceMessageIds.length !== 1 ||
						this.events.get(entry.sourceEventIds[0]!)?.problem?.userId !==
							entry.sourceMessageIds[0] ||
						this.events.get(entry.sourceEventIds[0]!)?.position !== entry.revision),
			)
		)
			return false;
		return entries.every(
			(entry) =>
				entry.revision <= document.source.eventCount &&
				new Set(entry.sourceMessageIds).size === entry.sourceMessageIds.length &&
				new Set(entry.sourceEventIds).size === entry.sourceEventIds.length &&
				entry.sourceMessageIds.every((id) => {
					const message = this.messages.get(id);
					return (
						!!message &&
						message.position <= document.source.eventCount &&
						message.position <= entry.revision &&
						!this.ambiguousMessages.has(id) &&
						(!('basis' in entry) || entry.basis !== 'user-sourced' || message.role === 'user') &&
						(!('basis' in entry) ||
							entry.basis !== 'assistant-reported' ||
							(message.role === 'assistant' && message.final))
					);
				}) &&
				entry.sourceEventIds.every((id) => {
					const event = this.events.get(id);
					return (
						!!event &&
						event.position <= document.source.eventCount &&
						event.position <= entry.revision &&
						!this.ambiguousEvents.has(id) &&
						('path' in entry
							? event.type === 'tool.call.completed'
							: event.type === 'tool.call.completed' ||
								event.type === 'tool.call.failed' ||
								event.type === 'agent.error')
					);
				}),
		);
	}
}

/** A non-cooperating fake/provider cannot hold chat completion past the optional deadline. */
const bounded = async <T>(
	operation: Promise<T>,
	signal: AbortSignal,
	timeout?: number,
): Promise<T> => {
	const combined = timeout ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : signal;
	throwIfAborted(combined);
	let abort: () => void = () => undefined;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_, reject) => {
				abort = () => reject(new Error('Memory operation cancelled or timed out.'));
				combined.addEventListener('abort', abort, { once: true });
			}),
		]);
	} finally {
		combined.removeEventListener('abort', abort);
	}
};
