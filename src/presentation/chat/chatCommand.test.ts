import { describe, expect, test } from 'bun:test';

import { parseChatCommand } from './chatCommand';

describe('parseChatCommand', () => {
	test('parses model commands', () => {
		expect(parseChatCommand('/model')).toEqual({ type: 'show-model' });
		expect(parseChatCommand('/model llama3.2')).toEqual({
			type: 'switch-model',
			modelName: 'llama3.2',
		});
	});

	test('parses resume command', () => {
		expect(parseChatCommand('/resume')).toEqual({ type: 'resume' });
	});

	test('ignores normal prompts', () => {
		expect(parseChatCommand('tell me about /resume')).toBeNull();
	});
});
