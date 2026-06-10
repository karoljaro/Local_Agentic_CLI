import { useMemo, useState, type ReactNode } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';

import { createRuntime, type Runtime } from '@/composition/createRuntime';
import type { SessionId } from '@/domain/Ids';

type TranscriptEntry = {
	role: 'user' | 'assistant' | 'error';
	content: string;
};

type Status = 'idle' | 'streaming';

const APP_TITLE = 'Local Agentic CLI';
const INPUT_PLACEHOLDER = 'Ask local model...';
const INPUT_BACKGROUND = '#2b2b2b';
const PANEL_BACKGROUND = '#1f1f1f';

export function App2() {
	const runtime = useMemo(() => createRuntime(), []);
	const { isRawModeSupported } = useStdin();
	const [sessionId] = useState(() => runtime.idGenerator.nextSessionId());

	if (!isRawModeSupported) {
		return (
			<AppShell
				sessionId={sessionId}
				status="idle"
				statusText="interactive stdin is not available"
			>
				<Text color="yellow">
					Run this CLI in an interactive terminal to type prompts.
				</Text>
			</AppShell>
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
	const [cursorIndex, setCursorIndex] = useState(0);
	const [status, setStatus] = useState<Status>('idle');
	const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
	const [streamingContent, setStreamingContent] = useState('');

	const isStreaming = status === 'streaming';

	const runPrompt = async (prompt: string): Promise<void> => {
		setStatus('streaming');
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
			setStatus('idle');
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
				setCursorIndex(0);
				void runPrompt(prompt);
				return;
			}

			if (key.leftArrow) {
				setCursorIndex((currentIndex) => Math.max(0, currentIndex - 1));
				return;
			}

			if (key.rightArrow) {
				setCursorIndex((currentIndex) =>
					Math.min(input.length, currentIndex + 1),
				);
				return;
			}

			if (key.home) {
				setCursorIndex(0);
				return;
			}

			if (key.end) {
				setCursorIndex(input.length);
				return;
			}

			if (key.backspace) {
				if (cursorIndex === 0) {
					return;
				}

				setInput(
					(currentInput) =>
						`${currentInput.slice(0, cursorIndex - 1)}${currentInput.slice(
							cursorIndex,
						)}`,
				);
				setCursorIndex((currentIndex) => currentIndex - 1);
				return;
			}

			if (key.delete) {
				if (cursorIndex >= input.length) {
					return;
				}

				setInput(
					(currentInput) =>
						`${currentInput.slice(0, cursorIndex)}${currentInput.slice(
							cursorIndex + 1,
						)}`,
				);
				return;
			}

			if (isControlKey(key)) {
				return;
			}

			if (value.length > 0) {
				setInput(
					(currentInput) =>
						`${currentInput.slice(0, cursorIndex)}${value}${currentInput.slice(
							cursorIndex,
						)}`,
				);
				setCursorIndex((currentIndex) => currentIndex + value.length);
			}
		},
		{ isActive: !isStreaming },
	);

	return (
		<AppShell
			sessionId={sessionId}
			status={status}
			statusText={isStreaming ? 'model is streaming' : 'ready'}
		>
			<TranscriptView
				streamingContent={streamingContent}
				transcript={transcript}
			/>

			<Composer
				cursorIndex={cursorIndex}
				input={input}
				isDisabled={isStreaming}
			/>
		</AppShell>
	);
};

type AppShellProps = {
	children: ReactNode;
	sessionId: SessionId;
	status: Status;
	statusText: string;
};

const AppShell = ({ children, sessionId, status, statusText }: AppShellProps) => {
	return (
		<Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
			<Header sessionId={sessionId} status={status} statusText={statusText} />
			{children}
			<Text color="gray">Press Ctrl+C to exit.</Text>
		</Box>
	);
};

type HeaderProps = {
	sessionId: SessionId;
	status: Status;
	statusText: string;
};

