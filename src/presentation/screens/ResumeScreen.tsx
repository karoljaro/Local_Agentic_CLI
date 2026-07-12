import { Text } from 'ink';

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
		<SelectionScreen
			canCancel={canCancel}
			emptyMessage="No sessions available."
			error={selection.error}
			estimatedItemHeight={2}
			filterPlaceholder="Filter sessions…"
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
					return <Text bold> New chat</Text>;
				}
				const session = choice.session;
				const metadata = [
					session.lastActiveAt === undefined ? undefined : formatTimestamp(session.lastActiveAt),
					session.preview === undefined ? undefined : truncate(session.preview, 64),
				].filter((value): value is string => value !== undefined);
				return (
					<>
						<Text bold>{` ${compactSessionId(String(session.sessionId))}`}</Text>
						{String(session.sessionId) === currentSessionId ? (
							<Text {...(selected ? { dimColor: true } : { color: 'green' })}> · current</Text>
						) : null}
						{metadata.length === 0 ? null : (
							<Text {...(selected ? { dimColor: true } : { color: 'gray' })}>
								{`\n    ${metadata.join(' · ')}`}
							</Text>
						)}
					</>
				);
			}}
			secondaryMessage={
				selection.status === 'idle' && selection.items.length === 0
					? 'No saved sessions yet'
					: undefined
			}
			status={selection.status}
			title="Resume session"
		/>
	);
};

const formatTimestamp = (timestamp: string): string => {
	return timestamp.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
};

const truncate = (value: string, maxLength: number): string => {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
};
