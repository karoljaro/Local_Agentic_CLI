import { useMemo, useState } from 'react';
import { Text, useInput, useStdin } from 'ink';

import { createRuntime, type Runtime } from '@/composition/createRuntime';
import type { SessionId } from '@/domain/Ids';
import type { StartupMode } from '@/presentation/chat/startupMode';
import { AppFrame } from '@/presentation/components/AppFrame';
import { ApprovalPrompt } from '@/presentation/components/ApprovalPrompt';
import { Composer } from '@/presentation/components/Composer';
import { SessionPicker } from '@/presentation/components/SessionPicker';
import { Transcript } from '@/presentation/components/Transcript';
import { useChatSession } from '@/presentation/hooks/useChatSession';
import { useSessionPicker } from '@/presentation/hooks/useSessionPicker';
import { useTextInput } from '@/presentation/hooks/useTextInput';
import { useToolApproval } from '@/presentation/hooks/useToolApproval';

type AppProps = {
	initialMode?: StartupMode | undefined;
};

type AppScreen = 'chat' | 'resume';

export function App({ initialMode = 'new' }: AppProps) {
	const runtime = useMemo(() => createRuntime(), []);
	const { isRawModeSupported } = useStdin();
	const [sessionId, setSessionId] = useState<SessionId | undefined>(() =>
		initialMode === 'new' ? runtime.idGenerator.nextSessionId() : undefined,
	);
	const [screen, setScreen] = useState<AppScreen>(() =>
		initialMode === 'resume' ? 'resume' : 'chat',
	);
	const [modelName, setModelName] = useState(() => runtime.getModelName());

	const selectSession = (selectedSessionId: SessionId): void => {
		setSessionId(selectedSessionId);
		setScreen('chat');
	};

	const openResumeScreen = (): void => {
		setScreen('resume');
	};

	if (!isRawModeSupported) {
		return (
			<AppFrame status="idle" statusText="interactive stdin is not available">
				<Text color="yellow">Run this CLI in an interactive terminal.</Text>
			</AppFrame>
		);
	}

	if (screen === 'resume' || sessionId === undefined) {
		return <SessionPickerScreen onSelectSession={selectSession} runtime={runtime} />;
	}

	return (
		<ChatScreen
			key={String(sessionId)}
			modelName={modelName}
			onModelNameChange={setModelName}
			onResume={openResumeScreen}
			runtime={runtime}
			sessionId={sessionId}
		/>
	);
}

type SessionPickerScreenProps = {
	onSelectSession: (sessionId: SessionId) => void;
	runtime: Runtime;
};

const SessionPickerScreen = ({ onSelectSession, runtime }: SessionPickerScreenProps) => {
	const picker = useSessionPicker({ onSelectSession, runtime });

	return (
		<AppFrame
			status={picker.status}
			statusText={picker.status === 'loading' ? 'loading' : 'session'}
		>
			<SessionPicker
				errorMessage={picker.errorMessage}
				options={picker.options}
				selectedIndex={picker.selectedIndex}
			/>
		</AppFrame>
	);
};

type ChatScreenProps = {
	modelName: string;
	onModelNameChange: (modelName: string) => void;
	onResume: () => void;
	runtime: Runtime;
	sessionId: SessionId;
};

const ChatScreen = ({
	modelName,
	onModelNameChange,
	onResume,
	runtime,
	sessionId,
}: ChatScreenProps) => {
	const approval = useToolApproval(runtime);
	const chat = useChatSession({
		modelName,
		onModelNameChange,
		onResume,
		runtime,
		sessionId,
	});
	const isBusy = chat.status !== 'idle';
	const composer = useTextInput({
		isActive: !isBusy && approval.pendingApproval === null,
		onSubmit: (prompt) => {
			void chat.runPrompt(prompt);
		},
	});

	useInput(
		(_value, key) => {
			if (key.escape) {
				chat.abortTurn();
			}
		},
		{ isActive: chat.status === 'streaming' && approval.pendingApproval === null },
	);

	return (
		<AppFrame
			sessionId={sessionId}
			status={chat.status}
			statusText={approval.pendingApproval === null ? undefined : 'approval'}
		>
			<Transcript streamingContent={chat.streamingContent} transcript={chat.transcript} />

			{approval.pendingApproval === null ? null : (
				<ApprovalPrompt request={approval.pendingApproval} />
			)}

			<Composer
				cursorIndex={composer.cursorIndex}
				input={composer.input}
				isDisabled={isBusy}
				modelName={modelName}
				status={chat.status}
				workspacePath={runtime.workspacePath}
			/>
		</AppFrame>
	);
};
