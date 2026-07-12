import { useMemo, useState } from 'react';
import { Box, Text, useStdin } from 'ink';

import { createRuntime } from '@/composition/createRuntime';
import {
	RuntimePresentationController,
	type PresentationController,
} from '@/presentation/adapters/PresentationController';
import type { AppScreen, StartupMode } from '@/presentation/types';

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
	const [screen] = useState<AppScreen>(() => (initialMode === 'resume' ? 'resume' : 'chat'));
	const [sessionId] = useState(() =>
		initialMode === 'resume' ? undefined : controller.createSessionId(),
	);

	if (!isRawModeSupported) {
		return <Text color="yellow">codesh requires an interactive terminal.</Text>;
	}

	return (
		<Box flexDirection="column">
			<Text bold>codesh</Text>
			<Text color="gray">
				Preparing {screen === 'chat' ? `session ${String(sessionId)}` : 'session picker'}…
			</Text>
		</Box>
	);
}
