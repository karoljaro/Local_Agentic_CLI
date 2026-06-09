import { useMemo, useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';

import { createRuntime } from '@/composition/createRuntime';
import type { Runtime } from '@/composition/createRuntime';
import type { SessionId } from '@/domain/Ids';

type TranscriptEntry = {
	role: 'user' | 'assistant' | 'error';
	content: string;
};

export function App() {
	const runtime = useMemo(() => createRuntime(), []);
	const { isRawModeSupported } = useStdin();
	const [sessionId] = useState(() => runtime.idGenerator.nextSessionId());

	if (!isRawModeSupported) {
		return (
			<Box flexDirection="column" gap={1}>
				<Box flexDirection="column">
					<Text color="cyan">Local Agentic CLI</Text>
					<Text color="gray">session {sessionId}</Text>
				</Box>

				<Box>
					<Text color="green">› </Text>
					<Text>interactive stdin is not available</Text>
				</Box>
			</Box>
		);
	}

	return <InteractiveApp runtime={runtime} sessionId={sessionId} />;
}

type InteractiveAppProps = {
	runtime: Runtime;
	sessionId: SessionId;
};

const InteractiveApp = ({ runtime, sessionId }: InteractiveAppProps) => {
	const [input, setInput] = useState('');
	const [isRunning, setIsRunning] = useState(false);
	const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
	const [streamingContent, setStreamingContent] = useState('');

	const runPrompt = async (prompt: string): Promise<void> => {
		setIsRunning(true);
		setStreamingContent('');
		setTranscript((currentTranscript) => [
			...currentTranscript,
			{ role: 'user', content: prompt },
		]);

		let assistantContent = '';

		try {
			for await (const chunk of runtime.runAgentTurn.run({ sessionId, prompt })) {
				assistantContent += chunk.contentDelta;
				setStreamingContent(assistantContent);
			}

			setTranscript((currentTranscript) => [
				...currentTranscript,
				{ role: 'assistant', content: assistantContent },
			]);
		} catch (caughtError) {
			const error =
				caughtError instanceof Error
					? caughtError
					: new Error(String(caughtError));

			setTranscript((currentTranscript) => [
				...currentTranscript,
				{ role: 'error', content: error.message },
			]);
		} finally {
			setStreamingContent('');
			setIsRunning(false);
		}
	};

	useInput(
		(value, key) => {
			if (key.return) {
				const prompt = input.trim();

				if (prompt.length === 0) {
					return;
				}

				setInput('');
				void runPrompt(prompt);
				return;
			}

			if (key.backspace || key.delete) {
				setInput((currentInput) => currentInput.slice(0, -1));
				return;
			}

			if (
				key.ctrl ||
				key.meta ||
				key.upArrow ||
				key.downArrow ||
				key.leftArrow ||
				key.rightArrow ||
				key.escape ||
				key.tab
			) {
				return;
			}

			if (value.length > 0) {
				setInput((currentInput) => `${currentInput}${value}`);
			}
		},
		{ isActive: !isRunning },
	);

	return (
		<Box flexDirection="column" gap={1}>
			<Box flexDirection="column">
				<Text color="cyan">Local Agentic CLI</Text>
				<Text color="gray">session {sessionId}</Text>
			</Box>

			<Box flexDirection="column" gap={1}>
				{transcript.map((entry, index) => (
					<TranscriptLine entry={entry} key={index} />
				))}

				{streamingContent.length > 0 && (
					<TranscriptLine
						entry={{ role: 'assistant', content: streamingContent }}
					/>
				)}
			</Box>

			<Box>
				<Text color="green">› </Text>
				<Text>{isRunning ? 'thinking' : input}</Text>
			</Box>
		</Box>
	);
};

type TranscriptLineProps = {
	entry: TranscriptEntry;
};

const TranscriptLine = ({ entry }: TranscriptLineProps) => {
	if (entry.role === 'user') {
		return (
			<Box>
				<Text color="green">You: </Text>
				<Text>{entry.content}</Text>
			</Box>
		);
	}

	if (entry.role === 'error') {
		return (
			<Box>
				<Text color="red">Error: </Text>
				<Text color="red">{entry.content}</Text>
			</Box>
		);
	}

	return (
		<Box>
			<Text color="cyan">Assistant: </Text>
			<Text>{entry.content}</Text>
		</Box>
	);
};
