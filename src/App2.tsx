import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';

import type { StoredSession } from '@/application/ports/SessionStorePort';
import { createRuntime, type Runtime } from '@/composition/createRuntime';
import type { ListedSessionEvent } from '@/application/use-cases/ListSessionEvents';
import type { ToolApprovalRequest } from '@/application/use-cases/RunAgentTurn';
import type { SessionId } from '@/domain/Ids';

type TranscriptEntry = {
	role: 'user' | 'assistant' | 'error';
	content: string;
};

type Status = 'idle' | 'loading' | 'streaming';

const APP_TITLE = 'Local Agentic CLI';
const INPUT_PLACEHOLDER = 'Ask local model...';
const INPUT_BACKGROUND = '#2b2b2b';
const PANEL_BACKGROUND = '#1f1f1f';
const MODEL_COMMAND = '/model';

export function App2() {
	const runtime = useMemo(() => createRuntime(), []);
	const { isRawModeSupported } = useStdin();
	const [sessionId, setSessionId] = useState<SessionId | undefined>();
	const [modelName, setModelName] = useState(() => runtime.getModelName());

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

	if (sessionId === undefined) {
		return (
			<SessionPicker
				onSelectSession={setSessionId}
				runtime={runtime}
			/>
		);
	}

	return (
		<InteractiveApp
			key={String(sessionId)}
			modelName={modelName}
			onModelNameChange={setModelName}
			runtime={runtime}
			sessionId={sessionId}
		/>
	);
}

type InteractiveAppProps = {
	modelName: string;
	onModelNameChange: (modelName: string) => void;
	runtime: Runtime;
	sessionId: SessionId;
};

type SessionPickerOption =
	| {
			type: 'new';
	  }
	| {
			type: 'existing';
			sessionId: SessionId;
	  };

type SessionPickerProps = {
	runtime: Runtime;
	onSelectSession: (sessionId: SessionId) => void;
};

