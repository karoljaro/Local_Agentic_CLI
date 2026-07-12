import { useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { KeyHints } from '../components/Interactive';
import { formatToolDetails, formatToolName, getPrimaryToolTarget } from '../formatters/tool';
import type { PendingApproval } from '../types';

type ApprovalViewProps = {
	onResolve: (approved: boolean) => void;
	request: PendingApproval;
};

export const ApprovalView = ({ onResolve, request }: ApprovalViewProps) => {
	const [selected, setSelected] = useState<'approve' | 'reject'>('reject');
	const [showDetails, setShowDetails] = useState(false);
	const target = getPrimaryToolTarget(request.toolInput);

	useInput((value, key) => {
		const normalized = value.toLowerCase();
		if (normalized === 'y') {
			onResolve(true);
			return;
		}
		if (normalized === 'n' || key.escape) {
			onResolve(false);
			return;
		}
		if (normalized === 'd') {
			setShowDetails((current) => !current);
			return;
		}
		if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
			setSelected((current) => (current === 'approve' ? 'reject' : 'approve'));
			return;
		}
		if (key.return) {
			onResolve(selected === 'approve');
		}
	});

	return (
		<Box
			aria-label="Approval required"
			borderBottom={false}
			borderColor="yellow"
			borderLeft
			borderRight={false}
			borderStyle="double"
			borderTop={false}
			flexDirection="column"
			marginY={1}
			paddingLeft={1}
		>
			<Box>
				<Text backgroundColor="yellow" bold color="black">
					{' ? APPROVAL '}
				</Text>
			</Box>
			<Text color="gray">decision required</Text>
			<Box flexDirection="column" marginTop={1}>
				<Text color="gray">Requested action</Text>
				<Text bold wrap="wrap">
					{formatToolName(request.toolName)}
				</Text>
				{target === undefined ? null : (
					<Text color="gray" wrap="wrap">
						{target}
					</Text>
				)}
			</Box>
			<Box flexDirection="row" flexWrap="wrap" marginTop={1}>
				<Box flexShrink={0} marginRight={1}>
					<Decision active={selected === 'approve'} label="Approve" shortcut="y" tone="green" />
				</Box>
				<Box flexShrink={0}>
					<Decision active={selected === 'reject'} label="Reject" shortcut="n" tone="red" />
				</Box>
			</Box>
			<Box marginTop={1}>
				<KeyHints
					hints={[
						{ key: '←→', label: 'choose' },
						{ key: 'Enter', label: 'confirm' },
						{ key: 'd', label: 'details' },
						{ key: 'Esc', label: 'reject' },
					]}
				/>
			</Box>
			{showDetails ? (
				<Box
					borderBottom={false}
					borderColor="gray"
					borderLeft
					borderLeftDimColor
					borderRight={false}
					borderStyle="single"
					borderTop={false}
					flexDirection="column"
					marginTop={1}
					paddingLeft={1}
				>
					<Text bold color="gray">
						Details
					</Text>
					{formatToolDetails(request.toolInput).map((line) => (
						<Text color="gray" dimColor key={line} wrap="wrap">
							{line}
						</Text>
					))}
				</Box>
			) : null}
		</Box>
	);
};

const Decision = ({
	active,
	label,
	shortcut,
	tone,
}: {
	active: boolean;
	label: string;
	shortcut: string;
	tone: 'green' | 'red';
}) => {
	if (active) {
		return (
			<Text backgroundColor={tone} bold color={tone === 'green' ? 'black' : 'white'}>
				{` ● [${shortcut}] ${label} `}
			</Text>
		);
	}

	return <Text color="gray">{` ○ [${shortcut}] ${label} `}</Text>;
};
