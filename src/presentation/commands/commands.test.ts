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
		expect(parseCommand('/changes')).toEqual({ type: 'workspace-changes' });
		expect(parseCommand('/copy')).toEqual({ type: 'invalid', message: 'Unknown command: /copy' });
		expect(parseCommand('/changes extra')).toEqual({
			type: 'invalid',
			message: '/changes does not accept arguments.',
		});
		expect(parseCommand('normal prompt')).toBeNull();
	});

	test('reports unknown commands and filters menu metadata', () => {
		expect(parseCommand('/missing')).toEqual({
			type: 'invalid',
			message: 'Unknown command: /missing',
		});
		expect(getCommandSuggestions('/')).toHaveLength(3);
		expect(getCommandSuggestions('/co')).toEqual([]);
		expect(getCommandSuggestions('/cha').map((command) => command.name)).toEqual(['/changes']);
		expect(getCommandSuggestions('/mo').map((command) => command.name)).toEqual(['/model']);
		expect(getCommandSuggestions('/nothing')).toEqual([]);
	});
});
