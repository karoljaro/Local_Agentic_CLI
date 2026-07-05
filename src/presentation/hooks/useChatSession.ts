import { useCallback, useEffect, useRef, useState } from 'react';

import type { Runtime } from '@/composition/createRuntime';
import type { SessionId } from '@/domain/Ids';
import { parseChatCommand, type ChatCommand } from '@/presentation/chat/chatCommand';
import { getSessionModelName, sessionEventsToTranscript } from '@/presentation/chat/sessionEvents';
import type { TranscriptEntry, UiStatus } from '@/presentation/chat/types';
import { useAbortableRequest } from './useAbortableRequest';

type UseChatSessionInput = {
	modelName: string;
	onOpenModels: () => void;
	onModelNameChange: (modelName: string) => void;
	onResume: () => void;
	restoreSessionModel: boolean;
	runtime: Runtime;
	sessionId: SessionId;
};

export const useChatSession = ({
	modelName,
	onOpenModels,
	onModelNameChange,
	onResume,
	restoreSessionModel,
	runtime,
	sessionId,
}: UseChatSessionInput) => {
	const [status, setStatus] = useState<UiStatus>('loading');
	const [streamingContent, setStreamingContent] = useState('');
	const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
	const { start: startRequest, abort: abortRequest } = useAbortableRequest();
	const nextUiEntryIndexRef = useRef(0);

	const nextUiEntryId = useCallback(
		(prefix: string): string => {
			const nextIndex = nextUiEntryIndexRef.current;
			nextUiEntryIndexRef.current += 1;

			return `${prefix}:${sessionId}:${nextIndex}`;
		},
		[sessionId],
	);

	const appendTranscriptEntry = useCallback(
		(prefix: string, role: TranscriptEntry['role'], content: string): void => {
			setTranscript((currentTranscript) => [
				...currentTranscript,
				{ id: nextUiEntryId(prefix), role, content },
			]);
		},
		[nextUiEntryId],
	);

	useEffect(() => {
		let isCancelled = false;
		nextUiEntryIndexRef.current = 0;

		const loadTranscript = async (): Promise<void> => {
			setStatus('loading');
			setStreamingContent('');

			try {
				const result = await runtime.listSessionEvents.list({ sessionId });

				if (isCancelled) {
					return;
				}

				const sessionModelName = restoreSessionModel
					? getSessionModelName(result.events)
					: undefined;

				if (sessionModelName !== undefined) {
					onModelNameChange(runtime.switchModel(sessionModelName));
				}

				setTranscript(sessionEventsToTranscript(result.events));
			} catch (caughtError) {
				const error = toError(caughtError);

				if (!isCancelled) {
					setTranscript([
						{ id: nextUiEntryId('load-error'), role: 'error', content: error.message },
					]);
				}
			} finally {
				if (!isCancelled) {
					setStatus('idle');
				}
			}
		};

		void loadTranscript();

		return () => {
			isCancelled = true;
			abortRequest();
		};
	}, [abortRequest, nextUiEntryId, onModelNameChange, restoreSessionModel, runtime, sessionId]);

	const releaseChatView = useCallback((): void => {
		setStreamingContent('');
		setTranscript([]);
		setStatus('idle');
	}, []);

	const unloadCurrentModel = useCallback(async (): Promise<boolean> => {
		setStatus('loading');

		const activeRequest = startRequest();

		try {
			await runtime.unloadCurrentModel({ signal: activeRequest.signal });
			return true;
		} catch (caughtError) {
			const error = toError(caughtError);

			if (!isAbortError(error)) {
				appendTranscriptEntry('command-error', 'error', error.message);
			}

			setStatus('idle');
			return false;
		} finally {
			activeRequest.clear();
		}
	}, [appendTranscriptEntry, runtime, startRequest]);

	const handleCommand = useCallback(
		async (command: ChatCommand): Promise<void> => {
			if (command.type === 'resume') {
				releaseChatView();
				onResume();
				return;
			}

			if (command.type === 'open-models') {
				const wasUnloaded = await unloadCurrentModel();

				if (!wasUnloaded) {
					return;
				}

				releaseChatView();
				onOpenModels();
				return;
			}

			const wasUnloaded = await unloadCurrentModel();

			if (!wasUnloaded) {
				return;
			}

			try {
				const nextModelName = runtime.switchModel(command.modelName);

				onModelNameChange(nextModelName);
				appendTranscriptEntry('system', 'assistant', `Model switched to ${nextModelName}.`);
			} catch (caughtError) {
				appendTranscriptEntry('command-error', 'error', toError(caughtError).message);
			} finally {
				setStatus('idle');
			}
		},
		[
			appendTranscriptEntry,
			onModelNameChange,
			onOpenModels,
			onResume,
			releaseChatView,
			runtime,
			unloadCurrentModel,
		],
	);

	const runPrompt = useCallback(
		async (prompt: string): Promise<void> => {
			const command = parseChatCommand(prompt);

			if (command !== null) {
				await handleCommand(command);
				return;
			}

			setStatus('streaming');
			setStreamingContent('');
			appendTranscriptEntry('user', 'user', prompt);

			let assistantContent = '';
			const activeTurn = startRequest();

			try {
				for await (const chunk of runtime.runAgentTurn.run({
					sessionId,
					prompt,
					modelName,
					signal: activeTurn.signal,
				})) {
					if (chunk.contentDelta.length === 0) {
						continue;
					}

					assistantContent += chunk.contentDelta;
					setStreamingContent(assistantContent);
				}

				if (assistantContent.trim().length > 0) {
					appendTranscriptEntry('assistant', 'assistant', assistantContent);
				}
			} catch (caughtError) {
				const error = toError(caughtError);
				const message = isAbortError(error) ? 'Request cancelled.' : error.message;

				appendTranscriptEntry('turn-error', 'error', message);
			} finally {
				activeTurn.clear();
				setStreamingContent('');
				setStatus('idle');
			}
		},
		[appendTranscriptEntry, handleCommand, modelName, runtime, sessionId, startRequest],
	);

	return {
		abortTurn: abortRequest,
		runPrompt,
		status,
		streamingContent,
		transcript,
	};
};

const toError = (caughtError: unknown): Error => {
	return caughtError instanceof Error ? caughtError : new Error(String(caughtError));
};

const isAbortError = (error: Error): boolean => {
	return error.name === 'AbortError';
};
