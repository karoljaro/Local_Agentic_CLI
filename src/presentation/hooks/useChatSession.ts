import { useCallback, useEffect, useRef, useState } from 'react';

import type { Runtime } from '@/composition/createRuntime';
import type { SessionId } from '@/domain/Ids';
import { parseChatCommand, type ChatCommand } from '@/presentation/chat/chatCommand';
import { getSessionModelName, sessionEventsToTranscript } from '@/presentation/chat/sessionEvents';
import type { TranscriptEntry, UiStatus } from '@/presentation/chat/types';
import { useAbortableTurn } from './useAbortableTurn';

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
	const { start: startTurn, abort: abortTurn } = useAbortableTurn();
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
			abortTurn();
		};
	}, [abortTurn, nextUiEntryId, onModelNameChange, restoreSessionModel, runtime, sessionId]);

	const handleCommand = useCallback(
		(command: ChatCommand): void => {
			if (command.type === 'resume') {
				onResume();
				return;
			}

			if (command.type === 'open-models') {
				onOpenModels();
				return;
			}

			try {
				const nextModelName = runtime.switchModel(command.modelName);

				onModelNameChange(nextModelName);
				appendTranscriptEntry('system', 'assistant', `Model switched to ${nextModelName}.`);
			} catch (caughtError) {
				appendTranscriptEntry('command-error', 'error', toError(caughtError).message);
			}
		},
		[appendTranscriptEntry, onModelNameChange, onOpenModels, onResume, runtime],
	);

	const runPrompt = useCallback(
		async (prompt: string): Promise<void> => {
			const command = parseChatCommand(prompt);

			if (command !== null) {
				handleCommand(command);
				return;
			}

			setStatus('streaming');
			setStreamingContent('');
			appendTranscriptEntry('user', 'user', prompt);

			let assistantContent = '';
			const activeTurn = startTurn();

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
		[appendTranscriptEntry, handleCommand, modelName, runtime, sessionId, startTurn],
	);

	return {
		abortTurn,
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
