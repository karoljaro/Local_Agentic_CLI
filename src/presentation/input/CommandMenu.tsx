import { Box, Text, useWindowSize } from 'ink';

import { KeyHints, SelectionRow } from '../components/Interactive';
import type { CommandMenuState } from '../hooks/useComposer';

export const CommandMenu = ({ menu }: { menu: CommandMenuState }) => {
	const { columns } = useWindowSize();
	const isNarrow = columns < 48;
	if (!menu.isVisible) {
		return null;
	}

	return (
		<Box
			aria-label="Commands"
			aria-role="menu"
			borderBottom={false}
			borderColor="gray"
			borderLeft
			borderLeftDimColor
			borderRight={false}
			borderStyle="single"
			borderTop={false}
			flexDirection="column"
			paddingLeft={1}
		>
			{menu.items.length === 0 ? <Text color="gray">· No matching commands</Text> : null}
			{menu.items.map((command, index) => {
				const selected = index === menu.selectedIndex;
				return (
					<SelectionRow key={command.name} selected={selected}>
						<Text bold>{` ${command.usage} `}</Text>
						<Text {...(selected ? { dimColor: true } : { color: 'gray' })}>
							{isNarrow ? `\n    ${command.description} ` : `  ${command.description} `}
						</Text>
					</SelectionRow>
				);
			})}
			<Box marginTop={menu.items.length === 0 ? 0 : 1}>
				<KeyHints
					hints={[
						{ key: '↑↓', label: 'choose' },
						{ key: 'Enter', label: 'open' },
						{ key: 'Tab', label: 'complete' },
						{ key: 'Esc', label: 'close' },
					]}
				/>
			</Box>
		</Box>
	);
};
