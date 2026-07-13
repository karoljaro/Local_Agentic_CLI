import { useMemo } from 'react';
import { Text, useStdin } from 'ink';

import { createRuntime } from '@/composition/createRuntime';
import {
	RuntimePresentationController,
	type PresentationController,
} from '@/presentation/adapters/PresentationController';
import type { StartupMode } from '@/presentation/types';
import { usePresentation } from '@/presentation/hooks/usePresentation';
import { ChatScreen } from '@/presentation/chat/ChatScreen';
import { ModelScreen } from '@/presentation/screens/ModelScreen';
import { ResumeScreen } from '@/presentation/screens/ResumeScreen';

export type AppProps = {
	controller?: PresentationController;
	initialMode?: StartupMode;
};

export function App({ controller: injectedController, initialMode = 'new' }: AppProps) {
	const controller = useMemo(
		() => injectedController ?? new RuntimePresentationController(createRuntime()),
		[injectedController],
	);
	const { isRawModeSupported } = useStdin();

	if (!isRawModeSupported) {
		return <Text color="yellow">codesh requires an interactive terminal.</Text>;
	}

	return <InteractiveApp controller={controller} initialMode={initialMode} />;
}

const InteractiveApp = ({
	controller,
	initialMode,
}: {
	controller: PresentationController;
	initialMode: StartupMode;
}) => {
	const presentation = usePresentation(controller, initialMode);

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
			workspacePath={controller.workspacePath}
		/>
	);
};
