export type CommandDefinition = {
	name: '/model' | '/resume';
	usage: string;
	description: string;
	action: 'select-model' | 'resume-session';
	acceptsArgument: boolean;
};

export const COMMANDS: readonly CommandDefinition[] = [
	{
		name: '/model',
		usage: '/model [name]',
		description: 'Choose a local model',
		action: 'select-model',
		acceptsArgument: true,
	},
	{
		name: '/resume',
		usage: '/resume',
		description: 'Resume or start a session',
		action: 'resume-session',
		acceptsArgument: false,
	},
];

export type ParsedCommand =
	| { type: 'select-model' }
	| { type: 'switch-model'; modelName: string }
	| { type: 'resume-session' }
	| { type: 'invalid'; message: string };

export const parseCommand = (input: string): ParsedCommand | null => {
	const trimmed = input.trim();
	if (!trimmed.startsWith('/')) {
		return null;
	}

	const separatorIndex = trimmed.search(/\s/);
	const name = separatorIndex < 0 ? trimmed : trimmed.slice(0, separatorIndex);
	const argument = separatorIndex < 0 ? '' : trimmed.slice(separatorIndex).trim();
	const definition = COMMANDS.find((command) => command.name === name);
	if (definition === undefined) {
		return { type: 'invalid', message: `Unknown command: ${name}` };
	}

	if (!definition.acceptsArgument && argument.length > 0) {
		return { type: 'invalid', message: `${definition.name} does not accept arguments.` };
	}

	if (definition.action === 'resume-session') {
		return { type: 'resume-session' };
	}

	return argument.length === 0
		? { type: 'select-model' }
		: { type: 'switch-model', modelName: argument };
};

export const getCommandSuggestions = (input: string): CommandDefinition[] => {
	if (!input.startsWith('/') || /\s/.test(input)) {
		return [];
	}

	const query = input.toLowerCase();
	return COMMANDS.filter((command) => {
		return (
			command.name.startsWith(query) || command.description.toLowerCase().includes(query.slice(1))
		);
	});
};

export const isCommandMenuInput = (input: string): boolean => {
	return input.startsWith('/') && !/\s/.test(input);
};
