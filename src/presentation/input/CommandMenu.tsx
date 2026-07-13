import { Box, Text, useWindowSize } from 'ink';

import { INTERACTIVE_COLORS, KeyHints, SelectionRow } from '../components/Interactive';
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
			flexDirection="column"
			paddingBottom={1}
			paddingX={1}
		>
			{menu.items.length === 0 ? (
				<Text color={INTERACTIVE_COLORS.surfaceSecondaryText}>· No matching commands</Text>
			) : null}
			{menu.items.map((command, index) => {
				const selected = index === menu.selectedIndex;
				return (
					<SelectionRow key={command.name} selected={selected} variant="accent">
						<Text
							bold
							color={selected ? 'black' : INTERACTIVE_COLORS.inputText}
						>{` ${command.usage} `}</Text>
						<Text bold={false} color={selected ? 'black' : INTERACTIVE_COLORS.surfaceSecondaryText}>
							{isNarrow ? `\n    ${command.description} ` : `  ${command.description} `}
						</Text>
					</SelectionRow>
				);
			})}
			<Box marginTop={menu.items.length === 0 ? 0 : 1}>
				<KeyHints
					color={INTERACTIVE_COLORS.surfaceSecondaryText}
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
