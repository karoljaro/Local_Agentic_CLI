import { SYNTHETIC_MODEL } from '@/test-support/modelFixtures';
import { describe, expect, test } from 'bun:test';

import { getCommandSuggestions, parseCommand } from './commands';

describe('commands', () => {
	test('parses screen and direct-model commands from one registry', () => {
		expect(parseCommand('/model')).toEqual({ type: 'select-model' });
		expect(parseCommand(`/model ${SYNTHETIC_MODEL}`)).toEqual({
			type: 'switch-model',
			modelName: SYNTHETIC_MODEL,
		});
		expect(parseCommand('/resume')).toEqual({ type: 'resume-session' });
		expect(parseCommand('normal prompt')).toBeNull();
	});

	test('reports unknown commands and filters menu metadata', () => {
		expect(parseCommand('/missing')).toEqual({
			type: 'invalid',
			message: 'Unknown command: /missing',
		});
		expect(getCommandSuggestions('/')).toHaveLength(2);
		expect(getCommandSuggestions('/mo').map((command) => command.name)).toEqual(['/model']);
		expect(getCommandSuggestions('/nothing')).toEqual([]);
	});
});
