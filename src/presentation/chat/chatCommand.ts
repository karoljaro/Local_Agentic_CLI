const MODEL_COMMAND = '/model';
const RESUME_COMMAND = '/resume';

export type ChatCommand =
	| {
			type: 'show-model';
	  }
	| {
			type: 'switch-model';
			modelName: string;
	  }
	| {
			type: 'resume';
	  };

export const parseChatCommand = (prompt: string): ChatCommand | null => {
	const trimmedPrompt = prompt.trim();

	if (trimmedPrompt === RESUME_COMMAND) {
		return { type: 'resume' };
	}

	if (trimmedPrompt === MODEL_COMMAND) {
		return { type: 'show-model' };
	}

	if (!trimmedPrompt.startsWith(`${MODEL_COMMAND} `)) {
		return null;
	}

	const modelName = trimmedPrompt.slice(MODEL_COMMAND.length).trim();

	return modelName.length === 0 ? { type: 'show-model' } : { type: 'switch-model', modelName };
};
