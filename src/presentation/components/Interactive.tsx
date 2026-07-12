import { Fragment, type ReactNode } from 'react';
import { Box, Text } from 'ink';

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

export const KeyHints = ({ hints }: { hints: KeyHint[] }) => (
	<Text color="gray" wrap="wrap">
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
};

export const SelectionRow = ({ children, selected }: SelectionRowProps) => (
	<Box aria-role="option" aria-state={{ selected }}>
		<Text bold color={selected ? 'cyan' : 'gray'}>
			{selected ? '›' : ' '}{' '}
		</Text>
		<Text bold={selected} inverse={selected}>
			{children}
		</Text>
	</Box>
);
