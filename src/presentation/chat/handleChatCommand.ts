import type { UiStatus, TranscriptEntry } from './types';
import type { ChatCommand } from './chatCommand';

type HandleChatCommandInput = {
	appendTranscriptEntry: (prefix: string, role: TranscriptEntry['role'], content: string) => void;
	command: ChatCommand;
	onModelNameChange: (modelName: string) => void;
	onOpenModels: () => void;
	onResume: () => void;
	releaseChatView: () => void;
	setStatus: (status: UiStatus) => void;
	switchModel: (modelName: string) => string;
	unloadCurrentModel: () => Promise<boolean>;
};

export const handleChatCommand = async ({
	appendTranscriptEntry,
	command,
	onModelNameChange,
	onOpenModels,
	onResume,
	releaseChatView,
	setStatus,
	switchModel,
	unloadCurrentModel,
}: HandleChatCommandInput): Promise<void> => {
	if (command.type === 'resume') {
		releaseChatView();
		onResume();
		return;
	}

	if (command.type === 'open-models') {
		const wasUnloaded = await unloadCurrentModel();

		if (!wasUnloaded) {
			return;
		}

		releaseChatView();
		onOpenModels();
		return;
	}

	const wasUnloaded = await unloadCurrentModel();

	if (!wasUnloaded) {
		return;
	}

	try {
		const nextModelName = switchModel(command.modelName);

		onModelNameChange(nextModelName);
		appendTranscriptEntry('system', 'assistant', `Model switched to ${nextModelName}.`);
	} catch (caughtError) {
		appendTranscriptEntry('command-error', 'error', toError(caughtError).message);
	} finally {
		setStatus('idle');
	}
};

const toError = (caughtError: unknown): Error => {
	return caughtError instanceof Error ? caughtError : new Error(String(caughtError));
};