const Header = ({ sessionId, status, statusText }: HeaderProps) => {
	return (
		<Box flexDirection="column">
			<Box justifyContent="space-between">
				<Text bold color="cyan">
					{APP_TITLE}
				</Text>
				<StatusPill status={status} text={statusText} />
			</Box>

			<Text color="gray">session {sessionId}</Text>
		</Box>
	);
};

type StatusPillProps = {
	status: Status;
	text: string;
};

const StatusPill = ({ status, text }: StatusPillProps) => {
	return (
		<Text color={status === 'streaming' ? 'yellow' : 'green'}>{text}</Text>
	);
};

type TranscriptViewProps = {
	streamingContent: string;
	transcript: TranscriptEntry[];
};

const TranscriptView = ({ streamingContent, transcript }: TranscriptViewProps) => {
	const entries =
		streamingContent.length === 0
			? transcript
			: [...transcript, { role: 'assistant', content: streamingContent } satisfies TranscriptEntry];

	if (entries.length === 0) {
		return (
			<Box backgroundColor={PANEL_BACKGROUND} paddingX={2} paddingY={1}>
				<Text color="gray">No messages yet.</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" gap={1}>
			{entries.map((entry, index) => (
				<MessageRow entry={entry} key={index} />
			))}
		</Box>
	);
};

type MessageRowProps = {
	entry: TranscriptEntry;
};

const MessageRow = ({ entry }: MessageRowProps) => {
	const label = getMessageLabel(entry.role);

	return (
		<Box flexDirection="column">
			<Text bold color={label.color}>
				{label.text}
			</Text>
			<Box paddingLeft={2}>
				<MessageContent entry={entry} />
			</Box>
		</Box>
	);
};

type MessageContentProps = {
	entry: TranscriptEntry;
};

const MessageContent = ({ entry }: MessageContentProps) => {
	if (entry.role === 'error') {
		return <Text color="red">{entry.content}</Text>;
	}

	return <Text>{entry.content}</Text>;
};

const getMessageLabel = (
	role: TranscriptEntry['role'],
): { color: 'cyan' | 'green' | 'red'; text: string } => {
	switch (role) {
		case 'user':
			return { color: 'green', text: 'You' };
		case 'assistant':
			return { color: 'cyan', text: 'Assistant' };
		case 'error':
			return { color: 'red', text: 'Error' };
	}
};

type ComposerProps = {
	cursorIndex: number;
	input: string;
	isDisabled: boolean;
};

const Composer = ({ cursorIndex, input, isDisabled }: ComposerProps) => {
	return (
		<Box flexDirection="column" gap={1}>
			<Text color="gray">
				{isDisabled ? 'Waiting for model response...' : 'Enter to send'}
			</Text>

			<Box backgroundColor={INPUT_BACKGROUND} paddingX={2} paddingY={1}>
				<Text color="green">› </Text>
				{isDisabled ? (
					<Text color="gray">streaming response</Text>
				) : (
					<InputText cursorIndex={cursorIndex} value={input} />
				)}
			</Box>
		</Box>
	);
};

type InputTextProps = {
	cursorIndex: number;
	value: string;
};

const InputText = ({ cursorIndex, value }: InputTextProps) => {
	if (value.length === 0) {
		return (
			<Text>
				<Text inverse> </Text>
				<Text color="gray">{INPUT_PLACEHOLDER}</Text>
			</Text>
		);
	}

	const beforeCursor = value.slice(0, cursorIndex);
	const cursorCharacter = value[cursorIndex] ?? ' ';
	const afterCursor =
		cursorIndex >= value.length ? '' : value.slice(cursorIndex + 1);

	return (
		<Text>
			{beforeCursor}
			<Text inverse>{cursorCharacter}</Text>
			{afterCursor}
		</Text>
	);
};

const isControlKey = (key: {
	ctrl: boolean;
	downArrow: boolean;
	escape: boolean;
	meta: boolean;
	pageDown: boolean;
	pageUp: boolean;
	tab: boolean;
	upArrow: boolean;
}): boolean => {
	return (
		key.ctrl ||
		key.meta ||
		key.upArrow ||
		key.downArrow ||
		key.pageUp ||
		key.pageDown ||
		key.escape ||
		key.tab
	);
};
