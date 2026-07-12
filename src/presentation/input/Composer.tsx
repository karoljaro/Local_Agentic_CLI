import { Box, Text } from 'ink';

import type { SessionId } from '@/domain/Ids';
import { InputSurface, KeyHints, type KeyHint } from '../components/Interactive';
import { compactSessionId, formatWorkspacePath } from '../formatters/workspace';
import type { CommandMenuState } from '../hooks/useComposer';
import type { TurnStatus } from '../types';
import { CommandMenu } from './CommandMenu';

type ComposerProps = {
	canSubmit: boolean;
	commandMenu: CommandMenuState;
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
	commandMenu,
	cursorIndex,
	isFocused,
	modelName,
	sessionId,
	turnStatus,
	value,
	workspacePath,
}: ComposerProps) => (
	<Box flexDirection="column" marginTop={1}>
		<Box
			backgroundColor={isFocused ? '#30363d' : '#24272b'}
			flexDirection="column"
			paddingX={1}
			width="100%"
		>
			<InputSurface ariaLabel="Message" focused={isFocused}>
				<InputText cursorIndex={cursorIndex} focused={isFocused} value={value} />
			</InputSurface>
			<CommandMenu menu={commandMenu} />
		</Box>
		<Box paddingLeft={2}>
			<KeyHints dim hints={getComposerHints(canSubmit, turnStatus)} />
		</Box>
		<Box paddingLeft={2}>
			<Text color="gray" dimColor wrap="truncate-end">
				<Text bold>model</Text> {modelName} · <Text bold>cwd</Text>{' '}
				{formatWorkspacePath(workspacePath)} · <Text bold>session</Text>{' '}
				{compactSessionId(String(sessionId))}
			</Text>
		</Box>
	</Box>
);

const getComposerHints = (canSubmit: boolean, turnStatus: TurnStatus): KeyHint[] => {
	if (canSubmit) {
		return [
			{ key: 'Enter', label: 'send' },
			{ key: '/', label: 'commands' },
		];
	}

	return turnStatus === 'idle'
		? [{ key: 'Input', label: 'paused' }]
		: [
				{ key: 'Type', label: 'keep drafting' },
				{ key: 'Esc', label: 'cancel response' },
			];
};

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
				<Text color="gray" italic>
					Ask about this workspace…
				</Text>
			</Text>
		);
	}

	return (
		<Text color="white" wrap="wrap">
			{value.slice(0, cursorIndex)}
			<Text inverse>{value[cursorIndex] ?? ' '}</Text>
			{cursorIndex >= value.length ? '' : value.slice(cursorIndex + 1)}
		</Text>
	);
};
