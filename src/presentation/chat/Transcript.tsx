import { memo } from 'react';
import { Box, Text } from 'ink';

import type { SessionId } from '@/domain/Ids';
import { compactSessionId } from '../formatters/workspace';
import type { HistoryEntry } from '../types';
import { Markdown } from '../components/Markdown';

type TranscriptProps = {
	sessionId: SessionId;
	history: HistoryEntry[];
};

export const Transcript = memo(({ sessionId, history }: TranscriptProps) => {
	return (
		<Box flexDirection="column">
			<SessionHeader sessionId={sessionId} />
			{history.map((entry) => (
				<Message entry={entry} key={entry.id} />
			))}
		</Box>
	);
});

Transcript.displayName = 'Transcript';

const SessionHeader = memo(({ sessionId }: { sessionId: SessionId }) => (
	<Box marginBottom={1}>
		<Text bold>codesh</Text>
		<Text color="gray"> · session {compactSessionId(String(sessionId))}</Text>
	</Box>
));

SessionHeader.displayName = 'SessionHeader';

const Message = memo(({ entry }: { entry: HistoryEntry }) => {
	const appearance = getAppearance(entry);
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold color={appearance.color}>
				{appearance.marker} {appearance.label}
			</Text>
			<Box paddingLeft={2} flexDirection="column">
				{entry.kind === 'assistant' ? (
					<Markdown>{entry.content}</Markdown>
				) : (
					<Text
						{...(appearance.bodyColor === undefined ? {} : { color: appearance.bodyColor })}
						wrap="wrap"
					>
						{entry.content}
					</Text>
				)}
			</Box>
		</Box>
	);
});

Message.displayName = 'Message';

type Appearance = {
	marker: string;
	label: string;
	color: 'cyan' | 'green' | 'gray' | 'yellow' | 'red';
	bodyColor?: 'gray' | 'red';
};

const getAppearance = (entry: HistoryEntry): Appearance => {
	switch (entry.kind) {
		case 'user':
			return { marker: '›', label: 'You', color: 'cyan' };
		case 'assistant':
			return { marker: '◆', label: 'Assistant', color: 'green' };
		case 'system':
			return { marker: '•', label: 'System', color: 'gray', bodyColor: 'gray' };
		case 'tool':
			return entry.status === 'failure'
				? { marker: '×', label: `Tool · ${entry.label ?? 'operation'}`, color: 'red' }
				: { marker: '✓', label: `Tool · ${entry.label ?? 'operation'}`, color: 'yellow' };
		case 'error':
			return { marker: '!', label: 'Error', color: 'red', bodyColor: 'red' };
		case 'cancelled':
			return { marker: '×', label: 'Cancelled', color: 'yellow', bodyColor: 'gray' };
	}
};
