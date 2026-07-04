import { Box, Text, useWindowSize } from 'ink';

import type { UiStatus } from '@/presentation/chat/types';
import { getStatusColor, getStatusText } from '@/presentation/formatters/status';

const APP_TITLE = 'codesh';
const DIVIDER = '─';
const MIN_HEADER_WIDTH = 40;
const FRAME_HORIZONTAL_PADDING = 2;

export type AppHeaderProps = {
	status: UiStatus;
	statusText?: string | undefined;
};

export const AppHeader = ({ status, statusText }: AppHeaderProps) => {
	const { columns } = useWindowSize();
	const width = Math.max(MIN_HEADER_WIDTH, columns - FRAME_HORIZONTAL_PADDING);

	return <AppHeaderContent status={status} statusText={statusText} width={width} />;
};

type AppHeaderContentProps = AppHeaderProps & {
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
