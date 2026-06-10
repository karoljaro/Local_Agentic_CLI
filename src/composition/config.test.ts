import { describe, expect, test } from 'bun:test';

import { readConfig } from './config';

describe('readConfig', () => {
	test('uses defaults when env values are missing', () => {
		expect(readConfig({})).toEqual({
			OLLAMA_BASE_URL: 'http://localhost:11434',
			OLLAMA_MODEL: 'gemma4:12b-it-qat',
			SYSTEM_PROMPT: 'You are a local coding agent.',
		});
	});

	test('trims values and treats empty strings as missing', () => {
		expect(
			readConfig({
				OLLAMA_BASE_URL: '  http://localhost:11435  ',
				OLLAMA_MODEL: '  ',
				SYSTEM_PROMPT: '  Custom prompt  ',
			}),
		).toEqual({
			OLLAMA_BASE_URL: 'http://localhost:11435',
			OLLAMA_MODEL: 'gemma4:12b-it-qat',
			SYSTEM_PROMPT: 'Custom prompt',
		});
	});

	test('throws a readable error for invalid config', () => {
		expect(() =>
			readConfig({
				OLLAMA_BASE_URL: 'not-a-url',
			}),
		).toThrow('Invalid configuration');
	});
});
