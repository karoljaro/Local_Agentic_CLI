import { Box, Text } from 'ink';

import type { SessionId } from '@/domain/Ids';
import type { CommandMenuState, ComposerState } from '../hooks/useComposer';
import type { StreamBuffer } from '../state/StreamBuffer';
import type { ChatState, PendingApproval } from '../types';
import { ApprovalView } from '../approval/ApprovalView';
import { Composer } from '../input/Composer';
import { CommandMenu } from '../input/CommandMenu';
import { LiveTurn } from './LiveTurn';
import { Transcript } from './Transcript';

type ChatScreenProps = {
	chat: ChatState;
	composer: ComposerState;
	commandMenu: CommandMenuState;
	isComposerFocused: boolean;
	modelName: string;
	onResolveApproval: (approved: boolean) => void;
	pendingApproval: PendingApproval | null;
	sessionId: SessionId;
	stream: StreamBuffer;
	workspacePath: string;
};

export const ChatScreen = ({
	chat,
	composer,
	commandMenu,
	isComposerFocused,
	modelName,
	onResolveApproval,
	pendingApproval,
	sessionId,
	stream,
	workspacePath,
}: ChatScreenProps) => (
	<Box flexDirection="column" paddingX={1}>
		<Transcript history={chat.history} sessionId={sessionId} />
		{chat.loadStatus === 'loading' ? <Text color="gray">Loading session…</Text> : null}
		<LiveTurn activeTools={chat.activeTools} status={chat.turnStatus} stream={stream} />
		{pendingApproval === null ? null : (
			<ApprovalView onResolve={onResolveApproval} request={pendingApproval} />
		)}
		<CommandMenu menu={commandMenu} />
		<Composer
			canSubmit={chat.loadStatus === 'ready' && chat.turnStatus === 'idle'}
			cursorIndex={composer.cursorIndex}
			isFocused={isComposerFocused}
			modelName={modelName}
			sessionId={sessionId}
			turnStatus={chat.turnStatus}
			value={composer.value}
			workspacePath={workspacePath}
		/>
	</Box>
);
