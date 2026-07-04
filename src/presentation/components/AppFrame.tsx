import type { ReactNode } from 'react';
import { Box } from 'ink';

import type { SessionId } from '@/domain/Ids';
import type { UiStatus } from '@/presentation/chat/types';
import { AppHeader } from './AppHeader';

type AppFrameProps = {
	children: ReactNode;
	modelName?: string | undefined;
	sessionId?: SessionId | undefined;
	showHeader?: boolean | undefined;
	status: UiStatus;
	statusText?: string | undefined;
	workspacePath?: string | undefined;
};

export const AppFrame = ({
	children,
	modelName,
	sessionId,
	showHeader = true,
	status,
	statusText,
	workspacePath,
}: AppFrameProps) => {
	return (
		<Box flexDirection="column" gap={1} paddingX={1} paddingY={1}>
			{showHeader ? (
				<AppHeader
					modelName={modelName}
					sessionId={sessionId}
					status={status}
					statusText={statusText}
					workspacePath={workspacePath}
				/>
			) : null}

			{children}
		</Box>
	);
};
