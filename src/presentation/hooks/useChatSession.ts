import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type Dispatch,
	type SetStateAction,
} from 'react';

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

	useEffect(() => {
		let isCancelled = false;
		nextUiEntryIndexRef.current = 0;

		const loadTranscript = async (): Promise<void> => {
			setStatus('loading');
			setStreamingContent('');

			try {
				const result = await runtime.listSessionEvents.list({ sessionId });

				if (!isCancelled) {
					const sessionModelName = restoreSessionModel
						? getSessionModelName(result.events)
						: undefined;

					if (sessionModelName !== undefined) {
						onModelNameChange(runtime.switchModel(sessionModelName));
					}

					setTranscript(sessionEventsToTranscript(result.events));
				}
			} catch (caughtError) {
				const error = caughtError instanceof Error ? caughtError : new Error(String(caughtError));

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

	const runPrompt = useCallback(
		async (prompt: string): Promise<void> => {
			const command = parseChatCommand(prompt);

			if (command !== null) {
				handleChatCommand(
					command,
					runtime,
					onOpenModels,
					onModelNameChange,
					onResume,
					setTranscript,
					nextUiEntryId,
				);
				return;
			}

			setStatus('streaming');
			setStreamingContent('');
			setTranscript((currentTranscript) => [
				...currentTranscript,
				{ id: nextUiEntryId('user'), role: 'user', content: prompt },
			]);

			let assistantContent = '';
			const activeTurn = startTurn();

			try {
				for await (const chunk of runtime.runAgentTurn.run({
					sessionId,
					prompt,
					modelName,
					signal: activeTurn.signal,
				})) {
					assistantContent += chunk.contentDelta;
					setStreamingContent(assistantContent);
				}

				if (assistantContent.trim().length > 0) {
					setTranscript((currentTranscript) => [
						...currentTranscript,
						{ id: nextUiEntryId('assistant'), role: 'assistant', content: assistantContent },
					]);
				}
			} catch (caughtError) {
				const error = caughtError instanceof Error ? caughtError : new Error(String(caughtError));

				setTranscript((currentTranscript) => [
					...currentTranscript,
					{
						id: nextUiEntryId('turn-error'),
						role: 'error',
						content: isAbortError(error) ? 'Request cancelled.' : error.message,
					},
				]);
			} finally {
				activeTurn.clear();
				setStreamingContent('');
				setStatus('idle');
			}
		},
		[
			modelName,
			nextUiEntryId,
			onModelNameChange,
			onOpenModels,
			onResume,
			runtime,
			sessionId,
			startTurn,
		],
	);

	return {
		abortTurn,
		runPrompt,
		status,
		streamingContent,
		transcript,
	};
};

const handleChatCommand = (
	command: ChatCommand,
	runtime: Runtime,
	onOpenModels: () => void,
	onModelNameChange: (modelName: string) => void,
	onResume: () => void,
	setTranscript: Dispatch<SetStateAction<TranscriptEntry[]>>,
	nextUiEntryId: (prefix: string) => string,
): void => {
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
		setTranscript((currentTranscript) => [
			...currentTranscript,
			{
				id: nextUiEntryId('system'),
				role: 'assistant',
				content: `Model switched to ${nextModelName}.`,
			},
		]);
	} catch (caughtError) {
		const error = caughtError instanceof Error ? caughtError : new Error(String(caughtError));

		setTranscript((currentTranscript) => [
			...currentTranscript,
			{ id: nextUiEntryId('command-error'), role: 'error', content: error.message },
		]);
	}
};

const isAbortError = (error: Error): boolean => {
	return error.name === 'AbortError';
};
