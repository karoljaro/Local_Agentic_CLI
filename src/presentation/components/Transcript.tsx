import { memo, useMemo, type ReactNode } from 'react';
import { Box, Static, Text, useWindowSize } from 'ink';

import type { SessionId } from '@/domain/Ids';
import type { TranscriptEntry } from '@/presentation/chat/types';
import { AppHeader } from './AppHeader';
import { Markdown } from './Markdown';

const STREAMING_CURSOR = '▌';
const MESSAGE_TEXT_PADDING_X = 1;
const MESSAGE_RULE_MIN_WIDTH = 32;
const MESSAGE_RULE_MARGIN = 4;

type TranscriptProps = {
	modelName: string;
	sessionId: SessionId;
	streamingContent: string;
	transcript: TranscriptEntry[];
	workspacePath: string;
};

type TranscriptStaticItem =
	| {
			id: string;
			type: 'header';
			modelName: string;
			sessionId: SessionId;
			workspacePath: string;
	  }
	| {
			id: string;
			type: 'message';
			entry: TranscriptEntry;
	  };

export const Transcript = ({
	modelName,
	sessionId,
	streamingContent,
	transcript,
	workspacePath,
}: TranscriptProps) => {
	const hasLiveResponse = streamingContent.length > 0;
	const staticItems = useMemo(
		() => buildStaticItems({ modelName, sessionId, transcript, workspacePath }),
		[modelName, sessionId, transcript, workspacePath],
	);

	if (staticItems.length === 0 && !hasLiveResponse) {
		return <EmptyTranscript />;
	}

	return (
		<Box flexDirection="column">
			<Static items={staticItems}>
				{(item) => <TranscriptStaticBlock item={item} key={item.id} />}
			</Static>

			{hasLiveResponse ? <LiveAssistantMessage content={streamingContent} /> : null}
		</Box>
	);
};

type BuildStaticItemsInput = {
	modelName: string;
	sessionId: SessionId;
	transcript: TranscriptEntry[];
	workspacePath: string;
};

const buildStaticItems = ({
	modelName,
	sessionId,
	transcript,
	workspacePath,
}: BuildStaticItemsInput): TranscriptStaticItem[] => {
	if (transcript.length === 0) {
		return [];
	}

	return [
		{
			id: `history-header:${sessionId}`,
			type: 'header',
			modelName,
			sessionId,
			workspacePath,
		},
		...transcript.map((entry) => ({ id: entry.id, type: 'message' as const, entry })),
	];
};

type TranscriptStaticBlockProps = {
	item: TranscriptStaticItem;
};

const TranscriptStaticBlock = memo(({ item }: TranscriptStaticBlockProps) => {
	if (item.type === 'header') {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<AppHeader
					modelName={item.modelName}
					sessionId={item.sessionId}
					status="idle"
					statusText="ready"
					workspacePath={item.workspacePath}
				/>
			</Box>
		);
	}

	return <MessageBlock entry={item.entry} />;
});

TranscriptStaticBlock.displayName = 'TranscriptStaticBlock';

const EmptyTranscript = () => {
	return (
		<Box flexDirection="column">
			<Text color="gray">No messages yet.</Text>
			<Text color="gray">Use /model to switch model or /resume to load a previous session.</Text>
		</Box>
	);
};

type MessageBlockProps = {
	entry: TranscriptEntry;
};

const MessageBlock = memo(({ entry }: MessageBlockProps) => {
	if (entry.role === 'user') {
		return <UserMessage content={entry.content} />;
	}

	if (entry.role === 'error') {
		return <ErrorMessage content={entry.content} />;
	}

	return <AssistantMessage content={entry.content} />;
});

MessageBlock.displayName = 'MessageBlock';

const UserMessage = memo(({ content }: { content: string }) => {
	return (
		<MessageSection color="cyan" label="user request">
			<Box paddingX={MESSAGE_TEXT_PADDING_X}>
				<Text color="cyan">› </Text>
				<Text wrap="wrap">{content}</Text>
			</Box>
		</MessageSection>
	);
});

UserMessage.displayName = 'UserMessage';

const AssistantMessage = memo(({ content }: { content: string }) => {
	return (
		<MessageSection color="green" label="model response">
			<Markdown maxWidth={100} showLinkUrls codeWrap="wrap" textPaddingX={MESSAGE_TEXT_PADDING_X}>
				{content}
			</Markdown>
		</MessageSection>
	);
});

AssistantMessage.displayName = 'AssistantMessage';

const LiveAssistantMessage = ({ content }: { content: string }) => {
	return (
		<MessageSection color="yellow" label="model response · streaming">
			<Markdown maxWidth={100} showLinkUrls codeWrap="wrap" textPaddingX={MESSAGE_TEXT_PADDING_X}>
				{`${content}${STREAMING_CURSOR}`}
			</Markdown>
		</MessageSection>
	);
};

const ErrorMessage = memo(({ content }: { content: string }) => {
	return (
		<MessageSection color="red" label="error">
			<Box paddingX={MESSAGE_TEXT_PADDING_X}>
				<Text color="red" wrap="wrap">
					{content}
				</Text>
			</Box>
		</MessageSection>
	);
});

ErrorMessage.displayName = 'ErrorMessage';

type MessageSectionProps = {
	children: ReactNode;
	color: 'cyan' | 'green' | 'red' | 'yellow';
	label: string;
};

const MessageSection = ({ children, color, label }: MessageSectionProps) => {
	const { columns } = useWindowSize();
	const width = Math.max(MESSAGE_RULE_MIN_WIDTH, columns - MESSAGE_RULE_MARGIN);

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text color={color}>{buildTopRule(label, width)}</Text>
			<Box flexDirection="column" marginY={1}>
				{children}
			</Box>
			<Text color={color}>{buildBottomRule(width)}</Text>
		</Box>
	);
};

const buildTopRule = (label: string, width: number): string => {
	const prefix = `╭─ ${label} `;
	return `${prefix}${'─'.repeat(Math.max(0, width - displayLength(prefix)))}`;
};

const buildBottomRule = (width: number): string => {
	return `╰${'─'.repeat(Math.max(0, width - 1))}`;
};

const displayLength = (value: string): number => {
	return Array.from(value).length;
};
