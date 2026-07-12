import { Box, Text } from 'ink';

import type { CommandMenuState } from '../hooks/useComposer';

export const CommandMenu = ({ menu }: { menu: CommandMenuState }) => {
	if (!menu.isVisible) {
		return null;
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			{menu.items.length === 0 ? <Text color="gray">No matching commands.</Text> : null}
			{menu.items.map((command, index) => {
				const selected = index === menu.selectedIndex;
				return (
					<Box key={command.name}>
						<Text bold={selected} color={selected ? 'cyan' : 'gray'}>
							{selected ? '›' : ' '} {command.usage}
						</Text>
						<Text color="gray"> · {command.description}</Text>
					</Box>
				);
			})}
			<Text color="gray">↑/↓ choose · Enter open · Tab complete · Esc close</Text>
		</Box>
	);
};
