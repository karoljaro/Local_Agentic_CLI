import { Box, Text } from 'ink';

import type { SessionId } from '@/domain/Ids';
import type { UiStatus } from '@/presentation/chat/types';
import { formatWorkspacePath } from '@/presentation/formatters/workspacePath';

const INPUT_PLACEHOLDER = 'Ask local model...';
const TEXT_PADDING_X = 1;

type ComposerProps = {
	cursorIndex: number;
	input: string;
	isDisabled: boolean;
	modelName: string;
	sessionId: SessionId;
	status: UiStatus;
	workspacePath: string;
};

export const Composer = ({
	cursorIndex,
	input,
	isDisabled,
	modelName,
	sessionId,
	status,
	workspacePath,
}: ComposerProps) => {
	return (
		<Box flexDirection="column">
			<Box borderColor="gray" borderStyle="single" paddingX={1} paddingY={0}>
				<Text color="cyan">› </Text>
				{isDisabled ? (
					<Text color="gray">
						{status === 'loading' ? 'loading session' : 'streaming response'}
					</Text>
				) : (
					<InputText cursorIndex={cursorIndex} value={input} />
				)}
			</Box>

			<Box justifyContent="space-between" paddingX={TEXT_PADDING_X}>
				<Text color="gray">Enter submit · Ctrl+U clear</Text>
				<Text color="gray">{status === 'streaming' ? 'Esc cancels' : '/model · /resume'}</Text>
			</Box>

			<FooterContext modelName={modelName} sessionId={sessionId} workspacePath={workspacePath} />
		</Box>
	);
};

type FooterContextProps = {
	modelName: string;
	sessionId: SessionId;
	workspacePath: string;
};

const FooterContext = ({ modelName, sessionId, workspacePath }: FooterContextProps) => {
	return (
		<Box paddingX={TEXT_PADDING_X}>
			<Text color="gray">
				{modelName} · {formatWorkspacePath(workspacePath)} · session {sessionId}
			</Text>
		</Box>
	);
};

type InputTextProps = {
	cursorIndex: number;
	value: string;
};

const InputText = ({ cursorIndex, value }: InputTextProps) => {
	if (value.length === 0) {
		return (
			<Text>
				<Text inverse> </Text>
				<Text color="gray">{INPUT_PLACEHOLDER}</Text>
			</Text>
		);
	}

	const beforeCursor = value.slice(0, cursorIndex);
	const cursorCharacter = value[cursorIndex] ?? ' ';
	const afterCursor = cursorIndex >= value.length ? '' : value.slice(cursorIndex + 1);

	return (
		<Text wrap="wrap">
			{beforeCursor}
			<Text inverse>{cursorCharacter}</Text>
			{afterCursor}
		</Text>
	);
};
