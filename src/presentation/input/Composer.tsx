import { Box, Text } from 'ink';

import type { SessionId } from '@/domain/Ids';
import {
	InputSurface,
	INTERACTIVE_COLORS,
	KeyHints,
	type KeyHint,
} from '../components/Interactive';
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
	<Box flexDirection="column">
		<Box
			backgroundColor={
				isFocused ? INTERACTIVE_COLORS.composerSurface : INTERACTIVE_COLORS.composerSurfaceInactive
			}
			flexDirection="column"
			width="100%"
		>
			<Box alignItems="center" height={3} paddingX={1} width="100%">
				<InputSurface ariaLabel="Message" focused={isFocused}>
					<InputText cursorIndex={cursorIndex} focused={isFocused} value={value} />
				</InputSurface>
			</Box>
			<Box paddingX={1} width="100%">
				<CommandMenu menu={commandMenu} />
			</Box>
		</Box>
		<Box paddingLeft={2}>
			<KeyHints
				color={INTERACTIVE_COLORS.secondaryText}
				hints={getComposerHints(canSubmit, turnStatus)}
			/>
		</Box>
		<Box paddingLeft={2}>
			<Text color={INTERACTIVE_COLORS.metadataText} wrap="truncate-end">
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
		return (
			<Text
				color={
					value.length > 0
						? INTERACTIVE_COLORS.surfaceSecondaryText
						: INTERACTIVE_COLORS.placeholderText
				}
			>
				{value || 'Ask about this workspace…'}
			</Text>
		);
	}

	if (value.length === 0) {
		return (
			<Text>
				<Text inverse> </Text>{' '}
				<Text color={INTERACTIVE_COLORS.placeholderText} italic>
					Ask about this workspace…
				</Text>
			</Text>
		);
	}

	return (
		<Text color={INTERACTIVE_COLORS.inputText} wrap="wrap">
			{value.slice(0, cursorIndex)}
			<Text inverse>{value[cursorIndex] ?? ' '}</Text>
			{cursorIndex >= value.length ? '' : value.slice(cursorIndex + 1)}
		</Text>
	);
};
