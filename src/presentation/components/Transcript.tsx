import { memo } from 'react';
import { Box, Text } from 'ink';

import type { TranscriptEntry } from '@/presentation/chat/types';
import { Markdown } from './Markdown';

const USER_BACKGROUND = '#2b2b2b';
const EMPTY_BACKGROUND = '#1f1f1f';

type TranscriptProps = {
	streamingContent: string;
	transcript: TranscriptEntry[];
};

export const Transcript = ({ streamingContent, transcript }: TranscriptProps) => {
	if (transcript.length === 0 && streamingContent.length === 0) {
		return (
			<Box backgroundColor={EMPTY_BACKGROUND} paddingX={2} paddingY={1}>
				<Text color="gray">No messages yet.</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" gap={1}>
			{transcript.map((entry, index) => (
				<MessageRow entry={entry} key={`${entry.role}-${index}`} />
			))}
			{streamingContent.length === 0 ? null : <AssistantMessage content={streamingContent} />}
		</Box>
	);
};

type MessageRowProps = {
	entry: TranscriptEntry;
};

const MessageRow = memo(({ entry }: MessageRowProps) => {
	if (entry.role === 'user') {
		return <UserMessage content={entry.content} />;
	}

	if (entry.role === 'error') {
		return (
			<Box paddingLeft={2}>
				<Text color="red">{entry.content}</Text>
			</Box>
		);
	}

	return <AssistantMessage content={entry.content} />;
});

MessageRow.displayName = 'MessageRow';

const UserMessage = memo(({ content }: { content: string }) => {
	return (
		<Box backgroundColor={USER_BACKGROUND} paddingX={2} paddingY={1}>
			<Text color="white">&gt; {content}</Text>
		</Box>
	);
});

UserMessage.displayName = 'UserMessage';

const AssistantMessage = memo(({ content }: { content: string }) => {
	return (
		<Box paddingLeft={2}>
			<Markdown maxWidth={100} showLinkUrls codeWrap="wrap">
				{content}
			</Markdown>
		</Box>
	);
});

AssistantMessage.displayName = 'AssistantMessage';
