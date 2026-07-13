import { Fragment, type ReactNode } from 'react';
import { Box, Text } from 'ink';

export const INTERACTIVE_COLORS = {
	composerSurface: '#30363d',
	composerSurfaceInactive: '#24272b',
	inputText: '#f0f6fc',
	placeholderText: '#c9d1d9',
	surfaceSecondaryText: '#b1bac4',
	secondaryText: '#8b949e',
	metadataText: '#7d8590',
} as const;

type InputSurfaceProps = {
	ariaLabel: string;
	children: ReactNode;
	focused: boolean;
	marker?: string;
};

export const InputSurface = ({ ariaLabel, children, focused, marker = '›' }: InputSurfaceProps) => (
	<Box
		aria-label={ariaLabel}
		aria-role="textbox"
		borderBottom={false}
		borderColor={focused ? 'cyan' : 'gray'}
		borderLeft
		borderLeftDimColor={!focused}
		borderRight={false}
		borderStyle="single"
		borderTop={false}
		paddingLeft={1}
	>
		<Text bold color={focused ? 'cyan' : 'gray'}>
			{marker}{' '}
		</Text>
		{children}
	</Box>
);

export type KeyHint = {
	key: string;
	label: string;
};

export const KeyHints = ({ color = 'gray', hints }: { color?: string; hints: KeyHint[] }) => (
	<Text color={color} wrap="wrap">
		{hints.map((hint, index) => (
			<Fragment key={`${hint.key}:${hint.label}`}>
				{index === 0 ? '' : '  ·  '}
				<Text bold>{hint.key}</Text> {hint.label}
			</Fragment>
		))}
	</Text>
);

type SelectionRowProps = {
	children: ReactNode;
	selected: boolean;
	variant?: 'accent' | 'inverse';
};

export const SelectionRow = ({ children, selected, variant = 'inverse' }: SelectionRowProps) => (
	<Box
		aria-role="option"
		aria-state={{ selected }}
		backgroundColor={selected && variant === 'accent' ? 'cyan' : undefined}
	>
		<Text bold color={selected && variant === 'accent' ? 'black' : selected ? 'cyan' : 'gray'}>
			{selected ? '›' : ' '}{' '}
		</Text>
		{selected && variant === 'accent' ? (
			<Text color="black">{children}</Text>
		) : (
			<Text bold={selected} inverse={selected}>
				{children}
			</Text>
		)}
	</Box>
);
