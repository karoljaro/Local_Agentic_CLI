import { Box, Text } from 'ink';

import { SelectionScreen } from '../components/SelectionScreen';
import { compactSessionId } from '../formatters/workspace';
import type { SessionOption, SessionSelectionState } from '../types';

export type ResumeChoice = { type: 'new' } | { type: 'existing'; session: SessionOption };

type ResumeScreenProps = {
	canCancel: boolean;
	currentSessionId: string;
	onCancel: () => void;
	onSelect: (choice: ResumeChoice) => void;
	selection: SessionSelectionState;
};

export const ResumeScreen = ({
	canCancel,
	currentSessionId,
	onCancel,
	onSelect,
	selection,
}: ResumeScreenProps) => {
	const choices: ResumeChoice[] = [
		{ type: 'new' },
		...selection.items.map((session) => ({ type: 'existing' as const, session })),
	];

	return (
		<Box flexDirection="column">
			<SelectionScreen
				canCancel={canCancel}
				emptyMessage="No sessions available."
				error={selection.error}
				getKey={(choice) =>
					choice.type === 'new' ? 'new-session' : String(choice.session.sessionId)
				}
				getSearchText={(choice) =>
					choice.type === 'new'
						? 'new chat session'
						: `${choice.session.sessionId} ${choice.session.preview ?? ''}`
				}
				items={choices}
				onCancel={onCancel}
				onSelect={onSelect}
				renderItem={(choice, selected) => {
					if (choice.type === 'new') {
						return (
							<Text bold={selected} color={selected ? 'cyan' : 'white'}>
								{selected ? '›' : ' '} New chat
							</Text>
						);
					}
					const session = choice.session;
					return (
						<>
							<Text bold={selected} color={selected ? 'cyan' : 'white'}>
								{selected ? '›' : ' '} {compactSessionId(String(session.sessionId))}
							</Text>
							{String(session.sessionId) === currentSessionId ? (
								<Text color="green"> · current</Text>
							) : null}
							{session.lastActiveAt === undefined ? null : (
								<Text color="gray"> · {formatTimestamp(session.lastActiveAt)}</Text>
							)}
							{session.preview === undefined ? null : (
								<Text color="gray"> · {truncate(session.preview, 64)}</Text>
							)}
						</>
					);
				}}
				status={selection.status}
				title="Resume session"
			/>
			{selection.status === 'idle' && selection.items.length === 0 ? (
				<Text color="gray"> No saved sessions yet.</Text>
			) : null}
		</Box>
	);
};

const formatTimestamp = (timestamp: string): string => {
	return timestamp.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
};

const truncate = (value: string, maxLength: number): string => {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
};
