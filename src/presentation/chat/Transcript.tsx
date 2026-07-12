import { memo, useMemo } from 'react';
import { Box, Static, Text } from 'ink';

import type { SessionId } from '@/domain/Ids';
import { compactSessionId } from '../formatters/workspace';
import type { HistoryEntry } from '../types';
import { Markdown } from '../components/Markdown';

type TranscriptProps = {
	sessionId: SessionId;
	history: HistoryEntry[];
};

type StaticTranscriptItem =
	| { type: 'header'; id: string; sessionId: SessionId }
	| { type: 'entry'; id: string; entry: HistoryEntry };

export const Transcript = memo(({ sessionId, history }: TranscriptProps) => {
	const items = useMemo<StaticTranscriptItem[]>(
		() => [
			{ type: 'header', id: `header:${sessionId}`, sessionId },
			...history.map((entry) => ({ type: 'entry' as const, id: entry.id, entry })),
		],
		[history, sessionId],
	);

	return (
		<Static items={items}>
			{(item) =>
				item.type === 'header' ? (
					<SessionHeader key={item.id} sessionId={item.sessionId} />
				) : (
					<Message key={item.id} entry={item.entry} />
				)
			}
		</Static>
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
