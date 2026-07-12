import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import type { AgentEvent, AssistantMessageCompleted } from '@/domain/AgentEvent';
import type { SessionId } from '@/domain/Ids';
import type { PresentationController } from '../adapters/PresentationController';
import { StreamBuffer } from '../state/StreamBuffer';
import { chatReducer, createChatState, getSessionModelName } from '../state/presentationReducer';
import type { HistoryEntry } from '../types';

type UseChatSessionOptions = {
	controller: PresentationController;
	modelName: string;
	onModelNameChange: (modelName: string) => void;
	restoreSessionModel: boolean;
	sessionId: SessionId;
};

export const useChatSession = ({
	controller,
	modelName,
	onModelNameChange,
	restoreSessionModel,
	sessionId,
}: UseChatSessionOptions) => {
	const [state, dispatch] = useReducer(chatReducer, sessionId, createChatState);
	const stream = useMemo(() => new StreamBuffer(), []);
	const activeSessionRef = useRef(sessionId);
	const modelNameRef = useRef(modelName);
	const activeTurnRef = useRef(false);
	const activeTurnControllerRef = useRef<AbortController | null>(null);
	const completedAssistantRef = useRef<AssistantMessageCompleted | null>(null);
	const activeAgentErrorRef = useRef<(AgentEvent & { type: 'agent.error' }) | null>(null);
	const localEntryIndexRef = useRef(0);
	activeSessionRef.current = sessionId;
	modelNameRef.current = modelName;

	const nextLocalId = useCallback(
		(prefix: string): string => {
			const index = localEntryIndexRef.current;
			localEntryIndexRef.current += 1;
			return `${prefix}:${sessionId}:${index}`;
		},
		[sessionId],
	);

	const abortTurn = useCallback(() => {
		activeTurnControllerRef.current?.abort();
	}, []);

	useEffect(() => {
		return () => {
			activeTurnControllerRef.current?.abort();
			stream.dispose();
		};
	}, [stream]);

	useEffect(() => {
		return controller.subscribeSessionEvents((event) => {
			if (event.sessionId !== activeSessionRef.current) {
				return;
			}

			if (activeTurnRef.current && event.type === 'assistant.message.completed') {
				completedAssistantRef.current = event;
				return;
			}

			if (activeTurnRef.current && event.type === 'agent.error') {
				activeAgentErrorRef.current = event;
				return;
			}

			dispatch({ type: 'engine.event', event });
		});
	}, [controller]);

	useEffect(() => {
		let cancelled = false;
		const modelController = new AbortController();
		activeTurnControllerRef.current?.abort();
		stream.start();
		localEntryIndexRef.current = 0;
		dispatch({ type: 'session.changed', sessionId });

		const load = async (): Promise<void> => {
			try {
				const events = await controller.listSessionEvents(sessionId);
				if (cancelled) {
					return;
				}

				const restoredModel = restoreSessionModel ? getSessionModelName(events) : undefined;
				if (restoredModel !== undefined && restoredModel !== modelNameRef.current) {
					const selectedModel = await controller.switchModel(restoredModel, modelController.signal);
					if (cancelled) {
						return;
					}
					onModelNameChange(selectedModel);
				}

				dispatch({ type: 'session.loaded', events });
			} catch (caughtError) {
				if (!cancelled && !modelController.signal.aborted) {
					dispatch({ type: 'session.load-failed', message: toError(caughtError).message });
				}
			}
		};

		void load();
		return () => {
			cancelled = true;
			modelController.abort();
		};
	}, [controller, onModelNameChange, restoreSessionModel, sessionId, stream]);

	const runPrompt = useCallback(
		(prompt: string): boolean => {
			if (activeTurnRef.current || state.loadStatus !== 'ready' || state.turnStatus !== 'idle') {
				return false;
			}

			activeTurnRef.current = true;
			completedAssistantRef.current = null;
			activeAgentErrorRef.current = null;
			stream.start();
			dispatch({ type: 'turn.started' });
			const turnController = new AbortController();
			activeTurnControllerRef.current = turnController;

			const run = async (): Promise<void> => {
				let receivedFirstDelta = false;
				try {
					for await (const chunk of controller.runTurn({
						sessionId,
						prompt,
						modelName,
						signal: turnController.signal,
					})) {
						if (chunk.contentDelta.length === 0) {
							continue;
						}
						if (!receivedFirstDelta) {
							receivedFirstDelta = true;
							dispatch({ type: 'turn.streaming' });
						}
						stream.push(chunk.contentDelta);
					}

					const streamedContent = stream.flush();
					const completed = completedAssistantRef.current;
					const finalContent = streamedContent || completed?.content || '';
					const assistant =
						finalContent.trim().length === 0
							? undefined
							: {
									id: completed === null ? nextLocalId('assistant') : String(completed.id),
									kind: 'assistant' as const,
									content: finalContent,
								};
					dispatch(
						assistant === undefined
							? { type: 'turn.finished' }
							: { type: 'turn.finished', assistant },
					);
				} catch (caughtError) {
					const partialContent = stream.flush();
					const entries: HistoryEntry[] = [];
					if (partialContent.trim().length > 0) {
						entries.push({
							id: nextLocalId('partial-assistant'),
							kind: 'assistant',
							content: partialContent,
						});
					}

					if (turnController.signal.aborted || isAbortError(caughtError)) {
						entries.push({
							id: nextLocalId('cancelled'),
							kind: 'cancelled',
							content: 'The response was cancelled.',
						});
					} else {
						const agentError = activeAgentErrorRef.current;
						entries.push({
							id: agentError === null ? nextLocalId('turn-error') : String(agentError.id),
							kind: 'error',
							content: agentError?.error.message ?? toError(caughtError).message,
						});
					}
					dispatch({ type: 'turn.failed', entries });
				} finally {
					activeTurnRef.current = false;
					completedAssistantRef.current = null;
					activeAgentErrorRef.current = null;
					if (activeTurnControllerRef.current === turnController) {
						activeTurnControllerRef.current = null;
					}
					stream.reset();
				}
			};

			void run();
			return true;
		},
		[controller, modelName, nextLocalId, sessionId, state.loadStatus, state.turnStatus, stream],
	);

	const appendSystemMessage = useCallback(
		(content: string, kind: 'system' | 'error' = 'system') => {
			dispatch({
				type: 'history.append',
				entry: { id: nextLocalId(kind), kind, content },
			});
		},
		[nextLocalId],
	);

	return { state, stream, runPrompt, abortTurn, appendSystemMessage };
};

const toError = (caughtError: unknown): Error => {
	return caughtError instanceof Error ? caughtError : new Error(String(caughtError));
};

const isAbortError = (caughtError: unknown): boolean => {
	return caughtError instanceof Error && caughtError.name === 'AbortError';
};
