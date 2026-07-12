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

export const KeyHints = ({
	dim = false,
	hints,
	onSurface = false,
}: {
	dim?: boolean;
	hints: KeyHint[];
	onSurface?: boolean;
}) => (
	<Text color={onSurface ? 'white' : 'gray'} dimColor={dim || onSurface} wrap="wrap">
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
	<Box aria-role="option" aria-state={{ selected }}>
		<Text bold color={selected ? 'cyan' : 'gray'}>
			{selected ? '›' : ' '}{' '}
		</Text>
		{selected && variant === 'accent' ? (
			<Text backgroundColor="cyan" bold color="black">
				{children}
			</Text>
		) : (
			<Text bold={selected} inverse={selected}>
				{children}
			</Text>
		)}
	</Box>
);
