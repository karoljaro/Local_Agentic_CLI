import { useMemo } from 'react';
import { Text, useStdin } from 'ink';

import { createRuntime } from '@/composition/createRuntime';
import type { PresentationRuntime, StartupMode } from '@/presentation/types';
import { usePresentation } from '@/presentation/hooks/usePresentation';
import { ChatScreen } from '@/presentation/chat/ChatScreen';
import { ModelScreen } from '@/presentation/screens/ModelScreen';
import { ResumeScreen } from '@/presentation/screens/ResumeScreen';

export type AppProps = {
	runtime?: PresentationRuntime;
	initialMode?: StartupMode;
};

export function App({ runtime: injectedRuntime, initialMode = 'new' }: AppProps) {
	const runtime = useMemo(() => injectedRuntime ?? createRuntime(), [injectedRuntime]);
	const { isRawModeSupported } = useStdin();

	if (!isRawModeSupported) {
		return <Text color="yellow">codesh requires an interactive terminal.</Text>;
	}

	return <InteractiveApp runtime={runtime} initialMode={initialMode} />;
}

const InteractiveApp = ({
	runtime,
	initialMode,
}: {
	runtime: PresentationRuntime;
	initialMode: StartupMode;
}) => {
	const presentation = usePresentation(runtime, initialMode);

	if (presentation.screen === 'models') {
		return (
			<ModelScreen
				currentModelName={presentation.modelName}
				onCancel={presentation.cancelScreen}
				onSelect={presentation.selectModel}
				selection={presentation.modelSelection}
			/>
		);
	}

	if (presentation.screen === 'resume') {
		return (
			<ResumeScreen
				canCancel={presentation.canCancelScreen}
				currentSessionId={String(presentation.sessionId)}
				onCancel={presentation.cancelScreen}
				onSelect={presentation.selectSession}
				selection={presentation.sessionSelection}
			/>
		);
	}

	return (
		<ChatScreen
			chat={presentation.chat.state}
			commandMenu={presentation.composer.commandMenu}
			composer={presentation.composer}
			isComposerFocused={presentation.pendingApproval === null}
			modelName={presentation.modelName}
			onResolveApproval={presentation.resolveApproval}
			pendingApproval={presentation.pendingApproval}
			sessionId={presentation.sessionId}
			stream={presentation.chat.stream}
			workspacePath={runtime.workspacePath}
		/>
	);
};
