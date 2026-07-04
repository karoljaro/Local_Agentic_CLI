import { Box, Text, useWindowSize } from 'ink';

import type { SessionId } from '@/domain/Ids';
import type { UiStatus } from '@/presentation/chat/types';
import { getStatusColor, getStatusText } from '@/presentation/formatters/status';

const APP_TITLE = 'codesh';
const DIVIDER = '─';
const MIN_HEADER_WIDTH = 40;

export type AppHeaderProps = {
	modelName?: string | undefined;
	sessionId?: SessionId | undefined;
	status: UiStatus;
	statusText?: string | undefined;
	workspacePath?: string | undefined;
};

export const AppHeader = ({ status, statusText }: AppHeaderProps) => {
	const { columns } = useWindowSize();
	const width = Math.max(MIN_HEADER_WIDTH, columns - 2);

	return <AppHeaderContent status={status} statusText={statusText} width={width} />;
};

type AppHeaderContentProps = Pick<AppHeaderProps, 'status' | 'statusText'> & {
	width: number;
};

export const AppHeaderContent = ({ status, statusText, width }: AppHeaderContentProps) => {
	const safeWidth = Math.max(MIN_HEADER_WIDTH, Math.floor(width));

	return (
		<Box flexDirection="column" width={safeWidth}>
			<Box justifyContent="space-between" width={safeWidth}>
				<Text bold>{APP_TITLE}</Text>
				<StatusText status={status} text={statusText ?? getStatusText(status)} />
			</Box>

			<Text color="gray">{DIVIDER.repeat(safeWidth)}</Text>
		</Box>
	);
};

type StatusTextProps = {
	status: UiStatus;
	text: string;
};

const StatusText = ({ status, text }: StatusTextProps) => {
	return <Text color={getStatusColor(status)}>● {text}</Text>;
};
