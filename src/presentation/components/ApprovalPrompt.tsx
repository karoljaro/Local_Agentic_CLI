import { Box, Text } from 'ink';

import type { ToolApprovalRequest } from '@/application/use-cases/RunAgentTurn';
import { formatApprovalInput } from '@/presentation/formatters/approvalInput';

const PANEL_BACKGROUND = '#1f1f1f';

type ApprovalPromptProps = {
	request: ToolApprovalRequest;
};

export const ApprovalPrompt = ({ request }: ApprovalPromptProps) => {
	return (
		<Box backgroundColor={PANEL_BACKGROUND} flexDirection="column" paddingX={2} paddingY={1}>
			<Text color="yellow">Approve {request.toolName}? y/n</Text>
			{formatApprovalInput(request.toolInput).map((line, index) => (
				<Text color="gray" key={`${index}-${line}`}>
					{line}
				</Text>
			))}
		</Box>
	);
};
