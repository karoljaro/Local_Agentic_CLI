import { useEffect, useMemo, useState } from 'react';
import { Text, useInput, useStdin } from 'ink';

import { createRuntime, type Runtime } from '@/composition/createRuntime';
import type { SessionId } from '@/domain/Ids';
import type { StartupMode } from '@/presentation/chat/startupMode';
import { AppFrame } from '@/presentation/components/AppFrame';
import { ApprovalPrompt } from '@/presentation/components/ApprovalPrompt';
import { Composer } from '@/presentation/components/Composer';
import { ModelPicker } from '@/presentation/components/ModelPicker';
import { SessionPicker } from '@/presentation/components/SessionPicker';
import { Transcript } from '@/presentation/components/Transcript';
import { WaitingForResponse } from '@/presentation/components/WaitingForResponse';
import { useChatSession } from '@/presentation/hooks/useChatSession';
import { useModelPicker } from '@/presentation/hooks/useModelPicker';
import { useSessionPicker } from '@/presentation/hooks/useSessionPicker';
import { useTextInput } from '@/presentation/hooks/useTextInput';
import { useToolApproval } from '@/presentation/hooks/useToolApproval';

type AppProps = {
	initialMode?: StartupMode | undefined;
};

type AppScreen = 'chat' | 'models' | 'resume';

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
	const [restoreSessionModel, setRestoreSessionModel] = useState(false);

	useEffect(() => {
		const controller = new AbortController();

		void runtime.listModels({ signal: controller.signal }).catch(() => {
			// Warm-up is best-effort. The picker still displays the real error when opened.
		});

		return () => {
			controller.abort();
		};
	}, [runtime]);

	const selectSession = (selectedSessionId: SessionId): void => {
		setRestoreSessionModel(selectedSessionId !== sessionId);
		setSessionId(selectedSessionId);
		setScreen('chat');
	};

	if (!isRawModeSupported) {
		return (
			<AppFrame status="idle" statusText="non-interactive">
				<Text color="yellow">Run this CLI in an interactive terminal.</Text>
			</AppFrame>
		);
	}

	if (screen === 'resume' || sessionId === undefined) {
		return (
			<SessionPickerScreen
				currentSessionId={sessionId}
				onCancel={sessionId === undefined ? undefined : () => setScreen('chat')}
				onSelectSession={selectSession}
				runtime={runtime}
			/>
		);
	}

	if (screen === 'models') {
		return (
			<ModelPickerScreen
				currentModelName={modelName}
				onCancel={() => setScreen('chat')}
				onSelectModel={(selectedModelName) => {
					setModelName(runtime.switchModel(selectedModelName));
					setRestoreSessionModel(false);
					setScreen('chat');
				}}
				runtime={runtime}
			/>
		);
	}

	return (
		<ChatScreen
			key={String(sessionId)}
			modelName={modelName}
			onOpenModels={() => setScreen('models')}
			onModelNameChange={setModelName}
			onResume={() => setScreen('resume')}
			restoreSessionModel={restoreSessionModel}
			runtime={runtime}
			sessionId={sessionId}
		/>
	);
}

type SessionPickerScreenProps = {
	currentSessionId?: SessionId | undefined;
	onCancel?: (() => void) | undefined;
	onSelectSession: (sessionId: SessionId) => void;
	runtime: Runtime;
};

const SessionPickerScreen = ({
	currentSessionId,
	onCancel,
	onSelectSession,
	runtime,
}: SessionPickerScreenProps) => {
	const picker = useSessionPicker({ onCancel, onSelectSession, runtime });

	return (
		<AppFrame
			status={picker.status}
			statusText={picker.status === 'loading' ? 'loading sessions' : 'session'}
		>
			<SessionPicker
				currentSessionId={currentSessionId}
				errorMessage={picker.errorMessage}
				options={picker.options}
				selectedIndex={picker.selectedIndex}
			/>
		</AppFrame>
	);
};

type ModelPickerScreenProps = {
	currentModelName: string;
	onCancel: () => void;
	onSelectModel: (modelName: string) => void;
	runtime: Runtime;
};

const ModelPickerScreen = ({
	currentModelName,
	onCancel,
	onSelectModel,
	runtime,
}: ModelPickerScreenProps) => {
	const picker = useModelPicker({ onCancel, onSelectModel, runtime });

	return (
		<AppFrame
			status={picker.status}
			statusText={picker.status === 'loading' ? 'loading models' : 'model'}
		>
			<ModelPicker
				currentModelName={currentModelName}
				errorMessage={picker.errorMessage}
				models={picker.models}
				selectedIndex={picker.selectedIndex}
			/>
		</AppFrame>
	);
};

type ChatScreenProps = {
	modelName: string;
	onOpenModels: () => void;
	onModelNameChange: (modelName: string) => void;
	onResume: () => void;
	restoreSessionModel: boolean;
	runtime: Runtime;
	sessionId: SessionId;
};

const ChatScreen = ({
	modelName,
	onOpenModels,
	onModelNameChange,
	onResume,
	restoreSessionModel,
	runtime,
	sessionId,
}: ChatScreenProps) => {
	const approval = useToolApproval(runtime);
	const chat = useChatSession({
		modelName,
		onOpenModels,
		onModelNameChange,
		onResume,
		restoreSessionModel,
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
		{ isActive: chat.status !== 'idle' && approval.pendingApproval === null },
	);

	const transcriptHasHeader = chat.transcript.length > 0;
	const isWaitingForResponse = chat.status === 'streaming' && chat.streamingContent.length === 0;

	return (
		<AppFrame
			showHeader={!transcriptHasHeader}
			status={chat.status}
			statusText={approval.pendingApproval === null ? undefined : 'approval'}
		>
			<Transcript streamingContent={chat.streamingContent} transcript={chat.transcript} />

			{isWaitingForResponse ? <WaitingForResponse /> : null}

			{approval.pendingApproval === null ? null : (
				<ApprovalPrompt request={approval.pendingApproval} />
			)}

			<Composer
				cursorIndex={composer.cursorIndex}
				input={composer.input}
				isDisabled={isBusy}
				modelName={modelName}
				sessionId={sessionId}
				status={chat.status}
				workspacePath={runtime.workspacePath}
			/>
		</AppFrame>
	);
};
