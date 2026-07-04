import type { ReactNode } from 'react';
import { Box } from 'ink';

import type { UiStatus } from '@/presentation/chat/types';
import { AppHeader } from './AppHeader';

type AppFrameProps = {
	children: ReactNode;
	showHeader?: boolean | undefined;
	status: UiStatus;
	statusText?: string | undefined;
};

export const AppFrame = ({ children, showHeader = true, status, statusText }: AppFrameProps) => {
	return (
		<Box flexDirection="column" paddingX={1} paddingY={1}>
			{showHeader ? <AppHeader status={status} statusText={statusText} /> : null}
			{children}
		</Box>
	);
};
