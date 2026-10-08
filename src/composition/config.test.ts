import { describe, expect, test } from 'bun:test';

import { readConfig } from './config';

describe('readConfig', () => {
	test('keeps the default system guidance compact and provider-independent', () => {
		const prompt = readConfig({}).SYSTEM_PROMPT;
		expect(prompt).toContain('workspace-relative');
		expect(prompt.length).toBeLessThanOrEqual(400);
		expect(prompt).not.toMatch(/ollama|gemma|llama/i);
	});

	test('uses defaults when env values are missing', () => {
		expect(readConfig({})).toEqual({
			OLLAMA_BASE_URL: 'http://localhost:11434',
			OLLAMA_MODEL: 'gemma4:12b-it-qat',
			OLLAMA_KEEP_ALIVE: '0',
			SYSTEM_PROMPT: 'Use workspace-relative paths.',
			MAX_CONTEXT_CHARACTERS: 120_000,
		});
	});

	for (const blank of ['', ' \t\n ']) {
		test(`uses the same defaults when every env value is blank: ${JSON.stringify(blank)}`, () => {
			expect(
				readConfig({
					OLLAMA_BASE_URL: blank,
					OLLAMA_MODEL: blank,
					OLLAMA_KEEP_ALIVE: blank,
					SYSTEM_PROMPT: blank,
					MAX_CONTEXT_CHARACTERS: blank,
				}),
			).toEqual(readConfig({}));
		});
	}

	test('explicit env values override every production default', () => {
		expect(
			readConfig({
				OLLAMA_BASE_URL: ' http://127.0.0.1:22123/ ',
				OLLAMA_MODEL: ' fixture-model ',
				OLLAMA_KEEP_ALIVE: ' -1 ',
				SYSTEM_PROMPT: ' fixture prompt ',
				MAX_CONTEXT_CHARACTERS: ' 240 ',
			}),
		).toEqual({
			OLLAMA_BASE_URL: 'http://127.0.0.1:22123/',
			OLLAMA_MODEL: 'fixture-model',
			OLLAMA_KEEP_ALIVE: '-1',
			SYSTEM_PROMPT: 'fixture prompt',
			MAX_CONTEXT_CHARACTERS: 240,
		});
	});

	test('trims values and treats empty strings as missing', () => {
		expect(
			readConfig({
				OLLAMA_BASE_URL: '  http://localhost:11435  ',
				OLLAMA_MODEL: '  ',
				OLLAMA_KEEP_ALIVE: '  2m  ',
				SYSTEM_PROMPT: '  Custom prompt  ',
				MAX_CONTEXT_CHARACTERS: ' 64000 ',
			}),
		).toEqual({
			OLLAMA_BASE_URL: 'http://localhost:11435',
			OLLAMA_MODEL: 'gemma4:12b-it-qat',
			OLLAMA_KEEP_ALIVE: '2m',
			SYSTEM_PROMPT: 'Custom prompt',
			MAX_CONTEXT_CHARACTERS: 64_000,
		});
	});

	test('throws a readable error for invalid config', () => {
		expect(() =>
			readConfig({
				OLLAMA_BASE_URL: 'not-a-url',
			}),
		).toThrow('Invalid configuration');
		expect(() => readConfig({ MAX_CONTEXT_CHARACTERS: '0' })).toThrow('Invalid configuration');
	});
});
