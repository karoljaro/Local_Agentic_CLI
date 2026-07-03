import type { ReactNode } from 'react';
import { Box, Text } from 'ink';

import type { SessionId } from '@/domain/Ids';
import type { UiStatus } from '@/presentation/chat/types';
import { getStatusColor, getStatusText } from '@/presentation/formatters/status';

const APP_TITLE = 'Local Agentic CLI';

type AppFrameProps = {
	children: ReactNode;
	sessionId?: SessionId;
	status: UiStatus;
	statusText?: string | undefined;
};

export const AppFrame = ({ children, sessionId, status, statusText }: AppFrameProps) => {
	return (
		<Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
			<Box flexDirection="column">
				<Box justifyContent="space-between">
					<Text bold color="cyan">
						{APP_TITLE}
					</Text>
					<Text color={getStatusColor(status)}>{statusText ?? getStatusText(status)}</Text>
				</Box>
				<Text color="gray">
					{sessionId === undefined ? 'session not selected' : `session ${sessionId}`}
				</Text>
			</Box>

			{children}
		</Box>
	);
};
