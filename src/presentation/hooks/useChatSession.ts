import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import type { Runtime } from '@/composition/createRuntime';
import type { SessionId } from '@/domain/Ids';
import { parseChatCommand, type ChatCommand } from '@/presentation/chat/chatCommand';
import { getSessionModelName, sessionEventsToTranscript } from '@/presentation/chat/sessionEvents';
import type { TranscriptEntry, UiStatus } from '@/presentation/chat/types';
import { useAbortableTurn } from './useAbortableTurn';

type UseChatSessionInput = {
	modelName: string;
	onModelNameChange: (modelName: string) => void;
	onResume: () => void;
	runtime: Runtime;
	sessionId: SessionId;
};

export const useChatSession = ({
	modelName,
	onModelNameChange,
	onResume,
	runtime,
	sessionId,
}: UseChatSessionInput) => {
	const [status, setStatus] = useState<UiStatus>('loading');
	const [streamingContent, setStreamingContent] = useState('');
	const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
	const turnAbort = useAbortableTurn();

	useEffect(() => {
		let isCancelled = false;

		const loadTranscript = async (): Promise<void> => {
			setStatus('loading');

			try {
				const result = await runtime.listSessionEvents.list({ sessionId });

				if (!isCancelled) {
					const sessionModelName = getSessionModelName(result.events);

					if (sessionModelName !== undefined) {
						onModelNameChange(runtime.switchModel(sessionModelName));
					}

					setTranscript(sessionEventsToTranscript(result.events));
				}
			} catch (caughtError) {
				const error = caughtError instanceof Error ? caughtError : new Error(String(caughtError));

				if (!isCancelled) {
					setTranscript([{ role: 'error', content: error.message }]);
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
		};
	}, [onModelNameChange, runtime, sessionId]);

	const runPrompt = async (prompt: string): Promise<void> => {
		const command = parseChatCommand(prompt);

		if (command !== null) {
			handleChatCommand(command, modelName, runtime, onModelNameChange, onResume, setTranscript);
			return;
		}

		setStatus('streaming');
		setStreamingContent('');
		setTranscript((currentTranscript) => [...currentTranscript, { role: 'user', content: prompt }]);

		let assistantContent = '';
		const activeTurn = turnAbort.start();

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

			setTranscript((currentTranscript) => [
				...currentTranscript,
				{ role: 'assistant', content: assistantContent },
			]);
		} catch (caughtError) {
			const error = caughtError instanceof Error ? caughtError : new Error(String(caughtError));

			setTranscript((currentTranscript) => [
				...currentTranscript,
				{
					role: 'error',
					content: isAbortError(error) ? 'Request cancelled.' : error.message,
				},
			]);
		} finally {
			activeTurn.clear();
			setStreamingContent('');
			setStatus('idle');
		}
	};

	return {
		abortTurn: turnAbort.abort,
		runPrompt,
		status,
		streamingContent,
		transcript,
	};
};

const handleChatCommand = (
	command: ChatCommand,
	modelName: string,
	runtime: Runtime,
	onModelNameChange: (modelName: string) => void,
	onResume: () => void,
	setTranscript: Dispatch<SetStateAction<TranscriptEntry[]>>,
): void => {
	if (command.type === 'resume') {
		onResume();
		return;
	}

	if (command.type === 'show-model') {
		setTranscript((currentTranscript) => [
			...currentTranscript,
			{ role: 'assistant', content: `Current model: ${modelName}` },
		]);
		return;
	}

	try {
		const nextModelName = runtime.switchModel(command.modelName);

		onModelNameChange(nextModelName);
		setTranscript((currentTranscript) => [
			...currentTranscript,
			{
				role: 'assistant',
				content: `Model switched to ${nextModelName}.`,
			},
		]);
	} catch (caughtError) {
		const error = caughtError instanceof Error ? caughtError : new Error(String(caughtError));

		setTranscript((currentTranscript) => [
			...currentTranscript,
			{ role: 'error', content: error.message },
		]);
	}
};

const isAbortError = (error: Error): boolean => {
	return error.name === 'AbortError';
};
