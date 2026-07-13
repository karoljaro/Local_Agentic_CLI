import { useEffect, useState, useSyncExternalStore } from 'react';
import { Box, Text } from 'ink';

import type { StreamBuffer } from '../state/StreamBuffer';
import type { ActiveTool, TurnStatus } from '../types';
import { Markdown } from '../components/Markdown';

type LiveTurnProps = {
	activeTools: ActiveTool[];
	status: TurnStatus;
	stream: StreamBuffer;
};

export const LiveTurn = ({ activeTools, status, stream }: LiveTurnProps) => {
	const content = useSyncExternalStore(stream.subscribe, stream.getSnapshot, stream.getSnapshot);

	return (
		<Box flexDirection="column">
			{activeTools.map((tool) => (
				<Box key={String(tool.id)}>
					<Text color="yellow">{tool.status === 'approval' ? '?' : '◇'} Tool </Text>
					<Text color="gray">
						{tool.description} · {formatToolStatus(tool.status)}
					</Text>
				</Box>
			))}

			{status === 'waiting' ? <WaitingIndicator /> : null}
			{status === 'streaming' && content.length > 0 ? (
				<Box flexDirection="column">
					<Text bold color="green">
						◆ Assistant · streaming
					</Text>
					<Box paddingLeft={2} flexDirection="column">
						<Markdown>{`${content}▌`}</Markdown>
					</Box>
				</Box>
			) : null}
		</Box>
	);
};

const WaitingIndicator = () => {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setFrame((current) => (current + 1) % 4), 140);
		return () => clearInterval(timer);
	}, []);

	return (
		<Box>
			<Text color="yellow">{'◌◔◑◕'[frame] ?? '◌'}</Text>
			<Text color="gray"> Waiting for response…</Text>
		</Box>
	);
};

const formatToolStatus = (status: ActiveTool['status']): string => {
	switch (status) {
		case 'queued':
			return 'queued';
		case 'approval':
			return 'waiting for approval';
		case 'running':
			return 'running';
	}
};
