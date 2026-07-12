import { Box, Text } from 'ink';

import type { SessionId } from '@/domain/Ids';
import { compactSessionId, formatWorkspacePath } from '../formatters/workspace';
import type { TurnStatus } from '../types';

type ComposerProps = {
	canSubmit: boolean;
	cursorIndex: number;
	isFocused: boolean;
	modelName: string;
	sessionId: SessionId;
	turnStatus: TurnStatus;
	value: string;
	workspacePath: string;
};

export const Composer = ({
	canSubmit,
	cursorIndex,
	isFocused,
	modelName,
	sessionId,
	turnStatus,
	value,
	workspacePath,
}: ComposerProps) => (
	<Box flexDirection="column" marginTop={1}>
		<Box>
			<Text bold color={isFocused ? 'cyan' : 'gray'}>
				›{' '}
			</Text>
			<InputText cursorIndex={cursorIndex} focused={isFocused} value={value} />
		</Box>
		<Box>
			<Text color="gray">
				{canSubmit
					? 'Enter send · / commands'
					: turnStatus === 'idle'
						? 'Input paused'
						: 'Keep typing · Esc cancels response'}
			</Text>
		</Box>
		<Text color="gray" wrap="truncate-end">
			{modelName} · {formatWorkspacePath(workspacePath)} · {compactSessionId(String(sessionId))}
		</Text>
	</Box>
);

const InputText = ({
	cursorIndex,
	focused,
	value,
}: {
	cursorIndex: number;
	focused: boolean;
	value: string;
}) => {
	if (!focused) {
		return <Text color="gray">{value || 'Ask about this workspace…'}</Text>;
	}

	if (value.length === 0) {
		return (
			<Text>
				<Text inverse> </Text>
				<Text color="gray">Ask about this workspace…</Text>
			</Text>
		);
	}

	return (
		<Text wrap="wrap">
			{value.slice(0, cursorIndex)}
			<Text inverse>{value[cursorIndex] ?? ' '}</Text>
			{cursorIndex >= value.length ? '' : value.slice(cursorIndex + 1)}
		</Text>
	);
};
