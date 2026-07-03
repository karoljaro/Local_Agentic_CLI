import { Box, Text } from 'ink';

import type { SessionPickerOption } from '@/presentation/chat/types';

const PANEL_BACKGROUND = '#1f1f1f';

type SessionPickerProps = {
	errorMessage?: string | undefined;
	options: SessionPickerOption[];
	selectedIndex: number;
};

export const SessionPicker = ({ errorMessage, options, selectedIndex }: SessionPickerProps) => {
	return (
		<Box backgroundColor={PANEL_BACKGROUND} flexDirection="column" paddingX={2} paddingY={1}>
			<Box flexDirection="column">
				{options.map((option, index) => (
					<SessionPickerRow
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
	isSelected: boolean;
	option: SessionPickerOption;
};

const SessionPickerRow = ({ isSelected, option }: SessionPickerRowProps) => {
	const prefix = isSelected ? '> ' : '  ';
	const color = isSelected ? 'cyan' : 'white';

	if (option.type === 'new') {
		return <Text color={color}>{prefix}New chat</Text>;
	}

	return (
		<Text color={color}>
			{prefix}
			{option.sessionId}
		</Text>
	);
};

const getSessionPickerOptionKey = (option: SessionPickerOption): string => {
	return option.type === 'new' ? 'new-chat' : String(option.sessionId);
};
