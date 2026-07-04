import { memo, useMemo, type ReactNode } from 'react';
import { Box, Static, Text, useWindowSize } from 'ink';

import type { TranscriptEntry } from '@/presentation/chat/types';
import { displayLength } from '@/presentation/formatters/displayLength';
import { AppHeader } from './AppHeader';
import { Markdown } from './Markdown';

const STREAMING_CURSOR = '▌';
const HISTORY_HEADER_ID = 'history-header';
const MESSAGE_TEXT_PADDING_X = 1;
const MESSAGE_RULE_MIN_WIDTH = 32;
const MESSAGE_RULE_MARGIN = 4;

type TranscriptProps = {
	streamingContent: string;
	transcript: TranscriptEntry[];
};

type TranscriptStaticItem =
	| {
			id: typeof HISTORY_HEADER_ID;
			type: 'header';
	  }
	| {
			id: string;
			type: 'message';
			entry: TranscriptEntry;
	  };

export const Transcript = ({ streamingContent, transcript }: TranscriptProps) => {
	const { columns } = useWindowSize();
	const ruleWidth = Math.max(MESSAGE_RULE_MIN_WIDTH, columns - MESSAGE_RULE_MARGIN);
	const hasLiveResponse = streamingContent.length > 0;
	const staticItems = useMemo(() => buildStaticItems(transcript), [transcript]);

	if (staticItems.length === 0 && !hasLiveResponse) {
		return <EmptyTranscript />;
	}

	return (
		<Box flexDirection="column">
			<Static items={staticItems}>
				{(item) => <TranscriptStaticBlock item={item} key={item.id} ruleWidth={ruleWidth} />}
			</Static>

			{hasLiveResponse ? (
				<LiveAssistantMessage content={streamingContent} ruleWidth={ruleWidth} />
			) : null}
		</Box>
	);
};

const buildStaticItems = (transcript: TranscriptEntry[]): TranscriptStaticItem[] => {
	if (transcript.length === 0) {
		return [];
	}

	return [
		{ id: HISTORY_HEADER_ID, type: 'header' },
		...transcript.map((entry) => ({ id: entry.id, type: 'message' as const, entry })),
	];
};

type TranscriptStaticBlockProps = {
	item: TranscriptStaticItem;
	ruleWidth: number;
};

const TranscriptStaticBlock = memo(({ item, ruleWidth }: TranscriptStaticBlockProps) => {
	if (item.type === 'header') {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<AppHeader status="idle" statusText="ready" />
			</Box>
		);
	}

	return <MessageBlock entry={item.entry} ruleWidth={ruleWidth} />;
});

TranscriptStaticBlock.displayName = 'TranscriptStaticBlock';

const EmptyTranscript = () => {
	return (
		<Box flexDirection="column" paddingX={MESSAGE_TEXT_PADDING_X}>
			<Text color="gray">No messages yet.</Text>
			<Text color="gray">Use /model to switch model or /resume to load a previous session.</Text>
		</Box>
	);
};

type MessageBlockProps = {
	entry: TranscriptEntry;
	ruleWidth: number;
};

const MessageBlock = memo(({ entry, ruleWidth }: MessageBlockProps) => {
	if (entry.role === 'user') {
		return <UserMessage content={entry.content} ruleWidth={ruleWidth} />;
	}

	if (entry.role === 'error') {
		return <ErrorMessage content={entry.content} ruleWidth={ruleWidth} />;
	}

	return <AssistantMessage content={entry.content} ruleWidth={ruleWidth} />;
});

MessageBlock.displayName = 'MessageBlock';

type MessageProps = {
	content: string;
	ruleWidth: number;
};

const UserMessage = memo(({ content, ruleWidth }: MessageProps) => {
	return (
		<MessageSection color="cyan" label="user request" ruleWidth={ruleWidth}>
			<Box paddingX={MESSAGE_TEXT_PADDING_X}>
				<Text wrap="wrap">
					<Text color="cyan">› </Text>
					{content}
				</Text>
			</Box>
		</MessageSection>
	);
});

UserMessage.displayName = 'UserMessage';

const AssistantMessage = memo(({ content, ruleWidth }: MessageProps) => {
	return (
		<MessageSection color="green" label="model response" ruleWidth={ruleWidth}>
			<Markdown maxWidth={100} showLinkUrls codeWrap="wrap" textPaddingX={MESSAGE_TEXT_PADDING_X}>
				{content}
			</Markdown>
		</MessageSection>
	);
});

AssistantMessage.displayName = 'AssistantMessage';

const LiveAssistantMessage = ({ content, ruleWidth }: MessageProps) => {
	return (
		<MessageSection color="yellow" label="model response · streaming" ruleWidth={ruleWidth}>
			<Markdown maxWidth={100} showLinkUrls codeWrap="wrap" textPaddingX={MESSAGE_TEXT_PADDING_X}>
				{`${content}${STREAMING_CURSOR}`}
			</Markdown>
		</MessageSection>
	);
};

const ErrorMessage = memo(({ content, ruleWidth }: MessageProps) => {
	return (
		<MessageSection color="red" label="error" ruleWidth={ruleWidth}>
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
	ruleWidth: number;
};

const MessageSection = ({ children, color, label, ruleWidth }: MessageSectionProps) => {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text color={color}>{buildTopRule(label, ruleWidth)}</Text>
			<Box flexDirection="column" marginY={1}>
				{children}
			</Box>
			<Text color={color}>{buildBottomRule(ruleWidth)}</Text>
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
