import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { isAbortError, throwIfAborted } from '@/application/services/cancellation';
import type { EventId, SessionId } from '@/domain/Ids';
import type { PresentationRuntime } from '../types';
import { StreamBuffer } from '../state/StreamBuffer';
import { chatReducer, createChatState, getSessionModelName } from '../state/presentationReducer';
import type { HistoryEntry } from '../types';

type UseChatSessionOptions = {
	runtime: PresentationRuntime;
	modelName: string;
	onModelNameChange: (modelName: string) => void;
	restoreSessionModel: boolean;
	sessionId: SessionId;
};

type SelectedSession = {
	sessionId: SessionId;
	appliedEventIds: Set<EventId>;
};

type ActiveTurn = {
	selection: SelectedSession;
	controller: AbortController;
	durableErrorDisplayed: boolean;
};

export const useChatSession = ({
	runtime,
	modelName,
	onModelNameChange,
	restoreSessionModel,
	sessionId,
}: UseChatSessionOptions) => {
	const [state, dispatch] = useReducer(chatReducer, sessionId, createChatState);
	const stream = useMemo(() => new StreamBuffer(), []);
	const selection = useMemo<SelectedSession>(
		() => ({ sessionId, appliedEventIds: new Set() }),
		[runtime, sessionId],
	);
	const selectedSessionRef = useRef(selection);
	const mountedRef = useRef(true);
	const modelNameRef = useRef(modelName);
	const activeTurnRef = useRef<ActiveTurn | null>(null);
	const subscriptionRef = useRef<(() => void) | null>(null);
	const localEntryIndexRef = useRef(0);
	selectedSessionRef.current = selection;
	modelNameRef.current = modelName;

	const isSelected = useCallback(
		(expected: SelectedSession) => mountedRef.current && selectedSessionRef.current === expected,
		[],
	);
	const isActiveTurn = useCallback(
		(turn: ActiveTurn) => isSelected(turn.selection) && activeTurnRef.current === turn,
		[isSelected],
	);
	const nextLocalId = useCallback(
		(prefix: string): string => {
			const index = localEntryIndexRef.current;
			localEntryIndexRef.current += 1;
			return `${prefix}:${sessionId}:${index}`;
		},
		[sessionId],
	);

	// Only uncommitted current-round output can become a local partial.
	const takePartial = useCallback((): HistoryEntry[] => {
		const content = stream.flush();
		stream.reset();
		return content.trim().length === 0
			? []
			: [{ id: nextLocalId('partial-assistant'), kind: 'assistant', content }];
	}, [nextLocalId, stream]);

	const subscribeEvents = useCallback(
		(turn: ActiveTurn | null) => {
			subscriptionRef.current?.();
			let disposed = false;
			const unsubscribe = runtime.subscribeSessionEvents((event) => {
				if (
					disposed ||
					!isSelected(selection) ||
					activeTurnRef.current !== turn ||
					event.sessionId !== selection.sessionId ||
					selection.appliedEventIds.has(event.id)
				)
					return;

				selection.appliedEventIds.add(event.id);
				if (turn !== null) {
					if (
						event.type === 'assistant.tool_calls.completed' ||
						event.type === 'assistant.message.completed'
					) {
						stream.flush();
						stream.reset();
					} else if (event.type === 'agent.error') {
						// Older producers may report normalized model cancellation as an error.
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
						for (const entry of takePartial()) dispatch({ type: 'history.append', entry });
						turn.durableErrorDisplayed = true;
					}
				}
				dispatch({ type: 'engine.event', event });
			});
			subscriptionRef.current = () => {
				if (disposed) return;
				disposed = true;
				unsubscribe();
			};
		},
		[runtime, selection, isSelected, stream, takePartial],
	);

	const abortTurn = useCallback(() => {
		activeTurnRef.current?.controller.abort();
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			activeTurnRef.current?.controller.abort();
			activeTurnRef.current = null;
			subscriptionRef.current?.();
			subscriptionRef.current = null;
			stream.reset();
			stream.dispose();
		};
	}, [stream]);

	useEffect(() => {
		let cancelled = false;
		const modelController = new AbortController();
		activeTurnRef.current?.controller.abort();
		activeTurnRef.current = null;
		stream.start();
		subscribeEvents(null);
		localEntryIndexRef.current = 0;
		dispatch({ type: 'session.changed', sessionId });

		const load = async (): Promise<void> => {
			try {
				const events = await runtime.listSessionEvents(sessionId);
				if (cancelled || !isSelected(selection)) {
					return;
				}

				const restoredModel = restoreSessionModel ? getSessionModelName(events) : undefined;
				if (restoredModel !== undefined && restoredModel !== modelNameRef.current) {
					const selectedModel = await runtime.switchModel(restoredModel, modelController.signal);
					if (cancelled || !isSelected(selection)) {
						return;
					}
					onModelNameChange(selectedModel);
				}

				for (const event of events) {
					if (event.sessionId === sessionId) selection.appliedEventIds.add(event.id);
				}
				dispatch({ type: 'session.loaded', events });
			} catch (caughtError) {
				if (!cancelled && isSelected(selection) && !modelController.signal.aborted) {
					dispatch({ type: 'session.load-failed', message: toError(caughtError).message });
				}
			}
		};

		void load();
		return () => {
			cancelled = true;
			modelController.abort();
			if (activeTurnRef.current?.selection === selection) {
				activeTurnRef.current.controller.abort();
				activeTurnRef.current = null;
			}
			subscriptionRef.current?.();
		};
	}, [
		runtime,
		onModelNameChange,
		restoreSessionModel,
		sessionId,
		stream,
		selection,
		isSelected,
		subscribeEvents,
	]);

	const runPrompt = useCallback(
		(prompt: string): boolean => {
			if (
				!isSelected(selection) ||
				state.sessionId !== sessionId ||
				activeTurnRef.current !== null ||
				state.loadStatus !== 'ready' ||
				state.turnStatus !== 'idle'
			)
				return false;

			const turn: ActiveTurn = {
				selection,
				controller: new AbortController(),
				durableErrorDisplayed: false,
			};
			activeTurnRef.current = turn;
			stream.start();
			subscribeEvents(turn);
			dispatch({ type: 'turn.started' });

			const run = async (): Promise<void> => {
				try {
					for await (const chunk of runtime.runTurn({
						sessionId,
						prompt,
						modelName,
						signal: turn.controller.signal,
					})) {
						if (!isActiveTurn(turn)) return;
						if (chunk.contentDelta.length === 0) continue;
						dispatch({ type: 'turn.streaming' });
						stream.push(chunk.contentDelta);
					}
					if (!isActiveTurn(turn)) return;
					throwIfAborted(turn.controller.signal);
					// An iterator returning without a commit cannot manufacture durable history.
					for (const entry of takePartial()) dispatch({ type: 'history.append', entry });
					dispatch({ type: 'turn.finished' });
				} catch (caughtError) {
					if (!isActiveTurn(turn)) return;
					const entries = takePartial();
					if (turn.controller.signal.aborted && isAbortError(caughtError)) {
						entries.push({
							id: nextLocalId('cancelled'),
							kind: 'cancelled',
							content: 'The response was cancelled.',
						});
					} else if (!turn.durableErrorDisplayed) {
						entries.push({
							id: nextLocalId('turn-error'),
							kind: 'error',
							content: toError(caughtError).message,
						});
					}
					dispatch({ type: 'turn.failed', entries });
				} finally {
					if (isActiveTurn(turn)) {
						stream.reset();
						activeTurnRef.current = null;
						subscribeEvents(null);
					}
				}
			};

			void run();
			return true;
		},
		[
			runtime,
			modelName,
			nextLocalId,
			sessionId,
			state,
			stream,
			selection,
			isSelected,
			isActiveTurn,
			subscribeEvents,
			takePartial,
		],
	);

	const appendSystemMessage = useCallback(
		(content: string, kind: 'system' | 'error' = 'system') => {
			if (!isSelected(selection)) return;
			dispatch({
				type: 'history.append',
				entry: { id: nextLocalId(kind), kind, content },
			});
		},
		[nextLocalId, selection, isSelected],
	);

	return { state, stream, runPrompt, abortTurn, appendSystemMessage };
};

const toError = (caughtError: unknown): Error => {
	return caughtError instanceof Error ? caughtError : new Error(String(caughtError));
};
