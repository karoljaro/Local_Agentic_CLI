import { Box, Text } from 'ink';

import type { ToolApprovalRequest } from '@/application/use-cases/RunAgentTurn';
import { formatApprovalInput } from '@/presentation/formatters/approvalInput';

type ApprovalPromptProps = {
	request: ToolApprovalRequest;
};

export const ApprovalPrompt = ({ request }: ApprovalPromptProps) => {
	const previewLines = formatApprovalInput(request.toolInput);

	return (
		<Box borderColor="yellow" borderStyle="round" flexDirection="column" paddingX={1} paddingY={0}>
			<Box justifyContent="space-between">
				<Text color="yellow">tool approval</Text>
				<Text color="gray">y approve · n reject · Esc reject</Text>
			</Box>

			<Text>
				<Text color="gray">tool </Text>
				<Text>{request.toolName}</Text>
			</Text>

			{previewLines.map((line, index) => (
				<Text color="gray" key={`${index}-${line}`} wrap="truncate-end">
					{line}
				</Text>
			))}
		</Box>
	);
};
