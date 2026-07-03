const MODEL_COMMAND = '/model';

export type ModelCommand =
	| {
			type: 'show';
	  }
	| {
			type: 'switch';
			modelName: string;
	  };

export const parseModelCommand = (prompt: string): ModelCommand | null => {
	const trimmedPrompt = prompt.trim();

	if (trimmedPrompt === MODEL_COMMAND) {
		return { type: 'show' };
	}

	if (!trimmedPrompt.startsWith(`${MODEL_COMMAND} `)) {
		return null;
	}

	const modelName = trimmedPrompt.slice(MODEL_COMMAND.length).trim();

	return modelName.length === 0 ? { type: 'show' } : { type: 'switch', modelName };
};
