import { useEffect, useMemo, useState } from 'react';
import { useInput } from 'ink';

import type { StoredSession } from '@/application/ports/SessionStorePort';
import type { Runtime } from '@/composition/createRuntime';
import type { SessionId } from '@/domain/Ids';
import type { SessionPickerOption, UiStatus } from '@/presentation/chat/types';

type UseSessionPickerInput = {
	onSelectSession: (sessionId: SessionId) => void;
	runtime: Runtime;
};

export const useSessionPicker = ({ onSelectSession, runtime }: UseSessionPickerInput) => {
	const [sessions, setSessions] = useState<StoredSession[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [status, setStatus] = useState<UiStatus>('loading');
	const [errorMessage, setErrorMessage] = useState<string | undefined>();

	const options = useMemo<SessionPickerOption[]>(() => {
		return [
			{ type: 'new' },
			...sessions.map((session) => ({
				type: 'existing' as const,
				sessionId: session.sessionId,
			})),
		];
	}, [sessions]);

	useEffect(() => {
		let isCancelled = false;

		const loadSessions = async (): Promise<void> => {
			setStatus('loading');
			setErrorMessage(undefined);

			try {
				const result = await runtime.listSessions.list();

				if (!isCancelled) {
					setSessions(result.sessions);
				}
			} catch (caughtError) {
				const error = caughtError instanceof Error ? caughtError : new Error(String(caughtError));

				if (!isCancelled) {
					setSessions([]);
					setErrorMessage(error.message);
				}
			} finally {
				if (!isCancelled) {
					setStatus('idle');
				}
			}
		};

		void loadSessions();

		return () => {
			isCancelled = true;
		};
	}, [runtime]);

	useEffect(() => {
		setSelectedIndex((currentIndex) => Math.min(currentIndex, Math.max(0, options.length - 1)));
	}, [options.length]);

	useInput(
		(_value, key) => {
			if (key.upArrow) {
				setSelectedIndex((currentIndex) => Math.max(0, currentIndex - 1));
				return;
			}

			if (key.downArrow) {
				setSelectedIndex((currentIndex) => Math.min(options.length - 1, currentIndex + 1));
				return;
			}

			if (key.return) {
				const selectedOption = options[selectedIndex];

				if (selectedOption === undefined) {
					return;
				}

				if (selectedOption.type === 'new') {
					onSelectSession(runtime.idGenerator.nextSessionId());
					return;
				}

				onSelectSession(selectedOption.sessionId);
			}
		},
		{ isActive: status === 'idle' },
	);

	return {
		errorMessage,
		options,
		selectedIndex,
		status,
	};
};
