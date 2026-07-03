import { Box, Text } from 'ink';

import type { SessionId } from '@/domain/Ids';
import type { SessionPickerOption } from '@/presentation/chat/types';

const PANEL_BACKGROUND = '#1f1f1f';

type SessionPickerProps = {
	currentSessionId?: SessionId | undefined;
	errorMessage?: string | undefined;
	options: SessionPickerOption[];
	selectedIndex: number;
};

export const SessionPicker = ({
	currentSessionId,
	errorMessage,
	options,
	selectedIndex,
}: SessionPickerProps) => {
	return (
		<Box backgroundColor={PANEL_BACKGROUND} flexDirection="column" paddingX={2} paddingY={1}>
			<Box flexDirection="column">
				{options.map((option, index) => (
					<SessionPickerRow
						currentSessionId={currentSessionId}
						isSelected={index === selectedIndex}
						key={getSessionPickerOptionKey(option)}
						option={option}
					/>
				))}
			</Box>

			{options.length === 1 ? <Text color="gray">No saved sessions.</Text> : null}
			{errorMessage === undefined ? null : <Text color="red">{errorMessage}</Text>}
		</Box>
	);
};

type SessionPickerRowProps = {
	currentSessionId?: SessionId | undefined;
	isSelected: boolean;
	option: SessionPickerOption;
};

const SessionPickerRow = ({ currentSessionId, isSelected, option }: SessionPickerRowProps) => {
	const prefix = isSelected ? '> ' : '  ';
	const color = isSelected ? 'cyan' : 'white';

	if (option.type === 'new') {
		return <Text color={color}>{prefix}New chat</Text>;
	}

	return (
		<Text color={color}>
			{prefix}
			{option.sessionId}
			{option.sessionId === currentSessionId ? <Text color="green"> current</Text> : null}
		</Text>
	);
};

const getSessionPickerOptionKey = (option: SessionPickerOption): string => {
	return option.type === 'new' ? 'new-chat' : String(option.sessionId);
};
