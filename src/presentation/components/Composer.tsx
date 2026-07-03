import { Box, Text } from 'ink';

import type { UiStatus } from '@/presentation/chat/types';
import { formatWorkspacePath } from '@/presentation/formatters/workspacePath';

const INPUT_BACKGROUND = '#2b2b2b';
const INPUT_PLACEHOLDER = 'Ask local model...';

type ComposerProps = {
	cursorIndex: number;
	input: string;
	isDisabled: boolean;
	modelName: string;
	status: UiStatus;
	workspacePath: string;
};

export const Composer = ({
	cursorIndex,
	input,
	isDisabled,
	modelName,
	status,
	workspacePath,
}: ComposerProps) => {
	return (
		<Box flexDirection="column">
			<Box backgroundColor={INPUT_BACKGROUND} paddingX={2} paddingY={1}>
				<Text color="cyan">&gt; </Text>
				{isDisabled ? (
					<Text color="gray">
						{status === 'loading' ? 'loading session' : 'streaming response'}
					</Text>
				) : (
					<InputText cursorIndex={cursorIndex} value={input} />
				)}
			</Box>

			<Box justifyContent="space-between">
				<Text color="gray">
					{modelName} · {formatWorkspacePath(workspacePath)}
				</Text>
				<Text color="gray">{status === 'streaming' ? 'Esc cancels' : '/model <name>'}</Text>
			</Box>
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
		<Text>
			{beforeCursor}
			<Text inverse>{cursorCharacter}</Text>
			{afterCursor}
		</Text>
	);
};
