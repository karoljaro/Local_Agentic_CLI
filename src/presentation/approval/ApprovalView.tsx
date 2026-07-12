import { useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { describeToolRequest, formatToolDetails } from '../formatters/tool';
import type { PendingApproval } from '../types';

type ApprovalViewProps = {
	onResolve: (approved: boolean) => void;
	request: PendingApproval;
};

export const ApprovalView = ({ onResolve, request }: ApprovalViewProps) => {
	const [selected, setSelected] = useState<'approve' | 'reject'>('reject');
	const [showDetails, setShowDetails] = useState(false);

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
		<Box flexDirection="column" marginY={1}>
			<Text bold color="yellow">
				? Approval required
			</Text>
			<Text wrap="wrap">{describeToolRequest(request.toolName, request.toolInput)}</Text>
			<Box marginTop={1}>
				<Decision active={selected === 'approve'} label="Approve" shortcut="y" />
				<Text> </Text>
				<Decision active={selected === 'reject'} label="Reject" shortcut="n" />
			</Box>
			<Text color="gray">←/→ choose · Enter confirm · d details · Esc reject</Text>
			{showDetails ? (
				<Box flexDirection="column" marginTop={1}>
					{formatToolDetails(request.toolInput).map((line) => (
						<Text color="gray" key={line} wrap="wrap">
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
}: {
	active: boolean;
	label: string;
	shortcut: string;
}) => (
	<Text bold={active} color={active ? 'cyan' : 'gray'} inverse={active}>
		{` ${shortcut} ${label} `}
	</Text>
);
