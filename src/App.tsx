import { useMemo } from 'react';
import { Box, Text, useStdin } from 'ink';

import { createRuntime } from '@/composition/createRuntime';
import {
	RuntimePresentationController,
	type PresentationController,
} from '@/presentation/adapters/PresentationController';
import type { StartupMode } from '@/presentation/types';
import { usePresentation } from '@/presentation/hooks/usePresentation';
import { ChatScreen } from '@/presentation/chat/ChatScreen';

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
	const presentation = usePresentation(controller, initialMode);

	if (!isRawModeSupported) {
		return <Text color="yellow">codesh requires an interactive terminal.</Text>;
	}

	if (presentation.screen !== 'chat') {
		return (
			<Box flexDirection="column" paddingX={1}>
				<Text bold>codesh</Text>
				<Text color="gray">Preparing {presentation.screen} screen…</Text>
			</Box>
		);
	}

	return (
		<ChatScreen
			chat={presentation.chat.state}
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
}