const SessionPicker = ({
	runtime,
	onSelectSession,
}: SessionPickerProps) => {
	const [sessions, setSessions] = useState<StoredSession[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [status, setStatus] = useState<Status>('loading');
	const [errorMessage, setErrorMessage] = useState<string | undefined>();

	const options = useMemo<SessionPickerOption[]>(() => {
		return [
			{ type: 'new' },
			...sessions.map((session) => ({
				type: 'existing' as const,
				sessionId: session.sessionId,
			})),
		];
	}, [sessions]);

	useEffect(() => {
		let isCancelled = false;

		const loadSessions = async (): Promise<void> => {
			setStatus('loading');
			setErrorMessage(undefined);

			try {
				const result = await runtime.listSessions.list();

				if (!isCancelled) {
					setSessions(result.sessions);
				}
			} catch (caughtError) {
				const error =
					caughtError instanceof Error
						? caughtError
						: new Error(String(caughtError));

				if (!isCancelled) {
					setSessions([]);
					setErrorMessage(error.message);
				}
			} finally {
				if (!isCancelled) {
					setStatus('idle');
				}
			}
		};

		void loadSessions();

		return () => {
			isCancelled = true;
		};
	}, [runtime]);

	useEffect(() => {
		setSelectedIndex((currentIndex) =>
			Math.min(currentIndex, Math.max(0, options.length - 1)),
		);
	}, [options.length]);

	useInput(
		(_value, key) => {
			if (key.upArrow) {
				setSelectedIndex((currentIndex) => Math.max(0, currentIndex - 1));
				return;
			}

			if (key.downArrow) {
				setSelectedIndex((currentIndex) =>
					Math.min(options.length - 1, currentIndex + 1),
				);
				return;
			}

			if (key.return) {
				const selectedOption = options[selectedIndex];

				if (selectedOption === undefined) {
					return;
				}

				if (selectedOption.type === 'new') {
					onSelectSession(runtime.idGenerator.nextSessionId());
					return;
				}

				onSelectSession(selectedOption.sessionId);
			}
		},
		{ isActive: status === 'idle' },
	);

	return (
		<AppShell
			sessionId={undefined}
			status={status}
			statusText={status === 'loading' ? 'loading sessions' : 'choose session'}
		>
			<Box
				backgroundColor={PANEL_BACKGROUND}
				flexDirection="column"
				paddingX={2}
				paddingY={1}
			>
				<SessionPickerList
					errorMessage={errorMessage}
					options={options}
					selectedIndex={selectedIndex}
				/>
			</Box>
		</AppShell>
	);
};

type SessionPickerListProps = {
	errorMessage: string | undefined;
	options: SessionPickerOption[];
	selectedIndex: number;
};

const SessionPickerList = ({
	errorMessage,
	options,
	selectedIndex,
}: SessionPickerListProps) => {
	return (
		<Box flexDirection="column" gap={1}>
			<Box flexDirection="column">
				{options.map((option, index) => (
					<SessionPickerRow
						isSelected={index === selectedIndex}
						key={getSessionPickerOptionKey(option)}
						option={option}
					/>
				))}
			</Box>

			{options.length === 1 ? (
				<Text color="gray">No saved sessions.</Text>
			) : null}

			{errorMessage === undefined ? null : (
				<Text color="red">{errorMessage}</Text>
			)}
		</Box>
	);
};

type SessionPickerRowProps = {
	isSelected: boolean;
	option: SessionPickerOption;
};

const SessionPickerRow = ({ isSelected, option }: SessionPickerRowProps) => {
	const prefix = isSelected ? '> ' : '  ';

	if (option.type === 'new') {
		return (
			<Text color={isSelected ? 'cyan' : 'white'}>
				{prefix}New chat
			</Text>
		);
	}

	return (
		<Text color={isSelected ? 'cyan' : 'white'}>
			{prefix}{option.sessionId}
		</Text>
	);
};

const getSessionPickerOptionKey = (option: SessionPickerOption): string => {
	if (option.type === 'new') {
		return 'new-chat';
	}

	return String(option.sessionId);
};

const InteractiveApp = ({
	modelName,
	onModelNameChange,
	runtime,
	sessionId,
}: InteractiveAppProps) => {
	const [input, setInput] = useState('');
	const [cursorIndex, setCursorIndex] = useState(0);
	const [status, setStatus] = useState<Status>('idle');
	const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
	const [streamingContent, setStreamingContent] = useState('');
	const [pendingApproval, setPendingApproval] =
		useState<ToolApprovalRequest | null>(null);
	const approvalResolveRef = useRef<((approved: boolean) => void) | null>(null);

	const isBusy = status !== 'idle';

	useEffect(() => {
		const unregister = runtime.setToolApprovalHandler((request) => {
			return new Promise<boolean>((resolve) => {
				approvalResolveRef.current?.(false);
				approvalResolveRef.current = resolve;
				setPendingApproval(request);
			});
		});

		return () => {
			unregister();
			approvalResolveRef.current?.(false);
			approvalResolveRef.current = null;
		};
	}, [runtime]);

	useEffect(() => {
		let isCancelled = false;

		const loadTranscript = async (): Promise<void> => {
			setStatus('loading');

			try {
				const result = await runtime.listSessionEvents.list({ sessionId });

				if (!isCancelled) {
					setTranscript(sessionEventsToTranscript(result.events));
				}
			} catch (caughtError) {
				const error =
					caughtError instanceof Error
						? caughtError
						: new Error(String(caughtError));

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
	}, [runtime, sessionId]);

	const runPrompt = async (prompt: string): Promise<void> => {
		const modelCommand = parseModelCommand(prompt);

		if (modelCommand !== null) {
			handleModelCommand(modelCommand);
			return;
		}

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

	const handleModelCommand = (command: ModelCommand): void => {
		if (command.type === 'show') {
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
				{ role: 'assistant', content: `Model switched to ${nextModelName}.` },
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
		}
	};

	const resolveToolApproval = (approved: boolean): void => {
		const resolve = approvalResolveRef.current;

		approvalResolveRef.current = null;
		setPendingApproval(null);
		resolve?.(approved);
	};

	useInput(
		(value, key) => {
			if (pendingApproval === null) {
				return;
			}

			const normalizedValue = value.toLowerCase();

			if (normalizedValue === 'y') {
				resolveToolApproval(true);
				return;
			}

			if (normalizedValue === 'n' || key.escape) {
				resolveToolApproval(false);
			}
		},
		{ isActive: pendingApproval !== null },
	);

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
		{ isActive: !isBusy && pendingApproval === null },
	);

	return (
		<AppShell
			sessionId={sessionId}
			status={status}
			statusText={
				pendingApproval === null ? getStatusText(status) : 'approval required'
			}
		>
			<TranscriptView
				streamingContent={streamingContent}
				transcript={transcript}
			/>

			{pendingApproval === null ? null : (
				<ApprovalPrompt request={pendingApproval} />
			)}

			<Composer
				cursorIndex={cursorIndex}
				input={input}
				isDisabled={isBusy}
				modelName={modelName}
				status={status}
				workspacePath={runtime.workspacePath}
			/>
		</AppShell>
	);
};

const sessionEventsToTranscript = (
	events: ListedSessionEvent[],
): TranscriptEntry[] => {
	return events.map((event) => {
		if (event.type === 'prompt.submitted') {
			return { role: 'user', content: event.prompt };
		}

		return { role: 'assistant', content: event.content };
	});
};

type AppShellProps = {
	children: ReactNode;
	sessionId: SessionId | undefined;
	status: Status;
	statusText: string;
};

const AppShell = ({
	children,
	sessionId,
	status,
	statusText,
}: AppShellProps) => {
	return (
		<Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
			<Header
				sessionId={sessionId}
				status={status}
				statusText={statusText}
			/>
			{children}
			<Text color="gray">Press Ctrl+C to exit.</Text>
		</Box>
	);
};

type HeaderProps = {
	sessionId: SessionId | undefined;
	status: Status;
	statusText: string;
};

const Header = ({
	sessionId,
	status,
	statusText,
}: HeaderProps) => {
	return (
		<Box flexDirection="column">
			<Box justifyContent="space-between">
				<Text bold color="cyan">
					{APP_TITLE}
				</Text>
				<StatusPill status={status} text={statusText} />
			</Box>

			<Text color="gray">
				{sessionId === undefined ? 'session not selected' : `session ${sessionId}`}
			</Text>
		</Box>
	);
};

type StatusPillProps = {
	status: Status;
	text: string;
};

const StatusPill = ({ status, text }: StatusPillProps) => {
	return <Text color={getStatusColor(status)}>{text}</Text>;
};

const getStatusText = (status: Status): string => {
	switch (status) {
		case 'idle':
			return 'ready';
		case 'loading':
			return 'loading session';
		case 'streaming':
			return 'model is streaming';
	}
};

const getStatusColor = (status: Status): 'green' | 'yellow' => {
	return status === 'idle' ? 'green' : 'yellow';
};

const formatWorkspacePath = (workspacePath: string): string => {
	const homeDirectory = process.env['HOME'];

	if (homeDirectory === undefined) {
		return workspacePath;
	}

	if (workspacePath === homeDirectory) {
		return '~';
	}

	if (workspacePath.startsWith(`${homeDirectory}/`)) {
		return `~/${workspacePath.slice(homeDirectory.length + 1)}`;
	}

	return workspacePath;
};

type ModelCommand =
	| {
			type: 'show';
	  }
	| {
			type: 'switch';
			modelName: string;
	  };

const parseModelCommand = (prompt: string): ModelCommand | null => {
	const trimmedPrompt = prompt.trim();

	if (trimmedPrompt === MODEL_COMMAND) {
		return { type: 'show' };
	}

	if (!trimmedPrompt.startsWith(`${MODEL_COMMAND} `)) {
		return null;
	}

	const modelName = trimmedPrompt.slice(MODEL_COMMAND.length).trim();

	return modelName.length === 0 ? { type: 'show' } : { type: 'switch', modelName };
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
	if (entry.role === 'user') {
		return (
			<Box backgroundColor={INPUT_BACKGROUND} paddingX={2} paddingY={1}>
				<Text color="white">&gt; {entry.content}</Text>
			</Box>
		);
	}

	if (entry.role === 'error') {
		return (
			<Box paddingLeft={2}>
				<Text color="red">{entry.content}</Text>
			</Box>
		);
	}

	return (
		<Box paddingLeft={2}>
			<Text>{entry.content}</Text>
		</Box>
	);
};

type ApprovalPromptProps = {
	request: ToolApprovalRequest;
};

const ApprovalPrompt = ({ request }: ApprovalPromptProps) => {
	return (
		<Box
			backgroundColor={PANEL_BACKGROUND}
			flexDirection="column"
			paddingX={2}
			paddingY={1}
		>
			<Text color="yellow">Approve {request.toolName}? y/n</Text>
			{formatApprovalInput(request.toolInput).map((line, index) => (
				<Text color="gray" key={`${index}-${line}`}>
					{line}
				</Text>
			))}
		</Box>
	);
};

const formatApprovalInput = (toolInput: unknown): string[] => {
	if (typeof toolInput !== 'object' || toolInput === null) {
		return [`input ${String(toolInput)}`];
	}

	const input = toolInput as {
		path?: unknown;
		oldText?: unknown;
		newText?: unknown;
	};
	const lines: string[] = [];

	if (typeof input.path === 'string') {
		lines.push(`path ${input.path}`);
	}

	if (typeof input.oldText === 'string') {
		lines.push(`old ${formatInlinePreview(input.oldText)}`);
	}

	if (typeof input.newText === 'string') {
		lines.push(`new ${formatInlinePreview(input.newText)}`);
	}

	const fallbackInput = JSON.stringify(toolInput);

	return lines.length > 0
		? lines
		: [`input ${fallbackInput ?? String(toolInput)}`];
};

const formatInlinePreview = (text: string): string => {
	const normalizedText = text.replaceAll('\n', '\\n');
	const maxLength = 120;

	return normalizedText.length <= maxLength
		? normalizedText
		: `${normalizedText.slice(0, maxLength)}...`;
};

type ComposerProps = {
	cursorIndex: number;
	input: string;
	isDisabled: boolean;
	modelName: string;
	status: Status;
	workspacePath: string;
};

const Composer = ({
	cursorIndex,
	input,
	isDisabled,
	modelName,
	status,
	workspacePath,
}: ComposerProps) => {
	return (
		<Box flexDirection="column" gap={1}>
			<Text color="gray">
				{status === 'loading'
					? 'Loading previous messages...'
					: isDisabled
						? 'Waiting for model response...'
						: 'Enter to send | /model <name>'}
			</Text>

			<Box backgroundColor={INPUT_BACKGROUND} paddingX={2} paddingY={1}>
				<Text color="white">&gt; </Text>
				{isDisabled ? (
					<Text color="gray">
						{status === 'loading' ? 'loading session' : 'streaming response'}
					</Text>
				) : (
					<InputText cursorIndex={cursorIndex} value={input} />
				)}
			</Box>

			<Text color="white">
				{modelName} · {formatWorkspacePath(workspacePath)}
			</Text>
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
