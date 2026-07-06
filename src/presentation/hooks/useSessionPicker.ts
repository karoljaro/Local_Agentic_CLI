import { useEffect, useMemo, useState } from 'react';

import type { StoredSession } from '@/application/ports/SessionStorePort';
import type { Runtime } from '@/composition/createRuntime';
import type { SessionId } from '@/domain/Ids';
import type { SessionPickerOption, UiStatus } from '@/presentation/chat/types';
import { useSelectableList } from './useSelectableList';

type UseSessionPickerInput = {
	onCancel?: (() => void) | undefined;
	onSelectSession: (sessionId: SessionId) => void;
	runtime: Runtime;
};

export const useSessionPicker = ({ onCancel, onSelectSession, runtime }: UseSessionPickerInput) => {
	const [sessions, setSessions] = useState<StoredSession[]>([]);
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

	const list = useSelectableList({
		isActive: true,
		items: options,
		onCancel,
		onSelect: (selectedOption) => {
			if (selectedOption.type === 'new') {
				onSelectSession(runtime.idGenerator.nextSessionId());
				return;
			}

			onSelectSession(selectedOption.sessionId);
		},
	});

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

	return {
		errorMessage,
		options,
		selectedIndex: list.selectedIndex,
		status,
	};
};
