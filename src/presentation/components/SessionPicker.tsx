import { Box, Text } from 'ink';

import type { SessionId } from '@/domain/Ids';
import type { SessionPickerOption } from '@/presentation/chat/types';

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
		<Box flexDirection="column" gap={1}>
			<Box justifyContent="space-between">
				<Text bold>Resume session</Text>
				<Text color="gray">↑/↓ or j/k · Enter</Text>
			</Box>

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
	const marker = isSelected ? '›' : ' ';
	const markerColor = isSelected ? 'cyan' : 'gray';
	const textColor = isSelected ? 'cyan' : 'white';

	if (option.type === 'new') {
		return (
			<Box>
				<Text color={markerColor}>{marker} </Text>
				<Text color={textColor}>New chat</Text>
			</Box>
		);
	}

	return (
		<Box>
			<Text color={markerColor}>{marker} </Text>
			<Text color={textColor}>{compactSessionId(option.sessionId)}</Text>
			{option.sessionId === currentSessionId ? <Text color="green"> current</Text> : null}
		</Box>
	);
};

const getSessionPickerOptionKey = (option: SessionPickerOption): string => {
	return option.type === 'new' ? 'new-chat' : String(option.sessionId);
};

const compactSessionId = (sessionId: SessionId): string => {
	const value = String(sessionId);

	return value.length <= 42 ? value : `${value.slice(0, 18)}…${value.slice(-18)}`;
};
